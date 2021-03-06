(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  // Initialization of account search according to:
  // https://www.algolia.com/doc/tutorials/search-ui/instant-search/build-an-instant-search-results-page/instantsearchjs/
  // Use only the accounts index for Send To search
  let modelName = 'Account',
      search = instantsearch({
        appId: ALGOLIA_APPLICATION_ID,
        apiKey: ALGOLIA_INDEX_API_KEYS[modelName],
        indexName: ALGOLIA_INDEX_NAMES[modelName],
        routing: true,
        searchParameters: {
          hitsPerPage: 10
        }
      });

  search.addWidget(
    instantsearch.widgets.searchBox({
      container: '#sendToInput',
      magnifier: false,
      autofocus: false,
    })
  );
  search.addWidget(
    instantsearch.widgets.hits({
      container: '#sendTo' + modelName + 'Hits',
      templates: {
        item: document.getElementById('sendTo' + modelName + 'HitTemplate').innerHTML,
        empty: document.getElementById('sendToEmptyTemplate').innerHTML
      },
    })
  );
  search.addWidget(
    instantsearch.widgets.pagination({
      container: '#sendTo' + modelName + 'Pagination'
    })
  );
  search.start();

  $(document).ready(function() {
    // If query param exists, make sure to show send to results
    let params = (new URL(document.location)).searchParams,
        query = params.get("query");
    if (query) {
      $('#sendToDropdown').removeClass('d-none');
    }
  });

  // Set event listeners for dropdown on send to input
  $('#sendToInput').on('input', function(e) {
    // Get the toggle and the dropdown
    let sendToDropdown = $('#sendToDropdown')[0],
        dropdownIsClosed = sendToDropdown.classList.contains('d-none');

    if (this.value == "" && !dropdownIsClosed) {
      // Hide the search results in dropdown
      sendToDropdown.classList.add('d-none');
    } else if (this.value != "" && dropdownIsClosed) {
      // Show the search results in dropdown
      sendToDropdown.classList.remove('d-none');
    }
  });

  // Set event listeners for when x button on sendTo input is clicked
  $('.ais-search-box--reset').on('click', function(e) {
    $('#sendToDropdown').addClass('d-none');
  });

  /* Reset asset select to clear out all asset options */
  function resetAssetSelect() {

    // Empty options from asset select
    let assetQuery = $('#assetSelect');
    assetQuery.empty();

    // Clear out amount asset code and available balance
    setAmountDisplayAttributes('');

    // Add the Choose ... empty value option
    var assetOption = document.createElement("option");
    assetOption.setAttribute("value", "");
    assetOption.textContent = "Choose...";
    assetQuery[0].add(assetOption);
  }

  /* Set the amount display attributes surrounding amount text input */
  function setAmountDisplayAttributes(assetCode, assetBalance=null) {
    let amountInputAssetCode = $('#amountInputAssetCode')[0],
        amountInputAvailable = $('#amountInputAvailable')[0];

    if (assetBalance) {
      // Set to given values
      amountInputAssetCode.textContent = assetCode;
      amountInputAvailable.textContent = assetBalance + ' ' + assetCode;
    } else {
      // Reset to empty values
      amountInputAssetCode.textContent = '';
      amountInputAvailable.textContent = '';
    }
  }

  // Set event listeners for loading account on Send From blur and associated ledger button
  var sourceKeys, sourceAccount,
      sendFromHeader = $('label[for="sendFromInput"]')[0],
      ledgerEnabled = false;

  $('#sendFromInput').on('blur', function(e) {
    if (this.value) {
      try {
        sourceKeys = StellarSdk.Keypair.fromSecret(this.value);
      }
      catch (err) {
        // Nullify the source variables
        sourceKeys = null;
        sourceAccount = null;

        // Display errors
        console.error('Keypair generation failed', err);
        displayError(sendFromHeader, 'Keypair generation failed. Please enter a valid secret key.', true);
        return false;
      }

      // Load account from Horizon server
      server.loadAccount(sourceKeys.publicKey())
      .catch(StellarSdk.NotFoundError, function (error) {
        throw new Error('No Stellar account with that secret key exists yet.');
      })
      // If there was no error, load up-to-date information on your account.
      .then(function(acc) {
        sourceAccount = acc;

        // Clear any existing options in select box first
        resetAssetSelect();

        // Then add all options from given source account
        let assetSelect = $('#assetSelect')[0];
        sourceAccount.balances.forEach(function(balance) {
          // Populate options in asset select dropdown with asset codes
          var assetOption = document.createElement("option");
          assetOption.setAttribute("data-balance", balance.balance);

          let issuer = (balance.asset_type == "native" ? "" : balance.asset_issuer);
          assetOption.setAttribute("data-issuer", issuer);

          assetOption.text = (balance.asset_type == "native" ? "XLM" : balance.asset_code);
          assetSelect.add(assetOption);
        });
      })
      .catch(function(error) {
        console.error('Something went wrong with Stellar call', error);
        displayError(sendFromHeader, error.message, true);
        return false;
      });
    }
  });

  $('#sendFromLedger').on('ledger:toggle', function(e) {
    let ledgerButton = this;
    if (ledgerButton.dataset.public_key != "") {
      // Ledger enabled, so get source keys from public key stored in dataset
      ledgerEnabled = true;
      try {
        sourceKeys = StellarSdk.Keypair.fromPublicKey(ledgerButton.dataset.public_key);
      }
      catch (err) {
        // Nullify the source variables
        sourceKeys = null;
        sourceAccount = null;
        ledgerEnabled = false;

        // Display errors
        console.error('Keypair generation failed', err);
        displayError(sendFromHeader, 'Keypair generation failed. Please enter a valid secret key.', true);
        ledgerButton.click(); // NOTE: click to reset ledger button on failure
        return false;
      }

      // Load account from Horizon server
      server.loadAccount(sourceKeys.publicKey())
      .catch(StellarSdk.NotFoundError, function (error) {
        throw new Error('No Stellar account with that secret key exists yet.');
      })
      // If there was no error, load up-to-date information on your account.
      .then(function(acc) {
        sourceAccount = acc;

        // Clear any existing options in select box first
        resetAssetSelect();

        // Then add all options from given source account
        let assetSelect = $('#assetSelect')[0];
        sourceAccount.balances.forEach(function(balance) {
          // Populate options in asset select dropdown with asset codes
          var assetOption = document.createElement("option");
          assetOption.setAttribute("data-balance", balance.balance);

          let issuer = (balance.asset_type == "native" ? "" : balance.asset_issuer);
          assetOption.setAttribute("data-issuer", issuer);

          assetOption.text = (balance.asset_type == "native" ? "XLM" : balance.asset_code);
          assetSelect.add(assetOption);
        });
      })
      .catch(function(error) {
        console.error('Something went wrong with Stellar call', error);
        displayError(sendFromHeader, error.message, true);
        return false;
      });
    } else {
      ledgerEnabled = false;
      resetAssetSelect();
    }
  });

  // Event listener for selected asset code upon select to update
  // available balance text + asset code label after amount input
  $('#assetSelect').on('change', function(e) {
    // Asset code next to amount input
    $('#amountInputAssetCode')[0].textContent = this.value;

    // Available balance below amount input
    let selectedOption = this.options[this.selectedIndex];
    $('#amountInputAvailable')[0].textContent = (selectedOption.hasAttribute('data-balance') ? selectedOption.dataset.balance + ' ' + this.value : this.value);

    // Max amount on input set to available balance
    let maxAmount = (selectedOption.hasAttribute('data-balance') ? selectedOption.dataset.balance : '');
    $('#amount')[0].setAttribute('max', maxAmount);
  });

  // Event listener on sendPaymentFormReset button click
  // Simply reload page to clear out fields
  $('#sendPaymentFormReset').on('click', function(event) {
    event.preventDefault();
    location.reload(true);
  });


  // sendPaymentForm submission.
  // TODO: Throw more descriptive error message if token sending has auth restrictions on it
  $('#sendPaymentForm').submit(function(event) {
    event.preventDefault();

    // If haven't stored and retrieved valid sourceAccount from Send From blur
    // event, then need to throw an error
    if (!sourceKeys || !sourceAccount || sourceKeys.publicKey() != sourceAccount.id) {
      displayError(sendFromHeader, 'Keypair generation failed. Please enter a valid secret key.', true);
      return false;
    }

    // Make user's life easier by checking sendToAccountHits to
    // check if only one element in there and then extract address from that IF sendToInput is not
    // a valid public key. Show error if have zero or > 1 elements left in hits
    var receiverKeys;
    let sendToInput = $('#sendToInput')[0],
        sendToAccountHits = $('#sendToAccountHits')[0];
    try {
      // Try to get keypair from search value
      receiverKeys = StellarSdk.Keypair.fromPublicKey(sendToInput.value);
    }
    catch (err) {
      // Check search hits list instead
      let hits = sendToAccountHits.getElementsByClassName('dropdown-item');
      if (hits.length == 0 || hits.length > 1) {
        // Display errors
        displayError(sendFromHeader, 'Invalid number of recipients. Please choose one account to receive payment.', true);
        return false;
      } else {
        receiverKeys = StellarSdk.Keypair.fromPublicKey(hits[0].dataset.public_key);
      }
    }

    // Store the total amount to be sent
    var amount = this.elements["amount"].value;

    // Determine and store the asset to be sent given selectAsset chosen option
    let assetSelect = this.elements["asset"],
        selectedAssetOption = assetSelect.options[assetSelect.selectedIndex];

    var asset;
    if (!selectedAssetOption.dataset.issuer) {
      asset = StellarSdk.Asset.native();
    } else {
      asset = new StellarSdk.Asset(selectedAssetOption.value, selectedAssetOption.dataset.issuer);
    }

    // Get the memo details and check if valid
    let memoContent = this.elements["memo-content"].value;
    if (!isValidMemo(memoContent)) {
      // Display errors
      displayError(sendFromHeader, 'Invalid memo length. Please input a valid memo.', true);
      return false;
    }

    // If successful on KeyPair generation, load account to prep for send payment transaction
    // Start Ladda animation for UI loading
    let laddaButton = Ladda.create($(this).find(":submit")[0]);
    laddaButton.start();

    // Load receiver account to verify it exists and has trust of asset
    server.loadAccount(receiverKeys.publicKey())
    .catch(StellarSdk.NotFoundError, function (error) {
      // TODO: Create account operation instead if this account does not exist?
      throw new Error('No Stellar account with recipient public key exists yet.');
    })
    // If there was no error, load up-to-date information on your account.
    .then(function(receiverAccount) {
      // Throw error if receiver doesn't trust sending asset yet
      if (!asset.isNative()) {
        var trusts = false;
        if (asset.getIssuer() == receiverAccount.accountId()) {
          trusts = true;
        } else {
          for (var i=0; i < receiverAccount.balances.length; i++) {
            let balance = receiverAccount.balances[i];

            if (balance.asset_type != 'native') {
              trusts = trusts || (asset.code == balance.asset_code && asset.issuer == balance.asset_issuer);
            }

            if (trusts) {
              break;
            }
          }
        }
        if (!trusts) {
          throw new Error('Recipient does not trust the sending asset. Choose a different asset to send.');
        }
      }

      // Start building the transaction.
      // TODO: Implement path payments at some point
      // Build the transaction with memo
      transaction = new StellarSdk.TransactionBuilder(sourceAccount)
        .addOperation(StellarSdk.Operation.payment({
          'destination': receiverKeys.publicKey(),
          'asset': asset,
          'amount': amount,
        }))
        .addMemo(StellarSdk.Memo.text(memoContent))
        .build();

      // Instantiate client side event listener to verify
      // transaction has settled.
      var es = server.operations().cursor('now').forAccount(sourceAccount.id)
        .stream({
        onmessage: function (op) {
          if (op.source_account == sourceAccount.id && (op.type_i == STELLAR_OPERATION_PAYMENT || op.type_i == STELLAR_OPERATION_PATH_PAYMENT)) {
            // Close the event stream connection
            es();

            // Notify user of successful submission
            displaySuccess(sendFromHeader, 'Successfully submitted transaction to the Stellar network.', true);

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
        displayWarning(sendFromHeader, message, true);
      } else {
        let message = 'Confirming transaction settlement ...';
        displayWarning(sendFromHeader, message, true);
      }
    })
    .catch(function(error) {
      // Stop the button loading animation then display the error
      laddaButton.stop();
      console.error('Something went wrong with Stellar call', error);
      displayError(sendFromHeader, error.message, true);
      return false;
    });
  });
})();
