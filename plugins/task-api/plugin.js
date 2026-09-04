(function () {
    if (typeof translations !== 'undefined') {
        Object.assign(translations.de, {
            apiAccess: 'API',
            apiEnable: 'API aktivieren',
            apiCopyKey: 'API-Key kopieren',
            apiInfo: 'Aktiviere die API, um einen API-Key zu erzeugen.',
            apiEnabledInfo: 'User ID und API-Key für externe Verbindungen.',
            apiCopySuccess: 'API-Key kopiert',
            apiError: 'API-Key konnte nicht geladen werden',
            apiLocalUnavailable: 'API-Key-Verwaltung ist im lokalen Testmodus nicht verfügbar.',
            apiUserId: 'User ID',
            apiKey: 'API Key',
            apiUsageRemaining: 'Verbleibend heute'
        });
        Object.assign(translations.en, {
            apiAccess: 'API',
            apiEnable: 'Enable API',
            apiCopyKey: 'Copy API key',
            apiInfo: 'Enable the API to generate an API key.',
            apiEnabledInfo: 'User ID and API key for external connections.',
            apiCopySuccess: 'API key copied',
            apiError: 'Could not load API key',
            apiLocalUnavailable: 'API key management is not available in local test mode.',
            apiUserId: 'User ID',
            apiKey: 'API Key',
            apiUsageRemaining: 'Remaining today'
        });
    }

    function ensureApiSettingsState(app) {
        app.settings.apiAccess = {
            ...(app.settings.apiAccess || {}),
            enabled: !!(app.settings.apiAccess && app.settings.apiAccess.enabled),
            createdAt: (app.settings.apiAccess && app.settings.apiAccess.createdAt) || null
        };
        if (!Number.isFinite(app.apiAccessRemaining)) app.apiAccessRemaining = null;
        if (!Number.isFinite(app.apiAccessLimit)) app.apiAccessLimit = null;
        if (typeof app.apiAccessPlainKey !== 'string') app.apiAccessPlainKey = '';
    }

    function getApiBaseUrl() {
        const configuredBase = String(
            (window.sevenflowConfig && window.sevenflowConfig.apiBaseUrl) || ''
        ).trim();
        return configuredBase || window.location.origin;
    }

    function isLocalAuthMode() {
        return !!(window.sevenflowConfig && window.sevenflowConfig.localAuth);
    }

    async function authorizedApiManagementFetch(path, payload = {}, method = 'POST') {
        if (isLocalAuthMode()) {
            throw new Error('api-local-unavailable');
        }
        const { auth } = await initFirebase();
        if (!auth || !auth.currentUser) throw new Error('auth-required');
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            method,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`
            },
            body: method === 'GET' ? undefined : JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'api-request-failed');
        }
        return data;
    }

    async function copyToClipboard(text) {
        if (!text) return false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', 'readonly');
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        return true;
    }

    function setApiAccessStatus(app, message, type = '') {
        const el = document.getElementById('apiAccessStatus');
        if (!el) return;
        el.textContent = message || app.t('apiInfo');
        el.classList.remove('success', 'error');
        if (type) el.classList.add(type);
    }

    function clearApiAccessPreview(app) {
        app.apiAccessPlainKey = '';
    }

    function refreshApiAccessUI(app) {
        const apiBtn = document.getElementById('apiAccessBtn');
        const apiUserIdRow = document.getElementById('apiUserIdRow');
        const apiUserIdValue = document.getElementById('apiUserIdValue');
        const apiKeyRow = document.getElementById('apiKeyRow');
        const apiKeyValue = document.getElementById('apiKeyValue');
        const apiUsageRow = document.getElementById('apiUsageRow');
        const apiUsageValue = document.getElementById('apiUsageValue');
        const apiSettingsItem = document.getElementById('apiSettingsItem');
        const userId = app.currentUser?.uid || '';
        const enabled = !!(app.settings.apiAccess && app.settings.apiAccess.enabled);
        const previewKey = app.apiAccessPlainKey || '';
        const remaining = Number.isFinite(app.apiAccessRemaining) ? app.apiAccessRemaining : null;
        const limit = Number.isFinite(app.apiAccessLimit) ? app.apiAccessLimit : null;

        if (isLocalAuthMode()) {
            if (apiSettingsItem) apiSettingsItem.style.display = 'none';
            return;
        }

        if (apiSettingsItem) apiSettingsItem.style.display = '';
        if (apiBtn) {
            apiBtn.textContent = enabled ? app.t('apiCopyKey') : app.t('apiEnable');
            apiBtn.disabled = false;
        }
        if (apiUserIdRow) apiUserIdRow.style.display = enabled && userId ? 'block' : 'none';
        if (apiUserIdValue) apiUserIdValue.textContent = userId;
        if (apiKeyRow) apiKeyRow.style.display = previewKey ? 'block' : 'none';
        if (apiKeyValue) apiKeyValue.textContent = previewKey;
        if (apiUsageRow) apiUsageRow.style.display = enabled ? 'block' : 'none';
        if (apiUsageValue) apiUsageValue.textContent = remaining !== null && limit !== null ? `${remaining}/${limit}` : '...';

        if (previewKey) {
            setApiAccessStatus(app, app.t('apiEnabledInfo'), 'success');
        } else if (enabled) {
            setApiAccessStatus(app, app.t('apiEnabledInfo'));
        } else {
            setApiAccessStatus(app, app.t('apiInfo'));
        }
    }

    async function refreshApiAccessStatusFromServer(app) {
        const enabled = !!(app.settings.apiAccess && app.settings.apiAccess.enabled);
        if (!enabled) return;

        try {
            const data = await authorizedApiManagementFetch('/api/task-api/key', {}, 'GET');
            app.apiAccessRemaining = Number.isFinite(data.remaining) ? data.remaining : null;
            app.apiAccessLimit = Number.isFinite(data.limit) ? data.limit : null;
            refreshApiAccessUI(app);
        } catch (error) {
            if (error && error.message === 'api-key-not-found') {
                app.settings.apiAccess = {
                    ...(app.settings.apiAccess || {}),
                    enabled: false,
                    createdAt: null
                };
                app.apiAccessRemaining = null;
                app.apiAccessLimit = null;
                clearApiAccessPreview(app);
                refreshApiAccessUI(app);
            }
        }
    }

    async function enableApiAccess(app) {
        try {
            const data = await authorizedApiManagementFetch('/api/task-api/key', {});
            app.apiAccessPlainKey = data.apiKey || '';
            app.apiAccessRemaining = Number.isFinite(data.remaining) ? data.remaining : null;
            app.apiAccessLimit = Number.isFinite(data.limit) ? data.limit : null;
            app.settings.apiAccess = {
                ...(app.settings.apiAccess || {}),
                enabled: true,
                createdAt: data.createdAt || new Date().toISOString()
            };
            refreshApiAccessUI(app);
        } catch (error) {
            setApiAccessStatus(app, app.t('apiError'), 'error');
        }
    }

    async function copyApiAccessKey(app) {
        try {
            const data = await authorizedApiManagementFetch('/api/task-api/key', {}, 'GET');
            if (!data || !data.apiKey) throw new Error('missing-api-key');
            await copyToClipboard(data.apiKey);
            setApiAccessStatus(app, app.t('apiCopySuccess'), 'success');
        } catch (error) {
            if (error && error.message === 'api-key-not-found') {
                app.settings.apiAccess = {
                    ...(app.settings.apiAccess || {}),
                    enabled: false,
                    createdAt: null
                };
                app.apiAccessRemaining = null;
                app.apiAccessLimit = null;
                clearApiAccessPreview(app);
                refreshApiAccessUI(app);
                return;
            }
            setApiAccessStatus(app, app.t('apiError'), 'error');
        }
    }

    async function handleApiAccessButton(app) {
        const enabled = !!(app.settings.apiAccess && app.settings.apiAccess.enabled);
        if (!enabled) {
            await enableApiAccess(app);
            return;
        }
        await copyApiAccessKey(app);
    }

    function ensureSettingsUI(app) {
        if (document.getElementById('apiSettingsItem')) return;
        const settingsList = document.querySelector('#settingsModal .settings-list');
        if (!settingsList) return;
        const item = document.createElement('div');
        item.className = 'setting-item';
        item.id = 'apiSettingsItem';
        item.innerHTML = `
            <label data-i18n="apiAccess">${app.t('apiAccess')}</label>
            <div class="setting-inline-row">
                <button type="button" class="setting-action-btn" id="apiAccessBtn" data-i18n="apiEnable">${app.t('apiEnable')}</button>
            </div>
            <div class="setting-help-text" id="apiAccessStatus" data-i18n="apiInfo">${app.t('apiInfo')}</div>
            <div class="setting-help-text api-access-meta" id="apiUserIdRow" style="display: none;">
                <strong data-i18n="apiUserId">${app.t('apiUserId')}</strong>: <span id="apiUserIdValue"></span>
            </div>
            <div class="setting-help-text api-access-meta" id="apiKeyRow" style="display: none;">
                <strong data-i18n="apiKey">${app.t('apiKey')}</strong>: <span id="apiKeyValue"></span>
            </div>
            <div class="setting-help-text api-access-meta" id="apiUsageRow" style="display: none;">
                <strong data-i18n="apiUsageRemaining">${app.t('apiUsageRemaining')}</strong>: <span id="apiUsageValue"></span>
            </div>
        `;
        const backupItem = document.getElementById('backupImportBtn')?.closest('.setting-item');
        if (backupItem) {
            backupItem.insertAdjacentElement('afterend', item);
        } else {
            settingsList.appendChild(item);
        }
    }

    window.SevenFlowPlugins.register({
        id: 'task-api',
        initApp(app) {
            ensureApiSettingsState(app);
            ensureSettingsUI(app);
        },
        appHooks: {
            bindEvents(app) {
                const apiAccessBtn = document.getElementById('apiAccessBtn');
                if (apiAccessBtn) {
                    apiAccessBtn.addEventListener('click', async () => {
                        await handleApiAccessButton(app);
                    });
                }
            },
            onOpenSettings(app) {
                ensureApiSettingsState(app);
                clearApiAccessPreview(app);
                app.apiAccessRemaining = null;
                app.apiAccessLimit = null;
                refreshApiAccessUI(app);
                refreshApiAccessStatusFromServer(app).catch(() => {});
            },
            prepareBackupSettings(app, settings) {
                const cleanSettings = { ...(settings || {}) };
                delete cleanSettings.apiAccess;
                return cleanSettings;
            }
        }
    });
})();
