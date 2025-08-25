// MongoDB connection and collections setup with connection reuse
const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let collections = null;
let indexesCreated = false;
let connectionPromise = null;

async function connect(mongoUri) {
  if (db && collections) return { db, ...collections };
  if (connectionPromise) return connectionPromise;
  if (!mongoUri) throw new Error('MONGODB_URI is not configured');

  connectionPromise = (async () => {
    client = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db();

    const users = db.collection('users');
    const blacklistedTokens = db.collection('blacklistedTokens');
    const withdrawalRequests = db.collection('withdrawalRequests');
    const transferRequests = db.collection('transferRequests');
    const moneyAdditionRequests = db.collection('moneyAdditionRequests');

    if (!indexesCreated) {
      await Promise.all([
        users.createIndex({ email: 1 }, { unique: true, sparse: true }),
        users.createIndex({ username: 1 }, { unique: true, sparse: true }),
        blacklistedTokens.createIndex({ token: 1 }, { unique: true }),
        withdrawalRequests.createIndex({ userId: 1, createdAt: -1 }),
        transferRequests.createIndex({ fromUserId: 1, createdAt: -1 }),
        moneyAdditionRequests.createIndex({ userId: 1, createdAt: -1 }),
      ]);
      indexesCreated = true;
    }

    collections = { users, blacklistedTokens, withdrawalRequests, transferRequests, moneyAdditionRequests };
    console.log('[DB] Connected and indexes ensured');

    return { db, ...collections };
  })();

  return connectionPromise;
}

module.exports = { connect };

