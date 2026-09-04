class LocalTaskManager {
    constructor() {
        this.userId = null;
        this.lastSync = {};
        this.lastBacklogsSync = null;
    }

    async init(userId) {
        this.userId = userId;
    }

    getToken() {
        return localStorage.getItem('sevenflow_local_token') || '';
    }

    async request(path, payload = null) {
        const response = await fetch(path, {
            method: payload ? 'POST' : 'GET',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.getToken()}`
            },
            body: payload ? JSON.stringify(payload) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'local-backend-request-failed');
        }
        return data;
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async loadState() {
        return this.request('/local-api/state');
    }

    async loadTasks() {
        const state = await this.loadState();
        return state.tasks || {};
    }

    async loadTasksForDateRange(startDate, endDate) {
        const state = await this.loadState();
        const start = this.formatDate(startDate);
        const end = this.formatDate(endDate);
        const tasks = {};
        Object.entries(state.tasks || {}).forEach(([dateKey, dateTasks]) => {
            if (dateKey >= start && dateKey <= end) {
                tasks[dateKey] = dateTasks;
                this.lastSync[dateKey] = Date.now();
            }
        });
        return tasks;
    }

    async saveTasks(tasks) {
        await this.request('/local-api/state', { tasks });
    }

    async saveTasksForDate(date, dateTasks) {
        await this.request('/local-api/state', { taskDates: { [date]: dateTasks } });
        this.lastSync[date] = Date.now();
    }

    async checkForUpdates() {
        return [];
    }

    setupRealtimeListener() {
        return null;
    }

    cleanupListeners() {}

    async loadSettings() {
        const state = await this.loadState();
        return state.settings || { defaultView: 7 };
    }

    async saveSettings(settings) {
        await this.request('/local-api/state', { settings });
    }

    setupNotesPadRealtimeListener() {
        return null;
    }

    async loadBacklogs() {
        const state = await this.loadState();
        this.lastBacklogsSync = Date.now();
        return state.backlogs || { '1': [], '2': [], '3': [], inbox: [] };
    }

    async checkForBacklogUpdates() {
        return null;
    }

    async saveBacklogs(backlogs) {
        await this.request('/local-api/state', { backlogs });
        this.lastBacklogsSync = Date.now();
    }

    async loadBacklogTitles() {
        const state = await this.loadState();
        return state.backlogTitles || { '1': 'This week', '2': 'Next week', '3': 'Later' };
    }

    async saveBacklogTitles(titles) {
        await this.request('/local-api/state', { backlogTitles: titles });
    }
}

window.LocalTaskManager = LocalTaskManager;
