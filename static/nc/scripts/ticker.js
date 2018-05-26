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
