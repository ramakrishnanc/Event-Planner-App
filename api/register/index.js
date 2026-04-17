const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

module.exports = async function (context, req) {
  var body = req.body || {};
  var name = (body.name || '').trim();
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';

  if (!name || !email || !password) {
    context.res = { status: 400, body: { error: 'Name, email and password are required.' } };
    return;
  }
  if (password.length < 6) {
    context.res = { status: 400, body: { error: 'Password must be at least 6 characters.' } };
    return;
  }

  try {
    var pool = await getPool();

    var existing = await pool.request()
      .input('email', email)
      .query('SELECT id FROM Users WHERE email = @email');

    if (existing.recordset.length > 0) {
      context.res = { status: 409, body: { error: 'An account with this email already exists.' } };
      return;
    }

    var passwordHash = await bcrypt.hash(password, 10);
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    await pool.request()
      .input('id', id)
      .input('name', name)
      .input('email', email)
      .input('passwordHash', passwordHash)
      .query('INSERT INTO Users (id, name, email, password_hash) VALUES (@id, @name, @email, @passwordHash)');

    var user = { id: id, name: name, email: email };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 201, body: { token: token, user: user } };
  } catch (err) {
    context.log.error('Register error:', err.message);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
