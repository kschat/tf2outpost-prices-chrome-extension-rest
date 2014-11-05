'use strict';


var settings = require('./settings.json')
  , q = require('q')
  , request = require('request')
  , restify = require('restify')
  , server = restify.createServer()

  , bp = settings['backpack.tf']
  , prices = {}
  , bpUrl = buildUrl(bp.host, bp.route, bp.params)
  , timeout = (settings.cache.timeoutInMinutes * 60 * 1000);

function buildUrl(host, route, params) {
  var qStr = Object.keys(bp.params)
    .map(function(val, i) {
      return (!i ? '?' : '&') + val + '=' + bp.params[val];
    })
    .join('');

  return [host, route, qStr].join('/');
}

function getPrices(url, def) {
  var deferred = def || q.defer();

  request(url, function(err, res, body) {
    if(res.headers['retry-after']) {
      return setTimeout(getPrices.bind(null, url, deferred), res.headers['retry-after'] * 1000);
    }

    deferred.resolve(JSON.parse(body));
  });

  return deferred.promise;
}

function updatePrices(p) {
  p = p.response;

  var items = p.items
    , newItems = {};

  for(var i in items) {
    if(!items.hasOwnProperty(i)) { continue; }
    var item = items[i]
      , defIndex = (item.defindex || [])[0];

    if(!defIndex) { continue; }

    item.itemName = i;
    newItems[defIndex] = item;
  }

  p.items = newItems;
  prices = p;
}

getPrices(bpUrl)
  .then(updatePrices)

  .then(function refreshPrices() {
    setTimeout(function() {
      getPrices(bpUrl)
        .then(updatePrices)
        .then(refreshPrices);
    }, timeout);
  })

  .then(function() {
    server.get('/prices', function(req, res, next) {
      res.send(200, prices);
    });

    server.listen(process.env.PORT || 8080, function() {
      console.log('%s listening at %s', server.name, server.url);
    });
  })
  .catch(function(err) {
    console.log(err.stack);
  });

