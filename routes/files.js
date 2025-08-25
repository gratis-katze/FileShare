const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { requireAuth } = require('../middleware/auth');
const { publicDir, tempDir } = require('../utils/constants');
const { getUserUploadDir, getTopLevelItems, ensureDirectoryExists } = require('../services/fileOperations');
const { encryptFile, decryptFile } = require('../services/encryption');
const { obfuscateFilename, loadFileMapping, saveFileMapping } = require('../services/fileMapping');

const router = express.Router();

// Setup directories
ensureDirectoryExists(publicDir);
ensureDirectoryExists(tempDir);

// Multer configuration with improved settings for large files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
    files: 1 // Limit to 1 file per request for better error handling
  },
  fileFilter: (req, file, cb) => {
    // Basic file validation
    if (!file.originalname || file.originalname.trim() === '') {
      return cb(new Error('Invalid file name'), false);
    }
    cb(null, true);
  }
});

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

// Upload route with improved error handling
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 500MB.' });
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Upload one file at a time.' });
      } else if (err.message.includes('Invalid file name')) {
        return res.status(400).json({ error: 'Invalid file name provided.' });
      }
      
      return res.status(400).json({ error: err.message || 'Upload failed during file processing' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Process the upload asynchronously for better performance
    processUpload(req, res);
  });
});

async function processUpload(req, res) {
  const startTime = Date.now();
  let tempFilePath = null;
  
  try {
    tempFilePath = req.file.path;
    const relativePath = req.body.relativePath;
    const uploadSpace = req.body.uploadSpace || 'public'; // Default to public if not specified
    
    // Validate that user is authenticated for private uploads
    if (uploadSpace === 'private' && !req.session.user) {
      throw new Error('Authentication required for private uploads');
    }
    
    const isUserFile = (uploadSpace === 'private') && !!req.session.user;
    const fileSize = req.file.size;
    
    console.log(`Upload started: ${req.file.originalname} (${fileSize} bytes) - Space: ${uploadSpace} - User: ${req.session.user?.name || 'anonymous'}`);
    
    // Validate file size on disk to ensure it matches the reported size
    const stats = fs.statSync(tempFilePath);
    if (stats.size !== fileSize) {
      throw new Error(`File size mismatch. Expected ${fileSize}, got ${stats.size}`);
    }
    
    const userDir = isUserFile ? getUserUploadDir(req.session.user.name) : publicDir;
    const finalFilename = relativePath || req.file.originalname;
    const targetPath = path.join(userDir, finalFilename);
    const targetDir = path.dirname(targetPath);
    
    // Ensure target directory exists
    ensureDirectoryExists(targetDir);
    
    // Check available disk space (basic check)
    try {
      const testPath = path.join(targetDir, `.test-${Date.now()}`);
      fs.writeFileSync(testPath, 'test');
      fs.unlinkSync(testPath);
    } catch (diskError) {
      throw new Error('Insufficient disk space or directory not writable');
    }
    
    if (isUserFile) {
      console.log(`Encrypting user file: ${finalFilename} for user: ${req.session.user.name}`);
      
      // Stream processing for large files to avoid memory issues
      const fileBuffer = fs.readFileSync(tempFilePath);
      const encryptedBuffer = encryptFile(fileBuffer);
      
      console.log(`Original size: ${fileBuffer.length}, Encrypted size: ${encryptedBuffer.length}`);
      
      const obfuscatedName = obfuscateFilename(finalFilename);
      const obfuscatedPath = path.join(path.dirname(targetPath), obfuscatedName);
      
      // Atomic file operations to prevent corruption
      const tempTargetPath = `${obfuscatedPath}.tmp`;
      fs.writeFileSync(tempTargetPath, encryptedBuffer);
      fs.renameSync(tempTargetPath, obfuscatedPath);
      
      // Update file mapping
      const fileMapping = loadFileMapping(req.session.user.name);
      fileMapping[finalFilename] = obfuscatedName;
      saveFileMapping(req.session.user.name, fileMapping);
      
    } else {
      console.log(`Saving public file unencrypted: ${finalFilename}`);
      
      // Atomic file operations to prevent corruption
      const tempTargetPath = `${targetPath}.tmp`;
      fs.copyFileSync(tempFilePath, tempTargetPath);
      fs.renameSync(tempTargetPath, targetPath);
    }
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    const uploadTime = Date.now() - startTime;
    console.log(`Upload completed: ${finalFilename} in ${uploadTime}ms`);
    
    res.json({ 
      message: 'File uploaded successfully', 
      filename: finalFilename,
      size: fileSize,
      space: uploadSpace,
      uploadTime: uploadTime
    });
    
  } catch (error) {
    console.error('Upload processing error:', error);
    
    // Clean up temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Failed to clean up temp file:', cleanupError);
      }
    }
    
    // Provide specific error messages
    let errorMessage = 'Upload failed';
    let statusCode = 500;
    
    if (error.message.includes('ENOSPC')) {
      errorMessage = 'Insufficient disk space';
      statusCode = 507;
    } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
      errorMessage = 'Permission denied';
      statusCode = 403;
    } else if (error.message.includes('File size mismatch')) {
      errorMessage = 'File upload corrupted';
      statusCode = 400;
    } else if (error.message.includes('disk space') || error.message.includes('not writable')) {
      errorMessage = error.message;
      statusCode = 507;
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
}

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

// Folder download routes (ZIP)
router.get('/download-folder/public/*', (req, res) => {
  const requestedPath = decodeURIComponent(req.params[0]);
  const folderPath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  downloadFolderAsZip(folderPath, requestedPath, res, false);
});

router.get('/download-folder/private/*', requireAuth, (req, res) => {
  const requestedPath = decodeURIComponent(req.params[0]);
  const userDir = getUserUploadDir(req.session.user.name);
  const username = req.session.user.name;
  
  // For private folders, we need to handle encrypted files
  downloadPrivateFolderAsZip(requestedPath, userDir, username, res);
});

// Legacy folder download endpoint
router.get('/download-folder/*', (req, res) => {
  const requestedPath = decodeURIComponent(req.params[0]);
  if (req.session.user) {
    res.redirect(`/download-folder/private/${requestedPath}`);
  } else {
    res.redirect(`/download-folder/public/${requestedPath}`);
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
    fs.rm(actualFilePath, { recursive: true, force: true }, (err) => {
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
  
  // For directories, we need to find the actual directory path differently
  // First, check if this is a top-level directory by looking for files that start with this path
  const filesInPath = Object.keys(fileMapping).filter(key => 
    key === requestedPath || key.startsWith(requestedPath + '/')
  );
  
  if (filesInPath.length === 0) {
    return res.status(404).json({ error: 'File or directory not found' });
  }
  
  // Check if it's a directory by seeing if we have files with this path as a prefix
  const isDirectory = filesInPath.some(key => key.startsWith(requestedPath + '/'));
  
  if (isDirectory) {
    // It's a directory - we need to delete all files in it and clean up the directory
    let deletedFiles = 0;
    let errors = [];
    
    filesInPath.forEach(filePath => {
      const obfuscatedName = fileMapping[filePath];
      if (obfuscatedName) {
        const actualFilePath = path.join(userDir, obfuscatedName);
        try {
          if (fs.existsSync(actualFilePath)) {
            fs.unlinkSync(actualFilePath);
            deletedFiles++;
          }
        } catch (error) {
          errors.push(`Failed to delete ${filePath}: ${error.message}`);
        }
      }
    });
    
    // Try to remove the empty directory
    const directoryPath = path.join(userDir, requestedPath);
    try {
      if (fs.existsSync(directoryPath)) {
        fs.rmSync(directoryPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.log('Could not remove directory structure:', error.message);
    }
    
    // Clean up file mapping for all files in the deleted directory
    const updatedFileMapping = loadFileMapping(req.session.user.name);
    filesInPath.forEach(key => {
      delete updatedFileMapping[key];
    });
    saveFileMapping(req.session.user.name, updatedFileMapping);
    
    if (errors.length > 0) {
      return res.status(500).json({ 
        error: `Deleted ${deletedFiles} files but encountered ${errors.length} errors`,
        details: errors
      });
    }
    
    res.json({ message: `Directory deleted successfully (${deletedFiles} files removed)` });
  } else {
    // It's a single file
    const obfuscatedName = fileMapping[requestedPath];
    
    if (!obfuscatedName) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const actualFilePath = path.join(userDir, obfuscatedName);
    
    if (!fs.existsSync(actualFilePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlink(actualFilePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete file' });
      }
      
      const updatedFileMapping = loadFileMapping(req.session.user.name);
      delete updatedFileMapping[requestedPath];
      saveFileMapping(req.session.user.name, updatedFileMapping);
      
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

// Utility functions for folder downloads
function downloadFolderAsZip(folderPath, folderName, res, isEncrypted = false) {
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  // Set the response headers
  const zipName = `${path.basename(folderName)}.zip`;
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipName}"`
  });

  // Pipe the archive to the response
  archive.pipe(res);

  // Handle archive errors
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    }
  });

  // Add files to the archive recursively
  try {
    addFolderToArchive(archive, folderPath, '');
    archive.finalize();
  } catch (error) {
    console.error('Error adding files to archive:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to add files to archive' });
    }
  }
}

function downloadPrivateFolderAsZip(requestedPath, userDir, username, res) {
  const fileMapping = loadFileMapping(username);
  
  // Find all files that belong to this folder
  const folderFiles = Object.keys(fileMapping).filter(key => 
    key === requestedPath || key.startsWith(requestedPath + '/')
  );

  if (folderFiles.length === 0) {
    return res.status(404).json({ error: 'Folder not found or empty' });
  }

  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  const zipName = `${path.basename(requestedPath)}.zip`;
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipName}"`
  });

  archive.pipe(res);

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    }
  });

  try {
    // Add each encrypted file to the archive after decrypting it
    let filesAdded = 0;
    const totalFiles = folderFiles.length;

    folderFiles.forEach((filePath, index) => {
      const obfuscatedName = fileMapping[filePath];
      const actualFilePath = path.join(userDir, obfuscatedName);

      if (fs.existsSync(actualFilePath)) {
        try {
          const encryptedBuffer = fs.readFileSync(actualFilePath);
          const decryptedBuffer = decryptFile(encryptedBuffer);
          
          // Calculate the relative path within the folder
          const relativePath = filePath.startsWith(requestedPath + '/') 
            ? filePath.substring(requestedPath.length + 1)
            : path.basename(filePath);

          archive.append(decryptedBuffer, { name: relativePath });
          filesAdded++;
        } catch (error) {
          console.error(`Failed to decrypt file ${filePath}:`, error);
        }
      }

      // Finalize when all files are processed
      if (index === totalFiles - 1) {
        console.log(`Added ${filesAdded} files to archive for folder: ${requestedPath}`);
        archive.finalize();
      }
    });
  } catch (error) {
    console.error('Error creating private folder archive:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create folder archive' });
    }
  }
}

function addFolderToArchive(archive, folderPath, prefix) {
  const items = fs.readdirSync(folderPath);
  
  for (const item of items) {
    const itemPath = path.join(folderPath, item);
    const archivePath = prefix ? path.join(prefix, item) : item;
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      // Recursively add subdirectories
      addFolderToArchive(archive, itemPath, archivePath);
    } else {
      // Add file to archive
      archive.file(itemPath, { name: archivePath });
    }
  }
}

module.exports = router;