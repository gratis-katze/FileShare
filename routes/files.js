const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { publicDir, tempDir } = require('../utils/constants');
const { getUserUploadDir, getTopLevelItems, ensureDirectoryExists } = require('../services/fileOperations');
const { encryptFile, decryptFile } = require('../services/encryption');
const { obfuscateFilename, loadFileMapping, saveFileMapping } = require('../services/fileMapping');

const router = express.Router();

// Setup directories
ensureDirectoryExists(publicDir);
ensureDirectoryExists(tempDir);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// File listing routes
router.get('/public', (req, res) => {
  try {
    ensureDirectoryExists(publicDir);
    const fileList = getTopLevelItems(publicDir, null);
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read public files' });
  }
});

router.get('/private', requireAuth, (req, res) => {
  try {
    const targetDir = getUserUploadDir(req.session.user.name);
    const username = req.session.user.name;
    ensureDirectoryExists(targetDir);
    const fileList = getTopLevelItems(targetDir, username);
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read private files' });
  }
});

// Legacy endpoint for backwards compatibility
router.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/files/private');
  } else {
    res.redirect('/files/public');
  }
});

// Upload route
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const relativePath = req.body.relativePath;
    const isUserFile = !!req.session.user;
    console.log('Upload request - Session user:', req.session.user, 'isUserFile:', isUserFile);
    
    const userDir = isUserFile ? getUserUploadDir(req.session.user.name) : publicDir;
    const finalFilename = relativePath || req.file.originalname;
    const targetPath = path.join(userDir, finalFilename);
    const targetDir = path.dirname(targetPath);
    
    ensureDirectoryExists(targetDir);
    
    const fileBuffer = fs.readFileSync(req.file.path);
    
    if (isUserFile) {
      console.log(`Encrypting user file: ${finalFilename} for user: ${req.session.user.name}`);
      const encryptedBuffer = encryptFile(fileBuffer);
      console.log(`Original size: ${fileBuffer.length}, Encrypted size: ${encryptedBuffer.length}`);
      
      const obfuscatedName = obfuscateFilename(finalFilename);
      const obfuscatedPath = path.join(path.dirname(targetPath), obfuscatedName);
      
      const fileMapping = loadFileMapping(req.session.user.name);
      fileMapping[finalFilename] = obfuscatedName;
      saveFileMapping(req.session.user.name, fileMapping);
      
      fs.writeFileSync(obfuscatedPath, encryptedBuffer);
    } else {
      console.log(`Saving public file unencrypted: ${finalFilename}`);
      fs.writeFileSync(targetPath, fileBuffer);
    }
    
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      message: 'File uploaded successfully', 
      filename: finalFilename,
      size: req.file.size,
      space: isUserFile ? 'private' : 'public'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Download routes
router.get('/download/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(actualFilePath);
});

router.get('/download/private/*', requireAuth, (req, res) => {
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
    
    res.set({
      'Content-Disposition': `attachment; filename="${requestedPath}"`,
      'Content-Type': 'application/octet-stream'
    });
    res.send(decryptedBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Unable to decrypt file' });
  }
});

// Legacy download endpoint
router.get('/download/*', (req, res) => {
  const requestedPath = req.params[0];
  if (req.session.user) {
    res.redirect(`/download/private/${requestedPath}`);
  } else {
    res.redirect(`/download/public/${requestedPath}`);
  }
});

// Delete routes
router.delete('/delete/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const stats = fs.statSync(actualFilePath);
  
  if (stats.isDirectory()) {
    fs.rmdir(actualFilePath, { recursive: true }, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete directory' });
      }
      res.json({ message: 'Directory deleted successfully' });
    });
  } else {
    fs.unlink(actualFilePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete file' });
      }
      res.json({ message: 'File deleted successfully' });
    });
  }
});

router.delete('/delete/private/*', requireAuth, (req, res) => {
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
  
  const stats = fs.statSync(actualFilePath);
  
  if (stats.isDirectory()) {
    fs.rmdir(actualFilePath, { recursive: true }, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete directory' });
      }
      
      // Clean up file mapping for all files in the deleted directory
      const fileMapping = loadFileMapping(req.session.user.name);
      const keysToDelete = Object.keys(fileMapping).filter(key => 
        key === requestedPath || key.startsWith(requestedPath + '/')
      );
      
      keysToDelete.forEach(key => {
        delete fileMapping[key];
      });
      
      saveFileMapping(req.session.user.name, fileMapping);
      
      res.json({ message: 'Directory deleted successfully' });
    });
  } else {
    fs.unlink(actualFilePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete file' });
      }
      
      const fileMapping = loadFileMapping(req.session.user.name);
      delete fileMapping[requestedPath];
      saveFileMapping(req.session.user.name, fileMapping);
      
      res.json({ message: 'File deleted successfully' });
    });
  }
});

// Legacy delete endpoint
router.delete('/delete/*', (req, res) => {
  const requestedPath = req.params[0];
  if (req.session.user) {
    res.redirect(307, `/delete/private/${requestedPath}`);
  } else {
    res.redirect(307, `/delete/public/${requestedPath}`);
  }
});

module.exports = router;