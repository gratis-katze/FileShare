const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function obfuscateFilename(originalName) {
  return crypto.createHash('sha256').update(originalName + Date.now()).digest('hex');
}

function getFileMappingPath(username) {
  const { uploadDir } = require('../utils/constants');
  const userDir = path.join(uploadDir, username);
  return path.join(userDir, '.filemapping.json');
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

function createReverseMapping(fileMapping) {
  const reverseMapping = {};
  Object.keys(fileMapping).forEach(original => {
    reverseMapping[fileMapping[original]] = original;
  });
  return reverseMapping;
}

// Returns the absolute path on disk for an original (unobfuscated) file path.
// Obfuscated files in sub-directories are stored inside that sub-directory, not flat in userDir.
function resolveObfuscatedPath(userDir, fileMapping, originalPath) {
  const obfuscatedName = fileMapping[originalPath];
  if (!obfuscatedName) return null;
  const subDir = path.dirname(originalPath);
  return subDir === '.'
    ? path.join(userDir, obfuscatedName)
    : path.join(userDir, subDir, obfuscatedName);
}

module.exports = {
  obfuscateFilename,
  loadFileMapping,
  saveFileMapping,
  createReverseMapping,
  resolveObfuscatedPath
};