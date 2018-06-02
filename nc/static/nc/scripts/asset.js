(function() {
  $(document).ready(function() {
    // Fetch compiled asset prices, vol, etc. from StellarTerm
    // when ready.
    $.when(getTickerAssets())
    .done(function(assets) {
      populateAssetValues(assets);
      populateAssetDetails(assets);
    });
  });

  function populateAssetValues(data) {
    /*
    Use ticker data = { asset.id: asset } to populate asset values
    in USD, XLM and 24h USD percent change.
    */
    // Iterate through all the asset price containers
    $('.asset-ticker').each(function(i, assetTickerDiv) {
      // For each check for an asset in the fetched data
      let asset = data[assetTickerDiv.dataset.asset_id];
      if (asset) {
        // If fetched asset exists, set USD val and % change
        // data as container text.
        let usdValue = asset.price_USD,
            usdPercentChange = asset.change24h_USD/100,
            xlmValue = asset.price_XLM,
            score = asset.activityScore;

        // Set inner content for asset values
        // NOTE: Not using numeral() to format here and
        // trusting Stellar term returned price val for sig figs
        $(assetTickerDiv).find('.asset-price-usd').each(function(i, assetPriceUsd) {
          assetPriceUsd.textContent = numeral(usdValue).format('$0,0.0000');
        });
        $(assetTickerDiv).find('.asset-price-usd-change').each(function(i, assetPriceUsdChange) {
          assetPriceUsdChange.textContent = numeral(usdPercentChange).format('0.00%');
          if (usdPercentChange > 0) {
            assetPriceUsdChange.classList.add('text-success');
          } else if (usdPercentChange < 0) {
            assetPriceUsdChange.classList.add('text-danger');
          }
        });
        $(assetTickerDiv).find('.asset-price-xlm').each(function(i, assetPriceXlm) {
          assetPriceXlm.textContent = xlmValue + ' XLM';
        });
        $(assetTickerDiv).find('.asset-score').each(function(i, assetScore) {
          assetScore.textContent = score;
        });

        // Make the full ticker div visible
        $(assetTickerDiv).fadeIn();
      }
    });

    // Iterate through all the asset score containers
    // $('.asset-score').each(function(i, assetScoreContainer) {
    //
    // });
  }

  function populateAssetDetails(assets) {
    /*
    Use ticker data = { asset.id: asset } to populate asset statistics
    in # trades, 24h volumes, spread, # bids/asks, activity score (credit StellarTerm needed?).
    */

  }
})();
