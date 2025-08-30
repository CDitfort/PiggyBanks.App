// Configuration for the Piggybanks app
// Auto-detect environment and set API base accordingly
const HOST = window.location.hostname;
const IS_LOCAL = HOST === '127.0.0.1' || HOST === 'localhost';

// Netlify Functions default paths
const DEFAULT_LOCAL_API = `http://localhost:8888/.netlify/functions/auth`;
const DEFAULT_PROD_API = `/.netlify/functions/auth`;

// Allow override from HTML before this script (e.g., window.PIGGYBANKS_API_BASE_URL = 'https://your-site.netlify.app/.netlify/functions/auth');
const SELECTED_API = window.PIGGYBANKS_API_BASE_URL || (IS_LOCAL ? DEFAULT_LOCAL_API : DEFAULT_PROD_API);

// reCAPTCHA site key (public)
// Prefer explicit window var, then meta tag <meta name="recaptcha-site-key" content="...">
const META_RECAPTCHA_SITE_KEY = (document.querySelector('meta[name="recaptcha-site-key"]')?.content || '').trim();
const WINDOW_RECAPTCHA_SITE_KEY = (window.PIGGYBANKS_RECAPTCHA_SITE_KEY || window.RECAPTCHA_SITE_KEY || '').toString().trim();
const SELECTED_RECAPTCHA_SITE_KEY = WINDOW_RECAPTCHA_SITE_KEY || META_RECAPTCHA_SITE_KEY;

const CONFIG = {
    API_BASE_URL: SELECTED_API,
    RECAPTCHA_SITE_KEY: SELECTED_RECAPTCHA_SITE_KEY,

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
if (CONFIG.RECAPTCHA_SITE_KEY) {
    // reCAPTCHA site key configured
} else {
    console.warn('[Config] reCAPTCHA site key is NOT configured');
}
