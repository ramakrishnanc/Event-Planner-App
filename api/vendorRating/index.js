const { getPool, ensureSchema, sql } = require('../shared/db');

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  var h = req.headers;
  if (typeof h.get === 'function') {
    return h.get(name) || h.get(name.toLowerCase()) || '';
  }
  return h[name.toLowerCase()] || h[name] || '';
}

function makeId() {
  return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = async function (context, req) {
  var raterId = (readHeader(req, 'x-user-id') || '').toString().trim();
  if (!raterId) {
    context.res = { status: 401, body: { error: 'Please sign in to rate vendors.' } };
    return;
  }

  var body = req.body || {};
  var vendorId = (body.vendorId || '').toString().trim();
  var rating = parseInt(body.rating, 10);

  if (!vendorId) {
    context.res = { status: 400, body: { error: 'vendorId is required.' } };
    return;
  }
  if (!(rating >= 1 && rating <= 5)) {
    context.res = { status: 400, body: { error: 'Rating must be a whole number between 1 and 5.' } };
    return;
  }
  if (vendorId === raterId) {
    context.res = { status: 400, body: { error: 'You cannot rate your own profile.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureSchema(pool, context.log);

    // Verify the target user is actually a vendor.
    var vendorRes = await pool.request()
      .input('vendorId', sql.NVarChar(50), vendorId)
      .query("SELECT id FROM Users WHERE id = @vendorId AND role = 'vendor'");
    if (vendorRes.recordset.length === 0) {
      context.res = { status: 404, body: { error: 'Vendor not found.' } };
      return;
    }

    await pool.request()
      .input('id', sql.NVarChar(50), makeId())
      .input('vendorId', sql.NVarChar(50), vendorId)
      .input('raterId', sql.NVarChar(50), raterId)
      .input('rating', sql.Int, rating)
      .query(
        'MERGE VendorRatings AS target ' +
        'USING (SELECT @vendorId AS vendor_user_id, @raterId AS rater_user_id) AS source ' +
        'ON target.vendor_user_id = source.vendor_user_id AND target.rater_user_id = source.rater_user_id ' +
        'WHEN MATCHED THEN UPDATE SET rating = @rating, created_at = GETUTCDATE() ' +
        'WHEN NOT MATCHED THEN INSERT (id, vendor_user_id, rater_user_id, rating) ' +
        '  VALUES (@id, @vendorId, @raterId, @rating);'
      );

    var aggRes = await pool.request()
      .input('vendorId', sql.NVarChar(50), vendorId)
      .query(
        'SELECT COUNT(*) AS rating_count, AVG(CAST(rating AS DECIMAL(5,2))) AS rating_avg ' +
        'FROM VendorRatings WHERE vendor_user_id = @vendorId'
      );
    var row = aggRes.recordset[0] || { rating_count: 0, rating_avg: 0 };

    context.res = {
      status: 200,
      body: {
        ok: true,
        vendor: {
          id: vendorId,
          ratingCount: Number(row.rating_count) || 0,
          ratingAvg: Number(row.rating_avg) || 0
        }
      }
    };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('VendorRating error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Failed to save rating: ' + message } };
  }
};
