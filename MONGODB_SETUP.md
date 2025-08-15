# MongoDB Setup Guide

This guide will walk you through setting up MongoDB for the Piggybanks app authentication and data storage system.

## Table of Contents
1. [MongoDB Options](#mongodb-options)
2. [MongoDB Atlas Setup (Recommended)](#mongodb-atlas-setup-recommended)
3. [Local MongoDB Setup](#local-mongodb-setup)
4. [Database Schema](#database-schema)
5. [Connection Configuration](#connection-configuration)
6. [Security Best Practices](#security-best-practices)

## MongoDB Options

You have two main options for MongoDB:

1. **MongoDB Atlas** (Cloud - Recommended for production)
   - Managed cloud database
   - Free tier available
   - Automatic backups
   - Built-in security features

2. **Local MongoDB** (For development)
   - Full control
   - No internet required
   - Good for development/testing

## MongoDB Atlas Setup (Recommended)

### Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account
3. Verify your email

### Step 2: Create a Cluster

1. Click **"Build a Database"**
2. Choose **FREE** tier (M0 Sandbox)
3. Select your preferred cloud provider (AWS, Google Cloud, or Azure)
4. Choose a region closest to your Firebase Functions region
5. Name your cluster (e.g., "piggybanks-cluster")
6. Click **"Create"**

### Step 3: Set Up Database Access

1. Go to **Database Access** in the left sidebar
2. Click **"Add New Database User"**
3. Choose **Password** authentication
4. Create a username and strong password
5. Set user privileges to **"Read and write to any database"**
6. Click **"Add User"**

Save these credentials securely - you'll need them for the connection string.

### Step 4: Configure Network Access

1. Go to **Network Access** in the left sidebar
2. Click **"Add IP Address"**
3. For development: Add your current IP
4. For production with Firebase Functions:
   - Click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - Or better: Add specific Firebase Functions IP ranges

### Step 5: Get Connection String

1. Go to **Database** in the left sidebar
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Select **Node.js** and version **4.1 or later**
5. Copy the connection string

Your connection string will look like:
```
mongodb+srv://<username>:<password>@cluster-name.xxxxx.mongodb.net/<database>?retryWrites=true&w=majority
```

Replace:
- `<username>` with your database username
- `<password>` with your database password
- `<database>` with `piggybanks`

### Step 6: Configure in Firebase Functions

Set the MongoDB URI in Firebase Functions config:

```bash
firebase functions:config:set mongodb.uri="mongodb+srv://username:password@cluster-name.xxxxx.mongodb.net/piggybanks?retryWrites=true&w=majority"
```

## Local MongoDB Setup

### Step 1: Install MongoDB

#### Windows
1. Download MongoDB Community Server from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
2. Run the installer
3. Choose **"Complete"** installation
4. Install MongoDB as a Windows Service

#### macOS
```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

#### Linux (Ubuntu/Debian)
```bash
# Import public key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Create list file
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

### Step 2: Verify Installation

```bash
# Check if MongoDB is running
mongo --version

# Connect to MongoDB
mongosh
```

### Step 3: Create Database and User (Optional)

```javascript
// In MongoDB shell
use piggybanks

db.createUser({
  user: "piggybanks_user",
  pwd: "your_secure_password",
  roles: [
    { role: "readWrite", db: "piggybanks" }
  ]
})
```

### Step 4: Local Connection String

For local development without authentication:
```
mongodb://localhost:27017/piggybanks
```

With authentication:
```
mongodb://piggybanks_user:your_secure_password@localhost:27017/piggybanks
```

## Database Schema

The Piggybanks app uses the following collections:

### Users Collection

```javascript
{
  _id: ObjectId,
  name: String,
  email: String,           // Only for parents
  username: String,        // Unique for all users
  password: String,        // Hashed - for parents
  pin: String,            // Hashed - for children
  role: String,           // "parent" or "child"
  parentId: ObjectId,     // Reference to parent (for children)
  children: [ObjectId],   // Array of child IDs (for parents)
  savings: Number,        // Current balance (for children)
  goals: Array,           // Savings goals (for children)
  transactions: Array,    // Transaction history
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Blacklisted Tokens Collection

```javascript
{
  _id: ObjectId,
  token: String,          // JWT token
  userId: ObjectId,       // User who logged out
  createdAt: Date        // TTL index for auto-deletion
}
```

### Indexes

The application automatically creates these indexes:

```javascript
// Users collection
db.users.createIndex({ email: 1 }, { unique: true, sparse: true })
db.users.createIndex({ username: 1 }, { unique: true })

// Blacklisted tokens collection (auto-expire after 30 days)
db.blacklistedTokens.createIndex(
  { createdAt: 1 }, 
  { expireAfterSeconds: 2592000 }
)
```

## Connection Configuration

### Environment Variables

Create different connection strings for different environments:

#### Development (.env or .runtimeconfig.json)
```json
{
  "mongodb": {
    "uri": "mongodb://localhost:27017/piggybanks"
  }
}
```

#### Production (Firebase Config)
```bash
firebase functions:config:set mongodb.uri="your_production_mongodb_uri"
```

### Connection Options

Recommended connection options for production:

```javascript
const MongoClient = require('mongodb').MongoClient;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,           // Connection pool size
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

MongoClient.connect(uri, options);
```

## Testing the Connection

Create a test script to verify your MongoDB connection:

```javascript
// test-connection.js
const { MongoClient } = require('mongodb');

const uri = 'your_mongodb_connection_string';

async function testConnection() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB');
    
    const db = client.db('piggybanks');
    const collections = await db.listCollections().toArray();
    console.log('📁 Collections:', collections.map(c => c.name));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.close();
  }
}

testConnection();
```

Run the test:
```bash
node test-connection.js
```

## Security Best Practices

### 1. Connection String Security
- **Never** commit connection strings to version control
- Use environment variables or secure configuration services
- Rotate credentials regularly

### 2. Network Security
- Use IP whitelisting when possible
- Enable SSL/TLS connections (default in MongoDB Atlas)
- Use VPC peering for production deployments

### 3. Authentication & Authorization
- Create specific database users with minimal required permissions
- Use strong, unique passwords
- Enable MongoDB authentication even for local development

### 4. Data Protection
- Enable encryption at rest (automatic in MongoDB Atlas)
- Regular backups (automatic in MongoDB Atlas)
- Implement field-level encryption for sensitive data

### 5. Monitoring
- Enable audit logs
- Set up alerts for unusual activity
- Monitor connection pool usage
- Track slow queries

## Backup and Recovery

### MongoDB Atlas (Automatic)
- Automated backups included in M10+ clusters
- Manual snapshots available
- Point-in-time recovery

### Local MongoDB
```bash
# Backup
mongodump --db piggybanks --out /backup/path

# Restore
mongorestore --db piggybanks /backup/path/piggybanks
```

## Common Issues and Solutions

### Issue 1: Connection Timeout
**Error**: `MongoServerSelectionError: connection timed out`

**Solutions**:
- Check network access settings in MongoDB Atlas
- Verify IP whitelist includes your current IP
- Check if MongoDB service is running (local)

### Issue 2: Authentication Failed
**Error**: `MongoServerError: Authentication failed`

**Solutions**:
- Verify username and password
- Check database user permissions
- Ensure correct database name in connection string

### Issue 3: Connection Pool Exhausted
**Error**: `MongoError: connection pool exhausted`

**Solutions**:
- Increase maxPoolSize in connection options
- Ensure proper connection closure
- Check for connection leaks in code

### Issue 4: SSL Certificate Error
**Error**: `MongoServerSelectionError: SSL peer certificate validation failed`

**Solutions**:
- Update Node.js and MongoDB driver
- For development only: Add `?tls=false` to connection string
- Ensure system time is correct

## Performance Optimization

### 1. Indexing Strategy
```javascript
// Create indexes for frequently queried fields
db.users.createIndex({ email: 1 })
db.users.createIndex({ username: 1 })
db.users.createIndex({ parentId: 1 })
db.transactions.createIndex({ userId: 1, createdAt: -1 })
```

### 2. Query Optimization
- Use projections to limit returned fields
- Implement pagination for large result sets
- Use aggregation pipeline for complex queries

### 3. Connection Pooling
- Reuse database connections
- Configure appropriate pool size
- Monitor pool metrics

## Monitoring Commands

### MongoDB Atlas
- Use built-in monitoring dashboard
- Set up alerts for key metrics

### Local MongoDB
```javascript
// Check database stats
db.stats()

// Check collection stats
db.users.stats()

// View current operations
db.currentOp()

// Check index usage
db.users.getIndexes()
```

## Next Steps

1. ✅ Set up MongoDB (Atlas or local)
2. ✅ Configure connection string in Firebase Functions
3. ✅ Test the connection
4. ✅ Verify collections and indexes are created
5. 🔄 Test authentication flow
6. 📊 Set up monitoring and alerts
7. 🔒 Review security settings

## Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Node.js Driver](https://mongodb.github.io/node-mongodb-native/)
- [MongoDB University](https://university.mongodb.com/) - Free courses
- [MongoDB Compass](https://www.mongodb.com/products/compass) - GUI for MongoDB

## Support

For MongoDB-specific issues:
1. Check MongoDB logs
2. Use MongoDB Compass for visual debugging
3. MongoDB Community Forums: https://www.mongodb.com/community/forums/
4. Stack Overflow MongoDB tag: https://stackoverflow.com/questions/tagged/mongodb

Remember to always use appropriate security measures when dealing with production databases!