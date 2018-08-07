(function() {
  // Initialization according to:
  // https://www.algolia.com/doc/tutorials/search-ui/instant-search/build-an-instant-search-results-page/instantsearchjs/
  for (var modelName in ALGOLIA_INDEX_NAMES) {
    let search = instantsearch({
      appId: ALGOLIA_APPLICATION_ID,
      apiKey: ALGOLIA_INDEX_API_KEYS[modelName],
      indexName: ALGOLIA_INDEX_NAMES[modelName],
      searchParameters: {
        hitsPerPage: 10
      }
    });
    search.addWidget(
      instantsearch.widgets.searchBox({
        container: '#searchInput',
        magnifier: false,
        autofocus: false,
      })
    );
    search.addWidget(
      instantsearch.widgets.hits({
        container: '#search' + modelName + 'Hits',
        templates: {
          item: document.getElementById('search' + modelName + 'HitTemplate').innerHTML,
          empty: document.getElementById('searchEmptyTemplate').innerHTML
        },
      })
    );
    search.start();
  }


  // Set event listeners for dropdown on search input
  $('#searchInput').on('input', function(e) {
    // Get the toggle and the dropdown
    let dropdownIsOpen = $('#searchDropdown')[0].classList.contains('show'),
        toggle = $('#searchToggle')[0];

    if ((this.value != "" && !dropdownIsOpen) || (this.value == "" && dropdownIsOpen)) {
      // Show/hide the search results in dropdown
      toggle.click();
    }
  });
})();
