const express = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers } = require('../config/database');
const { getUserUploadDir, ensureDirectoryExists } = require('../services/fileOperations');

const router = express.Router();
let users = loadUsers();

router.post('/register', async (req, res) => {
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
  ensureDirectoryExists(userDir);
  
  req.session.user = { name };
  res.json({ message: 'User created successfully', user: { name } });
});

router.post('/login', async (req, res) => {
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

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logout successful' });
});

router.get('/status', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;