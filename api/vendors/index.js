const { getPool, ensureUsersSchema, sql } = require('../shared/db');

var ALLOWED_CATEGORIES = [
  'caterer', 'photographer', 'priest', 'decorator',
  'makeup', 'venue', 'tenthouse', 'entertainment', 'other'
];

module.exports = async function (context, req) {
  var category = ((req.query && req.query.category) || '').toString().trim().toLowerCase();
  if (category && ALLOWED_CATEGORIES.indexOf(category) < 0) {
    context.res = { status: 400, body: { error: 'Unknown vendor category.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureUsersSchema(pool, context.log);

    // VendorBookings may not exist yet on a fresh DB. The LEFT JOIN tolerates
    // that via a try/catch fallback to a query without booking counts.
    var rows = [];
    try {
      var withCounts = await pool.request()
        .input('category', sql.NVarChar(50), category || null)
        .query(
          "SELECT u.id, u.name, u.vendor_category, u.vendor_phone, u.vendor_city, " +
          "  ISNULL(bc.bookings, 0) AS bookings, " +
          "  ISNULL(rc.rating_count, 0) AS rating_count, " +
          "  ISNULL(rc.rating_avg, 0)   AS rating_avg " +
          "FROM Users u " +
          "LEFT JOIN (SELECT user_id, COUNT(*) AS bookings FROM VendorBookings GROUP BY user_id) bc " +
          "  ON bc.user_id = u.id " +
          "LEFT JOIN (SELECT vendor_user_id, COUNT(*) AS rating_count, AVG(CAST(rating AS DECIMAL(5,2))) AS rating_avg FROM VendorRatings GROUP BY vendor_user_id) rc " +
          "  ON rc.vendor_user_id = u.id " +
          "WHERE u.role = 'vendor' " +
          "  AND (@category IS NULL OR u.vendor_category = @category) " +
          "ORDER BY rating_avg DESC, bookings DESC, u.name ASC"
        );
      rows = withCounts.recordset;
    } catch (e) {
      context.log('vendors: enriched query failed (' + e.message + '); falling back to basic listing');
      var basic = await pool.request()
        .input('category', sql.NVarChar(50), category || null)
        .query(
          "SELECT u.id, u.name, u.vendor_category, u.vendor_phone, u.vendor_city " +
          "FROM Users u " +
          "WHERE u.role = 'vendor' " +
          "  AND (@category IS NULL OR u.vendor_category = @category) " +
          "ORDER BY u.name ASC"
        );
      rows = basic.recordset.map(function (r) {
        r.bookings = 0; r.rating_count = 0; r.rating_avg = 0;
        return r;
      });
    }

    var vendors = rows.map(function (r) {
      return {
        id: r.id,
        name: r.name,
        category: r.vendor_category || '',
        phone: r.vendor_phone || '',
        city: r.vendor_city || '',
        bookingCount: Number(r.bookings) || 0,
        ratingCount: Number(r.rating_count) || 0,
        ratingAvg: Number(r.rating_avg) || 0
      };
    });

    context.res = { status: 200, body: { vendors: vendors } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Vendors error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Failed to load vendors: ' + message } };
  }
};
