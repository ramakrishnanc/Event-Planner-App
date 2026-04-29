const { getPool, ensureSchema, sql } = require('../shared/db');

var ALLOWED_VENDOR_CATEGORIES = [
  'caterer', 'photographer', 'priest', 'decorator',
  'makeup', 'venue', 'entertainment', 'other'
];

module.exports = async function (context, req) {
  var body = req.body || {};
  var name = (body.name || '').trim();
  var email = (body.email || '').trim().toLowerCase();
  var pin = (body.pin || body.password || '').toString().trim();
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

  if (!name || !email || !pin) {
    context.res = { status: 400, body: { error: 'Name, email and PIN are required.' } };
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    context.res = { status: 400, body: { error: 'PIN must be exactly 4 digits.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureSchema(pool, context.log);

    var existing = await pool.request()
      .input('email', sql.NVarChar(320), email)
      .query('SELECT id FROM Users WHERE email = @email');
    if (existing.recordset.length > 0) {
      context.res = { status: 409, body: { error: 'An account with this email already exists.' } };
      return;
    }

    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // password_hash is a legacy NOT NULL column; we now store the PIN in the
    // dedicated `pin` column and put the same value into password_hash so the
    // INSERT keeps working without a schema change.
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('name', sql.NVarChar(200), name)
      .input('email', sql.NVarChar(320), email)
      .input('passwordHash', sql.NVarChar(200), pin)
      .input('pin', sql.NVarChar(10), pin)
      .input('role', sql.NVarChar(20), role)
      .input('vendorCategory', sql.NVarChar(50), vendorCategory)
      .input('vendorPhone', sql.NVarChar(50), vendorPhone)
      .input('vendorCity', sql.NVarChar(100), vendorCity)
      .query(
        'INSERT INTO Users (id, name, email, password_hash, pin, role, vendor_category, vendor_phone, vendor_city) ' +
        'VALUES (@id, @name, @email, @passwordHash, @pin, @role, @vendorCategory, @vendorPhone, @vendorCity)'
      );

    var user = {
      id: id, name: name, email: email, role: role,
      vendorCategory: vendorCategory, vendorPhone: vendorPhone, vendorCity: vendorCity
    };

    context.res = { status: 201, body: { user: user } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Register error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Registration failed: ' + message } };
  }
};
