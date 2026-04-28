const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

var ALLOWED_VENDOR_CATEGORIES = [
  'caterer', 'photographer', 'priest', 'decorator',
  'makeup', 'venue', 'entertainment', 'other'
];

var schemaCache = null;
async function detectSchema(pool) {
  if (schemaCache) return schemaCache;
  var result = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'"
  );
  var cols = {};
  result.recordset.forEach(function (r) { cols[r.COLUMN_NAME.toLowerCase()] = true; });
  schemaCache = {
    hasRole: !!cols['role'],
    hasVendorCategory: !!cols['vendor_category'],
    hasVendorPhone: !!cols['vendor_phone'],
    hasVendorCity: !!cols['vendor_city']
  };
  return schemaCache;
}

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
    var schema = await detectSchema(pool);

    var existing = await pool.request()
      .input('email', email)
      .query('SELECT id FROM Users WHERE email = @email');

    if (existing.recordset.length > 0) {
      context.res = { status: 409, body: { error: 'An account with this email already exists.' } };
      return;
    }

    var passwordHash = await bcrypt.hash(password, 10);
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    var cols = ['id', 'name', 'email', 'password_hash'];
    var params = ['@id', '@name', '@email', '@passwordHash'];
    var request = pool.request()
      .input('id', id)
      .input('name', name)
      .input('email', email)
      .input('passwordHash', passwordHash);

    if (schema.hasRole) {
      cols.push('role'); params.push('@role');
      request.input('role', role);
    }
    if (schema.hasVendorCategory) {
      cols.push('vendor_category'); params.push('@vendorCategory');
      request.input('vendorCategory', vendorCategory || null);
    }
    if (schema.hasVendorPhone) {
      cols.push('vendor_phone'); params.push('@vendorPhone');
      request.input('vendorPhone', vendorPhone || null);
    }
    if (schema.hasVendorCity) {
      cols.push('vendor_city'); params.push('@vendorCity');
      request.input('vendorCity', vendorCity || null);
    }

    var insertSql = 'INSERT INTO Users (' + cols.join(', ') + ') VALUES (' + params.join(', ') + ')';
    await request.query(insertSql);

    if (role === 'vendor' && (!schema.hasRole || !schema.hasVendorCategory)) {
      context.log.warn('Vendor registered but Users table is missing role/vendor columns; vendor data not persisted.');
    }

    var user = {
      id: id, name: name, email: email, role: role,
      vendorCategory: vendorCategory, vendorPhone: vendorPhone, vendorCity: vendorCity
    };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 201, body: { token: token, user: user } };
  } catch (err) {
    context.log.error('Register error:', err && err.message, err && err.stack);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
