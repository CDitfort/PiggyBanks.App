// Authentication module for Piggybanks app
const Auth = (function() {
    'use strict';
    
    // Request deduplication tracking
    const pendingRequests = new Map();
    const requestIdHeader = 'X-Request-ID';
    
    // reCAPTCHA v3 helpers
    const recaptchaState = {
        loading: null
    };
    
    function getRecaptchaSiteKey() {
        try {
            return (CONFIG && CONFIG.RECAPTCHA_SITE_KEY) ? String(CONFIG.RECAPTCHA_SITE_KEY).trim() : '';
        } catch (e) {
            return '';
        }
    }
    
    function ensureRecaptchaScriptLoaded() {
        const siteKey = getRecaptchaSiteKey();
        if (!siteKey) return null; // reCAPTCHA not configured
        if (recaptchaState.loading) return recaptchaState.loading;

        recaptchaState.loading = new Promise((resolve) => {
            // If grecaptcha is already available (standard or enterprise), resolve
            if (
                window.grecaptcha &&
                (
                    typeof window.grecaptcha.ready === 'function' ||
                    (window.grecaptcha.enterprise && typeof window.grecaptcha.enterprise.ready === 'function')
                )
            ) {
                return resolve();
            }

            const loadScript = (src, onDone) => {
                const tag = document.createElement('script');
                tag.src = src;
                tag.async = true;
                tag.defer = true;
                tag.setAttribute('data-recaptcha-loaded', 'true');
                tag.onload = onDone;
                tag.onerror = onDone; // resolve even on error to avoid blocking UX
                document.head.appendChild(tag);
            };

            // Try standard v3 first, then Enterprise fallback if needed
            loadScript(`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`, () => {
                const rc = window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha);
                if (rc && typeof rc.ready === 'function') {
                    return resolve();
                }
                // Fallback to Enterprise script
                loadScript(`https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`, () => resolve());
            });
        });
        return recaptchaState.loading;
    }
    
    async function getRecaptchaToken(action) {
        try {
            const siteKey = getRecaptchaSiteKey();
            if (!siteKey) return null;
            await ensureRecaptchaScriptLoaded();
            const rc = window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha);
            if (!rc || typeof rc.execute !== 'function' || typeof rc.ready !== 'function') {
                return null;
            }
            return await new Promise((resolve) => {
                rc.ready(() => {
                    rc.execute(siteKey, { action })
                        .then(token => resolve(token))
                        .catch(() => resolve(null));
                });
            });
        } catch (e) {
            return null;
        }
    }

    // Preload reCAPTCHA and show the v3 badge on page load
    async function preloadRecaptcha(action = 'pageview') {
        try {
            const siteKey = getRecaptchaSiteKey();
            if (!siteKey) return false;
            await ensureRecaptchaScriptLoaded();
            const rc = window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha);
            if (rc && typeof rc.ready === 'function') {
                // Execute once so the v3 badge appears immediately
                rc.ready(() => {
                    try {
                        rc.execute(siteKey, { action }).catch(() => {});
                    } catch (_) {}
                });
            }
            return true;
        } catch (_) {
            return false;
        }
    }
    
    // Private methods
    
    /**
     * Store authentication data in localStorage
     */
    function storeAuthData(token, user) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    }
    
    /**
     * Clear authentication data from localStorage
     */
    function clearAuthData() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
    }
    
    /**
     * Get stored authentication token
     */
    function getToken() {
        return localStorage.getItem(CONFIG.TOKEN_KEY);
    }
    
    /**
     * Get stored user data
     */
    function getUser() {
        const userStr = localStorage.getItem(CONFIG.USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    }
    
    /**
     * Generate a unique request ID
     */
    function generateRequestId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Make authenticated API request with deduplication
     */
    async function makeAuthRequest(endpoint, method = 'GET', body = null, options = {}) {
        // Create a request key for deduplication
        const requestKey = `${method}:${endpoint}:${JSON.stringify(body || {})}`;
        
        // Check if we have a pending request for the same operation
        if (!options.allowDuplicate && pendingRequests.has(requestKey)) {
            // Duplicate request detected
            return pendingRequests.get(requestKey);
        }
        
        // Generate request ID for tracking
        const requestId = generateRequestId();
        
        // Create the request promise
        const requestPromise = (async () => {
            const token = getToken();
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                [requestIdHeader]: requestId
            };
            
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const fetchOptions = {
                method,
                headers
            };
            
            if (body && method !== 'GET') {
                fetchOptions.body = JSON.stringify(body);
            }
            
            // console.log(`[Auth] API Request [${requestId}]:`, {
            //     endpoint,
            //     method,
            //     hasBody: !!body,
            //     hasToken: !!token
            // });
            
            try {
                const startTime = Date.now();
                const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, fetchOptions);

                // Check if response is ok before trying to parse
                if (!response.ok) {
                    console.error(`[Auth] HTTP Error [${requestId}]:`, {
                        status: response.status,
                        statusText: response.statusText,
                        url: response.url
                    });
                }
                // Safely parse JSON; handle empty or invalid JSON bodies gracefully
                let data;
                const text = await response.text();
                try {
                    data = text ? JSON.parse(text) : {};
                } catch (parseErr) {
                    console.error(`[Auth] JSON Parse Error [${requestId}] for ${endpoint}:`, {
                        error: parseErr.message,
                        responseText: text.substring(0, 200), // First 200 chars for debugging
                        status: response.status,
                        statusText: response.statusText,
                        contentType: response.headers.get('content-type')
                    });

                    // Check if this looks like an HTML error page
                    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                        data = { error: 'Server returned an error page. Please try again.' };
                    } else if (text.includes('unexpected token')) {
                        data = { error: 'Server response format error. Please try again.' };
                    } else {
                        data = { error: 'Unexpected response from server. Please try again.' };
                    }
                }
                const duration = Date.now() - startTime;

                // console.log(`[Auth] API Response [${requestId}]:`, {
                //     status: response.status,
                //     duration: `${duration}ms`,
                //     success: response.ok
                // });

                if (!response.ok) {
                    const msg = data && data.error ? data.error : (text || 'Request failed');
                    throw new Error(msg);
                }

                return data;
            } catch (error) {
                console.error(`[Auth] API Request failed [${requestId}]:`, error);
                throw error;
            } finally {
                // Remove from pending requests
                if (!options.allowDuplicate) {
                    pendingRequests.delete(requestKey);
                }
            }
        })();
        
        // Store in pending requests if deduplication is enabled
        if (!options.allowDuplicate) {
            pendingRequests.set(requestKey, requestPromise);
        }
        
        return requestPromise;
    }
    
    /**
     * Check if user is authenticated
     */
    function isAuthenticated() {
        return !!getToken();
    }
    
    /**
     * Redirect to dashboard if authenticated
     */
    function redirectIfAuthenticated() {
        if (isAuthenticated()) {
            window.location.href = CONFIG.ROUTES.DASHBOARD;
        }
    }
    
    /**
     * Redirect to login if not authenticated
     */
    function requireAuth() {
        if (!isAuthenticated()) {
            window.location.href = CONFIG.ROUTES.LOGIN;
        }
    }
    
    /**
     * Verify token with backend
     */
    async function verifyToken() {
        if (!isAuthenticated()) {
            return false;
        }
        
        try {
            const result = await makeAuthRequest('/verify');
            if (result.success && result.user) {
                storeAuthData(getToken(), result.user);
                return true;
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            clearAuthData();
        }
        
        return false;
    }
    
    // Public API
    return {
        /**
         * Register a new parent account
         */
        async register(name, email, password, securityQuestion, securityAnswer) {
            try {
                const recaptchaToken = await getRecaptchaToken('register');
                const result = await makeAuthRequest('/register', 'POST', {
                    name,
                    email,
                    password,
                    securityQuestion,
                    securityAnswer,
                    recaptchaToken
                });
                
                if (result.success) {
                    storeAuthData(result.token, result.user);
                    return { success: true, message: result.message, recoveryCode: result.recoveryCode };
                }
                
                return { success: false, error: result.error };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Login for parents (email + password) with deduplication
         */
        async loginParent(email, password) {
            try {
                // Parent login attempt
                const recaptchaToken = await getRecaptchaToken('login_parent');
                const result = await makeAuthRequest('/login', 'POST', {
                    email,
                    password,
                    role: 'parent',
                    recaptchaToken
                });
                
                if (result.success) {
                    storeAuthData(result.token, result.user);
                    // Login successful
                    return { success: true, message: result.message };
                }
                
                return { success: false, error: result.error };
            } catch (error) {
                console.error('[Auth] Parent login error:', error);
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Login for children (username + pin) with deduplication
         */
        async loginChild(username, pin) {
            try {
                // Child login attempt
                const recaptchaToken = await getRecaptchaToken('login_child');
                const result = await makeAuthRequest('/login', 'POST', {
                    username,
                    pin,
                    role: 'child',
                    recaptchaToken
                });

                if (result.success) {
                    storeAuthData(result.token, result.user);
                    // Login successful
                    return { success: true, message: result.message, user: result.user };
                }

                return { success: false, error: result.error };
            } catch (error) {
                console.error('[Auth] Child login error:', error);
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Logout current user
         */
        async logout() {
            try {
                const result = await makeAuthRequest('/logout', 'POST');
                clearAuthData();
                window.location.href = CONFIG.ROUTES.HOME;
                return { success: true };
            } catch (error) {
                // Clear local data even if server request fails
                clearAuthData();
                window.location.href = CONFIG.ROUTES.HOME;
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Create a child account (parent only)
         */
        async createChild(name, username, pin, initialBalance = 0) {
            try {
                const result = await makeAuthRequest('/create-child', 'POST', {
                    name,
                    username,
                    pin,
                    initialBalance
                });

                if (result.success) {
                    return { success: true, child: result.child };
                }

                return { success: false, error: result.error };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Get children for current parent
         */
        async getChildren() {
            try {
                const result = await makeAuthRequest('/children');
                
                if (result.success) {
                    return { success: true, children: result.children };
                }
                
                return { success: false, error: result.error };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        // Utility methods
        isAuthenticated,
        getToken,
        getUser,
        verifyToken,
        redirectIfAuthenticated,
        requireAuth,
        clearAuthData,

        // Recaptcha initializer for showing the v3 badge on page load
        preloadRecaptcha,
        
        // Expose request method for use by other modules
        request: makeAuthRequest
    };
})();

// Automatically verify token on page load - use immediate execution instead of DOMContentLoaded
// This prevents conflicts with page-specific DOMContentLoaded handlers
(function() {
    // Ensure DOM is ready before checking authentication
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verifyAuthOnLoad);
    } else {
        // DOM is already ready, execute immediately
        verifyAuthOnLoad();
    }
    
    async function verifyAuthOnLoad() {
        // Skip verification on public pages
        const currentPage = window.location.pathname;
        const publicPages = [CONFIG.ROUTES.LOGIN, CONFIG.ROUTES.REGISTER, CONFIG.ROUTES.HOME, '/', '/index.html', '/login.html', '/register.html'];

        // Check if current page is a public page
        const isPublicPage = publicPages.some(page => currentPage.endsWith(page));

        if (isPublicPage) {
            // Public page detected, skipping token verification
            return;
        }

        // For protected pages, verify authentication
        if (Auth.isAuthenticated()) {
            // console.log('[Auth] Protected page detected, verifying token...');
            const isValid = await Auth.verifyToken();
            if (!isValid) {
                // Token invalid, redirecting to login
                window.location.href = CONFIG.ROUTES.LOGIN;
            }
        } else {
            // No authentication found on protected page, redirecting to login
            window.location.href = CONFIG.ROUTES.LOGIN;
        }
    }
})();