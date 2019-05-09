import { EventEmitter } from '@angular/core';
import { FileLikeObject } from './file-like-object.class';
import { FileItem } from './file-item.class';
import { FileType } from './file-type.class';
function isFile(value: any): boolean {
  return (File && value instanceof File);
}

export interface Headers {
  name: string;
  value: string;
}

export type ParsedResponseHeaders = { [ headerFieldName: string ]: string };

export type FilterFunction = {
  name: string,
  fn: (item?: FileLikeObject, options?: FileUploaderOptions) => boolean
};

export interface FileUploaderOptions {
  allowedMimeType?: string[];
  allowedFileType?: string[];
  autoUpload?: boolean;
  isHTML5?: boolean;
  filters?: FilterFunction[];
  headers?: Headers[];
  method?: string;
  authToken?: string;
  maxFileSize?: number;
  queueLimit?: number;
  removeAfterUpload?: boolean;
  url?: string;
  disableMultipart?: boolean;
  itemAlias?: string;
  authTokenHeader?: string;
  additionalParameter?: { [ key: string ]: any };
  parametersBeforeFiles?: boolean;
  formatDataFunction?: Function;
  formatDataFunctionIsAsync?: boolean;
  chunkSize?: number;
  currentChunkParam?: string;
  totalChunkParam?: string;
  chunkMethod?: string;
  
}

export class FileUploader {

  public authToken: string;
  public isUploading: boolean = false;
  public queue: FileItem[] = [];
  public progress: number = 0;
  public _nextIndex: number = 0;
  public autoUpload: any;
  public authTokenHeader: string;
  public response: EventEmitter<any>;
  public chunkSize: number = null;
  public currentChunkParam: string = "current_chunk";
  public totalChunkParam: string = "total_chunks";
  public chunkMethod: string = "PUT";
  public options: FileUploaderOptions = {
    autoUpload: false,
    isHTML5: true,
    filters: [],
    chunkSize: null,
    currentChunkParam: "current_chunk",
    totalChunkParam: "total_chunks",
    chunkMethod: "PUT",
    removeAfterUpload: false,
    disableMultipart: false,
    formatDataFunction: (item: FileItem) => item._file,
    formatDataFunctionIsAsync: false
  };

  protected _failFilterIndex: number;

  public constructor(options: FileUploaderOptions) {
    this.setOptions(options);
    this.response = new EventEmitter<any>();
  }
  public setOptions(options: FileUploaderOptions): void {
    this.options = Object.assign(this.options, options);

    this.authToken = this.options.authToken;
    this.authTokenHeader = this.options.authTokenHeader || 'Authorization';
    this.autoUpload = this.options.autoUpload;
    this.chunkSize = this.options.chunkSize;
    this.currentChunkParam = this.options.currentChunkParam;
    this.totalChunkParam = this.options.totalChunkParam;
    this.chunkMethod = this.options.chunkMethod;
    this.options.filters.unshift({ name: 'queueLimit', fn: this._queueLimitFilter });

    if (this.options.maxFileSize) {
      this.options.filters.unshift({ name: 'fileSize', fn: this._fileSizeFilter });
    }

    if (this.options.allowedFileType) {
      this.options.filters.unshift({ name: 'fileType', fn: this._fileTypeFilter });
    }

    if (this.options.allowedMimeType) {
      this.options.filters.unshift({ name: 'mimeType', fn: this._mimeTypeFilter });
    }

    for (let i = 0; i < this.queue.length; i++) {
      this.queue[ i ].url = this.options.url;
    }
  }

  public addToQueue(files: File[], options?: FileUploaderOptions, filters?: FilterFunction[] | string): void {
    let list: File[] = [];
    for (let file of files) {
      list.push(file);
    }
    let arrayOfFilters = this._getFilters(filters);
    let count = this.queue.length;
    let addedFileItems: FileItem[] = [];
    list.map((some: File) => {
      if (!options) {
        options = this.options;
      }

      let temp = new FileLikeObject(some);
      if (this._isValidFile(temp, arrayOfFilters, options)) {
        let fileItem = new FileItem(this, some, options);
        addedFileItems.push(fileItem);
        this.queue.push(fileItem);
        this._onAfterAddingFile(fileItem);
      } else {
        let filter = arrayOfFilters[ this._failFilterIndex ];
        this._onWhenAddingFileFailed(temp, filter, options);
      }
    });
    if (this.queue.length !== count) {
      this._onAfterAddingAll(addedFileItems);
      this.progress = this._getTotalProgress();
    }
    this._render();
    if (this.options.autoUpload) {
      this.uploadAll();
    }
  }

  public removeFromQueue(value: FileItem): void {
    let index = this.getIndexOfItem(value);
    let item = this.queue[ index ];
    if (item.isUploading) {
      item.cancel();
    }
    this.onRemoveItem(item);
    this.queue.splice(index, 1);
    this.progress = this._getTotalProgress();
  }

  public clearQueue(): void {
    while (this.queue.length) {
      this.queue[ 0 ].remove();
    }
    this.progress = 0;
  }

  public uploadItem(value: FileItem): void {
    let index = this.getIndexOfItem(value);
    let item = this.queue[ index ];
    let transport = this.options.isHTML5 ? '_xhrTransport' : '_iframeTransport';
    item._prepareToUploading();
    if (this.isUploading) {
      return;
    }
    this.isUploading = true;
    (this as any)[ transport ](item);
  }

  public cancelItem(value: FileItem): void {
    const index = this.getIndexOfItem(value);
    const item = this.queue[ index ];
    const prop = this.options.isHTML5 ? item._xhr : item._form;
    if (item && item.isUploading) {
      prop.abort();
    }
  }

  public uploadAll(): void {
    const items = this.getNotUploadedItems().filter((item: FileItem) => !item.isUploading);
    if (!items.length) {
      return;
    }
    items.map((item: FileItem) => item._prepareToUploading());
    items[ 0 ].upload();
  }

  public cancelAll(): void {
    const items = this.getNotUploadedItems();
    items.map((item: FileItem) => item.cancel());
  }

  public isFile(value: any): boolean {
    return isFile(value);
  }

  public isFileLikeObject(value: any): boolean {
    return value instanceof FileLikeObject;
  }

  public getIndexOfItem(value: any): number {
    return typeof value === 'number' ? value : this.queue.indexOf(value);
  }
  
  public getIsErrorItems(): any[] {
    return this.queue.filter((item: FileItem) => item.isError);
  }
  
  public getIsCancelItems(): any[] {
    return this.queue.filter((item: FileItem) => item.isCancel);
  }
  
  public getIsSuccessItems(): any[] {
    return this.queue.filter((item: FileItem) => item.isSuccess );
  }
  
  public getAllItems(): any[] {
    return this.queue;
  }
  
  
  public getNotUploadedItems(): any[] {
    return this.queue.filter((item: FileItem) => !item.isUploaded);
  }

  public getReadyItems(): any[] {
    return this.queue
      .filter((item: FileItem) => (item.isReady && !item.isUploading))
      .sort((item1: any, item2: any) => item1.index - item2.index);
  }

  public destroy(): void {
    return void 0;
  }

  public onAfterAddingAll(fileItems: any): any {
    return { fileItems };
  }

  public onBuildItemForm(fileItem: FileItem, form: any): any {
    return { fileItem, form };
  }

  public onAfterAddingFile(fileItem: FileItem): any {
    return { fileItem };
  }

  public onWhenAddingFileFailed(item: FileLikeObject, filter: any, options: any): any {
    return { item, filter, options };
  }

  public onBeforeUploadItem(fileItem: FileItem): any {
    return { fileItem };
  }

  public onProgressItem(fileItem: FileItem, progress: any): any {
    return { fileItem, progress };
  }

  public onProgressAll(progress: any): any {
    return { progress };
  }

  public onSuccessItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }

  public onErrorItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }

  public onCancelItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }
  public onRemoveItem(item: FileItem ): any {
    return { item };
  }
  public onCompleteChunk(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }
  public onErrorChunk(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }
  public onCompleteItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): any {
    return { item, response, status, headers };
  }

  public onCompleteAll(): any {
    return void 0;
  }

  public _mimeTypeFilter(item: FileLikeObject): boolean {
    return !(this.options.allowedMimeType && this.options.allowedMimeType.indexOf(item.type) === -1);
  }

  public _fileSizeFilter(item: FileLikeObject): boolean {
    return !(this.options.maxFileSize && item.size > this.options.maxFileSize);
  }

  public _fileTypeFilter(item: FileLikeObject): boolean {
    return !(this.options.allowedFileType &&
      this.options.allowedFileType.indexOf(FileType.getMimeClass(item)) === -1);
  }

  public _onErrorItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void {
    item._onError(response, status, headers);
    this.onErrorItem(item, response, status, headers);
  }
  public _onCompleteChunk(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void{
    this.onCompleteChunk(item,response,status,headers);
    item._onCompleteChunk(response, status, headers);
    this.progress = this._getTotalProgress();
    this._render();
  }
  public _onCompleteItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void {
    item._onComplete(response, status, headers);
    this.onCompleteItem(item, response, status, headers);
    let nextItem = this.getReadyItems()[ 0 ];
    this.isUploading = false;
    if (nextItem) {
      nextItem.upload();
      return;
    }
    this.onCompleteAll();
    this.progress = this._getTotalProgress();
    this._render();
  }
  protected _headersGetter(parsedHeaders: ParsedResponseHeaders): any {
    return (name: any): any => {
      if (name) {
        return parsedHeaders[ name.toLowerCase() ] || void 0;
      }
      return parsedHeaders;
    };
  }
  protected _xhrAppendEvents(xhr: XMLHttpRequest, item: FileItem): XMLHttpRequest{
    let that = this;
    xhr.upload.onprogress = (event: any) => {
      let progress = Math.round(event.lengthComputable ? event.loaded * 100 / event.total : 0);
      if (that.options.chunkSize > 0) {
        progress = Math.round( ((item._currentChunk-1) * 100) / item._totalChunks) + Math.round(progress / item._totalChunks);
      }
      this._onProgressItem(item, progress);
    };
    xhr.onload = () => {
      const headers = this._parseHeaders(xhr.getAllResponseHeaders());
      const response = this._transformResponse(xhr.response, headers);
      const gist = this._isSuccessCode(xhr.status) ? 'Success' : 'Error';
      const method = '_on' + gist + 'Item';
      if (this.options.chunkSize > 0) {
        item._chunkUploaders.pop();
        if (item._currentChunk >= item._totalChunks) {
          (this as any)[ method ](item, response, xhr.status, headers);
          this._onCompleteItem(item, response, xhr.status, headers);
        } else {
          this._onCompleteChunk(item, response, xhr.status, headers);
        }
      } else {
        (this as any)[ method ](item, response, xhr.status, headers);
        this._onCompleteItem(item, response, xhr.status, headers);
      }
    };
    xhr.onerror = () => {
      const headers = this._parseHeaders(xhr.getAllResponseHeaders());
      const response = this._transformResponse(xhr.response, headers);
      if (this.options.chunkSize > 0) {
        this._onErrorChunk(item, response, xhr.status, headers);
      } else {
        this._onErrorItem(item, response, xhr.status, headers);
        this._onCompleteItem(item, response, xhr.status, headers);
      }
    };
    xhr.onabort = () => {
      const headers = this._parseHeaders(xhr.getAllResponseHeaders());
      const response = this._transformResponse(xhr.response, headers);
      this._onCancelItem(item, response, xhr.status, headers);
      this._onCompleteItem(item, response, xhr.status, headers);
    };

    xhr.open(item.method, item.url, true);
    xhr.withCredentials = item.withCredentials;
    if (this.options.headers) {
      for (let header of this.options.headers) {
        xhr.setRequestHeader(header.name, header.value);
      }
    }
    if (item.headers.length) {
      for (let header of item.headers) {
        xhr.setRequestHeader(header.name, header.value);
      }
    }
    if (this.authToken) {
      xhr.setRequestHeader(this.authTokenHeader, this.authToken);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        that.response.emit(xhr.responseText)
      }
    };
    return xhr;
  }
  
  protected _buildMultiPartSendable(item: FileItem): FormData{
    let sendable: FormData;
    sendable = new FormData();
    this._onBuildItemForm(item, sendable);
    let file: any = null;
    if(this.options.chunkSize > 0){
      file = item.getCurrentChunkFile();
    }else{
      file = item._file;
    }
    const appendFile = () => sendable.append(item.alias, file, item.file.name);
    if (!this.options.parametersBeforeFiles) {
      appendFile();
    }

    // For AWS, Additional Parameters must come BEFORE Files
    if (this.options.additionalParameter !== undefined) {
      Object.keys(this.options.additionalParameter).forEach((key: string) => {
        let paramVal = this.options.additionalParameter[ key ];
        // Allow an additional parameter to include the filename
        if (typeof paramVal === 'string' && paramVal.indexOf('{{file_name}}') >= 0) {
          paramVal = paramVal.replace('{{file_name}}', item.file.name);
        }
        sendable.append(key, paramVal);
      });
    }
    if (this.options.chunkSize > 0 && this.options.totalChunkParam){
      sendable.append(this.options.totalChunkParam,item.getTotalChunks());
    }
    if (this.options.chunkSize > 0 && this.options.currentChunkParam){
      sendable.append(this.options.currentChunkParam,item.getCurrentChunk() +1);
    }

    if (this.options.parametersBeforeFiles) {
      appendFile();
    }

    return sendable;
  }
  protected _xhrTransport(item: FileItem): any {
    let that = this;
    let xhr = item._xhr = new XMLHttpRequest();
    let sendable: any;
    this._onBeforeUploadItem(item);

    if (typeof item._file.size !== 'number') {
      throw new TypeError('The file specified is no longer valid');
    }
    if (!this.options.disableMultipart) {
      /* CHUNCKED FILE UPLOAD */
      if (this.options.chunkSize > 0) {
        const chunkMethod = this.options.chunkMethod;
        item._chunkUploaders = [];
        item._currentChunk = 0;
        item._onCompleteChunkCallNext =  function(): void{
          item._currentChunk ++;
          if (item._currentChunk > 1) {
            item.method = chunkMethod;
          }
          const sendable = this.uploader._buildMultiPartSendable(item);
          let xhr = new XMLHttpRequest();
          xhr = this.uploader._xhrAppendEvents(xhr, item);
          item._xhr = xhr;
          item._chunkUploaders.push(xhr);
          xhr.send(sendable);
          item.prepareNextChunk()
        };
        item.createFileChunk(this.options.chunkSize);
        item.setIsUploading(true);
        item._onCompleteChunkCallNext();
        this._render();
        return;
      } else {
        sendable = this._buildMultiPartSendable(item);
      }
    } else {
      sendable = this.options.formatDataFunction(item);
    }
    // Append Evenets
    xhr = this._xhrAppendEvents(xhr, item);
    if (this.options.formatDataFunctionIsAsync) {
      sendable.then(
        (result: any) => xhr.send(JSON.stringify(result))
      );
    } else {
      xhr.send(sendable);
    }
    this._render();
  }

  protected _getTotalProgress(value: number = 0): number {
    if (this.options.removeAfterUpload) {
      return value;
    }
    let notUploaded = this.getNotUploadedItems().length;
    let uploaded = notUploaded ? this.queue.length - notUploaded : this.queue.length;
    let ratio = 100 / this.queue.length;
    let current = value * ratio / 100;
    return Math.round(uploaded * ratio + current);
  }

  protected _getFilters(filters: FilterFunction[] | string): FilterFunction[] {
    if (!filters) {
      return this.options.filters;
    }
    if (Array.isArray(filters)) {
      return filters;
    }
    if (typeof filters === 'string') {
      let names = filters.match(/[^\s,]+/g);
      return this.options.filters
        .filter((filter: any) => names.indexOf(filter.name) !== -1);
    }
    return this.options.filters;
  }

  protected _render(): any {
    return void 0;
  }

  protected _queueLimitFilter(): boolean {
    return this.options.queueLimit === undefined || this.queue.length < this.options.queueLimit;
  }

  protected _isValidFile(file: FileLikeObject, filters: FilterFunction[], options: FileUploaderOptions): boolean {
    this._failFilterIndex = -1;
    return !filters.length ? true : filters.every((filter: FilterFunction) => {
      this._failFilterIndex++;
      return filter.fn.call(this, file, options);
    });
  }

  protected _isSuccessCode(status: number): boolean {
    return (status >= 200 && status < 300) || status === 304;
  }

  protected _transformResponse(response: string, headers: ParsedResponseHeaders): string {
    return response;
  }

  protected _parseHeaders(headers: string): ParsedResponseHeaders {
    let parsed: any = {};
    let key: any;
    let val: any;
    let i: any;
    if (!headers) {
      return parsed;
    }
    headers.split('\n').map((line: any) => {
      i = line.indexOf(':');
      key = line.slice(0, i).trim().toLowerCase();
      val = line.slice(i + 1).trim();
      if (key) {
        parsed[ key ] = parsed[ key ] ? parsed[ key ] + ', ' + val : val;
      }
    });
    return parsed;
  }

  protected _onWhenAddingFileFailed(item: FileLikeObject, filter: any, options: any): void {
    this.onWhenAddingFileFailed(item, filter, options);
  }

  protected _onAfterAddingFile(item: FileItem): void {
    this.onAfterAddingFile(item);
  }

  protected _onAfterAddingAll(items: any): void {
    this.onAfterAddingAll(items);
  }

  protected _onBeforeUploadItem(item: FileItem): void {
    item._onBeforeUpload();
    this.onBeforeUploadItem(item);
  }

  protected _onBuildItemForm(item: FileItem, form: any): void {
    item._onBuildForm(form);
    this.onBuildItemForm(item, form);
  }

  protected _onProgressItem(item: FileItem, progress: any): void {
    const total = this._getTotalProgress(progress);
    this.progress = total;
    item._onProgress(progress);
    this.onProgressItem(item, progress);
    this.onProgressAll(total);
    this._render();
  }
  protected _onErrorChunk(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void {
    item._onErrorChunk(response, status, headers);
    this.onErrorChunk(item, response, status, headers)
  }
  protected _onSuccessItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void {
    item._onSuccess(response, status, headers);
    this.onSuccessItem(item, response, status, headers);
  }

  protected _onCancelItem(item: FileItem, response: string, status: number, headers: ParsedResponseHeaders): void {
    item._onCancel(response, status, headers);
    this.onCancelItem(item, response, status, headers);
  }
}
