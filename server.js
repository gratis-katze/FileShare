const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function getFilesRecursively(dir, basePath = '') {
  const files = [];
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const relativePath = basePath ? path.join(basePath, item) : item;
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      files.push({
        name: item,
        path: relativePath,
        type: 'directory',
        size: 0,
        modified: stats.mtime
      });
      files.push(...getFilesRecursively(itemPath, relativePath));
    } else {
      files.push({
        name: item,
        path: relativePath,
        type: 'file',
        size: stats.size,
        modified: stats.mtime
      });
    }
  });
  
  return files;
}

app.get('/files', (req, res) => {
  try {
    const fileList = getFilesRecursively(uploadDir);
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Unable to read files' });
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const relativePath = req.body.relativePath;
  
  if (relativePath) {
    // Move file to correct folder structure
    const targetDir = path.join(uploadDir, path.dirname(relativePath));
    const targetPath = path.join(uploadDir, relativePath);
    
    // Create directories if they don't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Move file from temp location to target location
    fs.renameSync(req.file.path, targetPath);
    
    res.json({ 
      message: 'File uploaded successfully', 
      filename: relativePath,
      size: req.file.size
    });
  } else {
    res.json({ 
      message: 'File uploaded successfully', 
      filename: req.file.filename,
      size: req.file.size
    });
  }
});

app.get('/download/*', (req, res) => {
  const filePath = path.join(uploadDir, req.params[0]);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
});

app.delete('/delete/*', (req, res) => {
  const filePath = path.join(uploadDir, req.params[0]);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const stats = fs.statSync(filePath);
  
  if (stats.isDirectory()) {
    fs.rmdir(filePath, { recursive: true }, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete directory' });
      }
      res.json({ message: 'Directory deleted successfully' });
    });
  } else {
    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to delete file' });
      }
      res.json({ message: 'File deleted successfully' });
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FileShare server running on port ${PORT}`);
  console.log(`Access from other devices at: http://[YOUR_IP]:${PORT}`);
});