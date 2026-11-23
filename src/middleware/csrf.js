const Tokens = require('csrf');
const { forbidden } = require('../utils/errors');

const tokens = new Tokens();
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Synchronizer-token CSRF protection for the session-based web routes.
// The secret lives in the session; every rendered page gets a fresh token in res.locals.csrfToken.
function csrfProtection(req, res, next) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }
  const secret = req.session.csrfSecret;
  res.locals.csrfToken = tokens.create(secret);

  if (SAFE_METHODS.includes(req.method)) return next();

  // multipart/form-data bodies are parsed later (inside the route), so those forms send the token in the query string.
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token') || (req.query && req.query._csrf);
  if (typeof token !== 'string' || !tokens.verify(secret, token)) {
    return next(forbidden('Invalid or missing CSRF token'));
  }
  return next();
}

module.exports = { csrfProtection };
