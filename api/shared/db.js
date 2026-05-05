const sql = require('mssql');

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise;
let schemaReadyPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).catch(function (err) {
      poolPromise = undefined;
      throw err;
    });
  }
  return poolPromise;
}

async function tableExists(pool, name) {
  var r = await pool.request()
    .input('n', sql.NVarChar(128), name)
    .query("SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @n");
  return r.recordset.length > 0;
}

async function getColumns(pool, name) {
  var r = await pool.request()
    .input('n', sql.NVarChar(128), name)
    .query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @n");
  var out = {};
  r.recordset.forEach(function (row) { out[row.COLUMN_NAME.toLowerCase()] = row; });
  return out;
}

async function ensureSchema(pool, log) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async function () {
    var statements = [];

    // ── Users table backfill (existing deployments) ─────────────────
    var userCols = await getColumns(pool, 'Users');
    if (Object.keys(userCols).length > 0) {
      if (!userCols['role']) statements.push("ALTER TABLE Users ADD role NVARCHAR(20) NOT NULL DEFAULT 'user'");
      if (!userCols['vendor_category']) statements.push('ALTER TABLE Users ADD vendor_category NVARCHAR(50) NULL');
      if (!userCols['vendor_phone']) statements.push('ALTER TABLE Users ADD vendor_phone NVARCHAR(50) NULL');
      if (!userCols['vendor_city']) statements.push('ALTER TABLE Users ADD vendor_city NVARCHAR(100) NULL');
      if (!userCols['pin']) statements.push('ALTER TABLE Users ADD pin NVARCHAR(10) NULL');
    }

    // ── Relational event tables ─────────────────────────────────────
    if (!(await tableExists(pool, 'Events'))) {
      statements.push(
        'CREATE TABLE Events (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  type_id NVARCHAR(50) NOT NULL,' +
        '  name NVARCHAR(200) NULL,' +
        '  m_date NVARCHAR(20) NULL,' +
        '  m_time NVARCHAR(20) NULL,' +
        '  m_nakshatra NVARCHAR(100) NULL,' +
        '  m_venue NVARCHAR(500) NULL,' +
        '  m_priest NVARCHAR(200) NULL,' +
        '  m_honoree NVARCHAR(200) NULL,' +
        '  m_theme NVARCHAR(200) NULL,' +
        '  m_notes NVARCHAR(MAX) NULL,' +
        '  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),' +
        '  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),' +
        '  CONSTRAINT FK_Events_Users FOREIGN KEY (user_id) REFERENCES Users(id)' +
        ')'
      );
      statements.push('CREATE INDEX IX_Events_User ON Events(user_id)');
    }

    if (!(await tableExists(pool, 'EventGuests'))) {
      statements.push(
        'CREATE TABLE EventGuests (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  name NVARCHAR(200) NOT NULL,' +
        '  [count] INT NOT NULL DEFAULT 1,' +
        '  invited BIT NOT NULL DEFAULT 0,' +
        '  CONSTRAINT FK_Guests_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE' +
        ')'
      );
      statements.push('CREATE INDEX IX_Guests_Event ON EventGuests(event_id)');
    }

    if (!(await tableExists(pool, 'EventTasks'))) {
      statements.push(
        'CREATE TABLE EventTasks (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  title NVARCHAR(500) NOT NULL,' +
        '  due NVARCHAR(20) NULL,' +
        '  done BIT NOT NULL DEFAULT 0,' +
        '  CONSTRAINT FK_Tasks_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE' +
        ')'
      );
      statements.push('CREATE INDEX IX_Tasks_Event ON EventTasks(event_id)');
    }

    if (!(await tableExists(pool, 'EventExpenses'))) {
      statements.push(
        'CREATE TABLE EventExpenses (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  description NVARCHAR(500) NOT NULL,' +
        '  amount DECIMAL(18,2) NOT NULL DEFAULT 0,' +
        '  category NVARCHAR(100) NULL,' +
        '  CONSTRAINT FK_Expenses_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE' +
        ')'
      );
      statements.push('CREATE INDEX IX_Expenses_Event ON EventExpenses(event_id)');
    }

    if (!(await tableExists(pool, 'EventVendors'))) {
      statements.push(
        'CREATE TABLE EventVendors (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  name NVARCHAR(200) NOT NULL,' +
        '  category NVARCHAR(50) NULL,' +
        '  phone NVARCHAR(50) NULL,' +
        '  notes NVARCHAR(MAX) NULL,' +
        '  CONSTRAINT FK_EventVendors_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE' +
        ')'
      );
      statements.push('CREATE INDEX IX_EventVendors_Event ON EventVendors(event_id)');
    }

    if (!(await tableExists(pool, 'VendorBookings'))) {
      statements.push(
        'CREATE TABLE VendorBookings (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  client NVARCHAR(200) NOT NULL,' +
        '  type NVARCHAR(100) NULL,' +
        '  [date] NVARCHAR(20) NULL,' +
        '  venue NVARCHAR(500) NULL,' +
        '  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),' +
        '  CONSTRAINT FK_Bookings_Users FOREIGN KEY (user_id) REFERENCES Users(id)' +
        ')'
      );
      statements.push('CREATE INDEX IX_Bookings_User ON VendorBookings(user_id)');
    }

    // Keep PlannerData around as the migration source, but make sure the data
    // column is NVARCHAR(MAX) if it's an older bounded definition.
    if (await tableExists(pool, 'PlannerData')) {
      var pdCols = await getColumns(pool, 'PlannerData');
      var dataCol = pdCols['data'];
      if (dataCol && dataCol.CHARACTER_MAXIMUM_LENGTH !== -1) {
        statements.push('ALTER TABLE PlannerData ALTER COLUMN data NVARCHAR(MAX) NOT NULL');
      }
    }

    for (var i = 0; i < statements.length; i++) {
      try {
        if (log) log('Running migration: ' + statements[i]);
        await pool.request().query(statements[i]);
      } catch (e) {
        if (log) log('Migration failed (continuing): ' + statements[i] + ' :: ' + e.message);
      }
    }
  })().catch(function (e) {
    schemaReadyPromise = undefined;
    throw e;
  });
  return schemaReadyPromise;
}

// One-time, per-user migration from the legacy PlannerData JSON blob into the
// relational tables. Safe to call repeatedly: only runs when the user has no
// rows in Events yet AND has a PlannerData blob.
async function migrateUserIfNeeded(pool, userId, log) {
  var existing = await pool.request()
    .input('userId', sql.NVarChar(50), userId)
    .query('SELECT TOP 1 id FROM Events WHERE user_id = @userId');
  if (existing.recordset.length > 0) return false;

  var blobRes = await pool.request()
    .input('userId', sql.NVarChar(50), userId)
    .query('SELECT data FROM PlannerData WHERE user_id = @userId');
  if (blobRes.recordset.length === 0) return false;

  var raw = blobRes.recordset[0].data;
  var parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    if (log) log('migrate: bad JSON for user ' + userId + ': ' + e.message);
    return false;
  }
  if (!parsed) return false;

  var events = Array.isArray(parsed.events) ? parsed.events : [];
  var bookings = Array.isArray(parsed.bookings) ? parsed.bookings : [];
  if (events.length === 0 && bookings.length === 0) return false;

  var tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (var i = 0; i < events.length; i++) {
      await insertEvent(tx, userId, events[i]);
    }
    for (var j = 0; j < bookings.length; j++) {
      await insertBooking(tx, userId, bookings[j]);
    }
    await tx.commit();
    if (log) log('migrate: user ' + userId + ' → ' + events.length + ' events, ' + bookings.length + ' bookings');
    return true;
  } catch (e) {
    try { await tx.rollback(); } catch (re) {}
    if (log) log('migrate: rollback for user ' + userId + ': ' + e.message);
    throw e;
  }
}

// ── Insert helpers (used by migration and by data PUT) ────────────────
async function insertEvent(reqOrTx, userId, ev) {
  var m = ev.muhurtham || {};
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), ev.id)
    .input('user_id', sql.NVarChar(50), userId)
    .input('type_id', sql.NVarChar(50), ev.typeId || 'other')
    .input('name', sql.NVarChar(200), ev.name || null)
    .input('m_date', sql.NVarChar(20), m.date || null)
    .input('m_time', sql.NVarChar(20), m.time || null)
    .input('m_nakshatra', sql.NVarChar(100), m.nakshatra || null)
    .input('m_venue', sql.NVarChar(500), m.venue || null)
    .input('m_priest', sql.NVarChar(200), m.priest || null)
    .input('m_honoree', sql.NVarChar(200), m.honoree || null)
    .input('m_theme', sql.NVarChar(200), m.theme || null)
    .input('m_notes', sql.NVarChar(sql.MAX), m.notes || null)
    .query(
      'INSERT INTO Events (id, user_id, type_id, name, m_date, m_time, m_nakshatra, m_venue, m_priest, m_honoree, m_theme, m_notes) ' +
      'VALUES (@id, @user_id, @type_id, @name, @m_date, @m_time, @m_nakshatra, @m_venue, @m_priest, @m_honoree, @m_theme, @m_notes)'
    );

  var guests = Array.isArray(ev.guests) ? ev.guests : [];
  for (var i = 0; i < guests.length; i++) await insertGuest(reqOrTx, ev.id, guests[i]);
  var tasks = Array.isArray(ev.tasks) ? ev.tasks : [];
  for (var j = 0; j < tasks.length; j++) await insertTask(reqOrTx, ev.id, tasks[j]);
  var expenses = Array.isArray(ev.expenses) ? ev.expenses : [];
  for (var k = 0; k < expenses.length; k++) await insertExpense(reqOrTx, ev.id, expenses[k]);
  var vendors = Array.isArray(ev.vendors) ? ev.vendors : [];
  for (var v = 0; v < vendors.length; v++) await insertEventVendor(reqOrTx, ev.id, vendors[v]);
}

async function insertGuest(reqOrTx, eventId, g) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), g.id || ('g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('event_id', sql.NVarChar(50), eventId)
    .input('name', sql.NVarChar(200), g.name || '')
    .input('count', sql.Int, parseInt(g.count, 10) || 1)
    .input('invited', sql.Bit, g.invited ? 1 : 0)
    .query('INSERT INTO EventGuests (id, event_id, name, [count], invited) VALUES (@id, @event_id, @name, @count, @invited)');
}

async function insertTask(reqOrTx, eventId, t) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), t.id || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('event_id', sql.NVarChar(50), eventId)
    .input('title', sql.NVarChar(500), t.title || '')
    .input('due', sql.NVarChar(20), t.due || null)
    .input('done', sql.Bit, t.done ? 1 : 0)
    .query('INSERT INTO EventTasks (id, event_id, title, due, done) VALUES (@id, @event_id, @title, @due, @done)');
}

async function insertExpense(reqOrTx, eventId, e) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), e.id || ('x_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('event_id', sql.NVarChar(50), eventId)
    .input('description', sql.NVarChar(500), e.description || '')
    .input('amount', sql.Decimal(18, 2), Number(e.amount) || 0)
    .input('category', sql.NVarChar(100), e.category || null)
    .query('INSERT INTO EventExpenses (id, event_id, description, amount, category) VALUES (@id, @event_id, @description, @amount, @category)');
}

async function insertEventVendor(reqOrTx, eventId, v) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), v.id || ('v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('event_id', sql.NVarChar(50), eventId)
    .input('name', sql.NVarChar(200), v.name || '')
    .input('category', sql.NVarChar(50), v.category || null)
    .input('phone', sql.NVarChar(50), v.phone || null)
    .input('notes', sql.NVarChar(sql.MAX), v.notes || null)
    .query('INSERT INTO EventVendors (id, event_id, name, category, phone, notes) VALUES (@id, @event_id, @name, @category, @phone, @notes)');
}

async function insertBooking(reqOrTx, userId, b) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), b.id || ('b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('user_id', sql.NVarChar(50), userId)
    .input('client', sql.NVarChar(200), b.client || '')
    .input('type', sql.NVarChar(100), b.type || null)
    .input('date', sql.NVarChar(20), b.date || null)
    .input('venue', sql.NVarChar(500), b.venue || null)
    .query('INSERT INTO VendorBookings (id, user_id, client, type, [date], venue) VALUES (@id, @user_id, @client, @type, @date, @venue)');
}

module.exports = {
  getPool,
  ensureSchema,
  migrateUserIfNeeded,
  insertEvent,
  insertGuest,
  insertTask,
  insertExpense,
  insertEventVendor,
  insertBooking,
  sql
};
