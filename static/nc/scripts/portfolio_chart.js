(function() {
  var portfolioLatestValue;

  // Plot the current user's portfolio values
  plotPortfolioValues(moment().subtract(1.25, 'year').valueOf(), moment().valueOf());

  function plotPortfolioValues(start, end) {
    /*
    Fetch portfolio data for the last year from Nucleo portfolio data endpoint,
    parse JSON appropriately for highcharts, then plot.
    */
    $('.portfolio-chart').each(function(i, portfolioChartDiv) {
      let username = portfolioChartDiv.dataset.username;
      if (username) {
        portfolioCounterCode = portfolioChartDiv.dataset.counter_code;
        var params = {
          'counter_code': portfolioCounterCode,
          'start': start,
          'end': end
        };
        portfolioUrl = portfolioChartDiv.dataset.url;

        let url = portfolioUrl + '?' + $.param(params),
            valueSuffix = ' ' + portfolioCounterCode;

        $.get(url)
        .then(function(resp) {
          // Parse the record data to get an appropriate format for chart plotting
          // i.e. [ [timestamp, avg] ]

          // Resp Json has key, vals:
          // 'latest_value': most recent recorded portfolio value,
          // 'results': [ record ]
          //  where record is { time: datetime, value: float }
          portfolioLatestValue = resp.latest_value;

          let records = resp.results;
          if (records) {
            var plotData = [];
            $.each(records, function(j, record) {
              plotData.push([ moment(record.time).valueOf(), parseFloat(record.value) ]);
            });
            createChart(portfolioChartDiv.id, username, plotData, valueSuffix);
          } else {
            throw new Error('No portfolio data found');
          }
        })
        .catch(function (err) {
          // If something went wrong, notify user data not available
          console.error('Something went wrong with the portfolio data call', err);
          portfolioChartDiv.textContent = "Historical portfolio data not available";
          return false;
        });
      }
    });
  }

  function afterSetExtremes(e) {
    /*
    Fetch new data from Horizon server once range limits on plot have changed.
    */
    var chart = Highcharts.charts[0];
    let start = Math.round(e.min),
        end = Math.round(e.max);

    var plotData = [];
    chart.showLoading('Loading historical portfolio data ...');

    // Query for XLM/counter_code
    var params = {
      'counter_code': portfolioCounterCode,
      'start': start,
      'end': end
    };
    let url = portfolioUrl + '?' + $.param(params),
        valueSuffix = ' ' + portfolioCounterCode;

    $.get(url)
    .then(function(resp) {
      var firstVal, lastVal;
      let records = resp.results;
      $.each(records, function(j, record) {
        plotData.push([ moment(record.time).valueOf(), parseFloat(record.value) ]);

        // To determine color of graph (green/red), keep track of first and last val
        if (j == 0) {
          firstVal = parseFloat(record.value);
        } else if (j == records.length - 1) {
          lastVal = parseFloat(record.value);
        }
      });
      if (firstVal && lastVal) {
        // Update the color and subtitle
        let plotColor = (lastVal >= firstVal ? '#28a745' : '#dc3545'),
            subtitleText = getSubtitleText(firstVal, lastVal, valueSuffix);

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
        chart.setTitle(null, {
          align: "left",
          text: subtitleText,
          style: {
            "color": plotColor,
          },
        });
      }
      chart.series[0].setData(plotData);
      chart.hideLoading();
    });
  }

  function getSubtitleText(firstVal, lastVal, valueSuffix) {
    /*
    Get percent change subtitle text for chart.
    */
    let valChange = lastVal - firstVal,
        percentChange = valChange / firstVal,
        valChangeText = (valueSuffix == ' USD' ? numeral(valChange).format('$0,0.00') : valChange),
        percentChangeText = (lastVal >= firstVal ? '+' + numeral(percentChange).format('0.00%') : numeral(percentChange).format('0.00%'));

    return valChangeText + " (" + percentChangeText + ")";
  }

  function createChart(containerId, seriesName, seriesData, valueSuffix=' USD', valueDecimals=2) {
    /**
     * Create the chart when all data is loaded into seriesOptions
     */
     var seriesColor = '#343a40',
         titleText = subtitleText = '';
     if (seriesData.length != 0) {
       let firstVal = seriesData[0][1], lastVal = seriesData[seriesData.length-1][1],
           portfolioVal = (portfolioLatestValue ? portfolioLatestValue : lastVal);

       // Data color
       seriesColor = (portfolioVal >= firstVal ? '#28a745' : '#dc3545');

       // Title
       titleText = (valueSuffix == ' USD' ? numeral(portfolioVal).format('$0,0.00'): portfolioVal + valueSuffix);

       // Subtitle
       subtitleText = getSubtitleText(firstVal, portfolioVal, valueSuffix);
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
               valueDecimals: valueDecimals,
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
       }],
       subtitle: {
         align: "left",
         text: subtitleText,
         style: {
           "color": seriesColor,
         },
       },
       title: {
         align: "left",
         text: titleText,
         style: {
           "color": "#333333",
           "fontSize": "21px",
           "fontWeight": "bold"
         },
       }
     });
  }
})();
