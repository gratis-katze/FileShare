const crypto = require('crypto');
const { ENCRYPTION_KEY, IV_LENGTH } = require('../utils/constants');

function encryptFile(buffer) {
  console.log('Encrypting file, input buffer length:', buffer.length);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const result = Buffer.concat([iv, encrypted]);
  console.log('Encryption complete, output buffer length:', result.length);
  return result;
}

function decryptFile(buffer) {
  console.log('Decrypting file, input buffer length:', buffer.length);
  const iv = buffer.slice(0, IV_LENGTH);
  const encryptedData = buffer.slice(IV_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  console.log('Decryption complete, output buffer length:', decrypted.length);
  return decrypted;
}

function testEncryption() {
  const testBuffer = Buffer.from('Hello FelixShare!', 'utf8');
  console.log('Testing encryption...');
  const encrypted = encryptFile(testBuffer);
  const decrypted = decryptFile(encrypted);
  console.log('Test result:', decrypted.toString('utf8'));
}

module.exports = {
  encryptFile,
  decryptFile,
  testEncryption
};