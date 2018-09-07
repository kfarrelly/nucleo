(function() {
  /* Initialization of Stellar server and asset props */
  var asset, orderbook, accounts,
      buyPrice = 0.0, sellPrice = 0.0,
      server = new StellarSdk.Server(STELLAR_SERVER_URL);

  $(document).ready(function() {
    // Setting the current asset
    if (!IS_NATIVE) {
      asset = new StellarSdk.Asset(ASSET_CODE, ASSET_ISSUER);
    } else {
      asset = StellarSdk.Asset.native();
    }

    // Fetch compiled asset prices, vol, etc. from StellarTerm
    // when ready.
    $.when(getTickerAssets(server, [asset]))
    .done(function(assets) {
      populateAssetValues(assets);
      populateAssetDetails(assets);
    });

    // Fetch authenticated user's holdings of current asset
    getAndPopulateUserHoldings(asset);
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
            var assetPriceUsdChangeTextContent = numeral(usdPercentChange).format('0.00%');
            if (usdPercentChange > 0) {
              assetPriceUsdChange.classList.add('text-success');
              assetPriceUsdChangeTextContent = '+' + assetPriceUsdChangeTextContent;
            } else if (usdPercentChange < 0) {
              assetPriceUsdChange.classList.add('text-danger');
            }
            assetPriceUsdChange.textContent = assetPriceUsdChangeTextContent;
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
            var assetPriceXlmChangeTextContent = numeral(xlmPercentChange).format('0.00%');
            if (xlmPercentChange > 0) {
              assetPriceXlmChangeTextContent = '+' + assetPriceXlmChangeTextContent;
              assetPriceXlmChange.classList.add('text-success');
            } else if (xlmPercentChange < 0) {
              assetPriceXlmChange.classList.add('text-danger');
            }
            assetPriceXlmChange.textContent = assetPriceXlmChangeTextContent;
          }
        });
        if (score) {
          $(assetTickerDiv).find('.btn-asset-score').each(function(i, buttonAssetScore) {
            $(buttonAssetScore).find('.asset-score').each(function(j, assetScore) {
              assetScore.textContent = score;
            })
            $(buttonAssetScore).fadeIn();
          });
        }
        // Store asset price data in all reference currency containers
        $(assetTickerDiv).find('.asset-price-data-usd').each(function(i, assetPriceUsd) {
          assetPriceUsd.dataset.asset_price_usd = usdValue;
        });
        $(assetTickerDiv).find('.asset-price-data-xlm').each(function(i, assetPriceXlm) {
          assetPriceUsd.dataset.asset_price_xlm = xlmValue;
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

  function getAndPopulateUserHoldings(a) {
    /*
    Fetches and populates user's positions in current asset.
    */
    let positionsContainerDiv = $('#positionsContainer')[0];

    // Iterate through all accounts to get balances
    Object.keys(ACCOUNTS).forEach(function(publicKey) {
      $.when(getAccountHoldings(publicKey, a))
      .done(function(balance) {
        if (balance) {
          populateAccountHoldings(publicKey, balance);

          // If at least one account has a balance, make sure display
          // the positions section
          $(positionsContainerDiv).fadeIn();
        }
      });
    });
  }

  function getAccountHoldings(publicKey, a) {
    /*
    Get balance of given asset for account associated with publicKey.

    Returns null if asset not in account.
    */
    return server.loadAccount(publicKey)
    .then(function(acc) {
      // Retrieve the asset balance
      var assetBalance = null;

      // Loop through balances to get the balance for given assets
      acc.balances.forEach(function(balance) {
        if (a.isNative()) {
          if (balance.asset_type == "native") {
            assetBalance = balance.balance;
          }
        } else {
          if (balance.asset_code == a.code && balance.asset_issuer == a.issuer) {
            assetBalance = balance.balance;
          }
        }
      });

      // Return the asset balance
      return assetBalance
    })
    .catch(function(error) {
      console.error('Something went wrong with Stellar call', error);
      return null;
    });
  }

  function populateAccountHoldings(publicKey, balance) {
    /*
    Populate balance of given asset for account associated with publicKey.
    */
    let accountPositionLi = $('#accountPositions').find('li[data-public_key=' + publicKey + ']')[0],
        accountBalanceContainer = $(accountPositionLi).find('.asset-balance')[0],
        assetDisplayDecimals = parseInt(accountPositionLi.dataset.display_decimals);

    // Fill in balance info. Use decimal places.
    var decimalFormat = '';
    for (var i=0; i < assetDisplayDecimals; i++) {
      decimalFormat += '0';
    }
    accountBalanceContainer.textContent = numeral(balance).format('0,0.' + decimalFormat);

    // Make the full li visible
    accountPositionLi.classList.remove('d-none');
    accountPositionLi.classList.add('d-flex');
  }

  if (!IS_NATIVE) {
    $(document).ready(function() {
      // Resetting the buy/sell and manage offer forms
      resetStellarForms();

      // Retrieve orderbook to store for market price calc
      getMarketPrices(asset);

      // Fetch authenticated user's open orders for current asset
      // by clicking more button for account offers
      $('button.offer.more').click();
    });

    /** Initialization of forms **/
    function resetBuySellForms() {
      // Clear out the user input from forms
      let buyForm = $('#buyForm')[0],
          sellForm = $('#sellForm')[0];

      if (buyForm) {
        buyForm.reset();

        // Clear out existing asset available balances
        resetAvailableBalance('buy');
      }

      if (sellForm) {
        sellForm.reset();

        // Clear out existing asset available balances
        resetAvailableBalance('sell');
      }
    };

    function resetCancelOrderModalForm() {
      let cancelOrderModalForm = $('#cancelOrderModalForm')[0];
      if (cancelOrderModalForm) {
        cancelOrderModalForm.reset();
      }
    }

    function resetStellarForms() {
      resetBuySellForms();
      resetCancelOrderModalForm();
    }

    function getMarketPrices(asset) {
      /*
      Fetches market buy/sell prices for asset from Stellar orderbook.
      If orderbook has asks/bids, stores the current market price.

      Returns { 'buy': float, 'sell': float } with float vals corresponding
      to var buyPrice, sellPrice
      */
      // TODO: Set up a listener on the orderbook for updates!
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
    Fetches and populates user's open orders for current asset.
    */
    $('button.offer.more').on('click', function() {
      // Get the more button container to prep for DOM
      // insertion before the div (in the activityList)
      let button = this,
          openOrdersContainerDiv = $('#openOrdersContainer')[0],
          openOrdersList = $('#openOrdersList')[0];

      if (openOrdersList) {
        // Iterate through all accounts to get outstanding offers
        var hasMore = false;
        let accountOfferRequests = Object.keys(ACCOUNTS).map(function(publicKey) {
          if (ACCOUNTS[publicKey].offers.has_more ) {
            let serverCall = ( ACCOUNTS[publicKey].offers.next != null ?
              ACCOUNTS[publicKey].offers.next() : server.offers('accounts', publicKey).order('desc').limit(ACCOUNT_OFFER_LIMIT).call() );
            return serverCall.then(function(offers) {
              // Store the next function and store boolean of has more
              ACCOUNTS[publicKey].offers.has_more = (offers.records.length == ACCOUNT_OFFER_LIMIT);
              ACCOUNTS[publicKey].offers.next = ( ACCOUNTS[publicKey].offers.has_more ? offers.next : null );

              // Keep track of whether any of the accounts has more
              hasMore = hasMore || ACCOUNTS[publicKey].offers.has_more;

              // Filter by orderbook pairs
              return offers.records.filter(function(record) {
                return ( record.buying.asset_type == 'native' && record.selling.asset_code == asset.code && record.selling.asset_issuer == asset.issuer )
                  || ( record.selling.asset_type == 'native' && record.buying.asset_code == asset.code && record.buying.asset_issuer == asset.issuer );
              });
            });
          }
        });

        // Time sort all the offers once returned
        Promise.all(accountOfferRequests)
        .then(function(offersByAccount) {
          // Flatten array of arrays
          return [].concat.apply([], offersByAccount);
        })
        .then(function(offers) {
          // Populate DOM with each offer record
          var orders = $(openOrdersList).find('li').toArray();
          offers.forEach(function(offer) {
            if (offer) {
              orders.push(parseOffer(offer));

              // If at least one outstanding offer exists, make sure display
              // the open orders section
              $(openOrdersContainerDiv).fadeIn();
            }
          });

          // Time sort the entire orders list by last modified time
          orders.sort(function(a, b) {
            // NOTE: Descending order
            return moment(b.dataset.last_modified_time).valueOf() - moment(a.dataset.last_modified_time).valueOf();
          });
          $(openOrdersList).empty().append(orders);
          feather.replace(); // Call this so feather icons populate properly

          // If hasMore is false, no more records left so hide the MORE button
          if (!hasMore) {
            button.classList.add("invisible");
          }
        });
      }
    });

    function parseOffer(offer) {
      /*
      Parse user offer for open orders container.

      Returns DOM element for appending to ul of open orders container.

      e.x.
      <li class="list-group-item flex-column align-items-start" data-last_modified_time="2018-09-01T00:00:00Z">
        <div class="d-flex w-100 justify-content-between">
          <span>Buy <span class="font-weight-bold">1000.01</span> MOBI at a price of <span class="font-weight-bold text-success">0.133</span> XLM</span>
          <span class="text-success" data-feather="trending-up"></span>
        </div>
        <div><small>Third ... (GD22G...4ON6J)</small></div>
        <div><small class="text-muted">15 days ago</small></div>
        <div><button type="button" class="btn btn-link" data-toggle="modal" data-target="#cancelOrderModal" data-public_key="{{ acc.public_key }}" data-offer_id="{{ offer.id }}">
          <small class="text-info">Cancel Order</small>
        </button></div>
      </li>
      */
      let featherIcon = "trending-up",
          action = ( offer.buying.asset_code == asset.code && offer.buying.asset_issuer == asset.issuer ? 'Buy' : 'Sell' ),
          offerType = ( action == 'Buy' ? 'buying' : 'selling' ),
          actionColor = ( action == 'Buy' ? 'text-success' : 'text-danger' ),
          amount = ( offer.offer_type == "Buy" ? String(parseFloat(offer.price) * parseFloat(offer.amount)) : offer.amount ),
          price = ( offer.offer_type == "Buy" ? String(new BigNumber(1).dividedBy(new BigNumber(offer.price).toPrecision(15)).toFixed(7)) : offer.price ),
          accountPublicKey = offer.seller,
          accountPublicKeyText = offer.seller.substring(0, 7) + '...' + offer.seller.substring(offer.seller.length-7),
          accountName = ACCOUNTS[offer.seller].name,
          timeSince = moment(offer.last_modified_time).fromNow();

      // Build the DOM structure
      // Outer li
      var li = document.createElement("li");
      li.setAttribute("class", "list-group-item flex-column align-items-start");
      li.setAttribute("data-last_modified_time", offer.last_modified_time);

      // Order div
      var orderContentDiv = document.createElement("div");
      orderContentDiv.setAttribute("class", "d-flex w-100 justify-content-between");

      // Order description span
      var orderDescriptionSpan = document.createElement("span");
      orderDescriptionSpan.append(document.createTextNode(action + " "));

      // Order amount with description span
      var orderAmountSpan = document.createElement("span");
      orderAmountSpan.setAttribute("class", "font-weight-bold");
      orderAmountSpan.append(document.createTextNode(amount));
      orderDescriptionSpan.append(orderAmountSpan);

      // Order price with description span
      var orderPriceSpan = document.createElement("span");
      orderDescriptionSpan.append(document.createTextNode(" " + asset.code + " at a price of "));
      orderPriceSpan.setAttribute("class", "font-weight-bold " + actionColor);
      orderPriceSpan.append(document.createTextNode(price));
      orderDescriptionSpan.append(orderPriceSpan);
      orderDescriptionSpan.append(document.createTextNode(" XLM"));

      // Trending feather icon
      var orderFeatherIconSpan = document.createElement("span");
      orderFeatherIconSpan.setAttribute("class", actionColor);
      orderFeatherIconSpan.setAttribute("data-feather", featherIcon);

      // Append description and feather icon to content div
      orderContentDiv.append(orderDescriptionSpan);
      orderContentDiv.append(orderFeatherIconSpan);

      // Account div
      var accountContainerDiv = document.createElement("div"),
          accountSmall = document.createElement("small");
      accountContainerDiv.append(accountSmall);
      accountSmall.innerHTML = accountName + " (" + accountPublicKeyText + ")"; // NOTE: this will be safe given django template escaping

      // Time ago div
      var timeAgoContainerDiv = document.createElement("div"),
          timeAgoSmall = document.createElement("small");
      timeAgoContainerDiv.append(timeAgoSmall);
      timeAgoSmall.setAttribute("class", "text-muted");
      timeAgoSmall.append(document.createTextNode(timeSince));

      // Cancel order div
      var cancelOrderContainerDiv = document.createElement("div"),
          cancelOrderButton = document.createElement("button"),
          cancelOrderSmall = document.createElement("small");
      cancelOrderContainerDiv.append(cancelOrderButton);

      cancelOrderButton.setAttribute("type", "button");
      cancelOrderButton.setAttribute("class", "btn btn-sm btn-link m-0 p-0");
      cancelOrderButton.setAttribute("data-toggle", "modal");
      cancelOrderButton.setAttribute("data-target", "#cancelOrderModal");
      cancelOrderButton.setAttribute("data-public_key", accountPublicKey);
      cancelOrderButton.setAttribute("data-offer_id", offer.id);
      cancelOrderButton.setAttribute("data-offer_type", offerType);
      cancelOrderButton.setAttribute("data-offer_price", offer.price);
      cancelOrderButton.append(cancelOrderSmall);

      cancelOrderSmall.setAttribute("class", "text-info");
      cancelOrderSmall.append(document.createTextNode("Cancel Order"));

      // Append order content, account, time ago divs to outer li
      li.append(orderContentDiv);
      li.append(accountContainerDiv);
      li.append(timeAgoContainerDiv);
      li.append(cancelOrderContainerDiv);

      return li;
    }

    /** Bootstrap signStellarModalForm close **/
    $('#cancelOrderModal').on('hidden.bs.modal', function (e) {
      resetCancelOrderModalForm();
    });

    $('#cancelOrderModal').on('show.bs.modal', function (event) {
      // Button that triggered the modal
      let button = $(event.relatedTarget);

      // Extract info from data-* attributes
      let publicKey = button.data('public_key'),
          offerId = button.data('offer_id'),
          offerType = button.data('offer_type'),
          offerPrice = button.data('offer_price');

      // Get modal form content and update the input values
      let modal = $(this),
          form = modal.find('form')[0];

      form.elements["public_key"].value = publicKey;
      form.elements["offer_id"].value = offerId;
      form.elements["offer_type"].value = offerType;
      form.elements["offer_price"].value = offerPrice;
    });

    /** Bootstrap cancelOrderModalForm submission **/
    $('#cancelOrderModalForm').submit(function(event) {
      event.preventDefault();

      // Obtain the modal header to display errors under if POSTings fail
      let modalHeader = $(this).find('.modal-body-header')[0],
          publicKey = this.elements["public_key"].value,
          offerId = this.elements["offer_id"].value,
          offerType = this.elements["offer_type"].value,
          offerPrice = this.elements["offer_price"].value,
          buyingAsset = ( offerType == 'buying' ? asset : StellarSdk.Asset.native() ),
          sellingAsset = ( offerType == 'buying' ? StellarSdk.Asset.native() : asset ),
          ledgerButton = this.elements["ledger"],
          successUrl = this.dataset.success;

      // Attempt to generate Keypair
      var sourceKeys, ledgerEnabled=false;
      if (this.elements["secret_key"].disabled && ledgerButton.classList.contains("active")) {
        // Ledger enabled, so get source keys from public key stored in dataset
        ledgerEnabled = true;
        try {
          sourceKeys = StellarSdk.Keypair.fromPublicKey(ledgerButton.dataset.public_key);
        }
        catch (err) {
          console.error('Keypair generation from Ledger failed', err);
          displayError(modalHeader, 'Keypair generation from Ledger failed. Please plug in and open the Stellar app on your Ledger device. Make sure Browser support in Settings is set to Yes.');
          ledgerButton.click(); // NOTE: click to reset ledger button on failure
          return false;
        }
      } else {
        // Secret key text input
        try {
          sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
        }
        catch (err) {
          console.error('Keypair generation failed', err);
          displayError(modalHeader, 'Keypair generation failed. Please enter a valid secret key.');
          return false;
        }
      }

      // Make sure public address clicked for trust corresponds to sourceKeys.publicKey()
      if (publicKey != sourceKeys.publicKey()) {
        displayError(modalHeader, 'Entered secret key does not match public key of the chosen account. Please enter the valid secret key.');
        return false;
      }

      // If successful on KeyPair generation, load account to prep for manage data transaction
      // Start Ladda animation for UI loading
      let laddaButton = Ladda.create($(this).find(":submit")[0]);
      laddaButton.start();

      // Load account from Horizon server
      server.loadAccount(sourceKeys.publicKey())
      .catch(StellarSdk.NotFoundError, function (error) {
        throw new Error('No Stellar account with that secret key exists yet.');
      })
      // If there was no error, load up-to-date information on your account.
      .then(function(sourceAccount) {
        // Start building the Manage Offer transaction.

        // NOTE: Amount set to 0 deletes the offer
        transaction = new StellarSdk.TransactionBuilder(sourceAccount)
          .addOperation(StellarSdk.Operation.manageOffer({
            'offerId': offerId,
            'buying': buyingAsset,
            'selling': sellingAsset,
            'amount': '0',
            'price': offerPrice,
          }))
          .build();

        if (ledgerEnabled) {
          // Sign the transaction with Ledger to prove you are actually the person sending
          // then submit to Stellar server
          return signAndSubmitTransactionWithStellarLedger(server, transaction);
        } else {
          // Sign the transaction to prove you are actually the person sending it.
          transaction.sign(sourceKeys);

          // And finally, send it off to Stellar! Check for StellarGuard protection.
          if (StellarGuardSdk.hasStellarGuard(sourceAccount)) {
            // Instantiate client side event listener to verify StellarGuard
            // transaction has been authorized
            var es = server.operations().cursor('now').forAccount(sourceAccount.id)
              .stream({
              onmessage: function (op) {
                if (op.source_account == sourceAccount.id && op.type_i == STELLAR_OPERATION_CHANGE_TRUST) {
                  // Close the event stream connection
                  es();

                  // Notify user of successful submission
                  displaySuccess(modalHeader, 'Successfully submitted transaction to the Stellar network.');

                  // Redirect to success url of form
                  window.location.href = successUrl;
                }
              }
            });
            // Then tx submit to StellarGuard
            return StellarGuardSdk.submitTransaction(transaction);
          } else {
            return server.submitTransaction(transaction);
          }
        }
      })
      .then(function(result) {
        if (result.stellarGuard) {
          // From StellarGuard: alert user to go to url to authorize
          let message = 'Please authorize this transaction with StellarGuard.';
          displayWarning(modalHeader, message);
        } else {
          // Notify user of successful submission
          displaySuccess(modalHeader, 'Successfully submitted transaction to the Stellar network.');

          // From Horizon
          // Redirect to success url of form
          window.location.href = successUrl;
        }
      })
      .catch(function(error) {
        // Stop the button loading animation then display the error
        laddaButton.stop();
        console.error('Something went wrong with Stellar call', error);
        displayError(modalHeader, error.message);
        return false;
      });
    });


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

      // Set the estimates in asset code
      $('#buyEstimate').text(numeral(amount).format('0,0.0000000'));

      // Set the USD reference amount
      let usdAmountContainer = $('#buyEstimateUsd')[0];
      var xlmPriceUsd = parseFloat(usdAmountContainer.dataset.asset_price_usd);
      if (xlmPriceUsd) {
        let usdVal = amount * buyPrice * xlmPriceUsd;
        $(usdAmountContainer).text(numeral(usdVal).format('$0,0.0000000'));
      }
    });

    $('#sellAmount').on('input', function(event) {
      let val = event.target.value;

      var amount;
      if (val) {
        amount = val * sellPrice;
      } else {
        amount = 0.0;
      }

      // Set the estimates in XLM
      $('#sellEstimate').text(numeral(amount).format('0,0.0000000'));

      // Set the USD reference amount
      let usdAmountContainer = $('#sellEstimateUsd')[0];
      var xlmPriceUsd = parseFloat(usdAmountContainer.dataset.asset_price_usd);
      if (xlmPriceUsd) {
        let usdVal = amount * xlmPriceUsd;
        $(usdAmountContainer).text(numeral(usdVal).format('$0,0.0000000'));
      }
    });

    /* Reset asset available balance to clear out max amount on respective offer type input */
    function resetAvailableBalance(offerType) {
      if (offerType != 'buy' && offerType != 'sell') {
        return false;
      }

      let amountInput = $('#' + offerType + 'Amount')[0],
          availableBalanceSpan = $('#' + offerType + 'AmountInputAvailable')[0];

      amountInput.setAttribute("max", "");
      availableBalanceSpan.textContent = "";
    }

    // Set event listeners for loading account on buySecretKey/sellSecretKey blur
    // to notify user of balance of relevant asset currently have.
    $('#buySecretKey').on('blur', function(event) {
      if (this.value) {
        var sourceKeys;
        try {
          sourceKeys = StellarSdk.Keypair.fromSecret(this.value);
        }
        catch (err) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('buy');
          return false;
        }

        // Load account from Horizon server
        server.loadAccount(sourceKeys.publicKey())
        .catch(StellarSdk.NotFoundError, function (error) {
          throw new Error('No Stellar account with that secret key exists yet.');
        })
        // If there was no error, load up-to-date information on your account.
        .then(function(sourceAccount) {
          // Retrieve the XLM balance
          var xlmBalance;
          sourceAccount.balances.forEach(function(balance) {
            if (balance.asset_type == "native") {
              xlmBalance = balance.balance;
            }
          });

          // Add balance for XLM to available balance and set the max attribute
          // of amount input
          if (xlmBalance) {
            $('#buyAmount')[0].setAttribute("max", xlmBalance);
            $('#buyAmountInputAvailable')[0].textContent = xlmBalance + ' XLM';
          }
        })
        .catch(function(error) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('buy');
          return false;
        });
      }
    });

    $('#sellSecretKey').on('blur', function(event) {
      if (this.value) {
        var sourceKeys;
        try {
          sourceKeys = StellarSdk.Keypair.fromSecret(this.value);
        }
        catch (err) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('sell');
          return false;
        }

        // Load account from Horizon server
        server.loadAccount(sourceKeys.publicKey())
        .catch(StellarSdk.NotFoundError, function (error) {
          throw new Error('No Stellar account with that secret key exists yet.');
        })
        // If there was no error, load up-to-date information on your account.
        .then(function(sourceAccount) {
          // Retrieve the asset balance
          var assetBalance;
          sourceAccount.balances.forEach(function(balance) {
            if (balance.asset_code == asset.code && balance.asset_issuer == asset.issuer) {
              assetBalance = balance.balance;
            }
          });

          // Add balance for asset to available balance and set the max attribute
          // of amount input
          if (assetBalance) {
            $('#sellAmount')[0].setAttribute("max", assetBalance);
            $('#sellAmountInputAvailable')[0].textContent = assetBalance + ' ' + asset.code;
          }
        })
        .catch(function(error) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('sell');
          return false;
        });
      }
    });

    // Set event listeners for loading account on buyLedger/sellLedger toggle
    // to notify user of balance of relevant asset currently have.
    $('#buyLedger').on('ledger:toggle', function(event) {
      if (this.dataset.public_key != "") {
        var sourceKeys;
        try {
          sourceKeys = StellarSdk.Keypair.fromPublicKey(this.dataset.public_key);
        }
        catch (err) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('buy');
          return false;
        }

        // Load account from Horizon server
        server.loadAccount(sourceKeys.publicKey())
        .catch(StellarSdk.NotFoundError, function (error) {
          throw new Error('No Stellar account with that secret key exists yet.');
        })
        // If there was no error, load up-to-date information on your account.
        .then(function(sourceAccount) {
          // Retrieve the XLM balance
          var xlmBalance;
          sourceAccount.balances.forEach(function(balance) {
            if (balance.asset_type == "native") {
              xlmBalance = balance.balance;
            }
          });

          // Add balance for XLM to available balance and set the max attribute
          // of amount input
          if (xlmBalance) {
            $('#buyAmount')[0].setAttribute("max", xlmBalance);
            $('#buyAmountInputAvailable')[0].textContent = xlmBalance + ' XLM';
          }
        })
        .catch(function(error) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('buy');
          return false;
        });
      } else {
        resetAvailableBalance('buy');
      }
    });

    $('#sellLedger').on('ledger:toggle', function(event) {
      if (this.dataset.public_key != "") {
        var sourceKeys;
        try {
          sourceKeys = StellarSdk.Keypair.fromPublicKey(this.dataset.public_key);
        }
        catch (err) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('sell');
          return false;
        }

        // Load account from Horizon server
        server.loadAccount(sourceKeys.publicKey())
        .catch(StellarSdk.NotFoundError, function (error) {
          throw new Error('No Stellar account with that secret key exists yet.');
        })
        // If there was no error, load up-to-date information on your account.
        .then(function(sourceAccount) {
          // Retrieve the asset balance
          var assetBalance;
          sourceAccount.balances.forEach(function(balance) {
            if (balance.asset_code == asset.code && balance.asset_issuer == asset.issuer) {
              assetBalance = balance.balance;
            }
          });

          // Add balance for asset to available balance and set the max attribute
          // of amount input
          if (assetBalance) {
            $('#sellAmount')[0].setAttribute("max", assetBalance);
            $('#sellAmountInputAvailable')[0].textContent = assetBalance + ' ' + asset.code;
          }
        })
        .catch(function(error) {
          // Clear out existing values for data attribute and available balance span
          sourceKeys = null;
          resetAvailableBalance('sell');
          return false;
        });
      } else {
        resetAvailableBalance('sell');
      }
    });

    // TODO: think about giving cushion to offer price above market price so that guaranteed to execute
    /* Submit Buy Order */
    $('#buyForm').submit(function(event) {
      event.preventDefault();

      // Obtain the form header to display errors under if POSTings fail
      // Also store the success URL
      let formHeader = $(this).find('.form-header')[0],
          ledgerButton = this.elements["ledger"];

      // Attempt to generate Keypair
      var sourceKeys, ledgerEnabled=false;
      if (this.elements["secret_key"].disabled && ledgerButton.classList.contains("active")) {
        // Ledger enabled, so get source keys from public key stored in dataset
        ledgerEnabled = true;
        try {
          sourceKeys = StellarSdk.Keypair.fromPublicKey(ledgerButton.dataset.public_key);
        }
        catch (err) {
          console.error('Keypair generation from Ledger failed', err);
          displayError(formHeader, 'Keypair generation from Ledger failed. Please plug in and open the Stellar app on your Ledger device. Make sure Browser support in Settings is set to Yes.');
          ledgerButton.click(); // NOTE: click to reset ledger button on failure
          return false;
        }
      } else {
        // Secret key text input
        try {
          sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
        }
        catch (err) {
          console.error('Keypair generation failed', err);
          displayError(formHeader, 'Keypair generation failed. Please enter a valid secret key.');
          return false;
        }
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

            if (ledgerEnabled) {
              // Sign the transaction with Ledger to prove you are actually the person sending
              // then submit to Stellar server
              return signAndSubmitTransactionWithStellarLedger(server, transaction);
            } else {
              // Sign the transaction to prove you are actually the person sending it.
              transaction.sign(sourceKeys);

              // And finally, send it off to Stellar! Check for StellarGuard protection.
              if (StellarGuardSdk.hasStellarGuard(sourceAccount)) {
                // Instantiate client side event listener to verify StellarGuard
                // transaction has been authorized
                var es = server.operations().cursor('now').forAccount(sourceAccount.id)
                  .stream({
                  onmessage: function (op) {
                    if (op.source_account == sourceAccount.id && op.type_i == STELLAR_OPERATION_MANAGE_OFFER) {
                      // Close the event stream connection
                      es();

                      // Notify user of successful submission
                      displaySuccess(formHeader, 'Successfully submitted transaction to the Stellar network.');

                      // Submit the tx hash to Nucleo servers to create
                      // activity in user feeds
                      let activityForm = $('#activityForm')[0];
                      activityForm.elements["tx_hash"].value = op.transaction_hash;
                      activityForm.submit();
                    }
                  }
                });
                // Then tx submit to StellarGuard
                return StellarGuardSdk.submitTransaction(transaction);
              } else {
                return server.submitTransaction(transaction);
              }
            }
          })
          .then(function(result) {
            if (result.stellarGuard) {
              // From StellarGuard: alert user to go to url to authorize
              let message = 'Please authorize this transaction with StellarGuard.';
              displayWarning(formHeader, message);
            } else {
              // Notify user of successful submission
              displaySuccess(formHeader, 'Successfully submitted transaction to the Stellar network.');

              // From Horizon
              // Submit the tx hash to Nucleo servers to create
              // activity in user feeds
              let activityForm = $('#activityForm')[0];
              activityForm.elements["tx_hash"].value = result.hash;
              activityForm.submit();
            }
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
          ledgerButton = this.elements["ledger"];

      // Attempt to generate Keypair
      var sourceKeys, ledgerEnabled=false;
      if (this.elements["secret_key"].disabled && ledgerButton.classList.contains("active")) {
        // Ledger enabled, so get source keys from public key stored in dataset
        ledgerEnabled = true;
        try {
          sourceKeys = StellarSdk.Keypair.fromPublicKey(ledgerButton.dataset.public_key);
        }
        catch (err) {
          console.error('Keypair generation from Ledger failed', err);
          displayError(formHeader, 'Keypair generation from Ledger failed. Please plug in and open the Stellar app on your Ledger device. Make sure Browser support in Settings is set to Yes.');
          ledgerButton.click(); // NOTE: click to reset ledger button on failure
          return false;
        }
      } else {
        // Secret key text input
        try {
          sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
        }
        catch (err) {
          console.error('Keypair generation failed', err);
          displayError(formHeader, 'Keypair generation failed. Please enter a valid secret key.');
          return false;
        }
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

            if (ledgerEnabled) {
              // Sign the transaction with Ledger to prove you are actually the person sending
              // then submit to Stellar server
              return signAndSubmitTransactionWithStellarLedger(server, transaction);
            } else {
              // Sign the transaction to prove you are actually the person sending it.
              transaction.sign(sourceKeys);

              // And finally, send it off to Stellar! Check for StellarGuard protection.
              if (StellarGuardSdk.hasStellarGuard(sourceAccount)) {
                // Instantiate client side event listener to verify StellarGuard
                // transaction has been authorized
                var es = server.operations().cursor('now').forAccount(sourceAccount.id)
                  .stream({
                  onmessage: function (op) {
                    if (op.source_account == sourceAccount.id && op.type_i == STELLAR_OPERATION_MANAGE_OFFER) {
                      // Close the event stream connection
                      es();

                      // Notify user of successful submission
                      displaySuccess(formHeader, 'Successfully submitted transaction to the Stellar network.');

                      // Submit the tx hash to Nucleo servers to create
                      // activity in user feeds
                      let activityForm = $('#activityForm')[0];
                      activityForm.elements["tx_hash"].value = op.transaction_hash;
                      activityForm.submit();
                    }
                  }
                });
                // Then tx submit to StellarGuard
                return StellarGuardSdk.submitTransaction(transaction);
              } else {
                return server.submitTransaction(transaction);
              }
            }
          })
          .then(function(result) {
            if (result.stellarGuard) {
              // From StellarGuard: alert user to go to url to authorize
              let message = 'Please authorize this transaction with StellarGuard.';
              displayWarning(formHeader, message);
            } else {
              // Notify user of successful submission
              displaySuccess(formHeader, 'Successfully submitted transaction to the Stellar network.');

              // From Horizon
              // Submit the tx hash to Nucleo servers to create
              // activity in user feeds
              let activityForm = $('#activityForm')[0];
              activityForm.elements["tx_hash"].value = result.hash;
              activityForm.submit();
            }
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
