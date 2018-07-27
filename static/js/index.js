// NOTE: http://siawyoung.com/coding/javascript/exporting-es6-modules-as-single-scripts-with-webpack.html
var StellarGuardSdk = require('@stellarguard/sdk');

// TODO: figure out how to do this without the .default attr! Not good ...
var StellarLedger = {
  Api: require('@ledgerhq/hw-app-str').default,
  Transport: require('@ledgerhq/hw-transport-u2f').default
};


module.exports = {
  'StellarGuardSdk': StellarGuardSdk,
  'StellarLedger': StellarLedger
}
