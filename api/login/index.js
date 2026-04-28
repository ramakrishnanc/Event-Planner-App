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

    var found;
    try {
      var result = await pool.request()
        .input('email', email)
        .query(
          'SELECT id, name, email, password_hash, role, vendor_category, vendor_phone, vendor_city ' +
          'FROM Users WHERE email = @email'
        );
      found = result.recordset[0];
    } catch (schemaErr) {
      context.log.warn('Falling back to legacy Users schema on login: ' + schemaErr.message);
      var legacy = await pool.request()
        .input('email', email)
        .query('SELECT id, name, email, password_hash FROM Users WHERE email = @email');
      found = legacy.recordset[0];
    }

    if (!found) {
      context.res = { status: 401, body: { error: 'Incorrect email or password.' } };
      return;
    }

    var valid = await bcrypt.compare(password, found.password_hash);
    if (!valid) {
      context.res = { status: 401, body: { error: 'Incorrect email or password.' } };
      return;
    }

    var user = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role || 'user',
      vendorCategory: found.vendor_category || '',
      vendorPhone: found.vendor_phone || '',
      vendorCity: found.vendor_city || ''
    };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 200, body: { token: token, user: user } };
  } catch (err) {
    context.log.error('Login error:', err.message);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
