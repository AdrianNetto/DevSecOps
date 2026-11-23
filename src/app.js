const path = require('path');
const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const config = require('./config');
const { getDb } = require('./config/database');
const { loadSessionUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

function createApp() {
  getDb();
  const app = express();

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.disable('x-powered-by');

  if (config.env !== 'test') {
    app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
  }

  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(config.uploadDir));

  app.use('/api', apiRoutes);

  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(
    session({
      name: 'lablend.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );
  app.use(loadSessionUser);
  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.currentPath = req.path;
    res.locals.formatCents = (cents) => `R$ ${((cents || 0) / 100).toFixed(2)}`;
    next();
  });
  // After the view locals above so a CSRF failure can still render the error page.
  app.use(csrfProtection);

  app.use('/', webRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
