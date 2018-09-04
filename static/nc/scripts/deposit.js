(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  /** Initialization of form **/
  function resetDepositForm() {
    // Clear out the user input from forms
    let depositFundsModalForm = $('#depositFundsModalForm')[0];
    if (depositFundsModalForm) {
      $('#depositFundsModalForm')[0].reset();

      // Hide all asset containers
      $('.deposit-asset').addClass('d-none');
    }
  };

  $(document).ready(function() {
    // Resetting deposit form
    resetDepositForm();
  });

  // Event listener for selected asset code upon select to update
  // corresponding Stellar pegged asset
  $('#depositFundsModalAssetSelect').on('change', function(e) {
    // Hide all asset containers then show only the one
    // that's currently selected in asset select
    $('.deposit-asset').addClass('d-none');
    $(".deposit-asset[data-asset_id='" + this.value + "']").removeClass('d-none');
  });

  // Event listener for selected Stellar account upon select to update
  $('#depositFundsModalAccountSelect').on('change', function(e) {
    console.log(this.value);
  });

  // Bootstrap depositFundsModalForm submission
  // Get external address for asset from Papaya, then display to user
  $('#depositFundsModalForm').submit(function(event) {
    event.preventDefault();

    // Assign the signed user value to a variable to transmit later
    // Obtain the modal header to display errors under if POSTings fail
    let assetCode = this.elements["asset"].value.split("-")[0],
        assetIssuer = this.elements["asset"].value.split("-")[1],
        accountPublicKey = this.elements["account"].value,
        modalHeader = $(this).find('.modal-body-header')[0],
        qs = {
          asset_code: assetCode,
          account: accountPublicKey
        },
        url = PAPAYA_API_DEPOSIT_URL + '?' + $.param(qs),
        laddaButton = Ladda.create($(this).find(":submit")[0]);

    // Start Ladda animation for UI loading
    laddaButton.start();

    // Load account from Horizon server to check wether trusts the selected asset.
    server.loadAccount(accountPublicKey)
    .catch(StellarSdk.NotFoundError, function (error) {
      throw new Error('No Stellar account with that secret key exists yet.');
    })
    // If there was no error, load up-to-date information on your account.
    .then(function(sourceAccount) {
      var trusts = false;
      sourceAccount.balances.forEach(function(balance) {
        let code = (balance.asset_type == "native" ? "XLM" : balance.asset_code),
            issuer = (balance.asset_type == "native" ? "" : balance.asset_issuer);

        trusts = trusts || (code == assetCode && issuer == assetIssuer);
      });
      if (!trusts) {
        throw new Error("You must <a href='" + PAPAYA_ASSET_TRUST_LINKS[assetCode] + "' class='alert-link'>trust this asset</a> before depositing.");
      } else {
        $.get(url)
        .then(function(resp) {
          // Stop the button loading animation then display the response message
          laddaButton.stop();
          let mainMessage = "Please send your funds to <a class='alert-link'>" + resp.how + "</a>",
              subMessage = "Minimum deposit: " + resp.min_amount + " " + assetCode + ", ETA: " + moment().add(parseFloat(resp.eta), 'seconds').fromNow() + '.';
          displayAlert(modalHeader, subMessage, 'alert-info');
          displayWarning(modalHeader, mainMessage);
        })
        .catch(function (err) {
          // Stop the button loading animation then display the error
          laddaButton.stop();
          console.error('Something went wrong with Papaya call', err);
          displayError(modalHeader, error.message);
          return false;
        });
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
