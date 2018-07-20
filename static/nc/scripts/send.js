(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  // Initialization of account search according to:
  // https://www.algolia.com/doc/tutorials/search-ui/instant-search/build-an-instant-search-results-page/instantsearchjs/
  // Use only the accounts index for Send To search
  let modelName = 'Account',
      search = instantsearch({
        appId: ALGOLIA_APPLICATION_ID,
        apiKey: ALGOLIA_SEARCH_API_KEY,
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

  // Set event listeners for loading account on Send From blur
  var sourceKeys, sourceAccount, sendFromHeader = $('label[for="sendFromInput"]')[0];
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

  // Event listeners for Memo Type select to show memo text input if type is not None
  $('#memoTypeSelect').on('change', function(e) {
    if (this.value != 'None') {
      // Change the placeholder to fit the memo type selected
      $('#memoContent')[0].setAttribute('placeholder', this.options[this.selectedIndex].dataset.memo_placeholder);

      // Show memo content input
      $('#memoContentFormGroup').show();
    } else {
      // Hide and clear out memo content input
      $('#memoContentFormGroup').hide();
      $('#memoContent')[0].value = "";
    }
  });

  // TODO: Event listener on memo content so user doesn't go above max number of characters?


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

    // Get the memo details
    let memoType = this.elements["memo-type"].value,
        memoContent = this.elements["memo-content"].value;

    // If successful on KeyPair generation, load account to prep for send payment transaction
    // Start Ladda animation for UI loading
    let laddaButton = Ladda.create($(this).find(":submit")[0]);
    laddaButton.start();

    // Load receiver account to verify it exists and has trust of asset
    server.loadAccount(receiverKeys.publicKey())
    .catch(StellarSdk.NotFoundError, function (error) {
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
      // Organize the memo information first
      let memoMap = {
        'None': StellarSdk.Memo.none,
        'Memo ID': StellarSdk.Memo.id,
        'Memo Text': StellarSdk.Memo.text,
        'Memo Hash': StellarSdk.Memo.hash,
        'Memo Return': StellarSdk.Memo.return
      },
          memo = (memoType == 'None' ? memoMap[memoType]() : memoMap[memoType](memoContent));

      // TODO: throw error if memo isn't correct. use memoErrorMap dict?

      // Build the transaction with memo
      transaction = new StellarSdk.TransactionBuilder(sourceAccount)
        .addOperation(StellarSdk.Operation.payment({
          'destination': receiverKeys.publicKey(),
          'asset': asset,
          'amount': amount,
        }))
        .addMemo(memo)
        .build();
      // Sign the transaction to prove you are actually the person sending it.
      transaction.sign(sourceKeys);
      // And finally, send it off to Stellar!
      return server.submitTransaction(transaction);
    })
    .then(function(result) {
      // Submit the tx hash to Nucleo servers to create sent payment
      // activity in user feeds
      let activityForm = $('#activityForm')[0];
      activityForm.elements["tx_hash"].value = result.hash;
      activityForm.submit();
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
