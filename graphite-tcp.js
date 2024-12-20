var reconnect= require('./reconnect-tcp')
var util = require('util')
var extend = Object.assign || util._extend

function Client(options) {

  var queue = {}, client, re, id

  var defaults = {
    host: '127.0.0.1',
    port: 2003,
    family: '4',
    prefix: '',
    suffix: '',
    verbose: false,
    interval: 5000,
    callback: null
  }

  function init() {
    options = extend(defaults, options)

    createClient()

    id = setInterval(send, options.interval)

    return {
      add: add,
      put: put,
      close: close,
      options: options
    }
  }

  function createClient() {
    re = reconnect({}, function(reconnecClient){
      client = reconnecClient;
    })
    .on('connect', function(){
      log('TCP socket connected to ' + options.host)
    })
    .on('reconnect', function(n, delay){
      log('Reconnecting to ' + options.host + ' for the '+n+'th time with a delay of ' + delay + 'ms')
    })
    .on('disconnect', function() {
      log('TCP socket disconnected from ' + options.host)
    })
    .on('error', function(err) {
      log('TCP socket error: '+ err)
    })
    .connect(options);

    log('Creating new Graphite TCP client to ' + options.host)
  }

  function close() {
    re.disconnect()
    clearInterval(id)
  }

  function put(name, value) {
    add(name, value, true)
  }

  function add(name, value, replace) {
    if(!name || isNaN(parseFloat(value)) || value === Infinity)
      return log('Skipping invalid name/value: '+ name +' '+ value)

    if(options.prefix)
      name = options.prefix +'.'+ name

    if(options.suffix)
      name = name +'.'+ options.suffix

    if(queue[name] === undefined || replace)
      queue[name] = { value: value }
    else
      queue[name].value += value

    queue[name].timestamp = String(Date.now()).substr(0, 10)

    log('Adding metric to queue: '+ name +' '+ value)
  }

  function getQueue() {
    var text = ''

    for(var name in queue) {
      text += name +' '+ queue[name].value +' '+ queue[name].timestamp +'\n'
    }

    return text
  }

  function send() {
    if(Object.keys(queue).length === 0)
      return //log('Queue is empty. Nothing to send')

    if (!re.connected) {
      return//socket is not connected, skip this interval
    }
    var metrics = new Buffer(getQueue())

    log('Sending '+ Object.keys(queue).length +' metrics to '
      + options.host +':'+ options.port)

    client.write(metrics,
      function(err) {
      if(err)
        return log('Error sending metrics: '+ err)

      log('Metrics sent:'+ metrics.toString().replace(/^|\n/g, '\n\t'))

      if(options.callback)
        options.callback(err, metrics.toString())
    })

    queue = {}
  }

  function log(line) {
    if(options.verbose)
      console.log('[graphite-tcp]', line)
  }

  return init()
}

module.exports = {
  createClient: function(options) {
    return new Client(options)
  }
}
