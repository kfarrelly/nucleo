/* NOTE: https://github.com/owais/django-webpack-loader */
var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');

module.exports = {
  context: __dirname,
  entry: './assets/js/index',
  output: {
      path: path.resolve('./assets/webpack_bundles/'),
      filename: "[name]-[hash].js",
      libraryTarget: 'var',
      // `library` determines the name of the global variable
      library: '[name]'
  },

  plugins: [
    new BundleTracker({filename: './webpack-stats.json'})
  ]
}
