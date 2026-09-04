// Firestore Database Handler for Tasks

class FirestoreTaskManager {
    constructor() {
        this.db = null;
        this.userId = null;
        this.listeners = []; // Track active listeners
        this.lastSync = {}; // Track last sync time per date
        this.lastBacklogsSync = null;
    }

    async init(userId) {
        const { db } = await initFirebase();
        this.db = db;
        this.userId = userId;
    }

    // Setup real-time listener for a date range
    setupRealtimeListener(startDate, endDate, callback) {
        if (!this.userId) return null;


        return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ collection, query, where, onSnapshot }) => {
            const startDateStr = this.formatDate(startDate);
            const endDateStr = this.formatDate(endDate);

            const tasksRef = collection(this.db, 'users', this.userId, 'tasks');
            const q = query(
                tasksRef,
                where('date', '>=', startDateStr),
                where('date', '<=', endDateStr)
            );

            let isFirstSnapshot = true;

            const unsubscribe = onSnapshot(q, (snapshot) => {
                // Skip the initial snapshot to avoid unnecessary re-render
                if (isFirstSnapshot) {
                    isFirstSnapshot = false;
                    return;
                }

                const changes = [];
                snapshot.docChanges().forEach((change) => {
                    const data = change.doc.data();

                    // Only process if remote is newer than what we last saw.
                    // Comparison uses server-authoritative millis; the change still
                    // carries the client-written updatedAt string for the app's
                    // own-echo guards (shouldIgnoreRealtimeChange).
                    const localTimestamp = this.lastSync[data.date];
                    const remoteTimestamp = this.resolveSyncMillis(data);

                    if (!localTimestamp || remoteTimestamp > localTimestamp) {
                        changes.push({
                            type: change.type,
                            date: data.date,
                            tasks: data.tasks,
                            updatedAt: data.updatedAt
                        });

                        // Update local sync timestamp
                        this.lastSync[data.date] = remoteTimestamp;
                    }
                });

                if (changes.length > 0) {
                    callback(changes);
                }
            });

            this.listeners.push(unsubscribe);
            return unsubscribe;
        });
    }

    // Cleanup all listeners
    cleanupListeners() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners = [];
    }

    async loadTasks() {
        if (!this.userId) return {};
        
        const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        try {
            const tasksRef = collection(this.db, 'users', this.userId, 'tasks');
            const querySnapshot = await getDocs(tasksRef);
            
            const tasks = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                tasks[data.date] = data.tasks;
            });
            
            return tasks;
        } catch (error) {
            console.error('Error loading tasks:', error);
            return {};
        }
    }

    // Load tasks for a specific date range (more efficient)
    async loadTasksForDateRange(startDate, endDate, forceRefresh = false) {
        if (!this.userId) return {};

        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const startDateStr = this.formatDate(startDate);
            const endDateStr = this.formatDate(endDate);

            const tasksRef = collection(this.db, 'users', this.userId, 'tasks');
            const q = query(
                tasksRef,
                where('date', '>=', startDateStr),
                where('date', '<=', endDateStr)
            );

            const querySnapshot = await getDocs(q);

            const tasks = {};

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                tasks[data.date] = data.tasks;
                // Track the server-authoritative version we loaded (epoch millis).
                this.lastSync[data.date] = this.resolveSyncMillis(data) || Date.now();
            });

            return tasks;
        } catch (error) {
            console.error('Error loading tasks for date range:', error);
            return {};
        }
    }

    // Check if local data is stale (older than remote)
    async checkForUpdates(dateKeys) {
        if (!this.userId || dateKeys.length === 0) return [];

        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const tasksRef = collection(this.db, 'users', this.userId, 'tasks');
            const q = query(
                tasksRef,
                where('date', 'in', dateKeys.slice(0, 10)) // Firestore limit: 10 items
            );

            const querySnapshot = await getDocs(q);
            const staleUpdates = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const localTimestamp = this.lastSync[data.date];
                const remoteMillis = this.resolveSyncMillis(data);

                // If remote is newer, mark as stale. syncMillis is the server-based
                // value to store back into lastSync; updatedAt stays the client ISO
                // string for the app's own-echo comparisons.
                if (!localTimestamp || remoteMillis > localTimestamp) {
                    staleUpdates.push({
                        date: data.date,
                        tasks: data.tasks,
                        updatedAt: data.updatedAt,
                        syncMillis: remoteMillis
                    });
                }
            });

            return staleUpdates;
        } catch (error) {
            console.error('Error checking for updates:', error);
            return [];
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Normalize a Firestore Timestamp, {seconds,nanoseconds} or ISO string to epoch millis.
    toMillis(value) {
        if (value == null) return 0;
        if (typeof value === 'object') {
            if (typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value.seconds === 'number') {
                return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
            }
            return 0;
        }
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    // Cross-client conflict resolution: prefer the server-authoritative timestamp
    // (serverUpdatedAt) so device clock skew can't pick the wrong winner. Falls back
    // to the client-written ISO string for legacy docs and for the brief window
    // before serverTimestamp() resolves on the writer's own pending snapshot.
    resolveSyncMillis(data) {
        if (!data) return 0;
        const server = this.toMillis(data.serverUpdatedAt);
        if (server > 0) return server;
        return this.toMillis(data.updatedAt);
    }

    async saveTasks(tasks) {
        if (!this.userId) return;
        
        const { doc, setDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            // Save each date's tasks as a separate document
            const promises = Object.entries(tasks).map(([date, dateTasks]) => {
                const docRef = doc(this.db, 'users', this.userId, 'tasks', date);
                return setDoc(docRef, {
                    date: date,
                    tasks: dateTasks,
                    updatedAt: new Date().toISOString(),
                    serverUpdatedAt: serverTimestamp()
                }, { merge: true });
            });
            
            await Promise.all(promises);
        } catch (error) {
            console.error('[Firestore] Error saving tasks:', error);
            throw error;
        }
    }

    // New method: Save only specific date's tasks (more efficient)
    async saveTasksForDate(date, dateTasks) {
        if (!this.userId) return;

        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const docRef = doc(this.db, 'users', this.userId, 'tasks', date);
            await setDoc(docRef, {
                date: date,
                tasks: dateTasks,
                updatedAt: new Date().toISOString(),
                serverUpdatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Error saving date:', error);
            throw error;
        }
    }

    async saveSettings(settings) {
        if (!this.userId) return;

        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const settingsRef = doc(this.db, 'users', this.userId, 'settings', 'preferences');
            const payload = {
                ...settings,
                updatedAt: new Date().toISOString()
            };
            // Notes get their own timestamp pair (independent of the generic settings
            // updatedAt, which also moves on unrelated fields like theme) so the notes
            // realtime listener can tell whether a change actually touched the notes.
            if (Object.prototype.hasOwnProperty.call(settings, 'notesPadText')) {
                payload.notesPadUpdatedAt = new Date().toISOString();
                payload.notesPadServerUpdatedAt = serverTimestamp();
            }
            await setDoc(settingsRef, payload, { merge: true });
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    // Realtime listener scoped to the notes pad only: reads the shared settings
    // document (Firestore has no field-level listeners) but only ever surfaces
    // notesPadText changes to the caller — other settings fields are ignored here,
    // so notes sync stays behaviorally independent of the rest of "settings".
    setupNotesPadRealtimeListener(callback) {
        if (!this.userId) return null;

        return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ doc, onSnapshot }) => {
            const settingsRef = doc(this.db, 'users', this.userId, 'settings', 'preferences');

            let isFirstSnapshot = true;

            const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
                if (isFirstSnapshot) {
                    isFirstSnapshot = false;
                    return;
                }
                if (!snapshot.exists()) return;

                const data = snapshot.data() || {};
                if (typeof data.notesPadText !== 'string') return;

                callback({ notesPadText: data.notesPadText });
            });

            return unsubscribe;
        });
    }

    async loadSettings() {
        if (!this.userId) return { defaultView: 7 };
        
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        try {
            const settingsRef = doc(this.db, 'users', this.userId, 'settings', 'preferences');
            const docSnap = await getDoc(settingsRef);
            
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return { defaultView: 7 };
        } catch (error) {
            console.error('Error loading settings:', error);
            return { defaultView: 7 };
        }
    }

    async loadBacklogs() {
        if (!this.userId) return { '1': [], '2': [], '3': [], 'inbox': [] };
        
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        try {
            const backlogRef = doc(this.db, 'users', this.userId, 'backlogs', 'data');
            const docSnap = await getDoc(backlogRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data() || {};
                this.lastBacklogsSync = this.resolveSyncMillis(data) || null;
                return data.backlogs || { '1': [], '2': [], '3': [], 'inbox': [] };
            }
            return { '1': [], '2': [], '3': [], 'inbox': [] };
        } catch (error) {
            console.error('Error loading backlogs:', error);
            return { '1': [], '2': [], '3': [], 'inbox': [] };
        }
    }

    async checkForBacklogUpdates() {
        if (!this.userId) return null;

        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const backlogRef = doc(this.db, 'users', this.userId, 'backlogs', 'data');
            const docSnap = await getDoc(backlogRef);
            if (!docSnap.exists()) {
                return null;
            }

            const data = docSnap.data() || {};
            const remoteMillis = this.resolveSyncMillis(data);
            if (!remoteMillis) {
                return null;
            }

            // Cross-client decision uses server millis; returned updatedAt stays the
            // client ISO string so the app's localBacklogsMutationAt echo guard works.
            if (!this.lastBacklogsSync || remoteMillis > this.lastBacklogsSync) {
                this.lastBacklogsSync = remoteMillis;
                return {
                    backlogs: data.backlogs || { '1': [], '2': [], '3': [], 'inbox': [] },
                    updatedAt: data.updatedAt || null
                };
            }

            return null;
        } catch (error) {
            console.error('Error checking backlog updates:', error);
            return null;
        }
    }

    async loadBacklogTitles() {
        if (!this.userId) return { '1': 'This week', '2': 'Next week', '3': 'Later' };
        
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        try {
            const titlesRef = doc(this.db, 'users', this.userId, 'backlogs', 'titles');
            const docSnap = await getDoc(titlesRef);
            
            if (docSnap.exists()) {
                return docSnap.data().titles || { '1': 'This week', '2': 'Next week', '3': 'Later' };
            }
            return { '1': 'This week', '2': 'Next week', '3': 'Later' };
        } catch (error) {
            console.error('Error loading backlog titles:', error);
            return { '1': 'This week', '2': 'Next week', '3': 'Later' };
        }
    }

    // `tombstoneKeys` is a Set (or array) of "id:<id>" / "source:<sourceUrl>" keys —
    // tasks the local client just deleted. A remote-only task matching one of these
    // must NOT be re-added: without this, a task deleted locally would come right
    // back the next time this merge runs against a remote snapshot that hasn't
    // caught up to the deletion yet (see saveBacklogs()'s docs for why that happens
    // even with a single client involved).
    mergeBacklogTasks(localTasks, remoteTasks, tombstoneKeys) {
        const local = Array.isArray(localTasks) ? localTasks : [];
        const remote = Array.isArray(remoteTasks) ? remoteTasks : [];
        const tombstones = tombstoneKeys instanceof Set ? tombstoneKeys : new Set(tombstoneKeys || []);
        const seen = new Set();

        local.forEach((task) => {
            if (!task) return;
            if (task.id !== undefined && task.id !== null) seen.add(`id:${task.id}`);
            if (task.sourceUrl) seen.add(`source:${task.sourceUrl}`);
        });

        const remoteOnly = remote.filter((task) => {
            if (!task) return false;
            const idKey = task.id !== undefined && task.id !== null ? `id:${task.id}` : '';
            const sourceKey = task.sourceUrl ? `source:${task.sourceUrl}` : '';
            if (idKey && seen.has(idKey)) return false;
            if (sourceKey && seen.has(sourceKey)) return false;
            if (idKey && tombstones.has(idKey)) return false;
            if (sourceKey && tombstones.has(sourceKey)) return false;
            return true;
        });

        return [...remoteOnly, ...local];
    }

    mergeBacklogsForSave(localBacklogs, remoteBacklogs, tombstonesByBacklog) {
        const local = localBacklogs || {};
        const remote = remoteBacklogs || {};
        const tombstones = tombstonesByBacklog || {};
        return {
            '1': this.mergeBacklogTasks(local['1'], remote['1'], tombstones['1']),
            '2': this.mergeBacklogTasks(local['2'], remote['2'], tombstones['2']),
            '3': this.mergeBacklogTasks(local['3'], remote['3'], tombstones['3']),
            inbox: this.mergeBacklogTasks(local.inbox, remote.inbox, tombstones.inbox)
        };
    }

    // `tombstonesByBacklog` (optional): { '1'|'2'|'3'|inbox: Set|Array<string> } of
    // delete-tombstone keys, forwarded to mergeBacklogsForSave() if a merge is
    // needed. See mergeBacklogTasks() for why this exists.
    async saveBacklogs(backlogs, tombstonesByBacklog) {
        if (!this.userId) return;

        const { doc, runTransaction, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        try {
            const updatedAt = new Date().toISOString();
            const backlogRef = doc(this.db, 'users', this.userId, 'backlogs', 'data');
            let savedBacklogs = backlogs;
            await runTransaction(this.db, async (tx) => {
                const snap = await tx.get(backlogRef);
                const remoteData = snap.exists() ? (snap.data() || {}) : {};
                const remoteMillis = this.resolveSyncMillis(remoteData);
                const remoteChangedAfterLastSync = remoteMillis
                    && this.lastBacklogsSync
                    && remoteMillis > this.lastBacklogsSync;
                savedBacklogs = remoteChangedAfterLastSync
                    ? this.mergeBacklogsForSave(backlogs, remoteData.backlogs, tombstonesByBacklog)
                    : backlogs;

                tx.set(backlogRef, {
                    backlogs: savedBacklogs,
                    updatedAt,
                    serverUpdatedAt: serverTimestamp()
                }, { merge: true });
            });
            if (savedBacklogs !== backlogs) {
                Object.assign(backlogs, savedBacklogs);
            }
            // lastBacklogsSync is tracked in epoch millis; use the local clock as a
            // best estimate until the next read resolves the server timestamp.
            this.lastBacklogsSync = Date.now();
        } catch (error) {
            console.error('[Firestore] Error saving backlogs:', error);
            throw error;
        }
    }

    async saveBacklogTitles(titles) {
        if (!this.userId) return;
        
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        try {
            const titlesRef = doc(this.db, 'users', this.userId, 'backlogs', 'titles');
            await setDoc(titlesRef, {
                titles: titles,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error saving backlog titles:', error);
        }
    }
}

window.FirestoreTaskManager = FirestoreTaskManager;
