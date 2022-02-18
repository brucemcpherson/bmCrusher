/**
* easy upload to google cloud storage
* the _folderKey is used to direct data to folderKeys
* to provide a kind of 'scope' when this is being used 
* as a property store or cache
* @constructor GcsStore
*/
function GcsStore() {

  var self = this;
  var DEFAULT_EXPIRY = 0; // dont expire
  var DEFAULT_VISIBILITY = "global/";
  var MAXPOSTSIZE = 1024 * 1024 * 4;
  var DEFAULT_CORS_AGE = 1800;

  var bucket_,
    _expiry = DEFAULT_EXPIRY,
    _folderKey = DEFAULT_VISIBILITY,
    _accessToken,
    _gcsEndpoint = "https://www.googleapis.com/storage/v1/b",
    _gcsUploadEndpoint = "https://www.googleapis.com/upload/storage/v1/b",
    _gcsPublicEndpoint = "https://storage.googleapis.com",
    _compress = false,
    _expiryLog = true,
    _logging = false,
    _maxPost = MAXPOSTSIZE;

  self.setLogging = function (logging) {
    _logging = logging
    return self
  }
  /**
   * turn off errors about expiration metadata being missing
   */
  self.setExpiryLog = function (expiryLog) {
    _expiryLog = expiryLog;
    return self;
  };
  /**
   * set a predefined acl as defined in https://cloud.google.com/storage/docs/access-control/lists#predefined-acl
   * @param {string{ key the key
   * @param {string} predefinedAcl one of the values for this from docs above
   * @return {object} the result
   */
  self.patchPredefinedAcl = function (key, predefinedAcl) {
    return _throwRob(
      'error setting predefinedAcl:' + predefinedAcl,
      _fetch(_gcsEndpoint + "/" + bucket_ + "/o/" + encodeURIComponent(fudgeKey_(key)) + "?predefinedAcl=" + predefinedAcl, {
        method: "PATCH",
        payload: JSON.stringify({
          acl: []
        }),
        contentType: "application/json; charset=UTF-8"
      }));
  };

  /**
   * get the current cors setting
   * @return {[object]} the current cors object
   */
  self.getCors = function () {

    var rob = _throwRob("error getting cors ", _fetch(_getBucketPath() + "?cors"));
    return rob.data.cors || [];
  };

  /**
   * set the current cors setting
   * @param {string|[object]|[string]} cors to set
   * @return {GcsStore} self 
   */
  self.patchCors = function (cors) {
    var corp = [];

    if (cors) {

      // single origin default
      if (!Array.isArray(cors)) {
        cors = [cors];
      }

      // copy cors & make defaults
      corp = JSON.parse(JSON.stringify(cors));

      // for simplicity, an array of strings will use all the default settings
      var origins = corp.filter(function (d) {
        return typeof d === "string";
      });

      // check all or nothing
      if (origins.length) {
        if (origins.length !== corp.length) {
          throw 'can mix objects and strings for origin default definition';
        }
        corp = [{ origin: origins }];
      }

      // now the defaaults
      corp = corp.map(function (d) {
        if (!d.origin) {
          throw 'you must at least specify an origin';
        }
        d.method = d.method || ["GET"];
        d.maxAgeSeconds = d.maxAgeSeconds || DEFAULT_CORS_AGE;
        d.responseHeader = d.responseHeader || ["Content-Type", "Origin"];
        return d;
      });

    }


    _throwRob(
      "error setting cors ",
      _fetch(
        _getBucketPath() + "?fields=cors%2Cid", {
        method: "PATCH",
        contentType: "application/json; charset=UTF-8",
        payload: JSON.stringify({ cors: corp })
      }));
    return self;

  };

  function _getMinimalInfo(key) {
    return _fetch(_getBucketPath() + "/o/" + encodeURIComponent(fudgeKey_(key)) + "?fields=selfLink,id");
  }

  /**
  * @param {string} key get a self link
  * @return {string} self link
  */
  self.getSelfLink = function (key) {

    var rob = _getMinimalInfo(key);
    if (!rob.ok) {
      _throwRob('error getting selfLink for ' + key, rob);
    }
    return rob.error ? "" : rob.data.selfLink.replace(/s+$/g, "");


  };

  /**
  * @param {string} key get a public link
  * @return {string} public link
  */
  self.getPublicLink = function (key) {

    var rob = _getMinimalInfo(key);
    if (!rob.ok) {
      _throwRob('error getting public link for ' + key, rob);
    }
    return rob.error ? "" : _gcsPublicEndpoint + "/" + bucket_ + "/" + fudgeKey_(key);


  };

  /**
  * @param {string} key get details
  * @return {string} shttps://www.googleapis.com/storage/v1/b/xliberation.com/o/dump%2Fblogplay.json?fields=selfLink&key={YOUR_API_KEY}elf link
  */
  self.getResource = function (key) {

    var rob =
      _fetch(_getBucketPath() + "/o/" + encodeURIComponent(fudgeKey_(key)));

    if (!rob.ok) {
      _throwRob('error getting selfLink for ' + key, rob);
    }
    return rob;


  };

  /**
   * returns a  of the objects in the curretn folderkey
   * this doesnt pay any attention to meta data.expires etc.
   */
  self.getObjects = function () {
    // gets all the keys 

    return _throwRob(
      "Getting keys",
      _page(
        _getBucketPath() + "/o",
        "prefix=" + encodeURIComponent(_folderKey) + "&delimiter=" + encodeURIComponent("/"),
        "items"))
      .data.items.map(function (d) {
        return d;
      });

  };
  /**
  * this cleans up any records that are expired in the bucket
  * and reports what it has done.
  */
  self.cleaner = function () {

    // get rid of items that have expired in the bucket
    var obs = getMetas_();

    return obs.data.items.filter(function (d) {
      return _isExpired(d.metadata);
    })
      .map(function (d) {
        remove_(d.name);
        return {
          name: d.name,
          expired: d.metadata.expires,
          deletedAt: new Date().getTime()
        }
      });

  };


  /**
  * set the bucket name to be used as cache
  * @param {string} bucketName this is the bucket in the project associated with the service account
  * @return {GcsStore} self
  */
  self.setBucket = function (bucket) {
    bucket_ = bucket;

    // check that we are good with this bucket
    var rob = self.getBucket();
    if (!rob.ok) {
      throw 'failed to get bucket ' + bucket + ':' + JSON.stringify(rob);
    }
    return self;
  };

  /**
  * set lifetime of items in the bucket
  * @param {number} days number of days for items to stay alive for
  * @return {GcsStore} self
  */
  self.setLifetime = function (days) {

    var lifecycle = days ? {
      "lifecycle": {
        "rule": [
          {
            "action": {
              "type": "Delete"
            },
            "condition": {
              "age": days
            }
          }
        ]
      }
    } : { lifecycle: null };


    _throwRob(
      'error setting lifetime',
      _fetch(_getBucketPath(), {
        method: "PATCH",
        payload: JSON.stringify(lifecycle),
        contentType: "application/json; charset=UTF-8"
      }));

    return self;
  }
  /**
  * get the visibility key
  * @return {string} the visibility key
  */
  self.getFolderKey = function () {
    return _folderKey;
  };

  /**
  * remove an item
  * @param {string} key the key
  * @return {object} rob
  */
  self.remove = function (key) {
    return remove_(fudgeKey_(key));
  };

  function remove_(name) {
    return _throwRob('removing item', _fetch(_getBucketPath() + "/o/" + encodeURIComponent(name) + "?fields=id%2Cmetadata%2Cname", {
      method: "DELETE"
    }));
  }
  /**
  * scripts using the same visibility key can see the same properties
  * @param {string}  folderKey the visibility key
  * @return {GcsStore} self
  */
  self.setFolderKey = function (folderKey) {
    if (typeof folderKey !== "string") {
      throw 'folderKey must be a string shared amongst all scripts needing to access the same data';
    }

    _folderKey = (folderKey + "/").replace(/\/\/$/, "/");
    if (_folderKey === "/") _folderKey = "";
    return self;
  };

  /**
  * scripts using the same visibility key can see the same properties
  * this resets it to the default
  * @return {GcsStore} self
  */
  self.resetFolderKey = function () {
    _folderKey = DEFAULT_VISIBILITY;
    return self;
  };
  /**
  * get a bucket
  * @param {name} [name] the bucket name
  * @return {object} the bucket
  */
  self.getBucket = function (name) {
    return _getBucket(name || bucket_);
  };

  /**
  * check of a bucket exists
  * @param {string} name
  * @return boolean
  */
  self.bucketExists = function (name) {
    var rob = self.getBucket(name);
    if (!rob.ok) {

      if (rob.code !== 404) _throwRob("checking for bucket", rob);
      return false;
    }
    return true;
  };
  /**
  * get a property
  * @param {string} key the key
  * @return {string} the data
  */
  self.get = function (key) {

    // get the meta data 
    var rob =
      _fetch(_getBucketPath() + "/o/" + encodeURIComponent(fudgeKey_(key)) + "?fields=mediaLink%2Cid%2Cmetadata%2Cname");

    if (!rob.ok && rob.code !== 404) {
      _throwRob('error getting metadata for ' + key, rob);
    }

    if (rob.ok) {
      // if not epired, get the data
      var metaData = rob.data.metadata || {};
      if (!_isExpired(metaData)) {
        var dob = _throwRob('failed to get media for key ' + key, _fetch(rob.data.mediaLink, undefined, metaData));
        return dob.blob || dob.data;
      }
      else {
        return null;
      }
    }
    else {
      return null;
    }


  };

  function _isExpired(metaData) {
    if (!metaData || !metaData.hasOwnProperty("expires")) {
      if (_expiryLog) Logger.log('expiration metadata missing:' + JSON.stringify(metaData));
      return false;
    }
    else {
      // check its a number
      var expires = parseInt(metaData.expires, 10);
      if (isNaN(expires)) {
        throw 'invalid expire ' + metaData.expires;
      }
      return expires && expires < new Date().getTime();
    }

  }

  /**
   * set default expiry
   * @param {number} defaultExpiry defautl expiry in seconds
   * @return {GcsStore} self
   */
  self.setDefaultExpiry = function (defaultExpiry) {
    if (!cUseful.Utils.isUndefined(defaultExpiry)) {
      _expiry = defaultExpiry;
    }
    return self;
  };

  /**
   * get default expiry
   * @return {number} defaultExpiry defautl expiry in seconds
   */
  self.getDefaultExpiry = function () {
    return _expiry;
  };

  /**
  * set compress mode
  * @param {boolean} compress compress mode
  * @return {GcsStore} self
  */
  self.setDefaultCompress = function (compress) {
    _compress = compress;
    return self;
  };

  /**
   * get compress
   * @return {number} compress whether its on
   */
  self.getDefaultCompress = function () {
    return _compress;
  };

  /**
  * set a property
  * @param {string} key the key
  * @param {string|object|blob} data the object
  * @param {number} [expiration=_expiry] time in seconds
  * @param {boolean} [compress=_compress] whether to compress
  * @return {GcsStore} self
  */
  self.put = function (key, value, expiration, compress) {

    // the entry is no longer valid after this date
    var expiry = cUseful.isUndefined(expiration) ? _expiry : expiration;
    compress = cUseful.isUndefined(compress) ? _compress : compress;

    // an expiry of 0 means its permament
    var expires = expiry ? new Date().getTime() + expiry * 1000 : 0;

    function isBlob_(ob) {
      return typeof ob === "object" && typeof ob.isGoogleType === "function";
    };

    // blobify the data
    var ob = {
      inputType: typeof value,
      value: value,
      contentType: "text/plain; charset=UTF-8",
    };


    // we cant easily do multipart with binary data,
    // so its a two step
    if (isBlob_(value)) {
      ob.inputType = "blob";
      ob.value = value.getBytes();
      ob.contentType = value.getContentType();
    }

    // if it's an object, then stringified it first
    else if (typeof value === "object") {
      ob.value = JSON.stringify(value);
      ob.contentType = "application/json; charset=UTF-8";
    }

    else if (typeof value !== "string") {
      throw 'unsupported type - for key:' + key + ':should be blob, string, or strigifiable object';
    }

    // this is workaround for Apps Script issue https://code.google.com/p/google-apps-script-issues/issues/detail?id=6422
    // ill pass it through in the metadata for now as we'll need it later
    ob.originalType = ob.contentType;

    // if we're compressing then zip it
    if (compress) {
      var b = isBlob_(value) ? value : Utilities.newBlob(ob.value, ob.contentType, fudgeKey_(key));
      var z = Utilities.zip([b], key + ".zip");
      ob.value = z.getBytes();
      ob.contentType = z.getContentType();
    }

    var rob;
   
    if (ob.value.length <= _maxPost) {
      // we have metadata to write - so we need to do a multipart
      var options = {
        method: "POST",
        contentType: ob.contentType,
        payload: ob.value
      };

      var metaData = { metadata: { expires: expires, inputType: ob.inputType, compress: compress, originalType: ob.originalType }, name: fudgeKey_(key) };
      rob = _fetch(_gcsEndpoint + "/" + bucket_ + "/o", options, metaData);
    }
    else {
      throw 'in order to preserve UrlFetch quota for your project, the maximum payload size allowed is ' + _maxPost;
    }

    _throwRob('failed to put data for key ' + fudgeKey_(key), rob);

    return self;
  };

  self.setMaxPostSize = function (maxPostSize) {
    _maxPost = maxPostSize;
    return self;
  };

  self.getMaxPostSize = function () {
    return _maxPost;
  };

  /**
  * set the oauth2 creds
  * @param {string} accessToken the oauth2 token
  * @return {GcsStore} self
  */
  self.setAccessToken = function (accessToken) {
    _accessToken = accessToken;
    return self;
  };

  /**
  * create a new bucket
  * @param {string} projectId the project id
  * @return {object} the result
  */
  self.createBucket = function (projectId, name) {
    return _throwRob(
      "error creating bucket",
      _fetch(
        _gcsEndpoint + "?project=" + projectId, {
        method: "POST",
        payload: JSON.stringify({ name: name }),
        contentType: "application/json; charset=UTF-8"
      }));
  };
  /**
  * get list of projects, given a project id
  * @param {string} projectId the project id
  * @return {object} the result
  */
  self.getBucketList = function (projectId) {
    return _fetch(_gcsEndpoint + "?project=" + projectId);
  };

  self.getKeys = function () {
    // gets all the keys 
    // filters out the expired
    var metas = getMetas_();

    return _throwRob(
      "Getting keys",
      _page(
        _getBucketPath() + "/o",
        "prefix=" + encodeURIComponent(_folderKey) + "&delimiter=" + encodeURIComponent("/") + "&fields=nextPageToken%2Cprefixes",
        "prefixes"
      )
    ).data.prefixes.map(function (d) {
      return d;
    })
      .filter(function (d) {
        return metas.data.items.some(function (e) {
          return !_isExpired(e.metadata);
        })
      })
      .map(function (d) {
        return d.replace(_folderKey, "").replace(/\/$/, "");
      });

  };

  function _throwRob(message, result) {
    if (!result.ok) {
      throw message + "\n" + result.response.getContentText();
    }
    return result;
  }


  /**
  * get all the metadata in the bucket
  * @return {object] the result
  */
  function getMetas_() {
    return _page(_getBucketPath() + "/o", "fields=items(metadata%2Cname)%2CnextPageToken");
  }

  function _page(base, params, prop) {
    var items, rob, url = base + (params ? ("?" + params) : "");
    prop = prop || "items";

    // this iterates through all the next page token stuff
    do {
      rob = _throwRob('paging objects', _fetch(url));
      items = items || [];
      if (rob.data) {
        url = rob.data.nextPageToken ?
          (base + (params ? ("?" + params + "&") : "?") + "pageToken=" + rob.data.nextPageToken) : "";
        items.push.apply(items, rob.data[prop] || []);
      }
    } while (url);
    rob.data = rob.data || [];
    rob.data[prop] = items;
    return rob;
  };

  function _getBucket(name) {
    return _fetch(_getBucketPath(name));
  }
  /**
  * get the path given a child path
  * @param {string} [childPath=''] the childpath
  * @return {string} the path
  */
  function _getBucketPath(name) {
    return _gcsEndpoint + '/' + (name || bucket_);
  }

  /**
  * mess with the key to apply the visibility
  * @param {string} key the key
  * @return {string} the fudged key
  */
  function fudgeKey_(key) {
    return _folderKey + key;
  }

  function makeUploadEndpoint_(url) {
    return url.replace(".com/storage", ".com/upload/storage");
  }

  function matches_(a, b) {
    return b.slice(0, a.length) === a;
  }

  function texty_(contentType) {
    if (!contentType) {
      throw 'need content type to be set';
    }
    return matches_("application/json", contentType) || matches_("text/plain", contentType);
  }
  /**
  * do a fetch
  * right now this handles only up to 5 meg posts
  * the resumable upload in this code doesnt yet handle all cases
  * and should not be used so as to protect UrlFetchApp quotas
  * if that quota goes up in the future, I may enable it
  * @param {string} url the url
  * @param {object} [options={method:'GET'}] 
  * @param {object} [metaData] if metadata then we need to do a couple of updates
  * @return {object}
  */
  function _fetch(url, options, metaData) {

    // defaults
    options = cUseful.Utils.clone(options || { method: 'GET' });
    if (!options.hasOwnProperty("muteHttpException")) {
      options.muteHttpExceptions = true;
    }
    options.headers = options.headers || {};
    options.headers.authorization = "Bearer " + _accessToken;
    options.method = options.method.toUpperCase();

    if(_logging) {
      console.log('doing', options.method, options.contentType)
    }

    if (options.method === "POST") {

      // if we can do multipart then do that
      if (texty_(options.contentType)) {

        var uploadUrl = makeUploadEndpoint_(url) + "?uploadType=multipart";

        // any old separator unlikely to occur in the data will do
        var sep = cUseful.Utils.generateUniqueString(8);

        if(_logging)console.log('posting multipart to', uploadUrl, sep )

        // generate the multipart request
        var body = "\r\n--" + sep +
          "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metaData) +
          "\r\n--" + sep +
          "\r\nContent-Type: " + options.contentType + "\r\n" +
          "\r\n" + options.payload +
          "\r\n--" + sep + "--\r\n";

        // this contenttype applies to the multipart definition, not the payload
        options.payload = body;
        options.contentType = "multipart/related; boundary=" + sep;
        return makeAndDo(uploadUrl, options);

      }
      else {

        // otherwise we need a two step
        // get the modified url for the upload url
        var uploadUrl = makeUploadEndpoint_(url) + "?uploadType=media";
        if (metaData.name) {
          uploadUrl += ("&name=" + encodeURIComponent(metaData.name));
        }
        if(_logging)console.log('posting non multipart to', uploadUrl )
        var rob = makeAndDo(uploadUrl, options);

        // if there was metadata, we still need to add that
        if (metaData) {
          options.payload = JSON.stringify(metaData);
          options.contentType = "application/json; charset=UTF-8";
          options.method = "PATCH";
          return makeAndDo(url + "/" + encodeURIComponent(metaData.name), options);
        }
        else {
          return rob;
        }
      }

    }

    // structure the result to a common format
    return makeAndDo(url, options);

    function makeAndDo(url, options) {
      var result = doRequest(url, options);
      if (_logging) console.log('request done')
      var rob = makeResult(result);
      return rob;
    }

    function doRequest(url, options) {

      return cUseful.Utils.expBackoff(function () {
        return UrlFetchApp.fetch(url, options);
      });
    }

    function makeResult(result) {
      var code = result.getResponseCode();
      var text = result.getContentText();
      var headers = result.getHeaders();
      var blob = result.getBlob();

      // reparse the data if it was written as JSON 
      var ok = code === 200 || code === 204 && options.method === "DELETE";
      var texty = headers['Content-Type'] && texty_(headers['Content-Type']);
      data = texty ? text : "";

      // see if we need to unzip
      var unzip = metaData && metaData.compress, unzipped;

      if (ok) {
        if (unzip && matches_("application/zip", headers['Content-Type'])) {
          unzipped = Utilities.unzip(blob)[0];
          // this is the issue with apps script forgetting about types
          // i'm using metadata to carry forward the original
          texty = texty_(unzipped.getContentType() || metaData.originalType || "text/plain");
          text = texty ? unzipped.getDataAsString() : "";
          blob = texty ? null : unzipped;
        }
        if (texty && text) {
          data = headers['Content-Type'] && matches_("application/json", headers['Content-Type']) ?
            JSON.parse(text) : text;
        }
      }

      const r = {
        ok: ok,
        data: data,
        response: result,
        path: url,
        code: code,
        blob: texty ? null : blob
      };


      return r;
    }

  };

}

