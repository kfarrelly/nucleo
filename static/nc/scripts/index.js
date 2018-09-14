(function() {
  var typeData = {
    'asset': { 'allowed': ALLOWED_ASSET_DISPLAYS, 'current': CURRENT_ASSET_DISPLAY },
    'portfolio': { 'allowed': ALLOWED_PORTFOLIO_DISPLAYS, 'current': CURRENT_PORTFOLIO_DISPLAY }
  };

  $(document).ready(function() {
    // Initialize the buttons to display
    Object.keys(typeData).forEach(function(type) {
      setDisplayButtonType(typeData[type].current, type);
    });
  });

  // Set event listener to toggle the current top asset button display type
  $('.btn-topassets').on('click', function() {
    toggleDisplayButtonType('asset');
  });

  // Set event listener to toggle the current top asset button display type
  $('.btn-topportfolios').on('click', function() {
    toggleDisplayButtonType('portfolio');
  });

  function setDisplayButtonType(display, type) {
    /*
    Set the currently showing button type on top asset list to either price (USD/XLM),
    % change (USD/XLM), or activity score.
    */
    let allowedDisplays = typeData[type].allowed,
        currentDisplay = typeData[type].current;
    if (allowedDisplays.includes(display)) {
      // Fade out the old class
      let currentDisplayClass = '.btn-' + currentDisplay;
      $(currentDisplayClass).addClass('d-none');

      // Fade in the new class
      let displayClass = '.btn-' + display;
      $(displayClass).removeClass('d-none');

      // Remember the current display type
      typeData[type].current = display;
    }
  }

  function toggleDisplayButtonType(type) {
    /*
    Rotate button type to the next type in allowed displays list.
    */
    let displayIndex = typeData[type].allowed.indexOf(typeData[type].current),
        newDisplayIndex = (displayIndex + 1) % typeData[type].allowed.length,
        newDisplay = typeData[type].allowed[newDisplayIndex];
    setDisplayButtonType(newDisplay, type);
  }
})();
