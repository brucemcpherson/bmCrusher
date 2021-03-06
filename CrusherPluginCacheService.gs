function CrusherPluginCacheService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script cache service
  const self = this;

  // these will be specific to your plugin
  var _settings;

  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!_settings.store) throw "You must provide a cache service to use";
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    return self;
  }

  // start plugin by passing settings yiou'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {
    _settings = settings || {};

    // set default chunkzise for cacheservice
    _settings.chunkSize = _settings.chunkSize || 100000;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;

    // must have a cache service and a chunksize
    checkStore();

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(_settings.store)
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
    return self

  };

  // return your own settings
  function getSettings() {
    return _settings;
  }

  /**
   * remove an item
   * @param {string} key the key to remove
   * @return {object} whatever you  like
   */
  function remove(store, key) {
    checkStore();
    return Utils.expBackoff(function () {
      return store.remove(key);
    });
  }

  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @param {number} expiry time in secs
   * @return {object} whatever you like
   */
  function write(store, key, str, expiry) {
    checkStore();
    return Utils.expBackoff(function () {
      return expiry ? store.put(key, str, expiry) : store.put(key, str);
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
      return store.get(key);
    });
  }



}
