(function () {
    if (!window.SevenFlowPlugins) return;

    function showElement(id, display = '') {
        const element = document.getElementById(id);
        if (element) element.style.display = display;
    }

    window.SevenFlowPlugins.register({
        id: 'pause-recurring',
        appHooks: {
            afterCoreReady() {
                showElement('pausedTasksBtn');
                showElement('mobilePausedTasks');
            }
        }
    });
})();
