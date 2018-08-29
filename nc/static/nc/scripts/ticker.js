function fetchTickerData(attempt) {
  /*
  Use StellarTerm API to retrieve compiled Stellar asset data.

  NOTE: Modelled after https://github.com/stellarterm/stellarterm/blob/73abb4362967a6df3342f019d98846723f37ae17/src/lib/driver/Ticker.js

  GET to StellarTerm ticker.json endpoint returns
  { "_meta": {}, "assets": [], "pairs": {} }

  For each asset in result.assets,
  looks safe to assume asset.id is of the form "<asset_code>-<asset_issuer>"
  if not XLM. If XLM, have asset.id of "XLM-native"
  https://github.com/stellarterm/stellarterm/blob/73abb4362967a6df3342f019d98846723f37ae17/directory/directory.json
  */
  if (attempt >= STELLARTERM_TICKER_MAX_ATTEMPTS) {
    return null;
  }

  return $.get(STELLARTERM_TICKER_URL)
  .then(function(data) {
    return data;
  })
  .catch(function(error){
    console.error('Error fetching StellarTerm ticker data', error);
    if (!attempt) {
      attempt = 0;
    }
    setTimeout(function() { this.fetchTickerData(attempt + 1); }, 1000);
  });
}

function buildTickerData(server, asset, xlmTickerData) {
  /*
  Build ticker data for given asset from Horizon calls.
  */

  // Looking at last 24h worth of data, so check the most recent
  // trade when querying with resolution of 1 day. Have start date be 1 year
  // back, in case trading has been sparse recently.
  let end = moment().valueOf(),
      start = moment().subtract(1.0, 'year').valueOf(),
      resolution = 86400000;

  return server.tradeAggregation(asset, StellarSdk.Asset.native(), start, end, resolution)
  .order("desc").limit(1).call()
  .then(function(data){
    var tickerData = {};

    // Produce ticker properties of
    // id, code, issuer, change24h_XLM, change24h_USD, price_XLM, price_USD
    // numTrades24h, volume24h_XLM, volume24h_USD
    if (data.records.length > 0) {
      let record = data.records[0],
          change24hXlm = 100 * (record.close - record.open) / record.open,
          change24hUsd = change24hXlm - xlmTickerData.change24h_USD; // NOTE: approx to first order is good enough

      tickerData = Object.assign(tickerData, {
        'id': asset.code + '-' + asset.issuer,
        'code': asset.code,
        'issuer': asset.issuer,
        'price_XLM': record.close,
        'price_USD': record.close * xlmTickerData.price_USD,
        'change24h_XLM': change24hXlm,
        'change24h_USD': change24hUsd,
        'numTrades24h': record.trade_count,
        'volume24h_XLM': record.counter_volume,
        'volume24h_USD': record.counter_volume * xlmTickerData.price_USD,
      });
    }
    return tickerData;
  })
  .then(function(tickerData) {
    if (!$.isEmptyObject(tickerData)) {
      return server.orderbook(asset, StellarSdk.Asset.native()).call()
      .then(function(orderbook) {
        // NOTE: See https://github.com/stellarterm/stellarterm/blob/master/api/functions/ticker.js
        let bidPrice = (orderbook.bids.length > 0 ? orderbook.bids[0].price: 0.0),
            askPrice = (orderbook.asks.length > 0 ? orderbook.asks[0].price: 0.0),
            spread = (bidPrice > 0 && askPrice > 0 ? 1.0 - bidPrice / askPrice : 0.0),
            pairPrice = (spread > 0.4 ? bidPrice : (bidPrice + askPrice)/2.0),
            sum10PercentBidAmounts = _.sumBy(orderbook.bids, bid => {
              console.log('Bid: ' + bid.price);
              if (parseFloat(bid.price)/pairPrice >= 0.9) {
                return parseFloat(bid.amount);
              }
              return 0;
            }),
            sum10PercentAskAmounts = _.sumBy(orderbook.asks, ask => {
              console.log('Ask: ' + ask.price);
              if (parseFloat(ask.price)/pairPrice <= 1.1) {
                return parseFloat(ask.amount);
              }
              return 0;
            }),
            depth10Xlm = _.round(Math.min(sum10PercentBidAmounts, sum10PercentAskAmounts)),
            depth10Usd = depth10Xlm * xlmTickerData.price_USD;
            console.log(sum10PercentBidAmounts);
            console.log(sum10PercentAskAmounts);
            console.log(pairPrice);
            console.log(bidPrice);
            console.log(askPrice);
            console.log((bidPrice + askPrice)/2.0);


        tickerData = Object.assign(tickerData, {
          'spread': spread,
          'numBids': orderbook.bids.length,
          'numAsks': orderbook.asks.length,
          'depth10_XLM': depth10Xlm,
          'depth10_USD': depth10Usd,
        });
        return tickerData;
      })
      .catch(function(error) {
        // Return the most recently stored buy/sell market prices
        console.error('Something went wrong with Stellar call', error);
        return {};
      });
    } else {
      return tickerData;
    }
  })
  .catch(function(error) {
    // Report error and simply return empty data
    console.error('Something went wrong with Stellar call', error);
    return {};
  });
}

function getTickerAssets(server, requiredAssets=[]) {
  /*
  Returns fetched assets reformatted in dict form (for easier lookup).

  NOTE: requiredAssets is an array of StellarSdk.Assets
  */
  return fetchTickerData()
  .then(function(data) {
    var assetData = {};
    data.assets.forEach(function(asset) {
      if (asset.id == 'XLM-native') {
        // Add the 24h USD change from data._meta since it's not included
        asset.change24h_USD = data._meta.externalPrices.USD_XLM_change;
      }
      assetData[asset.id] = asset;
    });
    return assetData;
  })
  .then(function(assetData) {
    // Make sure the needed assets specified in requiredAssetIds
    // are present in the returned asset data by fetching trade aggregation data
    // for the last day from Horizon if necessary.

    // Determine which asset data need to assemble
    let neededAssets = requiredAssets.filter(function(asset) {
      return !asset.isNative() && !(asset.code + '-' + asset.issuer in assetData);
    });

    if (neededAssets.length > 0) {
      // Construct the build ticker requests
      let tickerBuildRequests = neededAssets.map(function(asset) {
        return buildTickerData(server, asset, assetData['XLM-native'])
        .then(function(record) {
          return record;
        });
      });

      // Submit requests and add new ticker records to assetData
      return Promise.all(tickerBuildRequests)
      .then(function(tickerRecords) {
        tickerRecords.forEach(function(record) {
          if (!$.isEmptyObject(record)) {
            assetData[record.id] = record;
          }
        });
        return assetData;
      });
    } else {
      // Just return the original ticker data
      return assetData;
    }
  });
}
