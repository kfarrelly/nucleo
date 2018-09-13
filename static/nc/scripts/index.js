(function() {
  $(document).ready(function() {
    // Initialize the buttons to display
    setDisplayButtonType(CURRENT_DISPLAY);
  });

  // Set event listener to toggle the current top asset button display type
  $('.btn-topassets').on('click', function() {
    toggleDisplayButtonType();
  });

  function setDisplayButtonType(display) {
    /*
    Set the currently showing button type on top asset list to either price (USD/XLM),
    % change (USD/XLM), or activity score.
    */
    if (ALLOWED_DISPLAYS.includes(display)) {
      // Fade out the old class
      let currentDisplayClass = '.btn-' + CURRENT_DISPLAY;
      $(currentDisplayClass).addClass('d-none');

      // Fade in the new class
      let displayClass = '.btn-' + display;
      $(displayClass).removeClass('d-none');

      // Remember the current display type
      CURRENT_DISPLAY = display;
    }
  }

  function toggleDisplayButtonType() {
    /*
    Rotate button type to the next type in allowed displays list.
    */
    let displayIndex = ALLOWED_DISPLAYS.indexOf(CURRENT_DISPLAY),
        newDisplayIndex = (displayIndex + 1) % ALLOWED_DISPLAYS.length,
        newDisplay = ALLOWED_DISPLAYS[newDisplayIndex];
    setDisplayButtonType(newDisplay);
  }
})();
