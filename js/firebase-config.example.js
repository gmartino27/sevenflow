// Firebase Configuration Template
// WICHTIG: 
// 1. Für lokale Entwicklung: Kopiere diese Datei zu: js/firebase-config.js
// 2. Ersetze die Platzhalter mit deinen echten Firebase-Werten
// 3. firebase-config.js wird NICHT ins Git committed (.gitignore)

const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

// Firebase initialisieren
let auth, db;

async function initFirebase() {
    try {
        // Firebase SDK laden
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        console.log('Firebase initialized');
        return { auth, db };
    } catch (error) {
        console.error('Firebase init error:', error);
        throw error;
    }
}

// Export für andere Module
window.firebaseConfig = firebaseConfig;
window.initFirebase = initFirebase;

// Google Calendar OAuth configuration (optional)
// Create OAuth 2.0 Client ID (Web application) in Google Cloud and paste below.
window.googleCalendarConfig = {
    clientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
};

window.sevenflowConfig = {
    apiBaseUrl: "https://your-site.netlify.app",
    plugins: [
        // "task-api",
        // "google-login",
        // "google-calendar"
    ]
};
