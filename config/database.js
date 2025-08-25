const fs = require('fs');
const { usersFile } = require('../utils/constants');

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

module.exports = {
  loadUsers,
  saveUsers
};