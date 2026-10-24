document.addEventListener('DOMContentLoaded', function () {
  // Reloading starts a fresh conversation from the greeting
  document.getElementById('new-chat').addEventListener('click', function () {
    window.location.reload();
  });
});
