(function () {
  'use strict';

  // Confirmation prompts for destructive actions.
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
    });
  });

  // Client-side photo size check (server enforces the same limit).
  document.querySelectorAll('input[type=file][data-max-bytes]').forEach(function (input) {
    input.addEventListener('change', function () {
      var max = Number(input.getAttribute('data-max-bytes'));
      var file = input.files && input.files[0];
      if (file && file.size > max) {
        window.alert('Photo must be at most 2 MB.');
        input.value = '';
      }
    });
  });

  // Loan form: show the duration as the user picks dates.
  var loanForm = document.getElementById('loan-form');
  if (loanForm) {
    var start = loanForm.querySelector('[name=requested_start]');
    var due = loanForm.querySelector('[name=due_date]');
    var hint = document.getElementById('duration-hint');
    var update = function () {
      if (!start.value || !due.value) return;
      var days = Math.round((Date.parse(due.value) - Date.parse(start.value)) / 86400000);
      hint.textContent = days >= 1 && days <= 14
        ? 'Duration: ' + days + ' day(s).'
        : 'Duration must be between 1 and 14 days (currently ' + days + ').';
      hint.className = days >= 1 && days <= 14 ? 'muted' : 'flash flash-error';
    };
    start.addEventListener('change', update);
    due.addEventListener('change', update);
    update();
  }

  // Profile: validate preferences JSON before submit.
  var prefs = document.getElementById('preferences');
  if (prefs) {
    prefs.form.addEventListener('submit', function (event) {
      try {
        JSON.parse(prefs.value || '{}');
      } catch (e) {
        event.preventDefault();
        window.alert('Preferences must be valid JSON.');
      }
    });
  }
})();
