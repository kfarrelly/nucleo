(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  /** Initialization of forms **/
  function resetStellarForms() {
    // Clear out the user input from forms
    $('#signStellarModalForm')[0].reset();
  };

  $(document).ready(function() {
    resetStellarForms();
  });

  /** Bootstrap signStellarModalForm close **/
  $('#signStellarModal').on('hidden.bs.modal', function (e) {
    resetStellarForms();
  });

  $('#signStellarModal').on('show.bs.modal', function (event) {
    // Button that triggered the modal
    let button = $(event.relatedTarget);

    // Extract info from data-* attributes
    let publicKey = button.data('public_key'),
        willTrust = button.data('will_trust'); // Value to change trust to (add trust=true, remove trust=false)

    // Get modal form content and update the input values
    let modal = $(this),
        form = modal.find('form')[0];

    form.elements["public_key"].value = publicKey;
    form.elements["will_trust"].checked = willTrust;
  });


  /** Bootstrap signStellarModalForm submission **/
  $('#signStellarModalForm').submit(function(event) {
    event.preventDefault();

    // Obtain the modal header to display errors under if POSTings fail
    // and fill in asset, willTrust values
    // NOTE: On testnet, change trust will fail if issuer id isn't the same as on mainnet
    let modalHeader = $(this).find('.modal-body-header')[0],
        asset = new StellarSdk.Asset(this.dataset.asset_code, this.dataset.asset_issuer),
        publicKey = this.elements["public_key"].value,
        willTrust = this.elements["will_trust"].checked,
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
      // Start building the Change Trust transaction.

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
        displayAlert(modalHeader, message, 'alert-warning');
      } else {
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
})();
