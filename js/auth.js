// Firebase Authentication Handler

class AuthManager {
    constructor() {
        this.auth = null;
        this.currentUser = null;
        this.onAuthChangeCallback = null;
        this.authProviders = {};
    }

    async init() {
        if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
            const token = localStorage.getItem('sevenflow_local_token') || '';
            if (token) {
                try {
                    const response = await fetch('/local-api/session', {
                        headers: { authorization: `Bearer ${token}` }
                    });
                    const data = await response.json().catch(() => ({}));
                    this.currentUser = response.ok ? this.createLocalUser(data.user, token) : null;
                } catch (error) {
                    this.currentUser = null;
                }
            }
            return Promise.resolve();
        }

        const { auth } = await initFirebase();
        this.auth = auth;

        const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

        // Simple and reliable: wrap onAuthStateChanged in a promise.
        // Firebase guarantees that after setPersistence + onAuthStateChanged,
        // the FIRST callback reflects the persisted state — but only if
        // setPersistence was awaited beforehand (which initFirebase does).
        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                // Resolve on first call — at this point persistence is already set
                // so this value is authoritative.
                unsubscribe();
                resolve();
            });
        }).then(() => {
            // Now re-register as a permanent listener for subsequent changes
            onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                if (this.onAuthChangeCallback) {
                    this.onAuthChangeCallback(user);
                }
            });
        });
    }

    onAuthChange(callback) {
        this.onAuthChangeCallback = callback;
        // init() is done, currentUser is authoritative
        callback(this.currentUser);
    }

    registerAuthProvider(id, provider) {
        if (!id || !provider || typeof provider.signIn !== 'function') return;
        this.authProviders[id] = provider;
    }

    async signInWithProvider(id) {
        const provider = this.authProviders[id];
        if (!provider) {
            return { success: false, error: 'auth/operation-not-allowed' };
        }
        return provider.signIn(this);
    }

    createLocalUser(user, token) {
        return {
            uid: user && user.uid ? user.uid : 'local-user',
            email: user && user.email ? user.email : 'local@sevenflow.test',
            displayName: user && user.displayName ? user.displayName : 'Local User',
            getIdToken: async () => token
        };
    }

    async signUp(email, password) {
        if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
            void email;
            void password;
            return { success: false, error: 'auth/operation-not-allowed' };
        }

        const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        try {
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.code };
        }
    }

    async signIn(email, password) {
        if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
            try {
                const response = await fetch('/local-api/login', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    return { success: false, error: data.error || 'auth/invalid-credential' };
                }

                localStorage.setItem('sevenflow_local_token', data.token);
                this.currentUser = this.createLocalUser(data.user, data.token);
                if (this.onAuthChangeCallback) this.onAuthChangeCallback(this.currentUser);
                return { success: true, user: this.currentUser };
            } catch (error) {
                return { success: false, error: 'auth/network-request-failed' };
            }
        }

        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        try {
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.code };
        }
    }

    async signOut() {
        if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
            localStorage.removeItem('sevenflow_local_token');
            this.currentUser = null;
            if (this.onAuthChangeCallback) this.onAuthChangeCallback(null);
            return { success: true };
        }

        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        try {
            await signOut(this.auth);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async resetPassword(email) {
        if (window.sevenflowConfig && window.sevenflowConfig.localAuth) {
            void email;
            return { success: false, error: 'auth/operation-not-allowed' };
        }

        const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        try {
            await sendPasswordResetEmail(this.auth, email);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.code };
        }
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// Global instance
window.authManager = new AuthManager();
