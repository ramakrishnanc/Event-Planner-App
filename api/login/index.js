const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

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
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';

  if (!email || !password) {
    context.res = { status: 400, body: { error: 'Email and password are required.' } };
    return;
  }

  try {
    var pool = await getPool();
    var schema = await detectSchema(pool);

    var selectCols = ['id', 'name', 'email', 'password_hash'];
    if (schema.hasRole) selectCols.push('role');
    if (schema.hasVendorCategory) selectCols.push('vendor_category');
    if (schema.hasVendorPhone) selectCols.push('vendor_phone');
    if (schema.hasVendorCity) selectCols.push('vendor_city');

    var result = await pool.request()
      .input('email', email)
      .query('SELECT ' + selectCols.join(', ') + ' FROM Users WHERE email = @email');

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
    context.log.error('Login error:', err && err.message, err && err.stack);
    context.res = { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
};
