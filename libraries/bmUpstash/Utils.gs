
/**
* libary for use with Going Gas Videos
* Utils contains useful functions 
* @namespace
*/
var Utils = (function (ns) {

  /**
 * test for a date objec
 * @param {*} ob the on to test
 * @return {boolean} t/f
 */
  ns.isDateObject = function (ob) {
    return ns.isObject(ob) && ob.constructor && ob.constructor.name === "Date";
  }
  /**
  * recursive rateLimitExpBackoff()
  * @param {function} callBack some function to call that might return rate limit exception
  * @param {object} options properties as below
  * @param {number} [attempts=1] optional the attempt number of this instance - usually only used recursively and not user supplied
  * @param {number} [options.sleepFor=750] optional amount of time to sleep for on the first failure in missliseconds
  * @param {number} [options.maxAttempts=5] optional maximum number of amounts to try
  * @param {boolean} [options.logAttempts=true] log re-attempts to Logger
  * @param {function} [options.checker] function to check whether error is retryable
  * @param {function} [options.lookahead] function to check response and force retry (passes response,attemprs)
  * @return {*} results of the callback 
  */
  
  ns.expBackoff = function ( callBack,options,attempts) {
    
    //sleepFor = Math.abs(options.sleepFor ||
    
    options = options || {};
    optionsDefault = { 
      sleepFor:  750,
      maxAttempts:5,                  
      checker:errorQualifies,
      logAttempts:true
    }
    
    // mixin
    Object.keys(optionsDefault).forEach(function(k) {
      if (!options.hasOwnProperty(k)) {
        options[k] = optionsDefault[k];
      }
    });
    
    
    // for recursion
    attempts = attempts || 1;
    
    // make sure that the checker is really a function
    if (typeof(options.checker) !== "function") {
      throw ns.errorStack("if you specify a checker it must be a function");
    }
    
    // check properly constructed
    if (!callBack || typeof(callBack) !== "function") {
      throw ns.errorStack("you need to specify a function for rateLimitBackoff to execute");
    }
    
    function waitABit (theErr) {
      
      //give up?
      if (attempts > options.maxAttempts) {
        throw errorStack(theErr + " (tried backing off " + (attempts-1) + " times");
      }
      else {
        // wait for some amount of time based on how many times we've tried plus a small random bit to avoid races
        Utilities.sleep (
          Math.pow(2,attempts)*options.sleepFor + 
          Math.round(Math.random() * options.sleepFor)
        );
        
      }
    }
    
    // try to execute it
    try {
      var response = callBack(options, attempts);
      
      // maybe not throw an error but is problem nevertheless
      if (options.lookahead && options.lookahead(response,attempts)) {
        if(options.logAttempts) { 
          Logger.log("backoff lookahead:" + attempts);
        }
        waitABit('lookahead:');
        return ns.expBackoff ( callBack, options, attempts+1) ;
        
      }
      return response;
    }
    
    // there was an error
    catch(err) {
      
      if(options.logAttempts) { 
        Logger.log("backoff " + attempts + ":" +err);
      }
      
      // failed due to rate limiting?
      if (options.checker(err)) {
        waitABit(err);
        return ns.expBackoff ( callBack, options, attempts+1) ;
      }
      else {
        // some other error
        throw ns.errorStack(err);
      }
    }
    
    
  }
  
  /**
  * get the stack
  * @param {Error} e the error
  * @return {string} the stack trace
  */
  ns.errorStack = function  (e) {
    try {
      // throw a fake error
      throw new Error();  //x is undefined and will fail under use struct- ths will provoke an error so i can get the call stack
    }
    catch(err) {
      return 'Error:' + e + '\n' + err.stack.split('\n').slice(1).join('\n');
    }
  }
  
  
  // default checker
  function errorQualifies (errorText) {
    
    return ["Exception: Service invoked too many times",
            "Exception: Rate Limit Exceeded",
            "Exception: Quota Error: User Rate Limit Exceeded",
            "Service error:",
            "Exception: Service error:", 
            "Exception: User rate limit exceeded",
            "Exception: Internal error. Please try again.",
            "Exception: Cannot execute AddColumn because another task",
            "Service invoked too many times in a short time:",
            "Exception: Internal error.",
            "User Rate Limit Exceeded",
            "Exception: ???????? ?????: DriveApp.",
            "Exception: Address unavailable",
            "Exception: Timeout",
            "GoogleJsonResponseException: Rate Limit Exceeded" 
           ]
    .some(function(e){
      return  errorText.toString().slice(0,e.length) == e  ;
    }) ;
    
  }
  
  
  
  /**
  * convert a data into a suitable format for API
  * @param {Date} dt the date
  * @return {string} converted data
  */
  ns.gaDate = function  (dt) {
    return Utilities.formatDate(
      dt, Session.getScriptTimeZone(), 'yyyy-MM-dd'
    );
  }
  
  /** 
  * execute a regex and return the single match
  * @param {Regexp} rx the regexp
  * @param {string} source the source string
  * @param {string} def the default value
  * @return {string} the match
  */
  ns.getMatchPiece = function (rx, source, def) {
    var f = rx.exec(source);
    
    var result = f && f.length >1 ? f[1] : def;
    
    // special hack for boolean
    if (typeof def === typeof true) {
      result = ns.yesish ( result );
    }
    
    return result;
  };
  
  /** 
  * generateUniqueString
  * get a unique string
  * @param {number} optAbcLength the length of the alphabetic prefix
  * @return {string} a unique string
  **/
  ns.generateUniqueString = function (optAbcLength) {
    var abcLength = ns.isUndefined(optAbcLength) ? 3 : optAbcLength;
    return  (new Date().getTime()).toString(36)  + ns.arbitraryString(abcLength) ;
  };
  
  /** 
  * get an arbitrary alpha string
  * @param {number} length of the string to generate
  * @return {string} an alpha string
  **/
  ns.arbitraryString = function (length) {
    var s = '';
    for (var i = 0; i < length; i++) {
      s += String.fromCharCode(ns.randBetween ( 97,122));
    }
    return s;
  };
  
  /**
   * check something is a blob
   * not a comprehensive test
   */
  ns.isBlob = function (blob) {
    
    // apps script tends to return the name as blob
    if (ns.isObject(blob) && blob.toString() === 'Blob') return true
    // pre v8 test
    return blob && typeof blob === "object" && 
        typeof blob.setContentTypeFromExtension === "function" && 
        typeof blob.getBytes === "function";
  };
  /** 
  * randBetween
  * get an random number between x and y
  * @param {number} min the lower bound
  * @param {number} max the upper bound
  * @return {number} the random number
  **/
  ns.randBetween = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  ns.yesish = function(s) {
    var t = s.toString().toLowerCase();
    return t === "yes" || "y" || "true" || "1";
  };
  
  /** 
  * check if item is undefined
  * @param {*} item the item to check
  * @return {boolean} whether it is undefined
  **/
  ns.isUndefined = function (item) {
    return typeof item === 'undefined';
  };
  
  /** 
  * isObject
  * check if an item is an object
  * @param {object} obj an item to be tested
  * @return {boolean} whether its an object
  **/
  ns.isObject = function (obj) {
    return obj === Object(obj);
  };
  
  /** 
  * checksum
  * create a checksum on some string or object
  * @param {*} o the thing to generate a checksum for
  * @return {number} the checksum
  **/
  ns.checksum = function (o) {
    // just some random start number
    var c = 23;
    if (!ns.isUndefined(o)){
      var s =  (ns.isObject(o) || Array.isArray(o)) ? JSON.stringify(o) : o.toString();
      for (var i = 0; i < s.length; i++) {
        c += (s.charCodeAt(i) * (i + 1));
      }
    }
    
    return c;
  };
  
  /**
  * @param {[*]} arguments unspecified number and type of args
  * @return {string} a digest of the arguments to use as a key
  */
  ns.keyDigest = function () {
    
    // conver args to an array and digest them
    return  Utilities.base64EncodeWebSafe (
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1,Array.prototype.slice.call(arguments).map(function (d) {
        return (Object(d) === d) ? JSON.stringify(d) : d.toString();
      }).join("-"),Utilities.Charset.UTF_8));
  };
  
  
  /**
  * digest a blob
  * @param {Blob} blob the blob
  * @return {string} the sha1 of the blob
  */
  ns.blobDigest = function(blob) {
    return ns.keyDigest(Utilities.base64Encode(blob.getBytes()));
  };
  
  /**
  * this is clone that will really be an extend
  * @param {object} cloneThis
  * @return {object} a clone
  */
  ns.clone = function (cloneThis) {
    return ns.vanExtend ({} , cloneThis);
  };
  
  /**
   * a short cut to add nested properties to a an object
   * @param {object} [base] the base object
   * @param {string} propertyScheme something like "a.b.c" will extend as necessary
   * @return {object} base updated
   */
   ns.propify = function (propertyScheme ,base) {
    
    // if base not specified, create it
    if (typeof base === typeof undefined) base = {};
    
    // make sure its an object
    if (typeof base !== typeof {} ) throw 'propify:base needs to be an object';
    
    // work through the scheme
    (propertyScheme || "").split (".")
      .reduce (function (p,c) {
      
        // add a branch if not already existing
        if (typeof p[c] === typeof undefined) p[c] = {};
        
        // make sure we're not overwriting anything
        if (typeof p[c] !== typeof {}) throw 'propify:branch ' + c + ' not an object in ' + propertyScheme;
        
        // move down the branch
        return p[c];
  
      } , base);
    
    // now should have the required shape
    return base;
  
  };

  /**
  * recursively extend an object with other objects
  * @param {[object]} obs the array of objects to be merged
  * @return {object} the extended object
  */
  ns.vanMerge = function(obs) {
    return (obs || []).reduce(function(p, c) {
      return ns.vanExtend(p, c);
    }, {});
  };
  /**
  * recursively extend a single obbject with another 
  * @param {object} result the object to be extended
  * @param {object} opt the object to extend by
  * @return {object} the extended object
  */
  ns.vanExtend = function(result, opt) {
    result = result || {};
    opt = opt || {};
    return Object.keys(opt).reduce(function(p, c) {
      // if its an object
      if (ns.isVanObject(opt[c])) {
        p[c] = ns.vanExtend(p[c], opt[c]);
      } else {
        p[c] = opt[c];
      }
      return p;
    }, result);
  };
  /**
  * use a default value if undefined
  * @param {*} value the value to test
  * @param {*} defValue use this one if undefined
  * @return {*} the new value
  */
  ns.fixDef = function(value, defValue) {
    return typeof value === typeof undefined ? defValue : value;
  };
  /**
  * see if something is undefined
  * @param {*} value the value to check
  * @return {bool} whether it was undefined
  */
  ns.isUndefined = function(value) {
    return typeof value === typeof undefined;
  };
  /**
  * simple test for an object type
  * @param {*} value the thing to test
  * @return {bool} whether it was an object
  */
  ns.isVanObject = function(value) {
    return typeof value === "object" && !Array.isArray(value);
  }
  
  /**
  * crush for writing to cache.props
  * @param {string} crushThis the string to crush
  * @return {string} the b64 zipped version
  */
  ns.crush = function (crushThis) {
    return Utilities.base64Encode(Utilities.zip ([Utilities.newBlob(JSON.stringify(crushThis))]).getBytes());
  };
  
  /**
  * uncrush for writing to cache.props
  * @param {string} crushed the crushed string
  * @return {string} the uncrushed string
  */
  ns.uncrush = function (crushed) {
    return Utilities.unzip(Utilities.newBlob(Utilities.base64Decode(crushed),'application/zip'))[0].getDataAsString();
  };
  
  /**
   * find the index of an item in an array
   * @param {[*]} arr the array
   * @param {function} func the compare func ( received item, index, arr)
   * @return {number} the index
   */
  ns.findIndex = function ( arr ,func) {
    var k = 0;
    
    if (!Array.isArray (arr)) throw 'findIndex arg should be an array';
    if (typeof func !== "function") throw 'findindex predictate should be a function';
    while (k < arr.length) {
      if (func (arr[k] , k , arr)) {
        return k;
      }
      k++;
    }
    return -1;
  };
  
  /**
   * find the item in an array
   * @param {[*]} arr the array
   * @param {function} func the compare func ( received item, index, arr)
   * @return {number} the index
   */
  ns.find = function ( arr ,func) {
    
    var k = ns.findIndex (arr , func );
    return k === -1 ? undefined : arr[k];
  };
  
 
  
  ns.curry = function () {
    return curry.apply ( null , Array.prototype.slice.call (arguments));
  }

  // These byte fiddlers were extracted and modified from 
  // https://github.com/tanaikech/ImgApp

  // The MIT License (MIT)
  // Copyright (c) 2017 Kanshi TANAIKE
  ns.byte2hex_num = function(data) {
    var conv;
    conv = (data < 0 ? data + 256 : data).toString(16);
    return conv.length == 1 ? "0" + conv : conv;
  };

 /**
 * append array b to array a
 * @param {Array.*} a array to be appended to 
 * @param {Array.*} b array to append
 * @return {Array.*} the combined array
 */
  ns.arrayAppend  = function (a,b) {
    // append b to a
    if (b && b.length)Array.prototype.push.apply(a,b);
    return a;
  }

  /**
  * add query to path
  * @param {object} query
  * @param {string} startPath
  * @return string the path
  */
  ns.addQueryToPath = function  (query, startPath) {
    query = ns.isUndefined (query) || query === null ? {} : query;
    if (typeof query !== "object" ) throw 'query must be an object';
    var qString = Object.keys (query)
    .map (function (k) {
      return k+ "=" + encodeURI (query[k]);
    })
    .join ("&");
    return startPath + (qString ? ((startPath.indexOf("?") === -1 ? "?" : "&" ) + qString) : "");
  };

  return ns;
}) (Utils || {});
