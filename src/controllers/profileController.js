const userService = require('../services/userService');
const { setFlash } = require('../utils/http');

function show(req, res) {
  const preferences = userService.parsePreferences(req.user.preferences);
  res.render('profile', { title: 'Profile', preferences: JSON.stringify(preferences, null, 2) });
}

function update(req, res) {
  userService.updateProfile(req.user, { name: req.body.name, preferences: req.body.preferences });
  setFlash(req, 'success', 'Profile updated.');
  res.redirect('/profile');
}

module.exports = { show, update };
