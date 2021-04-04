
// plugins for Squeeze service 
function CrusherPluginOneDriveService() {

  const self = this;

  // these will be specific to your plugin
  var _settings;
  let _fetcher = null;

  // make sure we start and end with a single slash
  const fixPrefix = (prefix) => ((prefix || '') + '/').replace(/^\/+/, '/').replace(/\/+$/, '/')

  // standard function to check store is present and of the correct type
  function checkStore() {
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
    // actually this is base url of the onedrive api
    _settings.store = 'https://api.onedrive.com/v1.0/drive/root:'

    // make sure we start and end with a single slash
    _settings.prefix = fixPrefix(_settings.prefix)

    // set default chunkzise for oneDrive (4mb)
    // onedrive supports simple uploads of up to 4mb 
    _settings.chunkSize = _settings.chunkSize || 4000000;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;

    // must have a cache service and a chunksize, and the store must be valid
    checkStore();

    // initialize the fetcher
    _fetcher = new Fetcher(_settings).got

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
    return self;

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
    const result = _fetcher(store + key, {
      method: 'DELETE'
    })
   
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
    const result = _fetcher(store + key + ':/content', {
      payload: str,
      method: 'PUT',
      contentType: "application/json"
    })
   
    if(!result.success) {
      throw new Error()
    }
    return result.data;
  }

  /**
   * read an item
   * @param {object} store whatever you initialized store with   
   * @param {string} key the key to write
   * @return {object} whatever you like
   */
  function read(store, key) {
    checkStore();
   
    const result = _fetcher(store + key)
   
    // we need to go back for the content
    if(result.success) {
      
      const dl = _fetcher(result.data['@content.downloadUrl'])
      
      if(!dl.success) {
        throw new Error(dl.extended)
      }
      return dl.content
    }
    return null
  }



}
