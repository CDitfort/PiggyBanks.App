// Configuration for the Piggybanks app
const CONFIG = {
    // Firebase Functions URL - Update this with your actual Firebase Functions URL
    // For local development with Firebase emulator: http://localhost:5001/YOUR_PROJECT_ID/us-central1/auth
    // For production: https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/auth
    API_BASE_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:5001/piggybanks-app/us-central1/auth'
        : 'https://us-central1-piggybanks-app.cloudfunctions.net/auth',
    
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