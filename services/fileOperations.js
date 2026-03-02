const fs = require('fs');
const path = require('path');
const { publicDir, uploadDir } = require('../utils/constants');
const { loadFileMapping, createReverseMapping } = require('./fileMapping');

function getUserUploadDir(username) {
  if (!username) return publicDir;
  return path.join(uploadDir, username);
}

function getFilesRecursively(dir, basePath = '', reverseMapping = {}) {
  const files = [];
  const items = fs.readdirSync(dir);
  const hasMapping = Object.keys(reverseMapping).length > 0;

  items.forEach(item => {
    if (item === '.filemapping.json') return;

    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);

    // For private files the reverse mapping value is the full original path
    // (e.g. "folder/photo.jpg"). Strip to just the basename for display so we
    // don't end up with double-folder names like "folder/folder/photo.jpg".
    const fullOriginalPath = hasMapping ? reverseMapping[item] : null;
    const displayName = fullOriginalPath ? path.basename(fullOriginalPath) : item;
    // Keep the full original path as relativePath so route lookups work correctly.
    const relativePath = fullOriginalPath || (basePath ? path.join(basePath, displayName) : displayName);

    if (stats.isDirectory()) {
      const children = getFilesRecursively(itemPath, relativePath, reverseMapping);
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
      const children = getFilesRecursively(itemPath, displayName, reverseMapping);
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