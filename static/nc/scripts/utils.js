function displayError(obj, errorMessage, before=false) {
  // Inserts an error alert panel before/after (before=true/false)
  // the given DOM object.

  // Example:
  // <div class="alert alert-danger alert-dismissible fade show" role="alert">
  //  An error message!
  //  <button type="button" class="close" data-dismiss="alert" aria-label="Close">
  //    <span aria-hidden="true">&times;</span>
  //  </button>
  // </div>

  // Create the alert container
  var alertDiv = document.createElement("div");
  alertDiv.setAttribute("class", "alert alert-danger alert-dismissible fade show");
  alertDiv.setAttribute("role", "alert");

  // Insert the error text
  var errorText = document.createTextNode(errorMessage);
  alertDiv.appendChild(errorText);

  // Add a button to close the panel
  var closeButton = document.createElement("button");
  closeButton.setAttribute("class", "close");
  closeButton.setAttribute("data-dismiss", "alert");
  closeButton.setAttribute("aria-label", "Close");

  var closeIconSpan = document.createElement("span");
  closeIconSpan.setAttribute("aria-hidden", "true");
  $(closeIconSpan).html("&times;");
  closeButton.appendChild(closeIconSpan);
  alertDiv.appendChild(closeButton);

  // Insert the full DOM alertDiv before object
  if (before) {
    $(obj).before(alertDiv);
  } else {
    $(obj).after(alertDiv);
  }
}
