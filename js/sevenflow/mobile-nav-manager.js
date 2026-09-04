// SevenFlow Mobile Navigation Manager
class SevenFlowMobileNavManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const mobileToday = document.getElementById('mobileToday');
        const mobileRamble = document.getElementById('mobileRamble');
        const mobileView = document.getElementById('mobileView');
        const mobileSearch = document.getElementById('mobileSearch');
        const mobileMenu = document.getElementById('mobileMenu');
        const mobileInbox = document.getElementById('mobileInbox');

        const viewPopup = document.getElementById('mobileViewPopup');
        const menuPopup = document.getElementById('mobileMenuPopup');
        const searchPopup = document.getElementById('mobileSearchPopup');

        const addHandler = (element, handler) => {
            if (!element) return;

            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handler(e);
            }, { passive: false });

            element.addEventListener('click', (e) => {
                e.preventDefault();
                handler(e);
            }, { passive: false });
        };

        const updateTodayButton = () => {
            if (!mobileToday) return;
            const today = new Date().getDate();
            const svg = mobileToday.querySelector('svg text');
            if (svg) svg.textContent = today;
        };
        updateTodayButton();

        const initializeViewButton = () => {
            const numberLabel = document.getElementById('mobileViewNumber');
            const textLabel = document.getElementById('mobileViewLabel');
            const t = translations[this.app.currentLanguage];

            if (numberLabel) numberLabel.textContent = this.app.currentView;
            if (textLabel) textLabel.textContent = t.days || 'days';

            document.querySelectorAll('.mobile-view-options .mobile-option-btn').forEach(btn => {
                const days = parseInt(btn.dataset.days);
                if (days === this.app.currentView) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        };
        initializeViewButton();

        addHandler(mobileToday, async () => {
            if (this.app.getMainView && this.app.getMainView() !== 'week') {
                this.app.applyMainView('week');
            }
            await this.app.goToTodayAndFocus();
            this.closeAllPopups();
        });

        addHandler(mobileRamble, () => {
            this.app.openRambleModal();
            this.closeAllPopups();
        });

        addHandler(mobileView, () => {
            this.togglePopup(viewPopup);
        });

        document.querySelectorAll('.mobile-view-options .mobile-option-btn').forEach(btn => {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const days = parseInt(btn.dataset.days);
                this.app.currentView = days;
                this.app.renderWeek();

                document.querySelectorAll('.mobile-view-options .mobile-option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const numberLabel = document.getElementById('mobileViewNumber');
                const textLabel = document.getElementById('mobileViewLabel');
                const t = translations[this.app.currentLanguage];

                if (numberLabel) numberLabel.textContent = days;
                if (textLabel) textLabel.textContent = t.days || 'days';

                // Separate key from desktop's "currentView" — mobile has its own
                // day-count preference (and its own default, 1) so switching it here
                // doesn't change what desktop shows next time it's opened.
                this.app.saveSettings({ mobileCurrentView: days });
                this.closeAllPopups();
            };

            btn.addEventListener('touchstart', handler, { passive: false });
            btn.addEventListener('click', handler, { passive: false });
        });

        addHandler(mobileSearch, () => {
            this.togglePopup(searchPopup);
            setTimeout(() => {
                const input = document.getElementById('mobileSearchInput');
                if (input) input.focus();
            }, 100);
        });

        const mobileSearchInput = document.getElementById('mobileSearchInput');
        if (mobileSearchInput && this.app.searchManager) {
            let debounceTimeout = null;

            mobileSearchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    this.app.searchManager.handleSearch(e.target.value, 'mobileSearchDropdown');
                }, 200);
            });

            mobileSearchInput.addEventListener('focus', () => {
                if (mobileSearchInput.value) {
                    this.app.searchManager.handleSearch(mobileSearchInput.value, 'mobileSearchDropdown');
                }
            });
        }

        addHandler(mobileMenu, () => {
            this.togglePopup(menuPopup);
        });

        if (mobileInbox) {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const nextView = this.app.getMainView && this.app.getMainView() === 'inbox' ? 'week' : 'inbox';
                this.app.applyMainView(nextView);
                this.closeAllPopups();
            };
            mobileInbox.addEventListener('touchstart', handler, { passive: false });
            mobileInbox.addEventListener('click', handler, { passive: false });
        }

        const refreshBtn = document.getElementById('mobileRefresh');
        if (refreshBtn) {
            const handler = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                refreshBtn.classList.add('spinning');
                await this.app.refreshData();
                setTimeout(() => {
                    refreshBtn.classList.remove('spinning');
                }, 500);
                this.closeAllPopups();
            };
            refreshBtn.addEventListener('touchstart', handler, { passive: false });
            refreshBtn.addEventListener('click', handler, { passive: false });
        }

        const selectModeBtn = document.getElementById('mobileSelectMode');
        if (selectModeBtn) {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.app.selectionMode && this.app.selectionModePinned) {
                    this.app.clearTaskSelection();
                } else {
                    this.app.selectionModePinned = true;
                    this.app.setSelectionMode(true);
                    this.app.updateMultiSelectBar();
                }
                this.closeAllPopups();
            };
            selectModeBtn.addEventListener('touchstart', handler, { passive: false });
            selectModeBtn.addEventListener('click', handler, { passive: false });
        }

        const settingsBtn = document.getElementById('mobileSettings');
        if (settingsBtn) {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.app.openSettingsModal();
                this.closeAllPopups();
            };
            settingsBtn.addEventListener('touchstart', handler, { passive: false });
            settingsBtn.addEventListener('click', handler, { passive: false });
        }

        const pausedTasksBtn = document.getElementById('mobilePausedTasks');
        if (pausedTasksBtn) {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.app.openPausedTasksModal();
                this.closeAllPopups();
            };
            pausedTasksBtn.addEventListener('touchstart', handler, { passive: false });
            pausedTasksBtn.addEventListener('click', handler, { passive: false });
        }

        const logoutBtn = document.getElementById('mobileLogout');
        if (logoutBtn) {
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.app.logout();
                this.closeAllPopups();
            };
            logoutBtn.addEventListener('touchstart', handler, { passive: false });
            logoutBtn.addEventListener('click', handler, { passive: false });
        }

        document.getElementById('closeViewPopup')?.addEventListener('click', () => {
            this.closeAllPopups();
        });

        document.getElementById('closeMenuPopup')?.addEventListener('click', () => {
            this.closeAllPopups();
        });

        document.getElementById('closeSearchPopup')?.addEventListener('click', () => {
            this.closeAllPopups();
        });

        document.querySelectorAll('.mobile-popup').forEach(popup => {
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    this.closeAllPopups();
                }
            });
        });
    }

    togglePopup(popup) {
        const isActive = popup.classList.contains('active');
        this.closeAllPopups();
        if (!isActive) {
            popup.classList.add('active');
        }
    }

    closeAllPopups() {
        document.querySelectorAll('.mobile-popup').forEach(popup => {
            popup.classList.remove('active');
        });
    }
}

window.SevenFlowMobileNavManager = SevenFlowMobileNavManager;
