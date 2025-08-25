const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { PORT } = require('./utils/constants');
const { testEncryption } = require('./services/encryption');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const streamingRoutes = require('./routes/streaming');

const app = express();

// Configure server for large file uploads
app.use(cors({
  credentials: true,
  origin: true
}));

// Increase payload limits for large files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Set server timeout for large uploads (5 minutes)
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes
  next();
});
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static('public'));

testEncryption();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/upload', fileRoutes);
app.use('/download', fileRoutes);
app.use('/delete', fileRoutes);
app.use('/', streamingRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FelixShare server running on port ${PORT}`);
  console.log(`Access from other devices at: http://[YOUR_IP]:${PORT}`);
});