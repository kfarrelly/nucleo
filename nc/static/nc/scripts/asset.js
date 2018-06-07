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
            xlmPercentChange = asset.change24h_XLM/100,
            score = asset.activityScore;

        // Set inner content for asset values
        // NOTE: Not using numeral() to format here and
        // trusting Stellar term returned price val for sig figs
        $(assetTickerDiv).find('.asset-price-usd').each(function(i, assetPriceUsd) {
          if (usdValue) {
            assetPriceUsd.textContent = numeral(usdValue).format('$0,0.0000');
          }
        });
        $(assetTickerDiv).find('.asset-price-usd-change').each(function(i, assetPriceUsdChange) {
          if (usdPercentChange) {
            assetPriceUsdChange.textContent = numeral(usdPercentChange).format('0.00%');
            if (usdPercentChange > 0) {
              assetPriceUsdChange.classList.add('text-success');
            } else if (usdPercentChange < 0) {
              assetPriceUsdChange.classList.add('text-danger');
            }
          }
        });
        $(assetTickerDiv).find('.asset-price-xlm').each(function(i, assetPriceXlm) {
          // NOTE: check if xlmValue is even there given some assets mirror XLM (and don't give this attr)
          if (xlmValue) {
            assetPriceXlm.textContent = xlmValue + ' XLM';
          }
        });
        $(assetTickerDiv).find('.asset-price-xlm-change').each(function(i, assetPriceXlmChange) {
          if (xlmPercentChange) {
            assetPriceXlmChange.textContent = numeral(xlmPercentChange).format('0.00%');
            if (xlmPercentChange > 0) {
              assetPriceXlmChange.classList.add('text-success');
            } else if (xlmPercentChange < 0) {
              assetPriceXlmChange.classList.add('text-danger');
            }
          }
        });
        $(assetTickerDiv).find('.asset-score').each(function(i, assetScore) {
          assetScore.textContent = score;
        });

        // Make the full ticker div visible
        $(assetTickerDiv).fadeIn();
      }
    });
  }

  function populateAssetDetails(assets) {
    /*
    Use ticker data = { asset.id: asset } to populate asset statistics
    in # trades, 24h volumes, spread, # bids/asks, activity score (credit StellarTerm needed?).
    */
    let assetMetricsList = $('#assetMetricsList')[0],
        asset = assets[assetMetricsList.dataset.asset_id];

    if (asset) {
      // Trade Metrics li components
      let keysToList = {
        'numTrades24h': 'Number Of Trades (24h)',
        'volume24h_XLM': 'Total Trade Volume (24h)',
        'spread': 'Spread',
        'numBids': 'Number Of Outstanding Bids',
        'numAsks': 'Number Of Outstanding Asks',
        'depth10_XLM': 'Market Depth (10%)',
      },
      keysUnits = {
        'volume24h_XLM': ' XLM',
        'depth10_XLM': ' XLM',
      },
      keysNumbers = [ 'numTrades24h', 'numBids', 'numAsks' ],
      keysPercentages = [ 'spread' ],
      keysAmounts = [ 'volume24h_XLM', 'depth10_XLM' ];

      for (k in keysToList) {
        if (k in asset) {
          let li = document.createElement('li'),
              keyContainer = document.createElement('span'),
              valueContainer = document.createElement('strong');

          // Assemble the li with k, v list pairs
          li.setAttribute('class', 'list-group-item d-flex justify-content-between align-items-center');
          keyContainer.textContent = keysToList[k];

          // Format the number value
          let valueUnitText = (k in keysUnits ? keysUnits[k] : "");
          var valueNumberFormat;
          if (keysAmounts.includes(k)) {
            valueNumberFormat = '0,0.00';
          } else if (keysPercentages.includes(k)) {
            valueNumberFormat = '0.00%';
          } else {
            valueNumberFormat = '0,0';
          }
          valueContainer.textContent = numeral(asset[k]).format(valueNumberFormat) + valueUnitText;

          // Append containers
          li.appendChild(keyContainer);
          li.appendChild(valueContainer);
          assetMetricsList.append(li);
        }
      }
    }
  }
})();
