// Authentication module for Piggybanks app
const Auth = (function() {
    'use strict';
    
    // Request deduplication tracking
    const pendingRequests = new Map();
    const requestIdHeader = 'X-Request-ID';
    
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
            console.log(`[Auth] Duplicate request detected, waiting for existing: ${requestKey}`);
            return pendingRequests.get(requestKey);
        }
        
        // Generate request ID for tracking
        const requestId = generateRequestId();
        
        // Create the request promise
        const requestPromise = (async () => {
            const token = getToken();
            const headers = {
                'Content-Type': 'application/json',
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
            
            console.log(`[Auth] API Request [${requestId}]:`, {
                endpoint,
                method,
                hasBody: !!body,
                hasToken: !!token
            });
            
            try {
                const startTime = Date.now();
                const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, fetchOptions);
                const data = await response.json();
                const duration = Date.now() - startTime;
                
                console.log(`[Auth] API Response [${requestId}]:`, {
                    status: response.status,
                    duration: `${duration}ms`,
                    success: response.ok
                });
                
                if (!response.ok) {
                    throw new Error(data.error || 'Request failed');
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
        async register(name, email, password) {
            try {
                const result = await makeAuthRequest('/register', 'POST', {
                    name,
                    email,
                    password
                });
                
                if (result.success) {
                    storeAuthData(result.token, result.user);
                    return { success: true, message: result.message };
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
                console.log('[Auth] Parent login attempt for:', email);
                const result = await makeAuthRequest('/login', 'POST', {
                    email,
                    password
                });
                
                if (result.success) {
                    storeAuthData(result.token, result.user);
                    console.log('[Auth] Parent login successful');
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
                console.log('[Auth] Child login attempt for:', username);
                const result = await makeAuthRequest('/login', 'POST', {
                    username,
                    pin
                });
                
                if (result.success) {
                    storeAuthData(result.token, result.user);
                    console.log('[Auth] Child login successful');
                    return { success: true, message: result.message };
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
        async createChild(name, username, pin) {
            try {
                const result = await makeAuthRequest('/create-child', 'POST', {
                    name,
                    username,
                    pin
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
            console.log('[Auth] Public page detected, skipping token verification');
            return;
        }
        
        // For protected pages, verify authentication
        if (Auth.isAuthenticated()) {
            console.log('[Auth] Protected page detected, verifying token...');
            const isValid = await Auth.verifyToken();
            if (!isValid) {
                console.log('[Auth] Token invalid, redirecting to login');
                window.location.href = CONFIG.ROUTES.LOGIN;
            } else {
                console.log('[Auth] Token verified successfully');
            }
        } else {
            console.log('[Auth] No authentication found on protected page, redirecting to login');
            window.location.href = CONFIG.ROUTES.LOGIN;
        }
    }
})();