const { forbidden, unauthorized } = require('../utils/errors');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

const requireStaff = requireRole('TECHNICIAN', 'ADMIN');
const requireAdmin = requireRole('ADMIN');

module.exports = { requireRole, requireStaff, requireAdmin };
