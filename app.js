import { merge } from 'ramda';
import q from 'q';
import request from 'request';
import restify from 'restify';
import URL from 'url';
import settings from './settings.json';

const server = restify.createServer();
const bp = settings['backpack.tf'];
const bpUrl = URL.format(bp);
const timeout = settings.cache.timeoutInMinutes * 60 * 1000;

var prices = {};

const getPrices = (url, def) => {
  const deferred = def || q.defer();

  request(url, (err, res, body) => {
    if(err) { return deferred.reject(err); }

    if(res.headers['retry-after']) {
      return setTimeout(
        getPrices.bind(null, url, deferred),
        res.headers['retry-after'] * 1000
      );
    }

    try {
      deferred.resolve(JSON.parse(body));
    }
    catch(ex) {
      deferred.reject(ex);
    }
  });

  return deferred.promise;
};

const updatePrices = (p) => {
  p = p.response;

  p.items = Object.keys(p.items).reduce((acc, itemName) => {
    const item = p.items[itemName];
    let defIndex = (item.defindex || [])[0];

    if(/australium/i.test(itemName) && !/gold$/i.test(itemName)) {
      defIndex += 'a';
    }

    if(!defIndex) { return; }

    item.itemName = itemName;

    if(!acc[defIndex]) { acc[defIndex] = item; }

    acc[defIndex].prices = acc[defIndex]
      ? merge(acc[defIndex].prices, item.prices)
      : item.prices;

    return acc;
  }, {});

  prices = p;
};

getPrices(bpUrl)
  .then(updatePrices)

  .then(function refreshPrices() {
    setTimeout(() => {
      getPrices(bpUrl)
        .then(updatePrices)
        .then(refreshPrices);
    }, timeout);
  })

  .then(() => {
    server.get('/prices', (req, res, next) => {
      res.send(200, prices);
    });

    server.get('/prices/:id', (req, res, next) => {
      const price = prices.items[req.params.id];

      return price
        ? res.send(200, price)
        : res.send(404);
    });

    server.listen(process.env.PORT || 8080, () => {
      console.log('%s listening at %s', server.name, server.url);
    });
  })

  .catch((err) => {
    console.log(err.stack);
  });

