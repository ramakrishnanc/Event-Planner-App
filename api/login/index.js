const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, ensureSchema, sql } = require('../shared/db');

module.exports = async function (context, req) {
  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();
  var pin = (body.pin || body.password || '').toString();

  if (!email || !pin) {
    context.res = { status: 400, body: { error: 'Email and PIN are required.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureSchema(pool, context.log);

    var result = await pool.request()
      .input('email', sql.NVarChar(320), email)
      .query(
        'SELECT id, name, email, password_hash, pin, role, vendor_category, vendor_phone, vendor_city ' +
        'FROM Users WHERE email = @email'
      );

    var found = result.recordset[0];
    if (!found) {
      context.res = { status: 401, body: { error: 'Incorrect email or PIN.' } };
      return;
    }

    var valid = await bcrypt.compare(pin, found.password_hash);
    if (!valid) {
      context.res = { status: 401, body: { error: 'Incorrect email or PIN.' } };
      return;
    }

    // Backfill plaintext PIN for accounts created before this column existed,
    // so the forgot-PIN flow can email the existing PIN.
    if (!found.pin) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), found.id)
          .input('pin', sql.NVarChar(10), pin)
          .query('UPDATE Users SET pin = @pin WHERE id = @id');
      } catch (e) {
        context.log.warn('PIN backfill failed (non-fatal): ' + e.message);
      }
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
    var message = (err && err.message) || 'unknown error';
    context.log.error('Login error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Login failed: ' + message } };
  }
};
