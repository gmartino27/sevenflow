// SevenFlow - Phase 2
// Main Application Logic with Drag & Drop

class SevenFlowApp {
    constructor() {
        this.currentWeekOffset = 0;
        this.weekNavStartDate = null;
        this.weekNavPickerDate = null;
        this.weekNavPickerSelectedDate = null;
        this.weekNavPickerBound = false;
        this.currentView = 7;
        this.currentLanguage = 'en'; // Default language English
        this.tasks = {};
        this.settings = { 
            mainView: 'week',
            viewMode: 'week', 
            keyboardShortcut: 'ctrl+shift+q', 
            currentView: 7,
            language: 'en',
            timeFormat: '24h',
            theme: 'dark',
            notesPadText: '',
            pausedRecurring: []
        };
        this.backlogs = { '1': [], '2': [], '3': [], 'inbox': [] }; // Backlog columns + inbox
        this.backlogTitles = { '1': 'This week', '2': 'Next week', '3': 'Later' };
        // Delete tombstones per backlog column, keyed like mergeBacklogTasks() in
        // firestore.js ("id:<id>" / "source:<sourceUrl>"). Prevents a save's merge
        // step from resurrecting a task the user just deleted locally but that the
        // server hasn't confirmed removed yet. Persisted to localStorage (not just
        // in memory) so a reload/app-restart before the debounced save flushes
        // doesn't lose track of a pending deletion.
        this.backlogTombstones = this.loadBacklogTombstones();
        this.draggedTask = null;
        this.isDragging = false; // Track dragging state
        this.pendingRealtimeChanges = [];
        this.syncInterval = null;
        this.localBacklogsMutationAt = 0;
        this.notesPadSaveTimeout = null;
        this.reminderRescheduleTimeout = null;
        this.dragAutoScrollRaf = null;
        this.dragAutoScrollSpeed = 0;
        this.dragAutoScrollTarget = null;
        this.dragAutoScrollThreshold = 110;
        this.dragAutoScrollMinSpeed = 10;
        this.dragAutoScrollMaxSpeed = 22;
        this.selectionMode = false;
        this.selectionModePinned = false;
        this.selectedTasks = new Set();
        this.selectedTaskMeta = new Map();
        this.currentModalTask = null;
        this.contextMenuTaskRef = null;
        this.pendingUndo = null;
        this.notesPadRealtimeUnsubscribe = null;
        this.focusModeActive = false;
        this.modalOptionalSections = { deadline: false, tags: false, attachments: false };
        this.attachmentMaxSizeBytes = 5 * 1024 * 1024;
        this.allowedAttachmentExtensions = new Set([
            'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif',
            'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'txt', 'csv', 'rtf', 'odt', 'ods', 'odp'
        ]);
        this.allowedAttachmentMimeTypes = new Set([
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'application/rtf',
            'application/vnd.oasis.opendocument.text',
            'application/vnd.oasis.opendocument.spreadsheet',
            'application/vnd.oasis.opendocument.presentation'
        ]);
        this.storageApi = null;
        this.storageInstance = null;
        this.confirmCallback = null;
        this.firestoreManager = null;
        this.currentUser = null;
        this.isInitialized = false;
        this.lastActiveDayKey = this.formatDate(new Date());
        this.saveTasksTimeout = null; // Debounce timer for saving tasks
        this.saveDateTimeouts = {}; // Debounce timers for individual date saves
        this.localDateMutationAt = {}; // Track local edits per date
        this.realtimeEmptyGuardMs = 60000; // Protect local UI from stale empty realtime snapshots
        this.saveBacklogsTimeout = null; // Debounce timer for saving backlogs
        this.loadedDateRanges = []; // Track which date ranges are already loaded
        this.i18n = window.SevenFlowI18nManager
            ? new window.SevenFlowI18nManager(this)
            : null;
        this.mobileNav = window.SevenFlowMobileNavManager
            ? new window.SevenFlowMobileNavManager(this)
            : null;
        this.notifications = window.SevenFlowNotificationsManager
            ? new window.SevenFlowNotificationsManager(this)
            : null;
        this.pwa = window.SevenFlowPwaManager
            ? new window.SevenFlowPwaManager()
            : null;
        this.dragDrop = new SevenFlowDragDropManager(this);

        this.initWithAuth();
    }

    setModalVisibility(modalElement, isVisible) {
        if (!modalElement) return;
        modalElement.style.display = isVisible ? 'flex' : 'none';
        this.updateModalScrollLock();
    }

    updateModalScrollLock() {
        const modalIds = ['taskModal', 'settingsModal', 'confirmModal', 'rambleModal'];
        const hasOpenModal = modalIds.some((id) => {
            const el = document.getElementById(id);
            return !!el && el.style.display === 'flex';
        });
        document.body.classList.toggle('modal-open', hasOpenModal);
    }

    getCurrentPlan() {
        return 'open-source';
    }

    hasFeature(featureKey) {
        return true;
    }

    notifyFeatureLocked(featureKey) {
        void featureKey;
    }

    async initWithAuth() {
        const appLoading = document.getElementById('appLoading');
        const appContainer = document.getElementById('app');

        // Initialize auth manager
        await authManager.init();
        
        let initialAuthCheckDone = false;
        
        // Check if user is logged in
        authManager.onAuthChange(async (user) => {
            // First auth state change - this is the initial check
            if (!initialAuthCheckDone) {
                initialAuthCheckDone = true;
                
                if (!user) {
                    // Not logged in, redirect to login
                    window.location.href = 'login.html';
                    return;
                }
                
                // User is logged in, continue initialization
                // Hide splash and show app
                if (appLoading) appLoading.style.display = 'none';
                if (appContainer) appContainer.style.visibility = 'visible';
                this.currentUser = user;
                
                // Initialize the active backend. Firebase stays the default; local
                // mode is for self-hosted tests without Firebase.
                const Manager = (window.sevenflowConfig && window.sevenflowConfig.localAuth && window.LocalTaskManager)
                    ? window.LocalTaskManager
                    : FirestoreTaskManager;
                this.firestoreManager = new Manager();
                await this.firestoreManager.init(user.uid);
                
                // Load current week (from Monday) + 1 week ahead
                const today = new Date();
                const currentDay = today.getDay();
                const diff = currentDay === 0 ? -6 : 1 - currentDay; // Monday as first day

                const monday = new Date(today);
                monday.setDate(today.getDate() + diff);
                monday.setHours(0, 0, 0, 0);

                const endDate = new Date(monday);
                endDate.setDate(monday.getDate() + 13); // 2 weeks (14 days)

                const isOnline = navigator.onLine;

                // Load tasks - fall back to localStorage when offline
                const remoteTasks = isOnline
                    ? await this.firestoreManager.loadTasksForDateRange(monday, endDate)
                    : {};
                this.tasks = Object.keys(remoteTasks).length ? remoteTasks : this.loadTasksLocal();

                // Mark this range as loaded
                this.loadedDateRanges.push({
                    start: new Date(monday),
                    end: new Date(endDate)
                });

                // Load settings - fall back to localStorage when offline
                const remoteSettings = isOnline ? await this.firestoreManager.loadSettings() : {};
                const settings = Object.keys(remoteSettings).length > 1 ? remoteSettings : this.loadSettingsLocal();
                this.settings = { ...this.settings, ...settings };
                this.pausedRecurring = Array.isArray(this.settings.pausedRecurring) ? this.settings.pausedRecurring : [];
                this.settings.mainView = this.settings.mainView === 'inbox' ? 'inbox' : 'week';
                // Desktop and mobile/app have separate day-count preferences (desktop
                // never offers 1-day, mobile's default is 1-day) - stored under
                // different keys so picking one on one platform doesn't silently
                // change the other's view next time it's opened.
                this.currentView = window.innerWidth <= 768
                    ? (this.settings.mobileCurrentView || 1)
                    : (this.settings.currentView || 7);
                this.settings.showBacklog = this.normalizeUnderWeekSectionMode(this.settings.showBacklog);
                this.settings.notesPadText = typeof this.settings.notesPadText === 'string' ? this.settings.notesPadText : '';
                this.applyTheme(this.settings.theme || 'dark');

                // Use language from login if no settings yet
                const loginLanguage = localStorage.getItem('sevenflow_language');
                this.currentLanguage = this.settings.language || loginLanguage || 'en';

                // Save language to settings if it came from login
                if (!this.settings.language && loginLanguage) {
                    this.saveSettings({ language: loginLanguage });
                }

                // Ensure translations exist
                if (typeof translations === 'undefined' || !translations[this.currentLanguage]) {
                    console.error('[i18n] Translations not loaded, using English');
                    this.currentLanguage = 'en';
                }
                
                // Update active button
                document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
                const activeBtn = document.getElementById(`view${this.currentView}`);
                if (activeBtn) activeBtn.classList.add('active');
                
                // Apply mobile nav labels visibility
                this.applyMobileNavLabelsVisibility(this.settings.mobileNavLabels || 'show');

                // Load backlogs - fall back to localStorage when offline
                this.backlogs = (isOnline ? await this.firestoreManager.loadBacklogs() : null)
                    || this.loadBacklogsLocal();
                if (!this.backlogs.inbox) this.backlogs.inbox = [];
                this.backlogTitles = (isOnline ? await this.firestoreManager.loadBacklogTitles() : null)
                    || this.loadBacklogTitlesLocal();
                
                // Setup real-time sync for current week
                await this.setupRealtimeSync(monday, endDate);
                await this.setupNotesPadRealtimeSync();

                // Keep visible dates plus backlog/inbox in sync with background API writes.
                this.startBackgroundSync();

                // Start the app
                this.init();
                return;
            }
            
            // Subsequent auth changes (user logged out)
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
        });
    }

    init() {
        this.initPlugins();
        // Translate UI first
        this.translateUI();
        this.ensureMultiSelectBar();
        this.setupResumeDayCheck();
        
        // Check if we need to move incomplete tasks from yesterday
        this.checkAndMoveIncompleteTasks();

        this.renderWeek();
        this.renderBacklog();
        this.renderInbox();
        this.dragDrop.setupBacklogDropZones();
        this.dragDrop.setupInboxDropZone();
        this.setupEventListeners();
        this.setupBacklogTitleListeners();
        this.setupPWA();
        this.requestNotificationPermission();
        this.startNotificationChecker(); // Check for notifications every minute
        this.scheduleAllReminders(); // Schedule all reminders with AlarmManager (Android)
        this.startMidnightTimer(); // Auto-update at midnight
        this.runPluginHook('afterInit');
        
        // Initialize search
        this.searchManager = new window.SearchManager(this);
        
        // Initialize Ramble
        this.setupRamble();

        // Setup mobile navigation (after searchManager is ready)
        this.setupMobileNav();

        // Apply under-week section mode from settings
        this.applyBacklogVisibility(this.settings.showBacklog || 'backlog');
        this.applyMainView(this.settings.mainView || 'week');
        this.isInitialized = true;
    }

    getMainView() {
        return this.settings.mainView === 'inbox' ? 'inbox' : 'week';
    }

    applyMainView(view) {
        const mainView = view === 'inbox' ? 'inbox' : 'week';
        this.settings.mainView = mainView;

        const weekGrid = document.getElementById('weekGrid');
        const backlogSection = document.querySelector('.backlog-section');
        const notesSection = document.getElementById('notesSection');
        const inboxView = document.getElementById('inboxView');
        const inboxToggleBtn = document.getElementById('inboxToggleBtn');

        if (weekGrid) weekGrid.style.display = mainView === 'week' ? '' : 'none';
        if (backlogSection) backlogSection.style.display = mainView === 'week' ? '' : 'none';
        if (notesSection) notesSection.style.display = mainView === 'week' ? '' : 'none';
        if (inboxView) inboxView.style.display = mainView === 'inbox' ? 'flex' : 'none';
        if (inboxToggleBtn) inboxToggleBtn.classList.toggle('active', mainView === 'inbox');

        this.saveSettings({ mainView: mainView });
        if (mainView === 'inbox') {
            this.syncBacklogsNow({ render: true }).catch(() => {
                this.renderInbox();
            });
            return;
        }
        this.applyBacklogVisibility(this.settings.showBacklog || 'backlog');
        this.renderBacklog();
    }

    normalizeUnderWeekSectionMode(value) {
        if (value === 'hide') return 'none';
        if (value === 'show') return 'backlog';
        if (value === 'none' || value === 'backlog' || value === 'notes') return value;
        return 'backlog';
    }

    toggleMainView() {
        this.applyMainView(this.getMainView() === 'week' ? 'inbox' : 'week');
    }

    createInboxTaskElement(task) {
        const wrap = document.createElement('div');
        wrap.className = 'inbox-item-wrap';

        const taskEl = this.createBacklogTaskElement('inbox', task);
        wrap.appendChild(taskEl);

        const isInboxGroupTitle = typeof task?.text === 'string' && task.text.trim().startsWith('#');
        if (taskEl.classList.contains('divider') || task.text === '---' || isInboxGroupTitle) {
            wrap.classList.add('inbox-structural-item');
            return wrap;
        }

        const actions = document.createElement('div');
        actions.className = 'inbox-item-actions';

        const createBtn = (labelKey, handler) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inbox-action-btn';
            btn.textContent = this.t(labelKey);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handler();
            });
            return btn;
        };

        actions.appendChild(createBtn('today', () => this.moveInboxTaskToDate(task.id, 0)));
        actions.appendChild(createBtn('tomorrow', () => this.moveInboxTaskToDate(task.id, 1)));
        actions.appendChild(createBtn('backlog', () => this.moveInboxTaskToBacklogFirst(task.id)));

        const deleteBtn = taskEl.querySelector('.task-delete');
        if (deleteBtn && deleteBtn.parentNode === taskEl) {
            taskEl.insertBefore(actions, deleteBtn);
        } else {
            taskEl.appendChild(actions);
        }
        return wrap;
    }

    renderInbox() {
        const container = document.getElementById('inboxList');
        const countEl = document.getElementById('inboxCount');
        if (!container) return;

        const inboxTasks = this.backlogs.inbox || [];
        if (countEl) {
            const visibleTaskCount = inboxTasks.filter(task => {
                const text = String(task?.text || '').trim();
                return text !== '---' && !text.startsWith('#');
            }).length;
            countEl.textContent = String(visibleTaskCount);
        }

        container.innerHTML = '';

        if (inboxTasks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inbox-empty';
            empty.textContent = this.t('inboxEmpty');
            container.appendChild(empty);
            return;
        }

        inboxTasks.forEach((task) => {
            container.appendChild(this.createInboxTaskElement(task));
        });
    }

    addInboxTask(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) return null;
        if (!this.backlogs.inbox) this.backlogs.inbox = [];

        const task = {
            id: Date.now() + Math.random(),
            text: trimmed,
            description: '',
            completed: false,
            reminderEnabled: false,
            reminderTime: null,
            createdAt: new Date().toISOString(),
            tags: [],
            subtasks: [],
            attachments: []
        };
        this.backlogs.inbox.unshift(task);
        this.saveBacklogs();
        this.renderInbox();
        return task;
    }

    moveInboxTaskToDate(taskId, dayOffset) {
        const target = new Date();
        target.setHours(0, 0, 0, 0);
        target.setDate(target.getDate() + dayOffset);
        this.moveTaskFromBacklog('inbox', taskId, target);
        this.renderWeek();
        this.renderBacklog();
        this.renderInbox();
    }

    moveInboxTaskToBacklogFirst(taskId) {
        this.moveBacklogTask('inbox', taskId, '1');
        this.renderBacklog();
        this.renderInbox();
    }

    reorderInboxTask(taskId, targetIndex) {
        const inbox = this.backlogs.inbox || [];
        const currentIndex = inbox.findIndex(t => t.id === taskId);
        if (currentIndex === -1) return false;

        const [task] = inbox.splice(currentIndex, 1);
        const clampedIndex = this.clampInsertIndex(targetIndex, inbox.length);
        inbox.splice(clampedIndex, 0, task);
        this.saveBacklogs();
        return true;
    }

    startEditingInboxGroupTitle(taskItem, backlogId, task) {
        if (!taskItem || !task || backlogId !== 'inbox') return;
        if (taskItem.dataset.editing === 'true') return;
        taskItem.dataset.editing = 'true';

        const content = taskItem.querySelector('.task-content');
        if (!content) {
            delete taskItem.dataset.editing;
            return;
        }

        const currentTitle = String(task.text || '').trim().replace(/^#\s*/, '');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-input';
        // Tells mobile keyboards/WebViews this isn't a "next field" in a sequence —
        // without it, some Android WebViews auto-advance focus to whatever focusable
        // element follows in DOM order (e.g. the notes textarea after the last day).
        input.setAttribute('enterkeyhint', 'done');
        input.value = currentTitle;
        input.placeholder = '#Titel';

        content.innerHTML = '';
        content.appendChild(input);

        let finished = false;
        const finish = (save) => {
            if (finished) return;
            finished = true;
            delete taskItem.dataset.editing;

            if (save) {
                const value = input.value.trim();
                if (!value) {
                    this.deleteBacklogTask(backlogId, task.id);
                } else {
                    task.text = `#${value}`;
                    this.saveBacklogs();
                }
            }

            this.renderBacklog();
            this.renderInbox();
        };

        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        });

        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }


    setupResumeDayCheck() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.handleAppResume();
            }
        });

        window.addEventListener('focus', () => {
            this.handleAppResume();
        });
    }

    handleAppResume() {
        if (!this.isInitialized) return;

        const todayKey = this.formatDate(new Date());
        if (this.lastActiveDayKey === todayKey) return;
        this.lastActiveDayKey = todayKey;

        this.checkAndMoveIncompleteTasks();
        this.renderWeek();
        this.renderBacklog();
        this.updateTodayButton();
    }

    ensureMultiSelectBar() {
        if (document.getElementById('multiSelectBar')) return;

        const bar = document.createElement('div');
        bar.id = 'multiSelectBar';
        bar.className = 'multi-select-bar';
        bar.innerHTML = `
            <span class="multi-select-count">0</span>
            <button type="button" class="multi-select-cancel">Abbrechen</button>
        `;

        const cancelBtn = bar.querySelector('.multi-select-cancel');
        cancelBtn.addEventListener('click', () => this.clearTaskSelection());

        document.body.appendChild(bar);
        this.updateMultiSelectBar();
    }

    getTaskSelectionKey(dateKey, taskId) {
        return `day:${dateKey}:${taskId}`;
    }

    getBacklogSelectionKey(backlogId, taskId) {
        return `backlog:${backlogId}:${taskId}`;
    }

    setSelectionMode(enabled) {
        if (enabled && !this.hasFeature('multiselect')) {
            this.notifyFeatureLocked('multiselect');
            return;
        }
        this.selectionMode = enabled;
        document.body.classList.toggle('selection-mode', enabled);
        this.updateMultiSelectBar();
    }

    getSelectedCountText(count) {
        const t = translations[this.currentLanguage] || translations.en;
        const suffix = t.selectedCountSuffix || 'selected';
        return `${count} ${suffix}`;
    }

    updateMultiSelectBar() {
        const bar = document.getElementById('multiSelectBar');
        if (!bar) return;

        this.pruneSelectedTasks();
        const count = this.selectedTasks.size;

        bar.classList.toggle('visible', this.selectionMode);
        const countLabel = bar.querySelector('.multi-select-count');
        if (countLabel) {
            countLabel.textContent = this.getSelectedCountText(count);
        }
    }

    clearTaskSelection() {
        this.selectedTasks.clear();
        this.selectedTaskMeta.clear();
        this.selectionModePinned = false;
        this.setSelectionMode(false);
        document.querySelectorAll('.task-item.selected').forEach(el => el.classList.remove('selected'));
    }

    toggleTaskSelection(key, meta = null) {
        if (!this.selectionMode) this.setSelectionMode(true);

        if (this.selectedTasks.has(key)) {
            this.selectedTasks.delete(key);
            this.selectedTaskMeta.delete(key);
        } else {
            this.selectedTasks.add(key);
            if (meta) this.selectedTaskMeta.set(key, meta);
        }

        if (this.selectedTasks.size === 0 && !this.selectionModePinned) {
            this.setSelectionMode(false);
        } else {
            this.updateMultiSelectBar();
        }
    }

    isTaskSelected(key) {
        return this.selectedTasks.has(key);
    }

    attachLongPressSelection(taskItem, key, meta) {
        // Mobile selection is handled via explicit selection mode + tap.
        return () => false;
    }

    parseDateKey(dateKey) {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    pruneSelectedTasks() {
        const toRemove = [];

        this.selectedTasks.forEach((key) => {
            const meta = this.selectedTaskMeta.get(key);
            if (!meta) {
                toRemove.push(key);
                return;
            }
            const { type, sourceId, taskId } = meta;

            if (type === 'day') {
                const tasks = this.tasks[sourceId] || [];
                if (!tasks.some(t => String(t.id) === taskId)) toRemove.push(key);
            } else if (type === 'backlog') {
                const tasks = this.backlogs[sourceId] || [];
                if (!tasks.some(t => String(t.id) === taskId)) toRemove.push(key);
            }
        });

        toRemove.forEach(key => {
            this.selectedTasks.delete(key);
            this.selectedTaskMeta.delete(key);
        });
        if (this.selectedTasks.size === 0 && this.selectionMode && !this.selectionModePinned) {
            this.setSelectionMode(false);
        }
    }

    collectSelectedEntries() {
        this.pruneSelectedTasks();
        const entries = [];

        this.selectedTasks.forEach((key) => {
            const meta = this.selectedTaskMeta.get(key);
            if (!meta) return;
            const { type, sourceId, taskId } = meta;

            if (type === 'day') {
                const tasks = this.tasks[sourceId] || [];
                const task = tasks.find(t => String(t.id) === taskId);
                if (task) entries.push({ type, sourceId, taskId, task });
            } else if (type === 'backlog') {
                const tasks = this.backlogs[sourceId] || [];
                const task = tasks.find(t => String(t.id) === taskId);
                if (task) entries.push({ type, sourceId, taskId, task });
            }
        });

        return entries;
    }

    moveSelectedTasksToDay(targetDate, targetIndex = -1) {
        const entries = this.collectSelectedEntries();
        if (entries.length === 0) return;

        const targetDateKey = this.formatDate(targetDate);
        if (!this.tasks[targetDateKey]) this.tasks[targetDateKey] = [];

        const touchedDates = new Set([targetDateKey]);
        const touchedBacklogs = new Set();

        const originalTargetTasks = [...this.tasks[targetDateKey]];
        const selectedTargetIds = new Set(
            entries
                .filter(e => e.type === 'day' && e.sourceId === targetDateKey)
                .map(e => e.taskId)
        );
        const beforeCount = targetIndex >= 0
            ? originalTargetTasks
                  .slice(0, targetIndex)
                  .filter(t => selectedTargetIds.has(String(t.id)))
                  .length
            : 0;
        let effectiveTargetIndex = targetIndex >= 0 ? Math.max(0, targetIndex - beforeCount) : -1;

        entries.forEach((entry) => {
            if (entry.type === 'day') {
                const list = this.tasks[entry.sourceId] || [];
                this.tasks[entry.sourceId] = list.filter(t => String(t.id) !== entry.taskId);
                touchedDates.add(entry.sourceId);
            } else {
                const list = this.backlogs[entry.sourceId] || [];
                this.backlogs[entry.sourceId] = list.filter(t => String(t.id) !== entry.taskId);
                touchedBacklogs.add(entry.sourceId);
            }
        });

        const movedTasks = entries.map(entry => entry.task);
        if (effectiveTargetIndex >= 0 && effectiveTargetIndex <= this.tasks[targetDateKey].length) {
            this.tasks[targetDateKey].splice(effectiveTargetIndex, 0, ...movedTasks);
        } else {
            this.tasks[targetDateKey].push(...movedTasks);
        }

        touchedDates.forEach((dateKey) => {
            this.saveTasksForDate(this.parseDateKey(dateKey));
        });
        if (touchedBacklogs.size > 0) this.saveBacklogs();

        this.clearTaskSelection();
        this.renderWeek();
        this.renderBacklog();
    }

    moveSelectedTasksToBacklog(targetBacklogId, targetIndex = -1) {
        const entries = this.collectSelectedEntries();
        if (entries.length === 0) return;

        if (!this.backlogs[targetBacklogId]) this.backlogs[targetBacklogId] = [];

        const touchedDates = new Set();
        const touchedBacklogs = new Set([targetBacklogId]);

        const originalTargetTasks = [...this.backlogs[targetBacklogId]];
        const selectedTargetIds = new Set(
            entries
                .filter(e => e.type === 'backlog' && e.sourceId === targetBacklogId)
                .map(e => e.taskId)
        );
        const beforeCount = targetIndex >= 0
            ? originalTargetTasks
                  .slice(0, targetIndex)
                  .filter(t => selectedTargetIds.has(String(t.id)))
                  .length
            : 0;
        let effectiveTargetIndex = targetIndex >= 0 ? Math.max(0, targetIndex - beforeCount) : -1;

        entries.forEach((entry) => {
            if (entry.type === 'day') {
                const list = this.tasks[entry.sourceId] || [];
                this.tasks[entry.sourceId] = list.filter(t => String(t.id) !== entry.taskId);
                touchedDates.add(entry.sourceId);
            } else {
                const list = this.backlogs[entry.sourceId] || [];
                this.backlogs[entry.sourceId] = list.filter(t => String(t.id) !== entry.taskId);
                touchedBacklogs.add(entry.sourceId);
            }
        });

        const movedTasks = entries.map(entry => entry.task);
        if (effectiveTargetIndex >= 0 && effectiveTargetIndex <= this.backlogs[targetBacklogId].length) {
            this.backlogs[targetBacklogId].splice(effectiveTargetIndex, 0, ...movedTasks);
        } else {
            this.backlogs[targetBacklogId].push(...movedTasks);
        }

        touchedDates.forEach((dateKey) => {
            this.saveTasksForDate(this.parseDateKey(dateKey));
        });
        this.saveBacklogs();

        this.clearTaskSelection();
        this.renderWeek();
        this.renderBacklog();
    }
    
    startMidnightTimer() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const msUntilMidnight = tomorrow - now;
        
        setTimeout(() => {
            // Check if auto-move is enabled and move incomplete tasks
            if (this.settings.autoMoveIncompleteTasks === 'enabled') {
                this.moveIncompleteTasksToNextDay();
                // Update last check date in settings
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                this.saveSettings({
                    lastAutoMoveCheck: this.formatDate(today)
                });
            }

            // Update the view at midnight
            this.renderWeek();
            
            // Update mobile nav "today" button
            this.updateTodayButton();
            
            // Set up next midnight timer
            this.startMidnightTimer();
        }, msUntilMidnight);
    }
    
    updateTodayButton() {
        const mobileToday = document.getElementById('mobileToday');
        if (mobileToday) {
            const today = new Date().getDate();
            const svg = mobileToday.querySelector('svg text');
            if (svg) svg.textContent = today;
        }
    }

    async goToTodayAndFocus() {
        this.weekNavStartDate = null;
        this.currentWeekOffset = 0;
        await this.renderWeek();
        this.scrollToTodayColumn();
    }

    scrollToTodayColumn() {
        requestAnimationFrame(() => {
            const todayColumn = document.querySelector('.day-column.today');
            if (todayColumn) {
                todayColumn.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest'
                });
                return;
            }

            const weekContainer = document.querySelector('.week-container');
            if (weekContainer && weekContainer.scrollHeight > weekContainer.clientHeight) {
                weekContainer.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    blurActiveElement() {
        const activeElement = document.activeElement;
        if (activeElement && typeof activeElement.blur === 'function') {
            activeElement.blur();
        }
    }

    // Date Utilities
    getWeekDates(offset = 0) {
        if (this.weekNavStartDate instanceof Date) {
            const baseDate = new Date(this.weekNavStartDate);
            baseDate.setHours(0, 0, 0, 0);

            const startDate = new Date(baseDate);
            startDate.setDate(baseDate.getDate() + (offset * this.currentView));

            const dates = [];
            for (let i = 0; i < this.currentView; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                dates.push(date);
            }
            return dates;
        }

        const viewMode = this.settings.viewMode || 'week';
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (viewMode === 'rolling') {
            // Rolling view: start from today + show next N days
            const dates = [];
            const rollingStep = this.currentView === 3 ? 2 : this.currentView;
            for (let i = 0; i < this.currentView; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i + (offset * rollingStep));
                dates.push(date);
            }
            return dates;
        }
        
        // Week view: traditional Monday-Sunday
        const currentDay = today.getDay();
        const diff = currentDay === 0 ? -6 : 1 - currentDay; // Monday as first day
        
        const monday = new Date(today);
        monday.setDate(today.getDate() + diff + (offset * 7));
        monday.setHours(0, 0, 0, 0);
        
        const dates = [];

        if (this.currentView === 1) {
            // Show just today, offset steps one day at a time (not one week)
            const date = new Date(today);
            date.setDate(today.getDate() + offset);
            dates.push(date);
        } else if (this.currentView === 3) {
            // Show 3 days: yesterday, today, tomorrow (centered on today)
            for (let i = -1; i <= 1; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i + (offset * 3));
                dates.push(date);
            }
        } else if (this.currentView === 5) {
            // Show 5 weekdays (Mon-Fri)
            for (let i = 0; i < 5; i++) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + i);
                dates.push(date);
            }
        } else {
            // Show full week (Mon-Sun)
            for (let i = 0; i < 7; i++) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + i);
                dates.push(date);
            }
        }
        
        return dates;
    }

    openWeekNavDatePicker(anchorElement) {
        const picker = document.getElementById('weekNavDatePicker');
        if (!picker || !anchorElement) return;

        const visibleDates = this.getWeekDates(this.currentWeekOffset);
        const baseDate = this.weekNavStartDate
            ? new Date(this.weekNavStartDate)
            : (visibleDates[0] ? new Date(visibleDates[0]) : new Date());

        baseDate.setHours(0, 0, 0, 0);
        this.weekNavPickerSelectedDate = new Date(baseDate);
        this.weekNavPickerDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);

        this.renderWeekNavDatePicker();
        picker.classList.add('active');

        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            picker.style.top = '50%';
            picker.style.left = '50%';
            picker.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const rect = anchorElement.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - 320);
        picker.style.top = `${rect.bottom + 8}px`;
        picker.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
        picker.style.transform = 'none';
    }

    closeWeekNavDatePicker() {
        const picker = document.getElementById('weekNavDatePicker');
        if (picker) picker.classList.remove('active');
    }

    renderWeekNavDatePicker() {
        const monthEl = document.getElementById('weekNavPickerMonth');
        const daysEl = document.getElementById('weekNavPickerDays');
        if (!monthEl || !daysEl || !(this.weekNavPickerDate instanceof Date)) return;

        const monthLabel = this.weekNavPickerDate.toLocaleDateString(
            this.currentLanguage === 'de' ? 'de-CH' : 'en-US',
            { month: 'long', year: 'numeric' }
        );
        monthEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        daysEl.innerHTML = '';

        const firstDay = new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth(), 1);
        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;

        const daysInMonth = new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth() + 1, 0).getDate();
        const prevMonthDays = new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth(), 0).getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = this.weekNavPickerSelectedDate ? new Date(this.weekNavPickerSelectedDate) : null;
        if (selected) selected.setHours(0, 0, 0, 0);

        const addDayEl = (day, dateObj, isOtherMonth) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'datepicker-day';
            if (isOtherMonth) dayEl.classList.add('other-month');
            if (dateObj.getTime() === today.getTime()) dayEl.classList.add('today');
            if (selected && dateObj.getTime() === selected.getTime()) dayEl.classList.add('selected');
            dayEl.textContent = String(day);
            dayEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                this.weekNavStartDate = new Date(dateObj);
                this.weekNavStartDate.setHours(0, 0, 0, 0);
                this.currentWeekOffset = 0;
                this.closeWeekNavDatePicker();
                await this.renderWeek();
            });
            daysEl.appendChild(dayEl);
        };

        for (let i = startDay - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            addDayEl(day, new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth() - 1, day), true);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            addDayEl(day, new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth(), day), false);
        }

        const totalCells = daysEl.children.length;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            addDayEl(day, new Date(this.weekNavPickerDate.getFullYear(), this.weekNavPickerDate.getMonth() + 1, day), true);
        }
    }

    bindWeekNavDatePicker() {
        if (this.weekNavPickerBound) return;
        this.weekNavPickerBound = true;

        const picker = document.getElementById('weekNavDatePicker');
        const prevBtn = document.getElementById('weekNavPrevMonth');
        const nextBtn = document.getElementById('weekNavNextMonth');
        const todayBtn = document.getElementById('weekNavPickerToday');
        const clearBtn = document.getElementById('weekNavPickerClear');

        if (!picker || !prevBtn || !nextBtn || !todayBtn || !clearBtn) return;

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!(this.weekNavPickerDate instanceof Date)) this.weekNavPickerDate = new Date();
            this.weekNavPickerDate.setMonth(this.weekNavPickerDate.getMonth() - 1);
            this.renderWeekNavDatePicker();
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!(this.weekNavPickerDate instanceof Date)) this.weekNavPickerDate = new Date();
            this.weekNavPickerDate.setMonth(this.weekNavPickerDate.getMonth() + 1);
            this.renderWeekNavDatePicker();
        });

        todayBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            this.weekNavStartDate = today;
            this.currentWeekOffset = 0;
            this.closeWeekNavDatePicker();
            await this.renderWeek();
        });

        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWeekNavDatePicker();
        });

        document.addEventListener('click', (e) => {
            if (!picker.classList.contains('active')) return;
            const weekRange = document.querySelector('.week-range');
            if (picker.contains(e.target)) return;
            if (weekRange && weekRange.contains(e.target)) return;
            this.closeWeekNavDatePicker();
        });
    }

    formatDate(date) {
        // Use local timezone, not UTC
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDisplayDate(date) {
        if (!date) return '—'; // Return dash if date is null
        const options = { day: '2-digit', month: '2-digit', year: '2-digit' };
        return date.toLocaleDateString('de-DE', options);
    }

    formatTime(time24h) {
        if (!time24h) return '';

        const format = this.settings.timeFormat || '24h';

        if (format === '24h') {
            return time24h;
        }

        // Convert to 12h format
        const [hours, minutes] = time24h.split(':');
        let hour = parseInt(hours);
        const period = hour >= 12 ? 'PM' : 'AM';

        if (hour === 0) {
            hour = 12;
        } else if (hour > 12) {
            hour -= 12;
        }

        return `${hour}:${minutes} ${period}`;
    }

    getDayName(date) {
        if (!this.i18n) {
            const fallbackDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return fallbackDays[date.getDay()];
        }
        return this.i18n.getDayName(date);
    }
    
    // Translation Methods
    t(key) {
        if (!this.i18n) return key;
        return this.i18n.t(key);
    }
    
    setLanguage(lang) {
        if (!this.i18n) return;
        this.i18n.setLanguage(lang);
    }
    
    translateUI() {
        if (!this.i18n) return;
        this.i18n.translateUI();
    }

    initPlugins() {
        if (window.SevenFlowPlugins) {
            window.SevenFlowPlugins.initApp(this);
        }
    }

    runPluginHook(hookName, ...args) {
        if (window.SevenFlowPlugins) {
            window.SevenFlowPlugins.runAppHook(hookName, this, ...args);
        }
    }

    collectPluginSettings() {
        return window.SevenFlowPlugins ? window.SevenFlowPlugins.collectSettings(this) : {};
    }

    preparePluginBackupSettings(settings) {
        return window.SevenFlowPlugins ? window.SevenFlowPlugins.prepareBackupSettings(this, settings) : settings;
    }

    getTaskSourceIcon(task) {
        return window.SevenFlowPlugins ? window.SevenFlowPlugins.getTaskSourceIcon(this, task) : null;
    }
    
    updateBacklogTitlesFromLanguage() {
        if (!this.i18n) return;
        this.i18n.updateBacklogTitlesFromLanguage();
    }

    isToday(date) {
        const today = new Date();
        // Compare local dates, not UTC
        return date.getFullYear() === today.getFullYear() &&
               date.getMonth() === today.getMonth() &&
               date.getDate() === today.getDate();
    }

    getWeekRange(dates) {
        const start = this.formatDisplayDate(dates[0]);
        const end = this.formatDisplayDate(dates[dates.length - 1]); // Use last element
        return `${start} - ${end}`;
    }

    // Task Management
    loadTasks() {
        // Now handled by Firestore in initWithAuth
        return {};
    }

    loadTasksLocal() {
        try {
            const saved = localStorage.getItem('sevenflow_tasks');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Error loading tasks:', e);
            return {};
        }
    }

    saveTasks() {
        // Clear any pending save
        if (this.saveTasksTimeout) {
            clearTimeout(this.saveTasksTimeout);
        }

        // Debounce saves to prevent quota exhaustion - increased to 2 seconds
        this.saveTasksTimeout = setTimeout(() => {
            const dateKeys = Object.keys(this.tasks || {});
            this.saveTaskDateKeysImmediately(dateKeys).then(() => {
                this.scheduleAllReminders();
            }).catch(err => {
                console.error('[Save] Error saving tasks to Firestore:', err);
                try {
                    localStorage.setItem('sevenflow_tasks', JSON.stringify(this.tasks));
                    this.scheduleAllReminders();
                } catch (e) {
                    console.error('[Save] Error saving to localStorage:', e);
                }
            });
        }, 2000);
    }

    isDateKeyLoaded(dateKey) {
        const date = this.parseDateKey(dateKey);
        return this.loadedDateRanges.some((range) => {
            return date >= range.start && date <= range.end;
        });
    }

    mergeRemoteTasksIntoLocalDate(remoteTasks, localTasks) {
        const localList = Array.isArray(localTasks) ? localTasks : [];
        const remoteList = Array.isArray(remoteTasks) ? remoteTasks : [];
        const localIds = new Set(localList.map((task) => String(task.id)));
        const merged = [...localList];

        remoteList.forEach((task) => {
            if (!localIds.has(String(task.id))) {
                merged.push(task);
            }
        });

        return merged;
    }

    markDateRangeLoaded(startDate, endDate) {
        if (!(startDate instanceof Date) || !(endDate instanceof Date)) return;

        this.loadedDateRanges.push({
            start: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()),
            end: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
        });
    }

    async hydrateRemoteTasksForDateRange(startDate, endDate) {
        if (!this.firestoreManager || !this.currentUser) return {};

        const remoteTasks = await this.firestoreManager.loadTasksForDateRange(startDate, endDate);
        Object.entries(remoteTasks || {}).forEach(([dateKey, remoteDateTasks]) => {
            this.tasks[dateKey] = this.mergeRemoteTasksIntoLocalDate(remoteDateTasks, this.tasks[dateKey] || []);
        });
        this.markDateRangeLoaded(startDate, endDate);
        return remoteTasks || {};
    }

    async hydrateAllTasksFromRemote() {
        if (!this.firestoreManager || !this.currentUser) return {};

        const remoteTasks = await this.firestoreManager.loadTasks();
        Object.entries(remoteTasks || {}).forEach(([dateKey, remoteDateTasks]) => {
            this.tasks[dateKey] = this.mergeRemoteTasksIntoLocalDate(remoteDateTasks, this.tasks[dateKey] || []);
        });
        return remoteTasks || {};
    }

    async saveTaskDateKeysImmediately(dateKeys) {
        const uniqueDateKeys = [...new Set((dateKeys || []).filter(Boolean))];
        if (uniqueDateKeys.length === 0) return;

        if (!this.firestoreManager) {
            try {
                localStorage.setItem('sevenflow_tasks', JSON.stringify(this.tasks));
            } catch (e) {
                console.error('[Save] Error saving tasks:', e);
            }
            return;
        }

        for (const dateKey of uniqueDateKeys) {
            if (this.saveDateTimeouts && this.saveDateTimeouts[dateKey]) {
                clearTimeout(this.saveDateTimeouts[dateKey]);
                delete this.saveDateTimeouts[dateKey];
            }

            let dateTasks = this.tasks[dateKey] || [];

            if (!this.isDateKeyLoaded(dateKey)) {
                const remoteTasksByDate = await this.firestoreManager.loadTasksForDateRange(
                    this.parseDateKey(dateKey),
                    this.parseDateKey(dateKey),
                    true
                );
                const remoteDateTasks = remoteTasksByDate && Array.isArray(remoteTasksByDate[dateKey])
                    ? remoteTasksByDate[dateKey]
                    : [];
                dateTasks = this.mergeRemoteTasksIntoLocalDate(remoteDateTasks, dateTasks);
                this.tasks[dateKey] = dateTasks;
            }

            await this.firestoreManager.saveTasksForDate(dateKey, dateTasks);
        }
    }

    // Optimized save for single date (used in drag & drop)
    saveTasksForDate(date) {
        const dateKey = this.formatDate(date);
        this.localDateMutationAt[dateKey] = Date.now();

        // Clear any pending full save
        if (this.saveTasksTimeout) {
            clearTimeout(this.saveTasksTimeout);
        }

        // Debounce individual date saves
        if (!this.saveDateTimeouts) {
            this.saveDateTimeouts = {};
        }

        if (this.saveDateTimeouts[dateKey]) {
            clearTimeout(this.saveDateTimeouts[dateKey]);
        }

        this.saveDateTimeouts[dateKey] = setTimeout(() => {
            delete this.saveDateTimeouts[dateKey];
            if (this.firestoreManager) {
                this.saveTaskDateKeysImmediately([dateKey]).then(() => {
                    // Re-schedule reminders after saving
                    this.scheduleAllReminders();
                }).catch(err => {
                    console.error('[Save] Error saving date to Firestore:', err);
                    // Fallback to full save
                    this.saveTasks();
                });
            } else {
                // Fallback to localStorage (save all)
                try {
                    localStorage.setItem('sevenflow_tasks', JSON.stringify(this.tasks));
                    // Re-schedule reminders
                    this.scheduleAllReminders();
                } catch (e) {
                    console.error('[Save] Error saving tasks:', e);
                }
            }
        }, 1500);
    }

    // Settings Management
    loadSettings() {
        // Now handled by Firestore in initWithAuth
        return { defaultView: 7 };
    }

    loadSettingsLocal() {
        try {
            const saved = localStorage.getItem('sevenflow_settings');
            return saved ? JSON.parse(saved) : { defaultView: 7 };
        } catch (e) {
            console.error('Error loading settings:', e);
            return { defaultView: 7 };
        }
    }

    saveSettings(settings) {
        // Merge into the in-memory settings object
        this.settings = { ...this.settings, ...settings };

        if (Object.prototype.hasOwnProperty.call(settings, 'theme')) {
            this.applyTheme(this.settings.theme);
        }
        
        // Persist to localStorage as well
        try {
            localStorage.setItem('sevenflow_settings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('Error saving settings to localStorage:', e);
        }
        
        // Save only the changed patch to Firestore to avoid overwriting nested server-managed settings
        if (this.firestoreManager) {
            this.firestoreManager.saveSettings(settings);
        }
    }

    getBackupSettingsPayload() {
        const settings = JSON.parse(JSON.stringify(this.settings || {}));
        return this.preparePluginBackupSettings(settings);
    }

    buildBackupPayload() {
        return {
            app: 'SevenFlow',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            data: {
                tasks: JSON.parse(JSON.stringify(this.tasks || {})),
                backlogs: JSON.parse(JSON.stringify(this.backlogs || { '1': [], '2': [], '3': [], 'inbox': [] })),
                backlogTitles: JSON.parse(JSON.stringify(this.backlogTitles || { '1': 'This week', '2': 'Next week', '3': 'Later' })),
                settings: this.getBackupSettingsPayload()
            }
        };
    }

    formatBackupTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString(this.currentLanguage === 'de' ? 'de-CH' : 'en-CH');
    }

    setBackupStatus(message, type = '') {
        const backupStatus = document.getElementById('backupStatus');
        if (!backupStatus) return;
        backupStatus.textContent = message || this.t('backupInfo');
        backupStatus.classList.remove('success', 'error');
        if (type) {
            backupStatus.classList.add(type);
        }
    }

    updateBackupStatusFromSettings() {
        const lastBackupAt = this.settings?.lastBackupAt;
        if (lastBackupAt) {
            this.setBackupStatus(`${this.t('backupLastExport')}: ${this.formatBackupTimestamp(lastBackupAt)}`);
            return;
        }
        this.setBackupStatus(this.t('backupInfo'));
    }

    exportBackup() {
        try {
            const payload = this.buildBackupPayload();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const timestamp = payload.exportedAt.slice(0, 10);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `sevenflow-backup-${timestamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);

            this.saveSettings({ lastBackupAt: payload.exportedAt });
            this.updateBackupStatusFromSettings();
        } catch (error) {
            this.setBackupStatus(this.t('saveError'), 'error');
        }
    }

    async importBackupFile(file) {
        if (!file) return;

        try {
            const content = await file.text();
            const parsed = JSON.parse(content);
            const data = parsed && parsed.data ? parsed.data : parsed;

            if (!data || typeof data !== 'object') {
                throw new Error('invalid-backup');
            }

            const importedTasks = (data.tasks && typeof data.tasks === 'object') ? data.tasks : {};
            const importedBacklogs = (data.backlogs && typeof data.backlogs === 'object') ? data.backlogs : { '1': [], '2': [], '3': [], 'inbox': [] };
            const importedBacklogTitles = (data.backlogTitles && typeof data.backlogTitles === 'object')
                ? data.backlogTitles
                : { '1': 'This week', '2': 'Next week', '3': 'Later' };
            const importedSettings = (data.settings && typeof data.settings === 'object') ? data.settings : {};

            const confirmed = await this.showActionConfirmModal(
                this.t('backupImport'),
                this.t('backupConfirmImport'),
                this.t('backupImport')
            );
            if (!confirmed) return;

            const mergedSettings = {
                ...this.settings,
                ...JSON.parse(JSON.stringify(importedSettings))
            };

            this.tasks = importedTasks;
            this.backlogs = {
                '1': Array.isArray(importedBacklogs['1']) ? importedBacklogs['1'] : [],
                '2': Array.isArray(importedBacklogs['2']) ? importedBacklogs['2'] : [],
                '3': Array.isArray(importedBacklogs['3']) ? importedBacklogs['3'] : [],
                'inbox': Array.isArray(importedBacklogs['inbox']) ? importedBacklogs['inbox'] : []
            };
            this.backlogTitles = {
                '1': importedBacklogTitles['1'] || this.t('thisWeek'),
                '2': importedBacklogTitles['2'] || this.t('nextWeek'),
                '3': importedBacklogTitles['3'] || this.t('later')
            };
            this.settings = mergedSettings;
            this.currentView = mergedSettings.currentView || this.currentView || 7;
            this.currentLanguage = mergedSettings.language || this.currentLanguage || 'en';

            if (this.i18n) {
                this.i18n.setLanguage(this.currentLanguage);
            }
            this.applyTheme(mergedSettings.theme || 'dark');
            this.applyMobileNavLabelsVisibility(mergedSettings.mobileNavLabels || 'show');
            this.applyBacklogVisibility(this.normalizeUnderWeekSectionMode(mergedSettings.showBacklog || 'backlog'));

            try {
                localStorage.setItem('sevenflow_tasks', JSON.stringify(this.tasks));
                localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
                localStorage.setItem('sevenflow_backlog_titles', JSON.stringify(this.backlogTitles));
                localStorage.setItem('sevenflow_settings', JSON.stringify(this.settings));
            } catch (e) {
                // Ignore localStorage failures here; Firestore save below is primary.
            }

            if (this.firestoreManager) {
                await Promise.all([
                    this.firestoreManager.saveTasks(this.tasks),
                    this.firestoreManager.saveBacklogs(this.backlogs),
                    this.firestoreManager.saveBacklogTitles(this.backlogTitles),
                    // Plugin-managed server settings are stripped before import writes;
                    // merge:true keeps existing server-side values intact.
                    this.firestoreManager.saveSettings(this.getBackupSettingsPayload())
                ]);
            }

            this.translateUI();
            this.runPluginHook('afterBackupImport');
            this.applyMainView(this.settings.mainView || 'week');
            this.renderWeek();
            this.renderBacklog();
            this.renderInbox();
            this.scheduleAllReminders();
            this.setBackupStatus(this.t('backupImportSuccess'), 'success');
        } catch (error) {
            this.setBackupStatus(
                error && error.message === 'invalid-backup' ? this.t('backupInvalidFile') : this.t('backupImportError'),
                'error'
            );
        }
    }

    getTasksForDate(date) {
        const dateKey = this.formatDate(date);
        const allTasks = this.tasks[dateKey] || [];
        const pausedIds = this.getPausedRecurringIds();
        const hideCompleted = this.settings.hideCompletedTasks === 'enabled';
        const tasks = (pausedIds.size > 0 || hideCompleted)
            ? allTasks.filter(t =>
                (!t.recurringId || !pausedIds.has(t.recurringId)) &&
                (!hideCompleted || !t.completed))
            : allTasks;

        // Sort a copy for display only — sorting `tasks` in place (when it's the same
        // array reference as this.tasks[dateKey]) would permanently move a task to the
        // "completed" region of the stored order the moment it's checked off, so an
        // undo (which just flips completed back to false) could no longer land it back
        // where it originally sat among its still-incomplete siblings.
        // Order:
        // 1) incomplete before completed
        // 2) non-recurring before recurring (keeps recurring block at bottom)
        // 3) recurring tasks by global recurringOrder
        return [...tasks].sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            const aRecurring = !!(a.recurringId || (a.recurring && a.recurring !== 'none'));
            const bRecurring = !!(b.recurringId || (b.recurring && b.recurring !== 'none'));
            if (aRecurring !== bRecurring) {
                return aRecurring ? 1 : -1;
            }

            if (aRecurring && bRecurring) {
                const aOrder = Number.isFinite(a.recurringOrder) ? a.recurringOrder : Number.MAX_SAFE_INTEGER;
                const bOrder = Number.isFinite(b.recurringOrder) ? b.recurringOrder : Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
            }

            return 0;
        });
    }

    getNextRecurringOrder() {
        let maxOrder = 0;
        Object.values(this.tasks || {}).forEach((dateTasks) => {
            (dateTasks || []).forEach((task) => {
                const isRecurring = !!(task.recurringId || (task.recurring && task.recurring !== 'none'));
                if (!isRecurring) return;
                const order = Number(task.recurringOrder);
                if (Number.isFinite(order) && order > maxOrder) maxOrder = order;
            });
        });
        return maxOrder + 1;
    }

    setRecurringSeriesOrder(recurringId, recurringOrder) {
        if (!recurringId) return;
        Object.values(this.tasks || {}).forEach((dateTasks) => {
            (dateTasks || []).forEach((task) => {
                if (task.recurringId === recurringId) {
                    task.recurringOrder = recurringOrder;
                }
            });
        });
    }

    persistRecurringOrderFromDay(dateKey) {
        const dayTasks = this.tasks[dateKey] || [];
        const recurringTasks = dayTasks.filter((t) => t && t.recurringId && t.recurring && t.recurring !== 'none');
        recurringTasks.forEach((task, index) => {
            this.setRecurringSeriesOrder(task.recurringId, index + 1);
        });
        this.saveTasks();
    }

    addTask(date, text, description = '', recurring = 'none', recurringId = null, reminderEnabled = false, reminderTime = null, color = 'none', eventTime = null, deadlineDate = null, recurringOrder = null) {
        // Accept both Date objects and date strings
        let dateKey;
        if (typeof date === 'string') {
            dateKey = date;
        } else if (date instanceof Date) {
            dateKey = this.formatDate(date);
        } else {
            console.error('[addTask] Invalid date type:', date, typeof date);
            dateKey = this.formatDate(new Date());
        }

        if (!this.tasks[dateKey]) {
            this.tasks[dateKey] = [];
        }
        
        const task = {
            id: Date.now() + Math.random(),
            text: text,
            description: description,
            completed: false,
            recurring: recurring,
            recurringId: recurringId || (recurring !== 'none' ? `recurring-${Date.now()}` : null),
            recurringOrder: recurring !== 'none'
                ? (Number.isFinite(recurringOrder) ? recurringOrder : this.getNextRecurringOrder())
                : null,
            reminderEnabled: reminderEnabled,
            reminderTime: reminderTime,
            eventTime: eventTime,
            deadlineDate: deadlineDate || null,
            color: color,
            createdAt: new Date().toISOString()
        };

        this.tasks[dateKey].push(task);

        this.saveTasksForDate(this.parseDateKey(dateKey));
        return task;
    }

    updateTask(date, taskId, updates) {
        const dateKey = this.formatDate(date);
        if (!this.tasks[dateKey]) return;
        
        const task = this.tasks[dateKey].find(t => t.id === taskId);
        if (task) {
            Object.assign(task, updates);
            this.saveTasksForDate(date);
        }
    }

    countAttachmentReferences(storagePath) {
        if (!storagePath) return 0;
        let count = 0;

        Object.values(this.tasks || {}).forEach((list) => {
            (list || []).forEach((task) => {
                (task.attachments || []).forEach((attachment) => {
                    if (attachment.storagePath === storagePath) count += 1;
                });
            });
        });

        Object.values(this.backlogs || {}).forEach((list) => {
            (list || []).forEach((task) => {
                (task.attachments || []).forEach((attachment) => {
                    if (attachment.storagePath === storagePath) count += 1;
                });
            });
        });

        return count;
    }

    getTaskDisplayGroup(task) {
        const completed = !!(task && task.completed);
        const recurring = !!(task && (task.recurringId || (task.recurring && task.recurring !== 'none')));
        if (!completed && !recurring) return 0;
        if (!completed && recurring) return 1;
        if (completed && !recurring) return 2;
        return 3;
    }

    clampInsertIndex(targetIndex, length) {
        const normalized = Number.isFinite(targetIndex) ? targetIndex : length;
        return Math.max(0, Math.min(normalized, length));
    }

    normalizeDayInsertIndex(tasks, movedTask, targetIndex) {
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        const movedGroup = this.getTaskDisplayGroup(movedTask);

        // `targetIndex` is a position in the rendered (getTasksForDate-sorted) list, but
        // `safeTasks` is the raw storage array, which getTasksForDate no longer keeps
        // sorted in place (see getTasksForDate's comment). The group-sort only reorders
        // by group and is otherwise stable, so a task's position *within* its own group
        // is determined purely by its raw-array position relative to other same-group
        // tasks — its raw position relative to tasks of a *different* group is invisible
        // to the sort. So splicing next to a cross-group neighbor (e.g. the closest
        // recurring task) doesn't actually land the task where it visually belongs;
        // we have to splice next to the nearest same-group neighbor instead.
        const displayOrder = [...safeTasks].sort((a, b) => this.getTaskDisplayGroup(a) - this.getTaskDisplayGroup(b));
        const requestedIndex = this.clampInsertIndex(targetIndex, displayOrder.length);

        for (let i = requestedIndex; i < displayOrder.length; i++) {
            if (this.getTaskDisplayGroup(displayOrder[i]) === movedGroup) {
                const rawIndex = safeTasks.findIndex((t) => t.id === displayOrder[i].id);
                return rawIndex === -1 ? safeTasks.length : rawIndex;
            }
        }
        for (let i = requestedIndex - 1; i >= 0; i--) {
            if (this.getTaskDisplayGroup(displayOrder[i]) === movedGroup) {
                const rawIndex = safeTasks.findIndex((t) => t.id === displayOrder[i].id);
                return rawIndex === -1 ? safeTasks.length : rawIndex + 1;
            }
        }
        return safeTasks.length;
    }

    removeTaskFromDateList(dateKey, taskId) {
        const tasks = this.tasks[dateKey];
        if (!Array.isArray(tasks)) return null;
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index === -1) return null;
        const [task] = tasks.splice(index, 1);
        return task || null;
    }

    removeTaskFromBacklogList(backlogId, taskId) {
        const tasks = this.backlogs[backlogId];
        if (!Array.isArray(tasks)) return null;
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index === -1) return null;
        const [task] = tasks.splice(index, 1);
        return task || null;
    }

    async deleteAttachmentByPath(storagePath) {
        if (!storagePath) return;
        const { api, storage } = await this.ensureStorageReady();
        const storageRef = api.ref(storage, storagePath);
        await api.deleteObject(storageRef);
    }

    async deleteAttachmentPathsIfOrphaned(storagePaths) {
        const uniquePaths = [...new Set((storagePaths || []).filter(Boolean))];
        for (const path of uniquePaths) {
            if (this.countAttachmentReferences(path) !== 0) continue;
            try {
                await this.deleteAttachmentByPath(path);
            } catch (e) {
                // Best effort cleanup
            }
        }
    }

    deleteAttachmentPathsIfOrphanedInBackground(storagePaths) {
        this.deleteAttachmentPathsIfOrphaned(storagePaths).catch(() => {});
    }

    // Shows a single-slot "Rückgängig" toast for 5s. Triggering a new toast finalizes
    // (calls onExpire for) any still-pending one, since only one undo can be live at a time.
    showUndoToast(message, { undo, onExpire } = {}) {
        const toast = document.getElementById('undoToast');
        const messageEl = document.getElementById('undoToastMessage');
        const undoBtn = document.getElementById('undoToastBtn');
        if (!toast || !messageEl || !undoBtn || typeof undo !== 'function') return;

        if (this.pendingUndo) {
            clearTimeout(this.pendingUndo.timeoutId);
            this.pendingUndo.onExpire?.();
        }

        messageEl.textContent = message;
        toast.classList.add('active');

        const finalize = (expired) => {
            toast.classList.remove('active');
            this.pendingUndo = null;
            if (expired) onExpire?.();
        };

        const timeoutId = setTimeout(() => finalize(true), 5000);
        this.pendingUndo = { timeoutId, onExpire };

        undoBtn.onclick = (e) => {
            e.stopPropagation();
            clearTimeout(timeoutId);
            undo();
            finalize(false);
        };
    }

    deleteTask(date, taskId) {
        const dateKey = this.formatDate(date);
        if (!this.tasks[dateKey]) return;
        const index = this.tasks[dateKey].findIndex((t) => t.id === taskId);
        if (index === -1) return;
        const [taskToDelete] = this.tasks[dateKey].splice(index, 1);
        this.saveTasksForDate(date);

        const attachmentPaths = (taskToDelete.attachments || []).map((a) => a.storagePath);
        this.showUndoToast(this.t('undoTaskDeleted'), {
            undo: () => {
                const list = this.tasks[dateKey] || (this.tasks[dateKey] = []);
                list.splice(Math.min(index, list.length), 0, taskToDelete);
                this.saveTasksForDate(date);
                this.renderWeek();
            },
            onExpire: () => this.deleteAttachmentPathsIfOrphanedInBackground(attachmentPaths)
        });
    }

    toggleTaskComplete(date, taskId) {
        const dateKey = this.formatDate(date);
        if (!this.tasks[dateKey]) return;

        const task = this.tasks[dateKey].find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            this.saveTasksForDate(date);

            if (task.completed) {
                this.showUndoToast(this.t('undoTaskCompleted'), {
                    undo: () => {
                        task.completed = false;
                        this.saveTasksForDate(date);
                        this.renderWeek();
                    }
                });
            }
        }
    }

    checkAndMoveIncompleteTasks() {
        // Only check if feature is enabled
        if (this.settings.autoMoveIncompleteTasks !== 'enabled') {
            return;
        }

        // Get last check date from settings (stored in Firestore)
        const lastCheckDate = this.settings.lastAutoMoveCheck;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = this.formatDate(today);

        // If we already checked today, skip
        if (lastCheckDate === todayKey) {
            return;
        }

        // Move incomplete tasks
        this.moveIncompleteTasksToNextDay();

        // Save today as last check date in settings
        this.saveSettings({
            lastAutoMoveCheck: todayKey
        });
    }

    moveIncompleteTasksToNextDay() {
        // Get yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const yesterdayKey = this.formatDate(yesterday);
        const todayKey = this.formatDate(new Date());

        // Check if we have tasks for yesterday
        if (!this.tasks[yesterdayKey] || this.tasks[yesterdayKey].length === 0) {
            return;
        }

        // Find incomplete tasks (not completed, not recurring, not dividers)
        const tasksToMove = this.tasks[yesterdayKey].filter(task => {
            return !task.completed &&
                   (!task.recurring || task.recurring === 'none') &&
                   task.text !== '---';
        });

        if (tasksToMove.length === 0) {
            return;
        }

        // Initialize today's tasks if not exists
        if (!this.tasks[todayKey]) {
            this.tasks[todayKey] = [];
        }

        const existsOutsideYesterday = (taskId) => {
            const stringId = String(taskId);
            return Object.entries(this.tasks || {}).some(([dateKey, list]) => {
                if (dateKey === yesterdayKey) return false;
                if (!Array.isArray(list)) return false;
                return list.some((task) => String(task.id) === stringId);
            });
        };

        const idsToRemoveFromYesterday = new Set();

        // Move tasks to today only if they are not already scheduled elsewhere.
        tasksToMove.forEach(task => {
            if (existsOutsideYesterday(task.id)) {
                idsToRemoveFromYesterday.add(String(task.id));
                return;
            }

            // Create new task for today with new ID
            const newTask = {
                ...task,
                id: Date.now() + Math.random(),
                createdAt: new Date().toISOString()
            };

            this.tasks[todayKey].push(newTask);
            idsToRemoveFromYesterday.add(String(task.id));
        });

        if (idsToRemoveFromYesterday.size > 0) {
            this.tasks[yesterdayKey] = this.tasks[yesterdayKey].filter(
                t => !idsToRemoveFromYesterday.has(String(t.id))
            );
        }

        // Save both dates
        this.saveTasksForDate(yesterday);
        this.saveTasksForDate(new Date());
    }

    // Rendering
    async renderWeek() {
        try {
            const dates = this.getWeekDates(this.currentWeekOffset);

            // Check if we need to load more data for these dates
            await this.ensureDataLoaded(dates);

            const weekGrid = document.getElementById('weekGrid');
            const weekInfo = document.querySelector('.week-range');
            
            if (!weekGrid) {
                console.error('[Render] weekGrid element not found!');
                return;
            }
            
            // Update week info
            if (weekInfo) {
                weekInfo.textContent = this.getWeekRange(dates);
            }
            
            // Update grid columns based on view
            weekGrid.style.gridTemplateColumns = `repeat(${this.currentView}, 1fr)`;
            
            // Clear and render days
            weekGrid.innerHTML = '';
            dates.forEach(date => {
                const dayColumn = this.createDayColumn(date);
                weekGrid.appendChild(dayColumn);
            });

            // Keep the focus mode panel (a separate copy of today's column) in sync
            // with the same task mutations that trigger a week re-render.
            if (this.focusModeActive) {
                this.renderFocusModeContent();
            }

        } catch (error) {
            console.error('[Render] renderWeek error:', error);
        }
    }

    openFocusMode() {
        const overlay = document.getElementById('focusModeOverlay');
        if (!overlay) return;
        this.focusModeActive = true;
        overlay.style.display = 'flex';
        document.body.classList.add('focus-mode-open');
        this.renderFocusModeContent();
    }

    closeFocusMode() {
        const overlay = document.getElementById('focusModeOverlay');
        this.focusModeActive = false;
        if (overlay) overlay.style.display = 'none';
        document.body.classList.remove('focus-mode-open');
        const body = document.getElementById('focusModeBody');
        if (body) body.innerHTML = '';
    }

    // Renders a standalone copy of today's day-column into the focus mode panel —
    // reuses createDayColumn as-is, so it gets the same checkbox/click/edit/delete
    // behavior as the week view. Drag-and-drop is left enabled on purpose: the app
    // supports reordering tasks within a single day (separate from moving a task to
    // a different day), and that still works fine here since the panel only ever
    // shows one day — there's simply no other day column to drop onto.
    renderFocusModeContent() {
        if (!this.focusModeActive) return;
        const body = document.getElementById('focusModeBody');
        if (!body) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dayColumn = this.createDayColumn(today);

        body.innerHTML = '';
        body.appendChild(dayColumn);
    }

    // Check if data for dates is loaded, if not load it
    async ensureDataLoaded(dates) {
        if (!this.firestoreManager) return; // Local mode

        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];

        // Check if this range is already loaded
        const isLoaded = this.loadedDateRanges.some(range => {
            return firstDate >= range.start && lastDate <= range.end;
        });

        if (!isLoaded) {
            // Load this week's data
            const newTasks = await this.firestoreManager.loadTasksForDateRange(firstDate, lastDate);

            // Merge with existing tasks, but do not clobber very recent local mutations
            // (e.g. just-created future recurring instances that are still waiting for debounced save).
            const now = Date.now();
            Object.entries(newTasks || {}).forEach(([dateKey, remoteDateTasks]) => {
                const localMutationAt = this.localDateMutationAt?.[dateKey] || 0;
                const localMutationAge = now - localMutationAt;
                const hasRecentLocalMutation = localMutationAge >= 0 && localMutationAge < this.realtimeEmptyGuardMs;
                if (hasRecentLocalMutation && Array.isArray(this.tasks[dateKey])) {
                    return;
                }
                this.tasks[dateKey] = remoteDateTasks;
            });

            // Mark as loaded
            this.loadedDateRanges.push({
                start: new Date(firstDate),
                end: new Date(lastDate)
            });
        }
    }

    // Setup real-time listener for date range
    async setupRealtimeSync(startDate, endDate) {
        if (!this.firestoreManager) return;

        // Cleanup old listeners
        if (this.firestoreManager.cleanupListeners) {
            this.firestoreManager.cleanupListeners();
        }

        // Setup new listener
        await this.firestoreManager.setupRealtimeListener(startDate, endDate, (changes) => {
            if (this.isDragging) {
                this.queueRealtimeChanges(changes);
                return;
            }

            let hasChanges = false;

            changes.forEach(change => {
                if (this.shouldIgnoreRealtimeChange(change)) {
                    return;
                }

                if (change.type === 'modified' || change.type === 'added') {
                    if (!Array.isArray(change.tasks)) {
                        return;
                    }
                    if (this.shouldIgnoreTransientEmptyRealtimeChange(change)) {
                        return;
                    }

                    // Update local data
                    this.tasks[change.date] = change.tasks;
                    hasChanges = true;
                }
                if (change.type === 'removed') {
                    if (this.shouldIgnoreTransientEmptyRealtimeChange({ ...change, tasks: [] })) {
                        return;
                    }
                    delete this.tasks[change.date];
                    hasChanges = true;
                }
            });

            // Re-render only if we got changes and only the specific date columns
            if (hasChanges) {
                this.updateChangedDates(changes);
                this.queueReminderReschedule();
            }
        });
    }

    // Live-sync for the notes pad only, independent of week navigation (not tied to
    // setupRealtimeSync's cleanup/re-subscribe cycle) and independent of every other
    // settings field, even though it shares the same Firestore document with them.
    async setupNotesPadRealtimeSync() {
        if (!this.firestoreManager || typeof this.firestoreManager.setupNotesPadRealtimeListener !== 'function') return;

        const unsubscribe = await this.firestoreManager.setupNotesPadRealtimeListener((change) => {
            this.applyRemoteNotesPadChange(change);
        });
        this.notesPadRealtimeUnsubscribe = unsubscribe || null;
    }

    // Applies an incoming notes value from another device (via the realtime listener
    // or an explicit refresh). Never overwrites the textarea while the user is
    // actively typing in it — their own next save supersedes the remote value anyway.
    applyRemoteNotesPadChange(change) {
        if (!change || typeof change.notesPadText !== 'string') return;
        if (change.notesPadText === this.settings.notesPadText) return;

        const notesPadInput = document.getElementById('notesPadInput');
        if (notesPadInput && document.activeElement === notesPadInput) return;
        if (this.notesPadSaveTimeout) return;

        this.settings.notesPadText = change.notesPadText;
        if (notesPadInput) {
            notesPadInput.value = change.notesPadText;
        }

        try {
            localStorage.setItem('sevenflow_settings', JSON.stringify(this.settings));
        } catch (_error) {
            // Best effort.
        }
    }

    async refreshNotesPad() {
        if (!this.firestoreManager) return;
        try {
            const remoteSettings = await this.firestoreManager.loadSettings();
            if (remoteSettings && typeof remoteSettings.notesPadText === 'string') {
                this.applyRemoteNotesPadChange({ notesPadText: remoteSettings.notesPadText });
            }
        } catch (_error) {
            // Best effort — keep whatever is currently shown.
        }
    }

    queueRealtimeChanges(changes) {
        if (!Array.isArray(changes) || changes.length === 0) return;

        const merged = new Map();

        this.pendingRealtimeChanges.forEach((change) => {
            merged.set(change.date, change);
        });

        changes.forEach((change) => {
            merged.set(change.date, change);
        });

        this.pendingRealtimeChanges = Array.from(merged.values());
    }

    shouldIgnoreRealtimeChange(change) {
        if (!change || !change.date) return false;

        // While a debounced local save is pending for this date, keep local UI as source of truth.
        if (this.saveDateTimeouts && this.saveDateTimeouts[change.date]) {
            return true;
        }

        const localMutationAt = this.localDateMutationAt && this.localDateMutationAt[change.date]
            ? this.localDateMutationAt[change.date]
            : 0;
        if (!localMutationAt) return false;

        // Drop stale remote snapshots older than the last local mutation.
        const remoteTimestamp = change.updatedAt ? Date.parse(change.updatedAt) : NaN;
        if (!Number.isNaN(remoteTimestamp) && remoteTimestamp < localMutationAt) {
            return true;
        }

        return false;
    }

    shouldIgnoreTransientEmptyRealtimeChange(change) {
        if (!change || !change.date || !Array.isArray(change.tasks)) return false;
        if (change.tasks.length !== 0) return false;

        const localTasks = this.tasks[change.date] || [];
        if (!Array.isArray(localTasks) || localTasks.length === 0) return false;

        const localMutationAt = this.localDateMutationAt[change.date] || 0;
        if (!localMutationAt) return false;

        const localMutationAge = Date.now() - localMutationAt;
        if (localMutationAge >= 0 && localMutationAge < this.realtimeEmptyGuardMs) {
            return true;
        }

        const remoteTimestamp = change.updatedAt ? Date.parse(change.updatedAt) : NaN;
        if (!Number.isNaN(remoteTimestamp) && remoteTimestamp < (localMutationAt + this.realtimeEmptyGuardMs)) {
            return true;
        }

        return false;
    }

    isAndroidAppRuntime() {
        const protocol = window.location.protocol;
        if (protocol === 'file:' || protocol === 'https:' && window.location.origin.includes('appassets.androidplatform.net')) {
            return true;
        }
        const ua = navigator.userAgent || '';
        return ua.includes('Android') && (ua.includes('wv') || ua.includes('Version/'));
    }

    flushRealtimeChanges() {
        if (this.isDragging) return;
        if (!this.pendingRealtimeChanges || this.pendingRealtimeChanges.length === 0) return;

        const changes = this.pendingRealtimeChanges;
        this.pendingRealtimeChanges = [];

        let hasChanges = false;
        changes.forEach((change) => {
            if (this.shouldIgnoreRealtimeChange(change)) {
                return;
            }

            if (change.type === 'modified' || change.type === 'added') {
                if (!Array.isArray(change.tasks)) {
                    return;
                }
                if (this.shouldIgnoreTransientEmptyRealtimeChange(change)) {
                    return;
                }

                this.tasks[change.date] = change.tasks;
                hasChanges = true;
            }
            if (change.type === 'removed') {
                if (this.shouldIgnoreTransientEmptyRealtimeChange({ ...change, tasks: [] })) {
                    return;
                }
                delete this.tasks[change.date];
                hasChanges = true;
            }
        });

        if (hasChanges) {
            this.updateChangedDates(changes);
            this.queueReminderReschedule();
        }
    }

    // Update only changed date columns without full re-render
    updateChangedDates(changes) {
        const visibleDates = this.getWeekDates(this.currentWeekOffset);
        const visibleDateKeys = visibleDates.map(d => this.formatDate(d));
        const activeElement = document.activeElement;
        const activeTaskInput = activeElement && activeElement.classList && activeElement.classList.contains('task-input')
            ? activeElement
            : null;

        let updatedAny = false;
        let hadVisibleChanges = false;

        changes.forEach(change => {
            // Only update if this date is currently visible
            if (visibleDateKeys.includes(change.date)) {
                hadVisibleChanges = true;
                const dateIndex = visibleDateKeys.indexOf(change.date);
                const date = visibleDates[dateIndex];

                // Find the day column for this date
                const dayColumns = document.querySelectorAll('.day-column');

                if (dayColumns[dateIndex]) {
                    const tasksContainer = dayColumns[dateIndex].querySelector('.tasks-container');

                    if (tasksContainer) {
                        // Never replace the DOM while user is typing in an inline task input in this column.
                        if (
                            activeTaskInput &&
                            tasksContainer.contains(activeTaskInput)
                        ) {
                            return;
                        }

                        try {
                            // Check if update is actually needed
                            const currentTasks = this.getTasksForDate(date);
                            const existingTasks = Array.from(tasksContainer.querySelectorAll('.task-item'));

                            // Skip update if tasks are identical
                            if (existingTasks.length === currentTasks.length) {
                                let identical = true;
                                currentTasks.forEach((task, idx) => {
                                    const existingTask = existingTasks[idx];
                                    if (existingTask) {
                                        const existingId = parseFloat(existingTask.dataset.taskId);
                                        const existingCompleted = existingTask.classList.contains('completed');
                                        if (existingId !== task.id || existingCompleted !== task.completed) {
                                            identical = false;
                                        }
                                    } else {
                                        identical = false;
                                    }
                                });

                                if (identical) {
                                    return; // Skip this update - no changes
                                }
                            }

                            // Smooth update: Remove tasks and placeholders without flash
                            const elementsToRemove = Array.from(tasksContainer.querySelectorAll('.task-item, .task-placeholder'));
                            elementsToRemove.forEach((el) => {
                                if (el && el.parentNode === tasksContainer) {
                                    tasksContainer.removeChild(el);
                                }
                            });

                            // Add updated tasks
                            const tasks = currentTasks;

                            tasks.forEach(task => {
                                const taskElement = this.createTaskElement(date, task);
                                tasksContainer.appendChild(taskElement);
                            });

                            // Add placeholders (3 lines like in createDayColumn)
                            for (let i = 0; i < 3; i++) {
                                const placeholder = this.createPlaceholderLine(date, tasksContainer);
                                tasksContainer.appendChild(placeholder);
                            }

                            updatedAny = true;
                        } catch (error) {
                            // Avoid full re-render from background sync: keep UI stable while user interacts.
                            console.error('Non-blocking day update error:', error);
                        }
                    }
                }
            }
        });
        // Intentionally no full render fallback here.
        // Background sync should never steal focus or interrupt inline typing.
        void updatedAny;
        void hadVisibleChanges;
    }

    // Background sync to check for updates periodically
    startBackgroundSync() {
        if (!this.firestoreManager) return;

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        // Poll lightly in the background so API-created tasks appear without a full reload.
        this.syncInterval = setInterval(async () => {
            await Promise.allSettled([
                this.checkAndSyncVisibleDates(),
                this.checkAndSyncBacklogs()
            ]);
        }, 15000);
    }

    // Check if visible dates need updates
    async checkAndSyncVisibleDates() {
        if (!this.firestoreManager) return;

        // Don't sync while user is dragging
        if (this.isDragging) return;

        const dates = this.getWeekDates(this.currentWeekOffset);
        const dateKeys = dates.map(d => this.formatDate(d));

        try {
            const updates = await this.firestoreManager.checkForUpdates(dateKeys);

            if (updates.length > 0) {
                updates.forEach(update => {
                    this.tasks[update.date] = update.tasks;
                    // Update sync timestamp (server-based epoch millis, see checkForUpdates).
                    this.firestoreManager.lastSync[update.date] = update.syncMillis;
                });

                // Silently update only changed dates
                this.updateChangedDates(updates);
                this.queueReminderReschedule();
            }
        } catch (error) {
            console.error('Background sync error:', error);
        }
    }

    shouldDeferBacklogSyncRender() {
        const activeElement = document.activeElement;
        if (!activeElement || !activeElement.classList) return false;

        if (activeElement.id === 'inboxQuickInput') return true;
        if (activeElement.classList.contains('task-input')) return true;
        if (activeElement.classList.contains('backlog-title-input')) return true;

        return false;
    }

    async checkAndSyncBacklogs() {
        if (!this.firestoreManager) return;
        if (this.isDragging) return;
        if (this.saveBacklogsTimeout) return;

        try {
            const update = await this.firestoreManager.checkForBacklogUpdates();
            if (!update || !update.backlogs) return;

            const normalizedBacklogs = {
                '1': Array.isArray(update.backlogs['1']) ? update.backlogs['1'] : [],
                '2': Array.isArray(update.backlogs['2']) ? update.backlogs['2'] : [],
                '3': Array.isArray(update.backlogs['3']) ? update.backlogs['3'] : [],
                'inbox': Array.isArray(update.backlogs['inbox']) ? update.backlogs['inbox'] : []
            };

            const remoteUpdatedAt = update.updatedAt ? Date.parse(update.updatedAt) : NaN;
            if (!Number.isNaN(remoteUpdatedAt) && remoteUpdatedAt < this.localBacklogsMutationAt) {
                return;
            }

            if (JSON.stringify(normalizedBacklogs) === JSON.stringify(this.backlogs || {})) {
                return;
            }

            this.backlogs = normalizedBacklogs;

            try {
                localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
            } catch (_) {}

            if (this.shouldDeferBacklogSyncRender()) {
                return;
            }

            this.renderBacklog();
            if (this.getMainView() === 'inbox') {
                this.renderInbox();
            }
        } catch (error) {
            console.error('Background backlog sync error:', error);
        }
    }

    async syncBacklogsNow({ render = false } = {}) {
        if (!this.firestoreManager) {
            if (render) {
                this.renderBacklog();
                if (this.getMainView() === 'inbox') this.renderInbox();
            }
            return;
        }

        if (this.saveBacklogsTimeout) {
            await this.flushPendingBacklogSave();
        }

        const freshBacklogs = await this.firestoreManager.loadBacklogs();
        this.backlogs = {
            '1': Array.isArray(freshBacklogs?.['1']) ? freshBacklogs['1'] : [],
            '2': Array.isArray(freshBacklogs?.['2']) ? freshBacklogs['2'] : [],
            '3': Array.isArray(freshBacklogs?.['3']) ? freshBacklogs['3'] : [],
            'inbox': Array.isArray(freshBacklogs?.['inbox']) ? freshBacklogs['inbox'] : []
        };

        try {
            localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
        } catch (_) {}

        if (render) {
            this.renderBacklog();
            if (this.getMainView() === 'inbox') this.renderInbox();
        }
    }

    // Manual refresh function (for pull-to-refresh)
    async refreshData() {
        if (!this.firestoreManager) return;

        const dates = this.getWeekDates(this.currentWeekOffset);
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];

        try {
            if (this.saveBacklogsTimeout) {
                await this.flushPendingBacklogSave();
            }

            // Force reload from Firestore
            const freshData = await this.firestoreManager.loadTasksForDateRange(firstDate, lastDate, true);

            // Merge with local data
            Object.assign(this.tasks, freshData);
            await this.syncBacklogsNow();
            await this.refreshNotesPad();

            // Re-render
            this.renderWeek();
            this.renderBacklog();
            if (this.getMainView() === 'inbox') {
                this.renderInbox();
            }
        } catch (error) {
            console.error('Refresh error:', error);
        }
    }

    async changeView(days) {
        this.currentView = days;
        this.currentWeekOffset = 0; // Reset to current week
        
        // Update active button
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`view${days}`).classList.add('active');
        
        // Save current view to settings
        this.saveSettings({ currentView: days });

        await this.renderWeek();
    }

    // Swipe left/right to step through days/weeks on mobile (1/3/5-day views) —
    // mirrors what the prev/next week buttons already do (currentWeekOffset +/- 1,
    // re-render); the actual day/week jump size per view is already handled by
    // getWeekDates(). Gated on viewport width rather than currentView, since desktop
    // and mobile now have separate currentView values (see mobileCurrentView) and a
    // desktop session could otherwise share a day-count with a mobile one.
    // Attached once to the stable #weekGrid element (not re-attached per render) and
    // deliberately ignores touches starting on a .task-item, since those are already
    // reserved for the existing drag-to-reorder gesture.
    setupSwipeNavigation() {
        const weekGrid = document.getElementById('weekGrid');
        if (!weekGrid) return;

        const isMobileLayout = () => window.innerWidth <= 768;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartedOnTask = false;

        weekGrid.addEventListener('touchstart', (e) => {
            if (!isMobileLayout()) return;
            const touch = e.touches[0];
            if (!touch) return;
            touchStartedOnTask = !!(e.target.closest && e.target.closest('.task-item'));
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }, { passive: true });

        weekGrid.addEventListener('touchend', (e) => {
            if (!isMobileLayout() || touchStartedOnTask) return;
            const touch = e.changedTouches[0];
            if (!touch) return;

            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            const minSwipeDistance = 60;
            if (Math.abs(deltaX) < minSwipeDistance) return;
            if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return; // require a mostly-horizontal gesture

            this.currentWeekOffset += deltaX < 0 ? 1 : -1; // swipe left = next, right = previous
            this.renderWeek();
        }, { passive: true });
    }

    createDayColumn(date) {
        const column = document.createElement('div');
        column.className = 'day-column';
        if (this.isToday(date)) {
            column.classList.add('today');
        }
        
        // Make column a drop zone
        column.dataset.date = this.formatDate(date);
        
        // Header
        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `
            <div class="day-name">${this.getDayName(date)}</div>
            <div class="day-date">${date.getDate()}</div>
        `;
        header.addEventListener('click', () => {
            if (!this.selectionMode || this.selectedTasks.size === 0) return;
            this.moveSelectedTasksToDay(date);
        });
        
        // Tasks container
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'tasks-container';

        // Also allow dropping when pointer is over header/column chrome, not only over tasks container.
        column.addEventListener('dragover', (e) => {
            if (e.target.closest('.tasks-container')) return;
            this.dragDrop.handleDragOver(e, tasksContainer);
        });
        column.addEventListener('drop', (e) => {
            if (e.target.closest('.tasks-container')) return;
            this.dragDrop.handleDrop(e, date, tasksContainer);
        });
        
        // Drop zone events for tasks container
        tasksContainer.addEventListener('dragover', (e) => {
            this.dragDrop.handleDragOver(e, tasksContainer);
        });
        
        tasksContainer.addEventListener('dragleave', (e) => {
            this.dragDrop.handleDragLeave(e, tasksContainer);
        });
        
        tasksContainer.addEventListener('drop', (e) => {
            this.dragDrop.handleDrop(e, date, tasksContainer);
        });
        
        // Render existing tasks
        const tasks = this.getTasksForDate(date);
        tasks.forEach(task => {
            const taskElement = this.createTaskElement(date, task);
            tasksContainer.appendChild(taskElement);
        });
        
        // Add placeholder lines instead of add button
        for (let i = 0; i < 3; i++) {
            const placeholder = this.createPlaceholderLine(date, tasksContainer);
            tasksContainer.appendChild(placeholder);
        }

        column.appendChild(header);
        column.appendChild(tasksContainer);
        
        return column;
    }

    createTaskElement(date, task) {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        const dateKey = this.formatDate(date);
        const selectionKey = this.getTaskSelectionKey(dateKey, task.id);
        if (this.isTaskSelected(selectionKey)) {
            taskItem.classList.add('selected');
        }

        // Check if this is a divider task (---)
        const isDivider = task.text === '---';

        if (isDivider) {
            taskItem.classList.add('divider');
        } else {
            if (task.completed) {
                taskItem.classList.add('completed');
            }
            if (task.color && task.color !== 'none') {
                taskItem.classList.add(`color-${task.color}`);
            }
        }
        
        // Make task draggable (always, even if completed or divider)
        taskItem.draggable = true;
        taskItem.dataset.taskId = task.id;
        taskItem.dataset.date = dateKey;
        taskItem.style.cursor = 'grab'; // Visual indication
        const wasLongPressed = this.attachLongPressSelection(taskItem, selectionKey, {
            type: 'day',
            sourceId: dateKey,
            taskId: String(task.id)
        });
        let suppressClickUntil = 0;
        
        // Drag event handlers
        taskItem.addEventListener('dragstart', (e) => {
            taskItem.style.cursor = 'grabbing';
            taskItem.classList.add('dragging');
            this.dragDrop.handleDragStart(e, date, task);
        });
        
        taskItem.addEventListener('dragend', (e) => {
            taskItem.style.cursor = 'grab';
            taskItem.classList.remove('dragging');
            this.dragDrop.handleDragEnd(e);
        });
        
        if (isDivider) {
            // For dividers: only show content (line) and delete button
            const content = document.createElement('div');
            content.className = 'task-content';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'task-delete';
            deleteBtn.title = this.t('delete');
            deleteBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                this.deleteTask(date, task.id);
                this.renderWeek();
            });

            taskItem.appendChild(content);
            taskItem.appendChild(deleteBtn);

            return taskItem;
        }

        // Regular task rendering below
        // Checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox';
        checkbox.title = this.t('markDone');
        if (task.completed) {
            checkbox.classList.add('checked');
            checkbox.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        }
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTaskComplete(date, task.id);
            this.renderWeek();
        });
        
        // Task content
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        // Add event time if present (as separate element)
        if (task.eventTime) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'task-event-time';
            timeSpan.textContent = `(${this.formatTime(task.eventTime)})`;
            textSpan.appendChild(timeSpan);
        }

        // Add recurring icon if task is recurring
        if (task.recurring && task.recurring !== 'none') {
            const recurringIcon = document.createElement('span');
            recurringIcon.className = 'task-reminder-icon';
            recurringIcon.title = `${this.t('recurring')}: ${this.t(task.recurring)}`;
            recurringIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                    <path d="M16 21h5v-5"></path>
                </svg>
            `;
            textSpan.appendChild(recurringIcon);
        }

        // Add note icon if task has a description
        if (task.description && task.description.trim()) {
            const descriptionIcon = document.createElement('span');
            descriptionIcon.className = 'task-reminder-icon';
            descriptionIcon.title = task.description.length > 80
                ? `${task.description.slice(0, 80)}…`
                : task.description;
            descriptionIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
            `;
            textSpan.appendChild(descriptionIcon);
        }

        if (task.deadlineDate) {
            const deadline = this.parseDateKey(task.deadlineDate);
            const deadlineIcon = document.createElement('span');
            deadlineIcon.className = 'task-deadline';
            deadlineIcon.title = `${this.t('deadlineDate')}: ${this.formatDisplayDate(deadline)}`;
            deadlineIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="8"></circle>
                    <circle cx="12" cy="12" r="3"></circle>
                    <line x1="12" y1="2" x2="12" y2="4"></line>
                    <line x1="12" y1="20" x2="12" y2="22"></line>
                    <line x1="2" y1="12" x2="4" y2="12"></line>
                    <line x1="20" y1="12" x2="22" y2="12"></line>
                </svg>${this.formatDisplayDate(deadline)}
            `;
            textSpan.appendChild(deadlineIcon);
        }
        const taskSourceIcon = this.getTaskSourceIcon(task);
        if (taskSourceIcon) {
            const sourceIcon = document.createElement('span');
            sourceIcon.className = taskSourceIcon.className || 'task-source-icon';
            sourceIcon.title = taskSourceIcon.title || '';
            sourceIcon.innerHTML = taskSourceIcon.html || '';
            textSpan.appendChild(sourceIcon);
        }

        if (Array.isArray(task.attachments) && task.attachments.length > 0) {
            const attachmentIcon = document.createElement('span');
            attachmentIcon.className = 'task-source-icon task-attachment-icon';
            attachmentIcon.title = this.t('menuAttachFiles');
            attachmentIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-8.49 8.49a6 6 0 0 1-8.49-8.49l8.49-8.48a4 4 0 1 1 5.66 5.66l-8.48 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78"></path>
                </svg>
            `;
            textSpan.appendChild(attachmentIcon);
        }
        
        // Add bell icon if reminder is enabled
        if (task.reminderEnabled && task.reminderTime) {
            const bellIcon = document.createElement('span');
            bellIcon.className = 'task-reminder-icon';
            bellIcon.title = `${this.t('reminder')}: ${task.reminderTime}`;
            bellIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
            `;
            textSpan.appendChild(bellIcon);
        }
        
        // Add subtask progress if task has subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const completed = task.subtasks.filter(s => s.completed).length;
            const total = task.subtasks.length;
            const progressSpan = document.createElement('span');
            progressSpan.className = 'task-progress';
            progressSpan.textContent = `${completed}/${total}`;
            textSpan.appendChild(progressSpan);
        }
        
        content.appendChild(textSpan);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'task-delete';
        deleteBtn.title = this.t('delete');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // Check if recurring
            if (task.recurringId) {
                const recurringType = task.recurring;
                const message = `${this.t('confirmDeleteRecurring')}`;

                const result = await this.showConfirmModal(
                    this.t('deleteTask'),
                    message,
                    true
                );
                
                if (result === 'all') {
                    await this.deleteRecurringTasks(task.recurringId);
                    this.renderWeek();
                } else if (result === 'single') {
                    this.deleteTask(date, task.id);
                    this.renderWeek();
                }
            } else {
                const result = await this.showConfirmModal(
                    this.t('deleteTask'),
                    this.t('confirmDelete'),
                    false
                );
                
                if (result === 'delete') {
                    this.deleteTask(date, task.id);
                    this.renderWeek();
                }
            }
        });
        
        // Edit on click (but not when dragging) - but not for dividers
        if (!isDivider) {
            taskItem.addEventListener('pointerup', (e) => {
                if (e.pointerType === 'mouse') return;
                if (!this.selectionMode) return;
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) return;
                if (wasLongPressed()) return;
                if (this.isDragging) return;

                this.toggleTaskSelection(selectionKey, {
                    type: 'day',
                    sourceId: dateKey,
                    taskId: String(task.id)
                });
                taskItem.classList.toggle('selected', this.isTaskSelected(selectionKey));
                suppressClickUntil = Date.now() + 300;
                e.preventDefault();
                e.stopPropagation();
            });

            taskItem.addEventListener('click', (e) => {
                // Don't open modal if clicking checkbox or delete button
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) {
                    return;
                }
                if (Date.now() < suppressClickUntil) {
                    return;
                }
                if (wasLongPressed()) {
                    return;
                }
                if (e.ctrlKey || e.metaKey || this.selectionMode) {
                    this.toggleTaskSelection(selectionKey, {
                        type: 'day',
                        sourceId: dateKey,
                        taskId: String(task.id)
                    });
                    taskItem.classList.toggle('selected', this.isTaskSelected(selectionKey));
                    return;
                }
                // Don't open modal if we just finished dragging
                if (this.isDragging) {
                    this.isDragging = false;
                    return;
                }
                this.openTaskModal(date, task);
            });

            taskItem.addEventListener('contextmenu', (e) => {
                if (this.isAndroidAppRuntime()) return;
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) return;
                e.preventDefault();
                e.stopPropagation();
                this.showTaskContextMenu(e.clientX, e.clientY, { date, task });
            });
        }

        // Add tags if present
        if (task.tags && task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'task-tags';
            
            const maxTags = 3;
            const displayTags = task.tags.slice(0, maxTags);
            
            displayTags.forEach(tag => {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'task-tag';
                tagBadge.style.background = this.getTagColor(tag);
                tagBadge.textContent = tag;
                tagsContainer.appendChild(tagBadge);
            });
            
            if (task.tags.length > maxTags) {
                const moreBadge = document.createElement('span');
                moreBadge.className = 'task-tag task-tag-more';
                moreBadge.textContent = `+${task.tags.length - maxTags}`;
                tagsContainer.appendChild(moreBadge);
            }
            
            content.appendChild(tagsContainer);
        }
        
        taskItem.appendChild(checkbox);
        taskItem.appendChild(content);
        taskItem.appendChild(deleteBtn);
        
        return taskItem;
    }

    createPlaceholderLine(date, container) {
        const placeholder = document.createElement('div');
        placeholder.className = 'task-placeholder';
        
        placeholder.addEventListener('click', () => {
            this.createNewTask(date, container, placeholder);
        });
        
        return placeholder;
    }

    continueTaskInputForDate(date) {
        if (!(date instanceof Date)) return;

        // Focus mode renders its own separate copy of today's day-column, so while
        // it's open there are two ".day-column" elements with the same data-date in
        // the document (the real one is hidden behind the blur). Scope the lookup to
        // whichever one is actually visible/interactive, or the continuation would
        // silently create and focus a new input in the hidden background column.
        if (!this.focusModeActive && this.getMainView && this.getMainView() !== 'week') return;

        const dateKey = this.formatDate(date);
        const scopeId = this.focusModeActive ? 'focusModeBody' : 'weekGrid';
        requestAnimationFrame(() => {
            const scope = document.getElementById(scopeId);
            if (!scope) return;

            const column = scope.querySelector(`.day-column[data-date="${dateKey}"]`);
            if (!column) return;

            const tasksContainer = column.querySelector('.tasks-container');
            if (!tasksContainer) return;

            const firstPlaceholder = tasksContainer.querySelector('.task-placeholder');
            if (!firstPlaceholder) return;

            this.createNewTask(date, tasksContainer, firstPlaceholder);
        });
    }

    createNewTask(date, container, clickedPlaceholder = null) {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox';
        
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-input';
        // Tells mobile keyboards/WebViews this isn't a "next field" in a sequence —
        // without it, some Android WebViews auto-advance focus to whatever focusable
        // element follows in DOM order (e.g. the notes textarea after the last day).
        input.setAttribute('enterkeyhint', 'done');
        input.placeholder = 'Neue Aufgabe...';
        
        content.appendChild(input);
        taskItem.appendChild(checkbox);
        taskItem.appendChild(content);
        
        // Replace clicked placeholder with input
        if (clickedPlaceholder) {
            container.insertBefore(taskItem, clickedPlaceholder);
            clickedPlaceholder.remove();
        } else {
            container.appendChild(taskItem);
        }
        input.focus();
        
        let saved = false;
        
        const saveTask = () => {
            if (saved) return;
            saved = true;
            
            const text = input.value.trim();
            if (text) {
                // Check if this is a divider
                if (text === '---') {
                    // Add divider without parsing
                    this.addTask(date, '---', '', 'none', null, false, '09:00', 'none', null);
                } else {
                    if (this.hasFeature('ramble_parsing')) {
                        const parser = new window.TaskParser();
                        const parsed = parser.parse(text);
                        const targetDate = parsed.date || date;
                        const eventTime = parsed.time || null;
                        const reminderEnabled = this.hasFeature('reminders') ? !!parsed.reminder : false;
                        const reminderTime = this.hasFeature('reminders') ? (parsed.reminder || null) : null;

                        this.addTask(targetDate, parsed.text, '', 'none', null, reminderEnabled, reminderTime, 'none', eventTime);
                    } else {
                        this.addTask(date, text, '', 'none', null, false, null, 'none', null);
                    }
                }
                this.renderWeek();
                
                // Don't auto-focus on placeholder - let user decide next action
            } else {
                taskItem.remove();
            }
        };
        
        input.addEventListener('blur', saveTask);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                saved = true; // Mark as saved to prevent blur handler
                const text = input.value.trim();

                if (text) {
                    if (text === '---') {
                        this.addTask(date, '---', '', 'none', null, false, '09:00', 'none', null);
                    } else {
                        if (this.hasFeature('ramble_parsing')) {
                            const parser = new window.TaskParser();
                            const parsed = parser.parse(text);
                            const targetDate = parsed.date || date;
                            const eventTime = parsed.time || null;
                            const reminderEnabled = this.hasFeature('reminders') ? !!parsed.reminder : false;
                            const reminderTime = this.hasFeature('reminders') ? (parsed.reminder || null) : null;
                            this.addTask(targetDate, parsed.text, '', 'none', null, reminderEnabled, reminderTime, 'none', eventTime);
                        } else {
                            this.addTask(date, text, '', 'none', null, false, null, 'none', null);
                        }
                    }
                    this.renderWeek();
                    this.continueTaskInputForDate(date);
                } else {
                    taskItem.remove();
                }
            } else if (e.key === 'Escape') {
                saved = true;
                taskItem.remove();
            }
        });

        // Scroll input into view on mobile when focused
        input.addEventListener('focus', () => {
            setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300); // Wait for keyboard to appear
        });
    }

    editTask(taskItem, date, task) {
        const textSpan = taskItem.querySelector('.task-text');
        const originalText = textSpan.textContent;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-input';
        // Tells mobile keyboards/WebViews this isn't a "next field" in a sequence —
        // without it, some Android WebViews auto-advance focus to whatever focusable
        // element follows in DOM order (e.g. the notes textarea after the last day).
        input.setAttribute('enterkeyhint', 'done');
        input.value = originalText;
        
        textSpan.replaceWith(input);
        input.focus();
        input.select();
        
        let saved = false; // Track if already saved
        
        const saveEdit = () => {
            if (saved) return; // Prevent double save
            saved = true;
            
            const finalText = input.value.trim();
            if (finalText && finalText !== originalText) {
                this.updateTask(date, task.id, { text: finalText });
            }
            this.renderWeek();
        };
        
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                input.blur(); // This will trigger saveEdit via blur
            } else if (e.key === 'Escape') {
                saved = true; // Prevent blur from saving
                this.renderWeek();
            }
        });
    }

    // Settings Modal
openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const viewModeSelect = document.getElementById('viewMode');
    const shortcutSelect = document.getElementById('keyboardShortcut');
    const timeFormatSelect = document.getElementById('timeFormatSelect');
    const themeSelect = document.getElementById('themeSelect');
    const mobileNavLabelsSelect = document.getElementById('mobileNavLabels');
    const mobileNavLabelsSetting = document.getElementById('mobileNavLabelsSetting');
    const showBacklogSelect = document.getElementById('showBacklog');
    const autoMoveIncompleteTasksSelect = document.getElementById('autoMoveIncompleteTasks');
    const hideCompletedTasksSelect = document.getElementById('hideCompletedTasks');

    // Load current settings from in-memory object
    viewModeSelect.value = this.settings.viewMode || 'week';
    shortcutSelect.value = this.settings.keyboardShortcut || 'ctrl+shift+q';
    timeFormatSelect.value = this.settings.timeFormat || '24h';
    if (themeSelect) {
        themeSelect.value = this.settings.theme || 'dark';
    }
    if (showBacklogSelect) {
        showBacklogSelect.value = this.normalizeUnderWeekSectionMode(this.settings.showBacklog);
    }
    if (autoMoveIncompleteTasksSelect) {
        autoMoveIncompleteTasksSelect.value = this.settings.autoMoveIncompleteTasks || 'disabled';
    }
    if (hideCompletedTasksSelect) {
        hideCompletedTasksSelect.value = this.settings.hideCompletedTasks || 'disabled';
    }
    // Show mobile-only setting on mobile devices
    const isMobile = window.innerWidth <= 768;
    if (mobileNavLabelsSetting) {
        mobileNavLabelsSetting.style.display = isMobile ? 'flex' : 'none';
    }
    if (mobileNavLabelsSelect) {
        mobileNavLabelsSelect.value = this.settings.mobileNavLabels || 'show';
    }

    this.setModalVisibility(modal, true);
    this.updateBackupStatusFromSettings();
    this.runPluginHook('onOpenSettings');
    this.blurActiveElement();
}

    closeSettingsModal() {
        const modal = document.getElementById('settingsModal');
        this.setModalVisibility(modal, false);
    }

    saveSettingsModal() {
        const viewModeSelect = document.getElementById('viewMode');
        const shortcutSelect = document.getElementById('keyboardShortcut');
        const timeFormatSelect = document.getElementById('timeFormatSelect');
        const themeSelect = document.getElementById('themeSelect');
        const mobileNavLabelsSelect = document.getElementById('mobileNavLabels');
        const showBacklogSelect = document.getElementById('showBacklog');
        const autoMoveIncompleteTasksSelect = document.getElementById('autoMoveIncompleteTasks');
        const hideCompletedTasksSelect = document.getElementById('hideCompletedTasks');

        const viewMode = viewModeSelect.value;
        const keyboardShortcut = shortcutSelect.value;
        const timeFormat = timeFormatSelect.value;
        const theme = themeSelect ? themeSelect.value : (this.settings.theme || 'dark');
        const mobileNavLabels = mobileNavLabelsSelect ? mobileNavLabelsSelect.value : 'show';
        const showBacklog = this.normalizeUnderWeekSectionMode(showBacklogSelect ? showBacklogSelect.value : 'backlog');
        const autoMoveIncompleteTasks = autoMoveIncompleteTasksSelect ? autoMoveIncompleteTasksSelect.value : 'disabled';
        const hideCompletedTasks = hideCompletedTasksSelect ? hideCompletedTasksSelect.value : 'disabled';

        // Save settings
        this.saveSettings({
            viewMode,
            keyboardShortcut,
            timeFormat,
            theme,
            mobileNavLabels,
            showBacklog,
            autoMoveIncompleteTasks,
            hideCompletedTasks,
            ...this.collectPluginSettings(),
            // currentView is intentionally not saved here — this modal has no
            // day-count control, and this.currentView holds whichever of the
            // desktop/mobile values applies to the current session; blindly
            // resaving it under the shared "currentView" key would overwrite
            // desktop's setting when the modal is saved from mobile (see
            // changeView() and mobile-nav-manager.js for the real save paths).
        });

        // Apply mobile nav labels visibility
        this.applyMobileNavLabelsVisibility(mobileNavLabels);

        // Apply backlog visibility
        this.applyBacklogVisibility(showBacklog);

        // Re-render with new view mode and time format
        this.renderWeek();
        this.renderBacklog();

        this.closeSettingsModal();
    }

    async logout() {
        if (authManager && authManager.currentUser) {
            const result = await authManager.signOut();
            if (result.success) {
                window.location.href = 'login.html';
            }
        }
    }

    applyMobileNavLabelsVisibility(value) {
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        if (!bottomNav) return;

        if (value === 'hide') {
            bottomNav.classList.add('hide-labels');
        } else {
            bottomNav.classList.remove('hide-labels');
        }
    }

    applyBacklogVisibility(value) {
        const mode = this.normalizeUnderWeekSectionMode(value);
        const backlogSection = document.querySelector('.backlog-section');
        const notesSection = document.getElementById('notesSection');
        const notesPadInput = document.getElementById('notesPadInput');
        const weekContainer = document.querySelector('.week-container');

        if (notesPadInput && notesPadInput.value !== (this.settings.notesPadText || '')) {
            notesPadInput.value = this.settings.notesPadText || '';
        }

        if (mode === 'none') {
            if (backlogSection) backlogSection.classList.remove('visible');
            if (notesSection) notesSection.classList.remove('visible');
            if (weekContainer) weekContainer.classList.add('no-backlog');
            return;
        }

        if (mode === 'notes') {
            if (backlogSection) backlogSection.classList.remove('visible');
            if (notesSection) notesSection.classList.add('visible');
            if (weekContainer) weekContainer.classList.remove('no-backlog');
            return;
        }

        if (backlogSection) backlogSection.classList.add('visible');
        if (notesSection) notesSection.classList.remove('visible');
        if (weekContainer) weekContainer.classList.remove('no-backlog');
    }

    queueSaveNotesPad(textValue) {
        this.settings.notesPadText = typeof textValue === 'string' ? textValue : '';
        if (this.notesPadSaveTimeout) {
            clearTimeout(this.notesPadSaveTimeout);
        }
        this.notesPadSaveTimeout = setTimeout(() => {
            this.saveSettings({ notesPadText: this.settings.notesPadText });
            this.notesPadSaveTimeout = null;
        }, 500);
    }

    applyTheme(themeValue) {
        const theme = themeValue === 'light' ? 'light' : 'dark';
        this.settings.theme = theme;

        const root = document.documentElement;
        if (theme === 'light') {
            root.setAttribute('data-theme', 'light');
        } else {
            root.removeAttribute('data-theme');
        }

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.setAttribute('content', theme === 'light' ? '#f5f8ff' : '#0f172a');
        }
    }

    // Confirmation Modal
    showConfirmModal(title, message, isRecurring = false) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const singleBtn = document.getElementById('confirmSingle');
            const deleteBtn = document.getElementById('confirmDelete');
            const cancelBtn = document.getElementById('confirmCancel');
            
            titleEl.textContent = title;
            messageEl.textContent = message;
            cancelBtn.textContent = this.t('cancel');
            
            // Show/hide "Nur diese" button for recurring tasks
            if (isRecurring) {
                singleBtn.style.display = 'block';
                deleteBtn.textContent = this.t('deleteAll');
            } else {
                singleBtn.style.display = 'none';
                deleteBtn.textContent = this.t('delete');
            }
            
            this.confirmCallback = resolve;
            this.setModalVisibility(modal, true);
            this.blurActiveElement();
        });
    }

    showActionConfirmModal(title, message, confirmLabel, cancelLabel = null) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const singleBtn = document.getElementById('confirmSingle');
            const deleteBtn = document.getElementById('confirmDelete');
            const cancelBtn = document.getElementById('confirmCancel');

            titleEl.textContent = title;
            messageEl.textContent = message;
            singleBtn.style.display = 'none';
            deleteBtn.textContent = confirmLabel;
            cancelBtn.textContent = cancelLabel || this.t('cancel');

            this.confirmCallback = (result) => resolve(result === 'delete');
            this.setModalVisibility(modal, true);
            this.blurActiveElement();
        });
    }

    closeConfirmModal() {
        const modal = document.getElementById('confirmModal');
        this.setModalVisibility(modal, false);
        this.confirmCallback = null;
    }

    showUnsavedChangesModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const singleBtn = document.getElementById('confirmSingle');
            const deleteBtn = document.getElementById('confirmDelete');
            const cancelBtn = document.getElementById('confirmCancel');

            titleEl.textContent = this.t('unsavedChanges');
            messageEl.textContent = this.t('unsavedChangesMessage');

            // Reconfigure buttons for save/discard/cancel
            singleBtn.style.display = 'block';
            singleBtn.textContent = this.t('saveAndClose');
            deleteBtn.textContent = this.t('discardChanges');
            cancelBtn.textContent = this.t('cancel');

            // Remove old listeners and add new ones
            const newSingleBtn = singleBtn.cloneNode(true);
            const newDeleteBtn = deleteBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);

            singleBtn.parentNode.replaceChild(newSingleBtn, singleBtn);
            deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            newSingleBtn.onclick = () => {
                this.setModalVisibility(modal, false);
                resolve('save');
            };

            newDeleteBtn.onclick = () => {
                this.setModalVisibility(modal, false);
                resolve('discard');
            };

            newCancelBtn.onclick = () => {
                this.setModalVisibility(modal, false);
                resolve('cancel');
            };

            this.setModalVisibility(modal, true);
            this.blurActiveElement();
        });
    }

// Task Details Modal
setupModalDescriptionAutoResize() {
    const descriptionInput = document.getElementById('modalDescription');
    if (!descriptionInput) return;

    const resizeToContent = () => {
        descriptionInput.style.height = 'auto';
        descriptionInput.style.height = `${descriptionInput.scrollHeight}px`;
    };

    // Keep a reusable reference for explicit calls after value updates.
    this.resizeModalDescriptionToContent = resizeToContent;

    // Avoid duplicate listeners across repeated modal opens.
    descriptionInput.oninput = () => {
        this.modalHasChanges = true;
        resizeToContent();
    };

    resizeToContent();
}

    setupTaskModalMenu() {
        const toggleBtn = document.getElementById('modalMenuToggle');
        const dropdown = document.getElementById('modalMenuDropdown');
        const addDeadlineBtn = document.getElementById('modalMenuAddDeadline');
        const addTagsBtn = document.getElementById('modalMenuAddTags');
        const attachFilesBtn = document.getElementById('modalMenuAttachFiles');
        const duplicateBtn = document.getElementById('modalMenuDuplicate');
        const moveTodayBtn = document.getElementById('modalMenuMoveToday');
        const moveTomorrowBtn = document.getElementById('modalMenuMoveTomorrow');
        const moveInboxBtn = document.getElementById('modalMenuMoveInbox');
        const detachTaskBtn = document.getElementById('modalMenuDetachTask');
        const pauseRecurringBtn = document.getElementById('modalMenuPauseRecurring');
        const deleteBtn = document.getElementById('modalMenuDelete');

        if (!toggleBtn || !dropdown) return;

        const closeMenu = () => {
            dropdown.classList.remove('active');
            toggleBtn.classList.remove('active');
        };

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('active');
            closeMenu();
            if (!isOpen) {
                dropdown.classList.add('active');
                toggleBtn.classList.add('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.classList.contains('active')) return;
            if (!dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
                closeMenu();
            }
        });

        addDeadlineBtn?.addEventListener('click', () => {
            if (!this.hasFeature('deadlines')) {
                this.notifyFeatureLocked('deadlines');
                return;
            }
            this.setTaskModalSectionVisibility('deadline', true);
            closeMenu();
            document.getElementById('modalDeadlineDate')?.focus();
        });

        addTagsBtn?.addEventListener('click', () => {
            if (!this.hasFeature('tags')) {
                this.notifyFeatureLocked('tags');
                return;
            }
            this.setTaskModalSectionVisibility('tags', true);
            closeMenu();
            document.getElementById('tagInput')?.focus();
        });

        attachFilesBtn?.addEventListener('click', () => {
            if (!this.hasFeature('attachments')) {
                this.notifyFeatureLocked('attachments');
                return;
            }
            this.setTaskModalSectionVisibility('attachments', true);
            closeMenu();
            document.getElementById('modalAttachmentAddBtn')?.click();
        });

        duplicateBtn?.addEventListener('click', () => {
            closeMenu();
            this.duplicateTaskFromModal();
        });

        moveTodayBtn?.addEventListener('click', () => {
            closeMenu();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            this.moveTaskFromModalToDate(today);
        });

        moveTomorrowBtn?.addEventListener('click', () => {
            closeMenu();
            const tomorrow = new Date();
            tomorrow.setHours(0, 0, 0, 0);
            tomorrow.setDate(tomorrow.getDate() + 1);
            this.moveTaskFromModalToDate(tomorrow);
        });

        moveInboxBtn?.addEventListener('click', () => {
            closeMenu();
            this.moveTaskFromModalToInbox();
        });

        detachTaskBtn?.addEventListener('click', () => {
            closeMenu();
            this.detachRecurringTaskFromModal();
        });

        pauseRecurringBtn?.addEventListener('click', () => {
            closeMenu();
            const task = this.currentModalTask?.task;
            if (task) {
                this.closeTaskModal(false);
                this.pauseRecurringTask(task);
            }
        });

        deleteBtn?.addEventListener('click', () => {
            closeMenu();
            this.deleteTaskFromModal();
        });
    }

    setupTaskContextMenu() {
        if (this.isAndroidAppRuntime()) return;

        const menu = document.getElementById('taskContextMenu');
        if (!menu || menu.dataset.initialized === 'true') return;
        menu.dataset.initialized = 'true';

        const closeMenu = () => this.hideTaskContextMenu();

        document.addEventListener('click', (e) => {
            if (!menu.classList.contains('active')) return;
            if (!menu.contains(e.target)) closeMenu();
        });

        document.addEventListener('contextmenu', (e) => {
            if (!menu.classList.contains('active')) return;
            if (!menu.contains(e.target)) closeMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMenu();
        });

        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('resize', closeMenu);
    }

    hideTaskContextMenu() {
        const menu = document.getElementById('taskContextMenu');
        if (!menu) return;
        menu.classList.remove('active');
        this.contextMenuTaskRef = null;
    }

    showTaskContextMenu(x, y, taskRef) {
        if (this.isAndroidAppRuntime()) return;
        if (!taskRef?.task) return;

        const menu = document.getElementById('taskContextMenu');
        if (!menu) return;

        const task = taskRef.task;
        const isRecurringTask = !!((task.recurring && task.recurring !== 'none') || task.recurringId);
        const isInboxTask = taskRef.backlogId === 'inbox';

        const item = (action, label, svg, extraClass = '') => `
            <button class="modal-menu-item${extraClass ? ` ${extraClass}` : ''}" type="button" data-action="${action}">
                ${svg}
                <span>${label}</span>
            </button>
        `;

        const inboxMoveIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 4H9l-3-4H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`;

        const menuItems = [];

        if (!isRecurringTask) {
            menuItems.push(item('moveToday', this.t('menuMoveToday'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><polyline points="9 14 7 16 9 18"></polyline><line x1="7" y1="16" x2="14" y2="16"></line></svg>`));
            menuItems.push(item('moveTomorrow', this.t('menuMoveTomorrow'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><polyline points="15 14 17 16 15 18"></polyline><line x1="10" y1="16" x2="17" y2="16"></line></svg>`));
        }

        if (!isInboxTask && !isRecurringTask) {
            menuItems.push(item('moveInbox', this.t('menuMoveInbox'), inboxMoveIcon));
        }

        if (!isRecurringTask) {
            menuItems.push(item('duplicate', this.t('menuDuplicate'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`));
        }
        if (isRecurringTask) {
            const isPaused = this.getPausedRecurringIds().has(task.recurringId);
            if (!isPaused) {
                menuItems.push(item('pauseRecurring', this.t('menuPauseRecurring'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`));
            }
            menuItems.push(item('detach', this.t('menuDetachTask'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>`));
        }
        menuItems.push(item('delete', this.t('delete'), `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`, 'danger'));

        menu.innerHTML = menuItems.join('');

        this.contextMenuTaskRef = taskRef;

        menu.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.runTaskContextMenuAction(btn.dataset.action);
            });
        });

        menu.classList.add('active');

        const margin = 8;
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(x, window.innerWidth - menuRect.width - margin);
        const top = Math.min(y, window.innerHeight - menuRect.height - margin);
        menu.style.left = `${Math.max(margin, left)}px`;
        menu.style.top = `${Math.max(margin, top)}px`;
    }

    runTaskContextMenuAction(action) {
        const taskRef = this.contextMenuTaskRef;
        if (!taskRef || !taskRef.task) return;
        const isRecurringTask = !!((taskRef.task.recurring && taskRef.task.recurring !== 'none') || taskRef.task.recurringId);

        const previousModalTask = this.currentModalTask;
        this.currentModalTask = taskRef;
        this.modalHasChanges = false;

        try {
            if ((action === 'duplicate' || action === 'moveToday' || action === 'moveTomorrow') && isRecurringTask) {
                return;
            }
            if (action === 'duplicate') {
                this.duplicateTaskFromModal();
            } else if (action === 'moveToday') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                this.moveTaskFromModalToDate(today);
            } else if (action === 'moveTomorrow') {
                const tomorrow = new Date();
                tomorrow.setHours(0, 0, 0, 0);
                tomorrow.setDate(tomorrow.getDate() + 1);
                this.moveTaskFromModalToDate(tomorrow);
            } else if (action === 'moveInbox') {
                this.moveTaskFromModalToInbox();
            } else if (action === 'pauseRecurring') {
                this.pauseRecurringTask(taskRef.task);
            } else if (action === 'detach') {
                this.detachRecurringTaskFromModal();
            } else if (action === 'delete') {
                this.deleteTaskFromModal();
            }
        } finally {
            this.hideTaskContextMenu();
            if (document.getElementById('taskModal')?.style.display !== 'flex') {
                this.currentModalTask = previousModalTask && previousModalTask.isNew ? previousModalTask : null;
            }
        }
    }

    setTaskModalSectionVisibility(section, isVisible) {
        const sectionMap = {
            deadline: 'modalDeadlineSection',
            tags: 'modalTagsSection',
            attachments: 'modalAttachmentsSection'
        };

        const sectionId = sectionMap[section];
        if (!sectionId) return;

        const el = document.getElementById(sectionId);
        if (!el) return;

        el.classList.toggle('is-hidden', !isVisible);
        this.modalOptionalSections[section] = !!isVisible;
        this.updateTaskModalMenuItems();
    }

    initializeTaskModalOptionalSections(task) {
        const hasDeadline = this.hasFeature('deadlines') && !!task?.deadlineDate;
        const hasTags = this.hasFeature('tags') && Array.isArray(task?.tags) && task.tags.length > 0;
        const hasAttachments = this.hasFeature('attachments') && Array.isArray(task?.attachments) && task.attachments.length > 0;

        this.setTaskModalSectionVisibility('deadline', hasDeadline);
        this.setTaskModalSectionVisibility('tags', hasTags);
        this.setTaskModalSectionVisibility('attachments', hasAttachments);
    }

    updateTaskModalMenuItems() {
        const isNewTask = !!this.currentModalTask?.isNew;
        const addDeadlineBtn = document.getElementById('modalMenuAddDeadline');
        const addTagsBtn = document.getElementById('modalMenuAddTags');
        const attachFilesBtn = document.getElementById('modalMenuAttachFiles');
        const duplicateBtn = document.getElementById('modalMenuDuplicate');
        const moveTodayBtn = document.getElementById('modalMenuMoveToday');
        const moveTomorrowBtn = document.getElementById('modalMenuMoveTomorrow');
        const moveInboxBtn = document.getElementById('modalMenuMoveInbox');
        const detachTaskModalBtn = document.getElementById('modalMenuDetachTask');
        const pauseRecurringModalBtn = document.getElementById('modalMenuPauseRecurring');
        const deleteBtn = document.getElementById('modalMenuDelete');
        const isInboxTask = this.currentModalTask?.backlogId === 'inbox';
        const task = this.currentModalTask?.task;
        const isRecurringTask = !!(task && ((task.recurring && task.recurring !== 'none') || task.recurringId));

        if (addDeadlineBtn) {
            if (!this.hasFeature('deadlines')) {
                addDeadlineBtn.style.display = 'none';
            } else {
                addDeadlineBtn.style.display = this.modalOptionalSections.deadline ? 'none' : 'flex';
            }
        }
        if (addTagsBtn) {
            if (!this.hasFeature('tags')) {
                addTagsBtn.style.display = 'none';
            } else {
                addTagsBtn.style.display = this.modalOptionalSections.tags ? 'none' : 'flex';
            }
        }
        if (attachFilesBtn) {
            if (!this.hasFeature('attachments')) {
                attachFilesBtn.style.display = 'none';
            } else {
                attachFilesBtn.style.display = this.modalOptionalSections.attachments ? 'none' : 'flex';
            }
        }
        if (duplicateBtn) duplicateBtn.style.display = (!isNewTask && !isRecurringTask) ? 'flex' : 'none';
        if (moveTodayBtn) moveTodayBtn.style.display = (!isNewTask && !isRecurringTask) ? 'flex' : 'none';
        if (moveTomorrowBtn) moveTomorrowBtn.style.display = (!isNewTask && !isRecurringTask) ? 'flex' : 'none';
        if (moveInboxBtn) moveInboxBtn.style.display = (!isNewTask && !isInboxTask && !isRecurringTask) ? 'flex' : 'none';
        if (detachTaskModalBtn) detachTaskModalBtn.style.display = (!isNewTask && isRecurringTask) ? 'flex' : 'none';
        if (pauseRecurringModalBtn) {
            const isPaused = isRecurringTask && task?.recurringId ? this.getPausedRecurringIds().has(task.recurringId) : false;
            pauseRecurringModalBtn.style.display = (!isNewTask && isRecurringTask && !isPaused) ? 'flex' : 'none';
        }
        if (deleteBtn) deleteBtn.style.display = isNewTask ? 'none' : 'flex';
    }

    async ensureStorageReady() {
        if (this.isLocalAuthMode()) {
            throw new Error('attachment-local-unavailable');
        }

        if (this.storageApi && this.storageInstance) {
            return { api: this.storageApi, storage: this.storageInstance };
        }

        const { auth } = await initFirebase();
        if (!auth || !auth.currentUser) {
            throw new Error('attachment-auth-required');
        }

        const api = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
        this.storageApi = api;
        this.storageInstance = api.getStorage(auth.app);
        return { api: this.storageApi, storage: this.storageInstance };
    }

    getFileExtension(fileName) {
        if (!fileName || !fileName.includes('.')) return '';
        return fileName.split('.').pop().toLowerCase();
    }

    sanitizeFilename(fileName) {
        return (fileName || 'file')
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 120);
    }

    isAllowedAttachment(file) {
        const extension = this.getFileExtension(file.name);
        const mimeType = String(file.type || '').toLowerCase();
        const extensionAllowed = this.allowedAttachmentExtensions.has(extension);
        const mimeAllowed = mimeType.startsWith('image/')
            ? ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)
            : this.allowedAttachmentMimeTypes.has(mimeType) || mimeType === '' || mimeType === 'application/octet-stream';

        return extensionAllowed && mimeAllowed;
    }

    setAttachmentStatus(message = '', type = '') {
        const statusEl = document.getElementById('modalAttachmentsStatus');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.remove('error', 'success');
        if (type) statusEl.classList.add(type);
    }

    getAttachmentStoragePath(taskId, attachmentId, fileName) {
        const userId = this.currentUser?.uid;
        if (!userId) throw new Error('attachment-auth-required');
        const safeName = this.sanitizeFilename(fileName);
        return `users/${userId}/attachments/${taskId}/${attachmentId}_${safeName}`;
    }

    setupAttachmentInput(task) {
        const input = document.getElementById('modalAttachmentInput');
        const addBtn = document.getElementById('modalAttachmentAddBtn');

        if (!input || !addBtn) return;
        if (!this.hasFeature('attachments')) {
            addBtn.disabled = true;
            this.setAttachmentStatus('', '');
            this.renderAttachments(task);
            return;
        }
        this.setAttachmentStatus('', '');

        const inputClone = input.cloneNode(true);
        input.replaceWith(inputClone);

        const addBtnClone = addBtn.cloneNode(true);
        addBtn.replaceWith(addBtnClone);

        addBtnClone.addEventListener('click', () => {
            inputClone.click();
        });

        inputClone.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            await this.addAttachments(files);
            inputClone.value = '';
        });

        this.renderAttachments(task);
    }

    async addAttachments(files) {
        if (!this.hasFeature('attachments')) {
            this.notifyFeatureLocked('attachments');
            return;
        }
        const task = this.currentModalTask?.task;
        if (!task || !Array.isArray(files) || files.length === 0) return;
        if (!task.id) {
            task.id = Date.now() + Math.random();
        }
        if (!Array.isArray(task.attachments)) {
            task.attachments = [];
        }

        let uploadedCount = 0;
        const errors = [];

        for (const file of files) {
            if (!this.isAllowedAttachment(file)) {
                errors.push(`${file.name}: ${this.t('attachmentInvalidType')}`);
                continue;
            }

            if (Number(file.size || 0) > this.attachmentMaxSizeBytes) {
                errors.push(`${file.name}: ${this.t('attachmentTooLarge')}`);
                continue;
            }

            try {
                const { api, storage } = await this.ensureStorageReady();
                const attachmentId = Date.now() + Math.random();
                const storagePath = this.getAttachmentStoragePath(task.id, attachmentId, file.name);
                const storageRef = api.ref(storage, storagePath);
                const snapshot = await api.uploadBytes(storageRef, file, {
                    contentType: file.type || 'application/octet-stream',
                    customMetadata: {
                        ownerUid: this.currentUser.uid,
                        originalName: file.name
                    }
                });

                task.attachments.push({
                    id: attachmentId,
                    name: file.name,
                    size: file.size || 0,
                    type: file.type || 'application/octet-stream',
                    storagePath,
                    contentType: snapshot.metadata?.contentType || file.type || 'application/octet-stream',
                    uploadedAt: new Date().toISOString()
                });
                uploadedCount += 1;
            } catch (error) {
                errors.push(`${file.name}: ${this.t('attachmentUploadError')}`);
            }
        }

        this.modalHasChanges = uploadedCount > 0 || errors.length > 0;
        this.renderAttachments(task);

        if (errors.length > 0) {
            this.setAttachmentStatus(errors.join(' | '), 'error');
            return;
        }

        if (uploadedCount > 0) {
            this.setAttachmentStatus(`${uploadedCount} ${this.t('attachmentUploaded')}`, 'success');
        } else {
            this.setAttachmentStatus('');
        }
    }

    async removeAttachment(attachmentId) {
        const task = this.currentModalTask?.task;
        if (!task || !Array.isArray(task.attachments)) return;

        const attachment = task.attachments.find((item) => item.id === attachmentId);
        if (!attachment) return;

        task.attachments = task.attachments.filter((item) => item.id !== attachmentId);
        try {
            await this.deleteAttachmentPathsIfOrphaned([attachment.storagePath]);
        } catch (error) {
            this.setAttachmentStatus(this.t('attachmentDeleteError'), 'error');
        }
        this.modalHasChanges = true;
        this.renderAttachments(task);
        this.setAttachmentStatus('', '');
    }

    async downloadAttachment(attachment) {
        if (!attachment || !attachment.storagePath) return;
        try {
            const { api, storage } = await this.ensureStorageReady();
            const storageRef = api.ref(storage, attachment.storagePath);
            const downloadUrl = await api.getDownloadURL(storageRef);
            const safeName = this.sanitizeFilename(attachment.name || 'download');
            const separator = downloadUrl.includes('?') ? '&' : '?';
            const forcedUrl = `${downloadUrl}${separator}response-content-disposition=${encodeURIComponent(`attachment; filename=\"${safeName}\"`)}`;

            if (typeof AndroidFiles !== 'undefined' && typeof AndroidFiles.downloadFile === 'function') {
                AndroidFiles.downloadFile(forcedUrl, attachment.name || 'download', attachment.contentType || attachment.type || '');
                return;
            }

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            this.setAttachmentStatus(this.t('attachmentDownloadError'), 'error');
        }
    }

    formatAttachmentSize(bytes) {
        if (!bytes || bytes < 1024) return `${bytes || 0} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    renderAttachments(task) {
        const list = document.getElementById('modalAttachmentsList');
        if (!list) return;

        list.innerHTML = '';
        const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
        if (attachments.length === 0) return;

        attachments.forEach((attachment) => {
            const item = document.createElement('div');
            item.className = 'attachment-item';

            const meta = document.createElement('div');
            meta.className = 'attachment-meta';

            const name = document.createElement('span');
            name.className = 'attachment-name';
            name.textContent = attachment.name || 'file';

            const size = document.createElement('span');
            size.className = 'attachment-size';
            size.textContent = this.formatAttachmentSize(Number(attachment.size || 0));

            meta.appendChild(name);
            meta.appendChild(size);

            const actions = document.createElement('div');
            actions.className = 'attachment-actions';

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'attachment-download';
            downloadBtn.type = 'button';
            downloadBtn.textContent = this.t('download');
            downloadBtn.title = this.t('download');
            downloadBtn.addEventListener('click', () => this.downloadAttachment(attachment));

            const removeBtn = document.createElement('button');
            removeBtn.className = 'attachment-remove';
            removeBtn.type = 'button';
            removeBtn.title = this.t('delete');
            removeBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            removeBtn.addEventListener('click', () => this.removeAttachment(attachment.id));

            actions.appendChild(downloadBtn);
            actions.appendChild(removeBtn);
            item.appendChild(meta);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

openTaskModal(date, task, backlogId = null) {
    const modal = document.getElementById('taskModal');
    const titleInput = document.getElementById('modalTitle');
    const descriptionInput = document.getElementById('modalDescription');
    const dateInput = document.getElementById('modalDate');
    const recurringSelect = document.getElementById('modalRecurring');
    const eventTimeInput = document.getElementById('modalEventTime');
    const deadlineInput = document.getElementById('modalDeadlineDate');
    const reminderEnabled = document.getElementById('modalReminderEnabled');
    const reminderTime = document.getElementById('modalReminderTime');
    const reminderTimeContainer = document.getElementById('reminderTimeContainer');
    const reminderSection = reminderEnabled ? reminderEnabled.closest('.modal-reminder') : null;

    // Store current task data
    this.currentModalTask = backlogId ? { backlogId, task } : { date, task };

    // Store initial values for change detection
        this.modalInitialValues = {
        title: task.text || '',
        description: task.description || '',
        recurring: task.recurring || 'none',
        eventTime: task.eventTime || '',
        reminderEnabled: task.reminderEnabled || false,
        reminderTime: task.reminderTime || '09:00',
        deadlineDate: task.deadlineDate || '',
        color: task.color || 'none',
        tags: [...(task.tags || [])],
        attachments: [...(task.attachments || [])]
    };

    // Reset change flag
    this.modalHasChanges = false;

    // Populate modal
        titleInput.value = task.text;
        descriptionInput.value = task.description || '';
        
        // Fix timezone - use DD.MM.YYYY format (skip for backlog tasks)
        if (date) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            dateInput.value = `${day}.${month}.${year}`;
        } else {
            dateInput.value = '';
        }
        
        recurringSelect.value = task.recurring || 'none';
        recurringSelect.disabled = task.recurringId ? true : false;
        eventTimeInput.value = task.eventTime || '';
        deadlineInput.value = task.deadlineDate || '';
        const canUseReminders = this.hasFeature('reminders');
        reminderEnabled.checked = canUseReminders ? (task.reminderEnabled || false) : false;
        reminderTime.value = canUseReminders ? (task.reminderTime || '09:00') : '09:00';
        reminderEnabled.disabled = !canUseReminders;
        reminderTime.disabled = !canUseReminders;
        if (reminderSection) reminderSection.style.display = canUseReminders ? 'flex' : 'none';
        
        // Set color picker
        if (window.colorPicker) {
            window.colorPicker.setColor(task.color || 'none');
        }

        this.initializeTaskModalOptionalSections(task);
        
        // Show/hide reminder time based on checkbox
        reminderTimeContainer.style.display = canUseReminders && reminderEnabled.checked ? 'flex' : 'none';
        
    // Add listener for checkbox toggle
    reminderEnabled.onchange = () => {
        reminderTimeContainer.style.display = reminderEnabled.checked ? 'flex' : 'none';
        this.modalHasChanges = true;
    };

    this.setupModalDescriptionAutoResize();

    // Add change listeners for all inputs
    const trackChange = () => { this.modalHasChanges = true; };
    titleInput.addEventListener('input', trackChange);
    dateInput.addEventListener('change', trackChange);
    recurringSelect.addEventListener('change', trackChange);
    eventTimeInput.addEventListener('input', trackChange);
    deadlineInput.addEventListener('change', trackChange);
    reminderTime.addEventListener('change', trackChange);

    // Track color picker changes
    if (window.colorPicker) {
        window.colorPicker.onChange(() => {
            this.modalHasChanges = true;
        });
    }

    // Render subtasks
        this.renderSubtasks(task);
        
        // Add subtask button handler
        document.getElementById('addSubtaskBtn').onclick = () => {
            this.addSubtask();
        };
        
        // Render tags
        this.renderTags(task);
        
        // Setup tag input
        this.setupTagInput(task);
        this.setupAttachmentInput(task);
        this.updateTaskModalMenuItems();
        
        // Show modal
        this.setModalVisibility(modal, true);
        requestAnimationFrame(() => {
            if (this.resizeModalDescriptionToContent) {
                this.resizeModalDescriptionToContent();
            }
        });
        this.blurActiveElement();
    }

    async closeTaskModal(force = false) {
        // Check if there are unsaved changes
        if (!force && this.modalHasChanges) {
            const result = await this.showUnsavedChangesModal();

            if (result === 'save') {
                // Save and close
                this.saveTaskModal();
                return;
            } else if (result === 'discard') {
                // Close without saving
                this.modalHasChanges = false;
            } else {
                // Cancel - keep modal open
                return;
            }
        }

        const modal = document.getElementById('taskModal');
        this.setModalVisibility(modal, false);
        const menu = document.getElementById('modalMenuDropdown');
        const menuBtn = document.getElementById('modalMenuToggle');
        if (menu) menu.classList.remove('active');
        if (menuBtn) menuBtn.classList.remove('active');
        this.currentModalTask = null;
        this.modalHasChanges = false;
        this.modalInitialValues = null;
    }

    async saveTaskModal() {
        if (!this.currentModalTask) return;
        
        const titleInput = document.getElementById('modalTitle');
        const descriptionInput = document.getElementById('modalDescription');
        const dateInput = document.getElementById('modalDate');
        const recurringSelect = document.getElementById('modalRecurring');
        const eventTimeInput = document.getElementById('modalEventTime');
        const deadlineInput = document.getElementById('modalDeadlineDate');
        const reminderEnabled = document.getElementById('modalReminderEnabled');
        const reminderTime = document.getElementById('modalReminderTime');
        
        const inputText = titleInput.value.trim();
        const newDescription = descriptionInput.value.trim();
        const newRecurring = recurringSelect.value;
        const inputEventTime = eventTimeInput.value || null;
        const inputDeadlineDate = deadlineInput.value || null;
        const inputReminderEnabled = reminderEnabled.checked;
        const inputReminderTime = reminderTime.value;
        const selectedDateValue = dateInput.value;
        const inputColor = window.colorPicker ? window.colorPicker.getColor() : 'none';
        
        const canUseParsing = this.hasFeature('ramble_parsing');
        const canUseReminders = this.hasFeature('reminders');
        const canUseTags = this.hasFeature('tags');
        const canUseDeadlines = this.hasFeature('deadlines');
        const parsed = canUseParsing ? (new window.TaskParser()).parse(inputText) : {};
        const finalText = (parsed.text || inputText).trim();
        
        // Validation
        if (!finalText) {
            titleInput.focus();
            return;
        }
        if (!selectedDateValue && !this.currentModalTask.backlogId) {
            dateInput.focus();
            return;
        }
        
        // Parse DD.MM.YYYY format or use parsed date
        let selectedDate;
        if (parsed.date) {
            selectedDate = parsed.date;
        } else if (selectedDateValue) {
            const parts = selectedDateValue.split('.');
            if (parts.length === 3) {
                selectedDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
                selectedDate = this.currentModalTask.date;
            }
        } else {
            selectedDate = this.currentModalTask.date;
        }
        
        // Use parsed values if available (parsed takes priority)
        const finalColor = inputColor;
        const finalEventTime = (canUseParsing ? parsed.time : null) || inputEventTime;
        const finalReminderEnabled = canUseReminders && !!((canUseParsing ? parsed.reminder : null) || inputReminderEnabled);
        const finalReminderTime = canUseReminders
            ? ((canUseParsing ? parsed.reminder : null) || (inputReminderEnabled ? inputReminderTime : null))
            : null;
        const existingTags = [...((this.currentModalTask.task && this.currentModalTask.task.tags) || [])];
        const existingDeadlineDate = (this.currentModalTask.task && this.currentModalTask.task.deadlineDate) || null;
        const finalDeadlineDate = canUseDeadlines ? inputDeadlineDate : existingDeadlineDate;
        const finalTags = canUseTags ? existingTags : existingTags;
        const finalSubtasks = [...((this.currentModalTask.task && this.currentModalTask.task.subtasks) || [])];
        const finalAttachments = [...((this.currentModalTask.task && this.currentModalTask.task.attachments) || [])];

        // Check if it's a backlog task
        if (this.currentModalTask.backlogId) {
            const { backlogId, task } = this.currentModalTask;

            if (backlogId === 'inbox' && selectedDateValue) {
                const movedTask = this.removeTaskFromBacklogList(backlogId, task.id);
                if (!movedTask) return;

                movedTask.text = finalText;
                movedTask.description = newDescription;
                movedTask.eventTime = finalEventTime;
                movedTask.deadlineDate = finalDeadlineDate;
                movedTask.reminderEnabled = finalReminderEnabled;
                movedTask.reminderTime = finalReminderTime;
                movedTask.color = finalColor;
                movedTask.tags = finalTags;
                movedTask.subtasks = finalSubtasks;
                movedTask.attachments = finalAttachments;
                delete movedTask.date;

                const targetDateKey = this.formatDate(selectedDate);
                if (!this.tasks[targetDateKey]) {
                    this.tasks[targetDateKey] = [];
                }
                const insertIndex = this.normalizeDayInsertIndex(this.tasks[targetDateKey], movedTask, -1);
                this.tasks[targetDateKey].splice(insertIndex, 0, movedTask);

                this.saveBacklogs();
                this.saveTasksForDate(selectedDate);
                this.modalHasChanges = false;
                this.closeTaskModal(true);
                this.renderBacklog();
                this.renderWeek();
                return;
            }

            task.text = finalText;
            task.description = newDescription;
            task.eventTime = finalEventTime;
            task.deadlineDate = finalDeadlineDate;
            task.reminderEnabled = finalReminderEnabled;
            task.reminderTime = finalReminderTime;
            task.color = finalColor;
            task.tags = finalTags;
            task.subtasks = finalSubtasks;
            task.attachments = finalAttachments;
            this.saveBacklogs();
            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderBacklog();
            return;
        }
        
        // Check if it's a new task from quick add
        if (this.currentModalTask.isNew) {
            const task = {
                text: finalText,
                description: newDescription,
                recurring: newRecurring,
                eventTime: finalEventTime,
                reminderEnabled: finalReminderEnabled,
                reminderTime: finalReminderTime,
                color: finalColor,
                tags: finalTags,
                subtasks: finalSubtasks,
                attachments: finalAttachments
            };
            
            if (newRecurring !== 'none') {
                const recurringId = `recurring-${Date.now()}`;
                const recurringOrder = this.getNextRecurringOrder();
                task.recurringId = recurringId;
                const newRecurringTask = this.addTask(selectedDate, finalText, newDescription, newRecurring, recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate, recurringOrder);
                newRecurringTask.tags = finalTags;
                newRecurringTask.subtasks = finalSubtasks;
                newRecurringTask.attachments = finalAttachments;
                this.saveTasksForDate(selectedDate);
                await this.createRecurringInstances(selectedDate, finalText, newDescription, newRecurring, recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate, finalTags, finalSubtasks, finalAttachments, recurringOrder);
            } else {
                const newTask = this.addTask(selectedDate, finalText, newDescription, 'none', null, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate);
                newTask.tags = finalTags;
                newTask.subtasks = finalSubtasks;
                newTask.attachments = finalAttachments;
                this.saveTasksForDate(selectedDate);
            }
            
            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderWeek();
            return;
        }
        
        const { date, task } = this.currentModalTask;
        
        // Check if date changed
        const oldDateKey = this.formatDate(date);
        const newDateKey = this.formatDate(selectedDate);
        const dateChanged = oldDateKey !== newDateKey;
        
        // If date changed and task is recurring, handle special logic
        if (dateChanged && task.recurringId) {
            // Delete all recurring instances
            await this.deleteRecurringTasks(task.recurringId);
            
            // Create new instances from new date
            const movedRecurringTask = this.addTask(selectedDate, finalText, newDescription, newRecurring, task.recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate, task.recurringOrder ?? null);
            movedRecurringTask.tags = finalTags;
            movedRecurringTask.subtasks = finalSubtasks;
            movedRecurringTask.attachments = finalAttachments;
            this.saveTasksForDate(selectedDate);
            await this.createRecurringInstances(selectedDate, finalText, newDescription, newRecurring, task.recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate, finalTags, finalSubtasks, finalAttachments, task.recurringOrder ?? null);

            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderWeek();
            return;
        }
        
        // If date changed (non-recurring)
        if (dateChanged) {
            // Delete from old date
            this.deleteTask(date, task.id);
            
            // Add to new date with updated info
            const movedTask = this.addTask(selectedDate, finalText, newDescription, newRecurring, task.recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate);
            movedTask.tags = finalTags;
            movedTask.subtasks = finalSubtasks;
            movedTask.attachments = finalAttachments;
            this.saveTasksForDate(selectedDate);

            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderWeek();
            return;
        }
        
        // If task has recurring ID, update all tasks with same recurringId
        if (task.recurringId) {
            // Update all recurring instances
            await this.updateRecurringTasks(task.recurringId, {
                text: finalText,
                description: newDescription,
                eventTime: finalEventTime,
                deadlineDate: finalDeadlineDate,
                reminderEnabled: finalReminderEnabled,
                reminderTime: finalReminderTime,
                color: finalColor,
                tags: finalTags,
                subtasks: finalSubtasks,
                attachments: finalAttachments
            });
        } else {
            // Single task or changing to recurring
            if (newRecurring !== 'none' && newRecurring !== task.recurring) {
                // Convert to recurring task
                const recurringId = `recurring-${Date.now()}`;
                const recurringOrder = this.getNextRecurringOrder();
                this.updateTask(date, task.id, {
                    text: finalText,
                    description: newDescription,
                    recurring: newRecurring,
                    recurringId: recurringId,
                    recurringOrder: recurringOrder,
                    eventTime: finalEventTime,
                    deadlineDate: finalDeadlineDate,
                    reminderEnabled: finalReminderEnabled,
                    reminderTime: finalReminderTime,
                    color: finalColor,
                    tags: finalTags,
                    subtasks: finalSubtasks,
                    attachments: finalAttachments
                });
                // Create recurring instances
                await this.createRecurringInstances(date, finalText, newDescription, newRecurring, recurringId, finalReminderEnabled, finalReminderTime, finalColor, finalEventTime, finalDeadlineDate, finalTags, finalSubtasks, finalAttachments, recurringOrder);
            } else {
                // Just update this task
                this.updateTask(date, task.id, {
                    text: finalText,
                    description: newDescription,
                    recurring: newRecurring,
                    eventTime: finalEventTime,
                    deadlineDate: finalDeadlineDate,
                    reminderEnabled: finalReminderEnabled,
                    reminderTime: finalReminderTime,
                    color: finalColor,
                    tags: finalTags,
                    subtasks: finalSubtasks,
                    attachments: finalAttachments
                });
            }
        }
        
        // Schedule notification if enabled
        // No longer needed - interval checker handles this
        
        this.modalHasChanges = false;
        this.closeTaskModal(true); // force close without confirmation
        this.renderWeek();
    }

    async deleteTaskFromModal() {
        if (!this.currentModalTask) return;
        
        // Check if it's a backlog task
        if (this.currentModalTask.backlogId) {
            const { backlogId, task } = this.currentModalTask;
            
            const result = await this.showConfirmModal(
                this.t('deleteTask'),
                this.t('confirmDelete'),
                false
            );
            
            if (result === 'delete') {
                this.deleteBacklogTask(backlogId, task.id);
                this.modalHasChanges = false;
                this.closeTaskModal(true);
                this.renderBacklog();
            }
            return;
        }
        
        const { date, task } = this.currentModalTask;
        
        // Check if it's a recurring task
        if (task.recurringId) {
            const recurringType = task.recurring;
            const message = this.t('confirmDeleteRecurring');

            const result = await this.showConfirmModal(
                this.t('deleteTask'),
                message,
                true // is recurring
            );
            
            if (result === 'all') {
                await this.deleteRecurringTasks(task.recurringId);
            } else if (result === 'single') {
                this.deleteTask(date, task.id);
            } else {
                return; // Cancelled
            }
        } else {
            const result = await this.showConfirmModal(
                this.t('deleteTask'),
                this.t('confirmDelete'),
                false
            );
            
            if (result === 'delete') {
                this.deleteTask(date, task.id);
            } else {
                return; // Cancelled
            }
        }
        
        this.modalHasChanges = false;
        this.closeTaskModal(true);
        this.renderWeek();
    }

    duplicateTaskFromModal() {
        if (!this.currentModalTask || this.currentModalTask.isNew) return;

        const duplicateSuffix = this.t('duplicateSuffix');
        const buildText = (text) => `${text || ''}${duplicateSuffix}`.trim();

        if (this.currentModalTask.backlogId) {
            const { backlogId, task } = this.currentModalTask;
            if (!this.backlogs[backlogId]) return;

            const duplicatedTask = {
                ...JSON.parse(JSON.stringify(task)),
                id: Date.now() + Math.random(),
                text: buildText(task.text),
                recurring: 'none',
                recurringId: null,
                completed: false,
                attachments: Array.isArray(task.attachments) ? JSON.parse(JSON.stringify(task.attachments)) : [],
                createdAt: new Date().toISOString()
            };

            this.backlogs[backlogId].push(duplicatedTask);
            this.saveBacklogs();
            this.renderBacklog();
            this.modalHasChanges = false;
            this.closeTaskModal(true);
            return;
        }

        const { date, task } = this.currentModalTask;
        const clonedTask = this.addTask(
            date,
            buildText(task.text),
            task.description || '',
            'none',
            null,
            !!task.reminderEnabled,
            task.reminderTime || null,
            task.color || 'none',
            task.eventTime || null,
            task.deadlineDate || null
        );

        clonedTask.tags = Array.isArray(task.tags) ? [...task.tags] : [];
        clonedTask.subtasks = Array.isArray(task.subtasks) ? JSON.parse(JSON.stringify(task.subtasks)) : [];
        clonedTask.attachments = Array.isArray(task.attachments) ? JSON.parse(JSON.stringify(task.attachments)) : [];
        this.saveTasksForDate(date);
        this.renderWeek();
        this.modalHasChanges = false;
        this.closeTaskModal(true);
    }

    // Splits off a standalone, non-recurring copy of a recurring instance so it can be
    // rescheduled freely; the recurring series itself (and its completed state) is untouched.
    detachRecurringTaskFromModal() {
        if (!this.currentModalTask || this.currentModalTask.isNew) return;
        const { date, task } = this.currentModalTask;
        if (!date || !task) return;

        const clonedTask = this.addTask(
            date,
            task.text,
            task.description || '',
            'none',
            null,
            !!task.reminderEnabled,
            task.reminderTime || null,
            task.color || 'none',
            task.eventTime || null,
            task.deadlineDate || null
        );

        clonedTask.tags = Array.isArray(task.tags) ? [...task.tags] : [];
        clonedTask.subtasks = Array.isArray(task.subtasks) ? JSON.parse(JSON.stringify(task.subtasks)) : [];
        clonedTask.attachments = Array.isArray(task.attachments) ? JSON.parse(JSON.stringify(task.attachments)) : [];
        this.saveTasksForDate(date);
        this.renderWeek();
        this.modalHasChanges = false;
        this.closeTaskModal(true);
    }

    moveTaskFromModalToDate(targetDate) {
        if (!this.currentModalTask || this.currentModalTask.isNew || !targetDate) return;

        const normalizedTargetDate = new Date(targetDate);
        normalizedTargetDate.setHours(0, 0, 0, 0);

        if (this.currentModalTask.backlogId) {
            const { backlogId, task } = this.currentModalTask;
            this.moveTaskFromBacklog(backlogId, task.id, normalizedTargetDate);
            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderWeek();
            this.renderBacklog();
            return;
        }

        const { date, task } = this.currentModalTask;
        const sourceDateKey = this.formatDate(date);
        const targetDateKey = this.formatDate(normalizedTargetDate);
        if (sourceDateKey === targetDateKey) return;

        const sourceTasks = this.tasks[sourceDateKey];
        if (!Array.isArray(sourceTasks)) return;

        const currentIndex = sourceTasks.findIndex((t) => t.id === task.id);
        if (currentIndex === -1) return;

        const [movedTask] = sourceTasks.splice(currentIndex, 1);
        if (!this.tasks[targetDateKey]) {
            this.tasks[targetDateKey] = [];
        }
        this.tasks[targetDateKey].push(movedTask);

        this.saveTasksForDate(date);
        this.saveTasksForDate(normalizedTargetDate);

        this.modalHasChanges = false;
        this.closeTaskModal(true);
        this.renderWeek();
        this.renderBacklog();
    }

    moveTaskFromModalToInbox() {
        if (!this.currentModalTask || this.currentModalTask.isNew) return;
        const taskRef = this.currentModalTask.task;
        if (taskRef && ((taskRef.recurring && taskRef.recurring !== 'none') || taskRef.recurringId)) {
            return;
        }

        if (!this.backlogs.inbox) this.backlogs.inbox = [];

        if (this.currentModalTask.backlogId) {
            const { backlogId, task } = this.currentModalTask;
            if (backlogId === 'inbox') return;
            this.moveBacklogTask(backlogId, task.id, 'inbox', 0);
            this.modalHasChanges = false;
            this.closeTaskModal(true);
            this.renderBacklog();
            this.renderInbox();
            return;
        }

        const { date, task } = this.currentModalTask;
        const sourceDateKey = this.formatDate(date);
        const sourceTasks = this.tasks[sourceDateKey];
        if (!Array.isArray(sourceTasks)) return;

        const currentIndex = sourceTasks.findIndex((t) => t.id === task.id);
        if (currentIndex === -1) return;

        const [movedTask] = sourceTasks.splice(currentIndex, 1);
        this.backlogs.inbox.unshift(movedTask);

        this.saveTasksForDate(date);
        this.saveBacklogs();

        this.modalHasChanges = false;
        this.closeTaskModal(true);
        this.renderWeek();
        this.renderBacklog();
        this.renderInbox();
    }

    getRecurringLabel(recurring) {
        const isDe = this.currentLanguage !== 'en';
        const labels = isDe
            ? {
                'daily': 'täglich wiederkehrend',
                'weekly': 'wöchentlich wiederkehrend',
                'biweekly': 'zweiwöchentlich wiederkehrend',
                'monthly': 'monatlich wiederkehrend',
                'yearly': 'jährlich wiederkehrend'
            }
            : {
                'daily': 'recurs daily',
                'weekly': 'recurs weekly',
                'biweekly': 'recurs biweekly',
                'monthly': 'recurs monthly',
                'yearly': 'recurs yearly'
            };
        return labels[recurring] || (isDe ? 'wiederkehrend' : 'recurring');
    }

    // Recurring Tasks
    async createRecurringInstances(startDate, text, description, recurring, recurringId, reminderEnabled = false, reminderTime = null, color = 'none', eventTime = null, deadlineDate = null, tags = [], subtasks = [], attachments = [], recurringOrder = null) {
        const dates = this.getRecurringDates(startDate, recurring);
        if (dates.length === 0) return;

        // Important: merge remote date docs first for the full recurring range.
        // Otherwise, creating a new recurring task can overwrite unseen future days
        // that already contain other tasks (e.g. daily recurrences).
        if (this.firestoreManager && this.currentUser) {
            try {
                await this.hydrateRemoteTasksForDateRange(dates[0], dates[dates.length - 1]);
            } catch (error) {
                // Fall back to local state only; recurring creation should still proceed.
            }
        }
        
        dates.forEach(date => {
            const dateKey = this.formatDate(date);
            
            // Skip if already exists
            if (this.tasks[dateKey]?.some(t => t.recurringId === recurringId)) {
                return;
            }
            
            if (!this.tasks[dateKey]) {
                this.tasks[dateKey] = [];
            }
            
            const newTask = {
                id: Date.now() + Math.random(),
                text: text,
                description: description,
                completed: false,
                recurring: recurring,
                recurringId: recurringId,
                recurringOrder: Number.isFinite(recurringOrder) ? recurringOrder : this.getNextRecurringOrder(),
                reminderEnabled: reminderEnabled,
                reminderTime: reminderTime,
                eventTime: eventTime,
                deadlineDate: deadlineDate || null,
                tags: Array.isArray(tags) ? [...tags] : [],
                subtasks: Array.isArray(subtasks) ? JSON.parse(JSON.stringify(subtasks)) : [],
                attachments: Array.isArray(attachments) ? JSON.parse(JSON.stringify(attachments)) : [],
                color: color,
                recurringStartDate: this.formatDate(startDate),
                createdAt: new Date().toISOString()
            };
            
            this.tasks[dateKey].push(newTask);
            if (!this.localDateMutationAt) this.localDateMutationAt = {};
            this.localDateMutationAt[dateKey] = Date.now();
            
            // No longer scheduling individually - interval checker handles all
        });
        
        await this.saveTaskDateKeysImmediately(dates.map((date) => this.formatDate(date)));
    }

    getRecurringDates(startDate, recurring) {
        const dates = [];
        const start = new Date(startDate);
        const end = new Date(start);
        end.setFullYear(start.getFullYear() + 1); // Create for next year
        
        let current = new Date(start);
        
        while (current <= end) {
            dates.push(new Date(current));
            
            if (recurring === 'daily') {
                current.setDate(current.getDate() + 1);
            } else if (recurring === 'weekly') {
                current.setDate(current.getDate() + 7);
            } else if (recurring === 'biweekly') {
                current.setDate(current.getDate() + 14);
            } else if (recurring === 'monthly') {
                current.setMonth(current.getMonth() + 1);
            } else if (recurring === 'yearly') {
                current.setFullYear(current.getFullYear() + 1);
            } else {
                break;
            }
        }
        
        return dates;
    }

    async updateRecurringTasks(recurringId, updates) {
        if (!recurringId) return;

        try {
            await this.hydrateAllTasksFromRemote();
        } catch (_error) {
            // Continue with local state if remote hydration fails.
        }

        const affectedDateKeys = [];
        Object.keys(this.tasks).forEach(dateKey => {
            let changed = false;
            (this.tasks[dateKey] || []).forEach(task => {
                if (task.recurringId === recurringId) {
                    Object.assign(task, updates);
                    changed = true;
                }
            });

            if (changed) {
                affectedDateKeys.push(dateKey);
                this.localDateMutationAt[dateKey] = Date.now();
            }
        });

        await this.saveTaskDateKeysImmediately(affectedDateKeys);
    }

    async deleteRecurringTasks(recurringId) {
        if (!recurringId) return;

        try {
            await this.hydrateAllTasksFromRemote();
        } catch (_error) {
            // Continue with local state if remote hydration fails.
        }

        const attachmentPaths = [];
        const affectedDateKeys = [];
        const removedEntries = [];
        Object.keys(this.tasks).forEach(dateKey => {
            (this.tasks[dateKey] || []).forEach((task) => {
                if (task.recurringId === recurringId) {
                    (task.attachments || []).forEach((attachment) => {
                        if (attachment.storagePath) attachmentPaths.push(attachment.storagePath);
                    });
                    removedEntries.push({ dateKey, task });
                }
            });
            const filteredTasks = (this.tasks[dateKey] || []).filter(
                task => task.recurringId !== recurringId
            );
            if (filteredTasks.length !== (this.tasks[dateKey] || []).length) {
                this.tasks[dateKey] = filteredTasks;
                affectedDateKeys.push(dateKey);
                this.localDateMutationAt[dateKey] = Date.now();
            }
        });
        await this.saveTaskDateKeysImmediately(affectedDateKeys);

        if (removedEntries.length > 0) {
            this.showUndoToast(this.t('undoRecurringDeleted'), {
                undo: async () => {
                    const restoredDateKeys = [];
                    removedEntries.forEach(({ dateKey, task }) => {
                        if (!Array.isArray(this.tasks[dateKey])) this.tasks[dateKey] = [];
                        this.tasks[dateKey].push(task);
                        this.localDateMutationAt[dateKey] = Date.now();
                        restoredDateKeys.push(dateKey);
                    });
                    await this.saveTaskDateKeysImmediately(restoredDateKeys);
                    this.renderWeek();
                },
                onExpire: () => this.deleteAttachmentPathsIfOrphanedInBackground(attachmentPaths)
            });
        }
    }


    // Paused Recurring Tasks

    getPausedRecurringIds() {
        const ids = new Set();
        (this.pausedRecurring || []).forEach(p => ids.add(p.recurringId));
        return ids;
    }

    async pauseRecurringTask(task) {
        if (!task || !task.recurringId) return;
        if ((this.pausedRecurring || []).find(p => p.recurringId === task.recurringId)) return;
        const entry = {
            recurringId: task.recurringId,
            taskText: task.text || '',
            recurringPattern: task.recurring || 'daily',
            pausedAt: new Date().toISOString().substring(0, 10)
        };
        this.pausedRecurring = [...(this.pausedRecurring || []), entry];
        this.settings.pausedRecurring = this.pausedRecurring;
        await this.saveSettings({ pausedRecurring: this.pausedRecurring });
        this.renderWeek();
    }

    async resumeRecurringTask(recurringId) {
        this.pausedRecurring = (this.pausedRecurring || []).filter(p => p.recurringId !== recurringId);
        this.settings.pausedRecurring = this.pausedRecurring;
        await this.saveSettings({ pausedRecurring: this.pausedRecurring });
        this.renderWeek();
        this.renderPausedTasksModal();
    }

    openPausedTasksModal() {
        const modal = document.getElementById('pausedTasksModal');
        if (!modal) return;
        this.renderPausedTasksModal();
        modal.style.display = 'flex';
    }

    closePausedTasksModal() {
        const modal = document.getElementById('pausedTasksModal');
        if (modal) modal.style.display = 'none';
    }

    renderPausedTasksModal() {
        const list = document.getElementById('pausedTasksList');
        if (!list) return;
        const t = translations[this.currentLanguage];
        const paused = this.pausedRecurring || [];

        if (paused.length === 0) {
            list.innerHTML = `<div class="paused-tasks-empty">${t.pausedTasksEmpty || 'Keine pausierten Aufgaben'}</div>`;
            return;
        }

        list.innerHTML = paused.map(p => {
            const patternKey = p.recurringPattern || 'daily';
            const patternLabel = t[patternKey] || patternKey;
            const safeText = String(p.taskText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const safeId = String(p.recurringId || '').replace(/"/g, '&quot;');
            return `
                <div class="paused-task-item">
                    <div class="paused-task-info">
                        <span class="paused-task-name">${safeText}</span>
                        <span class="paused-task-meta">${patternLabel} · ${t.pausedSince || 'seit'} ${p.pausedAt}</span>
                    </div>
                    <button class="paused-task-resume-btn" data-recurring-id="${safeId}" type="button">${t.resumeTask || 'Aktivieren'}</button>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.paused-task-resume-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const rid = btn.dataset.recurringId;
                if (rid) this.resumeRecurringTask(rid);
            });
        });
    }

    // Event Listeners
    setupEventListeners() {
        const closePausedBtn = document.getElementById('closePausedTasksModal');
        if (closePausedBtn) {
            closePausedBtn.addEventListener('click', () => this.closePausedTasksModal());
        }
        const pausedOverlay = document.getElementById('pausedTasksModalOverlay');
        if (pausedOverlay) {
            pausedOverlay.addEventListener('click', () => this.closePausedTasksModal());
        }

        this.dragDrop.setupGlobalDragListeners();

        // Force save before page unload
        window.addEventListener('beforeunload', () => {
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
            if (this.notesPadSaveTimeout) {
                clearTimeout(this.notesPadSaveTimeout);
                this.notesPadSaveTimeout = null;
            }
            this.saveSettings({ notesPadText: this.settings.notesPadText || '' });
            // Clear all timeouts and save immediately
            if (this.saveTasksTimeout) {
                clearTimeout(this.saveTasksTimeout);
            }

            if (this.saveDateTimeouts) {
                Object.values(this.saveDateTimeouts).forEach(timeout => clearTimeout(timeout));
            }

            if (this.saveBacklogsTimeout) {
                clearTimeout(this.saveBacklogsTimeout);
            }

            // Immediate saves (synchronous where possible)
            if (this.firestoreManager) {
                this.firestoreManager.saveTasks(this.tasks).catch(() => {});
                this.firestoreManager.saveBacklogs(this.backlogs).catch(() => {});
            }

            // Always save to localStorage as backup
            try {
                localStorage.setItem('sevenflow_tasks', JSON.stringify(this.tasks));
                localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
            } catch (e) {
                console.error('[Save] Error saving to localStorage:', e);
            }
        });

        // Week navigation
        document.getElementById('prevWeek').addEventListener('click', () => {
            this.currentWeekOffset--;
            this.renderWeek();
        });
        
        document.getElementById('nextWeek').addEventListener('click', () => {
            this.currentWeekOffset++;
            this.renderWeek();
        });

        this.setupSwipeNavigation();

        const weekRange = document.querySelector('.week-range');
        if (weekRange) {
            weekRange.style.cursor = 'pointer';
            weekRange.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openWeekNavDatePicker(weekRange);
            });
        }
        this.bindWeekNavDatePicker();
        
        document.getElementById('todayBtn').addEventListener('click', async () => {
            if (this.getMainView() !== 'week') {
                this.applyMainView('week');
            }
            await this.goToTodayAndFocus();
        });

        const appLogoHome = document.getElementById('appLogoHome');
        if (appLogoHome) {
            appLogoHome.style.cursor = 'pointer';
            appLogoHome.addEventListener('click', async () => {
                if (this.getMainView() !== 'week') {
                    this.applyMainView('week');
                }
                await this.goToTodayAndFocus();
            });
        }

        const inboxToggleBtn = document.getElementById('inboxToggleBtn');
        if (inboxToggleBtn) {
            inboxToggleBtn.addEventListener('click', () => {
                this.toggleMainView();
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                // Add spinning animation
                refreshBtn.classList.add('spinning');
                await this.refreshData();
                setTimeout(() => {
                    refreshBtn.classList.remove('spinning');
                }, 500);
            });
        }

        // View controls
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                this.changeView(days);
            });
        });
        
        // Set active view button on init
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`view${this.currentView}`)?.classList.add('active');
        
        // Paused recurring tasks button
        const pausedTasksBtn = document.getElementById('pausedTasksBtn');
        if (pausedTasksBtn) {
            pausedTasksBtn.addEventListener('click', () => {
                this.openPausedTasksModal();
            });
        }

        // Focus mode
        const focusModeBtn = document.getElementById('focusModeBtn');
        if (focusModeBtn) {
            focusModeBtn.addEventListener('click', () => {
                this.openFocusMode();
            });
        }
        document.getElementById('focusModeBackdrop')?.addEventListener('click', () => {
            this.closeFocusMode();
        });
        document.addEventListener('keydown', (e) => {
            if (this.focusModeActive && e.key === 'Escape') {
                e.preventDefault();
                this.closeFocusMode();
            }
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettingsModal();
        });
        
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            if (authManager && authManager.currentUser) {
                const result = await authManager.signOut();
                if (result.success) {
                    window.location.href = 'login.html';
                }
            } else {
                // Local mode - just clear data
                if (confirm('Alle lokalen Daten löschen und neu starten?')) {
                    localStorage.clear();
                    window.location.reload();
                }
            }
        });
        
        // Modal events
        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeTaskModal();
        });
        
        document.getElementById('modalOverlay').addEventListener('click', () => {
            this.saveTaskModal();
        });
        
        document.getElementById('modalSave').addEventListener('click', () => {
            this.saveTaskModal();
        });
        this.setupTaskModalMenu();
        this.setupTaskContextMenu();
        
        // Keyboard shortcuts for modal
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('taskModal');
            const settingsModal = document.getElementById('settingsModal');
            const confirmModal = document.getElementById('confirmModal');

            if (this.selectionMode && this.selectedTasks.size > 0 && e.key === 'Escape' && modal.style.display !== 'flex') {
                e.preventDefault();
                this.clearTaskSelection();
                return;
            }
            
            // Don't trigger shortcut if settings modal is open
            if (settingsModal.style.display === 'flex') return;
            
            // Confirm modal shortcuts
            if (confirmModal.style.display === 'flex') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('confirmDelete').click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    document.getElementById('confirmCancel').click();
                }
                return;
            }
            
            // Task modal shortcuts
            if (modal.style.display === 'flex') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeTaskModal();
                } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    const activeElement = document.activeElement;
                    // Only save if not in textarea
                    if (activeElement.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        this.saveTaskModal();
                    }
                }
            } else {
                // Global shortcut for quick add
                if (this.matchesShortcut(e)) {
                    e.preventDefault();
                    this.openQuickAddModal();
                }
            }
        });
        
        // Confirmation modal events
        document.getElementById('confirmCancel').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback('cancel');
            }
            this.closeConfirmModal();
        });
        
        document.getElementById('confirmOverlay').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback('cancel');
            }
            this.closeConfirmModal();
        });
        
        document.getElementById('confirmSingle').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback('single');
            }
            this.closeConfirmModal();
        });
        
        document.getElementById('confirmDelete').addEventListener('click', () => {
            if (this.confirmCallback) {
                // Check if "Nur diese" button is visible (recurring task)
                const singleBtn = document.getElementById('confirmSingle');
                if (singleBtn.style.display === 'block') {
                    this.confirmCallback('all'); // Delete all recurring
                } else {
                    this.confirmCallback('delete'); // Delete single task
                }
            }
            this.closeConfirmModal();
        });
        
        // Settings modal events
        document.getElementById('settingsClose').addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        document.getElementById('settingsOverlay').addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        document.getElementById('settingsSave').addEventListener('click', () => {
            this.saveSettingsModal();
        });

        const notesPadInput = document.getElementById('notesPadInput');
        if (notesPadInput) {
            notesPadInput.value = this.settings.notesPadText || '';
            notesPadInput.addEventListener('input', () => {
                this.queueSaveNotesPad(notesPadInput.value);
            });
            notesPadInput.addEventListener('blur', () => {
                this.queueSaveNotesPad(notesPadInput.value);
            });
        }

        const backupExportBtn = document.getElementById('backupExportBtn');
        if (backupExportBtn) {
            backupExportBtn.addEventListener('click', () => {
                this.exportBackup();
            });
        }

        const backupImportBtn = document.getElementById('backupImportBtn');
        const backupImportFile = document.getElementById('backupImportFile');
        if (backupImportBtn && backupImportFile) {
            backupImportBtn.addEventListener('click', () => {
                backupImportFile.value = '';
                backupImportFile.click();
            });

            backupImportFile.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                await this.importBackupFile(file);
                backupImportFile.value = '';
            });
        }

        this.runPluginHook('bindEvents');

        const inboxAddBtn = document.getElementById('inboxAddBtn');
        const inboxQuickInput = document.getElementById('inboxQuickInput');
        const submitInbox = () => {
            if (!inboxQuickInput) return;
            const created = this.addInboxTask(inboxQuickInput.value);
            if (created) inboxQuickInput.value = '';
        };
        if (inboxAddBtn) inboxAddBtn.addEventListener('click', submitInbox);
        if (inboxQuickInput) {
            inboxQuickInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitInbox();
                }
            });
        }

        // Language selector
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                this.setLanguage(e.target.value);
            });
        }
    }
    
    setupMobileNav() {
        if (!this.mobileNav) return;
        this.mobileNav.setup();
    }
    
    toggleMobilePopup(popup) {
        if (!this.mobileNav) return;
        this.mobileNav.togglePopup(popup);
    }
    
    closeAllMobilePopups() {
        if (!this.mobileNav) return;
        this.mobileNav.closeAllPopups();
    }

    // Notifications
    async requestNotificationPermission() {
        if (!this.notifications) return false;
        return this.notifications.requestPermission();
    }

    queueReminderReschedule() {
        if (!this.notifications) return;

        if (this.reminderRescheduleTimeout) {
            clearTimeout(this.reminderRescheduleTimeout);
        }

        this.reminderRescheduleTimeout = setTimeout(() => {
            this.reminderRescheduleTimeout = null;
            this.scheduleAllReminders();
        }, 400);
    }

    startNotificationChecker() {
        if (!this.notifications) return;
        this.notifications.startChecker();
    }

    checkDueNotifications() {
        if (!this.notifications) return;
        this.notifications.checkDueNotifications();
    }

    // Schedule all reminders with AlarmManager (Android only)
    scheduleAllReminders() {
        if (!this.notifications) return;
        this.notifications.scheduleAllReminders();
    }

    showNotification(title, body) {
        if (!this.notifications) return;
        this.notifications.showNotification(title, body);
    }

    // Backlog Management
    loadBacklogsLocal() {
        try {
            const saved = localStorage.getItem('sevenflow_backlogs');
            const parsed = saved ? JSON.parse(saved) : { '1': [], '2': [], '3': [], 'inbox': [] };
            if (!parsed.inbox) parsed.inbox = [];
            return parsed;
        } catch (e) {
            console.error('Error loading backlogs:', e);
            return { '1': [], '2': [], '3': [], 'inbox': [] };
        }
    }

    loadBacklogTitlesLocal() {
        try {
            const saved = localStorage.getItem('sevenflow_backlog_titles');
            return saved ? JSON.parse(saved) : { '1': 'This week', '2': 'Next week', '3': 'Later' };
        } catch (e) {
            console.error('Error loading backlog titles:', e);
            return { '1': 'This week', '2': 'Next week', '3': 'Later' };
        }
    }

    loadBacklogTombstones() {
        const empty = () => ({ '1': new Set(), '2': new Set(), '3': new Set(), inbox: new Set() });
        try {
            const raw = localStorage.getItem('sevenflow_backlog_tombstones');
            if (!raw) return empty();
            const parsed = JSON.parse(raw);
            return {
                '1': new Set(parsed['1'] || []),
                '2': new Set(parsed['2'] || []),
                '3': new Set(parsed['3'] || []),
                inbox: new Set(parsed.inbox || [])
            };
        } catch (e) {
            return empty();
        }
    }

    persistBacklogTombstones() {
        try {
            const plain = {};
            Object.keys(this.backlogTombstones).forEach((backlogId) => {
                plain[backlogId] = [...this.backlogTombstones[backlogId]];
            });
            localStorage.setItem('sevenflow_backlog_tombstones', JSON.stringify(plain));
        } catch (e) {
            // Best effort — an unpersisted tombstone only matters across a
            // reload/restart before the debounced save flushes.
        }
    }

    // Thin delegators to js/sevenflow/backlog-tombstones.js's pure Set logic — this
    // class only owns *where* the tombstones live (this.backlogTombstones) and how
    // they're persisted (localStorage, below).
    addBacklogTombstone(backlogId, task) {
        BacklogTombstones.addBacklogTombstone(this.backlogTombstones, backlogId, task);
        this.persistBacklogTombstones();
    }

    removeBacklogTombstone(backlogId, task) {
        BacklogTombstones.removeBacklogTombstone(this.backlogTombstones, backlogId, task);
        this.persistBacklogTombstones();
    }

    // Snapshot the tombstone keys as plain arrays for handing to firestoreManager
    // (which shouldn't need to know these are Sets), and remember exactly which
    // keys were included so a successful save can prune only those — not any
    // tombstone added *after* this save's snapshot was taken (e.g. another delete
    // that raced in while this save was in flight).
    snapshotBacklogTombstones() {
        return BacklogTombstones.snapshotBacklogTombstones(this.backlogTombstones);
    }

    // Only safe to call after the save that used this exact snapshot has
    // committed — at that point the just-written remote doc no longer contains
    // the deleted tasks, so the tombstones have done their job.
    pruneBacklogTombstones(snapshot) {
        const changed = BacklogTombstones.pruneBacklogTombstones(this.backlogTombstones, snapshot);
        if (changed) this.persistBacklogTombstones();
    }

    persistBacklogsNow() {
        if (this.firestoreManager) {
            const tombstoneSnapshot = this.snapshotBacklogTombstones();
            return this.firestoreManager.saveBacklogs(this.backlogs, tombstoneSnapshot)
                .then(() => this.pruneBacklogTombstones(tombstoneSnapshot));
        }
        try {
            localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
        } catch (e) {
            console.error('[Save] Error saving backlogs:', e);
        }
        return Promise.resolve();
    }

    saveBacklogs() {
        this.localBacklogsMutationAt = Date.now();
        // Clear any pending save
        if (this.saveBacklogsTimeout) {
            clearTimeout(this.saveBacklogsTimeout);
        }

        // Debounce saves
        this.saveBacklogsTimeout = setTimeout(() => {
            this.persistBacklogsNow().catch(err => {
                console.error('[Save] Error saving backlogs to Firestore:', err);
                // Fallback to localStorage
                try {
                    localStorage.setItem('sevenflow_backlogs', JSON.stringify(this.backlogs));
                } catch (e) {
                    console.error('[Save] Error saving to localStorage:', e);
                }
            });
        }, 2000);
    }

    async flushPendingBacklogSave() {
        if (this.saveBacklogsTimeout) {
            clearTimeout(this.saveBacklogsTimeout);
            this.saveBacklogsTimeout = null;
        }

        await this.persistBacklogsNow();
    }

    saveBacklogTitles() {
        if (this.firestoreManager) {
            this.firestoreManager.saveBacklogTitles(this.backlogTitles);
        } else {
            try {
                localStorage.setItem('sevenflow_backlog_titles', JSON.stringify(this.backlogTitles));
            } catch (e) {
                console.error('Error saving backlog titles:', e);
            }
        }
    }

    addBacklogTask(backlogId, text) {
        const task = {
            id: Date.now() + Math.random(),
            text: text,
            description: '',
            completed: false,
            reminderEnabled: false,
            reminderTime: null,
            createdAt: new Date().toISOString()
        };
        
        this.backlogs[backlogId].push(task);
        this.saveBacklogs();
        return task;
    }

    deleteBacklogTask(backlogId, taskId) {
        const tasks = this.backlogs[backlogId];
        if (!Array.isArray(tasks)) return;
        const index = tasks.findIndex((t) => t.id === taskId);
        if (index === -1) return;
        const [taskToDelete] = tasks.splice(index, 1);
        this.addBacklogTombstone(backlogId, taskToDelete);
        this.saveBacklogs();

        const attachmentPaths = (taskToDelete.attachments || []).map((a) => a.storagePath);
        this.showUndoToast(this.t('undoTaskDeleted'), {
            undo: () => {
                const list = this.backlogs[backlogId] || (this.backlogs[backlogId] = []);
                list.splice(Math.min(index, list.length), 0, taskToDelete);
                this.removeBacklogTombstone(backlogId, taskToDelete);
                this.saveBacklogs();
                this.renderBacklog();
            },
            onExpire: () => this.deleteAttachmentPathsIfOrphanedInBackground(attachmentPaths)
        });
    }

    async confirmDeleteBacklogTask(backlogId, taskId) {
        const result = await this.showConfirmModal(
            this.t('deleteTask'),
            this.t('confirmDelete'),
            false
        );
        if (result !== 'delete') return false;
        this.deleteBacklogTask(backlogId, taskId);
        return true;
    }

    moveTaskToBacklog(sourceDate, taskId, targetBacklogId, targetIndex = -1) {
        const sourceDateKey = this.formatDate(sourceDate);
        const task = this.removeTaskFromDateList(sourceDateKey, taskId);
        if (!task) return;

        if (!Array.isArray(this.backlogs[targetBacklogId])) {
            this.backlogs[targetBacklogId] = [];
        }
        const insertIndex = this.clampInsertIndex(targetIndex, this.backlogs[targetBacklogId].length);
        this.backlogs[targetBacklogId].splice(insertIndex, 0, task);

        this.saveTasksForDate(sourceDate);
        this.saveBacklogs();
    }

    moveTaskFromBacklog(sourceBacklogId, taskId, targetDate, targetIndex = -1) {
        const task = this.removeTaskFromBacklogList(sourceBacklogId, taskId);
        if (!task) return;

        const dateKey = this.formatDate(targetDate);
        if (!this.tasks[dateKey]) {
            this.tasks[dateKey] = [];
        }

        const insertIndex = this.normalizeDayInsertIndex(this.tasks[dateKey], task, targetIndex);
        this.tasks[dateKey].splice(insertIndex, 0, task);

        this.saveBacklogs();
        this.saveTasksForDate(targetDate);
    }

    moveBacklogTask(sourceBacklogId, taskId, targetBacklogId, targetIndex = -1) {
        const sourceTasks = this.backlogs[sourceBacklogId];
        const task = sourceTasks?.find(t => t.id === taskId);
        if (!task) return;
        
        // Same backlog reordering
        if (sourceBacklogId === targetBacklogId) {
            const tasks = sourceTasks;
            const currentIndex = tasks.findIndex(t => t.id === taskId);
            if (currentIndex === -1) return;
            
            // Remove from current position
            tasks.splice(currentIndex, 1);

            // Insert at new position. The drop target index already excludes the dragged item.
            tasks.splice(this.clampInsertIndex(targetIndex, tasks.length), 0, task);
        } else {
            // Different backlog
            this.removeTaskFromBacklogList(sourceBacklogId, taskId);
            if (!Array.isArray(this.backlogs[targetBacklogId])) {
                this.backlogs[targetBacklogId] = [];
            }
            const insertIndex = this.clampInsertIndex(targetIndex, this.backlogs[targetBacklogId].length);
            this.backlogs[targetBacklogId].splice(insertIndex, 0, task);
        }
        
        this.saveBacklogs();
    }


    renderBacklog() {
        ['1', '2', '3'].forEach(backlogId => {
            const container = document.getElementById(`backlog${backlogId}`);
            if (!container) return;
            
            container.innerHTML = '';
            
            // Render tasks
            const tasks = this.backlogs[backlogId] || [];
            tasks.forEach(task => {
                const taskElement = this.createBacklogTaskElement(backlogId, task);
                container.appendChild(taskElement);
            });
            
            // Add placeholders
            for (let i = 0; i < 3; i++) {
                const placeholder = this.createBacklogPlaceholder(backlogId, container);
                container.appendChild(placeholder);
            }
        });
        this.renderInbox();
    }

    createBacklogTaskElement(backlogId, task) {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        const selectionKey = this.getBacklogSelectionKey(backlogId, task.id);
        if (this.isTaskSelected(selectionKey)) {
            taskItem.classList.add('selected');
        }
        taskItem.draggable = true;
        taskItem.dataset.taskId = task.id;
        taskItem.dataset.backlogId = backlogId;
        const wasLongPressed = this.attachLongPressSelection(taskItem, selectionKey, {
            type: 'backlog',
            sourceId: backlogId,
            taskId: String(task.id)
        });
        let suppressClickUntil = 0;
        
        // Check if this is a divider task (---) or inbox group title (#Title)
        const rawTaskText = String(task?.text || '');
        const trimmedTaskText = rawTaskText.trim();
        const isDivider = trimmedTaskText === '---';
        const isInboxGroupTitle = backlogId === 'inbox' && trimmedTaskText.startsWith('#') && trimmedTaskText.length > 1;

        if (isDivider) {
            taskItem.classList.add('divider');
        } else if (isInboxGroupTitle) {
            taskItem.classList.add('inbox-group-title');
        } else {
            if (task.completed) {
                taskItem.classList.add('completed');
            }
            if (task.color && task.color !== 'none') {
                taskItem.classList.add(`color-${task.color}`);
            }
        }
        
        // Drag events
        taskItem.addEventListener('dragstart', (e) => {
            this.isDragging = true;
            taskItem.classList.add('dragging');
            this.draggedTask = { backlogId: backlogId, task: task };
            e.dataTransfer.effectAllowed = 'move';
        });
        
        taskItem.addEventListener('dragend', () => {
            this.dragDrop.stopDragAutoScroll();
            taskItem.classList.remove('dragging');
            this.draggedTask = null;
            // Reset isDragging flag after a short delay
            setTimeout(() => {
                this.isDragging = false;
                this.flushRealtimeChanges();
            }, 100);
        });
        
        if (isDivider || isInboxGroupTitle) {
            // Structural items in backlog/inbox: divider or inbox title
            const content = document.createElement('div');
            content.className = 'task-content';
            if (isInboxGroupTitle) {
                const titleSpan = document.createElement('span');
                titleSpan.className = 'task-text';
                titleSpan.textContent = trimmedTaskText.replace(/^#\s*/, '');
                content.appendChild(titleSpan);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'task-delete';
            deleteBtn.title = this.t('delete');
            deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDeleteBacklogTask(backlogId, task.id).then((deleted) => {
                    if (deleted) this.renderBacklog();
                });
            });

            taskItem.appendChild(content);
            taskItem.appendChild(deleteBtn);

            if (isInboxGroupTitle) {
                taskItem.addEventListener('dblclick', (e) => {
                    if (e.target.closest('.task-delete')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.startEditingInboxGroupTitle(taskItem, backlogId, task);
                });
            }

            return taskItem;
        }

        // Regular task rendering below
        // Checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox';
        checkbox.title = this.t('markDone');
        if (task.completed) {
            checkbox.classList.add('checked');
            checkbox.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        }
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            task.completed = !task.completed;
            this.saveBacklogs();
            this.renderBacklog();
        });
        
        // Content
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.text;

        // Add event time if present (as separate element)
        if (task.eventTime) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'task-event-time';
            timeSpan.textContent = `(${this.formatTime(task.eventTime)})`;
            textSpan.appendChild(timeSpan);
        }

        if (task.reminderEnabled && task.reminderTime) {
            const bellIcon = document.createElement('span');
            bellIcon.className = 'task-reminder-icon';
            bellIcon.title = `${this.t('reminder')}: ${task.reminderTime}`;
            bellIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
            textSpan.appendChild(bellIcon);
        }

        if (task.deadlineDate) {
            const deadline = this.parseDateKey(task.deadlineDate);
            const deadlineIcon = document.createElement('span');
            deadlineIcon.className = 'task-deadline';
            deadlineIcon.title = `${this.t('deadlineDate')}: ${this.formatDisplayDate(deadline)}`;
            deadlineIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line></svg>${this.formatDisplayDate(deadline)}`;
            textSpan.appendChild(deadlineIcon);
        }
        const taskSourceIcon = this.getTaskSourceIcon(task);
        if (taskSourceIcon) {
            const sourceIcon = document.createElement('span');
            sourceIcon.className = taskSourceIcon.className || 'task-source-icon';
            sourceIcon.title = taskSourceIcon.title || '';
            sourceIcon.innerHTML = taskSourceIcon.html || '';
            textSpan.appendChild(sourceIcon);
        }

        if (Array.isArray(task.attachments) && task.attachments.length > 0) {
            const attachmentIcon = document.createElement('span');
            attachmentIcon.className = 'task-source-icon task-attachment-icon';
            attachmentIcon.title = this.t('menuAttachFiles');
            attachmentIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-8.49 8.49a6 6 0 0 1-8.49-8.49l8.49-8.48a4 4 0 1 1 5.66 5.66l-8.48 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78"></path></svg>`;
            textSpan.appendChild(attachmentIcon);
        }
        
        // Add subtask progress
        if (task.subtasks && task.subtasks.length > 0) {
            const completed = task.subtasks.filter(s => s.completed).length;
            const total = task.subtasks.length;
            const progressSpan = document.createElement('span');
            progressSpan.className = 'task-progress';
            progressSpan.textContent = `${completed}/${total}`;
            textSpan.appendChild(progressSpan);
        }
        
        content.appendChild(textSpan);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'task-delete';
        deleteBtn.title = this.t('delete');
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDeleteBacklogTask(backlogId, task.id).then((deleted) => {
                if (deleted) this.renderBacklog();
            });
        });
        
        // Click to edit - but not for dividers
        if (!isDivider) {
            taskItem.addEventListener('pointerup', (e) => {
                if (e.pointerType === 'mouse') return;
                if (!this.selectionMode) return;
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) return;
                if (wasLongPressed()) return;
                if (this.isDragging) return;

                this.toggleTaskSelection(selectionKey, {
                    type: 'backlog',
                    sourceId: backlogId,
                    taskId: String(task.id)
                });
                taskItem.classList.toggle('selected', this.isTaskSelected(selectionKey));
                suppressClickUntil = Date.now() + 300;
                e.preventDefault();
                e.stopPropagation();
            });

            taskItem.addEventListener('click', (e) => {
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) return;
                if (Date.now() < suppressClickUntil) return;
                if (wasLongPressed()) return;
                if (e.ctrlKey || e.metaKey || this.selectionMode) {
                    this.toggleTaskSelection(selectionKey, {
                        type: 'backlog',
                        sourceId: backlogId,
                        taskId: String(task.id)
                    });
                    taskItem.classList.toggle('selected', this.isTaskSelected(selectionKey));
                    return;
                }
                // Don't open modal if we just finished dragging
                if (this.isDragging) {
                    this.isDragging = false;
                    return;
                }
                this.openBacklogTaskModal(backlogId, task);
            });

            taskItem.addEventListener('contextmenu', (e) => {
                if (this.isAndroidAppRuntime()) return;
                if (e.target.closest('.task-checkbox') || e.target.closest('.task-delete')) return;
                e.preventDefault();
                e.stopPropagation();
                this.showTaskContextMenu(e.clientX, e.clientY, { backlogId, task });
            });
        }

        // Add tags if present - but not for dividers
        if (!isDivider && task.tags && task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'task-tags';
            
            const maxTags = 2;
            const displayTags = task.tags.slice(0, maxTags);
            
            displayTags.forEach(tag => {
                const tagBadge = document.createElement('span');
                tagBadge.className = 'task-tag';
                tagBadge.style.background = this.getTagColor(tag);
                tagBadge.textContent = tag;
                tagsContainer.appendChild(tagBadge);
            });
            
            if (task.tags.length > maxTags) {
                const moreBadge = document.createElement('span');
                moreBadge.className = 'task-tag task-tag-more';
                moreBadge.textContent = `+${task.tags.length - maxTags}`;
                tagsContainer.appendChild(moreBadge);
            }
            
            content.appendChild(tagsContainer);
        }
        
        taskItem.appendChild(checkbox);
        taskItem.appendChild(content);
        taskItem.appendChild(deleteBtn);
        
        return taskItem;
    }

    createBacklogPlaceholder(backlogId, container) {
        const placeholder = document.createElement('div');
        placeholder.className = 'task-placeholder';
        
        placeholder.addEventListener('click', () => {
            this.createNewBacklogTask(backlogId, container, placeholder);
        });
        
        return placeholder;
    }

    createNewBacklogTask(backlogId, container, clickedPlaceholder = null) {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox';
        
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-input';
        // Tells mobile keyboards/WebViews this isn't a "next field" in a sequence —
        // without it, some Android WebViews auto-advance focus to whatever focusable
        // element follows in DOM order (e.g. the notes textarea after the last day).
        input.setAttribute('enterkeyhint', 'done');
        input.placeholder = 'Neue Aufgabe...';
        
        content.appendChild(input);
        taskItem.appendChild(checkbox);
        taskItem.appendChild(content);
        
        // Replace clicked placeholder with input
        if (clickedPlaceholder) {
            container.insertBefore(taskItem, clickedPlaceholder);
            clickedPlaceholder.remove();
        } else {
            container.appendChild(taskItem);
        }
        input.focus();
        
        let saved = false;
        
        const saveTask = () => {
            if (saved) return;
            saved = true;
            
            const text = input.value.trim();
            if (text) {
                // Check if this is a divider
                if (text === '---') {
                    // Add divider without parsing
                    const newTask = {
                        id: Date.now() + Math.random(),
                        text: '---',
                        description: '',
                        completed: false,
                        color: 'none',
                        reminderEnabled: false,
                        reminderTime: '09:00'
                    };
                    this.backlogs[backlogId].push(newTask);
                    this.saveBacklogs();
                    this.renderBacklog();
                } else {
                    if (this.hasFeature('ramble_parsing')) {
                        const parser = new window.TaskParser();
                        const parsed = parser.parse(text);
                        if (parsed.date) {
                            const eventTime = parsed.time || null;
                            const reminderEnabled = this.hasFeature('reminders') ? !!parsed.reminder : false;
                            const reminderTime = this.hasFeature('reminders') ? (parsed.reminder || null) : null;
                            this.addTask(parsed.date, parsed.text, '', 'none', null, reminderEnabled, reminderTime, 'none', eventTime);
                            taskItem.remove();
                            this.renderWeek();
                        } else {
                            const newTask = {
                                id: Date.now() + Math.random(),
                                text: parsed.text,
                                description: '',
                                completed: false,
                                color: 'none',
                                eventTime: parsed.time || null,
                                reminderEnabled: this.hasFeature('reminders') ? !!parsed.reminder : false,
                                reminderTime: this.hasFeature('reminders') ? (parsed.reminder || null) : null
                            };
                            this.backlogs[backlogId].push(newTask);
                            this.saveBacklogs();
                            this.renderBacklog();
                        }
                    } else {
                        const newTask = {
                            id: Date.now() + Math.random(),
                            text: text,
                            description: '',
                            completed: false,
                            color: 'none',
                            eventTime: null,
                            reminderEnabled: false,
                            reminderTime: null
                        };
                        this.backlogs[backlogId].push(newTask);
                        this.saveBacklogs();
                        this.renderBacklog();
                    }
                }
                
                setTimeout(() => {
                    const placeholders = container.querySelectorAll('.task-placeholder');
                    if (placeholders.length > 0) {
                        placeholders[0].click();
                    }
                }, 50);
            } else {
                taskItem.remove();
            }
        };
        
        input.addEventListener('blur', saveTask);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                input.blur();
            } else if (e.key === 'Escape') {
                saved = true;
                taskItem.remove();
            }
        });

        // Scroll input into view on mobile when focused
        input.addEventListener('focus', () => {
            setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300); // Wait for keyboard to appear
        });
    }

    openBacklogTaskModal(backlogId, task) {
        this.currentModalTask = { backlogId, task };
        
        const modal = document.getElementById('taskModal');
        const titleInput = document.getElementById('modalTitle');
        const descriptionInput = document.getElementById('modalDescription');
        const dateInput = document.getElementById('modalDate');
        const recurringSelect = document.getElementById('modalRecurring');
        const deadlineInput = document.getElementById('modalDeadlineDate');
        const reminderEnabled = document.getElementById('modalReminderEnabled');
        const reminderTime = document.getElementById('modalReminderTime');
        const reminderTimeContainer = document.getElementById('reminderTimeContainer');

        titleInput.value = task.text;
        descriptionInput.value = task.description || '';
        this.setupModalDescriptionAutoResize();
        dateInput.value = ''; // Inbox may optionally receive a date and then move into the week
        deadlineInput.value = task.deadlineDate || '';
        this.initializeTaskModalOptionalSections(task);
        recurringSelect.value = 'none';
        recurringSelect.disabled = true; // No recurring in backlog
        dateInput.required = false;
        reminderEnabled.checked = task.reminderEnabled || false;
        reminderTime.value = task.reminderTime || '09:00';
        
        // Set color picker
        if (window.colorPicker) {
            window.colorPicker.setColor(task.color || 'none');
        }

        reminderTimeContainer.style.display = reminderEnabled.checked ? 'flex' : 'none';
        
        reminderEnabled.onchange = () => {
            reminderTimeContainer.style.display = reminderEnabled.checked ? 'flex' : 'none';
        };
        
        // Render subtasks
        this.renderSubtasks(task);

        // Add subtask button handler
        document.getElementById('addSubtaskBtn').onclick = () => {
            this.addSubtask();
        };

        // Render tags
        this.renderTags(task);

        // Setup tag input
        this.setupTagInput(task);
        this.setupAttachmentInput(task);
        this.updateTaskModalMenuItems();

        this.setModalVisibility(modal, true);
        requestAnimationFrame(() => {
            if (this.resizeModalDescriptionToContent) {
                this.resizeModalDescriptionToContent();
            }
        });
        this.blurActiveElement();
    }

    setupBacklogTitleListeners() {
        ['1', '2', '3'].forEach(backlogId => {
            const input = document.getElementById(`backlogTitle${backlogId}`);
            if (!input) return;
            
            input.addEventListener('blur', () => {
                this.backlogTitles[backlogId] = input.value || 'Ohne Titel';
                this.saveBacklogTitles();
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    input.blur();
                }
            });
        });
    }

    // Keyboard Shortcuts
    matchesShortcut(e) {
        const shortcut = this.settings.keyboardShortcut || 'ctrl+shift+q';
        const parts = shortcut.split('+');
        
        const key = parts[parts.length - 1];
        const needsCtrl = parts.includes('ctrl');
        const needsShift = parts.includes('shift');
        const needsAlt = parts.includes('alt');
        
        return e.key.toLowerCase() === key &&
               (e.ctrlKey || e.metaKey) === needsCtrl &&
               e.shiftKey === needsShift &&
               e.altKey === needsAlt;
    }

    openQuickAddModal() {
        // Open modal for today
        const today = new Date();
        this.currentModalTask = { 
            date: today, 
            task: {
                id: Date.now(),
                text: '',
                description: '',
                completed: false,
                recurring: 'none',
                reminderEnabled: false,
                reminderTime: '09:00',
                tags: [],
                subtasks: [],
                attachments: []
            },
            isNew: true
        };
        
        const modal = document.getElementById('taskModal');
        const titleInput = document.getElementById('modalTitle');
        const descriptionInput = document.getElementById('modalDescription');
        const dateInput = document.getElementById('modalDate');
        const recurringSelect = document.getElementById('modalRecurring');
        const deadlineInput = document.getElementById('modalDeadlineDate');
        const reminderEnabled = document.getElementById('modalReminderEnabled');
        const reminderTime = document.getElementById('modalReminderTime');
        const reminderTimeContainer = document.getElementById('reminderTimeContainer');
        
        // Set today's date with DD.MM.YYYY format
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        dateInput.value = `${day}.${month}.${year}`;
        
        // Set required attributes
        titleInput.required = true;
        dateInput.required = true;
        
        titleInput.value = '';
        descriptionInput.value = '';
        this.setupModalDescriptionAutoResize();
        recurringSelect.value = 'none';
        recurringSelect.disabled = false;
        deadlineInput.value = '';
        this.initializeTaskModalOptionalSections(this.currentModalTask.task);
        reminderEnabled.checked = false;
        reminderTime.value = '09:00';
        
        reminderTimeContainer.style.display = 'none';
        
        // Reset color picker
        if (window.colorPicker) {
            window.colorPicker.setColor('none');
        }
        
        reminderEnabled.onchange = () => {
            reminderTimeContainer.style.display = reminderEnabled.checked ? 'flex' : 'none';
        };
        this.renderSubtasks(this.currentModalTask.task);
        document.getElementById('addSubtaskBtn').onclick = () => {
            this.addSubtask();
        };
        this.renderTags(this.currentModalTask.task);
        this.setupTagInput(this.currentModalTask.task);
        this.setupAttachmentInput(this.currentModalTask.task);
        this.updateTaskModalMenuItems();
        
        this.setModalVisibility(modal, true);
        requestAnimationFrame(() => {
            if (this.resizeModalDescriptionToContent) {
                this.resizeModalDescriptionToContent();
            }
        });
        this.blurActiveElement();
    }

    // PWA Setup
    setupPWA() {
        if (!this.pwa) return;
        this.pwa.setup();
    }

    checkInstallPrompt() {
        // Install prompt disabled
    }
    
    // Subtasks Management
    renderSubtasks(task) {
        const container = document.getElementById('subtasksContainer');
        container.innerHTML = '';
        
        if (!task.subtasks || task.subtasks.length === 0) {
            return;
        }
        
        task.subtasks.forEach(subtask => {
            const subtaskEl = this.createSubtaskElement(subtask);
            container.appendChild(subtaskEl);
        });
    }
    
    createSubtaskElement(subtask) {
        const div = document.createElement('div');
        div.className = 'subtask-item';
        if (subtask.completed) {
            div.classList.add('completed');
        }
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'subtask-checkbox';
        checkbox.title = this.t('markDone');
        checkbox.checked = subtask.completed;
        checkbox.addEventListener('change', () => {
            subtask.completed = checkbox.checked;
            if (checkbox.checked) {
                div.classList.add('completed');
            } else {
                div.classList.remove('completed');
            }
        });
        
        const text = document.createElement('span');
        text.className = 'subtask-text';
        text.textContent = subtask.text;
        text.addEventListener('click', () => {
            this.editSubtask(div, subtask);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'subtask-delete';
        deleteBtn.title = this.t('delete');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        deleteBtn.addEventListener('click', () => {
            this.deleteSubtask(subtask.id);
        });
        
        div.appendChild(checkbox);
        div.appendChild(text);
        div.appendChild(deleteBtn);
        
        return div;
    }
    
    addSubtask() {
        const task = this.currentModalTask?.task;
        if (!task) return;
        
        if (!task.subtasks) {
            task.subtasks = [];
        }
        
        const subtask = {
            id: Date.now() + Math.random(),
            text: '',
            completed: false
        };
        
        task.subtasks.push(subtask);
        this.modalHasChanges = true;
        
        const container = document.getElementById('subtasksContainer');
        const subtaskEl = this.createSubtaskElement(subtask);
        container.appendChild(subtaskEl);
        
        // Immediately start editing - use setTimeout to ensure DOM is ready
        setTimeout(() => {
            this.editSubtask(subtaskEl, subtask);
        }, 0);
    }
    
    editSubtask(subtaskEl, subtask) {
        const textSpan = subtaskEl.querySelector('.subtask-text');
        const currentText = textSpan.textContent;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'subtask-input';
        input.value = currentText;
        
        textSpan.replaceWith(input);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newText = input.value.trim();
            if (newText) {
                subtask.text = newText;
                const newSpan = document.createElement('span');
                newSpan.className = 'subtask-text';
                newSpan.textContent = newText;
                newSpan.addEventListener('click', () => {
                    this.editSubtask(subtaskEl, subtask);
                });
                input.replaceWith(newSpan);
            } else {
                // Delete if empty
                this.deleteSubtask(subtask.id);
            }
        };
        
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                
                // Remove blur listener to prevent it from interfering
                input.removeEventListener('blur', saveEdit);
                
                const newText = input.value.trim();
                if (newText) {
                    subtask.text = newText;
                    const newSpan = document.createElement('span');
                    newSpan.className = 'subtask-text';
                    newSpan.textContent = newText;
                    newSpan.addEventListener('click', () => {
                        this.editSubtask(subtaskEl, subtask);
                    });
                    input.replaceWith(newSpan);
                    // Create new subtask immediately
                    setTimeout(() => this.addSubtask(), 0);
                } else {
                    // Delete if empty
                    this.deleteSubtask(subtask.id);
                }
            } else if (e.key === 'Escape') {
                // Restore original
                const newSpan = document.createElement('span');
                newSpan.className = 'subtask-text';
                newSpan.textContent = currentText;
                newSpan.addEventListener('click', () => {
                    this.editSubtask(subtaskEl, subtask);
                });
                input.replaceWith(newSpan);
            }
        });
    }
    
    deleteSubtask(subtaskId) {
        const task = this.currentModalTask?.task;
        if (!task || !task.subtasks) return;
        
        task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
        this.modalHasChanges = true;
        this.renderSubtasks(task);
    }
    
    // Tags Management
    renderTags(task) {
        const container = document.getElementById('tagsContainer');
        container.innerHTML = '';
        
        if (!task.tags || task.tags.length === 0) {
            return;
        }
        
        task.tags.forEach(tag => {
            const badge = this.createTagBadge(tag, true);
            container.appendChild(badge);
        });
    }
    
    createTagBadge(tag, showRemove = false) {
        const badge = document.createElement('div');
        badge.className = 'tag-badge';
        badge.style.background = this.getTagColor(tag);
        badge.textContent = tag;
        
        if (showRemove) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'tag-remove';
            removeBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            removeBtn.addEventListener('click', () => {
                this.removeTag(tag);
            });
            badge.appendChild(removeBtn);
        }
        
        return badge;
    }
    
    getTagColor(tag) {
        // Generate consistent color from tag name
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colors = [
            '#ef4444', // red
            '#f97316', // orange
            '#f59e0b', // amber
            '#10b981', // green
            '#14b8a6', // teal
            '#3b82f6', // blue
            '#6366f1', // indigo
            '#8b5cf6', // violet
            '#a855f7', // purple
            '#ec4899'  // pink
        ];
        
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }
    
    setupTagInput(task) {
        const input = document.getElementById('tagInput');
        const addBtn = document.getElementById('tagAddBtn');
        
        // Remove any existing listeners
        const newInput = input.cloneNode(true);
        input.replaceWith(newInput);
        
        const handleTagAdd = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const tag = newInput.value.trim().toLowerCase();
            if (tag) {
                this.addTag(tag);
                newInput.value = '';
                // Keep focus so user can add more tags
                setTimeout(() => newInput.focus(), 50);
            }
        };
        
        // Handle Enter key (desktop & some mobile keyboards)
        newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                handleTagAdd(e);
            }
        });
        
        // Handle keypress as fallback (older browsers/Android)
        newInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                handleTagAdd(e);
            }
        });
        
        // Handle input event (when virtual keyboard triggers submission)
        newInput.addEventListener('input', (e) => {
            // Check if input ends with newline (Android virtual keyboard)
            if (newInput.value.includes('\n')) {
                newInput.value = newInput.value.replace(/\n/g, '');
                handleTagAdd(e);
            }
        });
        
        // Handle button click (mobile fallback)
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                handleTagAdd(e);
            });
        }
    }
    
    addTag(tag) {
        const task = this.currentModalTask?.task;
        if (!task) return;
        
        if (!task.tags) {
            task.tags = [];
        }
        
        // Don't add duplicates
        if (task.tags.includes(tag)) {
            return;
        }
        
        task.tags.push(tag);
        this.modalHasChanges = true;
        this.renderTags(task);
        
        // Update global tags registry
        this.updateGlobalTags(tag);
    }
    
    removeTag(tag) {
        const task = this.currentModalTask?.task;
        if (!task || !task.tags) return;
        
        task.tags = task.tags.filter(t => t !== tag);
        this.modalHasChanges = true;
        this.renderTags(task);
    }
    
    updateGlobalTags(tag) {
        // Load or create global tags
        let globalTags = {};
        try {
            const saved = localStorage.getItem('sevenflow_tags');
            if (saved) {
                globalTags = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading tags:', e);
        }
        
        // Increment usage count
        if (!globalTags[tag]) {
            globalTags[tag] = { count: 0 };
        }
        globalTags[tag].count++;
        
        // Save
        try {
            localStorage.setItem('sevenflow_tags', JSON.stringify(globalTags));
        } catch (e) {
            console.error('Error saving tags:', e);
        }
    }

    // Ramble - Voice Input for Multiple Tasks
    setupRamble() {
        if (!window.RambleManager) {
            return;
        }

        if (!this.hasFeature('ramble_parsing')) {
            const rambleBtnLocked = document.getElementById('rambleBtn');
            const mobileRambleBtnLocked = document.getElementById('mobileRamble');
            if (rambleBtnLocked) rambleBtnLocked.style.display = 'none';
            if (mobileRambleBtnLocked) mobileRambleBtnLocked.style.display = 'none';
            return;
        }

        this.rambleManager = new RambleManager();
        const isSupported = this.rambleManager.isSupported();

        const rambleBtn = document.getElementById('rambleBtn');
        const mobileRambleBtn = document.getElementById('mobileRamble');

        if (!rambleBtn && !mobileRambleBtn) {
            return;
        }

        // Hide buttons if not supported
        if (!isSupported) {
            if (rambleBtn) rambleBtn.style.display = 'none';
            if (mobileRambleBtn) mobileRambleBtn.style.display = 'none';
            return;
        }

        // Init with current language
        this.rambleManager.init(this.currentLanguage);

        // Make rambleManager globally accessible for Android bridge
        window.app = window.app || {};
        window.app.rambleManager = this.rambleManager;

        // Button click handler
        rambleBtn.addEventListener('click', () => {
            this.openRambleModal();
        });
    }

    openRambleModal() {
        const modal = document.getElementById('rambleModal');
        const t = translations[this.currentLanguage];

        if (!modal) {
            return;
        }

        // Check if rambleManager exists
        if (!this.rambleManager) {
            alert(t.rambleNotSupported);
            return;
        }

        // Hard reset stale listening state before every new session
        this.rambleManager.isListening = false;

        // Reset modal state
        modal.classList.remove('listening');
        document.getElementById('rambleStatusText').textContent = '';

        // Reset transcript
        const transcriptContainer = document.getElementById('rambleTranscriptContainer');
        const transcriptTextarea = document.getElementById('rambleTranscriptTextarea');
        transcriptContainer.style.display = 'block';
        transcriptTextarea.value = '';

        // Hide and reset preview
        const preview = document.getElementById('ramblePreview');
        const previewList = document.getElementById('ramblePreviewList');
        preview.style.display = 'none';
        previewList.innerHTML = '';

        // Reset buttons
        const recordBtn = document.getElementById('rambleRecordBtn');
        const createBtn = document.getElementById('rambleCreateBtn');
        recordBtn.textContent = t.rambleStart;
        recordBtn.disabled = false;
        recordBtn.style.display = 'block';
        createBtn.disabled = false;
        createBtn.textContent = t.rambleCreate;
        createBtn.style.display = 'none';

        // Store parsed tasks for later
        this.rambleParsedTasks = null;

        // Show modal
        this.setModalVisibility(modal, true);
        this.blurActiveElement();

        // Setup record button handler
        const newRecordBtn = recordBtn.cloneNode(true);
        recordBtn.parentNode.replaceChild(newRecordBtn, recordBtn);

        newRecordBtn.addEventListener('click', () => {
            if (!this.rambleManager) {
                return;
            }
            if (modal.classList.contains('listening')) {
                this.stopRambleRecording();
            } else {
                this.startRambleRecording();
            }
        });

        // Setup create button handler
        const newCreateBtn = createBtn.cloneNode(true);
        createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
        newCreateBtn.disabled = false;
        newCreateBtn.textContent = t.rambleCreate;

        newCreateBtn.addEventListener('click', () => {
            this.createRambleTasks();
        });

        // Setup textarea change handler - reparse on edit
        const newTextarea = transcriptTextarea.cloneNode(true);
        transcriptTextarea.parentNode.replaceChild(newTextarea, transcriptTextarea);
        newTextarea.addEventListener('input', () => {
            const text = newTextarea.value.trim();
            if (text) {
                this.parseAndPreviewTasks(text);
            } else {
                this.rambleParsedTasks = null;
                preview.style.display = 'none';
                newCreateBtn.style.display = 'none';
            }
        });

        newTextarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                const text = newTextarea.value.trim();
                if (text) {
                    this.parseAndPreviewTasks(text);
                    this.createRambleTasks();
                }
            }
        });

        // Close handlers
        const closeBtn = document.getElementById('rambleClose');
        const overlay = document.getElementById('rambleOverlay');

        const closeHandler = () => {
            if (modal.classList.contains('listening')) {
                this.stopRambleRecording();
            }
            if (this.rambleManager) {
                this.rambleManager.isListening = false;
            }
            this.setModalVisibility(modal, false);
        };

        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', closeHandler);

        const newOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOverlay, overlay);
        newOverlay.addEventListener('click', closeHandler);
    }

    startRambleRecording() {
        const modal = document.getElementById('rambleModal');
        const recordBtn = document.getElementById('rambleRecordBtn');
        const statusText = document.getElementById('rambleStatusText');
        const t = translations[this.currentLanguage];

        // Ensure any stale native session is cleared before starting a new one
        if (this.rambleManager) {
            this.rambleManager.stopListening();
            this.rambleManager.isListening = false;
        }

        modal.classList.add('listening');
        recordBtn.textContent = t.rambleStop;
        statusText.textContent = t.rambleListening;

        // Update language if changed
        this.rambleManager.setLanguage(this.currentLanguage);

        this.rambleManager.startListening((result) => {
            if (result.success) {
                this.handleRambleResult(result);
            } else {
                this.handleRambleError(result.error, !!result.benign);
            }
        });
    }

    stopRambleRecording() {
        const modal = document.getElementById('rambleModal');
        const recordBtn = document.getElementById('rambleRecordBtn');
        const t = translations[this.currentLanguage];

        this.rambleManager.stopListening();
        modal.classList.remove('listening');
        recordBtn.textContent = t.rambleStart;
    }

    handleRambleResult(result) {
        const modal = document.getElementById('rambleModal');
        const statusText = document.getElementById('rambleStatusText');
        const transcriptContainer = document.getElementById('rambleTranscriptContainer');
        const transcriptTextarea = document.getElementById('rambleTranscriptTextarea');
        const recordBtn = document.getElementById('rambleRecordBtn');
        const t = translations[this.currentLanguage];

        if (this.rambleManager) {
            this.rambleManager.isListening = false;
        }

        // Stop recording
        modal.classList.remove('listening');
        recordBtn.textContent = t.rambleStart;

        // Show transcript (editable)
        statusText.textContent = '';
        transcriptTextarea.value = result.transcript;
        transcriptContainer.style.display = 'block';

        // Parse and preview tasks - use tasks from result if available
        if (result.tasks && result.tasks.length > 0) {
            this.rambleParsedTasks = result.tasks;
            this.showTaskPreview(result.tasks);
        } else {
            // Fallback: parse manually
            this.parseAndPreviewTasks(result.transcript);
        }
    }

    parseAndPreviewTasks(transcript) {
        const t = translations[this.currentLanguage];

        try {
            // Use RambleManager to parse
            const tasks = this.rambleManager.parseMultipleTasks(transcript);
            this.rambleParsedTasks = tasks;
            this.showTaskPreview(tasks);
        } catch (error) {
            const preview = document.getElementById('ramblePreview');
            const createBtn = document.getElementById('rambleCreateBtn');
            preview.style.display = 'none';
            createBtn.style.display = 'none';
        }
    }

    showTaskPreview(tasks) {
        const preview = document.getElementById('ramblePreview');
        const previewList = document.getElementById('ramblePreviewList');
        const createBtn = document.getElementById('rambleCreateBtn');
        const t = translations[this.currentLanguage];

        if (!tasks || tasks.length === 0) {
            preview.style.display = 'none';
            createBtn.style.display = 'none';
            createBtn.disabled = true;
            return;
        }

        // Clear preview
        previewList.innerHTML = '';

        // Create preview items
        tasks.forEach(task => {
            const item = document.createElement('div');
            item.className = 'ramble-preview-item';

            const icon = document.createElement('div');
            icon.className = 'ramble-preview-icon';
            icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>`;

            const textDiv = document.createElement('div');
            textDiv.className = 'ramble-preview-text';
            textDiv.textContent = task.text;

            if (task.date || task.time || task.reminder) {
                const meta = document.createElement('div');
                meta.className = 'ramble-preview-meta';

                const addSeparator = () => {
                    if (meta.childNodes.length === 0) return;
                    const sep = document.createElement('span');
                    sep.textContent = ' • ';
                    meta.appendChild(sep);
                };

                if (task.date) {
                    const dateSpan = document.createElement('span');
                    dateSpan.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 4px;">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>${this.formatDisplayDate(task.date)}
                    `;
                    meta.appendChild(dateSpan);
                }

                if (task.time) {
                    addSeparator();
                    const timeSpan = document.createElement('span');
                    timeSpan.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 4px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>${task.time}
                    `;
                    meta.appendChild(timeSpan);
                }

                if (task.reminder) {
                    addSeparator();
                    const reminderSpan = document.createElement('span');
                    reminderSpan.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 4px;">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>${this.formatTime(task.reminder)}
                    `;
                    meta.appendChild(reminderSpan);
                }

                textDiv.appendChild(meta);
            }

            item.appendChild(icon);
            item.appendChild(textDiv);
            previewList.appendChild(item);
        });

        // Show preview and create button
        preview.style.display = 'block';
        createBtn.textContent = `${t.rambleCreate} (${tasks.length})`;
        createBtn.disabled = false;
        createBtn.style.display = 'block';
    }

    createRambleTasks() {
        if (!this.rambleParsedTasks || this.rambleParsedTasks.length === 0) {
            return;
        }

        const modal = document.getElementById('rambleModal');
        const createBtn = document.getElementById('rambleCreateBtn');
        const t = translations[this.currentLanguage];

        // Disable button
        createBtn.disabled = true;
        createBtn.textContent = t.rambleProcessing;

        // Create all tasks
        this.rambleParsedTasks.forEach(task => {
            // task.date can be either a Date object, string, or null from TaskParser
            let targetDate;

            if (task.date) {
                // Check if it's a Date object first
                if (task.date instanceof Date) {
                    targetDate = this.formatDate(task.date);
                } else if (typeof task.date === 'string') {
                    // It's already a formatted string
                    targetDate = task.date;
                } else {
                    // Unknown type, use today as fallback
                    targetDate = this.formatDate(new Date());
                }
            } else {
                // No date specified, use today
                targetDate = this.formatDate(new Date());
            }


            this.addTask(
                targetDate,
                task.text,
                '',
                'none',
                null,
                !!task.reminder,
                task.reminder || null,
                'none',
                task.time
            );
        });

        // Re-render week
        this.renderWeek();

        // Show success and close
        const statusText = document.getElementById('rambleStatusText');
        statusText.textContent = `✓ ${this.rambleParsedTasks.length} ${t.rambleTasksCreated}`;
        statusText.style.color = '#22c55e';

        setTimeout(() => {
            this.setModalVisibility(modal, false);
            createBtn.disabled = false;
            createBtn.textContent = t.rambleCreate;
        }, 1500);
    }

    handleRambleError(error, benign = false) {
        const modal = document.getElementById('rambleModal');
        const statusText = document.getElementById('rambleStatusText');
        const recordBtn = document.getElementById('rambleRecordBtn');
        const t = translations[this.currentLanguage];

        modal.classList.remove('listening');
        recordBtn.textContent = t.rambleStart;

        if (benign) {
            statusText.textContent = '';
            return;
        }

        let errorMessage = t.rambleError;

        if (error === 'not-supported') {
            errorMessage = t.rambleNotSupported;
        } else if (error === 'not-available') {
            errorMessage = 'Spracherkennung nicht verfügbar (Google Speech Service prüfen)';
        } else if (error === 'not-allowed' || error === 'permission-denied') {
            errorMessage = t.ramblePermissionDenied;
        }

        statusText.textContent = `${errorMessage}${error ? ` [${error}]` : ''}`;
    }

}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Make app globally accessible for mobile WebView (Pull-to-Refresh support)
    window.sevenflowApp = new SevenFlowApp();
    window.app = window.app || {};
    window.app.sevenflowApp = window.sevenflowApp;
});
