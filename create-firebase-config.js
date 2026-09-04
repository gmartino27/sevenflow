const fs = require('fs');
const path = require('path');

console.log('Generating SevenFlow runtime config from environment variables...');

// Load .env file for local generation. Hosted platforms inject env automatically.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const sepIdx = trimmed.indexOf('=');
        if (sepIdx === -1) return;
        const key = trimmed.slice(0, sepIdx).trim();
        const value = trimmed.slice(sepIdx + 1).trim();
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

function env(name) {
    return process.env[name] || '';
}

function parsePlugins(value) {
    return value
        .split(',')
        .map(plugin => plugin.trim())
        .filter(Boolean);
}

const encodedFirebaseApiKey = Buffer.from(env('FIREBASE_API_KEY'), 'utf8').toString('base64');
const localAuth = env('SEVENFLOW_LOCAL_AUTH') === 'true';
const configuredPlugins = parsePlugins(env('SEVENFLOW_PLUGINS'));
const pluginConfig = JSON.stringify(configuredPlugins);

const localConfig = `const firebaseConfig = {};

async function initFirebase() {
    throw new Error('firebase-disabled-in-local-mode');
}

window.firebaseConfig = firebaseConfig;
window.initFirebase = initFirebase;

window.googleCalendarConfig = {
    clientId: "${env('GOOGLE_CALENDAR_CLIENT_ID')}"
};

window.sevenflowConfig = {
    apiBaseUrl: "${env('SEVENFLOW_API_BASE_URL')}",
    localAuth: true,
    plugins: ${pluginConfig}
};
`;

const firebaseConfig = `const decodeBase64 = (value) => {
    try {
        if (typeof atob === 'function') return atob(value || '');
    } catch (_) {}
    return '';
};

const firebaseConfig = {
    apiKey: decodeBase64("${encodedFirebaseApiKey}"),
    authDomain: "${env('FIREBASE_AUTH_DOMAIN')}",
    projectId: "${env('FIREBASE_PROJECT_ID')}",
    storageBucket: "${env('FIREBASE_STORAGE_BUCKET')}",
    messagingSenderId: "${env('FIREBASE_MESSAGING_SENDER_ID')}",
    appId: "${env('FIREBASE_APP_ID')}"
};

let auth, db;

async function initFirebase() {
    if (auth && db) return { auth, db };

    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getAuth, setPersistence, browserLocalPersistence } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);

    // Initialize Firestore with cache disabled to prevent excessive writes
    try {
        db = initializeFirestore(app, {
            cacheSizeBytes: 0 // Disable offline cache completely
        });
    } catch (e) {
        // If already initialized, get existing instance
        db = getFirestore(app);
    }

    return { auth, db };
}

window.firebaseConfig = firebaseConfig;
window.initFirebase = initFirebase;

// Google Calendar OAuth configuration (optional)
window.googleCalendarConfig = {
    clientId: "${env('GOOGLE_CALENDAR_CLIENT_ID')}"
};

window.sevenflowConfig = {
    apiBaseUrl: "${env('SEVENFLOW_API_BASE_URL')}",
    localAuth: ${env('SEVENFLOW_LOCAL_AUTH') === 'true' ? 'true' : 'false'},
    plugins: ${pluginConfig}
};
`;

fs.writeFileSync('js/firebase-config.js', localAuth ? localConfig : firebaseConfig);

if (localAuth) {
    console.log('SevenFlow local JSON mode config generated');
    console.log('   Firebase: disabled');
} else {
    console.log('SevenFlow Firebase mode config generated');
    console.log('   API Key: ' + (env('FIREBASE_API_KEY') ? 'set' : 'missing'));
    console.log('   Auth Domain: ' + (env('FIREBASE_AUTH_DOMAIN') ? 'set' : 'missing'));
    console.log('   Project ID: ' + (env('FIREBASE_PROJECT_ID') ? 'set' : 'missing'));
    console.log('   Storage Bucket: ' + (env('FIREBASE_STORAGE_BUCKET') ? 'set' : 'missing'));
    console.log('   Messaging Sender ID: ' + (env('FIREBASE_MESSAGING_SENDER_ID') ? 'set' : 'missing'));
    console.log('   App ID: ' + (env('FIREBASE_APP_ID') ? 'set' : 'missing'));
}
console.log('   Google Calendar Client ID: ' + (env('GOOGLE_CALENDAR_CLIENT_ID') ? 'set' : 'missing'));
console.log('   SevenFlow API Base URL: ' + (env('SEVENFLOW_API_BASE_URL') ? 'set' : 'same-origin'));
console.log('   Plugins: ' + (configuredPlugins.length ? configuredPlugins.join(', ') : 'none'));
