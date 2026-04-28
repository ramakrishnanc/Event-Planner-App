const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

var ALLOWED_VENDOR_CATEGORIES = [
  'caterer', 'photographer', 'priest', 'decorator',
  'makeup', 'venue', 'entertainment', 'other'
];

module.exports = async function (context, req) {
  var body = req.body || {};
  var name = (body.name || '').trim();
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';
  var role = (body.role || 'user').toLowerCase();
  if (role !== 'vendor') role = 'user';

  var vendorCategory = '';
  var vendorPhone = '';
  var vendorCity = '';
  if (role === 'vendor') {
    vendorCategory = (body.vendorCategory || '').trim().toLowerCase();
    vendorPhone = (body.vendorPhone || '').trim();
    vendorCity = (body.vendorCity || '').trim();
    if (ALLOWED_VENDOR_CATEGORIES.indexOf(vendorCategory) < 0) {
      context.res = { status: 400, body: { error: 'Please choose a valid vendor category.' } };
      return;
    }
  }

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

    // Best-effort: try inserting role + vendor columns; fall back to legacy schema if columns don't exist yet.
    try {
      await pool.request()
        .input('id', id)
        .input('name', name)
        .input('email', email)
        .input('passwordHash', passwordHash)
        .input('role', role)
        .input('vendorCategory', vendorCategory)
        .input('vendorPhone', vendorPhone)
        .input('vendorCity', vendorCity)
        .query(
          'INSERT INTO Users (id, name, email, password_hash, role, vendor_category, vendor_phone, vendor_city) ' +
          'VALUES (@id, @name, @email, @passwordHash, @role, @vendorCategory, @vendorPhone, @vendorCity)'
        );
    } catch (schemaErr) {
      context.log.warn('Falling back to legacy Users schema: ' + schemaErr.message);
      await pool.request()
        .input('id', id)
        .input('name', name)
        .input('email', email)
        .input('passwordHash', passwordHash)
        .query('INSERT INTO Users (id, name, email, password_hash) VALUES (@id, @name, @email, @passwordHash)');
    }

    var user = {
      id: id, name: name, email: email, role: role,
      vendorCategory: vendorCategory, vendorPhone: vendorPhone, vendorCity: vendorCity
    };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 201, body: { token: token, user: user } };
  } catch (err) {
    context.log.error('Register error:', err.message);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
