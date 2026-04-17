const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

module.exports = async function (context, req) {
  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';

  if (!email || !password) {
    context.res = { status: 400, body: { error: 'Email and password are required.' } };
    return;
  }

  try {
    var pool = await getPool();

    var result = await pool.request()
      .input('email', email)
      .query('SELECT id, name, email, password_hash FROM Users WHERE email = @email');

    var found = result.recordset[0];
    if (!found) {
      context.res = { status: 401, body: { error: 'Incorrect email or password.' } };
      return;
    }

    var valid = await bcrypt.compare(password, found.password_hash);
    if (!valid) {
      context.res = { status: 401, body: { error: 'Incorrect email or password.' } };
      return;
    }

    var user = { id: found.id, name: found.name, email: found.email };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 200, body: { token: token, user: user } };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
