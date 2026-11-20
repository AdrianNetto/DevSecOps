const userService = require('../services/userService');
const { unauthorized } = require('../utils/errors');

// Loads the logged-in user (session) for every web request and exposes it to views.
function loadSessionUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    const user = userService.getById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
    } else {
      delete req.session.userId;
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.session) req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function requireApiAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized('Missing bearer token'));
  try {
    const payload = userService.verifyToken(token);
    const user = userService.getById(payload.sub);
    if (!user) return next(unauthorized('User no longer exists'));
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { loadSessionUser, requireLogin, requireApiAuth };
