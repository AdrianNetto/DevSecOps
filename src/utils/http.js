const { AppError } = require('./errors');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function setFlash(req, type, message) {
  if (req.session) req.session.flash = { type, message };
}

// For web form submissions: business errors (4xx) become a flash message + redirect
// back to the form; unexpected errors fall through to the error handler.
function formAction(fn, errorRedirect) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof AppError && err.status < 500) {
        setFlash(req, 'error', err.message);
        const target = typeof errorRedirect === 'function' ? errorRedirect(req) : errorRedirect;
        return res.redirect(target || req.get('Referer') || '/');
      }
      return next(err);
    }
  };
}

module.exports = { asyncHandler, setFlash, formAction };
