// Netlify wrapper that reuses the shared Express app
const express = require('express');
const serverless = require('serverless-http');
const { createApp } = require('../../backend/app');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Inner app has routes like '/login', '/register', etc.
const innerApp = createApp({ mongoUri: MONGODB_URI, jwtSecret: JWT_SECRET });

// Netlify invokes the function at '/.netlify/functions/auth/*'.
// Mount inner app at that base path so routes resolve correctly under Netlify.
// Also parse JSON at the outer level to ensure body is available to inner routes.
const outerApp = express();
// Let the inner app handle JSON/urlencoded parsing to avoid double-parsing under serverless
outerApp.use('/.netlify/functions/auth', innerApp);

module.exports.handler = serverless(outerApp);

