(function() {
  /* Initialization of Stellar server */
  var server = new StellarSdk.Server(STELLAR_SERVER_URL);

  $(document).ready(function() {
    fetchTickerData().then(function(data) {
      populateAssetList(data.assets);
    });
  });

  function populateAssetList(assets) {
    /*
    Returned data is already sorted by activity score, so simply
    append list items
    */
    // Get all the asset price containers
    assetListDiv = $('#topassets')[0];
    console.log(assets);
  }
})();
