const { getPool, ensureSchema, sql } = require('../shared/db');

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  var h = req.headers;
  if (typeof h.get === 'function') {
    return h.get(name) || h.get(name.toLowerCase()) || '';
  }
  return h[name.toLowerCase()] || h[name] || '';
}

module.exports = async function (context, req) {
  var userId = (readHeader(req, 'x-user-id') || '').toString().trim();
  if (!userId) {
    context.res = { status: 401, body: { error: 'Please sign in.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureSchema(pool, context.log);

    if (req.method === 'GET') {
      var result = await pool.request()
        .input('userId', sql.NVarChar(50), userId)
        .query('SELECT data FROM PlannerData WHERE user_id = @userId');

      if (result.recordset.length === 0) {
        context.res = { status: 200, body: null };
        return;
      }

      var raw = result.recordset[0].data;
      try {
        context.res = { status: 200, body: JSON.parse(raw) };
      } catch (parseErr) {
        context.log.error('PlannerData parse error for user ' + userId + ': ' + parseErr.message);
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
        .input('userId', sql.NVarChar(50), userId)
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
