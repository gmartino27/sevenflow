// Auth UI Controller

// Detect browser/system language and set default
function detectSystemLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    const langCode = browserLang.split('-')[0]; // 'de-DE' -> 'de'

    // Check if we have translations for this language
    if (translations[langCode]) {
        return langCode;
    }

    // Fallback to English
    return 'en';
}

// Apply translations to the page
function applyTranslations(lang) {
    const t = translations[lang];
    if (!t) return;

    // Update HTML lang attribute
    document.getElementById('htmlRoot').lang = lang;

    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });

    // Store language preference
    localStorage.setItem('language', lang);
}

// Get translated error message
function getTranslatedError(errorCode, lang) {
    const t = translations[lang];
    if (!t) return errorCode;

    const errorMap = {
        'auth/email-already-in-use': 'authEmailInUse',
        'auth/invalid-email': 'authInvalidEmail',
        'auth/weak-password': 'authWeakPassword',
        'auth/user-not-found': 'authUserNotFound',
        'auth/wrong-password': 'authWrongPassword',
        'auth/invalid-credential': 'authInvalidCredential',
        'auth/too-many-requests': 'authTooManyRequests',
        'auth/popup-closed-by-user': 'authPopupClosed'
    };

    const translationKey = errorMap[errorCode];
    return translationKey && t[translationKey] ? t[translationKey] : errorCode;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Detect and apply system language
    const storedLang = localStorage.getItem('language');
    const currentLang = storedLang || detectSystemLanguage();
    applyTranslations(currentLang);

    const authLoading = document.getElementById('authLoading');
    const authContainer = document.getElementById('authContainer');
    const isLocalAuth = !!(window.sevenflowConfig && window.sevenflowConfig.localAuth);

    // Initialize auth manager
    if (window.SevenFlowPlugins) {
        window.SevenFlowPlugins.initAuth(authManager);
    }
    await authManager.init();

    // Check if already logged in
    authManager.onAuthChange((user) => {
        if (user) {
            // User is logged in - redirect to main app
            window.location.href = 'index.html';
        } else {
            // User is NOT logged in - hide splash and show login form
            authLoading.style.display = 'none';
            authContainer.style.display = 'flex';
        }
    });

    // Form toggle
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const backToLogin = document.getElementById('backToLogin');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    if (isLocalAuth) {
        const authDivider = document.querySelector('.auth-divider');
        if (authDivider) authDivider.style.display = 'none';
        if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
        if (showRegister) showRegister.closest('.auth-switch').style.display = 'none';
    }

    showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        resetPasswordForm.style.display = 'none';
        clearErrors();
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        resetPasswordForm.style.display = 'none';
        clearErrors();
    });

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        resetPasswordForm.style.display = 'block';
        clearErrors();

        // Pre-fill email if entered
        const loginEmail = document.getElementById('loginEmail').value;
        if (loginEmail) {
            document.getElementById('resetEmail').value = loginEmail;
        }
    });

    backToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        resetPasswordForm.style.display = 'none';
        loginForm.style.display = 'block';
        clearErrors();
    });

    // Login form
    const loginFormElement = document.getElementById('loginFormElement');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');

    loginFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const currentLang = localStorage.getItem('language') || 'en';
        const t = translations[currentLang];

        loginBtn.disabled = true;
        loginBtn.textContent = t.loggingIn;
        loginError.classList.remove('show');

        const result = await authManager.signIn(email, password);

        if (result.success) {
            // Will redirect via onAuthChange
            // Save language preference to Firestore on first login
            localStorage.setItem('sevenflow_language', currentLang);
        } else {
            loginError.textContent = getTranslatedError(result.error, currentLang);
            loginError.classList.add('show');
            loginBtn.disabled = false;
            loginBtn.textContent = t.login;
        }
    });

    // Register form
    const registerFormElement = document.getElementById('registerFormElement');
    const registerBtn = document.getElementById('registerBtn');
    const registerError = document.getElementById('registerError');

    registerFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
        const currentLang = localStorage.getItem('language') || 'en';
        const t = translations[currentLang];

        registerError.classList.remove('show');

        // Validate passwords match
        if (password !== passwordConfirm) {
            registerError.textContent = t.passwordMismatch;
            registerError.classList.add('show');
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = t.creatingAccount;

        const result = await authManager.signUp(email, password);

        if (result.success) {
            // Will redirect via onAuthChange
            // Save language preference on registration
            localStorage.setItem('sevenflow_language', currentLang);
        } else {
            registerError.textContent = getTranslatedError(result.error, currentLang);
            registerError.classList.add('show');
            registerBtn.disabled = false;
            registerBtn.textContent = t.createAccount;
        }
    });

    if (window.SevenFlowPlugins) {
        window.SevenFlowPlugins.initAuthUI({
            authManager,
            loginForm,
            registerForm,
            loginFormElement,
            registerFormElement,
            loginError,
            registerError,
            currentLanguage: () => localStorage.getItem('language') || 'en',
            t: (key) => {
                const lang = localStorage.getItem('language') || 'en';
                return translations[lang] && translations[lang][key] ? translations[lang][key] : key;
            },
            getTranslatedError,
            applyTranslations: () => applyTranslations(localStorage.getItem('language') || 'en')
        });
    }

    // Reset Password form
    const resetPasswordFormElement = document.getElementById('resetPasswordFormElement');
    const resetBtn = document.getElementById('resetBtn');
    const resetError = document.getElementById('resetError');
    const resetSuccess = document.getElementById('resetSuccess');

    resetPasswordFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('resetEmail').value;
        const currentLang = localStorage.getItem('language') || 'en';
        const t = translations[currentLang];

        resetBtn.disabled = true;
        resetBtn.textContent = t.sendingReset;
        resetError.classList.remove('show');
        resetSuccess.classList.remove('show');

        const result = await authManager.resetPassword(email);

        if (result.success) {
            resetSuccess.textContent = t.resetEmailSent;
            resetSuccess.classList.add('show');
            resetBtn.disabled = false;
            resetBtn.textContent = t.sendResetLink;

            // Clear form
            document.getElementById('resetEmail').value = '';

            // Auto-redirect to login after 3 seconds
            setTimeout(() => {
                resetPasswordForm.style.display = 'none';
                loginForm.style.display = 'block';
                resetSuccess.classList.remove('show');
            }, 3000);
        } else {
            resetError.textContent = getTranslatedError(result.error, currentLang);
            resetError.classList.add('show');
            resetBtn.disabled = false;
            resetBtn.textContent = t.sendResetLink;
        }
    });

    function clearErrors() {
        loginError.classList.remove('show');
        registerError.classList.remove('show');
        resetError.classList.remove('show');
        resetSuccess.classList.remove('show');
    }
});
