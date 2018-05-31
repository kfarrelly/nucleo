(function() {
  // Event listener to toggle between showing percent v. price change in asset
  $('.btn-asset-change').on('click', function() {
    // Get the text display spans
    $(this).find('.asset-change').each(function() {
      $( this ).toggleClass( "d-none" );
    })
  });

  // TODO: document.ready get ticker for this asset
})();
