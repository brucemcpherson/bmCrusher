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

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(folder_)  // note that the store becomes the folder at this stage
      .setChunkSize(_settings.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(_settings.respectDigest)
      .setCompressMin(_settings.compressMin)
      .setUselz(_settings.uselz || false)
      .setPrefix(_settings.prefix);

    // export the verbs
    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
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
   * remove an item
   * @param {string} key the key to remove
   * @return {object} whatever you  like
   */
  function remove(store, key) {
    checkStore();
    return Utils.expBackoff(function () {
      const f = getTheFile(store, key);
      return f ? store.removeFile(f) : null;
    });
  }

  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @param {number} expiry time in secs .. ignored in drive
   * @return {object} whatever you like
   */
  function write(store, key, str, expiry) {
    checkStore();
    return Utils.expBackoff(function () {
      // Drive doesnt support auto expiry
      // this could be improved with a prune method - but for another day
      // if it's an existing file, overwrite, otherwise create
      var f = getTheFile(store, key);
      return f ? f.setContent(str) : store.createFile(key, str);
    });

  }

  /**
   * read an item
   * @param {object} store whatever you initialized store with   
   * @param {string} key the key to write
   * @return {object} whatever you like
   */
  function read(store, key) {
    checkStore();
    return Utils.expBackoff(function () {
      var f = getTheFile(store, key);
      return f ? f.getBlob().getDataAsString() : null;
    });
  }



}
