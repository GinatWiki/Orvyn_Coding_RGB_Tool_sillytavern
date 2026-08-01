/* Orvyn RGB Tool - SillyTavern bridge.
 *
 * A third-party SillyTavern extension that forwards UI events to the
 * Orvyn RGB Tool local event bridge (default http://127.0.0.1:7355/event).
 * The bridge maps these events to states on the physical RGB light:
 *
 *   story_advance       -> BUSY
 *   form_submit         -> BUSY
 *   generation_start    -> BUSY
 *   generation_done     -> RUNNING
 *   generation_error    -> ERROR
 *   idle                -> IDLE
 *
 * Install: copy this folder into
 * <SillyTavern>/public/scripts/extensions/third-party/orvyn-rgb-tool-sillytavern/
 * and restart SillyTavern, or install this repository from GitHub via
 * Extensions -> Install extension from URL.
 */

(function () {
    'use strict';
    if (window.__ORVYN_RGB_TOOL_SILLYTAVERN__) {
        return;
    }
    window.__ORVYN_RGB_TOOL_SILLYTAVERN__ = true;

    const EXTENSION_NAME = 'orvyn-rgb-tool-sillytavern';
    const DEFAULT_SETTINGS = {
        enabled: true,
        bridgeUrl: 'http://127.0.0.1:7355',
        token: '',
        watchDom: true,
    };

    let context = null;
    let settings = Object.assign({}, DEFAULT_SETTINGS);
    let attempts = 0;

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (ch) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            }[ch];
        });
    }

    function loadSettings() {
        if (context && context.extensionSettings && context.extensionSettings[EXTENSION_NAME]) {
            settings = Object.assign({}, DEFAULT_SETTINGS, context.extensionSettings[EXTENSION_NAME]);
        }
    }

    function saveSettings() {
        if (!context) return;
        if (context.extensionSettings) {
            context.extensionSettings[EXTENSION_NAME] = settings;
        }
        if (typeof context.saveSettingsDebounced === 'function') {
            context.saveSettingsDebounced();
        }
    }

    function push(event, payload) {
        if (!settings.enabled) return;
        const base = String(settings.bridgeUrl || DEFAULT_SETTINGS.bridgeUrl).replace(/\/+$/, '');
        const body = JSON.stringify({ source: 'sillytavern', event: event, payload: payload || {} });
        const headers = { 'Content-Type': 'application/json' };
        if (settings.token) {
            headers['Authorization'] = 'Bearer ' + settings.token;
        }
        fetch(base + '/event', { method: 'POST', headers: headers, body: body }).catch(function () {
            // The light service may not be running; this must never break SillyTavern.
        });
    }

    function initContext() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            context = SillyTavern.getContext();
        }
        if (!context && window.eventSource && window.event_types) {
            context = {
                eventSource: window.eventSource,
                eventTypes: window.event_types,
                saveSettingsDebounced: function () {},
            };
        }
        return !!(context && context.eventSource && context.eventTypes);
    }

    function hookEvents() {
        const ET = context.eventTypes;
        const events = [
            [ET.GENERATION_STARTED, 'generation_start'],
            [ET.GENERATION_ENDED, 'generation_done'],
            [ET.GENERATION_STOPPED, 'generation_done'],
            [ET.GENERATION_ERROR, 'generation_error'],
            [ET.MESSAGE_SENT, 'form_submit'],
            [ET.MESSAGE_RECEIVED, 'story_advance'],
        ];
        let hooked = 0;
        events.forEach(function (pair) {
            if (!pair[0]) return;
            try {
                context.eventSource.on(pair[0], function () {
                    push(pair[1]);
                });
                hooked += 1;
            } catch (e) {
                // Ignore a single unavailable event type.
            }
        });
        return hooked > 0;
    }

    function watchChatDom() {
        const chat = document.getElementById('chat') || document.querySelector('#chat');
        if (!chat || !('MutationObserver' in window)) return;
        let settleTimer = null;
        new MutationObserver(function (mutations) {
            let added = 0;
            mutations.forEach(function (m) {
                added += m.addedNodes.length;
            });
            if (!added) return;
            push('story_advance');
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(function () {
                push('generation_done');
            }, 1500);
        }).observe(chat, { childList: true, subtree: true });
    }

    function renderSettings() {
        const container = document.getElementById('extensions_settings');
        if (!container || typeof window.jQuery === 'undefined') return;
        const $ = window.jQuery;
        if ($('#orvyn-rgb-tool-sillytavern-settings').length) return;

        const html = '' +
            '<div id="orvyn-rgb-tool-sillytavern-settings" class="inline-drawer">' +
            '  <div class="inline-drawer-toggle">' +
            '    <span>Orvyn RGB Tool SillyTavern Bridge</span>' +
            '    <div class="inline-drawer-icon fa-solid fa-circle-plus down"></div>' +
            '  </div>' +
            '  <div class="inline-drawer-content">' +
            '    <label class="checkbox_label" for="orvyn-rgb-tool-sillytavern-enabled">' +
            '      <input id="orvyn-rgb-tool-sillytavern-enabled" type="checkbox">Enabled' +
            '    </label>' +
            '    <label for="orvyn-rgb-tool-sillytavern-url">Bridge URL</label>' +
            '    <input id="orvyn-rgb-tool-sillytavern-url" type="text" value="' + escapeHtml(settings.bridgeUrl) + '">' +
            '    <label for="orvyn-rgb-tool-sillytavern-token">Token (optional)</label>' +
            '    <input id="orvyn-rgb-tool-sillytavern-token" type="password" value="' + escapeHtml(settings.token) + '">' +
            '    <small>Events are POSTed to {bridgeUrl}/event.</small>' +
            '  </div>' +
            '</div>';

        container.insertAdjacentHTML('beforeend', html);
        $('#orvyn-rgb-tool-sillytavern-enabled').prop('checked', settings.enabled).on('change', function () {
            settings.enabled = this.checked;
            saveSettings();
        });
        $('#orvyn-rgb-tool-sillytavern-url').on('input', function () {
            settings.bridgeUrl = this.value;
            saveSettings();
        });
        $('#orvyn-rgb-tool-sillytavern-token').on('input', function () {
            settings.token = this.value;
            saveSettings();
        });
    }

    function boot() {
        if (!initContext()) {
            attempts += 1;
            if (attempts < 15) {
                setTimeout(boot, 1000);
            }
            return;
        }
        loadSettings();
        hookEvents();
        if (settings.watchDom) watchChatDom();
        renderSettings();
        window.addEventListener('beforeunload', function () {
            push('idle');
        });
        console.log('[orvyn-rgb-tool] SillyTavern bridge loaded -> ' + settings.bridgeUrl + '/event');
    }

    boot();
})();