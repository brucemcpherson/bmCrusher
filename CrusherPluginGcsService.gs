function CrusherPluginGcsService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script cache service
  const self = this;

  // these will be specific to your plugin
  let _settings = null;

  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!_settings.store) throw "You must provide a cache service to use";
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!_settings.bucketName) throw "You must provide the bucket to use";
    if (!_settings.tokenService || typeof _settings.tokenService !== 'function') throw 'There must be a tokenservice function that returns an access token';
    return self;
  }

  // start plugin by passing settings you'll need for operations
  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {

    _settings = settings || {};
    // set default chunkzise for gcs
    _settings.chunkSize = _settings.chunkSize || 10 * 1024 * 1024;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;


    //set up a store that uses google cloud storage - we can reuse the regular cache servive crusher for this
    _settings.store = new cGcsStore.GcsStore()
      // make sure that goa is using an account with enough privilege to write to the bucket
      .setAccessToken(_settings.tokenService())
      // set this to the bucket you are using as a property store
      .setBucket(_settings.bucketName)
      // gcsstore maintains expiry time data to not return objects if the expire
      // this avoids complaining about objects in the store that don't have such data
      // this allows you to use this to write 
      .setExpiryLog(false)
      // you can use this to segregate data for different projects/users/scopes etc as you want
      // need to cldean up the prefix too to normalize in case folder definitions are being used
      .setFolderKey(_settings.prefix.replace(/^\/+/, ''))
      // no need to compress as crusher will take care of that - no point in zipping again
      .setDefaultCompress(false)
      .setMaxPostSize(_settings.chunkSize)

    self.store = _settings.store;


    // you can set a default expiry time in seconds, but since we're allowing crusher to manage expiry, we don't want expiry to do it too
    // however we do want it to self clean, so we can use lifecycle management
    // (it's actually a number of days) - so just set it to the day it expires
    if (_settings.expiry) store.setLifetime(Math.ceil(_settings.expiry / 24 / 60 / 60));


    // we can just re-use the cache plugin service as cloud storage library has same methods.
    const p = new CrusherPluginCacheService().init({
      store: _settings.store,
      chunkSize: _settings.chunkSize,
      respectDigest: _settings.respectDigest,
      uselz: _settings.uselz,
      prefix: ''
    })
    return {
      ...p,
      native: {
        get: nativeRead,
        put: nativeWrite,
        remove: nativeRemove
      }
    }

  };

  const nativeRead = ({ key, store }) => {
    store = store || self.store
    const method = 'nativeRead'
    let blob = store.get(key);
    if (!Utils.isBlob(blob) && blob) {
      blob = Utilities.newBlob(blob, "text/plain")
    }
    const text = blob && blob.getDataAsString()
    const mimeType = blob && blob.getContentType()
    const bytes = blob && blob.getBytes()
    return {
      text,
      bytes,
      key,
      mimeType,
      code: blob ? 200 : 404,
      method
    }
  }


const nativeWrite = ({ key, store, value, expiry }) => {
  store = store || self.store
  return store.put(key, value, expiry)
}
const nativeRemove = ({ key, store }) => {
  store = store || self.store
  return store.remove(key)
}


}
