(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);


  /** Initialization of Stellar forms **/
  function resetStellarForms() {
    // Clear out the user input from forms, the data-* attributes,
    // and any text associated with asset in modal content
    let changeTrustModalForm = $('#changeTrustModalForm')[0];

    // Clear the form
    changeTrustModalForm.reset();

    // Clear the form attributes
    changeTrustModalForm.dataset.asset_code = "";
    changeTrustModalForm.dataset.asset_issuer = "";

    // Clear the text within the form
    $(changeTrustModalForm).find('.modal-asset-code').each(function(i, assetCodeSpan) {
      assetCodeSpan.textContent = "";
    });

    // Hide the add/remove trust prompts
    $('#changeTrustModalAddPrompt').fadeOut();
    $('#changeTrustModalRemovePrompt').fadeOut();
  };

  $(document).ready(function() {
    resetStellarForms();

    // Determine all the assets need info on for this profile
    let requiredAssets = getRelevantAssets();

    // Fetch compiled asset prices, vol, etc. from StellarTerm
    // when ready.
    $.when(getTickerAssets(server, requiredAssets))
    .done(function(assets) {
      populateAssetValues(assets);
    });

    // Initialize the buttons to display
    setDisplayButtonType(CURRENT_DISPLAY);
  });

  // Set event listener to toggle the current top asset button display type
  $('.btn-topassets').on('click', function() {
    toggleDisplayButtonType();
  });

  function setDisplayButtonType(display) {
    /*
    Set the currently showing button type on top asset list to either price (USD/XLM),
    % change (USD/XLM), or activity score.
    */
    if (ALLOWED_DISPLAYS.includes(display)) {
      // Fade out the old class
      let currentDisplayClass = '.btn-' + CURRENT_DISPLAY;
      $(currentDisplayClass).addClass('d-none');

      // Fade in the new class
      let displayClass = '.btn-' + display;
      $(displayClass).removeClass('d-none');

      // Remember the current display type
      CURRENT_DISPLAY = display;
    }
  }

  function toggleDisplayButtonType() {
    /*
    Rotate button type to the next type in allowed displays list.
    */
    let displayIndex = ALLOWED_DISPLAYS.indexOf(CURRENT_DISPLAY),
        newDisplayIndex = (displayIndex + 1) % ALLOWED_DISPLAYS.length,
        newDisplay = ALLOWED_DISPLAYS[newDisplayIndex];
    setDisplayButtonType(newDisplay);
  }

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

  /** Bootstrap changeTrustModalForm close **/
  $('#changeTrustModal').on('hidden.bs.modal', function (e) {
    resetStellarForms();
  });
  /** Bootstrap changeTrustModalForm open **/
  $('#changeTrustModal').on('show.bs.modal', function (event) {
    // Button that triggered the modal
    let button = $(event.relatedTarget);

    // Get modal form content and update the input values
    let modal = $(this),
        form = modal.find('form')[0];

    // Extract info from data-* attributes, and set to form data-* in
    // case submitted.
    form.dataset.asset_code = button.data('asset_code');
    form.dataset.asset_issuer = button.data('asset_issuer');

    // Fill in the asset code in modal content text
    $(form).find('.modal-asset-code').each(function(i, assetCodeSpan) {
      assetCodeSpan.textContent = button.data('asset_code');
    });

    // TODO: form.elements["public_key"].value = publicKey;
    // form.elements["will_trust"].checked = willTrust;
  });

  // Set event listeners for loading account on changeTrustModalSecretKey blur
  // to verify account and determine whether add or removing trust (to display).
  $('#changeTrustModalSecretKey').on('blur', function(event) {
    if (this.value) {
      let form = $('#changeTrustModalForm')[0];
          modalHeader = $('#changeTrustModalForm').find('.modal-body-header')[0];

      var sourceKeys;
      try {
        sourceKeys = StellarSdk.Keypair.fromSecret(this.value);
      }
      catch (err) {
        // Clear out variables and hide all displays
        sourceKeys = null;
        $('#changeTrustModalAddPrompt').fadeOut();
        $('#changeTrustModalRemovePrompt').fadeOut();

        // Display errors
        console.error('Keypair generation failed', err);
        displayError(modalHeader, 'Keypair generation failed. Please enter a valid secret key.');
        return false;
      }

      // Load account from Horizon server
      server.loadAccount(sourceKeys.publicKey())
      .catch(StellarSdk.NotFoundError, function (error) {
        throw new Error('No Stellar account with that secret key exists yet.');
      })
      // If there was no error, load up-to-date information on your account.
      .then(function(sourceAccount) {
        // Determine whether will add or remove trust
        var assetBalance, willTrust = true;
        sourceAccount.balances.forEach(function(balance) {
          if (balance.asset_type != 'native' && balance.asset_code == form.dataset.asset_code
            && balance.asset_issuer == form.dataset.asset_issuer) {
            assetBalance = parseFloat(balance.balance);
          }
        });

        // Can only add trust if not in balances and can only remove trust if
        // balance is zero.
        if (assetBalance > 0.0) {
          // Throw an error that asset balance must be zero to remove trust
          displayError(modalHeader, form.dataset.asset_code + ' asset balance for this Stellar account must be zero to remove trust.');
          return false;
        } else if (assetBalance == 0.0) {
          willTrust = false;
        }

        // Toggle display for appropriate prompts
        if (!willTrust) {
          $('#changeTrustModalAddPrompt').fadeOut();
          $('#changeTrustModalRemovePrompt').fadeIn();
        } else {
          $('#changeTrustModalAddPrompt').fadeIn();
          $('#changeTrustModalRemovePrompt').fadeOut();
        }
      })
      .catch(function(error) {
        // Clear out variables and hide all displays
        sourceKeys = null;
        $('#changeTrustModalAddPrompt').fadeOut();
        $('#changeTrustModalRemovePrompt').fadeOut();

        // Display errors
        console.error('Keypair generation failed', error);
        displayError(modalHeader, 'Keypair generation failed. Please enter a valid secret key.');
        return false;
      });
    } else {
      // Fade out the prompts
      $('#changeTrustModalAddPrompt').fadeOut();
      $('#changeTrustModalRemovePrompt').fadeOut();
    }
  });

  /** Bootstrap signStellarModalForm submission **/
  $('#changeTrustModalForm').submit(function(event) {
    event.preventDefault();

    // Obtain the modal header to display errors under if POSTings fail
    // and fill in asset, willTrust values
    // NOTE: On testnet, change trust will fail if issuer id isn't the same as on mainnet
    let modalHeader = $(this).find('.modal-body-header')[0],
        asset = new StellarSdk.Asset(this.dataset.asset_code, this.dataset.asset_issuer),
        ledgerButton = this.elements["ledger"],
        successUrl = this.dataset.success;

    // Attempt to generate Keypair
    var sourceKeys, ledgerEnabled=false, willTrust=true;
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
      // Start building the Change Trust transaction.

      // Determine whether will add or remove trust
      var assetBalance;
      sourceAccount.balances.forEach(function(balance) {
        if (balance.asset_type != 'native' && balance.asset_code == asset.code
          && balance.asset_issuer == asset.issuer) {
          assetBalance = parseFloat(balance.balance);
        }
      });

      // Can only add trust if not in balances and can only remove trust if
      // balance is zero.
      if (assetBalance > 0.0) {
        // Throw an error that asset balance must be zero to remove trust
        displayError(modalHeader, asset.code + ' asset balance for this Stellar account must be zero to remove trust.');
        return false;
      } else if (assetBalance == 0.0) {
        willTrust = false;
      }

      // MAX limit if user is adding trust. If removing trust, set
      // limit to 0 to remove
      // TODO: Eventually allow user to specify limit
      ops = { 'asset': asset };
      if (!willTrust) {
        ops['limit'] = '0';
      }
      transaction = new StellarSdk.TransactionBuilder(sourceAccount)
        .addOperation(StellarSdk.Operation.changeTrust(ops))
        .build();

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

            // Submit the tx hash to Nucleo servers to create
            // activity in user feeds
            let activityForm = $('#activityForm')[0];
            activityForm.elements["tx_hash"].value = op.transaction_hash;
            activityForm.submit();
          }
        }
      });

      if (ledgerEnabled) {
        // Sign the transaction with Ledger to prove you are actually the person sending
        // then submit to Stellar server
        return signAndSubmitTransactionWithStellarLedger(server, transaction);
      } else {
        // Sign the transaction to prove you are actually the person sending it.
        transaction.sign(sourceKeys);

        // And finally, send it off to Stellar! Check for StellarGuard protection.
        if (StellarGuardSdk.hasStellarGuard(sourceAccount)) {
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
        let message = 'Confirming transaction settlement ...';
        displayWarning(modalHeader, message);
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
})();
