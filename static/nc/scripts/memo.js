(function() {
  // Initialize byte size display
  $(document).ready(function() {
    $('.memo-content-text').each(function(i, memoContentInput) {
      setByteDisplay(memoContentInput);
    });
  });


  // Set event listeners for memo byte size counters
  $('.memo-content-text').on('input', function(e) {
    setByteDisplay(this);
  });

  function setByteDisplay(memoContentInput) {
    // Get the byte size display and calculate input's current byte size
    let memoByteDisplay = $(memoContentInput.dataset.byte_display)[0],
        byteSize = (new TextEncoder('utf-8').encode(memoContentInput.value)).length;

    if (memoByteDisplay) {
      // Set the byte size of the input text
      memoByteDisplay.textContent = byteSize;

      // Change the color of the text to red if over allowed byte size value
      if (byteSize > STELLAR_MEMO_TEXT_BYTE_MAX) {
        memoByteDisplay.classList.add('text-danger');
      } else {
        memoByteDisplay.classList.remove('text-danger');
      }
    }
  }
})();
