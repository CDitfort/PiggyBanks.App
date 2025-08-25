// Configuration for the Piggybanks app
// Auto-detect environment and set API base accordingly
const HOST = window.location.hostname;
const IS_LOCAL = HOST === '127.0.0.1' || HOST === 'localhost';

// Netlify Functions default paths
const DEFAULT_LOCAL_API = `http://localhost:8888/.netlify/functions/auth`;
const DEFAULT_PROD_API = `/.netlify/functions/auth`;

// Allow override from HTML before this script (e.g., window.PIGGYBANKS_API_BASE_URL = 'https://your-site.netlify.app/.netlify/functions/auth');
const SELECTED_API = window.PIGGYBANKS_API_BASE_URL || (IS_LOCAL ? DEFAULT_LOCAL_API : DEFAULT_PROD_API);
const CONFIG = {
    API_BASE_URL: SELECTED_API,

    // Local storage keys
    TOKEN_KEY: 'piggybanks_token',
    USER_KEY: 'piggybanks_user',

    // Routes
    ROUTES: {
        LOGIN: '/login.html',
        REGISTER: '/register.html',
        DASHBOARD: '/dashboard.html',
        HOME: '/index.html'
    }
};

// Expose globally and log for debugging
window.CONFIG = CONFIG;
console.log('[Config] API_BASE_URL:', CONFIG.API_BASE_URL);
