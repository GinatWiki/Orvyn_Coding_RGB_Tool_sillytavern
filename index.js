/* Orvyn RGB Tool - SillyTavern bridge.
 *
 * A third-party SillyTavern extension that forwards UI events to the
 * Orvyn RGB Tool local event bridge (default http://127.0.0.1:7355/event).
 *
 * All events are posted with source=sillytavern. The RGB web console maps
 * event names to (custom) states via its trigger condition configuration.
 *
 * Events:
 *   generation_start / generation_done / generation_stopped
 *   generation_error / message_received
 *   story_advance / story_done / story_failed
 *   form_submit / form_done / form_failed
 *   idle
 *
 * Story/form routing: when the shujuku AutoCardUpdaterAPI is available,
 * form fills are driven by registerTableFillStartCallback (form_submit) and
 * registerTableUpdateCallback (form_done). MESSAGE_SENT is then ignored so a
 * form fill cannot be overwritten by story_advance.
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
    };

    let context = null;
    let settings = Object.assign({}, DEFAULT_SETTINGS);
    let attempts = 0;
    let storyActive = false;
    let formActive = false;
    let shujukuHooked = false;
    let fallbackStoryOnMessageSent = true;

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

    function getShujukuApi() {
        try {
            if (window.AutoCardUpdaterAPI) return window.AutoCardUpdaterAPI;
        } catch (e) { }
        try {
            if (window.parent && window.parent.AutoCardUpdaterAPI) return window.parent.AutoCardUpdaterAPI;
        } catch (e) { }
        try {
            if (window.top && window.top.AutoCardUpdaterAPI) return window.top.AutoCardUpdaterAPI;
        } catch (e) { }
        return null;
    }

    function hookShujukuApi() {
        if (shujukuHooked) return;
        const api = getShujukuApi();
        if (!api) return;
        let ok = false;
        if (typeof api.registerTableFillStartCallback === 'function') {
            try {
                api.registerTableFillStartCallback(function () {
                    formActive = true;
                    push('form_submit');
                });
                ok = true;
            } catch (e) { }
        }
        if (typeof api.registerTableUpdateCallback === 'function') {
            try {
                let timer = null;
                api.registerTableUpdateCallback(function () {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(function () {
                        formActive = false;
                        push('form_done');
                    }, 2000);
                });
                ok = true;
            } catch (e) { }
        }
        if (ok) {
            shujukuHooked = true;
            fallbackStoryOnMessageSent = false;
            console.log('[orvyn-rgb-tool] shujuku AutoCardUpdaterAPI hooked');
        }
    }

    function hookEvents() {
        const ET = context.eventTypes;
        const on = function (type, handler) {
            if (!type) return;
            try {
                context.eventSource.on(type, handler);
            } catch (e) {
                // Ignore a single unavailable event type.
            }
        };
        on(ET.GENERATION_STARTED, function () {
            if (formActive) {
                push('form_submit');
            } else {
                storyActive = true;
                push('story_advance');
            }
        });
        on(ET.GENERATION_ENDED, function () {
            push(formActive ? 'form_done' : 'story_done');
            storyActive = false;
            formActive = false;
        });
        on(ET.GENERATION_STOPPED, function () {
            storyActive = false;
            formActive = false;
            push('generation_stopped');
        });
        on(ET.GENERATION_ERROR, function () {
            push('generation_error');
            if (formActive) push('form_failed');
            else if (storyActive) push('story_failed');
            storyActive = false;
            formActive = false;
        });
        on(ET.MESSAGE_RECEIVED, function () {
            if (formActive) return;
            storyActive = false;
            formActive = false;
            push('message_received');
            push('story_done');
        });
        on(ET.MESSAGE_SENT, function () {
            // With shujuku, form_submit comes from its fill-start callback and
            // story_advance comes from GENERATION_STARTED. Without shujuku,
            // treat the sent message as a story advance (legacy behavior).
            if (!fallbackStoryOnMessageSent) return;
            storyActive = true;
            push('story_advance');
        });
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
            if (attempts < 30) {
                setTimeout(boot, 1000);
            }
            return;
        }
        loadSettings();
        hookEvents();
        hookShujukuApi();
        renderSettings();
        window.addEventListener('beforeunload', function () { push('idle'); });
        // shujuku may load from CDN after the extension boots.
        setInterval(hookShujukuApi, 2000);
        console.log('[orvyn-rgb-tool] SillyTavern bridge loaded -> ' + settings.bridgeUrl + '/event');
    }

    boot();
})();