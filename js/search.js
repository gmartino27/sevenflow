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
        // Input events
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 200);
        });
        
        // Focus/blur events
        this.searchInput.addEventListener('focus', () => {
            if (this.searchInput.value.trim()) {
                this.searchDropdown.classList.add('active');
            }
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.searchDropdown.classList.remove('active');
            }
        });
        
        // Keyboard shortcut: Ctrl+K or Cmd+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            }
        });
    }
    
    performSearch(query) {
        query = query.trim().toLowerCase();
        
        if (!query) {
            this.searchDropdown.classList.remove('active');
            return;
        }
        
        const results = {
            week: [],
            inbox: [],
            backlog: []
        };
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recurringGroups = {}; // Group by recurringId
        
        // Search in week tasks
        Object.keys(this.sevenflow.tasks).forEach(dateKey => {
            this.sevenflow.tasks[dateKey].forEach(task => {
                if (this.matchesQuery(task, query)) {
                    const result = {
                        task: task,
                        date: new Date(dateKey),
                        dateKey: dateKey
                    };
                    
                    if (task.recurringId) {
                        // Group recurring tasks
                        if (!recurringGroups[task.recurringId]) {
                            recurringGroups[task.recurringId] = [];
                        }
                        recurringGroups[task.recurringId].push(result);
                    } else {
                        // Non-recurring task - add directly
                        results.week.push(result);
                    }
                }
            });
        });
        
        // For each recurring group, only keep the closest to today
        Object.values(recurringGroups).forEach(group => {
            const closest = group.reduce((closest, current) => {
                const closestDiff = Math.abs(closest.date - today);
                const currentDiff = Math.abs(current.date - today);
                return currentDiff < closestDiff ? current : closest;
            });
            results.week.push(closest);
        });
        
        // Search in backlog
        Object.keys(this.sevenflow.backlogs).forEach(backlogId => {
            this.sevenflow.backlogs[backlogId].forEach(task => {
                if (this.matchesQuery(task, query)) {
                    const isInbox = backlogId === 'inbox';
                    const title = isInbox
                        ? (this.sevenflow.t ? this.sevenflow.t('inbox') : 'Inbox')
                        : (this.sevenflow.backlogTitles[backlogId] || `Backlog ${backlogId}`);
                    const targetList = isInbox ? results.inbox : results.backlog;
                    targetList.push({
                        task: task,
                        backlogId: backlogId,
                        backlogTitle: title
                    });
                }
            });
        });
        
        this.renderResults(results, query);
    }
    
    // Public method for mobile search
    handleSearch(query, dropdownId = 'searchDropdown') {
        query = query.trim().toLowerCase();
        const dropdown = document.getElementById(dropdownId);
        
        if (!query) {
            dropdown.classList.remove('active');
            return;
        }
        
        const results = {
            week: [],
            inbox: [],
            backlog: []
        };
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recurringGroups = {};
        
        // Search in week tasks
        Object.keys(this.sevenflow.tasks).forEach(dateKey => {
            this.sevenflow.tasks[dateKey].forEach(task => {
                if (this.matchesQuery(task, query)) {
                    const result = {
                        task: task,
                        date: new Date(dateKey),
                        dateKey: dateKey
                    };
                    
                    if (task.recurringId) {
                        if (!recurringGroups[task.recurringId]) {
                            recurringGroups[task.recurringId] = [];
                        }
                        recurringGroups[task.recurringId].push(result);
                    } else {
                        results.week.push(result);
                    }
                }
            });
        });
        
        Object.values(recurringGroups).forEach(group => {
            const closest = group.reduce((closest, current) => {
                const closestDiff = Math.abs(closest.date - today);
                const currentDiff = Math.abs(current.date - today);
                return currentDiff < closestDiff ? current : closest;
            });
            results.week.push(closest);
        });
        
        // Search in backlog
        Object.keys(this.sevenflow.backlogs).forEach(backlogId => {
            this.sevenflow.backlogs[backlogId].forEach(task => {
                if (this.matchesQuery(task, query)) {
                    const isInbox = backlogId === 'inbox';
                    const title = isInbox
                        ? (this.sevenflow.t ? this.sevenflow.t('inbox') : 'Inbox')
                        : (this.sevenflow.backlogTitles[backlogId] || `Backlog ${backlogId}`);
                    const targetList = isInbox ? results.inbox : results.backlog;
                    targetList.push({
                        task: task,
                        backlogId: backlogId,
                        backlogTitle: title
                    });
                }
            });
        });
        
        this.renderResultsToDropdown(dropdown, results, query);
    }
    
    matchesQuery(task, query) {
        const text = (task.text || '').toLowerCase();
        const description = (task.description || '').toLowerCase();
        
        // Check main task
        if (text.includes(query) || description.includes(query)) {
            return true;
        }
        
        // Check subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const subtaskMatch = task.subtasks.some(subtask => {
                const subtaskText = (subtask.text || '').toLowerCase();
                return subtaskText.includes(query);
            });
            if (subtaskMatch) return true;
        }
        
        // Check tags
        if (task.tags && task.tags.length > 0) {
            return task.tags.some(tag => tag.toLowerCase().includes(query));
        }
        
        return false;
    }
    
    renderResults(results, query) {
        const totalResults = results.week.length + results.inbox.length + results.backlog.length;
        
        if (totalResults === 0) {
            this.searchDropdown.innerHTML = '<div class="search-empty">Keine Ergebnisse gefunden</div>';
            this.searchDropdown.classList.add('active');
            return;
        }
        
        let html = '';
        
        // Week results
        if (results.week.length > 0) {
            html += '<div class="search-group">';
            html += '<div class="search-group-title">Woche</div>';
            results.week.forEach(result => {
                html += this.createResultHTML(result, query, 'week');
            });
            html += '</div>';
        }
        
        // Inbox results
        if (results.inbox.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.sevenflow.t ? this.sevenflow.t('inbox') : 'Inbox'}</div>`;
            results.inbox.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }

        // Backlog results
        if (results.backlog.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.sevenflow.t ? this.sevenflow.t('backlog') : 'Backlog'}</div>`;
            results.backlog.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }
        
        this.searchDropdown.innerHTML = html;
        this.searchDropdown.classList.add('active');
        
        // Add click handlers
        this.searchDropdown.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => {
                const type = el.dataset.type;
                const id = el.dataset.id;
                
                if (type === 'week') {
                    const dateKey = el.dataset.dateKey;
                    const date = new Date(dateKey);
                    const task = this.sevenflow.tasks[dateKey].find(t => t.id == id);
                    if (task) {
                        this.sevenflow.openTaskModal(date, task);
                        this.searchDropdown.classList.remove('active');
                        this.searchInput.value = '';
                    }
                } else if (type === 'backlog') {
                    const backlogId = el.dataset.backlogId;
                    const task = this.sevenflow.backlogs[backlogId].find(t => t.id == id);
                    if (task) {
                        this.sevenflow.openTaskModal(null, task, backlogId);
                        this.searchDropdown.classList.remove('active');
                        this.searchInput.value = '';
                    }
                }
            });
        });
    }
    
    renderResultsToDropdown(dropdown, results, query) {
        const totalResults = results.week.length + results.inbox.length + results.backlog.length;
        
        if (totalResults === 0) {
            dropdown.innerHTML = '<div class="search-empty">Keine Ergebnisse gefunden</div>';
            dropdown.classList.add('active');
            return;
        }
        
        let html = '';
        
        // Week results
        if (results.week.length > 0) {
            html += '<div class="search-group">';
            html += '<div class="search-group-title">Woche</div>';
            results.week.forEach(result => {
                html += this.createResultHTML(result, query, 'week');
            });
            html += '</div>';
        }
        
        // Inbox results
        if (results.inbox.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.sevenflow.t ? this.sevenflow.t('inbox') : 'Inbox'}</div>`;
            results.inbox.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }

        // Backlog results
        if (results.backlog.length > 0) {
            html += '<div class="search-group">';
            html += `<div class="search-group-title">${this.sevenflow.t ? this.sevenflow.t('backlog') : 'Backlog'}</div>`;
            results.backlog.forEach(result => {
                html += this.createResultHTML(result, query, 'backlog');
            });
            html += '</div>';
        }
        
        dropdown.innerHTML = html;
        dropdown.classList.add('active');
        
        // Add click handlers
        dropdown.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => {
                const type = el.dataset.type;
                const id = el.dataset.id;
                
                if (type === 'week') {
                    const dateKey = el.dataset.dateKey;
                    const date = new Date(dateKey);
                    const task = this.sevenflow.tasks[dateKey].find(t => t.id == id);
                    if (task) {
                        this.sevenflow.openTaskModal(date, task);
                        dropdown.classList.remove('active');
                        // Clear mobile search input if exists
                        const mobileInput = document.getElementById('mobileSearchInput');
                        if (mobileInput) mobileInput.value = '';
                        // Close mobile popup
                        this.sevenflow.closeAllMobilePopups();
                    }
                } else if (type === 'backlog') {
                    const backlogId = el.dataset.backlogId;
                    const task = this.sevenflow.backlogs[backlogId].find(t => t.id == id);
                    if (task) {
                        this.sevenflow.openTaskModal(null, task, backlogId);
                        dropdown.classList.remove('active');
                        // Clear mobile search input if exists
                        const mobileInput = document.getElementById('mobileSearchInput');
                        if (mobileInput) mobileInput.value = '';
                        // Close mobile popup
                        this.sevenflow.closeAllMobilePopups();
                    }
                }
            });
        });
    }
    
    createResultHTML(result, query, type) {
        const task = result.task;
        const highlightedText = this.highlightQuery(task.text, query);
        
        let meta = '';
        if (type === 'week') {
            const dateStr = this.sevenflow.formatDisplayDate(result.date);
            meta = dateStr;
        } else {
            meta = result.backlogTitle;
        }
        
        let icons = '';
        
        // Color dot
        if (task.color && task.color !== 'none') {
            const colorMap = {
                'blue': '#3b82f6',
                'green': '#10b981',
                'yellow': '#f59e0b',
                'orange': '#f97316',
                'red': '#ef4444',
                'purple': '#a855f7',
                'pink': '#ec4899',
                'teal': '#14b8a6'
            };
            const color = colorMap[task.color] || '#666';
            icons += `<div class="search-result-color" style="background: ${color}"></div>`;
        }
        
        // Reminder icon
        if (task.reminderEnabled) {
            icons += `
                <svg class="search-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
            `;
        }
        
        // Recurring icon
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
        
        const dataAttrs = type === 'week' 
            ? `data-type="week" data-id="${task.id}" data-date-key="${result.dateKey}"`
            : `data-type="backlog" data-id="${task.id}" data-backlog-id="${result.backlogId}"`;
        
        return `
            <div class="search-result" ${dataAttrs}>
                <div class="search-result-content">
                    <div class="search-result-text">${highlightedText}</div>
                    <div class="search-result-meta">${meta}</div>
                </div>
                <div class="search-result-icons">
                    ${icons}
                </div>
            </div>
        `;
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
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize search when SevenFlow is ready
window.SearchManager = SearchManager;
