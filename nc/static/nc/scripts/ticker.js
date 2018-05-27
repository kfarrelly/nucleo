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

function getTickerAssets() {
  /* Returns fetched assets reformatted in dict form (for easier lookup) */
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
  });
}
