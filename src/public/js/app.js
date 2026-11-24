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

  // Catalog: apply filters instantly and search as the user types.
  var filterForm = document.getElementById('catalog-filters');
  var results = document.getElementById('catalog-results');
  if (filterForm && results && window.fetch && window.DOMParser) {
    var submitBtn = filterForm.querySelector('[data-nojs]');
    if (submitBtn) submitBtn.hidden = true;

    var timer = null;
    var controller = null;
    var currentQuery = function () {
      var params = new URLSearchParams(new FormData(filterForm));
      // Drop empty params so the URL stays clean.
      Array.from(params.keys()).forEach(function (k) { if (!params.get(k)) params.delete(k); });
      return params.toString();
    };
    var lastQuery = currentQuery();

    var refresh = function () {
      clearTimeout(timer);
      var query = currentQuery();
      if (query === lastQuery) return;
      lastQuery = query;

      var url = filterForm.getAttribute('action') + (query ? '?' + query : '');
      if (controller) controller.abort();
      controller = window.AbortController ? new AbortController() : null;
      results.setAttribute('aria-busy', 'true');

      fetch(url, { credentials: 'same-origin', signal: controller && controller.signal })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var fresh = doc.getElementById('catalog-results');
          if (!fresh) throw new Error('Unexpected response');
          results.innerHTML = fresh.innerHTML;
          results.removeAttribute('aria-busy');
          window.history.replaceState(null, '', url);
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return;
          results.removeAttribute('aria-busy');
          window.location.href = url; // fall back to a full page load
        });
    };

    var debounced = function () {
      clearTimeout(timer);
      timer = setTimeout(refresh, 250);
    };

    filterForm.querySelector('[name=q]').addEventListener('input', debounced);
    filterForm.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', refresh);
    });
    filterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      refresh();
    });
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
