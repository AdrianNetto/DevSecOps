const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lablend-uploads-'));
