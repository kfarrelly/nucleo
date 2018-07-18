(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  $(document).ready(function() {
    // Fetch compiled asset prices, vol, etc. from StellarTerm
    // when ready.
    $.when(getTickerAssets())
    .done(function(assets) {
      populateAssetValues(assets);
    });
  });

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
        changeText = valueChangeText + ' (' + numeral(percentChange).format('0.00%') + ')';
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

  if (IS_CURRENT_USER) {
    /* Adding/Creating Stellar Account Functions */
    var createStellarKeypair = null;

    /** Initialization of forms **/
    function resetStellarForms() {
      // Clear out the user input from forms
      $('#addStellarModalForm')[0].reset();
      $('#addStellarPublicKeyForm')[0].reset();
      $('#issueStellarModalForm')[0].reset(); // TODO: FIX: if don't have min # accts, this form won't be on html template

      // Remove any randomly generated keypair data for new account
      createStellarKeypair = null;
      $('#createStellarModalPublicKey').empty();
      $('#createStellarModalSecretKey').empty();
    };

    $(document).ready(function() {
      // If IS_CURRENT_USER, add to document ready
      // resetting the Stellar create/add account forms
      resetStellarForms();
    });

    /** Bootstrap createStellarModalForm open **/
    $('#createStellarModal').on('show.bs.modal', function (e) {
      // Generate a new keypair
      createStellarKeypair = StellarSdk.Keypair.random();

      // Create needed text nodes and show keypair to user
      $('#createStellarModalPublicKey')[0].append(
        document.createTextNode(createStellarKeypair.publicKey())
      );
      $('#createStellarModalSecretKey').append(
        document.createTextNode(createStellarKeypair.secret())
      );
    });

    /** Bootstrap createStellarModalForm close **/
    $('#createStellarModal').on('hidden.bs.modal', function (e) {
      // Clear out forms
      resetStellarForms();
    });

    /** Bootstrap addStellarModalForm close **/
    $('#addStellarModal').on('hidden.bs.modal', function (e) {
      // Clear out forms
      resetStellarForms();
    });

    /** Bootstrap issueStellarModalForm close **/
    $('#issueStellarModal').on('hidden.bs.modal', function (e) {
      // Clear out forms
      resetStellarForms();
    });

    /** Bootstrap createStellarModalForm submission **/
    $('#createStellarModalForm').submit(function(event) {
      event.preventDefault();

      // Start Ladda animation for UI loading
      let laddaButton = Ladda.create($(this).find(":submit")[0]);
      laddaButton.start();

      // Submit the public key to Nucleo servers to verify account
      let publicKeyForm = $('#addStellarPublicKeyForm')[0];
      publicKeyForm.elements["public_key"].value = createStellarKeypair.publicKey();
      publicKeyForm.elements["creating_stellar"].checked = true;
      publicKeyForm.submit();
    });

    /** Bootstrap addStellarModalForm submission **/
    $('#addStellarModalForm').submit(function(event) {
      event.preventDefault();

      // Assign the signed user value to a variable to transmit later
      // Obtain the modal header to display errors under if POSTings fail
      let signedUser = this.elements["signed_user"].value,
          modalHeader = $(this).find('.modal-body-header')[0];

      // Attempt to generate Keypair
      var sourceKeys;
      try {
        sourceKeys = StellarSdk.Keypair.fromSecret(this.elements["secret_key"].value);
      }
      catch (err) {
        console.error('Keypair generation failed', err);
        displayError(modalHeader, 'Keypair generation failed. Please enter a valid secret key.');
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
        // Start building the transaction.
        transaction = new StellarSdk.TransactionBuilder(sourceAccount)
          .addOperation(StellarSdk.Operation.manageData({
            'name': STELLAR_DATA_VERIFICATION_KEY,
            'value': signedUser,
          }))
          // A memo allows you to add your own metadata to a transaction. It's
          // optional and does not affect how Stellar treats the transaction.
          .addMemo(StellarSdk.Memo.text('Nucleo Account Verification'))
          .build();
        // Sign the transaction to prove you are actually the person sending it.
        transaction.sign(sourceKeys);
        // And finally, send it off to Stellar!
        return server.submitTransaction(transaction);
      })
      .then(function(result) {
        // Submit the public key to Nucleo servers to verify account
        let publicKeyForm = $('#addStellarPublicKeyForm')[0];
        publicKeyForm.elements["public_key"].value = sourceKeys.publicKey();
        publicKeyForm.elements["creating_stellar"].checked = false;
        publicKeyForm.submit();
      })
      .catch(function(error) {
        // Stop the button loading animation then display the error
        laddaButton.stop();
        console.error('Something went wrong with Stellar call', error);
        displayError(modalHeader, error.message);
        return false;
      });
    });

    /** addStellarPublicKeyForm submission to Nucleo **/
    $('#addStellarPublicKeyForm').submit(function(event) {
      event.preventDefault();

      // Grab the public_key data from the form
      let formData = new FormData(this),
          successUrl = this.dataset.success,
          adding = (successUrl != "");

      // Submit it to Nucleo's create account endpoint
      $.post(this.action, formData)
      .then(function(result) {
        // Then redirect to the user's profile page with successUrl
        window.location.href = successUrl;
      })
      .catch(function(error) {
        // Fail response gives form.errors. Make sure to show in error form
        let modalHeader = (adding ? $("#addStellarModalForm").find('.modal-body-header')[0] : $("#createStellarModalHeader")[0]);

        // Stop the button loading animation then display the error
        Ladda.stopAll();
        console.error('Something went wrong with Nucleo call', error);
        displayError(modalHeader, error.message);
      });
    })
  }

  /** Bootstrap issueStellarModalForm submission **/
  $('#issueStellarModalForm').submit(function(event) {
    event.preventDefault();

    // Obtain the modal header to display errors under if POSTings fail
    let modalHeader = $(this).find('.modal-body-header')[0];

    // Attempt to generate Keypairs
    var issuingKeys, distributionKeys;
    try {
      issuingKeys = StellarSdk.Keypair.fromSecret(this.elements["issuer_secret_key"].value);
    }
    catch (err) {
      console.error('Keypair generation failed', err);
      displayError(modalHeader, 'Keypair generation failed for the issuing account. Please enter a valid secret key.');
      return false;
    }
    try {
      distributionKeys = StellarSdk.Keypair.fromSecret(this.elements["distributer_secret_key"].value);
    }
    catch (err) {
      console.error('Keypair generation failed', err);
      displayError(modalHeader, 'Keypair generation failed for the distribution account. Please enter a valid secret key.');
      return false;
    }

    // Check that both issuing and distribution accounts have been associated with Nucleo db
    // and they aren't the same.
    let userAccountPublicKeys = getUserAccountPublicKeys();
    if (!userAccountPublicKeys.includes(issuingKeys.publicKey()) || !userAccountPublicKeys.includes(distributionKeys.publicKey())) {
      displayError(modalHeader, 'Both distribution and issuing accounts must be associated with your user profile.');
      return false;
    } else if (issuingKeys.publicKey() == distributionKeys.publicKey()) {
      displayError(modalHeader, 'Your distribution account must be different than your issuing account.');
      return false;
    }

    // Store the user inputted asset detail values and the success redirect URL
    let tokenCode = this.elements["token_code"].value,
        numberOfTokens = this.elements["token_number"].value,
        issuerHomeDomain = this.elements["issuer_domain"].value;

    // If successful on KeyPair generation, load account to prep for manage data transaction
    // Start Ladda animation for UI loading
    let laddaButton = Ladda.create($(this).find(":submit")[0]);
    laddaButton.start();

    // Load distribution then issuing account from Horizon server
    server.loadAccount(distributionKeys.publicKey())
    .catch(StellarSdk.NotFoundError, function (error) {
      throw new Error('No Stellar account with the distribution secret key exists yet.');
    })
    .then(function(distributionAccount) {
      server.loadAccount(issuingKeys.publicKey())
      .catch(StellarSdk.NotFoundError, function (error) {
        throw new Error('No Stellar account with the issuing secret key exists yet.');
      })
      // If there was no error, load up-to-date information on your account.
      .then(function(issuingAccount) {
        // Create the asset
        var asset = new StellarSdk.Asset(tokenCode, issuingKeys.publicKey())

        // Start building the transaction.
        transaction = new StellarSdk.TransactionBuilder(issuingAccount)
          .addOperation(StellarSdk.Operation.changeTrust({
            'asset': asset,
            'limit': numberOfTokens,
            'source': distributionKeys.publicKey(),
          }))
          .addOperation(StellarSdk.Operation.payment({
            'destination': distributionKeys.publicKey(),
            'asset': asset,
            'amount': numberOfTokens,
          }))
          .addOperation(StellarSdk.Operation.setOptions({
            'homeDomain': issuerHomeDomain,
          }))
          .build();
        // Sign the transaction to prove you are actually the person sending it.
        transaction.sign(issuingKeys, distributionKeys);
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
        displayError(modalHeader, error.message);
        return false;
      });
    })
    .catch(function(error) {
      // Stop the button loading animation then display the error
      laddaButton.stop();
      console.error('Something went wrong with Stellar call', error);
      displayError(modalHeader, error.message);
      return false;
    });
  });

  /* Loading of operations for each Stellar account collapsable panel */
  /** Initialization of operations occurs when a panel is first clicked by user **/
  $('.collapse.account').on('show.bs.collapse', function() {
    // Get the more button
    let button = $(this.dataset.more)[0];

    // If both next, previous Stellar transaction pages are empty,
    // the user must be clicking the account panel for first time.
    if (button.dataset.cursor == "") {
      // Load the first batch of operations by clicking the "more" button
      button.click();
    }
  });

  /* Gets user account public keys this user has already associated */
  function getUserAccountPublicKeys() {
    var keys = [];
    $('button.account.more').each(function(i, button){
      keys.push(button.dataset.public_key);
    });
    return keys;
  }

  /** Load more operations when the MORE button for account is clicked **/
  $('button.account.more').on('click', function() {
    // Get the more button container to prep for DOM
    // insertion before the div (in the activityList)
    let button = this;

    // If data-has_more has been set to "false", MORE button is at the end
    // of all records from Horizon, so don't bother fetching
    if (button.dataset.has_more == "true") {
      // Only load more if records left
      var moreContainerQuery = $(button.dataset.parent);

      // Hit the Nucleo /account/<public_key>/operation/ endpoint with
      // GET call
      var params = { 'order': 'desc' };
      if (button.dataset.cursor != "") {
        params['cursor'] = button.dataset.cursor;
      }
      let url = button.dataset.url + '?' + $.param(params);

      $.get(url)
      .then(function(resp) {
        // Resp Json has key, vals:
        // 'object': {'name': account.name, 'public_key': account.public_key },
        // 'records': Json page.records from Horizons call
        // 'accounts': mappings from Nucleo's db ... { 'public_key': { 'username': nucleo_user.username, 'href': nucleo_user_profile_link } }
        // 'cursor': String or null ... cursor for next page (determined from _links: next in Horizon resp)
        // 'has_more': Boolean ... true if there are more records that can be fetched
        let accountPublicKey = resp.object.public_key,
            accounts = resp.accounts;

        // Iterate through operation records parsing and appropriately formatting
        // the DOM object to add into activityList (before MORE button)
        var ops = [];
        resp.records.forEach(function(record) {
          ops.push(parseOperation(record, accountPublicKey, accounts));
        });
        moreContainerQuery.before(ops);
        feather.replace() // Call this so feather icons populate properly

        // If has_more is false, no more records left so hide the MORE button
        button.setAttribute('data-cursor', resp.cursor);
        button.setAttribute('data-has_more', String(resp.has_more));
        if (!resp.has_more) {
          button.classList.add("invisible");
        }
      })
      .catch(function (err) {
        console.error('Unable to load operations from the Stellar network', err);
      });
    }
  })

  /** Parse operation record and format appropriately for recent activity **/
  // NOTE: https://github.com/stellar/stellar-core/blob/master/src/xdr/Stellar-transaction.x
  function parseOperation(op, publicKey, accounts) {
    // Returns DOM element for insertion into activityList before MORE button
    // EXAMPLE:
    // <li class="list-group-item flex-column align-items-start">
    //  <div class="d-flex w-100 justify-content-between">
    //    <span>Received 100 XLM from GDVJC...FUTAQ</span>
    //    <span data-feather="send"></span>
    //   </div>
    //  <div><small class="text-muted">15 days ago</small></div>
    //  <div><small>Tx #: <a href="https://horizon-testnet.stellar.org/transactions/bfaf2287695c651747e635ca7e03698ba44611ed9a6b919bd1db9727a0b6dfda" class="text-info" title="Stellar Transaction Hash" target="_blank">bfaf221...0b6dfda</a></small></div>
    // </li>

    // From op, NEED: descriptionSpan (text, username links, etc.),
    // featherIcon, timeSince, txHref, txHash
    var timeSince = moment(op.created_at).fromNow();
        txHash = op.transaction_hash.substring(0, 7) + '...' + op.transaction_hash.substring(op.transaction_hash.length-7),
        txHref = op._links.transaction.href,
        descriptionSpan = document.createElement("span");

    var featherIcon, description, otherPublicKey;
    // NOTE: https://www.stellar.org/developers/horizon/reference/resources/operation.html
    switch(op.type_i) {
      case STELLAR_OPERATION_CREATE_ACCOUNT:
        // Create account
        featherIcon = "user";
        description = (publicKey == op.funder ? "Created account for " : "Account created with funds from ");
        otherPublicKey = (publicKey == op.funder ? op.account : op.funder);
        break;
      case STELLAR_OPERATION_PAYMENT:
      case STELLAR_OPERATION_PATH_PAYMENT:
        // Payments
        featherIcon = "send";

        let sentPayment = (publicKey == op.from);
        var verb, prep;
        if (sentPayment) {
          // Sent 100 XLM to @mikey.rf
          verb = "Sent";
          prep = "to";
          otherPublicKey = op.to;
        } else {
          // Received 100 XLM from @mikey.rf
          verb = "Received";
          prep = "from";
          otherPublicKey = op.from;
        }

        var assetCode = (op.asset_type != 'native' ? op.asset_code : 'XLM');
        var amount = String(op.amount);
        if (op.type_i == STELLAR_OPERATION_PATH_PAYMENT) {
          var sourceAssetCode = (op.source_asset_type != 'native' ? op.source_asset_code : 'XLM');
          if (sourceAssetCode != assetCode) {
            amount += " (originally " + String(op.source_amount) + " " + sourceAssetCode + ")";
          }
        }

        description = verb + " " + amount + " " + assetCode + " " + prep + " ";

        break;
      case STELLAR_OPERATION_MANAGE_OFFER:
      case STELLAR_OPERATION_CREATE_PASSIVE_OFFER:
        // Trading offers
        featherIcon = "trending-up";

        var verb = (op.type_i == STELLAR_OPERATION_CREATE_PASSIVE_OFFER ? "Passively offered": "Offered");

        // "Offered 300 MOBI for 200 KIN (price: 1.50 MOBI/KIN, amount: 100)"
        var buyingAsset = (op.buying.asset_type != 'native' ? op.buying.asset_code : 'XLM'),
            sellingAsset = (op.selling.asset_type != 'native' ? op.selling.asset_code : 'XLM'),
            buyingTotal = op.price_r.n * parseFloat(op.amount),
            sellingTotal = op.price_r.d * parseFloat(op.amount);

        description = verb + " " + buyingTotal + " " + buyingAsset + " for " + sellingTotal + " " + sellingAsset +
          " (price: " + op.price + " " + buyingAsset + "/" + sellingAsset + ", amount: " + op.amount + ")";

        break;
      case STELLAR_OPERATION_SET_OPTIONS:
        // Set options
        featherIcon = "user";
        // TODO: Be more explicit with what options were set
        description = "Set options on this account";
        break;
      case STELLAR_OPERATION_CHANGE_TRUST:
        // Change trust
        featherIcon = "shield";

        var assetCode = (op.asset_type != 'native' ? op.asset_code : 'XLM');
        if (op.trustor == publicKey) {
          // Changed trustline for USD assets issued by @mikey.rf
          otherPublicKey = op.trustee;
          description = "Changed trustline for " + assetCode + " assets issued by ";
        } else {
          // Trustline for USD assets changed with @mikey.rf
          otherPublicKey = op.trustor;
          description = "Trustline for " + assetCode + " assets changed with ";
        }
        break;
      case STELLAR_OPERATION_ALLOW_TRUST:
        // Allow trust
        featherIcon = "shield";

        var assetCode = (op.asset_type != 'native' ? op.asset_code : 'XLM');
        var verb = (op.authorize ? "Authorized": "Revoked");
        if (op.trustee == publicKey) {
          // Authorized trustline for USD assets with @mikey.rf
          otherPublicKey = op.trustor;
          description = verb + " trustline for " + assetCode + " assets with ";
        } else {
          // Trustline authorized for USD assets issued by @mikey.rf
          verb = verb.toLowerCase();
          otherPublicKey = op.trustee;
          description = "Trustline " + verb + " for " + assetCode + " assets issued by ";
        }

        break;
      case STELLAR_OPERATION_ACCOUNT_MERGE:
        // Account merge
        featherIcon = "user";
        description = "Merged into " + op.into;
        break;
      case STELLAR_OPERATION_INFLATION:
        // Inflation
        featherIcon = "trending-up";
        description = "Ran inflation on this account";
        break;
      case STELLAR_OPERATION_MANAGE_DATA:
        // Manage data
        featherIcon = "user";
        description = "Changed account data entry '" + op.name + "'";
        break;
    }

    // Build the description DOM with possible @username link
    var descriptionText, descriptionA, descriptionAText, username, href;
    if (otherPublicKey) {
      descriptionText = document.createTextNode(description);
      descriptionSpan.appendChild(descriptionText);
      descriptionA = document.createElement("a");
      if (otherPublicKey in accounts) {
        username = "@" + accounts[otherPublicKey].username,
        href = accounts[otherPublicKey].href;
      } else {
        username = otherPublicKey.substring(0, 10) + '...' + otherPublicKey.substring(otherPublicKey.length-10);
        href = STELLAR_SERVER_URL + '/accounts/' + otherPublicKey;
        descriptionA.setAttribute("class", "text-info");
        descriptionA.setAttribute("target", "_blank");
      }
      descriptionAText = document.createTextNode(username);
      descriptionA.appendChild(descriptionAText);
      descriptionA.setAttribute("href", href);
      descriptionSpan.appendChild(descriptionA);
    } else {
      descriptionText = document.createTextNode(description);
      descriptionSpan.appendChild(descriptionText);
    }

    // Build the full DOM li object
    var li = document.createElement("li");
    li.setAttribute("class", "list-group-item flex-column align-items-start");

    var descriptionDiv = document.createElement("div");
    descriptionDiv.setAttribute("class", "d-flex w-100 justify-content-between");
    li.appendChild(descriptionDiv);
    descriptionDiv.appendChild(descriptionSpan);

    var featherIconSpan = document.createElement("span");
    featherIconSpan.setAttribute("data-feather", featherIcon);
    descriptionDiv.appendChild(featherIconSpan);

    var timeSinceDiv = document.createElement("div");
    li.appendChild(timeSinceDiv);

    var timeSinceSmall = document.createElement("small");
    timeSinceSmall.setAttribute("class", "text-muted");
    var timeSinceText = document.createTextNode(timeSince);
    timeSinceSmall.appendChild(timeSinceText);
    timeSinceDiv.appendChild(timeSinceSmall);

    var txHashDiv = document.createElement("div");
    li.appendChild(txHashDiv);

    var txHashSmall = document.createElement("small");
    var txHashText = document.createTextNode("Tx #: ");

    var txHashA = document.createElement("a");
    txHashA.setAttribute("class", "text-info");
    txHashA.setAttribute("title", "Stellar Transaction Hash");
    txHashA.setAttribute("target", "_blank");
    txHashA.setAttribute("href", txHref);
    var txHashAText = document.createTextNode(txHash);
    txHashA.appendChild(txHashAText);

    txHashDiv.appendChild(txHashSmall);
    txHashSmall.appendChild(txHashText);
    txHashSmall.appendChild(txHashA);
    txHashA.appendChild(txHashAText);

    return li;
  }
})();
