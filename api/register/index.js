const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../shared/db');

var ALLOWED_VENDOR_CATEGORIES = [
  'caterer', 'photographer', 'priest', 'decorator',
  'makeup', 'venue', 'entertainment', 'other'
];

async function detectSchema(pool) {
  var result = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'"
  );
  var cols = {};
  result.recordset.forEach(function (r) { cols[r.COLUMN_NAME.toLowerCase()] = true; });
  return {
    hasRole: !!cols['role'],
    hasVendorCategory: !!cols['vendor_category'],
    hasVendorPhone: !!cols['vendor_phone'],
    hasVendorCity: !!cols['vendor_city']
  };
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
      .input('email', sql.NVarChar(320), email)
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
      .input('id', sql.NVarChar(50), id)
      .input('name', sql.NVarChar(200), name)
      .input('email', sql.NVarChar(320), email)
      .input('passwordHash', sql.NVarChar(200), passwordHash);

    if (schema.hasRole) {
      cols.push('role'); params.push('@role');
      request.input('role', sql.NVarChar(20), role);
    }
    if (schema.hasVendorCategory) {
      cols.push('vendor_category'); params.push('@vendorCategory');
      request.input('vendorCategory', sql.NVarChar(50), vendorCategory);
    }
    if (schema.hasVendorPhone) {
      cols.push('vendor_phone'); params.push('@vendorPhone');
      request.input('vendorPhone', sql.NVarChar(50), vendorPhone);
    }
    if (schema.hasVendorCity) {
      cols.push('vendor_city'); params.push('@vendorCity');
      request.input('vendorCity', sql.NVarChar(100), vendorCity);
    }

    var insertSql = 'INSERT INTO Users (' + cols.join(', ') + ') VALUES (' + params.join(', ') + ')';

    try {
      await request.query(insertSql);
    } catch (insertErr) {
      // If the failure is because the schema still doesn't have role/vendor columns
      // (e.g. extension hasn't migrated yet), retry with the legacy-only insert.
      if (role === 'vendor' && /Invalid column name/i.test(insertErr.message || '')) {
        context.log.warn('Vendor insert failed on schema columns — retrying as legacy: ' + insertErr.message);
        await pool.request()
          .input('id', sql.NVarChar(50), id)
          .input('name', sql.NVarChar(200), name)
          .input('email', sql.NVarChar(320), email)
          .input('passwordHash', sql.NVarChar(200), passwordHash)
          .query('INSERT INTO Users (id, name, email, password_hash) VALUES (@id, @name, @email, @passwordHash)');
      } else {
        throw insertErr;
      }
    }

    var user = {
      id: id, name: name, email: email, role: role,
      vendorCategory: vendorCategory, vendorPhone: vendorPhone, vendorCity: vendorCity
    };
    var token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });

    context.res = { status: 201, body: { token: token, user: user } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Register error:', message, err && err.stack);
    context.res = {
      status: 500,
      body: { error: 'Registration failed: ' + message }
    };
  }
};
