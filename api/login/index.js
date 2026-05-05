const { getPool, ensureUsersSchema, sql } = require('../shared/db');

module.exports = async function (context, req) {
  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();
  var pin = (body.pin || body.password || '').toString().trim();

  if (!email || !pin) {
    context.res = { status: 400, body: { error: 'Email and PIN are required.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureUsersSchema(pool, context.log);

    var result = await pool.request()
      .input('email', sql.NVarChar(320), email)
      .input('pin', sql.NVarChar(10), pin)
      .query(
        'SELECT id, name, email, role, vendor_category, vendor_phone, vendor_city ' +
        'FROM Users WHERE email = @email AND pin = @pin'
      );

    var found = result.recordset[0];
    if (!found) {
      context.res = { status: 401, body: { error: 'Incorrect email or PIN.' } };
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

    context.res = { status: 200, body: { user: user } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Login error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Login failed: ' + message } };
  }
};
