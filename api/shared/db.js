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

async function ensureSchema(pool, log) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async function () {
    var result = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'"
    );
    var have = {};
    result.recordset.forEach(function (r) { have[r.COLUMN_NAME.toLowerCase()] = true; });

    var statements = [];
    if (!have['role']) {
      statements.push("ALTER TABLE Users ADD role NVARCHAR(20) NOT NULL DEFAULT 'user'");
    }
    if (!have['vendor_category']) {
      statements.push('ALTER TABLE Users ADD vendor_category NVARCHAR(50) NULL');
    }
    if (!have['vendor_phone']) {
      statements.push('ALTER TABLE Users ADD vendor_phone NVARCHAR(50) NULL');
    }
    if (!have['vendor_city']) {
      statements.push('ALTER TABLE Users ADD vendor_city NVARCHAR(100) NULL');
    }
    if (!have['pin']) {
      statements.push('ALTER TABLE Users ADD pin NVARCHAR(10) NULL');
    }

    // PlannerData table: ensure it exists with NVARCHAR(MAX) data column.
    var pd = await pool.request().query(
      "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PlannerData'"
    );
    if (pd.recordset.length === 0) {
      statements.push(
        'CREATE TABLE PlannerData (' +
        '  user_id NVARCHAR(50) NOT NULL PRIMARY KEY,' +
        '  data NVARCHAR(MAX) NOT NULL,' +
        '  updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()' +
        ')'
      );
    } else {
      var dataCol = null;
      pd.recordset.forEach(function (r) {
        if (r.COLUMN_NAME.toLowerCase() === 'data') dataCol = r;
      });
      // CHARACTER_MAXIMUM_LENGTH = -1 means NVARCHAR(MAX). Anything else is bounded → upgrade.
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
    schemaReadyPromise = undefined; // allow retry on next request
    throw e;
  });
  return schemaReadyPromise;
}

module.exports = { getPool, ensureSchema, sql };
