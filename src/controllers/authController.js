const userService = require('../services/userService');
const auditService = require('../services/auditService');
const { setFlash } = require('../utils/http');
const { AppError } = require('../utils/errors');

function showLogin(req, res) {
  if (req.user) return res.redirect('/');
  return res.render('auth/login', { title: 'Log in', email: '' });
}

async function login(req, res, next) {
  const { email, password } = req.body;
  try {
    const user = await userService.authenticate(email, password);
    const returnTo = req.session.returnTo;
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      setFlash(req, 'success', `Welcome back, ${user.name}!`);
      const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//');
      return res.redirect(safeReturn ? returnTo : '/');
    });
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      return res.status(err.status).render('auth/login', { title: 'Log in', email, error: err.message });
    }
    return next(err);
  }
}

function showRegister(req, res) {
  if (req.user) return res.redirect('/');
  return res.render('auth/register', { title: 'Register', form: {} });
}

async function register(req, res, next) {
  const { name, email, password, password_confirm: passwordConfirm } = req.body;
  try {
    if (password !== passwordConfirm) {
      return res
        .status(400)
        .render('auth/register', { title: 'Register', form: { name, email }, error: 'Passwords do not match' });
    }
    const user = await userService.register({ name, email, password });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      setFlash(req, 'success', 'Account created. Welcome to LabLend!');
      return res.redirect('/');
    });
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      return res
        .status(err.status)
        .render('auth/register', { title: 'Register', form: { name, email }, error: err.message });
    }
    return next(err);
  }
  return undefined;
}

function logout(req, res, next) {
  const userId = req.user && req.user.id;
  req.session.destroy((err) => {
    if (err) return next(err);
    if (userId) auditService.log(userId, 'USER_LOGOUT', 'User', userId);
    res.clearCookie('lablend.sid');
    return res.redirect('/login');
  });
}

module.exports = { showLogin, login, showRegister, register, logout };
