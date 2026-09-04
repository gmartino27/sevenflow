(function () {
    if (typeof translations !== 'undefined') {
        Object.assign(translations.de, {
            loginWithGoogle: 'Mit Google anmelden',
            registerWithGoogle: 'Mit Google registrieren'
        });
        Object.assign(translations.en, {
            loginWithGoogle: 'Login with Google',
            registerWithGoogle: 'Register with Google'
        });
    }

    function googleIconSvg() {
        return `
            <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
        `;
    }

    function createGoogleButton(id, label) {
        const button = document.createElement('button');
        button.className = 'auth-btn google';
        button.id = id;
        button.type = 'button';
        button.innerHTML = `${googleIconSvg()}<span>${label}</span>`;
        return button;
    }

    function insertDividerAndButton(formElement, button) {
        if (!formElement || !formElement.parentElement) return;
        const divider = document.createElement('div');
        divider.className = 'auth-divider google-login-divider';
        divider.innerHTML = '<span data-i18n="orDivider">or</span>';
        formElement.insertAdjacentElement('afterend', divider);
        divider.insertAdjacentElement('afterend', button);
    }

    window.SevenFlowPlugins.register({
        id: 'google-login',
        initAuth(authManager) {
            authManager.registerAuthProvider('google-login', {
                async signIn(manager) {
                    if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
                        return { success: false, error: 'auth/operation-not-allowed' };
                    }
                    const { signInWithPopup, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                    try {
                        const provider = new GoogleAuthProvider();
                        const result = await signInWithPopup(manager.auth, provider);
                        return { success: true, user: result.user };
                    } catch (error) {
                        return { success: false, error: error.code };
                    }
                }
            });
        },
        initAuthUI(context) {
            if (!context || (window.sevenflowConfig && window.sevenflowConfig.localAuth)) return;
            const loginButton = createGoogleButton('googleSignInBtn', context.t('loginWithGoogle'));
            const registerButton = createGoogleButton('googleSignUpBtn', context.t('registerWithGoogle'));
            insertDividerAndButton(context.loginFormElement, loginButton);
            insertDividerAndButton(context.registerFormElement, registerButton);

            const handleGoogleSignIn = async () => {
                const result = await context.authManager.signInWithProvider('google-login');
                if (!result.success) {
                    const errorEl = context.loginForm.style.display !== 'none' ? context.loginError : context.registerError;
                    errorEl.textContent = context.getTranslatedError(result.error, context.currentLanguage());
                    errorEl.classList.add('show');
                    return;
                }
                localStorage.setItem('sevenflow_language', context.currentLanguage());
            };

            loginButton.addEventListener('click', handleGoogleSignIn);
            registerButton.addEventListener('click', handleGoogleSignIn);
            context.applyTranslations();
        }
    });
})();
