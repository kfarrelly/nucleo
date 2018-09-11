(function() {
  // When ready, turn off sr-only for profile pic and cover pic
  // input labels
  $(document).ready(function() {
    $("label.control-label[for='id_profile-pic']").removeClass("sr-only").addClass("font-weight-bold pt-2");
    $("label.control-label[for='id_profile-cover']").removeClass("sr-only").addClass("font-weight-bold pt-2");
  });

  // Function to set src attribute of img with id=imgId to
  // uploaded file.
  function readAndSetImgURL(input, imgId) {
    if (input.files && input.files[0]) {
      var reader = new FileReader();
      reader.onload = function (e) {
        $('#' + imgId).attr('src', e.target.result);
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  // Event listener for file loading of images. Replace current cover/profile
  // with the uploaded file.
  $("input[name='profile-pic']").on("change", function(e) {
    readAndSetImgURL(this, 'profilePic');
  });
  $("input[name='profile-cover']").on("change", function(e) {
    readAndSetImgURL(this, 'profileCover');
  });
})();
