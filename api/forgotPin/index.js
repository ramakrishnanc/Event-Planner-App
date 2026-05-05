const { getPool, ensureUsersSchema, sql } = require('../shared/db');

async function sendPinEmail(toEmail, name, pin, log) {
  var host = process.env.SMTP_HOST;
  var port = parseInt(process.env.SMTP_PORT || '587', 10);
  var user = process.env.SMTP_USER;
  var pass = process.env.SMTP_PASS;
  var from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    var missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('SMTP_FROM');
    throw new Error('Email is not configured on the server (missing: ' + missing.join(', ') + ').');
  }

  var nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    throw new Error('Email module not installed on the server (run "npm install" in api/).');
  }

  var transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: { user: user, pass: pass }
  });

  // Verify the SMTP connection up-front so the user gets a useful error
  // instead of a generic "send failed" later.
  try {
    await transporter.verify();
  } catch (e) {
    log('SMTP verify failed: ' + e.message);
    throw new Error('SMTP connection failed: ' + e.message);
  }

  var subject = 'Your Evento PIN';
  var text =
    'Hi ' + (name || 'there') + ',\n\n' +
    'Your 4-digit Evento PIN is: ' + pin + '\n\n' +
    'Use it to sign in at Evento.\n\n' +
    'If you didn\'t request this, please ignore this email.\n\n' +
    '— Evento';

  var html =
    '<p>Hi ' + (name || 'there') + ',</p>' +
    '<p>Your 4-digit Evento PIN is:</p>' +
    '<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#7c1d2e;">' + pin + '</p>' +
    '<p>Use it to sign in at Evento.</p>' +
    '<p style="color:#888;font-size:12px;">If you didn\'t request this, please ignore this email.</p>';

  await transporter.sendMail({
    from: from,
    to: toEmail,
    subject: subject,
    text: text,
    html: html
  });
}

module.exports = async function (context, req) {
  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();

  if (!email) {
    context.res = { status: 400, body: { error: 'Email is required.' } };
    return;
  }

  try {
    var pool = await getPool();
    await ensureUsersSchema(pool, context.log);

    var result = await pool.request()
      .input('email', sql.NVarChar(320), email)
      .query('SELECT id, name, email, pin FROM Users WHERE email = @email');

    var user = result.recordset[0];

    if (!user) {
      context.res = { status: 404, body: { error: 'No account found for that email.' } };
      return;
    }

    if (!user.pin) {
      // Account predates the pin-storage column. Ask the user to sign in once
      // so the column gets backfilled, then they can use forgot-PIN.
      context.res = {
        status: 409,
        body: {
          error: 'We don\'t have your PIN stored yet. Please sign in once with your current PIN and try again, or register again if you don\'t remember it.'
        }
      };
      return;
    }

    await sendPinEmail(user.email, user.name, user.pin, function (m) { context.log(m); });

    context.res = {
      status: 200,
      body: { ok: true, message: 'Your PIN has been emailed to ' + user.email + '.' }
    };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Forgot-PIN error:', message, err && err.stack);
    context.res = { status: 500, body: { error: message } };
  }
};
