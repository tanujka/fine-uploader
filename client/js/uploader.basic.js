qq.FineUploaderBasic = function(o){
    var that = this;
    this._options = {
        debug: false,
        button: null,
        multiple: true,
        maxConnections: 3,
        disableCancelForFormUploads: false,
        autoUpload: true,
        request: {
            endpoint: '/server/upload',
            params: {},
            customHeaders: {},
            forceMultipart: false,
            inputName: 'qqfile'
        },
        validation: {
            allowedExtensions: [],
            acceptFiles: null,		// comma separated string of mime-types for browser to display in browse dialog
            sizeLimit: 0,
            minSizeLimit: 0,
            stopOnFirstInvalidFile: true
        },
        callbacks: {
            // return false to cancel submit
            onSubmit: function(id, fileName){},
            onComplete: function(id, fileName, responseJSON){},
            onCancel: function(id, fileName){},
            onUpload: function(id, fileName, xhr){},
            onProgress: function(id, fileName, loaded, total){},
            onError: function(id, fileName, reason) {},
            onAutoRetry: function(id, fileName, attemptNumber) {}
        },
        // messages
        messages: {
            typeError: "{file} has an invalid extension. Valid extension(s): {extensions}.",
            sizeError: "{file} is too large, maximum file size is {sizeLimit}.",
            minSizeError: "{file} is too small, minimum file size is {minSizeLimit}.",
            emptyError: "{file} is empty, please select files again without it.",
            noFilesError: "No files to upload.",
            onLeave: "The files are being uploaded, if you leave now the upload will be cancelled."
        },
        showMessage: function(message){
            alert(message);
        },
        retry: {
            enableAuto: false,
            maxAutoAttempts: 3,
            delay: 5
        }
    };

    qq.extend(this._options, o, true);
    this._wrapCallbacks();
    qq.extend(this, qq.DisposeSupport);

    // number of files being uploaded
    this._filesInProgress = 0;

    this._storedFileIds = [];

    this._autoRetries = [];
    this._retryTimeouts = [];

    this._handler = this._createUploadHandler();

    if (this._options.button){
        this._button = this._createUploadButton(this._options.button);
    }

    this._preventLeaveInProgress();
};

qq.FineUploaderBasic.prototype = {
    log: function(str){
        if (this._options.debug && window.console) console.log('[uploader] ' + str);
    },
    setParams: function(params){
        this._options.request.params = params;
    },
    getInProgress: function(){
        return this._filesInProgress;
    },
    uploadStoredFiles: function(){
        "use strict";
        while(this._storedFileIds.length) {
            this._filesInProgress++;
            this._handler.upload(this._storedFileIds.shift(), this._options.request.params);
        }
    },
    clearStoredFiles: function(){
        this._storedFileIds = [];
    },
    retry: function(id) {
        if (this._onBeforeManualRetry(id)) {
            this._handler.retry(id);
            return true;
        }
        else {
            return false;
        }
    },
    _createUploadButton: function(element){
        var self = this;

        var button = new qq.UploadButton({
            element: element,
            multiple: this._options.multiple && qq.UploadHandlerXhr.isSupported(),
            acceptFiles: this._options.validation.acceptFiles,
            onChange: function(input){
                self._onInputChange(input);
            }
        });

        this.addDisposer(function() { button.dispose(); });
        return button;
    },
    _createUploadHandler: function(){
        var self = this,
            handlerClass;

        if(qq.UploadHandlerXhr.isSupported()){
            handlerClass = 'UploadHandlerXhr';
        } else {
            handlerClass = 'UploadHandlerForm';
        }

        var handler = new qq[handlerClass]({
            debug: this._options.debug,
            endpoint: this._options.request.endpoint,
            forceMultipart: this._options.request.forceMultipart,
            maxConnections: this._options.maxConnections,
            customHeaders: this._options.request.customHeaders,
            inputName: this._options.request.inputName,
            demoMode: this._options.demoMode,
            onProgress: function(id, fileName, loaded, total){
                self._onProgress(id, fileName, loaded, total);
                self._options.callbacks.onProgress(id, fileName, loaded, total);
            },
            onComplete: function(id, fileName, result, xhr){
                self._onComplete(id, fileName, result, xhr);
                self._options.callbacks.onComplete(id, fileName, result);
            },
            onCancel: function(id, fileName){
                self._onCancel(id, fileName);
                self._options.callbacks.onCancel(id, fileName);
            },
            onUpload: function(id, fileName, xhr){
                self._onUpload(id, fileName, xhr);
                self._options.callbacks.onUpload(id, fileName, xhr);
            },
            onAutoRetry: function(id, fileName, responseJSON, xhr) {
                if (self._shouldAutoRetry(id, fileName, responseJSON)) {
                    self._maybeParseAndSendUploadError(id, fileName, responseJSON, xhr);
                    self._options.callbacks.onAutoRetry(id, fileName, self._autoRetries[id] + 1);
                    self._onBeforeAutoRetry(id, fileName);

                    self._retryTimeouts[id] = setTimeout(function() {
                        self._onAutoRetry(id, fileName, responseJSON)
                    }, self._options.retry.delay * 1000);

                    return true;
                }
                else {
                    return false;
                }
            }
        });

        return handler;
    },
    _preventLeaveInProgress: function(){
        var self = this;

        this._attach(window, 'beforeunload', function(e){
            if (!self._filesInProgress){return;}

            var e = e || window.event;
            // for ie, ff
            e.returnValue = self._options.messages.onLeave;
            // for webkit
            return self._options.messages.onLeave;
        });
    },
    _onSubmit: function(id, fileName){
        if (this._options.autoUpload) {
            this._filesInProgress++;
        }
    },
    _onProgress: function(id, fileName, loaded, total){
    },
    _onComplete: function(id, fileName, result, xhr){
        this._filesInProgress--;
        this._maybeParseAndSendUploadError(id, fileName, result, xhr);
    },
    _onCancel: function(id, fileName){
        clearTimeout(this._retryTimeouts[id]);

        var storedFileIndex = qq.indexOf(this._storedFileIds, id);
        if (this._options.autoUpload || storedFileIndex < 0) {
            this._filesInProgress--;
        }
        else if (!this._options.autoUpload) {
            this._storedFileIds.splice(storedFileIndex, 1);
        }
    },
    _onUpload: function(id, fileName, xhr){
    },
    _onInputChange: function(input){
        if (this._handler instanceof qq.UploadHandlerXhr){
            this._uploadFileList(input.files);
        } else {
            if (this._validateFile(input)){
                this._uploadFile(input);
            }
        }
        this._button.reset();
    },
    _onBeforeAutoRetry: function(id, fileName) {
        this.log("Waiting " + this._options.retry.delay + " seconds before retrying " + fileName + "...");
    },
    _onAutoRetry: function(id, fileName, responseJSON) {
        this.log("Retrying " + fileName + "...");
        this._autoRetries[id]++;
        this._handler.retry(id);
    },
    _shouldAutoRetry: function(id, fileName, responseJSON) {
        if (this._options.retry.enableAuto) {
            if (this._autoRetries[id] === undefined) {
                this._autoRetries[id] = 0;
            }

            return this._autoRetries[id] < this._options.retry.maxAutoAttempts
        }

        return false;
    },
    //return false if we should not attempt the requested retry
    _onBeforeManualRetry: function(id) {
        if (this._handler.isValid(id)) {
            var fileName = this._handler.getName(id);
            this.log("Retrying upload for '" + fileName + "' (id: " + id + ")...");
            this._filesInProgress++;
            return true;
        }
        else {
            this.log("'" + id + "' is not a valid file ID");
            return false;
        }
    },
    _maybeParseAndSendUploadError: function(id, fileName, response, xhr) {
        //assuming no one will actually set the response code to something other than 200 and still set 'success' to true
        if (!response.success){
            if (xhr && xhr.status !== 200 && !response.error) {
                this._options.callbacks.onError(id, fileName, "XHR returned response code " + xhr.status);
            }
            else {
                var errorReason = response.error ? response.error : "Upload failure reason unknown";
                this._options.callbacks.onError(id, fileName, errorReason);
            }
        }
    },
    _uploadFileList: function(files){
        if (files.length > 0) {
            for (var i=0; i<files.length; i++){
                if (this._validateFile(files[i])){
                    this._uploadFile(files[i]);
                } else {
                    if (this._options.validation.stopOnFirstInvalidFile){
                        return;
                    }
                }
            }
        }
        else {
            this._error('noFilesError', "");
        }
    },
    _uploadFile: function(fileContainer){
        var id = this._handler.add(fileContainer);
        var fileName = this._handler.getName(id);

        if (this._options.callbacks.onSubmit(id, fileName) !== false){
            this._onSubmit(id, fileName);
            if (this._options.autoUpload) {
                this._handler.upload(id, this._options.request.params);
            }
            else {
                this._storeFileForLater(id);
            }
        }
    },
    _storeFileForLater: function(id) {
        this._storedFileIds.push(id);
    },
    _validateFile: function(file){
        var name, size;

        if (file.value){
            // it is a file input
            // get input value and remove path to normalize
            name = file.value.replace(/.*(\/|\\)/, "");
        } else {
            // fix missing properties in Safari 4 and firefox 11.0a2
            name = (file.fileName !== null && file.fileName !== undefined) ? file.fileName : file.name;
            size = (file.fileSize !== null && file.fileSize !== undefined) ? file.fileSize : file.size;
        }

        if (! this._isAllowedExtension(name)){
            this._error('typeError', name);
            return false;

        } else if (size === 0){
            this._error('emptyError', name);
            return false;

        } else if (size && this._options.validation.sizeLimit && size > this._options.validation.sizeLimit){
            this._error('sizeError', name);
            return false;

        } else if (size && size < this._options.validation.minSizeLimit){
            this._error('minSizeError', name);
            return false;
        }

        return true;
    },
    _error: function(code, fileName){
        var message = this._options.messages[code];
        function r(name, replacement){ message = message.replace(name, replacement); }

        var extensions = this._options.validation.allowedExtensions.join(', ');

        r('{file}', this._formatFileName(fileName));
        r('{extensions}', extensions);
        r('{sizeLimit}', this._formatSize(this._options.validation.sizeLimit));
        r('{minSizeLimit}', this._formatSize(this._options.validation.minSizeLimit));

        this._options.callbacks.onError(null, fileName, message);
        this._options.showMessage(message);
    },
    _formatFileName: function(name){
        if (name.length > 33){
            name = name.slice(0, 19) + '...' + name.slice(-13);
        }
        return name;
    },
    _isAllowedExtension: function(fileName){
        var ext = (-1 !== fileName.indexOf('.'))
            ? fileName.replace(/.*[.]/, '').toLowerCase()
            : '';
        var allowed = this._options.validation.allowedExtensions;

        if (!allowed.length){return true;}

        for (var i=0; i<allowed.length; i++){
            if (allowed[i].toLowerCase() == ext){ return true;}
        }

        return false;
    },
    _formatSize: function(bytes){
        var i = -1;
        do {
            bytes = bytes / 1024;
            i++;
        } while (bytes > 99);

        return Math.max(bytes, 0.1).toFixed(1) + ['kB', 'MB', 'GB', 'TB', 'PB', 'EB'][i];
    },
    _wrapCallbacks: function() {
        var self, safeCallback;

        self = this;

        safeCallback = function(callback, args) {
            try {
                return callback.apply(self, args);
            }
            catch (exception) {
                self.log("Caught " + exception + " in callback: " + callback);
            }
        }

        for (var prop in this._options) {
            if (/^on[A-Z]/.test(prop)) {
                (function() {
                    var oldCallback = self._options[prop];
                    self._options[prop] = function() {
                        return safeCallback(oldCallback, arguments);
                    }
                }());
            }
        }
    }
};
