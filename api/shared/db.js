const sql = require('mssql');

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false
  },
  connectionTimeout: 15000,
  requestTimeout: 15000,
  pool: { max: 10, min: 1, idleTimeoutMillis: 60000 }
};

const EVENT_TYPE_IDS = ['gruhapravesham', 'birthday', 'marriage', 'engagement', 'puja', 'retirement', 'other'];

function tableForType(typeId) {
  var t = String(typeId || '').toLowerCase();
  if (EVENT_TYPE_IDS.indexOf(t) < 0) t = 'other';
  return 'Events' + t.charAt(0).toUpperCase() + t.slice(1);
}

function normaliseType(typeId) {
  var t = String(typeId || '').toLowerCase();
  if (EVENT_TYPE_IDS.indexOf(t) < 0) t = 'other';
  return t;
}

let poolPromise;
let schemaReadyPromise;
let usersSchemaReadyPromise;

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

function eventTableDDL(name) {
  return 'CREATE TABLE ' + name + ' (' +
    '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
    '  user_id NVARCHAR(50) NOT NULL,' +
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
    '  CONSTRAINT FK_' + name + '_Users FOREIGN KEY (user_id) REFERENCES Users(id)' +
    ')';
}

async function ensureUsersSchema(pool, log) {
  if (usersSchemaReadyPromise) return usersSchemaReadyPromise;
  usersSchemaReadyPromise = (async function () {
    var userCols = await getColumns(pool, 'Users');
    if (Object.keys(userCols).length === 0) return;
    var statements = [];
    if (!userCols['role']) statements.push("ALTER TABLE Users ADD role NVARCHAR(20) NOT NULL DEFAULT 'user'");
    if (!userCols['vendor_category']) statements.push('ALTER TABLE Users ADD vendor_category NVARCHAR(50) NULL');
    if (!userCols['vendor_phone']) statements.push('ALTER TABLE Users ADD vendor_phone NVARCHAR(50) NULL');
    if (!userCols['vendor_city']) statements.push('ALTER TABLE Users ADD vendor_city NVARCHAR(100) NULL');
    if (!userCols['pin']) statements.push('ALTER TABLE Users ADD pin NVARCHAR(10) NULL');
    for (var i = 0; i < statements.length; i++) {
      try {
        if (log) log('Users migration: ' + statements[i]);
        await pool.request().query(statements[i]);
      } catch (e) {
        if (log) log('Users migration failed (continuing): ' + statements[i] + ' :: ' + e.message);
      }
    }
  })().catch(function (e) {
    usersSchemaReadyPromise = undefined;
    throw e;
  });
  return usersSchemaReadyPromise;
}

async function ensureSchema(pool, log) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async function () {
    var statements = [];

    // ── Users table backfill ────────────────────────────────────────
    var userCols = await getColumns(pool, 'Users');
    if (Object.keys(userCols).length > 0) {
      if (!userCols['role']) statements.push("ALTER TABLE Users ADD role NVARCHAR(20) NOT NULL DEFAULT 'user'");
      if (!userCols['vendor_category']) statements.push('ALTER TABLE Users ADD vendor_category NVARCHAR(50) NULL');
      if (!userCols['vendor_phone']) statements.push('ALTER TABLE Users ADD vendor_phone NVARCHAR(50) NULL');
      if (!userCols['vendor_city']) statements.push('ALTER TABLE Users ADD vendor_city NVARCHAR(100) NULL');
      if (!userCols['pin']) statements.push('ALTER TABLE Users ADD pin NVARCHAR(10) NULL');
    }
    if (!usersSchemaReadyPromise) usersSchemaReadyPromise = Promise.resolve();

    // ── Per-type event tables ───────────────────────────────────────
    for (var i = 0; i < EVENT_TYPE_IDS.length; i++) {
      var name = tableForType(EVENT_TYPE_IDS[i]);
      if (!(await tableExists(pool, name))) statements.push(eventTableDDL(name));
    }

    // ── Children: ensure they have user_id + event_type columns ─────
    var childTables = ['EventGuests', 'EventTasks', 'EventExpenses', 'EventVendors'];
    var childExists = {};
    for (var c = 0; c < childTables.length; c++) {
      childExists[childTables[c]] = await tableExists(pool, childTables[c]);
    }

    if (!childExists['EventGuests']) {
      statements.push(
        'CREATE TABLE EventGuests (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  event_type NVARCHAR(50) NOT NULL,' +
        '  name NVARCHAR(200) NOT NULL,' +
        '  [count] INT NOT NULL DEFAULT 1,' +
        '  invited BIT NOT NULL DEFAULT 0' +
        ')'
      );
      statements.push('CREATE INDEX IX_Guests_User ON EventGuests(user_id)');
      statements.push('CREATE INDEX IX_Guests_Event ON EventGuests(event_id)');
    } else {
      var gc = await getColumns(pool, 'EventGuests');
      if (!gc['user_id']) statements.push('ALTER TABLE EventGuests ADD user_id NVARCHAR(50) NULL');
      if (!gc['event_type']) statements.push('ALTER TABLE EventGuests ADD event_type NVARCHAR(50) NULL');
    }

    if (!childExists['EventTasks']) {
      statements.push(
        'CREATE TABLE EventTasks (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  event_type NVARCHAR(50) NOT NULL,' +
        '  title NVARCHAR(500) NOT NULL,' +
        '  due NVARCHAR(20) NULL,' +
        '  done BIT NOT NULL DEFAULT 0' +
        ')'
      );
      statements.push('CREATE INDEX IX_Tasks_User ON EventTasks(user_id)');
      statements.push('CREATE INDEX IX_Tasks_Event ON EventTasks(event_id)');
    } else {
      var tc = await getColumns(pool, 'EventTasks');
      if (!tc['user_id']) statements.push('ALTER TABLE EventTasks ADD user_id NVARCHAR(50) NULL');
      if (!tc['event_type']) statements.push('ALTER TABLE EventTasks ADD event_type NVARCHAR(50) NULL');
    }

    if (!childExists['EventExpenses']) {
      statements.push(
        'CREATE TABLE EventExpenses (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  event_type NVARCHAR(50) NOT NULL,' +
        '  description NVARCHAR(500) NOT NULL,' +
        '  amount DECIMAL(18,2) NOT NULL DEFAULT 0,' +
        '  category NVARCHAR(100) NULL' +
        ')'
      );
      statements.push('CREATE INDEX IX_Expenses_User ON EventExpenses(user_id)');
      statements.push('CREATE INDEX IX_Expenses_Event ON EventExpenses(event_id)');
    } else {
      var ec = await getColumns(pool, 'EventExpenses');
      if (!ec['user_id']) statements.push('ALTER TABLE EventExpenses ADD user_id NVARCHAR(50) NULL');
      if (!ec['event_type']) statements.push('ALTER TABLE EventExpenses ADD event_type NVARCHAR(50) NULL');
    }

    if (!childExists['EventVendors']) {
      statements.push(
        'CREATE TABLE EventVendors (' +
        '  id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  user_id NVARCHAR(50) NOT NULL,' +
        '  event_id NVARCHAR(50) NOT NULL,' +
        '  event_type NVARCHAR(50) NOT NULL,' +
        '  name NVARCHAR(200) NOT NULL,' +
        '  category NVARCHAR(50) NULL,' +
        '  phone NVARCHAR(50) NULL,' +
        '  notes NVARCHAR(MAX) NULL,' +
        '  vendor_user_id NVARCHAR(50) NULL' +
        ')'
      );
      statements.push('CREATE INDEX IX_EventVendors_User ON EventVendors(user_id)');
      statements.push('CREATE INDEX IX_EventVendors_Event ON EventVendors(event_id)');
    } else {
      var vc = await getColumns(pool, 'EventVendors');
      if (!vc['user_id']) statements.push('ALTER TABLE EventVendors ADD user_id NVARCHAR(50) NULL');
      if (!vc['event_type']) statements.push('ALTER TABLE EventVendors ADD event_type NVARCHAR(50) NULL');
      if (!vc['vendor_user_id']) statements.push('ALTER TABLE EventVendors ADD vendor_user_id NVARCHAR(50) NULL');
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

    // PlannerData backup table — make sure data column is unbounded.
    if (await tableExists(pool, 'PlannerData')) {
      var pdCols = await getColumns(pool, 'PlannerData');
      var dataCol = pdCols['data'];
      if (dataCol && dataCol.CHARACTER_MAXIMUM_LENGTH !== -1) {
        statements.push('ALTER TABLE PlannerData ALTER COLUMN data NVARCHAR(MAX) NOT NULL');
      }
    }

    for (var s = 0; s < statements.length; s++) {
      try {
        if (log) log('Migration: ' + statements[s]);
        await pool.request().query(statements[s]);
      } catch (e) {
        if (log) log('Migration failed (continuing): ' + statements[s] + ' :: ' + e.message);
      }
    }

    // ── One-time copy from old unified Events table into per-type tables ──
    if (await tableExists(pool, 'Events')) {
      try {
        if (log) log('Migrating rows from legacy Events table into per-type tables');
        // Backfill children user_id/event_type from Events table where missing.
        for (var ch = 0; ch < childTables.length; ch++) {
          var ct = childTables[ch];
          try {
            await pool.request().query(
              'UPDATE c SET c.user_id = e.user_id, c.event_type = e.type_id ' +
              'FROM ' + ct + ' c JOIN Events e ON e.id = c.event_id ' +
              'WHERE c.user_id IS NULL OR c.event_type IS NULL'
            );
          } catch (e) { if (log) log('Backfill on ' + ct + ' skipped: ' + e.message); }
        }

        // Move events into per-type tables (skip ones already moved).
        for (var t = 0; t < EVENT_TYPE_IDS.length; t++) {
          var typeId = EVENT_TYPE_IDS[t];
          var dst = tableForType(typeId);
          await pool.request()
            .input('typeId', sql.NVarChar(50), typeId)
            .query(
              'INSERT INTO ' + dst + ' (id, user_id, name, m_date, m_time, m_nakshatra, m_venue, m_priest, m_honoree, m_theme, m_notes, created_at, updated_at) ' +
              'SELECT e.id, e.user_id, e.name, e.m_date, e.m_time, e.m_nakshatra, e.m_venue, e.m_priest, e.m_honoree, e.m_theme, e.m_notes, e.created_at, e.updated_at ' +
              'FROM Events e WHERE e.type_id = @typeId AND NOT EXISTS (SELECT 1 FROM ' + dst + ' x WHERE x.id = e.id)'
            );
        }
        // Anything with an unrecognised type_id goes into Other.
        var dstOther = tableForType('other');
        await pool.request().query(
          'INSERT INTO ' + dstOther + ' (id, user_id, name, m_date, m_time, m_nakshatra, m_venue, m_priest, m_honoree, m_theme, m_notes, created_at, updated_at) ' +
          'SELECT e.id, e.user_id, e.name, e.m_date, e.m_time, e.m_nakshatra, e.m_venue, e.m_priest, e.m_honoree, e.m_theme, e.m_notes, e.created_at, e.updated_at ' +
          'FROM Events e WHERE e.type_id NOT IN (\'gruhapravesham\',\'birthday\',\'marriage\',\'engagement\',\'puja\',\'retirement\',\'other\') ' +
          'AND NOT EXISTS (SELECT 1 FROM ' + dstOther + ' x WHERE x.id = e.id)'
        );
      } catch (e) {
        if (log) log('Legacy Events migration failed (continuing): ' + e.message);
      }
    }
  })().catch(function (e) {
    schemaReadyPromise = undefined;
    throw e;
  });
  return schemaReadyPromise;
}

// One-time, per-user migration from the legacy PlannerData JSON blob into the
// relational tables. Only runs when the user has no rows in any per-type
// events table yet AND has a PlannerData blob.
async function migrateUserIfNeeded(pool, userId, log) {
  for (var i = 0; i < EVENT_TYPE_IDS.length; i++) {
    var dst = tableForType(EVENT_TYPE_IDS[i]);
    var existing = await pool.request()
      .input('userId', sql.NVarChar(50), userId)
      .query('SELECT TOP 1 id FROM ' + dst + ' WHERE user_id = @userId');
    if (existing.recordset.length > 0) return false;
  }

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
    for (var e = 0; e < events.length; e++) await insertEvent(tx, userId, events[e]);
    for (var b = 0; b < bookings.length; b++) await insertBooking(tx, userId, bookings[b]);
    await tx.commit();
    if (log) log('migrate: user ' + userId + ' → ' + events.length + ' events, ' + bookings.length + ' bookings');
    return true;
  } catch (e2) {
    try { await tx.rollback(); } catch (re) {}
    if (log) log('migrate: rollback for user ' + userId + ': ' + e2.message);
    throw e2;
  }
}

// ── Insert helpers ────────────────────────────────────────────────────
async function insertEvent(reqOrTx, userId, ev) {
  var typeId = normaliseType(ev.typeId);
  var dst = tableForType(typeId);
  var m = ev.muhurtham || {};
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), ev.id)
    .input('user_id', sql.NVarChar(50), userId)
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
      'INSERT INTO ' + dst + ' (id, user_id, name, m_date, m_time, m_nakshatra, m_venue, m_priest, m_honoree, m_theme, m_notes) ' +
      'VALUES (@id, @user_id, @name, @m_date, @m_time, @m_nakshatra, @m_venue, @m_priest, @m_honoree, @m_theme, @m_notes)'
    );

  var guests = Array.isArray(ev.guests) ? ev.guests : [];
  for (var i = 0; i < guests.length; i++) await insertGuest(reqOrTx, userId, ev.id, typeId, guests[i]);
  var tasks = Array.isArray(ev.tasks) ? ev.tasks : [];
  for (var j = 0; j < tasks.length; j++) await insertTask(reqOrTx, userId, ev.id, typeId, tasks[j]);
  var expenses = Array.isArray(ev.expenses) ? ev.expenses : [];
  for (var k = 0; k < expenses.length; k++) await insertExpense(reqOrTx, userId, ev.id, typeId, expenses[k]);
  var vendors = Array.isArray(ev.vendors) ? ev.vendors : [];
  for (var v = 0; v < vendors.length; v++) await insertEventVendor(reqOrTx, userId, ev.id, typeId, vendors[v]);
}

async function insertGuest(reqOrTx, userId, eventId, eventType, g) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), g.id || ('g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('user_id', sql.NVarChar(50), userId)
    .input('event_id', sql.NVarChar(50), eventId)
    .input('event_type', sql.NVarChar(50), eventType)
    .input('name', sql.NVarChar(200), g.name || '')
    .input('count', sql.Int, parseInt(g.count, 10) || 1)
    .input('invited', sql.Bit, g.invited ? 1 : 0)
    .query('INSERT INTO EventGuests (id, user_id, event_id, event_type, name, [count], invited) VALUES (@id, @user_id, @event_id, @event_type, @name, @count, @invited)');
}

async function insertTask(reqOrTx, userId, eventId, eventType, t) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), t.id || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('user_id', sql.NVarChar(50), userId)
    .input('event_id', sql.NVarChar(50), eventId)
    .input('event_type', sql.NVarChar(50), eventType)
    .input('title', sql.NVarChar(500), t.title || '')
    .input('due', sql.NVarChar(20), t.due || null)
    .input('done', sql.Bit, t.done ? 1 : 0)
    .query('INSERT INTO EventTasks (id, user_id, event_id, event_type, title, due, done) VALUES (@id, @user_id, @event_id, @event_type, @title, @due, @done)');
}

async function insertExpense(reqOrTx, userId, eventId, eventType, e) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), e.id || ('x_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('user_id', sql.NVarChar(50), userId)
    .input('event_id', sql.NVarChar(50), eventId)
    .input('event_type', sql.NVarChar(50), eventType)
    .input('description', sql.NVarChar(500), e.description || '')
    .input('amount', sql.Decimal(18, 2), Number(e.amount) || 0)
    .input('category', sql.NVarChar(100), e.category || null)
    .query('INSERT INTO EventExpenses (id, user_id, event_id, event_type, description, amount, category) VALUES (@id, @user_id, @event_id, @event_type, @description, @amount, @category)');
}

async function insertEventVendor(reqOrTx, userId, eventId, eventType, v) {
  await new sql.Request(reqOrTx)
    .input('id', sql.NVarChar(50), v.id || ('v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)))
    .input('user_id', sql.NVarChar(50), userId)
    .input('event_id', sql.NVarChar(50), eventId)
    .input('event_type', sql.NVarChar(50), eventType)
    .input('name', sql.NVarChar(200), v.name || '')
    .input('category', sql.NVarChar(50), v.category || null)
    .input('phone', sql.NVarChar(50), v.phone || null)
    .input('notes', sql.NVarChar(sql.MAX), v.notes || null)
    .input('vendor_user_id', sql.NVarChar(50), v.vendorUserId || null)
    .query('INSERT INTO EventVendors (id, user_id, event_id, event_type, name, category, phone, notes, vendor_user_id) VALUES (@id, @user_id, @event_id, @event_type, @name, @category, @phone, @notes, @vendor_user_id)');
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
  ensureUsersSchema,
  migrateUserIfNeeded,
  insertEvent,
  insertGuest,
  insertTask,
  insertExpense,
  insertEventVendor,
  insertBooking,
  tableForType,
  normaliseType,
  EVENT_TYPE_IDS,
  sql
};
