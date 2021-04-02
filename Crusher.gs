
// plugins for Squeeze service 
function CrusherPluginDriveService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script Advanced Drive service
  const self = this;

  // these will be specific to your plugin
  var settings_;
  var folder_ = null;


  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!settings_.store) throw "You must provide the Drive App as the store";
    if (!settings_.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!settings_.store.getRootFolder) throw 'The store must be the Drive App object';
    if (!settings_.prefix) throw 'The prefix must be the path of a folder eg /crusher/store';

    // set up the folder
    if (!folder_) {
      folder_ = DriveUtils.setService(settings_.store).getFolderFromPath(settings_.prefix);
      if (!folder_) throw 'The prefix ' + settings_.prefix + ' refers to a folder that doesnt exist';
    }
    return self;
  }

  // start plugin by passing settings yiou'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {
    settings_ = settings || {};
    // make sure we end with a single slash
    settings_.prefix = ((settings_.prefix || '') + '/').replace(/\/+$/, '/')

    // set default chunkzise for cacheservice (5mb)
    settings_.chunkSize = settings_.chunkSize || 5000000;

    // respect digest can reduce the number of chunks read, but may return stale
    settings_.respectDigest = Utils.isUndefined(settings_.respectDigest) ? false : settings_.respectDigest;

    // must have a cache service and a chunksize, and the store must be valid
    checkStore();

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(folder_)  // note that the store becomes the folder at this stage
      .setChunkSize(settings_.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(settings_.respectDigest)
      .setCompressMin(settings_.compressMin)
      .setPrefix(settings_.prefix);

    // export the verbs
    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
    return self;

  };

  // return your own settings
  function getSettings() {
    return settings_;
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
function CrusherPluginCacheService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script cache service
  const self = this;

  // these will be specific to your plugin
  var settings_;

  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!settings_.store) throw "You must provide a cache service to use";
    if (!settings_.chunkSize) throw "You must provide the maximum chunksize supported";
    return self;
  }

  // start plugin by passing settings yiou'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {
    settings_ = settings || {};

    // set default chunkzise for cacheservice
    settings_.chunkSize = settings_.chunkSize || 100000;

    // respect digest can reduce the number of chunks read, but may return stale
    settings_.respectDigest = Utils.isUndefined(settings_.respectDigest) ? false : settings_.respectDigest;

    // must have a cache service and a chunksize
    checkStore();

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(settings_.store)
      .setChunkSize(settings_.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(settings_.respectDigest)
      .setCompressMin(settings_.compressMin)
      .setPrefix(settings_.prefix);

    // export the verbs
    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
    return self

  };

  // return your own settings
  function getSettings() {
    return settings_;
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

function CrusherPluginPropertyService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script cache service
  const self = this;

  // these will be specific to your plugin
  var settings_;

  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!settings_.store) throw "You must provide a cache service to use";
    if (!settings_.chunkSize) throw "You must provide the maximum chunksize supported";
    return self;
  }

  // start plugin by passing settings yiou'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {
    settings_ = settings || {};

    // set default chunkzise for cacheservice
    settings_.chunkSize = settings_.chunkSize || 9000;

    // respect digest can reduce the number of chunks read, but may return stale
    settings_.respectDigest = Utils.isUndefined(settings_.respectDigest) ? false : settings_.respectDigest;

    // must have a cache service and a chunksize
    checkStore();

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(settings_.store)
      .setChunkSize(settings_.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(settings_.respectDigest)
      .setCompressMin(settings_.compressMin);

    // export the verbs
    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
    return self;

  };

  // return your own settings
  function getSettings() {
    return settings_;
  }

  /**
   * remove an item
   * @param {string} key the key to remove
   * @return {object} whatever you  like
   */
  function remove(store, key) {
    checkStore();
    return Utils.expBackoff(function () {
      return store.deleteProperty(key);
    });
  }

  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @return {object} whatever you like
   */
  function write(store, key, str) {
    checkStore();
    return Utils.expBackoff(function () {
      return store.setProperty(key, str);
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
      return store.getProperty(key);
    });
  }



}
// plugins for Squeeze service 
function CrusherPluginUpstashService() {

  const self = this;

  // these will be specific to your plugin
  let _settings = null;


  // prefixs on redis can be any string but
  // make sure we start and end with a single slash for consistency
  const fixPrefix = (prefix) => ((prefix || '') + '/').replace(/^\/+/, '/').replace(/\/+$/, '/')

  // standard function to check store is present and of the correct type
  const checkStore = () => {
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!_settings.prefix) throw 'The prefix must be the path of a folder eg /crusher/store';
    if (!_settings.tokenService || typeof _settings.tokenService !== 'function') throw 'There must be a tokenservice function that returns an oauth token';
    if (!_settings.fetcher || typeof _settings.fetcher !== 'function') throw 'There must be a fetch function that can do a urlfetch (url,options)';
    return self;
  }

  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {

    _settings = settings || {};

    // the settings are the same as the crusher settings
    _settings.store = {
      ug: bmUpstash.gqlRedis({
        fetcher: _settings.fetcher,
        tokenService: _settings.tokenService,
      })
    }

    // make sure we start and end with a single slash
    _settings.prefix = fixPrefix(_settings.prefix)

    // upstash supports value sizes of up to 1mb - but actually it doesn't work above 400k for now.
    // see - https://github.com/upstash/issues/issues/3
    _settings.chunkSize = _settings.chunkSize || 400000;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;

    // must have a cache service and a chunksize, and the store must be valid
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
      .setPrefix(_settings.prefix);

    // export the verbs
    self.put = self.squeezer.setBigProperty;
    self.get = self.squeezer.getBigProperty;
    self.remove = self.squeezer.removeBigProperty;
    return self;

  };

  // return your own settings
  self.getSettings = () => _settings;


  /**
   * remove an item
   * @param {string} key the key to remove
   * @return {object} whatever you  like
   */
  const remove = (store, key) => {
    checkStore();
    return store.ug.execute('Del', key)
  }

  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @param {number} expiry time in secs .. ignored in drive
   * @return {object} whatever you like
   */
  const write = (store, key, str, expiry) => {
    checkStore();
    const result = !expiry ? store.ug.execute('Set', key, str) : store.ug.execute('SetEX', key, str, expiry)
    if (result !== 'OK') throw new Error('failed to set value for key', key)
    return result
  }

  /**
   * read an item
   * @param {object} store whatever you initialized store with   
   * @param {string} key the key to write
   * @return {object} whatever you like
   */
  const read = (store, key) => {
    checkStore();
    return store.ug.execute('Get', key)
  }


}

