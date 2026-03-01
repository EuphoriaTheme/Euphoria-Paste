/* global haste, tippy, window, document */

(function () {
  'use strict';

  var app = null;

  function buildExtensionRegex() {
    var extensions = Object.keys(haste.extensionMap).join('|');
    return new RegExp('\\.(' + extensions + ')$');
  }

  function getBaseUrl() {
    var segments = window.location.href.split('/');
    return segments.slice(0, segments.length - 1).join('/') + '/';
  }

  function handlePop(evt, extensionRegex) {
    var locationTarget =
      evt && evt.target && evt.target.location
        ? evt.target.location
        : window.location;
    var path = locationTarget.pathname;
    var key = path.substring(1).replace(extensionRegex, '');

    if (!key) {
      app.newDocument(true);
      return;
    }

    app.loadDocument(key);
  }

  function configurePopState(extensionRegex) {
    setTimeout(function () {
      window.onpopstate = function (evt) {
        try {
          handlePop(evt, extensionRegex);
        } catch (error) {
          console.warn('Unable to handle history navigation yet.');
        }
      };
    }, 1000);
  }

  function setupMobileTooltips() {
    if (typeof tippy !== 'function') {
      return;
    }

    var buttons = document.querySelectorAll('#mobile-controls .fab');
    buttons.forEach(function (button) {
      tippy(button, {
        content: button.getAttribute('data-tippy-content'),
        theme: 'dark',
        duration: [300, 200],
        placement: 'left',
        arrow: true,
      });
    });
  }

  function setupMobileActions() {
    document.getElementById('save-btn').addEventListener('click', function () {
      app.lockDocument();
    });

    document.getElementById('new-btn').addEventListener('click', function () {
      app.newDocument(true);
    });

    document
      .getElementById('duplicate-btn')
      .addEventListener('click', function () {
        app.duplicateDocument();
      });

    document.getElementById('raw-btn').addEventListener('click', function () {
      if (app.doc && app.doc.key) {
        window.location.href = app.baseUrl + 'raw/' + app.doc.key;
      }
    });

    document
      .getElementById('discord-btn')
      .addEventListener('click', function () {
        window.open('https://discord.euphoriadevelopment.uk', '_blank');
      });
  }

  function setupEditorStats() {
    var textarea = document.querySelector('textarea');
    var lineCount = document.getElementById('line-count');
    var wordCount = document.getElementById('word-count');
    var charCount = document.getElementById('char-count');

    function updateStats() {
      var text = textarea.value;
      var lines = text.split('\n').length;
      var words = text
        .trim()
        .split(/\s+/)
        .filter(function (word) {
          return word.length > 0;
        }).length;
      var chars = text.length;

      lineCount.textContent = 'Lines: ' + lines;
      wordCount.textContent = 'Words: ' + words;
      charCount.textContent = 'Characters: ' + chars;
    }

    textarea.addEventListener('input', updateStats);
    updateStats();
  }

  function init() {
    var extensionRegex = buildExtensionRegex();

    app = new haste('Euphoria Paste', {
      discord: true,
      baseUrl: getBaseUrl(),
    });

    window.app = app;

    handlePop({ target: window }, extensionRegex);
    configurePopState(extensionRegex);
    setupMobileTooltips();
    setupMobileActions();
    setupEditorStats();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
