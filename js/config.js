// Configuration for the Piggybanks app
const CONFIG = {
    // Firebase Functions URL
    // Local emulator (when hostname is localhost or 127.0.0.1): http://localhost:5001/piggybankapp-5681a/us-central1/auth
    // Production: https://us-central1-piggybankapp-5681a.cloudfunctions.net/auth
    API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5001/piggybankapp-5681a/us-central1/auth'
        : 'https://us-central1-piggybankapp-5681a.cloudfunctions.net/auth',
    
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

// Freeze the configuration to prevent modifications
Object.freeze(CONFIG);