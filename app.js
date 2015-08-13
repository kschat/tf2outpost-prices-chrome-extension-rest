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

  p.items = Object.keys(p.items).reduce((acc, item, index) => {
    item = p.items[item];
    const defIndex = (item.defindex || [])[0];

    if(!defIndex) { return; }

    item.itemName = index;

    acc[defIndex] = item;

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

    server.listen(process.env.PORT || 8080, () => {
      console.log('%s listening at %s', server.name, server.url);
    });
  })

  .catch((err) => {
    console.log(err.stack);
  });

