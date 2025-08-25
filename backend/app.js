// Shared Express app (no Firebase or Netlify-specific imports)
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // use bcryptjs for simpler serverless deploys
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { connect } = require('./db');

function createApp({ mongoUri, jwtSecret }) {
  if (!mongoUri) console.warn('[CONFIG] MONGODB_URI not set');
  if (!jwtSecret) console.warn('[CONFIG] JWT_SECRET not set');

  const app = express();

  // Request logging middleware
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();
    req.requestId = requestId;

    console.log(`[${requestId}] REQUEST START`, { method: req.method, url: req.originalUrl });

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] REQUEST END`, { statusCode: res.statusCode, durationMs: duration });
    });

    next();
  });

  app.use(cors({ origin: true }));
  app.use(express.json());

  // Preflight
  // Express 5 (path-to-regexp v6): use a named splat parameter to catch all paths
  app.options('/:path(*)', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-request-id');
    res.set('Access-Control-Max-Age', '86400');
    res.status(204).send('');
  });

  // Helpers
  function isValidEmail(email) { return /.+@.+\..+/.test(email); }
  function generateToken(user) {
    const payload = {
      id: user._id,
      role: user.role,
      email: user.email,
      username: user.username,
      name: user.name,
      parentId: user.parentId,
    };
    return jwtSecret ? jwt.sign(payload, jwtSecret, { expiresIn: '7d' }) : '';
  }
  async function verifyToken(req, res, next) {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (!token) return res.status(401).json({ error: 'No token provided' });

      const { blacklistedTokens } = await connect(mongoUri);
      const blacklisted = await blacklistedTokens.findOne({ token });
      if (blacklisted) return res.status(401).json({ error: 'Token has been revoked' });

      const decoded = jwt.verify(token, jwtSecret);
      req.user = decoded;
      next();
    } catch (err) {
      console.error(`[${req.requestId || 'no-id'}] Token verification error:`, err);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Health
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Registration (parent)
  app.post('/register', async (req, res) => {
    try {
      const { name, email, password, securityQuestion, securityAnswer } = req.body || {};
      const errors = [];
      if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters.');
      if (!email || !isValidEmail(email)) errors.push('A valid email is required.');
      if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
      if (!securityQuestion || securityQuestion.trim().length < 5) errors.push('Security question must be provided.');
      if (!securityAnswer || securityAnswer.trim().length < 2) errors.push('Security answer must be provided.');
      if (errors.length) return res.status(400).json({ error: errors.join(' ') });

      const { users } = await connect(mongoUri);
      const existing = await users.findOne({ email: email.toLowerCase(), role: 'parent' });
      if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        role: 'parent', name: name.trim(), email: email.toLowerCase(), password: hashedPassword,
        securityQuestion: securityQuestion.trim(), securityAnswer: securityAnswer.trim().toLowerCase(),
        createdAt: new Date(), lastLogin: null, children: []
      };
      const result = await users.insertOne(user);
      const token = generateToken({ ...user, _id: result.insertedId });
      res.json({ success: true, message: 'Registration successful', token, user: { id: result.insertedId, role: 'parent', name: user.name, email: user.email } });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  // Login
  app.post('/login', async (req, res) => {
    try {
      const { email, password, username, pin, role } = req.body || {};
      const { users } = await connect(mongoUri);
      let user = null;
      if (role === 'child') {
        if (!username || !pin) return res.status(400).json({ error: 'Username and PIN are required for child login' });
        user = await users.findOne({ username: username.toLowerCase(), role: 'child' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(pin, user.pin);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      } else {
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
        user = await users.findOne({ email: email.toLowerCase(), role: 'parent' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      }
      await users.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
      const token = generateToken(user);
      const publicUser = { id: user._id, role: user.role, name: user.name, email: user.email, username: user.username, savings: user.savings || 0, goals: user.goals || [], parentId: user.parentId };
      res.json({ success: true, token, user: publicUser });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Username availability (cache per instance)
  const USERNAME_CACHE_TTL_MS = 60_000;
  const usernameAvailabilityCache = new Map();
  app.get('/usernames/check', async (req, res) => {
    try {
      const username = (req.query.username || '').toLowerCase().trim();
      if (!username || username.length < 3) return res.json({ available: false, message: 'Username must be at least 3 characters' });
      const now = Date.now();
      const cached = usernameAvailabilityCache.get(username);
      if (cached && cached.expireAt > now) return res.json(cached.value);
      const { users } = await connect(mongoUri);
      const exists = await users.findOne({ username, role: 'child' }, { projection: { _id: 1 } });
      const value = exists ? { available: false, message: 'Username is taken' } : { available: true };
      usernameAvailabilityCache.set(username, { value, expireAt: now + USERNAME_CACHE_TTL_MS });
      return res.json(value);
    } catch (error) {
      console.error('Username check error:', error);
      return res.json({ available: false, message: 'Unable to check availability right now' });
    }
  });

  // Get parent's children
  app.get('/children', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can view children accounts' });
      const { users } = await connect(mongoUri);
      const children = await users.find({ parentId: req.user.id }, { projection: { password: 0, pin: 0 } }).toArray();
      res.json({ success: true, children: children.map(c => ({ id: c._id, name: c.name, username: c.username, savings: c.savings || 0, goalsCount: (c.goals || []).length, lastLogin: c.lastLogin })) });
    } catch (error) {
      console.error('Get children error:', error);
      res.status(500).json({ error: 'Failed to fetch children' });
    }
  });

  // Delete child (parent)
  app.delete('/children/:childId', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can delete child accounts' });
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(req.params.childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'You can only delete your own children' });
      await users.deleteOne({ _id: childObjectId });
      await users.updateOne({ _id: new ObjectId(req.user.id) }, { $pull: { children: childObjectId } });
      res.json({ success: true, message: 'Child account deleted' });
    } catch (error) {
      console.error('Delete child error:', error);
      res.status(500).json({ error: 'Failed to delete child account' });
    }
  });

  // Update child PIN (parent)
  app.put('/children/:childId/pin', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can update child PINs' });
      const { pin } = req.body || {};
      if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
      const pinCounts = {}; for (const ch of pin) pinCounts[ch] = (pinCounts[ch] || 0) + 1; if (Object.values(pinCounts).some(c => c > 2)) return res.status(400).json({ error: 'PIN cannot contain any digit more than twice' });
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(req.params.childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'You can only update PINs for your own children' });
      const hashedPin = await bcrypt.hash(pin, 10);
      await users.updateOne({ _id: childObjectId }, { $set: { pin: hashedPin, updatedAt: new Date() } });
      res.json({ success: true, message: 'Child PIN updated' });
    } catch (error) {
      console.error('Update child PIN error:', error);
      res.status(500).json({ error: 'Failed to update child PIN' });
    }
  });

  // Transactions
  app.get('/transactions/:childId', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const childId = req.params.childId;
      const childObjectId = new ObjectId(childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (req.user.role === 'child' && String(req.user.id) !== String(childId)) return res.status(403).json({ error: 'Access denied' });
      if (req.user.role === 'parent' && String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Access denied' });
      const transactions = (child.transactions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ success: true, transactions });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  });

  app.post('/transactions', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can add transactions' });
      const { childId, amount, description, type = 'deposit' } = req.body;
      const amt = parseFloat(amount);
      if (!childId || !amount || isNaN(amt)) return res.status(400).json({ error: 'Invalid transaction data' });
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'You can only add transactions for your own children' });
      const sign = type === 'withdrawal' ? -1 : 1;
      const newBalance = (child.savings || 0) + sign * amt;
      if (newBalance < 0) return res.status(400).json({ error: 'Insufficient funds' });
      const transaction = { id: new ObjectId(), type, amount: amt, description: description || (type === 'deposit' ? 'Deposit' : 'Withdrawal'), createdAt: new Date(), userId: req.user.id };
      await users.updateOne({ _id: childObjectId }, { $set: { savings: newBalance, updatedAt: new Date() }, $push: { transactions: transaction } });
      res.json({ success: true, transaction, newBalance });
    } catch (error) {
      console.error('Add transaction error:', error);
      res.status(500).json({ error: 'Failed to add transaction' });
    }
  });

  // Siblings
  app.get('/siblings', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'child') return res.status(403).json({ error: 'Only children can fetch siblings' });
      const { users } = await connect(mongoUri);
      const siblings = await users.find({ parentId: req.user.parentId, role: 'child' }, { projection: { password: 0, pin: 0 } }).toArray();
      const list = siblings.filter(c => String(c._id) !== String(req.user.id)).map(c => ({ id: c._id, name: c.name, username: c.username, savings: c.savings || 0 }));
      res.json({ success: true, siblings: list });
    } catch (error) {
      console.error('Get siblings error:', error);
      res.status(500).json({ error: 'Failed to load siblings' });
    }
  });

  // Child preferences
  app.put('/children/me/preferences', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'child') return res.status(403).json({ error: 'Only children can update their own preferences' });
      const { backgroundColor } = req.body || {};
      const { users } = await connect(mongoUri);
      const updates = { updatedAt: new Date() };
      if (backgroundColor) updates['preferences.backgroundColor'] = backgroundColor;
      const result = await users.updateOne({ _id: new ObjectId(req.user.id) }, { $set: updates });
      res.json({ success: true, message: 'Preferences updated', modifiedCount: result.modifiedCount });
    } catch (error) {
      console.error('Update preferences error:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  // Requests: withdrawal, money-addition, transfers
  app.post('/withdrawal-requests', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'child') return res.status(403).json({ error: 'Only children can create withdrawal requests' });
      const { amount, reason } = req.body || {};
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const { withdrawalRequests } = await connect(mongoUri);
      const doc = { userId: new ObjectId(req.user.id), parentId: new ObjectId(req.user.parentId), amount: amt, reason: reason || '', status: 'pending', type: 'withdrawal', createdAt: new Date(), updatedAt: new Date() };
      const r = await withdrawalRequests.insertOne(doc);
      res.json({ success: true, id: r.insertedId });
    } catch (error) { console.error('Create withdrawal request error:', error); res.status(500).json({ error: 'Failed to create request' }); }
  });

  app.post('/money-addition-requests', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'child') return res.status(403).json({ error: 'Only children can create money addition requests' });
      const { amount, reason } = req.body || {};
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const { moneyAdditionRequests } = await connect(mongoUri);
      const doc = { userId: new ObjectId(req.user.id), parentId: new ObjectId(req.user.parentId), amount: amt, reason: reason || '', status: 'pending', type: 'addition', createdAt: new Date(), updatedAt: new Date() };
      const r = await moneyAdditionRequests.insertOne(doc);
      res.json({ success: true, id: r.insertedId });
    } catch (error) { console.error('Create money addition request error:', error); res.status(500).json({ error: 'Failed to create request' }); }
  });

  app.get('/withdrawal-requests', verifyToken, async (req, res) => {
    try {
      const { withdrawalRequests } = await connect(mongoUri);
      let filter;
      if (req.user.role === 'child') filter = { userId: new ObjectId(req.user.id) };
      else filter = { parentId: new ObjectId(req.user.id) };
      const list = await withdrawalRequests.find(filter).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, requests: list });
    } catch (error) { console.error('Get withdrawal requests error:', error); res.status(500).json({ error: 'Failed to load withdrawal requests' }); }
  });

  app.get('/money-addition-requests', verifyToken, async (req, res) => {
    try {
      const { moneyAdditionRequests } = await connect(mongoUri);
      let filter;
      if (req.user.role === 'child') filter = { userId: new ObjectId(req.user.id) };
      else filter = { parentId: new ObjectId(req.user.id) };
      const list = await moneyAdditionRequests.find(filter).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, requests: list });
    } catch (error) { console.error('Get money addition requests error:', error); res.status(500).json({ error: 'Failed to load money addition requests' }); }
  });

  app.post('/withdrawal-requests/:id/approve', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can approve withdrawal requests' });
      const { users, withdrawalRequests } = await connect(mongoUri);
      const _id = new ObjectId(req.params.id);
      const reqDoc = await withdrawalRequests.findOne({ _id });
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const child = await users.findOne({ _id: reqDoc.userId });
      if (!child || String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      if ((child.savings || 0) < reqDoc.amount) return res.status(400).json({ error: 'Insufficient funds' });
      const newBalance = (child.savings || 0) - reqDoc.amount;
      const transaction = { id: new ObjectId(), type: 'withdrawal', amount: reqDoc.amount, description: reqDoc.reason || 'Withdrawal approved', createdAt: new Date(), userId: req.user.id };
      await users.updateOne({ _id: child._id }, { $set: { savings: newBalance, updatedAt: new Date() }, $push: { transactions: transaction } });
      await withdrawalRequests.updateOne({ _id }, { $set: { status: 'approved', updatedAt: new Date() } });
      res.json({ success: true });
    } catch (error) { console.error('Approve withdrawal error:', error); res.status(500).json({ error: 'Failed to approve request' }); }
  });

  app.post('/withdrawal-requests/:id/reject', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can reject withdrawal requests' });
      const { reason } = req.body || {};
      const { withdrawalRequests } = await connect(mongoUri);
      const _id = new ObjectId(req.params.id);
      const reqDoc = await withdrawalRequests.findOne({ _id });
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      await withdrawalRequests.updateOne({ _id }, { $set: { status: 'rejected', reason: reason || '', updatedAt: new Date() } });
      res.json({ success: true });
    } catch (error) { console.error('Reject withdrawal error:', error); res.status(500).json({ error: 'Failed to reject request' }); }
  });

  // Transfers
  app.post('/transfers', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'child') return res.status(403).json({ error: 'Only children can create transfer requests' });
      const { toChildId, amount, reason } = req.body || {};
      const amt = parseFloat(amount);
      if (!toChildId || !amount || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid transfer' });
      const { transferRequests } = await connect(mongoUri);
      const doc = { fromUserId: new ObjectId(req.user.id), toUserId: new ObjectId(toChildId), parentId: new ObjectId(req.user.parentId), amount: amt, reason: reason || '', status: 'pending', createdAt: new Date(), updatedAt: new Date() };
      const r = await transferRequests.insertOne(doc);
      res.json({ success: true, id: r.insertedId });
    } catch (error) { console.error('Create transfer error:', error); res.status(500).json({ error: 'Failed to create transfer' }); }
  });

  app.get('/transfers', verifyToken, async (req, res) => {
    try {
      const { transferRequests } = await connect(mongoUri);
      let filter;
      if (req.user.role === 'child') filter = { $or: [{ fromUserId: new ObjectId(req.user.id) }, { toUserId: new ObjectId(req.user.id) }] };
      else filter = { parentId: new ObjectId(req.user.id) };
      const list = await transferRequests.find(filter).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, requests: list });
    } catch (error) { console.error('Get transfers error:', error); res.status(500).json({ error: 'Failed to load transfers' }); }
  });

  app.post('/transfers/:id/approve', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can approve transfers' });
      const { users, transferRequests } = await connect(mongoUri);
      const _id = new ObjectId(req.params.id);
      const tr = await transferRequests.findOne({ _id });
      if (!tr) return res.status(404).json({ error: 'Request not found' });
      const fromChild = await users.findOne({ _id: tr.fromUserId });
      const toChild = await users.findOne({ _id: tr.toUserId });
      if (!fromChild || !toChild || String(fromChild.parentId) !== String(req.user.id) || String(toChild.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      if ((fromChild.savings || 0) < tr.amount) return res.status(400).json({ error: 'Insufficient funds' });
      const newFromBal = (fromChild.savings || 0) - tr.amount;
      const newToBal = (toChild.savings || 0) + tr.amount;
      const outTx = { id: new ObjectId(), type: 'transfer-out', amount: tr.amount, description: tr.reason || `Transfer to @${toChild.username}`, createdAt: new Date(), userId: req.user.id };
      const inTx = { id: new ObjectId(), type: 'transfer-in', amount: tr.amount, description: tr.reason || `Transfer from @${fromChild.username}`, createdAt: new Date(), userId: req.user.id };
      await users.updateOne({ _id: fromChild._id }, { $set: { savings: newFromBal, updatedAt: new Date() }, $push: { transactions: outTx } });
      await users.updateOne({ _id: toChild._id }, { $set: { savings: newToBal, updatedAt: new Date() }, $push: { transactions: inTx } });
      await transferRequests.updateOne({ _id }, { $set: { status: 'approved', updatedAt: new Date() } });
      res.json({ success: true });
    } catch (error) { console.error('Approve transfer error:', error); res.status(500).json({ error: 'Failed to approve transfer' }); }
  });

  app.post('/transfers/:id/reject', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can reject transfers' });
      const { reason } = req.body || {};
      const { transferRequests } = await connect(mongoUri);
      const _id = new ObjectId(req.params.id);
      const tr = await transferRequests.findOne({ _id });
      if (!tr) return res.status(404).json({ error: 'Request not found' });
      await transferRequests.updateOne({ _id }, { $set: { status: 'rejected', reason: reason || '', updatedAt: new Date() } });
      res.json({ success: true });
    } catch (error) { console.error('Reject transfer error:', error); res.status(500).json({ error: 'Failed to reject transfer' }); }
  });

  // Logout (blacklist token)
  app.post('/logout', verifyToken, async (req, res) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (!token) return res.status(400).json({ error: 'No token provided' });
      const { blacklistedTokens } = await connect(mongoUri);
      await blacklistedTokens.insertOne({ token, blacklistedAt: new Date() });
      res.json({ success: true });
    } catch (error) { console.error('Logout error:', error); res.status(500).json({ error: 'Failed to logout' }); }
  });

  return app;
}

module.exports = { createApp };

