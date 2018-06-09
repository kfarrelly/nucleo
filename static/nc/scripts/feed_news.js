(function() {
  /* On document load, use moment() to replace all created_at strings with time since content */
  $(document).ready(function() {
    $('.time-since').each(function(i, timeSinceContainer) {
      timeSinceContainer.textContent = moment(timeSinceContainer.dataset.created_at).fromNow();
    });
  });

  /** Load more news items when the MORE button is clicked **/
  $('button.more').on('click', function() {
    // Get the more button container to prep for DOM
    // insertion before the div (in the activityList)
    let button = this;

    // If data-has_more has been set to "false", MORE button is at the end
    // of all records from Horizon, so don't bother fetching
    if (button.dataset.has_more == "true") {
      // Only load more if records left
      var newsListQuery = $(button.dataset.parent);

      // Hit the Nucleo /feed/news/?page=&format=json endpoint with
      // GET call
      let url = button.dataset.url;

      $.get(url)
      .then(function(resp) {
        // Resp Json has key, vals:
        // 'object': {'results': [NewsItem], 'next': url },

        // Iterate through operation records parsing and appropriately formatting
        // the DOM object to add into newsList (before MORE button)
        var news = [];
        resp.results.forEach(function(record) {
          news.push(parseNews(record));
        });

        // Append to end of newsList
        newsListQuery.append(news);
        feather.replace(); // Call this so feather icons populate properly

        // If no next URL, then no more records to load
        if (resp.next == null) {
          button.classList.add("invisible");
        }
      })
      .catch(function (err) {
        console.error('Unable to load news articles', err);
      });
    }
  });

  /** Parse news record and format appropriately for news list **/
  function parseNews(record) {
    // Returns DOM element for insertion into newsList before MORE button

    // Build the full DOM a list item object
    var a = document.createElement("a");
    a.setAttribute("class", "list-group-item list-group-item-action flex-column align-items-start");
    a.setAttribute("href", record.url);
    a.setAttribute("target", "_blank");

    // Build all the needed DOM object containers
    let headingDiv = document.createElement("div"),
        titleContainer = document.createElement("h6"),
        timeSinceContainer = document.createElement("small"),
        domainContainer = document.createElement("p"),
        votesContainer = document.createElement("small");

    // Set up attributes and content for headingDiv
    headingDiv.setAttribute("class", "d-flex w-100 justify-content-between");
    titleContainer.setAttribute("class", "mb-1");
    titleContainer.textContent = record.title;
    timeSinceContainer.setAttribute("class", "pl-1 text-right");
    timeSinceContainer.textContent = moment(record.created_at).fromNow();
    domainContainer.setAttribute("class", "mb-2 text-muted");
    domainContainer.textContent = record.domain;

    // Add items to headingDiv
    headingDiv.appendChild(titleContainer);
    headingDiv.appendChild(timeSinceContainer);
    headingDiv.appendChild(domainContainer);

    // Set up the attributes for the votesContainer
    // NOTE: votesAttributesDict: { attr: {class: spanClass, icon: feather} }
    votesContainer.setAttribute("class", "d-flex flex-wrap justify-content-start align-items-center");
    let votesAttributesDict = {
      'positive': {
        'class': 'mr-2 text-success',
        'icon': 'arrow-up',
      },
      'negative': {
        'class': 'mr-2 text-danger',
        'icon': 'arrow-down',
      },
      'important': {
        'class': 'mr-2 text-warning',
        'icon': 'alert-triangle',
      },
      'liked': {
        'class': 'mr-2',
        'icon': 'thumbs-up',
      },
      'disliked': {
        'class': 'mr-2',
        'icon': 'thumbs-down',
      },
      'saved': {
        'class': 'mr-2',
        'icon': 'star',
      },
    };
    for (k in votesAttributesDict) {
      if (record.votes[k] > 0) {
        // Build the span object then
        let voteClass = votesAttributesDict[k].class,
            voteIcon = votesAttributesDict[k].icon,
            voteContainer = document.createElement("span"),
            voteIconSpan = document.createElement("span");

        voteContainer.setAttribute("class", voteClass);
        voteIconSpan.setAttribute("data-feather", voteIcon);
        voteText = document.createTextNode(String(record.votes[k]));

        voteContainer.appendChild(voteIconSpan);
        voteContainer.appendChild(voteText);
        votesContainer.appendChild(voteContainer);
      }
    }

    // Add to outer a DOM element
    a.appendChild(headingDiv);
    a.appendChild(domainContainer);
    a.appendChild(votesContainer);

    return a;
  }
})();
