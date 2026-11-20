const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { badRequest } = require('../utils/errors');

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() === '.png' ? '.png' : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.upload.allowedMimeTypes.includes(file.mimetype) || !config.upload.allowedExtensions.includes(ext)) {
    return cb(badRequest('Only JPG and PNG images are allowed', 'INVALID_FILE_TYPE'));
  }
  return cb(null, true);
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxBytes, files: 1 },
});

// Wraps multer so its errors become AppErrors with a 400 status.
function equipmentPhoto(req, res, next) {
  uploader.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be at most 2 MB' : err.message;
      return next(badRequest(message, err.code));
    }
    return next(err);
  });
}

module.exports = { equipmentPhoto };

// Promise form for use inside form handlers so upload errors can be flashed like other validation errors.
function parseEquipmentPhoto(req, res) {
  return new Promise((resolve, reject) => {
    equipmentPhoto(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

function discardUploadedFile(req) {
  if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
}

module.exports.parseEquipmentPhoto = parseEquipmentPhoto;
module.exports.discardUploadedFile = discardUploadedFile;
