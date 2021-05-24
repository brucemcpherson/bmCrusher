function CrusherPluginDriveService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script Advanced Drive service
  const self = this;

  // these will be specific to your plugin
  var _settings;
  var folder_ = null;


  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!_settings.store) throw "You must provide the Drive App as the store";
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!_settings.store.getRootFolder) throw 'The store must be the Drive App object';
    if (!_settings.prefix) throw 'The prefix must be the path of a folder eg /crusher/store';

    // set up the folder
    if (!folder_) {
      folder_ = DriveUtils.setService(_settings.store).getFolderFromPath(_settings.prefix);
      if (!folder_) throw 'The prefix ' + _settings.prefix + ' refers to a folder that doesnt exist';
    }
    return self;
  }

  // start plugin by passing settings yiou'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {
    _settings = settings || {};
    // make sure we end with a single slash
    _settings.prefix = ((_settings.prefix || '') + '/').replace(/\/+$/, '/')

    // set default chunkzise for cacheservice (5mb)
    _settings.chunkSize = _settings.chunkSize || 5000000;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;

    // must have a cache service and a chunksize, and the store must be valid
    checkStore();
    self.store = folder_

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(self.store)  // note that the store becomes the folder at this stage
      .setChunkSize(_settings.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(_settings.respectDigest)
      .setCompressMin(_settings.compressMin)
      .setUselz(_settings.uselz || false)
      .setPrefix('');
    ''
    // export the verbs

    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
    self.native = {
      get: nativeRead,
      put: nativeWrite,
      remove: nativeRemove
    }
    return self;

  };

  // return your own settings
  function getSettings() {
    return _settings;
  }

  function getTheFile(store, key) {
    var fs = store.getFilesByName(key);
    return fs.hasNext() ? fs.next() : null;
  }


  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @return {object} whatever you like
   */
  const write = (store, key, str) => nativeWrite({ key, value: str, mimeType: "application/json", store })

  /**
   * read an item
   * @param {object} store whatever you initialized store with   
   * @param {string} key the key to write
   * @return {object} whatever you like
   */
  const read = (store, key) => {
    const f = nativeRead({ key, store })
    return f ? f.text : null;
  }
  /**
   * remove an item
   * @param {string} key the key to remove
   * @return {object} whatever you  like
   */
  const remove = (store, key) => nativeRemove({ key, store })


  const nativeRemove = ({ key, store }) => {
    checkStore()
    // the store will almost certainly be the store from the instance
    store = store || self.store
    const method = 'nativeRemove'

    try {
      return Utils.expBackoff(function () {
        const f = getTheFile(store, key);
        const r = f && store.removeFile(f)
        return {
          code: f? 204 : 404,
          method,
          key
        }
        
      });
    } catch (error) {
      return {
        error,
        key,
        method
      }
    }
  }
  /**
   * native read
   */
  const nativeRead = ({ key, store }) => {
    checkStore()
    // the store will almost certainly be the store from the instance
    store = store || self.store
    const method = 'nativeRead'
    try {
      return Utils.expBackoff(() => {
        const f = getTheFile(store, key);
        const blob = f && f.getBlob()
        const text = blob && blob.getDataAsString()
        const mimeType = f && f.getMimeType()
        const bytes = blob && blob.getBytes()
        return {
          text,
          bytes,
          key,
          mimeType,
          code: f ? 200 : 404,
          method
        }
      })
    } catch (error) {
      return {
        error,
        key,
        method
      }
    }
  }

  /**
   * native write
   */
  const nativeWrite = ({ key, value, mimeType, store }) => {

    checkStore()
    // the store will almost certainly be the store from the instance
    store = store || self.store
    method = 'nativeWrite'
    if (!key) throw new Error('supply key as filename')
    try {
      return Utils.expBackoff(() => {


        // make a blob to write
        let blob = value

        if (Utils.isBlob(value)) {
          mimeType = mimeType || value.getContentType() || 'text/plain'

        } else {
          blob = Utilities.newBlob(value)
        }
        blob.setContentType(mimeType)
        blob.setName(key)

        // if it exists, then we should remove it
        nativeRemove ({ key, store })

        const file = store.createFile(blob);
        return {
          key,
          file,
          mimeType,
          code: 200,
          method
        }
      })
    } catch (error) {
      return {
        error,
        key,
        method
      }
    }
  }
}