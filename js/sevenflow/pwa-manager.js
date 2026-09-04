// SevenFlow PWA Manager
class SevenFlowPwaManager {
    setup() {
        // Skip Service Worker in Android WebView (file:// protocol)
        if (window.location.protocol === 'file:') {
            return;
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .catch(err => console.error('Service Worker registration failed:', err));
        }
    }
}

window.SevenFlowPwaManager = SevenFlowPwaManager;
