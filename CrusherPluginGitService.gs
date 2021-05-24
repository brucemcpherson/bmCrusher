
// plugins for Squeeze service 
// the 'store' in this case is the full name of a repo eg brucemcpherson/cGoa
function CrusherPluginGitService() {

  // writing a plugin for the Squeeze service is pretty straighforward. 
  // you need to provide an init function which sets up how to init/write/read/remove objects from the store
  // this example is for the Apps Script Advanced Drive service
  const self = this;

  // these will be specific to your plugin
  let _settings = null;
  let _fetcher = null;

  // the prefix is the path in the repo to hold stuff like this
  const fixPrefix = (prefix) => prefix ? (prefix + "/").replace(/\/+/g, '/').replace(/\/+$/, '/') : ''

  // standard function to check store is present and of the correct type
  function checkStore() {
    if (!_settings.repo) throw "You must provide the repo to use";
    if (!_settings.owner) throw "You must provide the owner of the repo to use";
    if (!_settings.chunkSize) throw "You must provide the maximum chunksize supported";
    if (!_settings.prefix) throw 'The prefix is the path in the repo to start storing data at';
    if (!_settings.tokenService || typeof _settings.tokenService !== 'function') throw 'There must be a tokenservice function that returns an oauth token';
    if (!_settings.fetcher || typeof _settings.fetcher !== 'function') throw 'There must be a fetch function that can do a urlfetch (url,options)';
    return self;
  }

  const getQuery = ({ store, key, getContent = false }) => {
    const { repo, owner, prefix } = store
    const expression = "HEAD:" + prefix + key
    return {
      query: `query ($repo: String! , $owner: String!, $expression: String) {
      repository(owner: $owner, name: $repo) {
        object(expression: $expression) {
          ... on Blob {
            oid
            ${getContent ? 'text' : ''}
          }
        }
      }
    }`,
      variables: {
        repo,
        owner,
        expression
      }
    }
  }


  /**
   * @param {object} settings these will vary according to the type of store
   */
  self.init = function (settings) {

    _settings = settings || {};
    _settings.prefix = fixPrefix(_settings.prefix)
  

    const store = {
      rest: 'https://api.github.com/',
      gql: 'https://api.github.com/graphql',
      prefix: _settings.prefix,
      owner: _settings.owner,
      repo: _settings.repo
    }


    // set default chunkzise for github (500k)
    _settings.chunkSize = _settings.chunkSize || 500000;

    // respect digest can reduce the number of chunks read, but may return stale
    _settings.respectDigest = Utils.isUndefined(_settings.respectDigest) ? false : _settings.respectDigest;

    // must have a cache service and a chunksize, and the store must be valid
    checkStore();

    // initialize the fetcher
    _fetcher = new Fetcher(_settings).got

    // now initialize the squeezer
    self.squeezer = new Squeeze.Chunking()
      .setStore(store)
      .setChunkSize(_settings.chunkSize)
      .funcWriteToStore(write)
      .funcReadFromStore(read)
      .funcRemoveObject(remove)
      .setRespectDigest(_settings.respectDigest)
      .setCompressMin(_settings.compressMin)
      .setUselz(_settings.uselz || false)
      // the prefix is handled in the store, so we can ignore it here
      .setPrefix('');

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
    const url = getUrl(store, key)
   
    // so we need to get the sha in case its an update rather than a new entry
    const getItem = _fetcher(url)

    const sha = getItem && getItem.success && getItem.data && getItem.data.sha

    // prepare the data 
    const body = {
      message: `bmcrusher:${key}`,
      sha
    }
  
    const result = _fetcher(url, {
      method: 'DELETE',
      payload: JSON.stringify(body),
      headers: {
        accept: 'application/vnd.github.v3+json'
      }
    })
    return result

  }


  const getUrl = (store, key) => {
    const { repo, owner, prefix } = store
    return store.rest + `repos/${owner}/${repo}/contents/${prefix}/${key}`.replace(/\/+/g, '/')
  }

  /**
   * write an item
   * @param {object} store whatever you initialized store with
   * @param {string} key the key to write
   * @param {string} str the string to write
   * @param {number} expiry time in secs .. ignored in drive
   * @return {object} whatever you lik
   */
  function write(store, key, str = '', expiry) {
    checkStore();
    const url = getUrl(store, key);

    // so we need to get the sha in case its an update rather than a new entry
    const getItem = _fetcher(url)
    const sha = getItem && getItem.success && getItem.data && getItem.data.sha

    // prepare the data 
    const body = {
      content: Utilities.base64Encode(str),
      message: `bmcrusher:${key}`,
      sha
    }

    const result = _fetcher(url, {
      payload: JSON.stringify(body),
      method: 'PUT',
      contentType: "application/json",
      headers: {
        accept: 'application/vnd.github.v3+json'
      }
    })

    if (!result.success) {
      throw new Error(result.content)
    }
    return result.data;
  }

  const getGql = (store, key) => {

    const payload = JSON.stringify(getQuery({ store, key, getContent: true }))

    const result = _fetcher(store.gql, {
      payload,
      method: 'POST',
      contentType: "application/json"
    })
    return result
  }

  /**
   * read an item
   * @param {object} store whatever you initialized store with   
   * @param {string} key the key to write
   * @return {object} whatever you like
   */
  function read(store, key) {
    checkStore();
    const result = getGql(store, key)
   
    const data = result && result.success && result.data && result.data.data
    return data && data.repository && data.repository.object && data.repository.object.text

  }

}