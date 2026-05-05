const {
  getPool, ensureSchema, migrateUserIfNeeded,
  insertEvent, insertBooking,
  tableForType, EVENT_TYPE_IDS, sql
} = require('../shared/db');

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  var h = req.headers;
  if (typeof h.get === 'function') {
    return h.get(name) || h.get(name.toLowerCase()) || '';
  }
  return h[name.toLowerCase()] || h[name] || '';
}

function buildEventsUnionSql() {
  var parts = EVENT_TYPE_IDS.map(function (typeId) {
    var dst = tableForType(typeId);
    return (
      "SELECT '" + typeId + "' AS type_id, id, name, m_date, m_time, m_nakshatra, " +
      "m_venue, m_priest, m_honoree, m_theme, m_notes, created_at, updated_at " +
      'FROM ' + dst + ' WHERE user_id = @userId'
    );
  });
  return parts.join(' UNION ALL ');
}

async function loadUserStore(pool, userId) {
  var eventsRes = await pool.request()
    .input('userId', sql.NVarChar(50), userId)
    .query(buildEventsUnionSql());

  var events = eventsRes.recordset.map(function (r) {
    return {
      id: r.id,
      typeId: r.type_id,
      name: r.name || '',
      muhurtham: {
        date: r.m_date || '',
        time: r.m_time || '',
        nakshatra: r.m_nakshatra || '',
        venue: r.m_venue || '',
        priest: r.m_priest || '',
        honoree: r.m_honoree || '',
        theme: r.m_theme || '',
        notes: r.m_notes || ''
      },
      guests: [],
      tasks: [],
      expenses: [],
      vendors: [],
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
    };
  });

  var byId = {};
  events.forEach(function (e) { byId[e.id] = e; });

  var childQueries = [];
  if (events.length > 0) {
    childQueries.push(
      pool.request().input('userId', sql.NVarChar(50), userId).query(
        'SELECT id, event_id, name, [count], invited FROM EventGuests WHERE user_id = @userId'
      ).then(function (res) {
        res.recordset.forEach(function (g) {
          var ev = byId[g.event_id]; if (!ev) return;
          ev.guests.push({ id: g.id, name: g.name, count: g.count, invited: !!g.invited });
        });
      }),
      pool.request().input('userId', sql.NVarChar(50), userId).query(
        'SELECT id, event_id, title, due, done FROM EventTasks WHERE user_id = @userId'
      ).then(function (res) {
        res.recordset.forEach(function (t) {
          var ev = byId[t.event_id]; if (!ev) return;
          ev.tasks.push({ id: t.id, title: t.title, due: t.due || '', done: !!t.done });
        });
      }),
      pool.request().input('userId', sql.NVarChar(50), userId).query(
        'SELECT id, event_id, description, amount, category FROM EventExpenses WHERE user_id = @userId'
      ).then(function (res) {
        res.recordset.forEach(function (x) {
          var ev = byId[x.event_id]; if (!ev) return;
          ev.expenses.push({
            id: x.id, description: x.description,
            amount: Number(x.amount) || 0, category: x.category || ''
          });
        });
      }),
      pool.request().input('userId', sql.NVarChar(50), userId).query(
        'SELECT id, event_id, name, category, phone, notes, vendor_user_id FROM EventVendors WHERE user_id = @userId'
      ).then(function (res) {
        res.recordset.forEach(function (v) {
          var ev = byId[v.event_id]; if (!ev) return;
          ev.vendors.push({
            id: v.id, name: v.name,
            category: v.category || '', phone: v.phone || '',
            notes: v.notes || '', vendorUserId: v.vendor_user_id || ''
          });
        });
      })
    );
  }

  var bookingsPromise = pool.request()
    .input('userId', sql.NVarChar(50), userId)
    .query('SELECT id, client, type, [date], venue FROM VendorBookings WHERE user_id = @userId');
  childQueries.push(bookingsPromise);

  await Promise.all(childQueries);
  var bookingsRes = await bookingsPromise;
  var bookings = bookingsRes.recordset.map(function (b) {
    return {
      id: b.id, client: b.client, type: b.type || '',
      date: b.date || '', venue: b.venue || ''
    };
  });

  return { events: events, bookings: bookings };
}

async function saveUserStore(pool, userId, store) {
  var events = Array.isArray(store && store.events) ? store.events : [];
  var bookings = Array.isArray(store && store.bookings) ? store.bookings : [];

  var tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Wipe this user's rows everywhere, then re-insert.
    for (var i = 0; i < EVENT_TYPE_IDS.length; i++) {
      var dst = tableForType(EVENT_TYPE_IDS[i]);
      await new sql.Request(tx)
        .input('userId', sql.NVarChar(50), userId)
        .query('DELETE FROM ' + dst + ' WHERE user_id = @userId');
    }
    var childTables = ['EventGuests', 'EventTasks', 'EventExpenses', 'EventVendors'];
    for (var c = 0; c < childTables.length; c++) {
      await new sql.Request(tx)
        .input('userId', sql.NVarChar(50), userId)
        .query('DELETE FROM ' + childTables[c] + ' WHERE user_id = @userId');
    }
    await new sql.Request(tx)
      .input('userId', sql.NVarChar(50), userId)
      .query('DELETE FROM VendorBookings WHERE user_id = @userId');

    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      if (!ev || !ev.id) continue;
      await insertEvent(tx, userId, ev);
    }
    for (var b = 0; b < bookings.length; b++) {
      var bk = bookings[b];
      if (!bk || !bk.id) continue;
      await insertBooking(tx, userId, bk);
    }

    // Mirror to PlannerData backup.
    var payload = JSON.stringify({ events: events, bookings: bookings });
    await new sql.Request(tx)
      .input('userId', sql.NVarChar(50), userId)
      .input('data', sql.NVarChar(sql.MAX), payload)
      .query(
        'MERGE PlannerData AS target ' +
        'USING (SELECT @userId AS user_id, @data AS data) AS source ' +
        'ON target.user_id = source.user_id ' +
        'WHEN MATCHED THEN UPDATE SET data = source.data, updated_at = GETUTCDATE() ' +
        'WHEN NOT MATCHED THEN INSERT (user_id, data) VALUES (source.user_id, source.data);'
      );

    await tx.commit();
    return payload.length;
  } catch (e) {
    try { await tx.rollback(); } catch (re) {}
    throw e;
  }
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
      try {
        await migrateUserIfNeeded(pool, userId, context.log);
      } catch (mErr) {
        context.log.error('Migration error for user ' + userId + ': ' + mErr.message);
      }
      var store = await loadUserStore(pool, userId);
      if (store.events.length === 0 && store.bookings.length === 0) {
        context.res = { status: 200, body: null };
      } else {
        context.res = { status: 200, body: store };
      }
      return;
    }

    if (req.method === 'PUT') {
      var body = req.body;
      if (body === undefined || body === null) {
        context.res = { status: 400, body: { error: 'Request body is required.' } };
        return;
      }
      var parsed = body;
      if (typeof body === 'string') {
        try { parsed = JSON.parse(body); }
        catch (pe) {
          context.res = { status: 400, body: { error: 'Request body is not valid JSON.' } };
          return;
        }
      }
      if (!parsed || typeof parsed !== 'object') {
        context.res = { status: 400, body: { error: 'Request body is empty.' } };
        return;
      }

      var bytes = await saveUserStore(pool, userId, parsed);
      context.res = { status: 200, body: { ok: true, bytes: bytes } };
      return;
    }

    context.res = { status: 405, body: { error: 'Method not allowed.' } };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Data error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Failed to access data: ' + message } };
  }
};
