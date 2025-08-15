// Authentication module for Piggybanks app
const Auth = (function() {
    'use strict';
    
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
     * Make authenticated API request
     */
    async function makeAuthRequest(endpoint, method = 'GET', body = null) {
        const token = getToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const options = {
            method,
            headers
        };
        
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, options);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
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
         * Login for parents (email + password)
         */
        async loginParent(email, password) {
            try {
                const result = await makeAuthRequest('/login', 'POST', {
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
         * Login for children (username + pin)
         */
        async loginChild(username, pin) {
            try {
                const result = await makeAuthRequest('/login', 'POST', {
                    username,
                    pin
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
        clearAuthData
    };
})();

// Automatically verify token on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Skip verification on login and register pages
    const currentPage = window.location.pathname;
    const publicPages = [CONFIG.ROUTES.LOGIN, CONFIG.ROUTES.REGISTER, CONFIG.ROUTES.HOME, '/'];
    
    if (!publicPages.includes(currentPage) && Auth.isAuthenticated()) {
        const isValid = await Auth.verifyToken();
        if (!isValid) {
            // Token is invalid, redirect to login
            window.location.href = CONFIG.ROUTES.LOGIN;
        }
    }
});