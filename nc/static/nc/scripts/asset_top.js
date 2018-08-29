(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  $(document).ready(function() {
    // Determine all the assets need info on for this profile
    let requiredAssets = getRelevantAssets();

    // Fetch compiled asset prices, vol, etc. from StellarTerm
    // when ready.
    $.when(getTickerAssets(server, requiredAssets))
    .done(function(assets) {
      populateAssetValues(assets);
    });
  });

  function getRelevantAssets() {
    /*
    Fetch all the assets that need price related info on current document.
    */
    var assetIdSet = new Set([]);
    $('.asset-ticker').each(function(i, assetTickerDiv) {
      if (assetTickerDiv.hasAttribute('data-asset_id') && assetTickerDiv.dataset.asset_id != 'XLM-native') {
        assetIdSet.add(assetTickerDiv.dataset.asset_id);
      }
    });
    return Array.from(assetIdSet).map(function(assetId) {
      return new StellarSdk.Asset(assetId.split('-')[0], assetId.split('-')[1]);
    });
  }

  function populateAssetValues(data) {
    /*
    Use ticker data = { asset.id: asset } to populate asset values
    in USD and 24h percent change for all assets in user's portfolio.
    */
    // Get all the asset price containers
    $('.asset-ticker').each(function(i, assetTickerDiv) {
      // For each check for an asset in the fetched data
      let asset = data[assetTickerDiv.dataset.asset_id];
      if (asset) {
        // If fetched asset exists, set val and % change
        // data as container text.
        var value, valueText, percentChange, valueChange, valueChangeText;
        // Reference to USD val and % change
        value = asset.price_USD * parseFloat(assetTickerDiv.dataset.asset_balance);
        valueText = numeral(value).format('$0,0.00');
        percentChange = asset.change24h_USD/100;
        valueChange = value * percentChange;
        valueChangeText = numeral(valueChange).format('$0,0.00');

        // Create the asset value div and append to ticker div
        assetValueDiv = document.createElement('div');
        assetValueDiv.classList.add('text-muted');
        assetValueDiv.textContent = valueText;
        assetTickerDiv.appendChild(assetValueDiv);

        // Create the 24H change div
        assetChangeDiv = document.createElement('small');
        assetChangeDiv.setAttribute('title', 'Change 24h');
        assetChangeDiv.classList.add('font-weight-bold');
        changeText = (percentChange > 0 ? valueChangeText + ' (+' + numeral(percentChange).format('0.00%') + ')' : valueChangeText + ' (' + numeral(percentChange).format('0.00%') + ')');
        assetChangeText = document.createTextNode(changeText);
        assetChangeDiv.appendChild(assetChangeText);

        // Change asset value color depending
        // on % change (if exactly zero, don't add color).
        if (percentChange > 0) {
          assetChangeDiv.classList.add('text-success');
        } else if (percentChange < 0) {
          assetChangeDiv.classList.add('text-danger');
        }

        // Append change div to asset ticker
        assetTickerDiv.appendChild(assetChangeDiv);

        // Make the full ticker div visible
        $(assetTickerDiv).fadeIn();
      }
    });
  }
})();
