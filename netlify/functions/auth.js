// Netlify wrapper that reuses the shared Express app
const serverless = require('serverless-http');
const { createApp } = require('../../backend/app');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const app = createApp({ mongoUri: MONGODB_URI, jwtSecret: JWT_SECRET });

module.exports.handler = serverless(app);

