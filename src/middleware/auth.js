const crypto = require('crypto');

const isProduction = () => process.env.NODE_ENV === 'production';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const unauthorized = (res, message) => res.status(401).json({ success: false, message, error: 'Unauthorized' });
const notConfigured = (res, what) =>
  res.status(503).json({ success: false, message: `${what} is not configured on the server`, error: 'Service unavailable' });

/* ------------------------------------------------------------------ */
/* Ground station: shared device key in `x-device-key`                 */
/* ------------------------------------------------------------------ */

const deviceAuth = (req, res, next) => {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) {
    // Fail closed in production. Locally (development, test) the device API stays open for demos.
    if (isProduction()) return notConfigured(res, 'DEVICE_API_KEY');
    return next();
  }
  const provided = req.get('x-device-key');
  if (provided && safeEqual(provided, expected)) return next();
  return unauthorized(res, 'Invalid or missing device key');
};

/* ------------------------------------------------------------------ */
/* Admin: signed session token (JWT, HS256) from POST /api/admin/auth  */
/* ------------------------------------------------------------------ */

const b64url = (input) => Buffer.from(input).toString('base64url');
const TOKEN_TTL_HOURS = () => Math.max(1, Number(process.env.ADMIN_SESSION_HOURS) || 12);

const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
};

const signToken = (payload, secret, ttlSeconds) => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
};

const verifyToken = (token, secret) => {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const head = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (head.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
};

/**
 * Password check. Prefer ADMIN_PASSWORD_HASH (made with `npm run hash-password`), format
 * `scrypt:<salt hex>:<hash hex>`. ADMIN_PASSWORD (plain) is accepted as a simpler fallback.
 */
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `scrypt:${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;

const passwordMatches = (password) => {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (stored) {
    const [scheme, salt, hash] = stored.split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return safeEqual(candidate, hash);
  }
  const plain = process.env.ADMIN_PASSWORD;
  return Boolean(plain) && safeEqual(password, plain);
};

const adminConfigured = () => Boolean(jwtSecret() && process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD));

/* Small in-memory limiter: 5 failed logins per IP per 15 minutes. */
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const tooManyAttempts = (ip) => {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
};
const recordFailure = (ip) => {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(ip, { first: Date.now(), count: 1 });
  else entry.count += 1;
};
const resetLoginLimiter = () => failures.clear();

/** POST /api/admin/auth/login  { email, password } -> { token, expiresAt, email } */
const login = (req, res) => {
  if (!adminConfigured()) return notConfigured(res, 'Admin login (ADMIN_EMAIL, ADMIN_PASSWORD_HASH or ADMIN_PASSWORD, JWT_SECRET of 32+ characters)');
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again in 15 minutes.', error: 'Too many requests' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const emailOk = safeEqual(email, String(process.env.ADMIN_EMAIL).trim().toLowerCase());
  const passOk = passwordMatches(password);
  if (!emailOk || !passOk) {
    recordFailure(ip);
    return unauthorized(res, 'Email or password is incorrect');
  }
  failures.delete(ip);
  const ttl = TOKEN_TTL_HOURS() * 3600;
  const token = signToken({ sub: email, role: 'admin' }, jwtSecret(), ttl);
  return res.json({ success: true, data: { token, email, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() } });
};

/**
 * Every /api/admin route (except login) needs `Authorization: Bearer <token>`.
 * Scripts may instead send `x-admin-key` when ADMIN_API_KEY is set.
 */
const adminAuth = (req, res, next) => {
  const apiKey = process.env.ADMIN_API_KEY;
  const providedKey = req.get('x-admin-key');
  if (apiKey && providedKey && safeEqual(providedKey, apiKey)) {
    req.admin = { sub: 'api-key', role: 'admin' };
    return next();
  }
  const secret = jwtSecret();
  if (!secret) return notConfigured(res, 'Admin login');
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const claims = token && verifyToken(token, secret);
  if (!claims || claims.role !== 'admin') return unauthorized(res, 'Please sign in to the admin dashboard');
  req.admin = claims;
  return next();
};

module.exports = { deviceAuth, adminAuth, login, hashPassword, signToken, verifyToken, resetLoginLimiter };
