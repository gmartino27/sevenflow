(function () {
    if (typeof translations !== 'undefined') {
        Object.assign(translations.de, {
            googleCalendar: 'Google Kalender',
            googleCalendarConnect: 'Verbinden',
            googleCalendarDisconnect: 'Trennen',
            googleCalendarNotConnected: 'Nicht verbunden',
            googleCalendarConnected: 'Verbunden',
            googleCalendarNotConfigured: 'Nicht konfiguriert (googleCalendarConfig.clientId fehlt)',
            googleCalendarUnsupported: 'In der App/WebView derzeit nicht unterstützt',
            googleCalendarSelect: 'Kalender auswählen',
            googleCalendarNone: 'Kein Kalender ausgewählt',
            googleCalendarSyncNow: 'Jetzt synchronisieren',
            googleCalendarSelectRequired: 'Bitte zuerst einen Kalender auswählen',
            googleCalendarConnectError: 'Google Kalender konnte nicht verbunden werden',
            googleCalendarSyncDone: 'Synchronisiert',
            googleCalendarSyncError: 'Synchronisierung fehlgeschlagen',
            googleCalendarUntitledEvent: 'Kalendertermin'
        });
        Object.assign(translations.en, {
            googleCalendar: 'Google Calendar',
            googleCalendarConnect: 'Connect',
            googleCalendarDisconnect: 'Disconnect',
            googleCalendarNotConnected: 'Not connected',
            googleCalendarConnected: 'Connected',
            googleCalendarNotConfigured: 'Not configured (googleCalendarConfig.clientId missing)',
            googleCalendarUnsupported: 'Currently not supported in app/WebView',
            googleCalendarSelect: 'Select calendar',
            googleCalendarNone: 'No calendar selected',
            googleCalendarSyncNow: 'Sync now',
            googleCalendarSelectRequired: 'Please select a calendar first',
            googleCalendarConnectError: 'Could not connect Google Calendar',
            googleCalendarSyncDone: 'Synchronized',
            googleCalendarSyncError: 'Synchronization failed',
            googleCalendarUntitledEvent: 'Calendar event'
        });
    }

class SevenFlowGoogleCalendarManager {
    constructor(app) {
        this.app = app;
        this.tokenClient = null;
        this.gisReadyPromise = null;
        this.calendars = [];
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        this.sessionStorageKey = 'sevenflow_google_calendar_token';
        this.localStorageKey = 'sevenflow_google_calendar_token_persistent';
        this.restoreSession();
    }

    t(key) {
        return this.app && this.app.t ? this.app.t(key) : key;
    }

    isNativeFileContext() {
        return window.location.protocol === 'file:';
    }

    getClientId() {
        if (window.googleCalendarConfig && window.googleCalendarConfig.clientId) {
            return window.googleCalendarConfig.clientId;
        }
        return '';
    }

    isConfigured() {
        return !!this.getClientId();
    }

    restoreSession() {
        try {
            const saved = localStorage.getItem(this.localStorageKey) || sessionStorage.getItem(this.sessionStorageKey);
            if (!saved) return;
            const parsed = JSON.parse(saved);
            if (!parsed || !parsed.accessToken || !parsed.tokenExpiresAt) return;
            if (Date.now() >= parsed.tokenExpiresAt) return;
            this.accessToken = parsed.accessToken;
            this.tokenExpiresAt = parsed.tokenExpiresAt;
        } catch (e) {
            // Ignore broken session data
        }
    }

    persistSession() {
        try {
            if (!this.accessToken || !this.tokenExpiresAt) {
                sessionStorage.removeItem(this.sessionStorageKey);
                localStorage.removeItem(this.localStorageKey);
                return;
            }
            const payload = JSON.stringify({
                accessToken: this.accessToken,
                tokenExpiresAt: this.tokenExpiresAt
            });
            sessionStorage.setItem(this.sessionStorageKey, payload);
            localStorage.setItem(this.localStorageKey, payload);
        } catch (e) {
            // Ignore storage issues
        }
    }

    async ensureGisReady() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            return;
        }

        if (this.gisReadyPromise) {
            return this.gisReadyPromise;
        }

        this.gisReadyPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-google-gsi="1"]');
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('gsi-load-failed')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.dataset.googleGsi = '1';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('gsi-load-failed'));
            document.head.appendChild(script);
        });

        return this.gisReadyPromise;
    }

    hasValidToken() {
        return !!this.accessToken && Date.now() < this.tokenExpiresAt;
    }

    async ensureToken(interactive = false) {
        if (this.hasValidToken()) {
            return this.accessToken;
        }

        if (!this.isConfigured()) {
            throw new Error('not-configured');
        }

        if (this.isNativeFileContext()) {
            throw new Error('unsupported-file-context');
        }

        await this.ensureGisReady();

        if (!this.tokenClient) {
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: this.getClientId(),
                scope: 'https://www.googleapis.com/auth/calendar.readonly',
                callback: () => {}
            });
        }

        return new Promise((resolve, reject) => {
            this.tokenClient.callback = (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                this.accessToken = response.access_token;
                const expiresInSec = Number(response.expires_in || 3600);
                this.tokenExpiresAt = Date.now() + Math.max(60, expiresInSec - 30) * 1000;
                this.persistSession();
                resolve(this.accessToken);
            };

            this.tokenClient.requestAccessToken({
                prompt: interactive ? 'consent' : ''
            });
        });
    }

    async authorizedFetch(url) {
        const token = await this.ensureToken(false);
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (res.status === 401) {
            this.disconnect(false);
            const newToken = await this.ensureToken(true);
            const retryRes = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${newToken}`
                }
            });
            if (!retryRes.ok) {
                const text = await retryRes.text();
                throw new Error(`google-api-${retryRes.status}:${text}`);
            }
            return retryRes.json();
        }

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`google-api-${res.status}:${text}`);
        }

        return res.json();
    }

    disconnect(revoke = true) {
        if (revoke && window.google && window.google.accounts && window.google.accounts.oauth2 && this.accessToken) {
            window.google.accounts.oauth2.revoke(this.accessToken, () => {});
        }
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        this.calendars = [];
        this.persistSession();
    }

    async connect() {
        if (!this.isConfigured()) {
            throw new Error('not-configured');
        }
        await this.ensureToken(true);
        await this.loadCalendars();
    }

    async loadCalendars() {
        if (!this.hasValidToken()) {
            await this.ensureToken(false);
        }

        const data = await this.authorizedFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader');
        this.calendars = Array.isArray(data.items) ? data.items : [];
        return this.calendars;
    }

    parseEventStart(event) {
        if (!event || !event.start) return null;

        if (event.start.dateTime) {
            const dt = new Date(event.start.dateTime);
            if (Number.isNaN(dt.getTime())) return null;
            const dateKey = this.app.formatDate(dt);
            const hh = String(dt.getHours()).padStart(2, '0');
            const mm = String(dt.getMinutes()).padStart(2, '0');
            return { dateKey, eventTime: `${hh}:${mm}` };
        }

        if (event.start.date) {
            return { dateKey: event.start.date, eventTime: null };
        }

        return null;
    }

    buildTaskDescription(event) {
        const parts = [];
        if (event.description) parts.push(event.description.trim());
        if (event.location) parts.push(event.location.trim());
        return parts.filter(Boolean).join('\n');
    }

    getEventKey(calendarId, eventId) {
        return `${calendarId}::${eventId}`;
    }

    collectExistingGoogleTasks() {
        const map = new Map();

        Object.entries(this.app.tasks || {}).forEach(([dateKey, list]) => {
            if (!Array.isArray(list)) return;
            list.forEach((task) => {
                if (!task || task.externalSource !== 'google-calendar') return;
                if (!task.externalCalendarId || !task.externalEventId) return;
                const key = this.getEventKey(task.externalCalendarId, task.externalEventId);
                map.set(key, { dateKey, task });
            });
        });

        return map;
    }

    async syncSelectedCalendar() {
        const calendarId = this.app.settings?.googleCalendar?.selectedCalendarId;
        if (!calendarId) {
            throw new Error('no-calendar-selected');
        }

        const now = new Date();
        const minDate = new Date(now);
        minDate.setHours(0, 0, 0, 0);

        const maxDate = new Date(now);
        maxDate.setDate(maxDate.getDate() + 90);
        maxDate.setHours(23, 59, 59, 999);

        // Ensure we compare against the authoritative stored state for the whole sync window.
        // Without this, events outside the currently loaded week can be re-imported as duplicates.
        if (typeof this.app.hydrateRemoteTasksForDateRange === 'function') {
            try {
                await this.app.hydrateRemoteTasksForDateRange(minDate, maxDate);
            } catch (_error) {
                // Continue with local state fallback.
            }
        }

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(minDate.toISOString())}&timeMax=${encodeURIComponent(maxDate.toISOString())}&maxResults=2500`;
        const data = await this.authorizedFetch(url);
        const events = Array.isArray(data.items) ? data.items : [];

        const existing = this.collectExistingGoogleTasks();
        const touchedDates = new Set();
        const seenEventKeys = new Set();

        events.forEach((event) => {
            if (!event || event.status === 'cancelled' || !event.id) return;

            const start = this.parseEventStart(event);
            if (!start || !start.dateKey) return;

            const eventKey = this.getEventKey(calendarId, event.id);
            seenEventKeys.add(eventKey);

            if (!this.app.tasks[start.dateKey]) {
                this.app.tasks[start.dateKey] = [];
            }

            const title = (event.summary || '').trim() || this.t('googleCalendarUntitledEvent');
            const description = this.buildTaskDescription(event);
            const existingEntry = existing.get(eventKey);

            if (existingEntry) {
                const oldDateKey = existingEntry.dateKey;
                const oldTask = existingEntry.task;
                const updatedTask = {
                    ...oldTask,
                    text: title,
                    description,
                    eventTime: start.eventTime,
                    externalSource: 'google-calendar',
                    externalCalendarId: calendarId,
                    externalEventId: event.id,
                    externalUpdatedAt: event.updated || null
                };

                if (oldDateKey !== start.dateKey) {
                    this.app.tasks[oldDateKey] = (this.app.tasks[oldDateKey] || []).filter(t => t.id !== oldTask.id);
                    this.app.tasks[start.dateKey].push(updatedTask);
                    touchedDates.add(oldDateKey);
                    touchedDates.add(start.dateKey);
                } else {
                    const list = this.app.tasks[oldDateKey] || [];
                    const idx = list.findIndex(t => t.id === oldTask.id);
                    if (idx >= 0) {
                        list[idx] = updatedTask;
                        touchedDates.add(oldDateKey);
                    }
                }
            } else {
                const existingOnTargetDate = (this.app.tasks[start.dateKey] || []).find((task) => {
                    return task &&
                        task.externalSource === 'google-calendar' &&
                        task.externalCalendarId === calendarId &&
                        task.externalEventId === event.id;
                });

                if (existingOnTargetDate) {
                    existingOnTargetDate.text = title;
                    existingOnTargetDate.description = description;
                    existingOnTargetDate.eventTime = start.eventTime;
                    existingOnTargetDate.externalUpdatedAt = event.updated || null;
                    touchedDates.add(start.dateKey);
                    return;
                }

                this.app.tasks[start.dateKey].push({
                    id: Date.now() + Math.random(),
                    text: title,
                    description,
                    completed: false,
                    recurring: 'none',
                    recurringId: null,
                    reminderEnabled: false,
                    reminderTime: null,
                    eventTime: start.eventTime,
                    color: 'none',
                    createdAt: new Date().toISOString(),
                    externalSource: 'google-calendar',
                    externalCalendarId: calendarId,
                    externalEventId: event.id,
                    externalUpdatedAt: event.updated || null
                });
                touchedDates.add(start.dateKey);
            }
        });

        existing.forEach((entry, key) => {
            const [entryCalendarId] = key.split('::');
            if (entryCalendarId !== calendarId) return;
            if (seenEventKeys.has(key)) return;
            const list = this.app.tasks[entry.dateKey] || [];
            this.app.tasks[entry.dateKey] = list.filter(t => t.id !== entry.task.id);
            touchedDates.add(entry.dateKey);
        });

        if (touchedDates.size > 0) {
            if (typeof this.app.saveTaskDateKeysImmediately === 'function') {
                await this.app.saveTaskDateKeysImmediately([...touchedDates]);
            } else {
                this.app.saveTasks();
            }
            this.app.renderWeek();
            this.app.renderBacklog();
        }

        this.app.saveSettings({
            googleCalendar: {
                ...(this.app.settings.googleCalendar || {}),
                lastSyncAt: new Date().toISOString()
            }
        });

        return { importedCount: seenEventKeys.size };
    }

    getStatusTextKey() {
        if (this.isNativeFileContext()) return 'googleCalendarUnsupported';
        if (!this.isConfigured()) return 'googleCalendarNotConfigured';
        if (this.hasValidToken()) return 'googleCalendarConnected';
        return 'googleCalendarNotConnected';
    }
}


    function createSettingsItem(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstElementChild;
    }

    function ensureSettingsUI(app) {
        if (document.getElementById('googleCalendarConnectBtn')) return;
        const settingsList = document.querySelector('#settingsModal .settings-list');
        if (!settingsList) return;

        const connectItem = createSettingsItem(`
            <div class="setting-item google-calendar-setting">
                <label data-i18n="googleCalendar">${app.t('googleCalendar')}</label>
                <div class="setting-inline-row">
                    <button type="button" class="setting-action-btn" id="googleCalendarConnectBtn" data-i18n="googleCalendarConnect">${app.t('googleCalendarConnect')}</button>
                    <button type="button" class="setting-action-btn secondary" id="googleCalendarDisconnectBtn" data-i18n="googleCalendarDisconnect">${app.t('googleCalendarDisconnect')}</button>
                </div>
                <div class="setting-help-text" id="googleCalendarStatus" data-i18n="googleCalendarNotConnected">${app.t('googleCalendarNotConnected')}</div>
            </div>
        `);

        const syncItem = createSettingsItem(`
            <div class="setting-item google-calendar-setting">
                <label for="googleCalendarSelect" data-i18n="googleCalendarSelect">${app.t('googleCalendarSelect')}</label>
                <div class="setting-inline-row calendar-sync-row">
                    <select class="setting-select" id="googleCalendarSelect">
                        <option value="" data-i18n-option="googleCalendarNone">${app.t('googleCalendarNone')}</option>
                    </select>
                    <button type="button" class="setting-action-btn" id="googleCalendarSyncBtn" data-i18n="googleCalendarSyncNow">${app.t('googleCalendarSyncNow')}</button>
                </div>
                <div class="setting-help-text" id="googleCalendarSyncStatus"></div>
            </div>
        `);

        settingsList.appendChild(connectItem);
        settingsList.appendChild(syncItem);
    }

    function setSyncStatus(app, message, type = '') {
        const syncStatusEl = document.getElementById('googleCalendarSyncStatus');
        if (!syncStatusEl) return;
        syncStatusEl.textContent = message || '';
        syncStatusEl.classList.remove('success', 'error');
        if (type) syncStatusEl.classList.add(type);
    }

    async function refreshSettingsUI(app) {
        if (!app.googleCalendar) return;

        const statusEl = document.getElementById('googleCalendarStatus');
        const syncStatusEl = document.getElementById('googleCalendarSyncStatus');
        const selectEl = document.getElementById('googleCalendarSelect');
        const connectBtn = document.getElementById('googleCalendarConnectBtn');
        const disconnectBtn = document.getElementById('googleCalendarDisconnectBtn');
        const syncBtn = document.getElementById('googleCalendarSyncBtn');
        const connectItem = connectBtn ? connectBtn.closest('.setting-item') : null;
        const syncItem = selectEl ? selectEl.closest('.setting-item') : null;

        if (app.isAndroidAppRuntime && app.isAndroidAppRuntime()) {
            if (connectItem) connectItem.style.display = 'none';
            if (syncItem) syncItem.style.display = 'none';
            return;
        }

        if (connectItem) connectItem.style.display = '';
        if (syncItem) syncItem.style.display = '';
        if (statusEl) statusEl.textContent = app.t(app.googleCalendar.getStatusTextKey());

        const connected = app.googleCalendar.hasValidToken();
        if (connectBtn) connectBtn.disabled = connected;
        if (disconnectBtn) disconnectBtn.disabled = !connected;
        if (syncBtn) syncBtn.disabled = !connected;
        if (syncStatusEl && !connected) {
            syncStatusEl.textContent = '';
            syncStatusEl.classList.remove('success', 'error');
        }

        if (!selectEl) return;

        const currentSelected = (app.settings.googleCalendar && app.settings.googleCalendar.selectedCalendarId) || '';
        selectEl.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = app.t('googleCalendarNone');
        selectEl.appendChild(placeholder);

        if (!connected) {
            selectEl.value = '';
            selectEl.disabled = true;
            return;
        }

        selectEl.disabled = false;
        const calendars = await app.googleCalendar.loadCalendars();
        calendars.forEach((calendar) => {
            const option = document.createElement('option');
            option.value = calendar.id;
            option.textContent = calendar.summary || calendar.id;
            selectEl.appendChild(option);
        });
        selectEl.value = currentSelected || '';
    }

    async function connect(app) {
        if (!app.googleCalendar) return;
        try {
            await app.googleCalendar.connect();
            await refreshSettingsUI(app);
            setSyncStatus(app, app.t('googleCalendarConnected'), 'success');
        } catch (e) {
            setSyncStatus(app, app.t('googleCalendarConnectError'), 'error');
        }
    }

    async function disconnect(app) {
        if (!app.googleCalendar) return;
        app.googleCalendar.disconnect();
        await refreshSettingsUI(app);
    }

    async function sync(app) {
        if (!app.googleCalendar) return;
        const selected = (app.settings.googleCalendar && app.settings.googleCalendar.selectedCalendarId) || '';
        if (!selected) {
            setSyncStatus(app, app.t('googleCalendarSelectRequired'), 'error');
            return;
        }
        try {
            const result = await app.googleCalendar.syncSelectedCalendar();
            await refreshSettingsUI(app);
            setSyncStatus(app, `${app.t('googleCalendarSyncDone')}: ${result.importedCount}`, 'success');
        } catch (e) {
            setSyncStatus(app, app.t('googleCalendarSyncError'), 'error');
        }
    }

    function startAutoSync(app) {
        if (!app.googleCalendar) return;
        if (app.isAndroidAppRuntime && app.isAndroidAppRuntime()) return;

        const runSync = async () => {
            const selected = (app.settings.googleCalendar && app.settings.googleCalendar.selectedCalendarId) || '';
            if (!selected) return;
            const now = new Date();
            const todayKey = app.formatDate(now);
            const lastAutoSyncDate = (app.settings.googleCalendar && app.settings.googleCalendar.lastAutoSyncDate) || null;
            if (lastAutoSyncDate === todayKey) return;
            try {
                await app.googleCalendar.ensureToken(false);
                await app.googleCalendar.syncSelectedCalendar();
                app.saveSettings({
                    googleCalendar: {
                        ...(app.settings.googleCalendar || {}),
                        lastAutoSyncDate: todayKey
                    }
                });
            } catch (e) {
                // Silent background sync.
            }
        };

        if (app.googleCalendarSyncTimeout) clearTimeout(app.googleCalendarSyncTimeout);

        const scheduleNextRun = () => {
            const now = new Date();
            const nextRun = new Date(now);
            nextRun.setHours(18, 0, 0, 0);
            if (now >= nextRun) nextRun.setDate(nextRun.getDate() + 1);
            app.googleCalendarSyncTimeout = setTimeout(async () => {
                await runSync();
                scheduleNextRun();
            }, Math.max(1000, nextRun.getTime() - now.getTime()));
        };

        const now = new Date();
        const today18 = new Date(now);
        today18.setHours(18, 0, 0, 0);
        if (now >= today18) setTimeout(runSync, 5000);
        scheduleNextRun();
    }

    window.SevenFlowPlugins.register({
        id: 'google-calendar',
        initApp(app) {
            app.googleCalendar = new SevenFlowGoogleCalendarManager(app);
            app.googleCalendarSyncTimeout = null;
            app.settings.googleCalendar = {
                selectedCalendarId: '',
                lastSyncAt: null,
                ...(app.settings.googleCalendar || {})
            };
            ensureSettingsUI(app);
        },
        appHooks: {
            bindEvents(app) {
                const connectBtn = document.getElementById('googleCalendarConnectBtn');
                const disconnectBtn = document.getElementById('googleCalendarDisconnectBtn');
                const syncBtn = document.getElementById('googleCalendarSyncBtn');
                const selectEl = document.getElementById('googleCalendarSelect');
                if (connectBtn) connectBtn.addEventListener('click', () => connect(app));
                if (disconnectBtn) disconnectBtn.addEventListener('click', () => disconnect(app));
                if (syncBtn) syncBtn.addEventListener('click', () => sync(app));
                if (selectEl) {
                    selectEl.addEventListener('change', (e) => {
                        app.settings.googleCalendar = {
                            ...(app.settings.googleCalendar || {}),
                            selectedCalendarId: e.target.value || ''
                        };
                    });
                }
            },
            onOpenSettings(app) {
                const selectEl = document.getElementById('googleCalendarSelect');
                if (selectEl) selectEl.value = (app.settings.googleCalendar && app.settings.googleCalendar.selectedCalendarId) || '';
                refreshSettingsUI(app).catch(() => {});
            },
            collectSettings(app) {
                const selectEl = document.getElementById('googleCalendarSelect');
                return {
                    googleCalendar: {
                        ...(app.settings.googleCalendar || {}),
                        selectedCalendarId: selectEl ? (selectEl.value || '') : ((app.settings.googleCalendar && app.settings.googleCalendar.selectedCalendarId) || '')
                    }
                };
            },
            afterInit(app) {
                startAutoSync(app);
            },
            afterBackupImport(app) {
                refreshSettingsUI(app).catch(() => {});
            },
            getTaskSourceIcon(app, task) {
                if (!task || task.externalSource !== 'google-calendar') return null;
                return {
                    className: 'task-source-icon task-source-icon-calendar',
                    title: app.t('googleCalendar'),
                    html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
                };
            }
        }
    });
})();
