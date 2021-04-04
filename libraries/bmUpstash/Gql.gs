class Gql {
  // fetcher should include auth setup
  constructor({ fetcher, url }) {
    this.fetcher = fetcher
    this.url = url
  }

  execute(command, ...vargs) {
    const cmd = 'redis' + command
    const payload = this[cmd](...vargs)
   
    const result = this.fetcher(this.url, {
      method: 'POST',
      contentType: "application/json",
      payload: JSON.stringify(payload)
    })
    if (!result.success) {
      throw new Error(result.content)
    }
    else {
      // redis doesnt support msetex, so this is because its a polyfill
      const d = command === "MSetEX" ? "redisMSet" : cmd
      return result.data && result.data.data && result.data.data[d]
    }

  }

  redisGet(key) {
    return {
      query: `query($key: String!) {
        redisGet(key:$key)
      }`,
      variables: {
        key
      }
    }
  }

  redisSetEX(key, value, seconds) {
    return {
      query: `mutation($key: String!,$value:String!,$seconds:Int!) {
        redisSetEX(key:$key, value:$value,seconds:$seconds)
      }`,
      variables: {
        key,
        value,
        seconds
      }
    }
  }

  redisDel(keys) {
    keys = Array.isArray(keys) ? keys : [keys]
    return {
      query: `mutation($keys: [String!]!) {
        redisDel(keys:$keys)
      }`,
      variables: {
        keys
      }
    }
  }

  redisSet(key, value) {
  
    return {
      query: `mutation($key: String!,$value:String!) {
        redisSet(key:$key, value:$value)
      }`,
      variables: {
        key,
        value
      }
    }
  }

  redisExpire(key, seconds) {
    
    return {
      query: `mutation($key: String!,$seconds:Int!) {
        redisExpire(key:$key, seconds:$seconds)
      }`,
      variables: {
        key,
        seconds
      }
    }
  }

  redisMGet(keys) {
    keys = Array.isArray(keys) ? keys : [keys]
    return {
      query: `query($keys: [String!]!) {
        redisMGet(keys:$keys)
      }`,
      variables: {
        keys
      }
    }
  }

  redisMSetEX (keyValuePairs, seconds) {
    if (!Array.isArray(keyValuePairs)) throw new Error('mset needs a single array of keyValuePairs')
    if (keyValuePairs.length % 2) throw new Error('mset should have even number of values in keyValuePairs array')
    
    // mset doesnt support EXpires but we can tag it all together into a single operation
    const expires =  keyValuePairs.filter((_,i)=>!(i%2)).map((f,i) => {
      return `exp${i}:redisExpire(key:"${f}", seconds: $seconds)`
    })
    const sets =  [`redisMSet(keyValuePairs: $keyValuePairs)`]

    const result = {
      query: `mutation($keyValuePairs: [String!]!, $seconds: Int!) {
        ${sets.concat(expires).join('\n')}
      }`,
      variables: {
        keyValuePairs,
        seconds
      }
    }

    return result
  }

  redisMSet (keyValuePairs) {
    if (!Array.isArray(keyValuePairs)) throw new Error('mset needs a single array of keyValuePairs')
    if (keyValuePairs.length % 2) throw new Error('mset should have even number of values in keyValuePairs array')

    const result = {
      query: `mutation($keyValuePairs: [String!]!) {
        redisMSet(keyValuePairs: $keyValuePairs)
      }`,
      variables: {
        keyValuePairs
      }
    }
    return result
  }



}

function gqlRedis({ fetcher, tokenService, url = 'https://graphql-eu-west-1.upstash.io/' } = {}) {
  if (!fetcher) throw new Error(`Must specify a fetcher - for apps script it should probably be ${'U'}rlfetch.fetch`)
  if (!tokenService) throw new Error(`Must specify a tokenservice function - should return your upstash read or read/write access key eg () => rwkey`)
  const f = new Fetcher({ fetcher, tokenService }).got
  return new Gql({ fetcher: f, url })
}
