const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ENCRYPTION_KEY = crypto.scryptSync('felixshare-secret-key', 'salt', 32);
const IV_LENGTH = 16;

const uploadDir = path.join(__dirname, '..', 'uploads');
const publicDir = path.join(uploadDir, 'public');
const tempDir = path.join(__dirname, '..', 'temp');
const usersFile = path.join(__dirname, '..', 'users.json');

module.exports = {
  PORT,
  ENCRYPTION_KEY,
  IV_LENGTH,
  uploadDir,
  publicDir,
  tempDir,
  usersFile
};