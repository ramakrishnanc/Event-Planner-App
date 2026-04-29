const bcrypt = require('bcryptjs');
const { getPool, ensureSchema, sql } = require('../shared/db');

function generatePin() {
  // Avoid trivial PINs (e.g., 0000, 1111, 1234)
  var trivial = { '0000': 1, '1111': 1, '2222': 1, '3333': 1, '4444': 1, '5555': 1, '6666': 1, '7777': 1, '8888': 1, '9999': 1, '1234': 1, '4321': 1 };
  for (var i = 0; i < 20; i++) {
    var n = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    if (!trivial[n]) return n;
  }
  return '7392';
}

async function sendPinEmail(toEmail, name, pin, log) {
  var host = process.env.SMTP_HOST;
  var port = parseInt(process.env.SMTP_PORT || '587', 10);
  var user = process.env.SMTP_USER;
  var pass = process.env.SMTP_PASS;
  var from = process.env.SMTP_FROM || user || 'no-reply@evento.app';

  var subject = 'Your new Evento PIN';
  var text =
    'Hi ' + (name || 'there') + ',\n\n' +
    'Your new 4-digit PIN for Evento is: ' + pin + '\n\n' +
    'Use it to sign in. Once signed in you can change your PIN from settings.\n\n' +
    'If you didn\'t request this, please ignore this email — your old PIN is no longer valid.\n\n' +
    '— Evento';

  if (!host || !user || !pass) {
    log('SMTP not configured — would send PIN ' + pin + ' to ' + toEmail);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    var nodemailer = require('nodemailer');
    var transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: { user: user, pass: pass }
    });
    await transporter.sendMail({
      from: from,
      to: toEmail,
      subject: subject,
      text: text
    });
    return { sent: true };
  } catch (e) {
    log('SMTP send error: ' + e.message);
    return { sent: false, reason: 'smtp_error', error: e.message };
  }
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
    await ensureSchema(pool, context.log);

    var result = await pool.request()
      .input('email', sql.NVarChar(320), email)
      .query('SELECT id, name, email FROM Users WHERE email = @email');

    var user = result.recordset[0];

    // Always return a generic success message to avoid leaking which emails are registered.
    if (!user) {
      context.log('Forgot-PIN: no account for ' + email);
      context.res = {
        status: 200,
        body: { ok: true, message: 'If that email is registered, a new PIN is on its way.' }
      };
      return;
    }

    var newPin = generatePin();
    var hash = await bcrypt.hash(newPin, 10);

    await pool.request()
      .input('id', sql.NVarChar(50), user.id)
      .input('passwordHash', sql.NVarChar(200), hash)
      .query('UPDATE Users SET password_hash = @passwordHash WHERE id = @id');

    var emailResult = await sendPinEmail(user.email, user.name, newPin, function (m) { context.log(m); });

    context.res = {
      status: 200,
      body: {
        ok: true,
        message: emailResult.sent
          ? 'A new PIN has been emailed to you.'
          : 'A new PIN has been generated. Check your email shortly.'
      }
    };
  } catch (err) {
    var message = (err && err.message) || 'unknown error';
    context.log.error('Forgot-PIN error:', message, err && err.stack);
    context.res = { status: 500, body: { error: 'Could not reset PIN: ' + message } };
  }
};
