### Usage
```typescript
import { FileSelectDirective, FileDropDirective, FileUploader } from 'ng2-file-uploading-with-chunk/ng2-file-uploading-with-chunk';
```

### Annotations
```typescript
// class FileSelectDirective
@Directive({ selector: '[ng2FileSelect]' })
```

```typescript
// class FileDropDirective
@Directive({ selector: '[ng2FileDrop]' })
```

## FileSelect API

### Properties

  - `uploader` - (`FileUploader`) - uploader object. 

  Parameters supported by this object:

  1. `url` - URL of File Uploader's route
  2. `authToken` - auth token that will be applied as 'Authorization' header during file send.
  3. `disableMultipart` - If 'true', disable using a multipart form for file upload and instead stream the file. Some APIs (e.g. Amazon S3) may expect the file to be streamed rather than sent via a form. Defaults to false.
  4. `itemAlias` - item alias (form name redefenition)
  5. `formatDataFunction` - Function to modify the request body. 'DisableMultipart' must be 'true' for this function to be called.
  6. `formatDataFunctionIsAsync` - Informs if the function sent in 'formatDataFunction' is asynchronous. Defaults to false.
  7. `parametersBeforeFiles` - States if additional parameters should be appended before or after the file. Defaults to false.

### Events
 - `onFileSelected` - fires when files are selected and added to the uploader queue

## FileDrop API

### Properties

  - `uploader` - (`FileUploader`) - uploader object. 

### Events

  - `fileOver` - it fires during 'over' and 'out' events for Drop Area; returns `boolean`: `true` if file is over Drop Area, `false` in case of out.
   - `onFileDrop` - it fires after a file has been dropped on a Drop Area; you can pass in `$event` to get the list of files that were dropped. i.e. `(onFileDrop)="dropped($event)"`
