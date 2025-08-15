# Firebase Functions Setup Guide

This guide will walk you through setting up Firebase Functions for the Piggybanks app authentication system.

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Firebase CLI
- A Firebase project

## Step 1: Install Firebase CLI

If you haven't already installed the Firebase CLI, run:

```bash
npm install -g firebase-tools
```

## Step 2: Initialize Firebase in Your Project

1. Navigate to your project root directory:
```bash
cd piggybanks-app
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase (if not already done):
```bash
firebase init
```

Select the following options:
- **Functions**: Configure and deploy Cloud Functions
- Choose your existing Firebase project or create a new one
- Select **JavaScript** as the language
- Choose **Yes** for ESLint (optional)
- Choose **Yes** to install dependencies

## Step 3: Configure Firebase Functions

### Environment Variables

Set up your environment variables for production:

```bash
firebase functions:config:set mongodb.uri="your_mongodb_connection_string"
firebase functions:config:set jwt.secret="your_super_secret_jwt_key"
```

For local development, create a `.runtimeconfig.json` file in the `functions` directory:

```json
{
  "mongodb": {
    "uri": "mongodb://localhost:27017/piggybanks"
  },
  "jwt": {
    "secret": "your-local-development-jwt-secret"
  }
}
```

**Important**: Add `.runtimeconfig.json` to your `.gitignore` file to keep secrets safe.

## Step 4: Install Dependencies

Navigate to the functions directory and ensure all dependencies are installed:

```bash
cd functions
npm install
```

The required dependencies are already listed in `package.json`:
- firebase-admin
- firebase-functions
- mongodb
- bcrypt
- jsonwebtoken
- cors
- express

## Step 5: Update Frontend Configuration

In `js/config.js`, update the API URLs:

```javascript
// For local development (Firebase emulator)
API_BASE_URL: 'http://localhost:5001/YOUR_PROJECT_ID/us-central1/auth'

// For production
API_BASE_URL: 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/auth'
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.

## Step 6: Test Locally with Firebase Emulator

1. Start the Firebase emulator:
```bash
firebase emulators:start --only functions
```

2. The functions will be available at:
```
http://localhost:5001/YOUR_PROJECT_ID/us-central1/auth
```

3. Test the endpoints:
- Health check: `GET /health`
- Register: `POST /register`
- Login: `POST /login`
- Logout: `POST /logout`
- Verify: `GET /verify`

## Step 7: Deploy to Firebase

When ready to deploy to production:

```bash
firebase deploy --only functions
```

Or deploy a specific function:

```bash
firebase deploy --only functions:auth
```

## Step 8: Firebase Console Configuration

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Functions** to see your deployed functions
4. Check **Logs** for any errors or debugging information

## Step 9: CORS Configuration

If you encounter CORS issues, ensure your domain is allowed. The current setup allows all origins with `cors({ origin: true })`. For production, you should restrict this:

```javascript
// In functions/index.js
const corsOptions = {
    origin: ['https://your-domain.com', 'http://localhost:3000'],
    credentials: true
};
app.use(cors(corsOptions));
```

## Step 10: Enable Required APIs

In the Firebase Console, ensure these APIs are enabled:
1. Cloud Functions API
2. Cloud Build API (for deployments)

## API Endpoints

Your Firebase Functions provide these endpoints:

### Authentication Endpoints

| Method | Endpoint | Description | Required Fields |
|--------|----------|-------------|-----------------|
| POST | `/register` | Register a parent account | name, email, password |
| POST | `/login` | Login (parent or child) | email & password OR username & pin |
| POST | `/logout` | Logout current user | Authorization header |
| GET | `/verify` | Verify token validity | Authorization header |
| POST | `/create-child` | Create child account | name, username, pin |
| GET | `/children` | Get parent's children | Authorization header |

### Request Examples

#### Register Parent
```javascript
fetch('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'securepassword123'
    })
});
```

#### Parent Login
```javascript
fetch('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'john@example.com',
        password: 'securepassword123'
    })
});
```

#### Child Login
```javascript
fetch('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        username: 'johnny',
        pin: '1234'
    })
});
```

## Troubleshooting

### Common Issues

1. **Function deployment fails**
   - Check Node.js version (must be 18+)
   - Ensure all dependencies are installed
   - Check Firebase project permissions

2. **CORS errors**
   - Verify CORS configuration in functions
   - Check if frontend URL is allowed
   - Ensure proper headers are set

3. **Authentication fails**
   - Verify MongoDB connection
   - Check JWT secret configuration
   - Ensure tokens are properly stored/sent

4. **MongoDB connection issues**
   - Verify connection string
   - Check network access (whitelist IPs in MongoDB Atlas)
   - Ensure database user has proper permissions

### Viewing Logs

```bash
# View function logs
firebase functions:log

# View last 50 entries
firebase functions:log --only auth -n 50

# Stream logs in real-time
firebase functions:log --only auth --stream
```

## Security Best Practices

1. **Environment Variables**: Never commit secrets to version control
2. **JWT Secret**: Use a strong, random secret for production
3. **HTTPS Only**: Always use HTTPS in production
4. **Rate Limiting**: Consider implementing rate limiting for auth endpoints
5. **Input Validation**: Always validate and sanitize user input
6. **Token Expiry**: Consider implementing token refresh mechanism

## Project Structure

```
piggybanks-app/
├── functions/
│   ├── index.js          # Main Firebase Functions file
│   ├── package.json      # Dependencies
│   └── .runtimeconfig.json  # Local env config (gitignored)
├── js/
│   ├── config.js         # Frontend configuration
│   ├── auth.js           # Authentication module
│   ├── login.js          # Login page logic
│   ├── register.js       # Registration logic
│   └── dashboard.js      # Dashboard logic
└── firebase.json         # Firebase configuration
```

## Next Steps

1. Set up MongoDB (see MONGODB_SETUP.md)
2. Configure production environment variables
3. Test all authentication flows
4. Implement additional features (transactions, goals, etc.)
5. Set up monitoring and alerts

## Support

For issues or questions:
1. Check Firebase Functions documentation: https://firebase.google.com/docs/functions
2. Review error logs in Firebase Console
3. Test endpoints with tools like Postman or curl

Remember to always test thoroughly in the emulator before deploying to production!