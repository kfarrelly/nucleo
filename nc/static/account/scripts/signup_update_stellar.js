(function() {
  /* Initialization */
  var createStellarKeypair = null, server = new StellarSdk.Server(STELLAR_SERVER_URL);

  $(document).ready(function() {
    // If IS_CURRENT_USER, add to document ready
    // resetting the Stellar create/add account forms
    resetStellarForms();
  });

  /** Initialization of forms **/
  function resetStellarForms() {
    // Clear out the user input from forms
    $('#addStellarModalForm')[0].reset();
    $('#addStellarPublicKeyForm')[0].reset();

    // Remove any randomly generated keypair data for new account
    createStellarKeypair = null;
    $('#createStellarModalPublicKey').empty();
    $('#createStellarModalSecretKey').empty();
  };

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

  /** Bootstrap createStellarModalForm submission **/
  $('#createStellarModalForm').submit(function(event) {
    event.preventDefault();

    // Start Ladda animation for UI loading
    let laddaButton = Ladda.create($(this).find(":submit")[0]);
    laddaButton.start();

    // Submit the public key to Nucleo servers to verify account
    let publicKeyForm = $('#addStellarPublicKeyForm')[0],
        publicKeyFormSubmitButton = $('#addStellarPublicKeyForm').find(":submit")[0];
    publicKeyForm.elements["public_key"].value = createStellarKeypair.publicKey();
    publicKeyForm.elements["creating_stellar"].checked = true;
    publicKeyFormSubmitButton.click();
  });

  /** Bootstrap addStellarModalForm submission **/
  $('#addStellarModalForm').submit(function(event) {
    event.preventDefault();

    // Assign the signed user value to a variable to transmit later
    // Obtain the modal header to display errors under if POSTings fail
    let signedUser = this.elements["signed_user"].value,
        ledgerButton = this.elements["ledger"],
        modalHeader = $(this).find('.modal-body-header')[0];

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
              if (op.source_account == sourceAccount.id && op.type_i == STELLAR_OPERATION_MANAGE_DATA) {
                // Close the event stream connection
                es();

                // Notify user of successful submission
                displaySuccess(modalHeader, 'Successfully submitted transaction to the Stellar network.');

                // Submit the public key to Nucleo servers to verify account
                let publicKeyForm = $('#addStellarPublicKeyForm')[0],
                    publicKeyFormSubmitButton = $('#addStellarPublicKeyForm').find(":submit")[0];
                publicKeyForm.elements["public_key"].value = sourceKeys.publicKey();
                publicKeyForm.elements["creating_stellar"].checked = false;
                publicKeyFormSubmitButton.click();
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
        // Submit the public key to Nucleo servers to verify account
        let publicKeyForm = $('#addStellarPublicKeyForm')[0],
            publicKeyFormSubmitButton = $('#addStellarPublicKeyForm').find(":submit")[0];
        publicKeyForm.elements["public_key"].value = sourceKeys.publicKey();
        publicKeyForm.elements["creating_stellar"].checked = false;
        publicKeyFormSubmitButton.click();
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

  /** addStellarPublicKeyForm submission to Nucleo **/
  $('#addStellarPublicKeyForm').submit(function(event) {
    event.preventDefault();

    // Grab the public_key data from the form
    let successUrl = this.dataset.success,
        adding = !this.elements["creating_stellar"].checked;

    // Build the JSON data to be submitted
    var formData = {};
    $(this).serializeArray().forEach(function(obj) {
      formData[obj.name] = obj.value;
    });

    // Submit it to Nucleo's create account endpoint
    $.post(this.action, formData)
    .then(function(result) {
      // Then redirect to the user's profile page with successUrl
      window.location.href = successUrl;
    })
    .catch(function(error) {
      // Fail response gives form.errors. Make sure to show in error form
      let modalHeader = (adding ? $("#addStellarModalForm").find('.modal-body-header')[0] : $("#createStellarModalHeader")[0]),
          errorMessage = error.responseJSON.__all__[0];

      // Stop the button loading animation then display the error
      Ladda.stopAll();
      console.error('Something went wrong with Nucleo call', error);
      displayError(modalHeader, errorMessage);
    });
  });
})();
