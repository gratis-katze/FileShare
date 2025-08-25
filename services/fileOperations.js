const fs = require('fs');
const path = require('path');
const { publicDir, uploadDir } = require('../utils/constants');
const { loadFileMapping, createReverseMapping } = require('./fileMapping');

function getUserUploadDir(username) {
  if (!username) return publicDir;
  return path.join(uploadDir, username);
}

function getFilesRecursively(dir, basePath = '', username = null) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  let reverseMapping = {};
  if (username) {
    const fileMapping = loadFileMapping(username);
    reverseMapping = createReverseMapping(fileMapping);
  }
  
  items.forEach(item => {
    if (item === '.filemapping.json') return;
    
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
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
  
  let reverseMapping = {};
  if (username) {
    const fileMapping = loadFileMapping(username);
    reverseMapping = createReverseMapping(fileMapping);
  }
  
  dirItems.forEach(item => {
    if (item === '.filemapping.json') return;
    
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
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

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  getUserUploadDir,
  getFilesRecursively,
  getTopLevelItems,
  ensureDirectoryExists
};