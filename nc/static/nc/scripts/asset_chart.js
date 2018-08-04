(function() {
  /* Initialization of Stellar server */
  // NOTE: won't get asset price data if use testnet URL so default to live for price data
  var baseAsset, counterAsset, exchangeUrl, exchangePairName,
      server = new StellarSdk.Server(STELLAR_MAINNET_SERVER_URL);

  // Plot the current asset's trade aggregation data
  plotAssetValues(moment().subtract(1.25, 'year').valueOf(), moment().valueOf());

  function plotAssetValues(start, end) {
    /*
    Fetch trade aggregation data for the last year from Stellar Horizon endpoint,
    parse JSON appropriately for highcharts, then plot.
    */
    let resolution = getResolution(start, end);

    // TODO: If asset is native, use an exchange instead of Stellar to
    // display USD/XLM price over time!

    $('.asset-chart').each(function(i, assetChartDiv) {
      let baseAssetCode = assetChartDiv.dataset.base_asset_code,
          baseAssetIssuer = assetChartDiv.dataset.base_asset_issuer,
          counterAssetCode = assetChartDiv.dataset.counter_asset_code,
          counterAssetIssuer = assetChartDiv.dataset.counter_asset_issuer;

      if (!counterAssetCode || !counterAssetIssuer) {
        counterAsset = StellarSdk.Asset.native();
      } else {
        counterAsset = new StellarSdk.Asset(counterAssetCode, counterAssetIssuer);
      }

      if (baseAssetCode && baseAssetIssuer) {
        // Base asset is not native so use Stellar Horizon server
        baseAsset = new StellarSdk.Asset(baseAssetCode, baseAssetIssuer);
        server.tradeAggregation(baseAsset, counterAsset, start, end, resolution).limit(200).call()
        .then(function(data){
          // Parse the record data to get an appropriate format for chart plotting
          // i.e. [ [timestamp, avg] ]
          // TODO: check if next has any records
          var plotData = [];
          $.each(data.records, function(j, record) {
            plotData.push([ record.timestamp, parseFloat(record.avg) ]);
          });
          createChart(assetChartDiv.id, baseAssetCode, plotData);
        })
        .catch(function(error) {
          // If something went wrong, notify user data not available
          console.error('Something went wrong with Stellar call', error);
          assetChartDiv.textContent = "Historical price data not available";
          return false;
        });
      } else {
        // Base asset is native so use Kraken
        baseAsset = StellarSdk.Asset.native();

        // Query for XLM/USD
        var params = { 'interval': resolution, 'start': start, 'end': end };
        exchangePairName = assetChartDiv.dataset.exchange_pair_name;
        exchangeUrl = assetChartDiv.dataset.url;
        let url = exchangeUrl + '?' + $.param(params);

        $.get(url)
        .then(function(resp) {
          // Parse the record data to get an appropriate format for chart plotting
          // i.e. [ [timestamp, avg] ]

          // Resp Json has key, vals:
          // 'last': timestamp of most recent record (use for future since value
          //    when fetching more recent data),
          // 'error': []
          // pairName: [ record ]
          //  where record is list of format [ <time>, <open>, <high>, <low>, <close>,
          //    <vwap>, <volume>, <count> ]
          let records = resp.result[exchangePairName];
          if (records) {
            var plotData = [];
            $.each(records, function(j, record) {
              plotData.push([ record[0], parseFloat(record[4]) ]);
            });
            createChart(assetChartDiv.id, baseAsset.getCode(), plotData, ' USD');
          } else {
            throw new Error('No records from external exchange found');
          }
        })
        .catch(function (err) {
          // If something went wrong, notify user data not available
          console.error('Something went wrong with the external exchange call', err);
          assetChartDiv.textContent = "Historical price data not available";
          return false;
        });
      }
    });
  }

  function getResolution(start, end) {
    /*
    Returns the resolution in milliseconds for Stellar tradeAggregation call.
    Resolution values chosen so that only 2 API calls required.

    Based off: https://github.com/highcharts/highcharts/blob/master/samples/data/from-sql.php
    */
    let range = end - start;

    var resolution;
    if (range < 2 * 24 * 3600 * 1000) {
      // Two days range loads 15 minute data
      resolution = 900000;
    } else if (range < 2 * 7 * 24 * 3600 * 1000) {
      // Two week range loads hourly data
      resolution = 3600000;
    } else if (range < 15 * 31 * 24 * 3600 * 1000) {
      // One year range loads daily data
      resolution = 86400000;
    } else {
      // Otherwise, load weekly data
      resolution = 604800000;
    }
    return resolution;
  }

  function fetchMoreTradeData(next) {
    /*
    next is a fn call to get more records from the tradeAggregation call to server.

    Iteratively collect next records, parse, then plot in current chart
    */
    // TODO!
  }

  function afterSetExtremes(e) {
    /*
    Fetch new data from Horizon server once range limits on plot have changed.
    */
    var chart = Highcharts.charts[0];
    let start = Math.round(e.min),
        end = Math.round(e.max),
        resolution = getResolution(start, end);

    var plotData = [];
    if (baseAsset.isNative()) {
      chart.showLoading('Loading data from external exchange ...');

      // Query for XLM/USD
      var params = { 'interval': resolution, 'start': start, 'end': end };
      let url = exchangeUrl + '?' + $.param(params);
      $.get(url)
      .then(function(resp) {
        var firstVal, lastVal;
        let records = resp.result[exchangePairName];
        $.each(records, function(j, record) {
          plotData.push([ record[0], parseFloat(record[4]) ]);

          // To determine color of graph (green/red), keep track of first and last val
          if (j == 0) {
            firstVal = parseFloat(record[4]);
          } else if (j == records.length - 1) {
            lastVal = parseFloat(record[4]);
          }
        });
        if (firstVal && lastVal) {
          // Update the color
          let plotColor = (lastVal >= firstVal ? '#28a745' : '#dc3545');
          chart.series[0].options.color = plotColor;
          chart.series[0].options.fillColor = {
              linearGradient: {
                  x1: 0,
                  y1: 0,
                  x2: 0,
                  y2: 0.6
              },
              stops: [
                  [0, plotColor],
                  [1, Highcharts.Color(plotColor).setOpacity(0).get('rgba')]
              ]
          };
          chart.series[0].update(chart.series[0].options);
        }
        chart.series[0].setData(plotData);
        chart.hideLoading();
      });
    } else {
      chart.showLoading('Loading data from Horizon ...');
      server.tradeAggregation(baseAsset, counterAsset, start, end, resolution).limit(200).call()
      .then(function(data){
        // Parse the record data to get an appropriate format for chart plotting
        // i.e. [ [timestamp, avg] ]
        var firstVal, lastVal;
        $.each(data.records, function(j, record) {
          plotData.push([ record.timestamp, parseFloat(record.avg) ]);

          // To determine color of graph (green/red), keep track of first and last val
          if (j == 0) {
            firstVal = parseFloat(record.avg);
          } else if (j == data.records.length - 1) {
            lastVal = parseFloat(record.avg);
          }
        });
        if (firstVal && lastVal) {
          // Update the color
          let plotColor = (lastVal >= firstVal ? '#28a745' : '#dc3545');
          chart.series[0].options.color = plotColor;
          chart.series[0].options.fillColor = {
              linearGradient: {
                  x1: 0,
                  y1: 0,
                  x2: 0,
                  y2: 0.6
              },
              stops: [
                  [0, plotColor],
                  [1, Highcharts.Color(plotColor).setOpacity(0).get('rgba')]
              ]
          };
          chart.series[0].update(chart.series[0].options);
        }
        chart.series[0].setData(plotData);
        chart.hideLoading();
      });
    }
  }


  function createChart(containerId, seriesName, seriesData, valueSuffix=' XLM') {
    /**
     * Create the chart when all data is loaded into seriesOptions
     */
     var seriesColor = '#343a40';
     if (seriesData.length != 0) {
       let firstVal = seriesData[0][1], lastVal = seriesData[seriesData.length-1][1];
       seriesColor = (lastVal >= firstVal ? '#28a745' : '#dc3545');
     }

     // Set timezone options on chart
     Highcharts.setOptions({
       time: {
         timezone: moment.tz.guess()
       }
     });

     // Create the chart
     Highcharts.stockChart(containerId, {
       navigator: {
         adaptToUpdatedData: false,
         series: {
           data: seriesData,
           color: '#343a40', // Bootstrap text-dark
           fillColor: {
               linearGradient: {
                   x1: 0,
                   y1: 0,
                   x2: 0,
                   y2: 0.6
               },
               stops: [
                   [0, '#343a40'],
                   [1, Highcharts.Color('#343a40').setOpacity(0).get('rgba')]
               ]
           }
         }
       },
       rangeSelector: {
           buttons: [{
               type: 'day',
               count: 1,
               text: '1d',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'week',
               count: 1,
               text: '1w',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'month',
               count: 1,
               text: '1m',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'month',
               count: 3,
               text: '3m',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'month',
               count: 6,
               text: '6m',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'year',
               count: 1,
               text: '1y',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }, {
               type: 'all',
               text: 'All',
               events: {
                 click: function(e) {
                   // Add an offset so that end date is at current time
                   let offset = moment().valueOf() - Highcharts.charts[0].xAxis[0].dataMax;
                   this._offsetMax = (offset > 0 ? offset : 0);
                 }
               }
           }],
           selected: 6,
           inputEnabled: false
       },
       xAxis: {
         events: {
           afterSetExtremes: afterSetExtremes
         },
         minRange: 3600 * 1000, // one hour
       },
       yAxis: {
         floor: 0
       },
       series: [{
           name: seriesName,
           data: seriesData,
           type: 'area',
           color: seriesColor,
           threshold: null,
           tooltip: {
               valueDecimals: 7,
               valueSuffix: valueSuffix,
           },
           fillColor: {
               linearGradient: {
                   x1: 0,
                   y1: 0,
                   x2: 0,
                   y2: 0.6
               },
               stops: [
                   [0, seriesColor],
                   [1, Highcharts.Color(seriesColor).setOpacity(0).get('rgba')]
               ]
           }
       }]
     });
  }
})();
