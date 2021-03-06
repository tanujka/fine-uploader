## Feature Detection Module ##

Fine Uploader, since version 3.5, provides a set of flags that can be used to determine which features are supported in
the current browser.  These flags are set during initialization of the uploader.

<br/>
Reading the feature flags in the feature detection module is easy.  Each flag has a boolean value.  Simply call
`qq.supportedFeatures.{featureFlagName}` and examine the return value.  For example, if you'd like to check if the current
user agent supports dropping folders, call `qq.supportedFeatures.folderDrop`.

<br/>
### The following feature flags are available: ###
* `uploading`: Is uploading of any sort supported?
Note, this will also return true for browsers that are not explicitly supported by Fine Uploader, such as IE6.
* `ajaxUploading`: Does this this user agent support uploads via XHR2?  Also an indicator of File API support.
* `fileDrop`: Can you upload files by dropping them into the uploader?
* `folderDrop`: Can you upload the contents of a folder by dropping it into the uploader?
* `chunking`: Can files or `Blob`s be split into chunks client-side and sent in separate requests?
* `resume`: Is the auto-resume feature supported?
* `uploadCustomHeaders`: Can you supply custom headers to be sent along with the upload request?
* `uploadNonMultipart`: Are non-multipart-encoded requests supported for uploads?
* `itemSizeValidation`: Is client-side file or `Blob` item validation supported?
* `uploadViaPaste`: Can you upload images by pasting them into the uploader?
* `progressBar`: Can upload progress be reported client-side?
* `uploadCors`: Are cross-domain uploads supported?
* `deleteFileCors`: Are cross-domain delete file requests supported?
* `canDetermineSize`: Can file size be determined client-side?