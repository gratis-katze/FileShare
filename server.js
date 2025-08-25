const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  credentials: true,
  origin: true
}));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static('public'));

const usersFile = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Error loading users:', error.message);
  }
  return [];
}

function saveUsers(users) {
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  } catch (error) {
    console.log('Error saving users:', error.message);
  }
}

let users = loadUsers();

// Encryption utilities
const ENCRYPTION_KEY = crypto.scryptSync('felixshare-secret-key', 'salt', 32);
const IV_LENGTH = 16;

// Filename obfuscation utilities
function obfuscateFilename(originalName) {
  return crypto.createHash('sha256').update(originalName + Date.now()).digest('hex');
}

function getFileMappingPath(username) {
  return path.join(getUserUploadDir(username), '.filemapping.json');
}

function loadFileMapping(username) {
  try {
    const mappingPath = getFileMappingPath(username);
    if (fs.existsSync(mappingPath)) {
      const data = fs.readFileSync(mappingPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Error loading file mapping:', error.message);
  }
  return {};
}

function saveFileMapping(username, mapping) {
  try {
    const mappingPath = getFileMappingPath(username);
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
  } catch (error) {
    console.log('Error saving file mapping:', error.message);
  }
}

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

// Test encryption on startup
const testBuffer = Buffer.from('Hello FelixShare!', 'utf8');
console.log('Testing encryption...');
const encrypted = encryptFile(testBuffer);
const decrypted = decryptFile(encrypted);
console.log('Test result:', decrypted.toString('utf8'));

const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'uploads', 'public');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Always use temp directory for initial storage
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Use unique temporary filename
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function getUserUploadDir(username) {
  if (!username) return publicDir;
  return path.join(uploadDir, username);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/auth/register', async (req, res) => {
  const { name, password } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }
  
  if (users.find(user => user.name === name)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { name, password: hashedPassword };
  users.push(user);
  saveUsers(users);
  
  const userDir = getUserUploadDir(name);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  
  req.session.user = { name };
  res.json({ message: 'User created successfully', user: { name } });
});

app.post('/auth/login', async (req, res) => {
  const { name, password } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }
  
  const user = users.find(u => u.name === name);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  req.session.user = { name };
  res.json({ message: 'Login successful', user: { name } });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logout successful' });
});

app.get('/auth/status', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

function getFilesRecursively(dir, basePath = '', username = null) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  // Load file mapping for user files
  let reverseMapping = {};
  if (username) {
    const fileMapping = loadFileMapping(username);
    // Create reverse mapping: obfuscated -> original
    Object.keys(fileMapping).forEach(original => {
      reverseMapping[fileMapping[original]] = original;
    });
  }
  
  items.forEach(item => {
    // Skip the file mapping file itself
    if (item === '.filemapping.json') return;
    
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    // For user files, use original filename from mapping
    const displayName = username && reverseMapping[item] ? reverseMapping[item] : item;
    const relativePath = basePath ? path.join(basePath, displayName) : displayName;
    
    if (stats.isDirectory()) {
      const children = getFilesRecursively(itemPath, relativePath, username);
      files.push({
        name: displayName,
        path: relativePath,
        type: 'directory',
        size: 0,
        modified: stats.mtime,
        children: children,
        fileCount: children.filter(child => child.type === 'file').length + 
                  children.filter(child => child.type === 'directory').reduce((sum, child) => sum + (child.fileCount || 0), 0)
      });
    } else {
      files.push({
        name: displayName,
        path: relativePath,
        type: 'file',
        size: stats.size,
        modified: stats.mtime
      });
    }
  });
  
  return files;
}

function getTopLevelItems(dir, username = null) {
  const items = [];
  const dirItems = fs.readdirSync(dir);
  
  // Load file mapping for user files
  let reverseMapping = {};
  if (username) {
    const fileMapping = loadFileMapping(username);
    // Create reverse mapping: obfuscated -> original
    Object.keys(fileMapping).forEach(original => {
      reverseMapping[fileMapping[original]] = original;
    });
  }
  
  dirItems.forEach(item => {
    // Skip the file mapping file itself
    if (item === '.filemapping.json') return;
    
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    // For user files, use original filename from mapping
    const displayName = username && reverseMapping[item] ? reverseMapping[item] : item;
    
    if (stats.isDirectory()) {
      const children = getFilesRecursively(itemPath, displayName, username);
      items.push({
        name: displayName,
        path: displayName,
        type: 'directory',
        size: 0,
        modified: stats.mtime,
        children: children,
        fileCount: children.filter(child => child.type === 'file').length + 
                  children.filter(child => child.type === 'directory').reduce((sum, child) => sum + (child.fileCount || 0), 0)
      });
    } else {
      items.push({
        name: displayName,
        path: displayName,
        type: 'file',
        size: stats.size,
        modified: stats.mtime
      });
    }
  });
  
  return items;
}

app.get('/files/public', (req, res) => {
  try {
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const fileList = getTopLevelItems(publicDir, null);
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read public files' });
  }
});

app.get('/files/private', requireAuth, (req, res) => {
  try {
    const targetDir = getUserUploadDir(req.session.user.name);
    const username = req.session.user.name;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const fileList = getTopLevelItems(targetDir, username);
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read private files' });
  }
});

// Legacy endpoint for backwards compatibility
app.get('/files', (req, res) => {
  if (req.session.user) {
    // Redirect to private files for authenticated users
    res.redirect('/files/private');
  } else {
    // Redirect to public files for unauthenticated users
    res.redirect('/files/public');
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const relativePath = req.body.relativePath;
    const isUserFile = !!req.session.user;
    console.log('Upload request - Session user:', req.session.user, 'isUserFile:', isUserFile);
    
    // Determine target directory based on authentication status
    const userDir = isUserFile ? getUserUploadDir(req.session.user.name) : publicDir;
    
    // Determine final filename
    const finalFilename = relativePath || req.file.originalname;
    const targetPath = path.join(userDir, finalFilename);
    const targetDir = path.dirname(targetPath);
    
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Read the uploaded file from temp location
    const fileBuffer = fs.readFileSync(req.file.path);
    
    if (isUserFile) {
      // Encrypt and save user files with obfuscated filename
      console.log(`Encrypting user file: ${finalFilename} for user: ${req.session.user.name}`);
      const encryptedBuffer = encryptFile(fileBuffer);
      console.log(`Original size: ${fileBuffer.length}, Encrypted size: ${encryptedBuffer.length}`);
      
      // Generate obfuscated filename and update mapping
      const obfuscatedName = obfuscateFilename(finalFilename);
      const obfuscatedPath = path.join(path.dirname(targetPath), obfuscatedName);
      
      // Load and update file mapping
      const fileMapping = loadFileMapping(req.session.user.name);
      fileMapping[finalFilename] = obfuscatedName;
      saveFileMapping(req.session.user.name, fileMapping);
      
      fs.writeFileSync(obfuscatedPath, encryptedBuffer);
    } else {
      // Save public files unencrypted
      console.log(`Saving public file unencrypted: ${finalFilename}`);
      fs.writeFileSync(targetPath, fileBuffer);
    }
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      message: 'File uploaded successfully', 
      filename: finalFilename,
      size: req.file.size,
      space: isUserFile ? 'private' : 'public'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/download/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Public files served as-is (unencrypted)
  res.download(actualFilePath);
});

// Video streaming endpoint for public files
app.get('/stream/public/*', (req, res) => {
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

// Image serving endpoint for public files
app.get('/image/public/*', (req, res) => {
  const requestedPath = req.params[0];
  const actualFilePath = path.join(publicDir, requestedPath);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Get file extension to determine MIME type
  const ext = path.extname(actualFilePath).toLowerCase();
  let contentType = 'image/jpeg'; // default
  
  switch (ext) {
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.gif':
      contentType = 'image/gif';
      break;
    case '.webp':
      contentType = 'image/webp';
      break;
    case '.bmp':
      contentType = 'image/bmp';
      break;
    case '.svg':
      contentType = 'image/svg+xml';
      break;
    case '.ico':
      contentType = 'image/x-icon';
      break;
    case '.tiff':
      contentType = 'image/tiff';
      break;
  }

  const stat = fs.statSync(actualFilePath);
  const fileSize = stat.size;
  
  res.set({
    'Content-Type': contentType,
    'Content-Length': fileSize,
    'Cache-Control': 'public, max-age=3600'
  });
  
  fs.createReadStream(actualFilePath).pipe(res);
});

app.get('/download/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  // For user files, map original filename to obfuscated filename
  const fileMapping = loadFileMapping(req.session.user.name);
  const obfuscatedName = fileMapping[requestedPath];
  
  if (!obfuscatedName) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const actualFilePath = path.join(userDir, obfuscatedName);
  
  if (!fs.existsSync(actualFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Decrypt user files before sending
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

// Video streaming endpoint for private files
app.get('/stream/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  // For user files, map original filename to obfuscated filename
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
    // Read and decrypt the entire file for range requests
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

// Image serving endpoint for private files
app.get('/image/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  // For user files, map original filename to obfuscated filename
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
    // Read and decrypt the file
    const encryptedBuffer = fs.readFileSync(actualFilePath);
    const decryptedBuffer = decryptFile(encryptedBuffer);
    
    // Get file extension to determine MIME type
    const ext = path.extname(requestedPath).toLowerCase();
    let contentType = 'image/jpeg'; // default
    
    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.bmp':
        contentType = 'image/bmp';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.ico':
        contentType = 'image/x-icon';
        break;
      case '.tiff':
        contentType = 'image/tiff';
        break;
    }
    
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

// Legacy endpoint for backwards compatibility
app.get('/download/*', (req, res) => {
  const requestedPath = req.params[0];
  if (req.session.user) {
    // Redirect to private download for authenticated users
    res.redirect(`/download/private/${requestedPath}`);
  } else {
    // Redirect to public download for unauthenticated users
    res.redirect(`/download/public/${requestedPath}`);
  }
});

app.delete('/delete/public/*', (req, res) => {
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

app.delete('/delete/private/*', requireAuth, (req, res) => {
  const requestedPath = req.params[0];
  const userDir = getUserUploadDir(req.session.user.name);
  
  // For user files, map original filename to obfuscated filename
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
      res.json({ message: 'Directory deleted successfully' });
    });
  } else {
    fs.unlink(actualFilePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete file' });
      }
      
      // Remove from file mapping
      const fileMapping = loadFileMapping(req.session.user.name);
      delete fileMapping[requestedPath];
      saveFileMapping(req.session.user.name, fileMapping);
      
      res.json({ message: 'File deleted successfully' });
    });
  }
});

// Legacy endpoint for backwards compatibility
app.delete('/delete/*', (req, res) => {
  const requestedPath = req.params[0];
  if (req.session.user) {
    // Redirect to private delete for authenticated users
    res.redirect(307, `/delete/private/${requestedPath}`);
  } else {
    // Redirect to public delete for unauthenticated users
    res.redirect(307, `/delete/public/${requestedPath}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FelixShare server running on port ${PORT}`);
  console.log(`Access from other devices at: http://[YOUR_IP]:${PORT}`);
});