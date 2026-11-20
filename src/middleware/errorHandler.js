const config = require('../config');

function notFoundHandler(req, res) {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).render('error', { title: 'Not found', status: 404, message: 'Page not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500 && config.env !== 'test') {
    console.error(err);
  }
  const message = status >= 500 ? 'Internal server error' : err.message;

  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: message, code: err.code });
  }
  return res.status(status).render('error', { title: 'Error', status, message });
}

module.exports = { notFoundHandler, errorHandler };
