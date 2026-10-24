// The newsletter box is not connected to anything yet: stop the form from reloading the page.
document.querySelectorAll('.newsletter-form').forEach(function (form) {
  form.addEventListener('submit', function (event) {
    event.preventDefault();
  });
});
