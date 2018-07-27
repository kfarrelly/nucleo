(function() {
  if ( STELLAR_NETWORK_TYPE == 'TESTNET' ) {
    StellarGuardSdk.useTestNetwork();
  } else if ( STELLAR_NETWORK_TYPE == 'PUBLIC' ) {
    StellarGuardSdk.usePublicNetwork();
  }
})();
