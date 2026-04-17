const jwt = require('jsonwebtoken');
const { getPool } = require('../shared/db');

function verifyToken(req) {
  var auth = req.headers['authorization'] || '';
  var token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = async function (context, req) {
  var user = verifyToken(req);
  if (!user) {
    context.res = { status: 401, body: { error: 'Unauthorised.' } };
    return;
  }

  try {
    var pool = await getPool();

    if (req.method === 'GET') {
      var result = await pool.request()
        .input('userId', user.id)
        .query('SELECT data FROM PlannerData WHERE user_id = @userId');

      if (result.recordset.length === 0) {
        context.res = { status: 200, body: null };
      } else {
        context.res = { status: 200, body: JSON.parse(result.recordset[0].data) };
      }

    } else if (req.method === 'PUT') {
      var data = JSON.stringify(req.body || {});

      await pool.request()
        .input('userId', user.id)
        .input('data', data)
        .query(`
          MERGE PlannerData AS target
          USING (SELECT @userId AS user_id, @data AS data) AS source
            ON target.user_id = source.user_id
          WHEN MATCHED THEN
            UPDATE SET data = source.data, updated_at = GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT (user_id, data) VALUES (source.user_id, source.data);
        `);

      context.res = { status: 200, body: { ok: true } };
    }
  } catch (err) {
    context.log.error('Data error:', err.message);
    context.res = { status: 500, body: { error: 'Failed to access data.' } };
  }
};
