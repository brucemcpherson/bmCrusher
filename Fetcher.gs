function Fetcher ({ fetcher, tokenService }) {
  
  /**
  * this is a standard result object to simply error checking etc.
  * @param {HTTPResponse} response the response from UrlFetchApp
  * @return {object} the result object
  */
  this.makeResults = (response) => {

    const result = {
      success: false,
      data: null,
      code: null,
      extended: '',
      parsed: false
    };

    // process the result
    if (response) {

      result.code = response.getResponseCode();
      result.headers = response.getAllHeaders();
      result.content = response.getContentText();

      result.success = (result.code === 200 || result.code === 201 ||  result.code === 204);

      try {
        if (result.content) {
          result.data = JSON.parse(result.content);
          result.parsed = true;
        } 
      }
      catch (err) {
        result.extended = err;
      }
    }

    return result;

  };

  /**
  * execute a urlfetch
  * @param {string} url the url
  * @param {object} options any additional options
  * @return {object} a standard response
  */
  this.got = (url, options ) => {
    options = options || {}
    options = { method: "GET", muteHttpExceptions: true, ...options }
    options.headers = options.headers || {};
    if (tokenService) {
      options.headers.authorization = "Bearer " + tokenService();
    }
    const response = Utils.expBackoff(() => fetcher (url, options), {lookahead: (response) => response.getResponseCode() === 429})
    return this.makeResults(response);

    
  }


}


