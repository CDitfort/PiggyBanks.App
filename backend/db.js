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
      // Safely ensure indexes exist without throwing on existing/conflicting names
      const createIndexSafe = async (coll, key, options = {}) => {
        try {
          await coll.createIndex(key, options);
        } catch (e) {
          if (
            e && (
              e.code === 86 || // IndexKeySpecsConflict
              e.code === 85 || // IndexOptionsConflict
              e.codeName === 'IndexKeySpecsConflict' ||
              e.codeName === 'IndexOptionsConflict' ||
              /existing index/i.test(e.message || '')
            )
          ) {
            console.warn('[DB] Skipping index creation due to existing/conflicting index:', options.name || JSON.stringify(key));
          } else {
            throw e;
          }
        }
      };

      const hasIndex = async (coll, keyObj) => {
        const indexList = await coll.indexes();
        const keyStr = JSON.stringify(keyObj);
        return indexList.some(ix => JSON.stringify(ix.key) === keyStr);
      };

      // For users, avoid duplicates by checking existing indexes first
      const userIndexes = await users.indexes();
      const hasUserIndex = (keyObj, unique) => {
        const keyStr = JSON.stringify(keyObj);
        return userIndexes.some(ix => JSON.stringify(ix.key) === keyStr && (!!ix.unique) === (!!unique));
      };

      if (!hasUserIndex({ email: 1 }, true)) {
        await createIndexSafe(users, { email: 1 }, { name: 'idx_users_email_unique', unique: true, sparse: true });
      }
      if (!hasUserIndex({ username: 1 }, true)) {
        await createIndexSafe(users, { username: 1 }, { name: 'idx_users_username_unique', unique: true, sparse: true });
      }

      // Other collections: only create if a matching key doesn't already exist
      if (!(await hasIndex(blacklistedTokens, { token: 1 }))) {
        await createIndexSafe(blacklistedTokens, { token: 1 }, { name: 'idx_blacklisted_tokens_token_unique', unique: true });
      }
      if (!(await hasIndex(withdrawalRequests, { userId: 1, createdAt: -1 }))) {
        await createIndexSafe(withdrawalRequests, { userId: 1, createdAt: -1 }, { name: 'idx_withdrawal_user_createdAt' });
      }
      if (!(await hasIndex(transferRequests, { fromUserId: 1, createdAt: -1 }))) {
        await createIndexSafe(transferRequests, { fromUserId: 1, createdAt: -1 }, { name: 'idx_transfer_from_createdAt' });
      }
      if (!(await hasIndex(moneyAdditionRequests, { userId: 1, createdAt: -1 }))) {
        await createIndexSafe(moneyAdditionRequests, { userId: 1, createdAt: -1 }, { name: 'idx_money_add_user_createdAt' });
      }

      indexesCreated = true;
    }

    collections = { users, blacklistedTokens, withdrawalRequests, transferRequests, moneyAdditionRequests };
    console.log('[DB] Connected and indexes ensured');

    return { db, ...collections };
  })();

  return connectionPromise;
}

module.exports = { connect };

