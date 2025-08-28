// Shared Express app (no Firebase or Netlify-specific imports)
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // use bcryptjs for simpler serverless deploys
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { connect } = require('./db');
const crypto = require('crypto');

function createApp({ mongoUri, jwtSecret }) {
  if (!mongoUri) console.warn('[CONFIG] MONGODB_URI not set');
  if (!jwtSecret) console.warn('[CONFIG] JWT_SECRET not set');

  const app = express();

  // Disable ETag and caching for dynamic JSON endpoints
  app.set('etag', false);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

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
  // Also accept URL-encoded bodies (in case some environments send form-encoded data)
  app.use(express.urlencoded({ extended: true }));

  // Serverless safety: ensure req.body is an object for JSON/urlencoded content
  app.use((req, res, next) => {
    try {
      const ct = (req.get('content-type') || '').toLowerCase();
      if (req.body && (Buffer.isBuffer(req.body) || Array.isArray(req.body) || typeof req.body === 'string')) {
        const raw = Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : Array.isArray(req.body)
            ? Buffer.from(req.body).toString('utf8')
            : String(req.body);

        if (ct.includes('application/json')) {
          try {
            req.body = raw ? JSON.parse(raw) : {};
          } catch (e) {
            console.warn(`[${req.requestId}] global body parse (json) failed:`, e && e.message);
            req.body = {};
          }
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          try {
            req.body = Object.fromEntries(new URLSearchParams(raw));
          } catch (e) {
            console.warn(`[${req.requestId}] global body parse (urlencoded) failed:`, e && e.message);
            req.body = {};
          }
        }
      }
    } catch (e) {
      console.warn(`[${req.requestId}] global body coercion error:`, e && e.message);
    }
    next();
  });

  // Preflight
  // Handle CORS preflight globally without path patterns (Express 5 safe)
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-request-id');
      res.set('Access-Control-Max-Age', '86400');
      return res.status(204).send('');
    }
    next();
  });

  // Helpers
  function isValidEmail(email) { return /.+@.+\..+/.test(email); }
  function normalizeSecAnswer(s) {
    try {
      return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
    } catch (e) {
      return String(s || '').trim().toLowerCase();
    }
  }

  function normalizeRecoveryCode(s) {
    try {
      return String(s || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    } catch (e) {
      return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
  }
  function generateRecoveryCode() {
    // 20 hex chars grouped as XXXX-XXXX-XXXX-XXXX-XXXX
    const raw = crypto.randomBytes(10).toString('hex').toUpperCase();
    return raw.match(/.{1,4}/g).join('-');
  }
  function hashRecoveryCode(code) {
    const normalized = normalizeRecoveryCode(code);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
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

  // reCAPTCHA helpers
  const recaptchaSecret = process.env.RECAPTCHA_SECRET || process.env.RECAPTCHA_SECRET_KEY || '';
  const recaptchaMinScore = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);

  function getClientIp(req) {
    try {
      const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      return xff || req.ip || (req.connection && req.connection.remoteAddress) || '';
    } catch (e) {
      return '';
    }
  }

  async function verifyRecaptchaToken(req, token, expectedPrefix) {
    if (!recaptchaSecret) {
      console.warn(`[${req.requestId}] reCAPTCHA secret not configured, skipping verification`);
      return { ok: true, skipped: true };
    }
    if (!token) {
      return { ok: false, error: 'Missing reCAPTCHA token' };
    }
    try {
      const body = new URLSearchParams();
      body.append('secret', recaptchaSecret);
      body.append('response', token);
      const ip = getClientIp(req);
      if (ip) body.append('remoteip', ip);

      let data;
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        data = await resp.json();
      } else {
        // Fallback if fetch is not available
        const https = require('https');
        data = await new Promise((resolve, reject) => {
          const reqOpts = {
            method: 'POST',
            hostname: 'www.google.com',
            path: '/recaptcha/api/siteverify',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(body.toString())
            }
          };
          const r = https.request(reqOpts, (res) => {
            let buf = '';
            res.on('data', (chunk) => (buf += chunk));
            res.on('end', () => {
              try {
                resolve(JSON.parse(buf));
              } catch (e) {
                reject(e);
              }
            });
          });
          r.on('error', reject);
          r.write(body.toString());
          r.end();
        });
      }

      if (!data || !data.success) {
        return { ok: false, error: 'reCAPTCHA verification failed' };
      }
      if (typeof data.score === 'number' && data.score < recaptchaMinScore) {
        return { ok: false, error: 'reCAPTCHA score too low' };
      }
      if (expectedPrefix && data.action && !String(data.action).startsWith(expectedPrefix)) {
        console.warn(
          `[${req.requestId}] reCAPTCHA action mismatch: expected prefix ${expectedPrefix}, got ${data.action}`
        );
      }
      return { ok: true, score: data.score, action: data.action };
    } catch (e) {
      console.error(`[${req.requestId}] reCAPTCHA verification error:`, e && e.message);
      return { ok: false, error: 'reCAPTCHA verification error' };
    }
  }

  // Health
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

// Email verification via Reoon (public, no auth)
app.get('/email-verifier', async (req, res) => {
  try {
    const email = String((req.query && req.query.email) || '').trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const apiKey = process.env.REOON_EMAIL_VERIFIER_KEY || process.env.REOON_API_KEY || '';
    const timeoutMs = Number(process.env.REOON_EMAIL_VERIFIER_TIMEOUT_MS || 20000);

    if (!apiKey) {
      // Not configured: treat as unknown (acceptable per requirement), but signal disabled
      return res.json({
        success: true,
        status: 'unknown',
        treated: 'accept',
        disabled: true,
        reason: 'not_configured'
      });
    }

    const started = Date.now();
    const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(apiKey)}&mode=power&ts=${Date.now()}`;

    async function callOnce(ms) {
      const t0 = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        const text = await resp.text();
        let parsed;
        let parseError = false;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (e) {
          parseError = true;
          parsed = { parseError: true, raw: text };
        }
        const elapsed = Date.now() - t0;
        return { ok: resp.ok, parsed, statusCode: resp.status, text, elapsed_ms: elapsed, parseError };
      } catch (err) {
        return { ok: false, error: (err && err.message) || String(err), elapsed_ms: Date.now() - t0 };
      } finally {
        clearTimeout(timer);
      }
    }

    const timeouts = [
      timeoutMs,
      Math.max(timeoutMs, 30000),
      Math.max(Math.floor(timeoutMs * 1.5), 45000)
    ];

    const attempts_detail = [];
    let r = null;
    let parsed = {};
    let statusRaw = 'unknown';

    for (let i = 0; i < timeouts.length; i++) {
      r = await callOnce(timeouts[i]);
      parsed = r.parsed || {};
      statusRaw = parsed && parsed.status ? String(parsed.status).toLowerCase() : 'unknown';
      attempts_detail.push({
        attempt: i + 1,
        status: statusRaw,
        ok: !!r.ok,
        statusCode: r.statusCode || 0,
        error: r.error,
        elapsed_ms: r.elapsed_ms
      });
      if (r.ok && statusRaw !== 'unknown') break;
      if (i < timeouts.length - 1) {
        const delay = 1500 * (i + 1);
        await new Promise(resDelay => setTimeout(resDelay, delay));
      }
    }

    const attempts = attempts_detail.length;

    const treated =
      (statusRaw === 'safe' || statusRaw === 'unknown') ? 'accept' :
      (statusRaw === 'inbox_full') ? 'inbox_full' :
      'reject';

    return res.json({
      success: true,
      email: parsed.email || email,
      status: statusRaw,
      treated,
      overall_score: parsed.overall_score,
      is_valid_syntax: parsed.is_valid_syntax,
      is_disposable: parsed.is_disposable,
      is_role_account: parsed.is_role_account,
      can_connect_smtp: parsed.can_connect_smtp,
      has_inbox_full: parsed.has_inbox_full,
      is_catch_all: parsed.is_catch_all,
      is_deliverable: parsed.is_deliverable,
      is_disabled: parsed.is_disabled,
      is_spamtrap: parsed.is_spamtrap,
      is_free_email: parsed.is_free_email,
      mx_accepts_mail: parsed.mx_accepts_mail,
      mx_records: parsed.mx_records,
      verification_mode: parsed.verification_mode || 'power',
      attempts,
      attempts_detail,
      elapsed_ms: Date.now() - started
    });
  } catch (error) {
    console.error('Email verification endpoint error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});
 
// Registration (parent)
  app.post('/register', async (req, res) => {
    try {
      const { recaptchaToken } = req.body || {};
      const rec = await verifyRecaptchaToken(req, recaptchaToken, 'register');
      if (!rec.ok && recaptchaSecret) {
        return res.status(400).json({ error: rec.error || 'reCAPTCHA verification failed' });
      }

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

      // Generate a unique recovery code, store only its hash
      let recoveryCodePlain = generateRecoveryCode();
      let recoveryHash = hashRecoveryCode(recoveryCodePlain);
      for (let i = 0; i < 5; i++) {
        const dup = await users.findOne({ recoveryCodeHash: recoveryHash }, { projection: { _id: 1 } });
        if (!dup) break;
        recoveryCodePlain = generateRecoveryCode();
        recoveryHash = hashRecoveryCode(recoveryCodePlain);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        role: 'parent',
        name: name.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        securityQuestion: securityQuestion.trim(),
        securityAnswer: normalizeSecAnswer(securityAnswer),
        recoveryCodeHash: recoveryHash,
        recoveryCodeCreatedAt: new Date(),
        createdAt: new Date(),
        lastLogin: null,
        children: []
      };
      const result = await users.insertOne(user);
      const token = generateToken({ ...user, _id: result.insertedId });

      // IMPORTANT: Only return the plaintext recovery code once, now.
      res.json({
        success: true,
        message: 'Registration successful',
        token,
        user: { id: result.insertedId, role: 'parent', name: user.name, email: user.email },
        recoveryCode: recoveryCodePlain
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  // Login
  app.post('/login', async (req, res) => {
    try {
      // Coerce raw body into a proper object if serverless middleware left it as Buffer/array/string
      try {
        const ct = (req.get('content-type') || '').toLowerCase();
        if (req.body && (Buffer.isBuffer(req.body) || Array.isArray(req.body) || typeof req.body === 'string')) {
          const raw =
            Buffer.isBuffer(req.body) ? req.body.toString('utf8')
            : Array.isArray(req.body) ? Buffer.from(req.body).toString('utf8')
            : String(req.body);

          if (ct.includes('application/json')) {
            try {
              req.body = raw ? JSON.parse(raw) : {};
            } catch (e) {
              console.warn(`[${req.requestId}] JSON coerce parse failed:`, e && e.message);
              req.body = {};
            }
          } else if (ct.includes('application/x-www-form-urlencoded')) {
            try {
              req.body = Object.fromEntries(new URLSearchParams(raw));
            } catch (e) {
              console.warn(`[${req.requestId}] URL-encoded coerce parse failed:`, e && e.message);
              req.body = {};
            }
          } else {
            // Leave as empty object for unknown types
            req.body = {};
          }
        }
      } catch (e) {
        console.warn(`[${req.requestId}] Body coercion failed:`, e && e.message);
      }
      // Debug: summarize incoming payload without exposing secrets
      try {
        const ct = req.get('content-type');
        const body = req.body || {};
        console.log(`[${req.requestId}] /login payload summary`, {
          contentType: ct,
          hasBody: !!req.body,
          bodyType: typeof req.body,
          keys: Object.keys(body || {}),
          role: body.role,
          emailLen: typeof body.email === 'string' ? body.email.length : (body.email == null ? 0 : -1),
          passwordLen: typeof body.password === 'string' ? body.password.length : (body.password == null ? 0 : -1),
          usernameLen: typeof body.username === 'string' ? body.username.length : (body.username == null ? 0 : -1),
          pinLen: typeof body.pin === 'string' ? body.pin.length : (body.pin == null ? 0 : -1)
        });
      } catch (e) {
        console.warn(`[${req.requestId}] /login payload summary logging failed:`, e && e.message);
      }

      // reCAPTCHA check
      const { recaptchaToken } = req.body || {};
      const rec = await verifyRecaptchaToken(req, recaptchaToken, 'login');
      if (!rec.ok && recaptchaSecret) {
        return res.status(400).json({ error: rec.error || 'reCAPTCHA verification failed' });
      }

      const { email, password, username, pin, role } = req.body || {};
      const { users } = await connect(mongoUri);
      let user = null;

      if (role === 'child') {
        if (!username || !pin) return res.status(400).json({ error: 'Username and PIN are required for child login' });
        user = await users.findOne({ username: String(username).toLowerCase(), role: 'child' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Locked?
        if (user.locked && user.lockReason === 'child_failed_attempts') {
          return res.status(403).json({ error: 'Account is blocked due to multiple failed attempts. Ask your parent to reset your PIN to unlock.' });
        }

        const ok = await bcrypt.compare(String(pin), user.pin);
        if (!ok) {
          const attempts = Number(user.failedLoginAttempts || 0) + 1;
          const set = { failedLoginAttempts: attempts, updatedAt: new Date() };
          if (attempts >= 3) {
            set.locked = true;
            set.lockReason = 'child_failed_attempts';
            set.lockUpdatedAt = new Date();
          }
          await users.updateOne({ _id: user._id }, { $set: set });
          const msg = attempts >= 3 ? 'Child account is now blocked due to too many failed attempts' : 'Invalid credentials';
          const code = attempts >= 3 ? 403 : 401;
          return res.status(code).json({ error: msg });
        }
      } else {
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
        user = await users.findOne({ email: String(email).toLowerCase(), role: 'parent' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Locked?
        if (user.locked && user.lockReason === 'parent_failed_attempts') {
          return res.status(403).json({ error: 'Account locked due to multiple failed login attempts. Reset your password to unlock.' });
        }

        const ok = await bcrypt.compare(String(password), user.password);
        if (!ok) {
          const attempts = Number(user.failedLoginAttempts || 0) + 1;
          const set = { failedLoginAttempts: attempts, updatedAt: new Date() };
          if (attempts >= 3) {
            set.locked = true;
            set.lockReason = 'parent_failed_attempts';
            set.lockUpdatedAt = new Date();
          }
          await users.updateOne({ _id: user._id }, { $set: set });
          const msg = attempts >= 3 ? 'Parent account is now locked due to too many failed attempts' : 'Invalid credentials';
          const code = attempts >= 3 ? 403 : 401;
          return res.status(code).json({ error: msg });
        }
      }

      // Successful login: reset attempts and clear lock
      await users.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date(), failedLoginAttempts: 0, locked: false, lockReason: null } }
      );

      const token = generateToken(user);
      const publicUser = {
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        username: user.username,
        savings: user.savings || 0,
        goals: user.goals || [],
        parentId: user.parentId,
        preferences: user.preferences || {}
      };
      res.json({ success: true, token, user: publicUser });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Forgot Password (public) - verify email returns the parent's security question
  app.post('/forgot-password/verify-email', async (req, res) => {
    try {
      const { email } = req.body || {};
      const emailStr = String(email || '').toLowerCase().trim();
      if (!emailStr || !/.+@.+\..+/.test(emailStr)) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      const { users } = await connect(mongoUri);
      const parent = await users.findOne(
        { email: emailStr, role: 'parent' },
        { projection: { securityQuestion: 1 } }
      );
      if (!parent) return res.status(404).json({ error: 'Email not found' });
      return res.json({ success: true, securityQuestion: parent.securityQuestion || 'Not set' });
    } catch (error) {
      console.error('Forgot-password verify-email error:', error);
      return res.status(500).json({ error: 'Failed to verify email' });
    }
  });

  // Forgot Password (public) - reset password after answering the security question
  app.post('/forgot-password/reset', async (req, res) => {
    try {
      const { email, securityAnswer, newPassword } = req.body || {};
      const emailStr = String(email || '').toLowerCase().trim();
      const answerStr = String(securityAnswer || '');
      const pwdStr = String(newPassword || '');

      if (!emailStr || !/.+@.+\..+/.test(emailStr)) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      if (!answerStr || !answerStr.trim()) {
        return res.status(400).json({ error: 'Security answer is required' });
      }
      if (!pwdStr || pwdStr.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const { users } = await connect(mongoUri);
      const parent = await users.findOne({ email: emailStr, role: 'parent' });
      if (!parent) return res.status(404).json({ error: 'Email not found' });

      const stored = normalizeSecAnswer(parent.securityAnswer);
      const provided = normalizeSecAnswer(answerStr);
      if (stored !== provided) {
        return res.status(403).json({ error: 'Incorrect security answer' });
      }

      const hashed = await bcrypt.hash(pwdStr, 10);
      await users.updateOne(
        { _id: parent._id },
        { $set: { password: hashed, updatedAt: new Date(), failedLoginAttempts: 0, locked: false, lockReason: null, lockUpdatedAt: new Date() } }
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Forgot-password reset error:', error);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Forgot Password (public) - reset password using recovery code (no security question required)
  app.post('/forgot-password/reset-with-code', async (req, res) => {
    try {
      const { email, recoveryCode, newPassword } = req.body || {};
      const emailStr = String(email || '').toLowerCase().trim();
      const codeStr = String(recoveryCode || '');
      const pwdStr = String(newPassword || '');

      if (!emailStr || !/.+@.+\..+/.test(emailStr)) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      if (!codeStr || !codeStr.trim()) {
        return res.status(400).json({ error: 'Recovery code is required' });
      }
      if (!pwdStr || pwdStr.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const { users } = await connect(mongoUri);
      const parent = await users.findOne({ email: emailStr, role: 'parent' }, { projection: { _id: 1, recoveryCodeHash: 1 } });
      if (!parent) return res.status(404).json({ error: 'Email not found' });

      const providedHash = hashRecoveryCode(codeStr);
      if (!parent.recoveryCodeHash || parent.recoveryCodeHash !== providedHash) {
        return res.status(403).json({ error: 'Invalid recovery code' });
      }

      const hashed = await bcrypt.hash(pwdStr, 10);
      await users.updateOne(
        { _id: parent._id },
        { $set: { password: hashed, updatedAt: new Date(), failedLoginAttempts: 0, locked: false, lockReason: null, lockUpdatedAt: new Date() } }
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Forgot-password reset-with-code error:', error);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Username availability (cache per instance)
  const USERNAME_CACHE_TTL_MS = 60_000;
  const usernameAvailabilityCache = new Map();
  app.get('/usernames/check', async (req, res) => {
    try {
      const usernameRaw = req.query.username || '';
      const username = String(usernameRaw).trim();
      if (!username || username.length < 4) {
        return res.json({ available: false, message: 'Username must be at least 4 characters' });
      }
      const key = username.toLowerCase();
      const now = Date.now();
      const cached = usernameAvailabilityCache.get(key);
      if (cached && cached.expireAt > now) {
        return res.json(cached.value);
      }
      const { users } = await connect(mongoUri);
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exists = await users.findOne(
        { username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' }, role: 'child' },
        { projection: { _id: 1 } }
      );
      const value = exists ? { available: false, message: 'Username is taken' } : { available: true };
      usernameAvailabilityCache.set(key, { value, expireAt: now + USERNAME_CACHE_TTL_MS });
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

      // Invalidate/refresh username availability cache
      try {
        const key = String(child.username || '').toLowerCase().trim();
        if (key) {
          const now = Date.now();
          usernameAvailabilityCache.set(key, { value: { available: true }, expireAt: now + USERNAME_CACHE_TTL_MS });
        }
      } catch (e) {
        console.warn('Username cache refresh on delete failed:', e && e.message);
      }

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
      await users.updateOne(
        { _id: childObjectId },
        { $set: { pin: hashedPin, updatedAt: new Date(), failedLoginAttempts: 0, locked: false, lockReason: null, lockUpdatedAt: new Date() } }
      );
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
      const { withdrawalRequests, users } = await connect(mongoUri);
      const me = await users.findOne({ _id: new ObjectId(req.user.id), role: 'child' });
      if (!me) return res.status(404).json({ error: 'Child not found' });
      if ((Number(me.savings) || 0) < amt) return res.status(400).json({ error: 'Amount exceeds current balance' });
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
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
      const reqDoc = await withdrawalRequests.findOne({ _id });
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      const child = await users.findOne({ _id: reqDoc.userId });
      if (!child || String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

      // Optional amount override by parent
      const override = Number((req.body || {}).amount);
      let amt = reqDoc.amount;
      if (Number.isFinite(override) && override > 0) {
        amt = override;
      }

      if ((child.savings || 0) < amt) return res.status(400).json({ error: 'Insufficient funds' });
      const newBalance = (child.savings || 0) - amt;
      const transaction = { id: new ObjectId(), type: 'withdrawal', amount: amt, description: reqDoc.reason || 'Withdrawal approved', createdAt: new Date(), userId: req.user.id };
      await users.updateOne({ _id: child._id }, { $set: { savings: newBalance, updatedAt: new Date() }, $push: { transactions: transaction } });
      await withdrawalRequests.updateOne({ _id }, { $set: { status: 'approved', amount: amt, updatedAt: new Date() } });
      res.json({ success: true, newBalance });
    } catch (error) { console.error('Approve withdrawal error:', error); res.status(500).json({ error: 'Failed to approve request' }); }
  });

  app.post('/withdrawal-requests/:id/reject', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can reject withdrawal requests' });
      const { reason } = req.body || {};
      const { withdrawalRequests } = await connect(mongoUri);
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
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
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
      const tr = await transferRequests.findOne({ _id });
      if (!tr) return res.status(404).json({ error: 'Request not found' });
      const fromChild = await users.findOne({ _id: tr.fromUserId });
      const toChild = await users.findOne({ _id: tr.toUserId });
      if (!fromChild || !toChild || String(fromChild.parentId) !== String(req.user.id) || String(toChild.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

      // Optional amount override by parent
      const override = Number((req.body || {}).amount);
      let amt = tr.amount;
      if (Number.isFinite(override) && override > 0) {
        amt = override;
      }

      if ((fromChild.savings || 0) < amt) return res.status(400).json({ error: 'Insufficient funds' });
      const newFromBal = (fromChild.savings || 0) - amt;
      const newToBal = (toChild.savings || 0) + amt;
      const outTx = { id: new ObjectId(), type: 'transfer-out', amount: amt, description: tr.reason || `Transfer to @${toChild.username}`, createdAt: new Date(), userId: req.user.id };
      const inTx = { id: new ObjectId(), type: 'transfer-in', amount: amt, description: tr.reason || `Transfer from @${fromChild.username}`, createdAt: new Date(), userId: req.user.id };
      await users.updateOne({ _id: fromChild._id }, { $set: { savings: newFromBal, updatedAt: new Date() }, $push: { transactions: outTx } });
      await users.updateOne({ _id: toChild._id }, { $set: { savings: newToBal, updatedAt: new Date() }, $push: { transactions: inTx } });
      await transferRequests.updateOne({ _id }, { $set: { status: 'approved', amount: amt, updatedAt: new Date() } });
      res.json({ success: true, fromNewBalance: newFromBal, toNewBalance: newToBal });
    } catch (error) { console.error('Approve transfer error:', error); res.status(500).json({ error: 'Failed to approve transfer' }); }
  });

  app.post('/transfers/:id/reject', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can reject transfers' });
      const { reason } = req.body || {};
      const { transferRequests } = await connect(mongoUri);
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
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

  // Create child (parent only)
  app.post('/create-child', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can create child accounts' });

      const { name, username, pin, initialBalance = 0 } = req.body || {};

      // Debug: summarize incoming payload without exposing secrets
      try {
        const ct = req.get('content-type');
        const body = req.body || {};
        console.log(`[${req.requestId}] /create-child payload summary`, {
          contentType: ct,
          hasBody: !!req.body,
          bodyType: typeof req.body,
          keys: Object.keys(body || {}),
          nameLen: typeof body.name === 'string' ? body.name.trim().length : (body.name == null ? 0 : -1),
          usernameLen: typeof body.username === 'string' ? body.username.trim().length : (body.username == null ? 0 : -1),
          pinLen: typeof body.pin === 'string' ? body.pin.trim().length : (body.pin == null ? 0 : -1),
          initialBalanceType: typeof body.initialBalance
        });
      } catch (e) {
        console.warn(`[${req.requestId}] /create-child payload summary logging failed:`, e && e.message);
      }

      const errors = [];

      const childName = String(name || '').trim();
      const uname = String(username || '').toLowerCase().trim();
      const pinStr = String(pin || '').trim();
      const bal = Number(initialBalance) || 0;

      if (!childName || childName.length < 2) errors.push('Child name must be at least 2 characters.');
      if (!uname || uname.length < 4) errors.push('Username must be at least 4 characters.');
      if (!/^\d{4}$/.test(pinStr)) errors.push('PIN must be exactly 4 digits.');
      else {
        const counts = {};
        for (const ch of pinStr) counts[ch] = (counts[ch] || 0) + 1;
        if (Object.values(counts).some(c => c > 2)) errors.push('PIN cannot contain any digit more than twice.');
      }
      if (bal < 0) errors.push('Initial balance cannot be negative.');
      if (errors.length) return res.status(400).json({ error: errors.join(' ') });

      const { users } = await connect(mongoUri);
      const exists = await users.findOne({ username: uname, role: 'child' });
      if (exists) return res.status(409).json({ error: 'Username is taken' });

      const hashedPin = await bcrypt.hash(pinStr, 10);

      const childDoc = {
        role: 'child',
        name: childName,
        username: uname,
        pin: hashedPin,
        savings: bal,
        transactions: [],
        parentId: String(req.user.id), // keep as string for consistent lookups in /children
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null
      };

      if (bal > 0) {
        childDoc.transactions.push({
          id: new ObjectId(),
          type: 'account_creation',
          amount: bal,
          description: 'Initial balance',
          createdAt: new Date(),
          userId: String(req.user.id)
        });
      }

      const r = await users.insertOne(childDoc);
      await users.updateOne(
        { _id: new ObjectId(String(req.user.id)) },
        { $push: { children: r.insertedId } }
      );

      // Invalidate/refresh username availability cache to prevent stale "available" result
      try {
        const key = String(childDoc.username || '').toLowerCase().trim();
        const now = Date.now();
        usernameAvailabilityCache.set(key, { value: { available: false, message: 'Username is taken' }, expireAt: now + USERNAME_CACHE_TTL_MS });
      } catch (e) {
        console.warn('Username cache refresh on create child failed:', e && e.message);
      }

      const childOut = { id: r.insertedId, name: childDoc.name, username: childDoc.username, savings: childDoc.savings };
      return res.json({ success: true, child: childOut });
    } catch (error) {
      console.error('Create child error:', error);
      return res.status(500).json({ error: 'Failed to create child' });
    }
  });

  // Get child details (parent owns child or child self)
  app.get('/children/:childId', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(req.params.childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'You can only view your own children' });
      } else if (req.user.role === 'child') {
        if (String(req.user.id) !== String(req.params.childId)) return res.status(403).json({ error: 'Access denied' });
      }

      const out = {
        id: child._id,
        name: child.name,
        username: child.username,
        savings: child.savings || 0,
        goalsCount: (child.goals || []).length,
        lastLogin: child.lastLogin
      };
      return res.json({ success: true, child: out });
    } catch (error) {
      console.error('Get child details error:', error);
      return res.status(500).json({ error: 'Failed to get child details' });
    }
  });

  // Set child balance (parent only) - records delta as deposit/withdrawal transaction
  app.put('/children/:childId/balance', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can update child balances' });
      const target = Number((req.body || {}).amount);
      if (!Number.isFinite(target) || target < 0) return res.status(400).json({ error: 'Invalid amount' });

      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(req.params.childId);
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'You can only update your own children' });

      const current = Number(child.savings || 0);
      const delta = target - current;
      let transaction = null;

      if (Math.abs(delta) > 0) {
        const type = delta > 0 ? 'deposit' : 'withdrawal';
        transaction = {
          id: new ObjectId(),
          type,
          amount: Math.abs(delta),
          description: 'Balance adjustment by parent',
          createdAt: new Date(),
          userId: String(req.user.id)
        };
        await users.updateOne(
          { _id: childObjectId },
          { $set: { savings: target, updatedAt: new Date() }, $push: { transactions: transaction } }
        );
      } else {
        await users.updateOne(
          { _id: childObjectId },
          { $set: { savings: target, updatedAt: new Date() } }
        );
      }

      return res.json({ success: true, newBalance: target, transaction });
    } catch (error) {
      console.error('Update child balance error:', error);
      return res.status(500).json({ error: 'Failed to update balance' });
    }
  });

  // Parent settings: get security question
  app.get('/parent/security-question', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can access this endpoint' });
      const { users } = await connect(mongoUri);
      const parent = await users.findOne({ _id: new ObjectId(String(req.user.id)), role: 'parent' }, { projection: { securityQuestion: 1 } });
      if (!parent) return res.status(404).json({ error: 'User not found' });
      return res.json({ success: true, securityQuestion: parent.securityQuestion || 'Not set' });
    } catch (error) {
      console.error('Get security question error:', error);
      return res.status(500).json({ error: 'Failed to fetch security question' });
    }
  });

  // Parent settings: change email
  app.put('/parent/email', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can change email' });
      const { newEmail, securityAnswer } = req.body || {};
      const emailStr = String(newEmail || '').toLowerCase().trim();
      const answerStr = String(securityAnswer || '').trim().toLowerCase();
      if (!emailStr || !/.+@.+\..+/.test(emailStr)) return res.status(400).json({ error: 'A valid new email is required' });
      if (!answerStr) return res.status(400).json({ error: 'Security answer is required' });

      const { users } = await connect(mongoUri);
      const parentId = new ObjectId(String(req.user.id));
      const parent = await users.findOne({ _id: parentId, role: 'parent' });
      if (!parent) return res.status(404).json({ error: 'User not found' });

      const storedAns = normalizeSecAnswer(parent.securityAnswer);
      const providedAns = normalizeSecAnswer(answerStr);
      if (storedAns !== providedAns) {
        return res.status(403).json({ error: 'Incorrect security answer' });
      }

      const exists = await users.findOne({ email: emailStr, role: 'parent', _id: { $ne: parentId } });
      if (exists) return res.status(409).json({ error: 'Email is already in use' });

      await users.updateOne({ _id: parentId }, { $set: { email: emailStr, updatedAt: new Date() } });
      return res.json({ success: true });
    } catch (error) {
      console.error('Change email error:', error);
      return res.status(500).json({ error: 'Failed to update email' });
    }
  });

  // Parent settings: change password
  app.put('/parent/password', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can change password' });
      const { newPassword, securityAnswer } = req.body || {};
      const pwdStr = String(newPassword || '');
      const answerStr = String(securityAnswer || '').trim().toLowerCase();
      if (!pwdStr || pwdStr.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      if (!answerStr) return res.status(400).json({ error: 'Security answer is required' });

      const { users } = await connect(mongoUri);
      const parentId = new ObjectId(String(req.user.id));
      const parent = await users.findOne({ _id: parentId, role: 'parent' });
      if (!parent) return res.status(404).json({ error: 'User not found' });

      const storedAns = normalizeSecAnswer(parent.securityAnswer);
      const providedAns = normalizeSecAnswer(answerStr);
      if (storedAns !== providedAns) {
        return res.status(403).json({ error: 'Incorrect security answer' });
      }

      const hashed = await bcrypt.hash(pwdStr, 10);
      await users.updateOne({ _id: parentId }, { $set: { password: hashed, updatedAt: new Date() } });
      return res.json({ success: true });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ error: 'Failed to update password' });
    }
  });

  // Parent settings: delete account (cascade)
  app.delete('/parent/account', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can delete their account' });
      const { users, withdrawalRequests, transferRequests, moneyAdditionRequests } = await connect(mongoUri);

      const parentIdStr = String(req.user.id);
      const parentObjId = new ObjectId(parentIdStr);

      // Delete child accounts (match either stored as string or ObjectId)
      await users.deleteMany({ role: 'child', $or: [ { parentId: parentIdStr }, { parentId: parentObjId } ] });

      // Delete all pending/archived requests for this family
      await withdrawalRequests.deleteMany({ parentId: parentObjId });
      await moneyAdditionRequests.deleteMany({ parentId: parentObjId });
      await transferRequests.deleteMany({ parentId: parentObjId });

      // Delete parent account
      await users.deleteOne({ _id: parentObjId, role: 'parent' });

      return res.json({ success: true });
    } catch (error) {
      console.error('Delete parent account error:', error);
      return res.status(500).json({ error: 'Failed to delete account' });
    }
  });

  // Money addition approvals (parent)
  app.post('/money-addition-requests/:id/approve', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can approve money addition requests' });
      const { users, moneyAdditionRequests } = await connect(mongoUri);
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
      const reqDoc = await moneyAdditionRequests.findOne({ _id });
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });

      const child = await users.findOne({ _id: reqDoc.userId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

      // Optional amount override by parent
      const override = Number((req.body || {}).amount);
      let amt = reqDoc.amount;
      if (Number.isFinite(override) && override > 0) {
        amt = override;
      }

      const newBalance = (child.savings || 0) + amt;
      const tx = {
        id: new ObjectId(),
        type: 'deposit',
        amount: amt,
        description: reqDoc.reason || 'Money addition approved',
        createdAt: new Date(),
        userId: String(req.user.id)
      };

      await users.updateOne(
        { _id: child._id },
        { $set: { savings: newBalance, updatedAt: new Date() }, $push: { transactions: tx } }
      );
      await moneyAdditionRequests.updateOne({ _id }, { $set: { status: 'approved', amount: amt, updatedAt: new Date() } });

      return res.json({ success: true, newBalance });
    } catch (error) {
      console.error('Approve money addition error:', error);
      return res.status(500).json({ error: 'Failed to approve money addition' });
    }
  });

  app.post('/money-addition-requests/:id/reject', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can reject money addition requests' });
      const { reason = '' } = req.body || {};
      const { moneyAdditionRequests } = await connect(mongoUri);
      const idParam = String(req.params.id || '');
      if (!ObjectId.isValid(idParam)) return res.status(400).json({ error: 'Invalid request id' });
      const _id = new ObjectId(idParam);
      const reqDoc = await moneyAdditionRequests.findOne({ _id });
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      await moneyAdditionRequests.updateOne({ _id }, { $set: { status: 'rejected', reason: String(reason), updatedAt: new Date() } });
      return res.json({ success: true });
    } catch (error) {
      console.error('Reject money addition error:', error);
      return res.status(500).json({ error: 'Failed to reject money addition' });
    }
  });

  // Goals endpoints
  app.post('/goals', verifyToken, async (req, res) => {
    try {
      const { childId, name, targetAmount, deadline } = req.body || {};
      if (!childId) return res.status(400).json({ error: 'childId is required' });
      const goalName = String(name || '').trim();
      const target = Number(targetAmount);
      if (!goalName || goalName.length < 2) return res.status(400).json({ error: 'Goal name must be at least 2 characters' });
      if (!Number.isFinite(target) || target <= 0) return res.status(400).json({ error: 'targetAmount must be > 0' });

      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(String(childId));
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(req.user.id) !== String(childId)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const goal = {
        id: new ObjectId(),
        name: goalName,
        targetAmount: target,
        deadline: deadline ? new Date(deadline) : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await users.updateOne({ _id: childObjectId }, { $push: { goals: goal }, $set: { updatedAt: new Date() } });
      return res.json({ success: true, goal });
    } catch (error) {
      console.error('Create goal error:', error);
      return res.status(500).json({ error: 'Failed to create goal' });
    }
  });

  app.get('/goals/:childId', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(String(req.params.childId));
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(req.user.id) !== String(req.params.childId)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      return res.json({ success: true, goals: child.goals || [] });
    } catch (error) {
      console.error('Get goals error:', error);
      return res.status(500).json({ error: 'Failed to load goals' });
    }
  });

  app.put('/goals/:goalId', verifyToken, async (req, res) => {
    try {
      const goalId = new ObjectId(String(req.params.goalId));
      const { name, targetAmount, deadline } = req.body || {};
      const { users } = await connect(mongoUri);
      const child = await users.findOne({ 'goals.id': goalId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Goal not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(child._id) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const set = { 'goals.$.updatedAt': new Date() };
      if (typeof name === 'string' && name.trim().length >= 2) set['goals.$.name'] = name.trim();
      if (targetAmount !== undefined) {
        const t = Number(targetAmount);
        if (!Number.isFinite(t) || t <= 0) return res.status(400).json({ error: 'targetAmount must be > 0' });
        set['goals.$.targetAmount'] = t;
      }
      if (deadline !== undefined) {
        set['goals.$.deadline'] = deadline ? new Date(deadline) : null;
      }

      const r = await users.updateOne({ _id: child._id, 'goals.id': goalId }, { $set: set });
      return res.json({ success: true, modifiedCount: r.modifiedCount });
    } catch (error) {
      console.error('Update goal error:', error);
      return res.status(500).json({ error: 'Failed to update goal' });
    }
  });

  app.delete('/goals/:goalId', verifyToken, async (req, res) => {
    try {
      const goalId = new ObjectId(String(req.params.goalId));
      const { users } = await connect(mongoUri);
      const child = await users.findOne({ 'goals.id': goalId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Goal not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(child._id) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const r = await users.updateOne({ _id: child._id }, { $pull: { goals: { id: goalId } }, $set: { updatedAt: new Date() } });
      return res.json({ success: true, modifiedCount: r.modifiedCount });
    } catch (error) {
      console.error('Delete goal error:', error);
      return res.status(500).json({ error: 'Failed to delete goal' });
    }
  });

  // Chores endpoints
  app.post('/chores', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can create chores' });
      const { childId, name, reward, description } = req.body || {};
      if (!childId) return res.status(400).json({ error: 'childId is required' });
      const choreName = String(name || '').trim();
      const rewardNum = Number(reward);
      const desc = String(description || '').trim();
      if (!choreName || choreName.length < 2) return res.status(400).json({ error: 'Chore name must be at least 2 characters' });
      if (!Number.isFinite(rewardNum) || rewardNum <= 0) return res.status(400).json({ error: 'Reward must be > 0' });

      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(String(childId));
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

      const chore = {
        id: new ObjectId(),
        name: choreName,
        reward: rewardNum,
        description: desc,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await users.updateOne({ _id: childObjectId }, { $push: { chores: chore }, $set: { updatedAt: new Date() } });
      return res.json({ success: true, chore });
    } catch (error) {
      console.error('Create chore error:', error);
      return res.status(500).json({ error: 'Failed to create chore' });
    }
  });

  app.get('/chores/:childId', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(String(req.params.childId));
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(req.user.id) !== String(req.params.childId)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      return res.json({ success: true, chores: child.chores || [] });
    } catch (error) {
      console.error('Get chores error:', error);
      return res.status(500).json({ error: 'Failed to load chores' });
    }
  });

  app.post('/chores/:choreId/complete', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can complete chores' });
      const choreId = new ObjectId(String(req.params.choreId));
      const { users } = await connect(mongoUri);
      const child = await users.findOne({ 'chores.id': choreId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Chore not found' });
      if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });

      const chore = (child.chores || []).find(c => String(c.id) === String(choreId));
      if (!chore) return res.status(404).json({ error: 'Chore not found' });
      if (chore.status === 'completed') return res.json({ success: true, message: 'Already completed' });

      const newBalance = (child.savings || 0) + Number(chore.reward || 0);
      const tx = {
        id: new ObjectId(),
        type: 'deposit',
        amount: Number(chore.reward || 0),
        description: `Chore completed: ${chore.name}`,
        createdAt: new Date(),
        userId: String(req.user.id)
      };

      await users.updateOne(
        { _id: child._id, 'chores.id': choreId },
        {
          $set: { 'chores.$.status': 'completed', 'chores.$.updatedAt': new Date(), 'chores.$.completedAt': new Date(), savings: newBalance, updatedAt: new Date() },
          $push: { transactions: tx }
        }
      );

      return res.json({ success: true, newBalance });
    } catch (error) {
      console.error('Complete chore error:', error);
      return res.status(500).json({ error: 'Failed to complete chore' });
    }
  });

  // Statistics endpoints
  app.get('/statistics/:childId', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const childObjectId = new ObjectId(String(req.params.childId));
      const child = await users.findOne({ _id: childObjectId, role: 'child' });
      if (!child) return res.status(404).json({ error: 'Child not found' });

      if (req.user.role === 'parent') {
        if (String(child.parentId) !== String(req.user.id)) return res.status(403).json({ error: 'Not authorized' });
      } else if (req.user.role === 'child') {
        if (String(req.user.id) !== String(req.params.childId)) return res.status(403).json({ error: 'Not authorized' });
      } else {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const txs = Array.isArray(child.transactions) ? child.transactions : [];
      const sum = (arr, pred) => arr.filter(pred).reduce((a, t) => a + Number(t.amount || 0), 0);
      const count = (arr, pred) => arr.filter(pred).length;
      const isDeposit = t => t.type === 'deposit' || t.type === 'transfer-in' || t.type === 'account_creation';
      const isWithdrawal = t => t.type === 'withdrawal' || t.type === 'transfer-out';

      const totals = {
        deposits: sum(txs, isDeposit),
        withdrawals: sum(txs, isWithdrawal),
        net: sum(txs, isDeposit) - sum(txs, isWithdrawal),
        transactions: txs.length,
        counts: {
          deposits: count(txs, isDeposit),
          withdrawals: count(txs, isWithdrawal),
          transferIn: count(txs, t => t.type === 'transfer-in'),
          transferOut: count(txs, t => t.type === 'transfer-out')
        }
      };

      return res.json({ success: true, totals });
    } catch (error) {
      console.error('Child statistics error:', error);
      return res.status(500).json({ error: 'Failed to load statistics' });
    }
  });

  app.get('/statistics/family', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'parent') return res.status(403).json({ error: 'Only parents can view family statistics' });
      const { users } = await connect(mongoUri);
      const children = await users.find({ parentId: req.user.id, role: 'child' }).toArray();

      let totals = { deposits: 0, withdrawals: 0, net: 0, transactions: 0 };
      const perChild = [];

      const isDeposit = t => t.type === 'deposit' || t.type === 'transfer-in' || t.type === 'account_creation';
      const isWithdrawal = t => t.type === 'withdrawal' || t.type === 'transfer-out';

      for (const c of children) {
        const txs = Array.isArray(c.transactions) ? c.transactions : [];
        const dep = txs.filter(isDeposit).reduce((a, t) => a + Number(t.amount || 0), 0);
        const wit = txs.filter(isWithdrawal).reduce((a, t) => a + Number(t.amount || 0), 0);
        const net = dep - wit;
        totals.deposits += dep;
        totals.withdrawals += wit;
        totals.net += net;
        totals.transactions += txs.length;
        perChild.push({ id: c._id, name: c.name, username: c.username, deposits: dep, withdrawals: wit, net, transactions: txs.length, savings: c.savings || 0 });
      }

      return res.json({ success: true, totals, perChildCount: children.length, perChild });
    } catch (error) {
      console.error('Family statistics error:', error);
      return res.status(500).json({ error: 'Failed to load family statistics' });
    }
  });

  // Token verification endpoint
  app.get('/verify', verifyToken, async (req, res) => {
    try {
      const { users } = await connect(mongoUri);
      const user = await users.findOne({ _id: new ObjectId(req.user.id) });
      if (!user) return res.status(401).json({ error: 'User not found' });
      const publicUser = {
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        username: user.username,
        savings: user.savings || 0,
        goals: user.goals || [],
        parentId: user.parentId,
        preferences: user.preferences || {}
      };
      res.json({ success: true, user: publicUser });
    } catch (error) {
      console.error('Verify error:', error);
      res.status(500).json({ error: 'Token verification failed' });
    }
  });

  return app;
}

module.exports = { createApp };
