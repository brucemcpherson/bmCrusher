/**
* utils for squeezing more out of Apps Script quotas
* @namespace Squeeze
*/
var Squeeze = (function (ns) {

  /**
  * utilities for zipping and chunking data for property stores and cache
  * @constructor ChunkingUtils
  */
  ns.Chunking = function () {

    // the default maximum chunksize
    var _chunkSize = 9 * 1024,
      self = this,
      _store,
      _prefix = "chunking_",
      _overhead = 200,
      _respectDigest = true,
      _uselz = false,
      _compressMin = 300;

    //--default functions for these operations

    // how to get an object
    var _getObject = function (store, key) {
      var result = _readFromStore(store, key);
      if (!result) return null;
      // some plugins take care of parsing built in
      if (typeof result === 'object') return result
      return JSON.parse(result)
    };

    // how to set an object
    var _setObject = function (store, key, ob, expire) {
      var s = JSON.stringify(ob || {});
      // the presence of a digest means its a master record
      const flush = !!ob.digest

      _writeToStore(store, key, s, expire, ob.propKey, flush);
      return s.length;
    };

    // how to write a string
    var _writeToStore = function (store, key, str, propKey, flush) {

      return Utils.expBackoff(function () {
        return store.setProperty(key, str, propKey, flush);
      });
    };

    // how to read a string
    var _readFromStore = function (store, key) {
      return Utils.expBackoff(function () {
        return store.getProperty(key);
      });
    };

    // how to remove an object
    var _removeObject = function (store, key) {
      return Utils.expBackoff(function () {
        return store.deleteProperty(key);
      });
    };

    /**
    * set whether to use lz
    * @param {number} chunkSize the max size
    * @return {Chunking} self
    */
    self.setUselz = function (uselz) {
      _uselz = uselz;
      return self;
    };

    /**
    * set the max chunksize
    * @param {number} chunkSize the max size
    * @return {Chunking} self
    */
    self.setChunkSize = function (chunkSize) {
      _chunkSize = chunkSize;
      return self;
    };

    /**
    * minimum size over which to compress
    * @return {boolean} respectDigest the max size
    */
    self.getCompressMin = function () {
      return _compressMin;
    };

    /**
    * whether to respect digest to avoid rewriting unchanged records
    * @param {boolean} compressMin the min size
    * @return {Chunking} self
    */
    self.setCompressMin = function (compressMin) {
      if (!Utils.isUndefined(compressMin)) _compressMin = compressMin;
      return self;
    };

    /**
    * whether to respect digest to avoid rewriting unchanged records
    * @return {boolean} respectDigest 
    */
    self.getRespectDigest = function () {
      return _respectDigest;
    };

    /**
    * whether to respect digest to avoid rewriting unchanged records
    * @param {boolean} respectDigest the max size
    * @return {Chunking} self
    */
    self.setRespectDigest = function (respectDigest) {
      if (!Utils.isUndefined(_respectDigest)) _respectDigest = respectDigest;
      return self;
    };

    /**
    * get the max chunksize
    * @return {number} chunkSize the max size
    */
    self.getChunkSize = function () {
      return _chunkSize;
    };

    /**
    * set the key prefix
    * @param {string} prefix the key prefix
    * @return {Chunking} self
    */
    self.setPrefix = function (prefix) {
      if (!Utils.isUndefined(prefix)) _prefix = prefix.toString();
      return self;
    };

    /**
    * get the prefix
    * @return {string} prefix the prefix
    */
    self.getPrefix = function () {
      return _prefix;
    };
    /**
    * set the store
    * @param {object} store the store
    * @return {Chunking} self
    */
    self.setStore = function (store) {
      _store = store;
      return self;
    };

    /**
    * get the store
    * @return {object} the store
    */
    self.getStore = function () {
      return _store;
    };

    /**
    * set how to get an object
    * @param {function} func how to get an object
    * @return {Chunking} self
    */
    self.funcGetObject = function (func) {
      // func should take a store, key and return an object
      _getObject = checkAFunc(func);
      return self;
    };

    /**
    * set how to get an object
    * @param {function} func how to set an object
    * @return {Chunking} self
    */
    self.funcSetObject = function (func) {
      // func should take a store, key and an object, and return the size of the stringified object
      _setObject = checkAFunc(func);
      return self;
    };


    /**
     * set how to read from store
     * @param {function} func how to read from store 
     * @return {Chunking} self
     */
    self.funcReadFromStore = function (func) {
      // func should take a store key, and return a string
      _readFromStore = checkAFunc(func);
      return self;
    };

    /**
     * set how to write to store
     * @param {function} func how to set an object
     * @return {Chunking} self
     */
    self.funcWriteToStore = function (func) {
      // func should take a store key and a string to write
      _writeToStore = checkAFunc(func);
      return self;
    };

    /**
    * set how to remove an object
    * @param {function} func how to remove an object
    * @return {Chunking} self
    */
    self.funcRemoveObject = function (func) {
      // func should take a store, key
      _removeObject = checkAFunc(func);
      return self;
    };

    /**
    * check that a variable is a function and throw if not
    * @param {function} [func] optional function to check
    * @return {function} the func
    */
    function checkAFunc(func) {
      if (func && typeof func !== 'function') {
        throw new Error('argument should be a function');
      }
      return func;
    }

    function _payloadSize(metaSize) {
      if (_chunkSize <= _overhead || _chunkSize <= metaSize) {
        throw 'chunksize must be at least ' + (Math.max(_overhead, metaSize) + 1);
      }
      return _chunkSize - metaSize;
    }

    function _digest(what) {
      return Utils.keyDigest(what);
    }

    function _uid() {
      return Utils.generateUniqueString(6);
    }

    function _getChunkKey(key) {
      return key + "_" + _uid();
    }

    function _fudgeKey(key) {
      if (Utils.isUndefined(key) || key === null) throw 'property key must have a value';
      return typeof key === "object" ? _digest(key) : key;

    }

    /** 
    * get the keys of multiple entries if it was too big
    * @param {PropertiesService} props the service to use
    * @param {object} propKey the key
    * @return {object} the result {chunks:[],data:{}} - an array of keys, or some actual data
    */
    self.getChunkKeys = function (propKey) {

      // in case the key is an object
      propKey = _fudgeKey(propKey);
  
      var data,
        crushed = _getObject(self.getStore(), propKey);
      const uselz = crushed && crushed.uselz

      // at this point, crushed is an object with either
      // a .chunk property with a zipped version of the data, or
      // a .chunks property with an array of other entries to get
      // a .digest property with the digest of all the data which identifies it as a master

      // its a non split item
      if (crushed && crushed.chunk && crushed.digest) {
        // uncrush the data and parse it back to an object if there are no associated records
        data = crushed.chunk ? JSON.parse(crushed.skipZip ? crushed.chunk : self.unzip(crushed.chunk, uselz)) : null;

      }

      // return either the data or where to find the data
      return {
        chunks: crushed && crushed.chunks ? crushed.chunks : null,
        data: data,
        digest: crushed ? crushed.digest : "",
        skipZip: crushed && crushed.skipZip,
        expiresAt: crushed && crushed.expiresAt,
        uselz
      }

    };

    /** 
    * remove an entry and its associated stuff
    * @param {object} propKey the key
    * @return {Props} self
    */
    self.removeBigProperty = function (propKey) {

      // in case the key is an object
      propKey = _fudgeKey(propKey);
      var removed = 0;

      // always big properties are always crushed
      var chunky = self.getChunkKeys(_prefix + propKey);

      // now remove the properties entries
      if (chunky && chunky.chunks) {
        chunky.chunks.forEach(function (d) {
          _removeObject(self.getStore(), d);
          removed++;
        });
      }
      // now remove the master property
      if (chunky.digest) {
        _removeObject(self.getStore(), _prefix + propKey);
        removed++;
      }

      return removed;

    };



    /** 
    * updates a property using multiple entries if its going to be too big
    * @param {object} propKey the key
    * @param {object} ob the thing to write
    * @param {number} expire secs to expire
    * @return {size} of data written - if nothing done, size is 0
    */
    self.setBigProperty = function (propKey, ob, expire) {


      // in case the key is an object
      propKey = _fudgeKey(propKey);

      // donbt allow undefined
      if (Utils.isUndefined(ob)) {
        throw 'cant write undefined to store';
      }

      // blob pulls it out
      if (Utils.isBlob(ob)) {
        var slob = {
          contentType: ob.getContentType(),
          name: ob.getName(),
          content: Utilities.base64Encode(ob.getBytes()),
          blob: true
        }
      }

      // convery to timestamp
      else if (Utils.isDateObject(ob)) {
        var slob = {
          date: true,
          content: ob.getTime()
        }
      }

      // strinfigy
      else if (typeof (ob) === "object") {
        var slob = {
          content: JSON.stringify(ob),
          parse: true
        }
      }

      else {
        var slob = {
          content: ob
        }
      }
      // whether to use lz compression algo or just zip it
      slob.uselz = _uselz

      // pack all that up to write to the store
      const sob = JSON.stringify(slob);

      // get the digest
      var digest = Utils.keyDigest(sob);

      // now get the master if there is one
      var master = _getObject(self.getStore(), _prefix + propKey);

      if (master && master.digest && master.digest === digest && _respectDigest && !expire) {
        // nothing to do
        return 0;
      }
      else {
        // need to remove the previous entries and add this new one
        self.removeBigProperty(propKey);
        return _setBigProperty(_prefix + propKey, sob, expire);
      }

    };

    /** 
    * gets a property using multiple entries if its going to be too big
    * @param {object} propKey the key
    * @return {object} what was retrieved
    */
    self.getBigProperty = function (propKey) {

      // in case the key is an objecs

      propKey = _fudgeKey(propKey);

      // always big properties are always crushed
      var chunky = self.getChunkKeys(_prefix + propKey);
      const expired = chunky && chunky.expiresAt && chunky.expiresAt < new Date().getTime()
      const uselz = chunky && chunky.uselz

      // that'll return either some data, or a list of keys
      if (expired) {
        // auto cleaning - it;s possible it'll fail if it cleans between checking and here and the store supports self cleansing
        // so we dont care if there's an error
        try {
          self.removeBigProperty(propKey)
        } catch (err) {
          console.log('ignored an error self cleaning  for', propKey, err)
        }
        return null
      }
      if (chunky && chunky.chunks) {
        var p = chunky.chunks.reduce(function (p, c) {
          var r = _getObject(self.getStore(), c);

          // should always be available
          if (!r) {
            throw 'missing chunked property ' + c + ' for key ' + propKey;
          }

          // rebuild the crushed string
          return p + r.chunk;
        }, "");

        // now uncrush the result
        var package = JSON.parse(chunky.skipZip ? p : self.unzip(p, uselz));
      }
      else {
        // it was just some data
        var package = chunky ? chunky.data : null;
      }

      // now need to unpack;
      if (package) {
        if (package.parse) {
          return JSON.parse(package.content);
        }
        else if (package.date) {
          return new Date(package.content);
        }
        else if (package.blob) {
          return Utilities.newBlob(Utilities.base64Decode(package.content), package.contentType, package.name);
        }
        else {
          return package.content;
        }
      }
      else {
        return null;
      }
    };

    /** 
    * sets a property using multiple entries if its going to be too big
    *  use self.setBigProperty() from outside, which first deletes existing stuff 
    *  as well as checking the digest
    * @param {object} propKey the key
    * @param {string} sob the thing to write
    * @param {number} expire expiry in secs
    * @return {number} total length of everything written
    */
    function _setBigProperty(propKey, sob, expire) {

      // always crush big properties
      var size = 0;

      // crush the object
      var skipZip = sob.length < _compressMin;
      var chunks, crushed = skipZip ? sob : self.zip(sob, _uselz);

      // get the digest 
      // the digest is used to avoid updates when theres no change
      var digest = _digest(sob);


      // now split up the big thing if needed
      // expire should be a little bigger for the chunks to make sure they dont go away
      // important! always write the master record last if there's chunking going on
      // this will allow plugins capable of multi writing to do it all in one fetch
      const expiresAt = expire ? new Date().getTime() + expire * 1000 : null
      const meta = {
        digest: digest,
        skipZip: skipZip,
        expiresAt,
        uselz: _uselz,
        propKey
      }
      const payloadSize = _payloadSize(JSON.stringify(meta).length);
      // if we have an overflow, then need to write multiple properties
      if (crushed.length > payloadSize) {
        chunks = [];
      }

      do {

        // peel off a piece
        var chunk = crushed.slice(0, payloadSize);
        crushed = crushed.slice(chunk.length);

        if (chunks) {

          // make a new entry for the key
          var key = _getChunkKey(propKey);
          size += _setObject(self.getStore(), key, {
            propKey,
            chunk: chunk
          }, expire ? expire + 1 : expire);

          // remember the key
          chunks.push(key);

        }
        else {
          size += _setObject(self.getStore(), propKey, {
            ...meta,
            chunk: chunk
          }, expire);
        }

      } while (crushed.length)

      // now write the index if there were chunks
      if (chunks) {
        size += _setObject(self.getStore(), propKey, {
          ...meta,
          chunks: chunks
        }, expire);
      }

      return size;
    };

    /**
    * crush for writing to cache.props
    * @param {string} crushThis the string to crush
    * @return {string} the b64 zipped version
    */
    self.zip = function (crushThis, uselz) {

      if (!uselz) {
        return Utilities.base64Encode(Utilities.zip([Utilities.newBlob(crushThis)]).getBytes());
      } else {
        // using this mode makes it more transportable for cross platform
        return Compress.compressString(crushThis)
      }
    };

    /**
    * uncrush for writing to cache.props
    * @param {string} crushed the crushed string
    * @return {string} the uncrushed string
    */
    self.unzip = function (crushed, uselz) {

      return uselz
        ? Compress.decompressString(crushed)
        : Utilities.unzip(Utilities.newBlob(Utilities.base64Decode(crushed), 'application/zip'))[0].getDataAsString();
    };

  }
  return ns;
})(Squeeze || {});