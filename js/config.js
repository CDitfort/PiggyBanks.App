// Configuration for the Piggybanks app
// Auto-detect environment (local emulator vs production on piggybanks.app) and set API base accordingly
const PROJECT_ID = 'piggybankapp-5681a';
const HOST = window.location.hostname;
const IS_LOCAL = HOST === '127.0.0.1' || HOST === 'localhost';
const IS_PROD_SITE = HOST === 'piggybanks.app' || HOST.endsWith('.piggybanks.app');

const DEFAULT_LOCAL_API = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/auth`;
const DEFAULT_PROD_API = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/auth`;

// Allow override from HTML before this script (e.g., window.PIGGYBANKS_API_BASE_URL = 'https://custom-api');
const SELECTED_API = window.PIGGYBANKS_API_BASE_URL || (IS_LOCAL ? DEFAULT_LOCAL_API : DEFAULT_PROD_API);
// If running on the piggybanks.app domain, prefer the production Cloud Functions URL
const FINAL_API_BASE = IS_PROD_SITE ? DEFAULT_PROD_API : SELECTED_API;
const CONFIG = {
    // Update to your backend API URL
    API_BASE_URL: FINAL_API_BASE,

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
