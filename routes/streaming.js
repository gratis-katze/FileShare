const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { publicDir } = require('../utils/constants');
const { getUserUploadDir } = require('../services/fileOperations');
const { decryptFile } = require('../services/encryption');
const { loadFileMapping } = require('../services/fileMapping');

const router = express.Router();

// Video streaming endpoint for public files
router.get('/stream/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(actualFilePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(actualFilePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(actualFilePath).pipe(res);
  }
});

// Video streaming endpoint for private files
router.get('/stream/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  const fileMapping = loadFileMapping(req.session.user.name);
  const obfuscatedName = fileMapping[requestedPath];
  
  if (!obfuscatedName) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const actualFilePath = path.join(userDir, obfuscatedName);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const encryptedBuffer = fs.readFileSync(actualFilePath);
    const decryptedBuffer = decryptFile(encryptedBuffer);
    
    const fileSize = decryptedBuffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      res.end(decryptedBuffer.slice(start, end + 1));
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      res.end(decryptedBuffer);
    }
  } catch (error) {
    res.status(500).json({ error: 'Unable to decrypt and stream file' });
  }
});

// Image serving endpoint for public files
router.get('/image/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(actualFilePath).toLowerCase();
  let contentType = 'image/jpeg';
  
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff'
  };
  
  contentType = mimeTypes[ext] || contentType;

  const stat = fs.statSync(actualFilePath);
  const fileSize = stat.size;
  
  res.set({
    'Content-Type': contentType,
    'Content-Length': fileSize,
    'Cache-Control': 'public, max-age=3600'
  });
  
  fs.createReadStream(actualFilePath).pipe(res);
});

// Image serving endpoint for private files
router.get('/image/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  const fileMapping = loadFileMapping(req.session.user.name);
  const obfuscatedName = fileMapping[requestedPath];
  
  if (!obfuscatedName) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const actualFilePath = path.join(userDir, obfuscatedName);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const encryptedBuffer = fs.readFileSync(actualFilePath);
    const decryptedBuffer = decryptFile(encryptedBuffer);
    
    const ext = path.extname(requestedPath).toLowerCase();
    let contentType = 'image/jpeg';
    
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.tiff': 'image/tiff'
    };
    
    contentType = mimeTypes[ext] || contentType;
    
    res.set({
      'Content-Type': contentType,
      'Content-Length': decryptedBuffer.length,
      'Cache-Control': 'private, max-age=3600'
    });
    
    res.end(decryptedBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Unable to decrypt and serve image' });
  }
});

module.exports = router;