(function() {
  function csrfSafeMethod(method) {
      // these HTTP methods do not require CSRF protection
      return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
  }

  // AJAX Setup for CSRF cookie
  $.ajaxSetup({
    beforeSend: function(xhr, settings) {
      if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
        var csrftoken = Cookies.get('csrftoken');
        xhr.setRequestHeader("X-CSRFToken", csrftoken);
      }
    },
  });
})();
