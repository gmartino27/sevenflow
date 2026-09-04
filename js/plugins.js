(function () {
    const registry = new Map();
    const state = {
        appInitialized: new Set(),
        authInitialized: new Set(),
        authUiInitialized: new Set()
    };

    function normalizePluginList(value) {
        if (Array.isArray(value)) return value.filter(Boolean).map(String);
        if (typeof value === 'string') {
            return value.split(',').map(item => item.trim()).filter(Boolean);
        }
        return [];
    }

    function getEnabledPluginIds() {
        return normalizePluginList(window.sevenflowConfig && window.sevenflowConfig.plugins);
    }

    function isEnabled(id) {
        return getEnabledPluginIds().includes(id);
    }

    function enabledPlugins() {
        return getEnabledPluginIds()
            .map(id => registry.get(id))
            .filter(Boolean);
    }

    window.SevenFlowPlugins = {
        register(plugin) {
            if (!plugin || !plugin.id) return;
            registry.set(plugin.id, plugin);
        },

        isEnabled,

        initAuth(authManager) {
            enabledPlugins().forEach((plugin) => {
                if (state.authInitialized.has(plugin.id)) return;
                if (typeof plugin.initAuth === 'function') plugin.initAuth(authManager);
                state.authInitialized.add(plugin.id);
            });
        },

        initAuthUI(context) {
            enabledPlugins().forEach((plugin) => {
                if (state.authUiInitialized.has(plugin.id)) return;
                if (typeof plugin.initAuthUI === 'function') plugin.initAuthUI(context);
                state.authUiInitialized.add(plugin.id);
            });
        },

        initApp(app) {
            enabledPlugins().forEach((plugin) => {
                if (state.appInitialized.has(plugin.id)) return;
                if (typeof plugin.initApp === 'function') plugin.initApp(app);
                state.appInitialized.add(plugin.id);
            });
        },

        runAppHook(hookName, app, ...args) {
            enabledPlugins().forEach((plugin) => {
                const hook = plugin && plugin.appHooks && plugin.appHooks[hookName];
                if (typeof hook === 'function') hook(app, ...args);
            });
        },

        collectSettings(app) {
            return enabledPlugins().reduce((settings, plugin) => {
                const collector = plugin && plugin.appHooks && plugin.appHooks.collectSettings;
                if (typeof collector !== 'function') return settings;
                return { ...settings, ...(collector(app) || {}) };
            }, {});
        },

        prepareBackupSettings(app, settings) {
            return enabledPlugins().reduce((currentSettings, plugin) => {
                const preparer = plugin && plugin.appHooks && plugin.appHooks.prepareBackupSettings;
                if (typeof preparer !== 'function') return currentSettings;
                return preparer(app, currentSettings) || currentSettings;
            }, settings);
        },

        getTaskSourceIcon(app, task) {
            for (const plugin of enabledPlugins()) {
                const provider = plugin && plugin.appHooks && plugin.appHooks.getTaskSourceIcon;
                if (typeof provider !== 'function') continue;
                const icon = provider(app, task);
                if (icon) return icon;
            }
            return null;
        }
    };
})();
