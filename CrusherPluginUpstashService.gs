function CrusherPluginUpstashService() {

  const self = this;

  // these will be specific to your plugin
  let _settings = null;

  // this is used to store up for multi chunking
  let _cache = new Map()

  // prefixs on redis can be any string but
  // make sure we start and end with a single slash for consistency
  const fixPrefix = (prefix) => ((prefix || '') + '/').replace(/^\/+/, '/').replace(/\/+$/, '/')

  // standard function to check store is present and of the correct type
  const checkStore = () => {
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!_settings.prefix) throw 'The prefix must be the path of a folder eg /crusher/store';
    if (!_settings.tokenService || typeof _settings.tokenService !== 'function') throw 'There must be a tokenservice function that returns an upstash access token';
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
      .setUselz(_settings.uselz || false)
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
   * @param {string} propKey the parent KEY will be the same as key, except when multi records are being writtem
   * @param {boolean} flush whether to write
   * @return {object} whatever you like
   */
  const write = (store, key, str, expiry, propKey, flush) => {
    checkStore();
    // upstash is capable of writing multiple chunks, so we'll queue up the the thing if there are any and we have a propKey to do it on
    if (!propKey) {
      throw new Error("propkey is missing for", key)
    }
    if (!_cache.has(propKey)) _cache.set(propKey, [])
    // this might not be an error in the future - but interleaving chunk writes seems unlikely in a sync environment
    if (_cache.size > 1) throw new Error('started ', propKey, 'before finishing ', Array.from(_cache.keys()).join(","))
    const keyValuePairs = _cache.get(propKey)
    Array.prototype.push.apply(keyValuePairs, [key, str])

    // actually upstash still limits the max payload to 400k, so Mset isnt really helping
    // leave this code in here in case it gets fixed
    const tempAlwaysFlush = true;

    if (flush || tempAlwaysFlush) {
      const result = !expiry ? store.ug.execute('MSet', keyValuePairs) : store.ug.execute('MSetEX', keyValuePairs, expiry)
      _cache.delete(propKey)
      
      if (result !== 'OK') throw new Error('failed to set value for key', key, result)
      return result
    }
    // this'll mean the item has only been written to memory cache and not committed yet
    return "OK"
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
