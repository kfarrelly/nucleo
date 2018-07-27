(function() {
  /*
  Check whether ledger is even supported. If not, disable all Ledger buttons.
  */
  $(document).ready(function() {
    isStellarLedgerSupported().then(function(is) {
      if (!is) {
        $('.ledger-button').attr("disabled", true);
      }
    });
  });

  /*
  Fetch the public key from connected Ledger device and store
  it in data attribute of button. Disable associated secret key text input
  if successful in fetching.
  */
  $('.ledger-button').on('click', function() {
    if (!button.disabled) {
      let button = this,
          secretKeyInput = $(this.dataset.parent)[0],
          submitButtonName = this.dataset.submit_name,
          alertInsertPoint = $(this.dataset.alert_ref)[0],
          alertInsertBefore = (this.dataset.alert_before == "true");
          
      if (!button.classList.contains("active")) {
        getStellarLedgerPublicKey().then(function(pk) {
          // Clear out and disable secretKeyInput. Store Ledger public key as data attribute
          secretKeyInput.dataset.ledger_public_key = pk;
          secretKeyInput.value = "";
          secretKeyInput.disabled = true;

          // Change state of Ledger button to active
          $(button).button('toggle');

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
        secretKeyInput.dataset.ledger_public_key = "";
        secretKeyInput.disabled = false;

        // Change state of Ledger button to not active
        $(button).button('toggle');
      }
    }
  });
})();
