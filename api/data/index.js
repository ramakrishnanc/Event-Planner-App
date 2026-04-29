const jwt = require('jsonwebtoken');
const { getPool, ensureSchema, sql } = require('../shared/db');

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  // Functions v3 (object with lowercase keys)
  var h = req.headers;
  if (typeof h.get === 'function') {
    return h.get(name) || h.get(name.toLowerCase()) || h.get(name.toUpperCase()) || '';
  }
  return h[name.toLowerCase()] || h[name] || h[name.toUpperCase()] || '';
}

function verifyToken(req, log) {
  var auth = readHeader(req, 'authorization') || readHeader(req, 'Authorization');
  if (!auth) {
    if (log) log('verifyToken: no authorization header');
    return null;
  }
  var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : auth;
  if (!token) {
    if (log) log('verifyToken: empty token in header');
    return null;
  }
  if (!process.env.JWT_SECRET) {
    if (log) log('verifyToken: JWT_SECRET is not configured on the server');
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    if (log) log('verifyToken: JWT verify failed — ' + e.message);
    return null;
  }
}

module.exports = async function (context, req) {
  var user = verifyToken(req, function (m) { context.log(m); });
  if (!user) {
    context.res = {
      status: 401,
      body: { error: 'Your session is invalid. Please sign in again.' }
    };
    return;
  }

  try {
    var pool = await getPool();
    await ensureSchema(pool, context.log);

    if (req.method === 'GET') {
      var result = await pool.request()
        .input('userId', sql.NVarChar(50), user.id)
        .query('SELECT data FROM PlannerData WHERE user_id = @userId');

      if (result.recordset.length === 0) {
        context.res = { status: 200, body: null };
        return;
      }

      var raw = result.recordset[0].data;
      try {
        context.res = { status: 200, body: JSON.parse(raw) };
      } catch (parseErr) {
        context.log.error('PlannerData parse error for user ' + user.id + ': ' + parseErr.message);
        context.res = { status: 200, body: null };
      }
      return;
    }

    if (req.method === 'PUT') {
      var body = req.body;
      if (body === undefined || body === null) {
        context.res = { status: 400, body: { error: 'Request body is required.' } };
        return;
      }
      var payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!payload || payload === 'null') {
        context.res = { status: 400, body: { error: 'Request body is empty.' } };
        return;
      }

      await pool.request()
        .input('userId', sql.NVarChar(50), user.id)
        .input('data', sql.NVarChar(sql.MAX), payload)
        .query(
          'MERGE PlannerData AS target ' +
          'USING (SELECT @userId AS user_id, @data AS data) AS source ' +
          'ON target.user_id = source.user_id ' +
          'WHEN MATCHED THEN UPDATE SET data = source.data, updated_at = GETUTCDATE() ' +
          'WHEN NOT MATCHED THEN INSERT (user_id, data) VALUES (source.user_id, source.data);'
        );

      context.res = { status: 200, body: { ok: true, bytes: payload.length } };
      return;
    }

    context.res = { status: 405, body: { error: 'Method not allowed.' } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Data error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Failed to access data: ' + message } };
  }
};
