(function() {
  /*
  Check whether ledger is even supported. If not, disable all Ledger buttons.
  */
  $(document).ready(function() {
    isStellarLedgerSupported().then(function(is) {
      $('.ledger-button').attr("disabled", !is);
    });
  });

  // NOTE: When submitting forms for transactions that have secret key,
  // there is a check in profile.js, send.js, etc. of whether secretKeyInput is disabled.
  // and if disabled, whether associated ledgerButton.dataset.public_key is there.
  // Then use the ledgerButton.dataset.public_key to fetch sourceAccount for tx.

  /*
  Fetch the public key from connected Ledger device and store
  it in data attribute of button. Disable associated secret key text input
  if successful in fetching.
  */
  $('.ledger-button').on('click', function() {
    let button = this,
        secretKeyInput = $(this.dataset.parent)[0],
        submitButtonName = this.dataset.submit_name,
        alertInsertPoint = $(this.dataset.alert_ref)[0],
        alertInsertBefore = (this.dataset.alert_before == "true");

    if (!button.disabled) {
      if (!button.classList.contains("active")) {
        getStellarLedgerPublicKey().then(function(pk) {
          // Clear out and disable secretKeyInput. Store Ledger public key as data attribute
          button.dataset.public_key = pk;
          secretKeyInput.value = "";
          secretKeyInput.disabled = true;

          // Change state of Ledger button to active
          $(button).button('toggle');
          $(button).trigger('ledger:toggle');

          // Notify user to sign transaction after submit is pressed
          let alertMessage = 'Please confirm this transaction on your Ledger device after pressing the ' + submitButtonName + ' button.';
          displayAlert(alertInsertPoint, alertMessage, 'alert-success', alertInsertBefore);
        })
        .catch(function(err) {
          console.error('Ledger communication failed', err);
          displayError(alertInsertPoint, 'Ledger communication failed. Please plug in and open the Stellar app on your Ledger device. Make sure Browser support in Settings is set to Yes.');
          return false;
        });
      } else {
        // Reset all Ledger data and allow user to input text secret key again.
        button.dataset.public_key = "";
        secretKeyInput.disabled = false;

        // Change state of Ledger button to not active
        $(button).button('toggle');
        $(button).trigger('ledger:toggle');
      }
    }
  });
})();
