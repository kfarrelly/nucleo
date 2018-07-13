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
        // If fetched asset exists, set USD, XLM val and % change
        // data as container text.
        let usdValue = asset.price_USD,
            usdPercentChange = asset.change24h_USD/100,
            xlmValue = asset.price_XLM,
            xlmPercentChange = asset.change24h_XLM/100,
            score = asset.activityScore;

        // Set inner content for asset values
        // NOTE: Not using numeral() to format here and
        // trusting StellarTerm returned price val for sig figs
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

  if (!IS_NATIVE) {
    /* Initialization of Stellar server and asset props */
    var asset, orderbook, buyPrice = 0.0, sellPrice = 0.0,
        server = new StellarSdk.Server(STELLAR_SERVER_URL);

    $(document).ready(function() {
      // Resetting the buy/sell forms
      resetBuySellForms();

      // Setting the current asset and retrieve orderbook to store for market price calc
      asset = new StellarSdk.Asset(ASSET_CODE, ASSET_ISSUER);
      getMarketPrices(asset);
    });

    /** Initialization of forms **/
    function resetBuySellForms() {
      // Clear out the user input from forms
      $('#buyForm')[0].reset();
      $('#sellForm')[0].reset();
    };

    function getMarketPrices(asset) {
      /*
      Fetches market buy/sell prices for asset from Stellar orderbook.
      If orderbook has asks/bids, stores the current market price.

      Returns { 'buy': float, 'sell': float } with float vals corresponding
      to var buyPrice, sellPrice
      */
      // Get the orderbook for the asset
      return server.orderbook(asset, StellarSdk.Asset.native()).call()
      .then(function(data) {
        orderbook = data;
        if (orderbook) {
          // Use the orderbook to refresh market prices
          setMarketPrices(orderbook);
        }
        // Then return market prices
        return { 'buy': buyPrice, 'sell': sellPrice };
      })
      .catch(function(error) {
        // Return the most recently stored buy/sell market prices
        console.error('Something went wrong with Stellar call', error);
        return { 'buy': buyPrice, 'sell': sellPrice };
      });
    }

    /* Store current market prices for asset given orderbook */
    function setMarketPrices(orderbook) {
      // Buy estimate is price of lowest ask and Sell estimate is price of highest bid
      // NOTE: Horizon response orders prices in asc for asks and desc for bids
      buyPrice = (orderbook.asks.length > 0 ? orderbook.asks[0].price : 0.0);
      sellPrice = (orderbook.bids.length > 0 ? orderbook.bids[0].price : 0.0);

      // Display to user in buy/sell forms
      $('#buyPrice').text(numeral(buyPrice).format('0,0.0000000'));
      $('#sellPrice').text(numeral(sellPrice).format('0,0.0000000'));
    }

    /*
    Buy/Sell dropdown toggle so doesn't clock when click form
    NOTE: see https://stackoverflow.com/questions/26639346/prevent-bootstrap-dropdown-from-closing-on-clicks/27759926
    */
    $('.dropup.dropup-buy-sell').on({
        "click": function(event) {
          if ($(event.target).closest('.dropup-buy-sell-toggle').length) {
            $(this).data('closable', true);
          } else {
            $(this).data('closable', false);
          }
        },
        "hide.bs.dropdown": function(event) {
          hide = $(this).data('closable');
          $(this).data('closable', true);
          return hide;
        },
        "hidden.bs.dropdown": function(event) {
          resetBuySellForms();
        }
    });

    /* On input of new buy/sell amount, recalculate received amount of other asset */
    $('#buyAmount').on('input', function(event) {
      let val = event.target.value;

      var amount;
      if (val && buyPrice > 0) {
        // Dividing because buyPrice is in XLM and want asset received amount
        amount = val / buyPrice;
      } else {
        amount = 0.0;
      }

      $('#buyEstimate').text(numeral(amount).format('0,0.0000000'));
    });

    $('#sellAmount').on('input', function(event) {
      let val = event.target.value;

      var amount;
      if (val) {
        // Dividing because buyPrice is in XLM and want asset received amount
        amount = val * sellPrice;
      } else {
        amount = 0.0;
      }

      $('#sellEstimate').text(numeral(amount).format('0,0.0000000'));
    });

    /* Submit Buy Order */
    $('#buyForm').submit(function(event) {
      event.preventDefault();

      // Obtain the form header to display errors under if POSTings fail
      // Also store the success URL
      let formHeader = $(this).find('.form-header')[0],
          successUrl = this.dataset.success;

      // Attempt to generate Keypair
      var sourceKeys;
      try {
        sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
      }
      catch (err) {
        console.error('Keypair generation failed', err);
        displayError(formHeader, 'Keypair generation failed. Please enter a valid secret key.');
        return false;
      }

      // Store the user inputted asset amount to buy and throw error if
      // amount doesn't exist
      let amount = parseFloat(this.elements["amount"].value);
      if (!amount || amount <= 0.0) {
        console.error('Invalid amount', err);
        displayError(formHeader, 'Invalid amount. Must be greater than zero.');
        return false;
      }

      // If successful on KeyPair generation, load account to prep for manage data transaction
      // Start Ladda animation for UI loading
      let laddaButton = Ladda.create($(this).find(":submit")[0]);
      laddaButton.start();

      // Refetch orderbook to get the buy price and make sure it is non-zero.
      // If zero, means there are no asks out there.
      getMarketPrices(asset)
      .then(function(prices) {
        let buy = prices.buy;
        if (buy > 0.0) {
          // Load account from Horizon server
          server.loadAccount(sourceKeys.publicKey())
          .catch(StellarSdk.NotFoundError, function (error) {
            throw new Error('No Stellar account with that secret key exists yet.');
          })
          // If there was no error, load up-to-date information on your account.
          .then(function(sourceAccount) {
            // Determine min balance for this account in XLM
            let minBalance = getMinBalance(sourceAccount),
                txFee = getTxFee(1); // only one offer operation will be used for this tx

            // Check account has enough funds to buy this asset
            var sufficient = false;
            var trusted = false;
            sourceAccount.balances.forEach(function(element) {
              if (element.asset_type == 'native') {
                sufficient = ( parseFloat(element.balance) - (txFee + minBalance) >= amount );
              } else if (element.asset_code == asset.code && element.asset_issuer == asset.issuer) {
                trusted = true;
              }
            });

            if (!trusted) {
              throw new Error('An asset must be trusted before it can be traded.');
            }

            if (!sufficient) {
              throw new Error('Insufficient funds to process this trade');
            }

            // Determine needed offer price given current orderbook ask amounts
            // NOTE: Offers are limit so if existing offer on orderbook crosses this buy offer,
            // it will fill at EXISTING order's price: https://www.stellar.org/developers/guides/concepts/exchange.html
            var bidOfferPrice, sumExistingAskTotal = 0.0;
            for (var i=0; i < orderbook.asks.length; i++) {
              // amount is in xlm versus ask.amount is in asset so use
              // current ask price (xlm/asset) to convert to xlm amount
              sumExistingAskTotal += orderbook.asks[i].price * orderbook.asks[i].amount;
              if (sumExistingAskTotal >= amount) {
                // Then this is the last existing offer we need to look at.
                // Use it's price, to determine the amount of our new bid offer
                bidOfferPrice = orderbook.asks[i].price;
                break;
              }
            }

            // Throw error if never met the ask sum threshold
            if (!bidOfferPrice) {
              throw new Error("There aren't enough sellers of this asset for the given amount");
            }

            // Need to round down to seven digits for amount, price
            // See: https://github.com/stellarterm/stellarterm/blob/bd9f81a0cae83a51a99d5bac356a58168c519ff4/src/lib/MagicSpoon.js
            bidOfferPrice = new BigNumber(bidOfferPrice).toPrecision(15);
            let sdkPrice = new BigNumber(1).dividedBy(bidOfferPrice),
                sdkAmount = new BigNumber(amount).toFixed(7);

            // Put in the offer to SDEX
            // Start building the transaction.
            transaction = new StellarSdk.TransactionBuilder(sourceAccount)
              .addOperation(StellarSdk.Operation.manageOffer({
                'selling': StellarSdk.Asset.native(),
                'buying': asset,
                'amount': String(sdkAmount),
                'price': String(sdkPrice),
                'offerId': 0, // 0 for new offer
              }))
              .build();
            // Sign the transaction to prove you are actually the person sending it.
            transaction.sign(sourceKeys);

            // And finally, send it off to Stellar!
            return server.submitTransaction(transaction);
          })
          .then(function(result) {
            // Then redirect to the user's profile page with successUrl
            window.location.href = successUrl;
          })
          .catch(function(error) {
            // Stop the button loading animation then display the error
            laddaButton.stop();
            console.error('Something went wrong with Stellar call', error);
            displayError(formHeader, error.message);
            return false;
          });
        } else {
          throw new Error('There are currently no sellers of this asset.');
        }
      })
      .catch(function(error) {
        // Stop the button loading animation then display the error
        laddaButton.stop();
        console.error('Something went wrong with Stellar call', error);
        displayError(formHeader, error.message);
        return false;
      });
    });

    $('#sellForm').submit(function(event) {
      event.preventDefault();

      // Obtain the form header to display errors under if POSTings fail
      // Also store the success URL
      let formHeader = $(this).find('.form-header')[0],
          successUrl = this.dataset.success;

      // Attempt to generate Keypair
      var sourceKeys;
      try {
        sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
      }
      catch (err) {
        console.error('Keypair generation failed', err);
        displayError(formHeader, 'Keypair generation failed. Please enter a valid secret key.');
        return false;
      }

      // Store the user inputted asset amount to buy and throw error if
      // amount doesn't exist
      let amount = parseFloat(this.elements["amount"].value);
      if (!amount || amount <= 0.0) {
        console.error('Invalid amount', err);
        displayError(formHeader, 'Invalid amount. Must be greater than zero.');
        return false;
      }

      // If successful on KeyPair generation, load account to prep for manage data transaction
      // Start Ladda animation for UI loading
      let laddaButton = Ladda.create($(this).find(":submit")[0]);
      laddaButton.start();

      // Refetch orderbook to get the sell price and make sure it is non-zero.
      // If zero, means there are no bids out there.
      getMarketPrices(asset)
      .then(function(prices) {
        let sell = prices.sell;
        if (sell > 0.0) {
          // Load account from Horizon server
          server.loadAccount(sourceKeys.publicKey())
          .catch(StellarSdk.NotFoundError, function (error) {
            throw new Error('No Stellar account with that secret key exists yet.');
          })
          // If there was no error, load up-to-date information on your account.
          .then(function(sourceAccount) {
            // Determine needed offer price given current orderbook bid amounts
            // NOTE: Offers are limit so if existing offer on orderbook crosses this sell offer,
            // it will fill at EXISTING order's price: https://www.stellar.org/developers/guides/concepts/exchange.html
            var askOfferPrice, sumExistingBidTotal = 0.0;
            for (var i=0; i < orderbook.bids.length; i++) {
              // amount is in asset versus bid.amount is in XLM so use
              // current bid price (xlm/asset) to convert to asset amount
              sumExistingBidTotal += orderbook.bids[i].amount / orderbook.bids[i].price;
              if (sumExistingBidTotal >= amount) {
                // Then this is the last existing offer we need to look at.
                // Use it's price, to determine the amount of our new ask offer
                askOfferPrice = orderbook.bids[i].price;
                break;
              }
            }

            // Throw error if never met the ask sum threshold
            if (!askOfferPrice) {
              throw new Error("There aren't enough buyers of this asset for the given amount");
            }

            // Determine min balance for this account in XLM
            let minBalance = getMinBalance(sourceAccount),
                txFee = getTxFee(1); // only one offer operation will be used for this tx

            // Check account has enough funds to buy this asset
            var sufficient = false, trusted = false, xlmBalance = 0.0;
            sourceAccount.balances.forEach(function(element) {
              if (element.asset_type == 'native') {
                xlmBalance = parseFloat(element.balance);
              } else if (element.asset_code == asset.code && element.asset_issuer == asset.issuer) {
                trusted = true;
                sufficient = ( parseFloat(element.balance) >= amount );
              }
            });

            if (!trusted) {
              throw new Error('An asset must be trusted before it can be traded.');
            }

            // Account for tx/min balance fees here in sufficient.
            // Use ask offer price (xlm/asset) to convert amount (asset) to lumens
            sufficient = sufficient && ((xlmBalance + askOfferPrice * amount) >= (txFee + minBalance));
            if (!sufficient) {
              throw new Error('Insufficient funds to process this trade');
            }

            // Need to round down to seven digits for amount, price
            // See: https://github.com/stellarterm/stellarterm/blob/bd9f81a0cae83a51a99d5bac356a58168c519ff4/src/lib/MagicSpoon.js
            askOfferPrice = new BigNumber(askOfferPrice).toPrecision(15);
            let sdkPrice = new BigNumber(askOfferPrice).toFixed(7),
                sdkAmount = new BigNumber(amount).toFixed(7);

            // Put in the offer to SDEX
            // Start building the transaction.
            transaction = new StellarSdk.TransactionBuilder(sourceAccount)
              .addOperation(StellarSdk.Operation.manageOffer({
                'selling': asset,
                'buying': StellarSdk.Asset.native(),
                'amount': String(sdkAmount),
                'price': String(sdkPrice),
                'offerId': 0, // 0 for new offer
              }))
              .build();
            // Sign the transaction to prove you are actually the person sending it.
            transaction.sign(sourceKeys);

            // And finally, send it off to Stellar!
            return server.submitTransaction(transaction);
          })
          .then(function(result) {
            // Then redirect to the user's profile page with successUrl
            window.location.href = successUrl;
          })
          .catch(function(error) {
            // Stop the button loading animation then display the error
            laddaButton.stop();
            console.error('Something went wrong with Stellar call', error);
            displayError(formHeader, error.message);
            return false;
          });
        } else {
          throw new Error('There are currently no buyers of this asset.');
        }
      })
      .catch(function(error) {
        // Stop the button loading animation then display the error
        laddaButton.stop();
        console.error('Something went wrong with Stellar call', error);
        displayError(formHeader, error.message);
        return false;
      });
    });
  }
})();
