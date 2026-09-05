// Search functionality for SevenFlow
class SearchManager {
    constructor(sevenflow) {
        this.sevenflow = sevenflow;
        this.searchInput = document.getElementById('searchInput');
        this.searchDropdown = document.getElementById('searchDropdown');
        this.debounceTimeout = null;
        this.init();
    }

    init() {
        if (!this.searchInput || !this.searchDropdown) return;

        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 200);
        });

        this.searchInput.addEventListener('focus', () => {
            if (this.searchInput.value.trim()) {
                this.performSearch(this.searchInput.value);
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.searchDropdown.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            }
        });
    }

    performSearch(query) {
        const dropdown = this.searchDropdown;
        if (!dropdown) return;
        this.search(query, dropdown, () => {
            this.searchInput.value = '';
        });
    }

    // Public method for mobile search
    handleSearch(query, dropdownId = 'searchDropdown') {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        this.search(query, dropdown, () => {
            const mobileInput = document.getElementById('mobileSearchInput');
            if (mobileInput) mobileInput.value = '';
            this.sevenflow.closeAllMobilePopups();
        });
    }

    search(rawQuery, dropdown, afterOpenTask) {
        const query = String(rawQuery || '').trim().toLowerCase();

        if (!query) {
            dropdown.classList.remove('active');
            return;
        }

        const results = this.collectResults(query);
        this.renderResultsToDropdown(dropdown, results, query, afterOpenTask);
    }

    collectResults(query) {
        const results = {
            week: [],
            inbox: [],
            backlog: []
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recurringGroups = {};

        Object.keys(this.sevenflow.tasks || {}).forEach(dateKey => {
            const tasks = this.sevenflow.tasks[dateKey] || [];
            tasks.forEach(task => {
                if (!this.matchesQuery(task, query)) return;

                const result = {
                    task,
                    date: new Date(dateKey),
                    dateKey
                };

                if (task.recurringId) {
                    if (!recurringGroups[task.recurringId]) recurringGroups[task.recurringId] = [];
                    recurringGroups[task.recurringId].push(result);
                } else {
                    results.week.push(result);
                }
            });
        });

        Object.values(recurringGroups).forEach(group => {
            const closest = group.reduce((closestResult, current) => {
                const closestDiff = Math.abs(closestResult.date - today);
                const currentDiff = Math.abs(current.date - today);
                return currentDiff < closestDiff ? current : closestResult;
            });
            results.week.push(closest);
        });

        Object.keys(this.sevenflow.backlogs || {}).forEach(backlogId => {
            const tasks = this.sevenflow.backlogs[backlogId] || [];
            tasks.forEach(task => {
                if (!this.matchesQuery(task, query)) return;
                const isInbox = backlogId === 'inbox';
                const title = isInbox
                    ? (this.sevenflow.t ? this.sevenflow.t('inbox') : 'Inbox')
                    : (this.sevenflow.backlogTitles[backlogId] || `Backlog ${backlogId}`);
                const targetList = isInbox ? results.inbox : results.backlog;
                targetList.push({
                    task,
                    backlogId,
                    backlogTitle: title
                });
            });
        });

        return results;
    }

    shouldSearchCompletedTasks() {
        return this.sevenflow.settings?.searchCompletedTasks === 'enabled';
    }

    matchesQuery(task, query) {
        if (!task) return false;
        if (task.completed && !this.shouldSearchCompletedTasks()) return false;

        const text = (task.text || '').toLowerCase();
        const description = (task.description || '').toLowerCase();

        if (text.includes(query) || description.includes(query)) return true;

        if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
            const subtaskMatch = task.subtasks.some(subtask => {
                const subtaskText = (subtask.text || '').toLowerCase();
                return subtaskText.includes(query);
            });
            if (subtaskMatch) return true;
        }

        if (Array.isArray(task.tags) && task.tags.length > 0) {
            return task.tags.some(tag => String(tag).toLowerCase().includes(query));
        }

        return false;
    }

    renderResultsToDropdown(dropdown, results, query, afterOpenTask = null) {
        const totalResults = results.week.length + results.inbox.length + results.backlog.length;

        if (totalResults === 0) {
            dropdown.innerHTML = `<div class="search-empty">${this.t('searchNoResults', 'Keine Ergebnisse gefunden')}</div>`;
            dropdown.classList.add('active');
            return;
        }

        let html = '';

        if (results.week.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.t('week', 'Woche')}</div>`;
            results.week.forEach(result => {
                html += this.createResultHTML(result, query, 'week');
            });
            html += '</div>';
        }

        if (results.inbox.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.t('inbox', 'Inbox')}</div>`;
            results.inbox.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }

        if (results.backlog.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.t('backlog', 'Backlog')}</div>`;
            results.backlog.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }

        dropdown.innerHTML = html;
        dropdown.classList.add('active');

        dropdown.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => {
                const type = el.dataset.type;
                const id = el.dataset.id;

                if (type === 'week') {
                    const dateKey = el.dataset.dateKey;
                    const date = new Date(dateKey);
                    const task = (this.sevenflow.tasks[dateKey] || []).find(t => String(t.id) === String(id));
                    if (task) {
                        this.sevenflow.openTaskModal(date, task);
                        dropdown.classList.remove('active');
                        if (typeof afterOpenTask === 'function') afterOpenTask();
                    }
                } else if (type === 'backlog') {
                    const backlogId = el.dataset.backlogId;
                    const task = (this.sevenflow.backlogs[backlogId] || []).find(t => String(t.id) === String(id));
                    if (task) {
                        this.sevenflow.openTaskModal(null, task, backlogId);
                        dropdown.classList.remove('active');
                        if (typeof afterOpenTask === 'function') afterOpenTask();
                    }
                }
            });
        });
    }

    createResultHTML(result, query, type) {
        const task = result.task;
        const highlightedText = this.highlightQuery(task.text || '', query);
        const completedClass = task.completed ? ' completed' : '';

        const meta = type === 'week'
            ? this.sevenflow.formatDisplayDate(result.date)
            : result.backlogTitle;

        let icons = '';

        if (task.color && task.color !== 'none') {
            const colorMap = {
                blue: '#3b82f6',
                green: '#10b981',
                yellow: '#f59e0b',
                orange: '#f97316',
                red: '#ef4444',
                purple: '#a855f7',
                pink: '#ec4899',
                teal: '#14b8a6'
            };
            const color = colorMap[task.color] || '#666';
            icons += `<div class="search-result-color" style="background: ${color}"></div>`;
        }

        if (task.reminderEnabled) {
            icons += `
                <svg class="search-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
            `;
        }

        if (task.recurring && task.recurring !== 'none') {
            icons += `
                <svg class="search-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                    <path d="M16 21h5v-5"></path>
                </svg>
            `;
        }

        if (task.completed) {
            icons += `
                <svg class="search-result-icon search-result-completed-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        }

        const dataAttrs = type === 'week'
            ? `data-type="week" data-id="${task.id}" data-date-key="${result.dateKey}"`
            : `data-type="backlog" data-id="${task.id}" data-backlog-id="${result.backlogId}"`;

        return `
            <div class="search-result${completedClass}" ${dataAttrs}>
                <div class="search-result-content">
                    <div class="search-result-text">${highlightedText}</div>
                    <div class="search-result-meta">${this.escapeHtml(meta)}</div>
                </div>
                <div class="search-result-icons">
                    ${icons}
                </div>
            </div>
        `;
    }

    t(key, fallback) {
        return this.sevenflow.t ? this.sevenflow.t(key) : fallback;
    }

    highlightQuery(text, query) {
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index === -1) return this.escapeHtml(text);

        const before = this.escapeHtml(text.substring(0, index));
        const match = this.escapeHtml(text.substring(index, index + query.length));
        const after = this.escapeHtml(text.substring(index + query.length));

        return `${before}<mark>${match}</mark>${after}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }
}

window.SearchManager = SearchManager;
