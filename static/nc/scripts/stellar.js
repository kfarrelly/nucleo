(function() {
  if ( STELLAR_NETWORK_TYPE == 'TESTNET' ) {
    StellarSdk.Network.useTestNetwork();
  } else if ( STELLAR_NETWORK_TYPE == 'PUBLIC' ) {
    StellarSdk.Network.usePublicNetwork();
  }
})();
