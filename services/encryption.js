const crypto = require('crypto');
const fs = require('fs');
const { Transform } = require('stream');
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

// Returns the exact decrypted file size without loading the full file.
// Reads only the last 32 bytes to determine PKCS7 padding amount.
function getDecryptedFileSize(encryptedFilePath) {
  const encryptedSize = fs.statSync(encryptedFilePath).size;
  // Last 32 bytes = [second-to-last ciphertext block (= IV for last block)][last ciphertext block]
  const last32 = Buffer.alloc(32);
  const fd = fs.openSync(encryptedFilePath, 'r');
  fs.readSync(fd, last32, 0, 32, encryptedSize - 32);
  fs.closeSync(fd);

  const blockIV = last32.slice(0, 16);
  const lastBlock = last32.slice(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, blockIV);
  decipher.setAutoPadding(false);
  const decryptedLastBlock = Buffer.concat([decipher.update(lastBlock), decipher.final()]);

  const paddingAmount = decryptedLastBlock[15]; // PKCS7: last byte = pad count
  return encryptedSize - IV_LENGTH - paddingAmount;
}

// TrimTransform skips `skip` leading bytes then emits exactly `limit` bytes total.
class TrimTransform extends Transform {
  constructor(skip, limit) {
    super();
    this.skip = skip;
    this.limit = limit;
    this.emitted = 0;
  }

  _transform(chunk, encoding, callback) {
    if (this.skip > 0) {
      if (chunk.length <= this.skip) {
        this.skip -= chunk.length;
        return callback();
      }
      chunk = chunk.slice(this.skip);
      this.skip = 0;
    }

    const remaining = this.limit - this.emitted;
    if (remaining <= 0) return callback();

    const toEmit = chunk.slice(0, remaining);
    this.emitted += toEmit.length;
    this.push(toEmit);
    callback();
  }

  _flush(callback) {
    callback();
  }
}

// Returns a readable stream emitting exactly bytes [decryptedStart, decryptedEnd] of plaintext.
// Uses AES-CBC block-aligned seek: decrypts only the needed ciphertext blocks.
function createDecryptStream(encryptedFilePath, decryptedStart, decryptedEnd) {
  const blockIndex = Math.floor(decryptedStart / 16);
  const blockOffset = decryptedStart % 16; // bytes to discard from first decrypted block
  const chunkSize = decryptedEnd - decryptedStart + 1;

  // IV position: for blockIndex=0 this yields 0 (the original IV);
  // for blockIndex=k it yields the preceding ciphertext block.
  const ivPosition = IV_LENGTH + (blockIndex - 1) * 16; // = 0 when blockIndex = 0

  const iv = Buffer.alloc(IV_LENGTH);
  const fd = fs.openSync(encryptedFilePath, 'r');
  fs.readSync(fd, iv, 0, IV_LENGTH, ivPosition);
  fs.closeSync(fd);

  const encReadStart = IV_LENGTH + blockIndex * 16;
  const encReadEnd = IV_LENGTH + (Math.floor(decryptedEnd / 16) + 1) * 16 - 1;

  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  decipher.setAutoPadding(false);

  const readStream = fs.createReadStream(encryptedFilePath, { start: encReadStart, end: encReadEnd });
  const trim = new TrimTransform(blockOffset, chunkSize);

  readStream.on('error', (err) => trim.destroy(err));
  decipher.on('error', (err) => trim.destroy(err));

  return readStream.pipe(decipher).pipe(trim);
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
  testEncryption,
  getDecryptedFileSize,
  createDecryptStream,
};