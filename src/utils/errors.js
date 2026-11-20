class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg, code = 'BAD_REQUEST') => new AppError(400, msg, code);
const unauthorized = (msg = 'Authentication required') => new AppError(401, msg, 'UNAUTHORIZED');
const forbidden = (msg = 'You are not allowed to perform this action') => new AppError(403, msg, 'FORBIDDEN');
const notFound = (msg = 'Not found') => new AppError(404, msg, 'NOT_FOUND');
const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, code);
const locked = (msg) => new AppError(423, msg, 'ACCOUNT_LOCKED');

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, locked };
