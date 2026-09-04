// SevenFlow I18n Manager
class SevenFlowI18nManager {
    constructor(app) {
        this.app = app;
    }

    getDayName(date) {
        try {
            if (typeof translations !== 'undefined' && translations[this.app.currentLanguage]) {
                const days = [
                    translations[this.app.currentLanguage].sunday,
                    translations[this.app.currentLanguage].monday,
                    translations[this.app.currentLanguage].tuesday,
                    translations[this.app.currentLanguage].wednesday,
                    translations[this.app.currentLanguage].thursday,
                    translations[this.app.currentLanguage].friday,
                    translations[this.app.currentLanguage].saturday
                ];
                return days[date.getDay()];
            }
        } catch (error) {
            console.error('[i18n] getDayName error:', error);
        }

        const fallbackDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return fallbackDays[date.getDay()];
    }

    t(key) {
        if (typeof translations === 'undefined') {
            console.error('[i18n] Translations not loaded');
            return key;
        }
        if (!translations[this.app.currentLanguage]) {
            console.error(`[i18n] Language ${this.app.currentLanguage} not found`);
            return key;
        }
        return translations[this.app.currentLanguage]?.[key] || key;
    }

    setLanguage(lang) {
        if (!translations[lang]) {
            console.error(`Language ${lang} not found`);
            return;
        }

        this.app.currentLanguage = lang;
        this.app.settings.language = lang;
        this.app.saveSettings({ language: lang });
        this.translateUI();
        this.app.renderWeek();
        this.app.renderBacklog();
    }

    translateUI() {
        try {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                const translation = this.t(key);
                if (translation && translation !== key) {
                    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
                        el.textContent = translation;
                    }
                }
            });

            document.querySelectorAll('[data-i18n-option]').forEach(el => {
                const key = el.getAttribute('data-i18n-option');
                const translation = this.t(key);
                if (translation && translation !== key) {
                    el.textContent = translation;
                }
            });

            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                const translation = this.t(key);
                if (translation && translation !== key) {
                    el.placeholder = translation;
                }
            });

            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                const translation = this.t(key);
                if (translation && translation !== key) {
                    el.title = translation;
                }
            });

            const langSelect = document.getElementById('languageSelect');
            if (langSelect) {
                langSelect.value = this.app.currentLanguage;
            }

            this.updateBacklogTitlesFromLanguage();
        } catch (error) {
            console.error('[i18n] Translation error:', error);
        }
    }

    updateBacklogTitlesFromLanguage() {
        const defaultTitles = {
            '1': this.t('thisWeek'),
            '2': this.t('nextWeek'),
            '3': this.t('later')
        };
        const defaultTitleValues = new Set([
            'Diese Woche',
            'This week',
            'Nächste Woche',
            'Next week',
            'Irgendwann',
            'Später',
            'Later'
        ]);
        let changed = false;

        Object.keys(defaultTitles).forEach(id => {
            const titleEl = document.querySelector(`[data-backlog-id="${id}"] .backlog-title-input`);
            if (this.app.backlogTitles[id]) {
                const isDefault = defaultTitleValues.has(this.app.backlogTitles[id]);

                if (isDefault) {
                    changed = changed || this.app.backlogTitles[id] !== defaultTitles[id];
                    this.app.backlogTitles[id] = defaultTitles[id];
                    if (titleEl) titleEl.value = defaultTitles[id];
                }
            }
        });

        if (changed && typeof this.app.saveBacklogTitles === 'function') {
            this.app.saveBacklogTitles();
        }
    }
}

window.SevenFlowI18nManager = SevenFlowI18nManager;
