(function() {
  /* Initialization of Stellar server */
  // NOTE: won't get asset price data if use testnet URL so default to live for price data
  var baseAsset, counterAsset, server = new StellarSdk.Server(STELLAR_MAINNET_SERVER_URL);

  // Plot the current asset's trade aggregation data
  // TODO: Why is tradeAggregation endpoint data appearing as one day prior to now for end?
  // Is is something to do with time series format for Highstock versus for Horizon?
  plotAssetValues(moment().subtract(1.25, 'years').valueOf(), moment().valueOf());

  function plotAssetValues(start, end) {
    /*
    Fetch trade aggregation data for the last year from Stellar Horizon endpoint,
    parse JSON appropriately for highcharts, then plot.
    */
    let resolution = getResolution(start, end);

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
        baseAsset = new StellarSdk.Asset(baseAssetCode, baseAssetIssuer);
        server.tradeAggregation(baseAsset, counterAsset, start, end, resolution).limit(200).call()
        .then(function(data){
          // Parse the record data to get an appropriate format for chart plotting
          // i.e. [ [timestamp, avg] ]
          // TODO: check if next has any records (length != 0)
          var plotData = [];
          $.each(data.records, function(j, record) {
            plotData.push([ record.timestamp, parseFloat(record.avg) ]);
          });
          createChart(assetChartDiv.id, baseAssetCode, plotData);
        });
      }
    });
  }

  function getResolution(start, end) {
    /*
    Returns the resolution in milliseconds for Stellar tradeAggregation call.
    Resolution values chosen so that only 2 API calls required. TODO: iterative fetching

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
  }

  function afterSetExtremes(e) {
    /*
    Fetch new data from Horizon server once range limits on plot have changed.
    */
    var chart = Highcharts.charts[0];
    chart.showLoading('Loading data from Horizon ...');
    let start = Math.round(e.min),
        end = Math.round(e.max),
        resolution = getResolution(start, end);

    var plotData = [];
    server.tradeAggregation(baseAsset, counterAsset, start, end, resolution).limit(200).call()
    .then(function(data){
      // Parse the record data to get an appropriate format for chart plotting
      // i.e. [ [timestamp, avg] ]
      // TODO: check if next has any records (length != 0)
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


  function createChart(containerId, seriesName, seriesData, valueSuffix=' XLM') {
    /**
     * Create the chart when all data is loaded into seriesOptions
     */
     let firstVal = seriesData[0][1],
         lastVal = seriesData[seriesData.length-1][1];
         seriesColor = (lastVal >= firstVal ? '#28a745' : '#dc3545');

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
               text: '1d'
           }, {
               type: 'week',
               count: 1,
               text: '1w'
           }, {
               type: 'month',
               count: 1,
               text: '1m'
           }, {
               type: 'month',
               count: 3,
               text: '3m'
           }, {
               type: 'month',
               count: 6,
               text: '6m'
           }, {
               type: 'year',
               count: 1,
               text: '1y'
           }, {
               type: 'all',
               text: 'All'
           }],
           selected: 6,
           inputEnabled: false
       },
       xAxis: {
         events: {
           afterSetExtremes: afterSetExtremes
         },
         minRange: 3600 * 1000 // one hour
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
