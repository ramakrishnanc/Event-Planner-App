(function () {
  'use strict';

  // ── Utilities ────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function $(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtShortDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtTime(t) {
    if (!t) return '';
    var parts = t.split(':').map(Number);
    var d = new Date();
    d.setHours(parts[0], parts[1], 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtMoney(n) {
    var num = Number(n) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── API helper ───────────────────────────────────────────
  function apiCall(method, path, body, userId) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (userId) opts.headers['x-user-id'] = userId;
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    return fetch('/api/' + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); }
          catch (e) {
            var perr = new Error('Server returned an unexpected response (' + res.status + '). ' + (text.slice(0, 120) || ''));
            perr.status = res.status;
            throw perr;
          }
        }
        if (!res.ok) {
          var msg = (data && data.error) || ('Request failed (' + res.status + ')');
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  var GP_SESSION_KEY = 'gp-session';
  var GP_OFFLINE_KEY = 'gp-offline-store';

  var ALL_FIELDS = ['date', 'time', 'nakshatra', 'venue', 'priest', 'honoree', 'theme', 'notes'];

  var EVENT_TYPES = [
    { id: 'gruhapravesham', label: 'House Warming', icon: '🏠',
      title: 'Gruhapravesham Planner', tagline: 'Plan the housewarming with calm and clarity',
      themeClass: 'theme-marriage', sectionTitle: 'Muhurtham Details', countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'notes'],
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Return Gifts', 'Gifts', 'Travel', 'Other'] },
    { id: 'birthday', label: 'Birthday', icon: '🎂',
      title: 'Birthday Planner', tagline: 'Plan a joyful celebration',
      themeClass: 'theme-birthday', sectionTitle: 'Birthday Details', countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'honoree', 'theme', 'notes'], honoreeLabel: 'Birthday Person',
      categories: ['Cake', 'Food & Catering', 'Decoration', 'Venue', 'Photographer', 'Makeup', 'Entertainment', 'Gifts', 'Return Gifts', 'Other'] },
    { id: 'marriage', label: 'Marriage', icon: '💍',
      title: 'Marriage Planner', tagline: 'Plan the auspicious union with grace',
      themeClass: 'theme-marriage', sectionTitle: 'Wedding Details', countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'notes'],
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Attire', 'Jewelry', 'Venue', 'Return Gifts', 'Gifts', 'Travel', 'Other'] },
    { id: 'engagement', label: 'Engagement', icon: '💍',
      title: 'Engagement Planner', tagline: 'Plan the betrothal with grace',
      themeClass: 'theme-engagement', sectionTitle: 'Engagement Details', countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'honoree', 'theme', 'notes'], honoreeLabel: 'Couple',
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Attire', 'Jewelry', 'Venue', 'Rings', 'Return Gifts', 'Gifts', 'Travel', 'Other'] },
    { id: 'puja', label: 'Puja', icon: 'ॐ',
      title: 'Puja Planner', tagline: 'Plan the ritual with devotion',
      themeClass: 'theme-puja', sectionTitle: 'Puja Details', countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'notes'],
      categories: ['Pooja Items', 'Food & Prasadam', 'Priest Dakshina', 'Decoration', 'Flowers', 'Other'] },
    { id: 'retirement', label: 'Retirement', icon: '🎉',
      title: 'Retirement Planner', tagline: 'Honour a life of service',
      themeClass: 'theme-retirement', sectionTitle: 'Retirement Details', countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'honoree', 'notes'], honoreeLabel: 'Honoree',
      categories: ['Food & Catering', 'Venue', 'Decoration', 'Photographer', 'Makeup', 'Mementos', 'Gifts', 'Other'] },
    { id: 'other', label: 'Other', icon: '✨',
      title: 'Event Planner', tagline: 'Plan your special occasion',
      themeClass: 'theme-other', sectionTitle: 'Event Details', countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'notes'],
      categories: ['Food & Catering', 'Venue', 'Decoration', 'Photographer', 'Makeup', 'Gifts', 'Other'] }
  ];

  function findType(id) {
    for (var i = 0; i < EVENT_TYPES.length; i++) {
      if (EVENT_TYPES[i].id === id) return EVENT_TYPES[i];
    }
    return EVENT_TYPES[EVENT_TYPES.length - 1];
  }

  var VENDOR_CATEGORY_LABELS = {
    caterer: 'Caterer', photographer: 'Photographer', priest: 'Priest',
    decorator: 'Decorator', makeup: 'Makeup Artist', venue: 'Venue',
    tenthouse: 'Tent House', entertainment: 'Entertainment', other: 'Other'
  };

  // ── Session helpers ──────────────────────────────────────
  function getSession() {
    try { return JSON.parse(localStorage.getItem(GP_SESSION_KEY)); }
    catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(GP_SESSION_KEY, JSON.stringify(s)); }
  function getUserId() {
    var s = getSession();
    return (s && s.id) || '';
  }

  // ── PIN input behaviour ──────────────────────────────────
  function bindPinRow(row) {
    var cells = row.querySelectorAll('.pin-cell');
    for (var i = 0; i < cells.length; i++) {
      (function (cell, idx) {
        cell.addEventListener('input', function (e) {
          // Strip non-digits
          var v = (cell.value || '').replace(/\D/g, '').slice(0, 1);
          cell.value = v;
          if (v && cells[idx + 1]) cells[idx + 1].focus();
        });
        cell.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !cell.value && cells[idx - 1]) {
            cells[idx - 1].focus();
            cells[idx - 1].value = '';
            e.preventDefault();
          } else if (e.key === 'ArrowLeft' && cells[idx - 1]) {
            cells[idx - 1].focus();
          } else if (e.key === 'ArrowRight' && cells[idx + 1]) {
            cells[idx + 1].focus();
          }
        });
        cell.addEventListener('paste', function (e) {
          var text = (e.clipboardData || window.clipboardData).getData('text') || '';
          var digits = text.replace(/\D/g, '').slice(0, cells.length);
          if (!digits) return;
          e.preventDefault();
          for (var j = 0; j < cells.length; j++) {
            cells[j].value = digits[j] || '';
          }
          var lastFilled = Math.min(digits.length, cells.length) - 1;
          if (cells[lastFilled + 1]) cells[lastFilled + 1].focus();
          else cells[lastFilled].focus();
        });
        cell.addEventListener('focus', function () { cell.select(); });
      })(cells[i], i);
    }
  }

  function readPin(row) {
    var cells = row.querySelectorAll('.pin-cell');
    var pin = '';
    for (var i = 0; i < cells.length; i++) pin += cells[i].value || '';
    return pin;
  }
  function clearPin(row) {
    var cells = row.querySelectorAll('.pin-cell');
    for (var i = 0; i < cells.length; i++) cells[i].value = '';
  }

  // ── Auth UI ──────────────────────────────────────────────
  function setAuthError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearAuthError(id) { $(id).classList.add('hidden'); }
  function setBusy(btn, busy, busyText, idleText) {
    btn.disabled = busy;
    btn.textContent = busy ? busyText : idleText;
  }

  var loginPinRow = document.querySelector('.pin-row[data-pin="login"]');
  var registerPinRow = document.querySelector('.pin-row[data-pin="register"]');
  var confirmPinRow = document.querySelector('.pin-row[data-pin="confirm"]');
  bindPinRow(loginPinRow);
  bindPinRow(registerPinRow);
  bindPinRow(confirmPinRow);

  var tabLogin = $('tabLogin');
  var tabRegister = $('tabRegister');
  var loginFormEl = $('loginForm');
  var registerFormEl = $('registerForm');
  var forgotPinFormEl = $('forgotPinForm');

  function showLoginTab() {
    tabLogin.classList.add('auth-tab-active');
    tabRegister.classList.remove('auth-tab-active');
    loginFormEl.classList.remove('hidden');
    registerFormEl.classList.add('hidden');
    forgotPinFormEl.classList.add('hidden');
    clearAuthError('loginError');
  }

  tabLogin.addEventListener('click', showLoginTab);
  tabRegister.addEventListener('click', function () {
    tabRegister.classList.add('auth-tab-active');
    tabLogin.classList.remove('auth-tab-active');
    registerFormEl.classList.remove('hidden');
    loginFormEl.classList.add('hidden');
    forgotPinFormEl.classList.add('hidden');
    clearAuthError('registerError');
  });

  $('forgotPinLink').addEventListener('click', function () {
    loginFormEl.classList.add('hidden');
    registerFormEl.classList.add('hidden');
    forgotPinFormEl.classList.remove('hidden');
    clearAuthError('forgotPinError');
    var emailVal = $('loginEmail').value.trim();
    if (emailVal) $('forgotPinEmail').value = emailVal;
    setTimeout(function () { $('forgotPinEmail').focus(); }, 0);
  });
  $('forgotPinCancel').addEventListener('click', showLoginTab);

  forgotPinFormEl.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAuthError('forgotPinError');
    var email = $('forgotPinEmail').value.trim();
    if (!email) {
      setAuthError('forgotPinError', 'Please enter your email.');
      return;
    }
    var btn = forgotPinFormEl.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Sending…', 'Email me a new PIN');
    apiCall('POST', 'forgotPin', { email: email })
      .then(function (res) {
        setBusy(btn, false, 'Sending…', 'Email me a new PIN');
        var msg = (res && res.message) || 'If that email is registered, a new PIN is on its way.';
        var el = $('forgotPinError');
        el.textContent = msg;
        el.classList.remove('hidden');
        el.classList.remove('auth-error');
        el.classList.add('auth-success');
        $('forgotPinEmail').value = '';
        setTimeout(function () {
          el.classList.add('hidden');
          el.classList.remove('auth-success');
          el.classList.add('auth-error');
          showLoginTab();
        }, 3500);
      })
      .catch(function (err) {
        setBusy(btn, false, 'Sending…', 'Email me a new PIN');
        setAuthError('forgotPinError', err.message);
      });
  });

  // Role toggle
  var selectedRole = 'user';
  var roleOptions = registerFormEl.querySelectorAll('.role-option');
  function applyRoleSelection(role) {
    selectedRole = role;
    for (var i = 0; i < roleOptions.length; i++) {
      var opt = roleOptions[i];
      var active = opt.getAttribute('data-role') === role;
      opt.classList.toggle('role-option-active', active);
      opt.setAttribute('aria-checked', active ? 'true' : 'false');
    }
    var isVendor = role === 'vendor';
    $('vendorCategoryField').classList.toggle('hidden', !isVendor);
    $('vendorPhoneField').classList.toggle('hidden', !isVendor);
    $('vendorCityField').classList.toggle('hidden', !isVendor);
    $('regNameLabel').textContent = isVendor ? 'Business / Your Name' : 'Your Name';
    $('regName').placeholder = isVendor ? 'e.g. Lakshmi Caterers' : 'e.g. Priya Krishnan';
  }
  for (var i = 0; i < roleOptions.length; i++) {
    (function (opt) {
      opt.addEventListener('click', function () {
        applyRoleSelection(opt.getAttribute('data-role'));
      });
    })(roleOptions[i]);
  }

  function routeAfterAuth(user) {
    if (user && user.role === 'vendor') showVendorHome(user);
    else showHome(user);
  }

  loginFormEl.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAuthError('loginError');
    var email = $('loginEmail').value.trim();
    var pin = readPin(loginPinRow);
    if (!/^\d{4}$/.test(pin)) {
      setAuthError('loginError', 'Enter your 4-digit PIN.');
      return;
    }
    var btn = loginFormEl.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Signing in…', 'Sign in');
    apiCall('POST', 'login', { email: email, pin: pin })
      .then(function (res) {
        setSession(res.user);
        routeAfterAuth(res.user);
        setBusy(btn, false, 'Signing in…', 'Sign in');
        clearPin(loginPinRow);
      })
      .catch(function (err) {
        setAuthError('loginError', err.message);
        setBusy(btn, false, 'Signing in…', 'Sign in');
      });
  });

  registerFormEl.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAuthError('registerError');
    var name = $('regName').value.trim();
    var email = $('regEmail').value.trim();
    var pin = readPin(registerPinRow);
    var pinConfirm = readPin(confirmPinRow);

    if (!/^\d{4}$/.test(pin)) {
      setAuthError('registerError', 'PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== pinConfirm) {
      setAuthError('registerError', 'PINs do not match.');
      return;
    }

    var payload = { name: name, email: email, pin: pin, role: selectedRole };
    if (selectedRole === 'vendor') {
      payload.vendorCategory = $('regVendorCategory').value;
      payload.vendorPhone = $('regVendorPhone').value.trim();
      payload.vendorCity = $('regVendorCity').value.trim();
    }

    var btn = registerFormEl.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Creating account…', 'Create account');
    apiCall('POST', 'register', payload)
      .then(function (res) {
        setSession(res.user);
        routeAfterAuth(res.user);
        setBusy(btn, false, 'Creating account…', 'Create account');
        clearPin(registerPinRow);
        clearPin(confirmPinRow);
      })
      .catch(function (err) {
        setAuthError('registerError', err.message);
        setBusy(btn, false, 'Creating account…', 'Create account');
      });
  });

  // ── Logout ───────────────────────────────────────────────
  function performLogout() {
    // Best-effort flush of any pending save before we drop the session.
    unloadFlush();
    clearTimeout(saveTimer);
    localStorage.removeItem(GP_SESSION_KEY);
    lastSerialised = '';
    dataLoaded = false;
    store = { events: [], bookings: [] };
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);
    $('appShell').classList.add('hidden');
    $('homeScreen').classList.add('hidden');
    $('vendorHome').classList.add('hidden');
    $('authScreen').classList.remove('hidden');
    loginFormEl.reset();
    registerFormEl.reset();
    clearPin(loginPinRow);
    clearPin(registerPinRow);
    clearPin(confirmPinRow);
    applyRoleSelection('user');
    clearAuthError('loginError');
  }
  $('logoutBtn').addEventListener('click', performLogout);
  $('logoutBtn2').addEventListener('click', performLogout);
  $('vendorLogoutBtn').addEventListener('click', performLogout);

  // ── Saved-events data model ──────────────────────────────
  // Server stores: { events: [ { id, typeId, name, muhurtham, guests, tasks, expenses, createdAt, updatedAt } ] }
  // Migration: legacy shape with top-level muhurtham/guests/tasks/expenses → wrap as events[0].
  function defaultEventState(typeId) {
    return {
      id: 'e_' + uid(),
      typeId: typeId,
      name: '',
      muhurtham: { date: '', time: '', nakshatra: '', venue: '', priest: '', honoree: '', theme: '', notes: '' },
      guests: [],
      tasks: [],
      expenses: [],
      vendors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function ensureEventArrays(ev) {
    if (!ev.guests) ev.guests = [];
    if (!ev.tasks) ev.tasks = [];
    if (!ev.expenses) ev.expenses = [];
    if (!ev.vendors) ev.vendors = [];
    return ev;
  }

  var store = { events: [] };
  var activeEventId = null;
  var saveTimer;
  var dataLoaded = false;
  var saveInFlight = null;
  var pendingSave = false;
  var lastSerialised = '';

  function setSaveStatus(state, msg) {
    var nodes = document.querySelectorAll('.save-status');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.classList.remove('saving', 'saved', 'error', 'visible');
      if (state) {
        n.classList.add('visible', state);
        n.textContent = msg || '';
      } else {
        n.textContent = '';
      }
    }
  }

  function flashSaved() {
    setSaveStatus('saved', 'Saved');
    setTimeout(function () {
      // Only clear if still in 'saved' state (don't override later saving/error)
      var any = document.querySelector('.save-status.saved');
      if (any) setSaveStatus(null);
    }, 1800);
  }

  function backupOffline(serialised) {
    try { localStorage.setItem(GP_OFFLINE_KEY, serialised); } catch (e) {}
  }
  function clearOffline() {
    try { localStorage.removeItem(GP_OFFLINE_KEY); } catch (e) {}
  }
  function getOffline() {
    try { return localStorage.getItem(GP_OFFLINE_KEY); } catch (e) { return null; }
  }

  function attemptPut(serialised) {
    return fetch('/api/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': getUserId()
      },
      body: serialised
    }).then(function (res) {
      return res.text().then(function (text) {
        var parsed = null;
        if (text) { try { parsed = JSON.parse(text); } catch (e) {} }
        if (!res.ok) {
          var err = new Error((parsed && parsed.error) || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return parsed;
      });
    });
  }

  function saveWithRetry(serialised, attempt) {
    attempt = attempt || 1;
    return attemptPut(serialised).catch(function (err) {
      // Auth errors won't get better with retries.
      if (err.status === 401 || err.status === 403) throw err;
      // Client-side errors (4xx) won't get better with retries either.
      if (err.status && err.status >= 400 && err.status < 500) throw err;
      if (attempt >= 4) throw err;
      var delay = 400 * Math.pow(2, attempt - 1); // 400, 800, 1600 ms
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(saveWithRetry(serialised, attempt + 1)); }, delay);
      });
    });
  }

  function performSave() {
    if (!getUserId()) return Promise.resolve();
    var serialised = JSON.stringify(store);
    if (serialised === lastSerialised) return Promise.resolve();
    setSaveStatus('saving', 'Saving…');
    backupOffline(serialised); // safety net while save is in flight
    saveInFlight = saveWithRetry(serialised)
      .then(function () {
        lastSerialised = serialised;
        clearOffline();
        saveInFlight = null;
        if (pendingSave) {
          pendingSave = false;
          return performSave();
        }
        flashSaved();
      })
      .catch(function (err) {
        saveInFlight = null;
        console.error('Save failed:', err);
        if (err.status === 401 || err.status === 403) {
          // Token rejected — keep the user in the app with their local copy
          // (already backed up to offline storage) and let them re-sign-in
          // when they're ready, rather than yanking them out mid-task.
          setSaveStatus('error', 'Sign in again to sync');
        } else {
          setSaveStatus('error', 'Save failed — will retry');
          setTimeout(function () {
            if (!saveInFlight && JSON.stringify(store) !== lastSerialised) performSave();
          }, 5000);
        }
      });
    return saveInFlight;
  }

  function loadStore() {
    return apiCall('GET', 'data', null, getUserId()).then(function (data) {
      var migrated = false;
      if (!data) {
        store = { events: [], bookings: [] };
      } else if (data.events && Array.isArray(data.events)) {
        store = data;
        if (!store.events) store.events = [];
        if (!store.bookings) store.bookings = [];
        store.events.forEach(ensureEventArrays);
      } else if (data.muhurtham || data.guests || data.tasks || data.expenses) {
        var legacy = defaultEventState('gruhapravesham');
        legacy.muhurtham = data.muhurtham || legacy.muhurtham;
        legacy.guests = data.guests || [];
        legacy.tasks = data.tasks || [];
        legacy.expenses = data.expenses || [];
        store = { events: [legacy], bookings: [] };
        migrated = true;
      } else {
        store = { events: data.events || [], bookings: data.bookings || [] };
      }
      lastSerialised = JSON.stringify(store);
      dataLoaded = true;

      // If there's a local-only backup that's newer than what came back from server,
      // prefer the local copy and try to push it up.
      var offline = getOffline();
      if (offline && offline !== lastSerialised) {
        try {
          var local = JSON.parse(offline);
          if (local && local.events) {
            store = local;
            store.events.forEach(ensureEventArrays);
            scheduleSave();
            console.log('Restored local backup of unsaved changes.');
          }
        } catch (e) { /* ignore */ }
      }

      if (migrated) scheduleSave();
    }).catch(function (err) {
      console.error('loadStore failed:', err);
      // Fall back to offline backup if present so the user keeps their data on screen.
      var offline = getOffline();
      if (offline) {
        try {
          var local = JSON.parse(offline);
          if (local && local.events) {
            store = local;
            store.events.forEach(ensureEventArrays);
            lastSerialised = '';
            console.warn('Server load failed; using local backup.');
          }
        } catch (e) {
          store = { events: [], bookings: [] };
          lastSerialised = '';
        }
      } else {
        store = { events: [], bookings: [] };
        lastSerialised = '';
      }
      dataLoaded = true;
      var status = err && err.status;
      if (status === 401 || status === 403) {
        setSaveStatus('error', 'Sync paused — sign in again to save');
      } else {
        setSaveStatus('error', 'Load failed — using local copy');
      }
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    if (saveInFlight) {
      pendingSave = true; // will chain after current save completes
      return;
    }
    saveTimer = setTimeout(function () {
      performSave();
    }, 500);
  }

  // Force a save right now (used on screen-change and unload).
  function flushSave() {
    clearTimeout(saveTimer);
    if (saveInFlight) return saveInFlight; // current in-flight save will land
    return performSave();
  }

  // Unload-time best-effort save with keepalive so the request survives navigation.
  function unloadFlush() {
    if (!getUserId()) return;
    var serialised = JSON.stringify(store);
    if (serialised === lastSerialised) return;
    try {
      fetch('/api/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': getUserId()
        },
        body: serialised,
        keepalive: true
      });
    } catch (e) { /* best effort */ }
  }
  window.addEventListener('beforeunload', unloadFlush);
  window.addEventListener('pagehide', unloadFlush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') unloadFlush();
  });

  function findEvent(id) {
    for (var i = 0; i < store.events.length; i++) {
      if (store.events[i].id === id) return store.events[i];
    }
    return null;
  }

  function defaultEventName(ev) {
    var t = findType(ev.typeId);
    if (ev.muhurtham && ev.muhurtham.honoree) return ev.muhurtham.honoree + '’s ' + t.label;
    return t.label;
  }

  // ── Home screen (saved events + new) ─────────────────────
  function renderSavedEvents() {
    var list = $('savedEventList');
    var empty = $('savedEventEmpty');
    list.innerHTML = '';
    var sorted = store.events.slice().sort(function (a, b) {
      var ad = (a.muhurtham && a.muhurtham.date) || '9999-12-31';
      var bd = (b.muhurtham && b.muhurtham.date) || '9999-12-31';
      return ad.localeCompare(bd);
    });
    sorted.forEach(function (ev) {
      var t = findType(ev.typeId);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'saved-event-card';

      var icon = document.createElement('span');
      icon.className = 'saved-event-icon';
      icon.textContent = t.icon;

      var body = document.createElement('div');
      body.className = 'saved-event-body';
      var title = document.createElement('span');
      title.className = 'saved-event-title';
      title.textContent = ev.name || defaultEventName(ev);
      var meta = document.createElement('span');
      meta.className = 'saved-event-meta';
      var metaParts = [t.label];
      if (ev.muhurtham && ev.muhurtham.date) metaParts.push(fmtShortDate(ev.muhurtham.date));
      if (ev.muhurtham && ev.muhurtham.venue) metaParts.push(ev.muhurtham.venue);
      meta.textContent = metaParts.join(' · ');
      body.appendChild(title);
      body.appendChild(meta);

      var badge = document.createElement('span');
      badge.className = 'saved-event-badge';
      var date = ev.muhurtham && ev.muhurtham.date;
      if (date) {
        var d = new Date(date + 'T00:00:00');
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var diff = Math.round((d - today) / 86400000);
        if (diff > 0) {
          badge.textContent = diff + 'd to go';
          if (diff <= 7) badge.classList.add('soon');
        } else if (diff === 0) {
          badge.textContent = 'Today';
          badge.classList.add('today');
        } else {
          badge.textContent = Math.abs(diff) + 'd ago';
          badge.classList.add('past');
        }
      } else {
        badge.textContent = 'Draft';
      }

      var del = document.createElement('span');
      del.className = 'icon-btn';
      del.title = 'Delete event';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete this event and all its data?')) return;
        store.events = store.events.filter(function (x) { return x.id !== ev.id; });
        scheduleSave();
        renderSavedEvents();
      });

      card.appendChild(icon);
      card.appendChild(body);
      card.appendChild(badge);
      card.appendChild(del);
      card.addEventListener('click', function () {
        openEvent(ev.id);
      });
      list.appendChild(card);
    });
    $('savedEventCount').textContent = store.events.length;
    empty.classList.toggle('hidden', store.events.length > 0);
  }

  function renderEventTiles() {
    var grid = $('eventGrid');
    grid.innerHTML = '';
    EVENT_TYPES.forEach(function (ev) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-tile';
      var icon = document.createElement('span');
      icon.className = 'event-tile-icon';
      icon.textContent = ev.icon;
      var lbl = document.createElement('span');
      lbl.className = 'event-tile-label';
      lbl.textContent = ev.label;
      btn.appendChild(icon);
      btn.appendChild(lbl);
      btn.addEventListener('click', function () {
        var newEv = defaultEventState(ev.id);
        store.events.push(newEv);
        scheduleSave();
        openEvent(newEv.id);
      });
      grid.appendChild(btn);
    });
  }

  function showHome(session) {
    $('authScreen').classList.add('hidden');
    $('appShell').classList.add('hidden');
    $('vendorHome').classList.add('hidden');
    $('homeScreen').classList.remove('hidden');
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);

    $('userGreeting').textContent = 'Hi ' + (session.name || '').split(' ')[0];

    var ensureLoaded = dataLoaded ? Promise.resolve() : loadStore();
    ensureLoaded.then(function () {
      renderSavedEvents();
      renderEventTiles();
    });
  }

  $('backToHomeBtn').addEventListener('click', function () {
    flushSave();
    var session = getSession();
    if (session) showHome(session);
  });

  // ── Planner (single event) ───────────────────────────────
  var currentEvent = null; // event-type config
  var currentEventRecord = null;

  function applyEventTheme(typeCfg) {
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);
    document.body.classList.add(typeCfg.themeClass);

    $('appTitle').textContent = typeCfg.title;
    $('appTagline').textContent = typeCfg.tagline;
    $('muhurthamSectionTitle').textContent = typeCfg.sectionTitle;

    ALL_FIELDS.forEach(function (f) {
      var visible = typeCfg.fields.indexOf(f) >= 0;
      var nodes = document.querySelectorAll('[data-field="' + f + '"]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('hidden', !visible);
      }
    });

    if (typeCfg.honoreeLabel) {
      var hLabel = $('mHonoreeLabel');
      var fLabel = $('fHonoreeLabel');
      if (hLabel) hLabel.textContent = typeCfg.honoreeLabel;
      if (fLabel) fLabel.childNodes[0].nodeValue = typeCfg.honoreeLabel;
    } else {
      $('mHonoreeLabel').textContent = 'Honoree';
      $('fHonoreeLabel').childNodes[0].nodeValue = 'Honoree';
    }

    var sel = $('expCategory');
    sel.innerHTML = '';
    typeCfg.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
  }

  function openEvent(id) {
    var ev = findEvent(id);
    if (!ev) return;
    ensureEventArrays(ev);
    currentEventRecord = ev;
    activeEventId = id;
    currentEvent = findType(ev.typeId);

    $('authScreen').classList.add('hidden');
    $('homeScreen').classList.add('hidden');
    $('vendorHome').classList.add('hidden');
    $('appShell').classList.remove('hidden');

    applyEventTheme(currentEvent);
    renderAll();
  }

  // ── Planner sections ─────────────────────────────────────
  function renderAll() {
    renderMuhurtham();
    renderCountdown();
    renderGuests();
    renderTasks();
    renderEventVendors();
    renderExpenses();
  }

  function renderCountdown() {
    var el = $('daysToGo');
    var label = $('eventDateLabel');
    var ev = currentEventRecord;
    if (!ev) return;
    var date = ev.muhurtham.date;
    var time = ev.muhurtham.time;
    if (!date) {
      el.textContent = '--';
      label.textContent = (currentEvent && currentEvent.countdownPlaceholder) || 'Set the date below';
      document.querySelector('.countdown-label').textContent = 'days to go';
      return;
    }
    var target = new Date(date + 'T' + (time || '00:00') + ':00');
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var eventDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    var diffDays = Math.round((eventDay - today) / 86400000);
    if (diffDays > 0) {
      el.textContent = diffDays;
      document.querySelector('.countdown-label').textContent = diffDays === 1 ? 'day to go' : 'days to go';
    } else if (diffDays === 0) {
      el.textContent = '0';
      document.querySelector('.countdown-label').textContent = 'today!';
    } else {
      el.textContent = Math.abs(diffDays);
      document.querySelector('.countdown-label').textContent = 'days ago';
    }
    label.textContent = fmtDate(date) + (time ? ' · ' + fmtTime(time) : '');
  }

  function renderMuhurtham() {
    var m = currentEventRecord.muhurtham;
    $('mDate').textContent = m.date ? fmtDate(m.date) : '—';
    $('mTime').textContent = m.time ? fmtTime(m.time) : '—';
    $('mNakshatra').textContent = m.nakshatra || '—';
    $('mVenue').textContent = m.venue || '—';
    $('mPriest').textContent = m.priest || '—';
    $('mHonoree').textContent = m.honoree || '—';
    $('mTheme').textContent = m.theme || '—';
    $('mNotes').textContent = m.notes || '—';
  }

  function openMuhurthamForm() {
    var m = currentEventRecord.muhurtham;
    $('fDate').value = m.date || '';
    $('fTime').value = m.time || '';
    $('fNakshatra').value = m.nakshatra || '';
    $('fVenue').value = m.venue || '';
    $('fPriest').value = m.priest || '';
    $('fHonoree').value = m.honoree || '';
    $('fTheme').value = m.theme || '';
    $('fNotes').value = m.notes || '';
    $('muhurthamView').classList.add('hidden');
    $('muhurthamForm').classList.remove('hidden');
  }
  function closeMuhurthamForm() {
    $('muhurthamForm').classList.add('hidden');
    $('muhurthamView').classList.remove('hidden');
  }

  $('editMuhurthamBtn').addEventListener('click', openMuhurthamForm);
  $('cancelMuhurthamBtn').addEventListener('click', closeMuhurthamForm);
  $('muhurthamForm').addEventListener('submit', function (e) {
    e.preventDefault();
    currentEventRecord.muhurtham = {
      date: $('fDate').value,
      time: $('fTime').value,
      nakshatra: $('fNakshatra').value.trim(),
      venue: $('fVenue').value.trim(),
      priest: $('fPriest').value.trim(),
      honoree: $('fHonoree').value.trim(),
      theme: $('fTheme').value.trim(),
      notes: $('fNotes').value.trim()
    };
    currentEventRecord.updatedAt = new Date().toISOString();
    scheduleSave();
    renderMuhurtham();
    renderCountdown();
    closeMuhurthamForm();
  });

  // Guests
  function renderGuests() {
    var list = $('guestList');
    var empty = $('guestEmpty');
    list.innerHTML = '';
    var invited = 0, total = 0;
    currentEventRecord.guests.forEach(function (g) {
      var c = g.count || 1;
      if (g.invited) invited++;
      total += c;
      var li = document.createElement('li');
      li.className = 'list-item';
      var main = document.createElement('div'); main.className = 'main';
      var title = document.createElement('span'); title.className = 'title'; title.textContent = g.name;
      main.appendChild(title);
      var meta = document.createElement('span'); meta.className = 'meta';
      meta.textContent = c === 1 ? '1 person' : c + ' people';
      main.appendChild(meta);
      var tag = document.createElement('span');
      tag.className = 'invited-tag ' + (g.invited ? 'yes' : 'no');
      tag.textContent = g.invited ? 'Invited' : 'Pending';
      var toggle = document.createElement('button');
      toggle.className = 'toggle-btn'; toggle.type = 'button';
      toggle.textContent = g.invited ? 'Mark pending' : 'Mark invited';
      toggle.addEventListener('click', function () {
        g.invited = !g.invited; scheduleSave(); renderGuests();
      });
      var del = document.createElement('button');
      del.className = 'icon-btn'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
      del.addEventListener('click', function () {
        currentEventRecord.guests = currentEventRecord.guests.filter(function (x) { return x.id !== g.id; });
        scheduleSave(); renderGuests();
      });
      li.appendChild(main); li.appendChild(tag); li.appendChild(toggle); li.appendChild(del);
      list.appendChild(li);
    });
    $('invitedCount').textContent = invited;
    $('pendingInviteCount').textContent = currentEventRecord.guests.length - invited;
    $('totalHeadcount').textContent = total;
    empty.classList.toggle('hidden', currentEventRecord.guests.length > 0);
  }

  $('guestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('guestName').value.trim();
    var count = Math.max(1, parseInt($('guestCount').value, 10) || 1);
    if (!name) return;
    currentEventRecord.guests.push({ id: uid(), name: name, count: count, invited: false });
    currentEventRecord.updatedAt = new Date().toISOString();
    scheduleSave();
    $('guestName').value = ''; $('guestCount').value = '1';
    renderGuests();
  });

  // Tasks
  function dueClass(due) {
    if (!due) return '';
    var d = new Date(due + 'T00:00:00');
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((d - today) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'soon';
    return '';
  }

  function renderTasks() {
    var list = $('taskList');
    var empty = $('taskEmpty');
    list.innerHTML = '';
    var sorted = currentEventRecord.tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return ((a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'));
    });
    var done = 0;
    sorted.forEach(function (t) {
      if (t.done) done++;
      var li = document.createElement('li');
      li.className = 'list-item' + (t.done ? ' done' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'task-check'; cb.checked = !!t.done;
      cb.addEventListener('change', function () { t.done = cb.checked; scheduleSave(); renderTasks(); });
      var main = document.createElement('div'); main.className = 'main';
      var title = document.createElement('span'); title.className = 'title'; title.textContent = t.title;
      main.appendChild(title);
      if (t.due) {
        var due = document.createElement('span');
        due.className = 'task-due ' + (t.done ? '' : dueClass(t.due));
        due.textContent = 'Due ' + fmtDate(t.due);
        main.appendChild(due);
      }
      var del = document.createElement('button');
      del.className = 'icon-btn'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
      del.addEventListener('click', function () {
        currentEventRecord.tasks = currentEventRecord.tasks.filter(function (x) { return x.id !== t.id; });
        scheduleSave(); renderTasks();
      });
      li.appendChild(cb); li.appendChild(main); li.appendChild(del);
      list.appendChild(li);
    });
    $('doneCount').textContent = done;
    $('pendingTaskCount').textContent = currentEventRecord.tasks.length - done;
    empty.classList.toggle('hidden', currentEventRecord.tasks.length > 0);
  }

  $('taskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('taskTitle').value.trim();
    var due = $('taskDue').value;
    if (!title) return;
    currentEventRecord.tasks.push({ id: uid(), title: title, due: due, done: false });
    currentEventRecord.updatedAt = new Date().toISOString();
    scheduleSave();
    $('taskTitle').value = ''; $('taskDue').value = '';
    renderTasks();
  });

  // Vendors (per-event)
  function renderEventVendors() {
    var list = $('planVendorList');
    var empty = $('planVendorEmpty');
    list.innerHTML = '';
    var vendors = currentEventRecord.vendors || [];
    vendors.forEach(function (v) {
      var li = document.createElement('li');
      li.className = 'list-item';

      var row = document.createElement('div');
      row.className = 'vendor-row';

      var meta = document.createElement('div');
      meta.className = 'vendor-meta';
      var name = document.createElement('span');
      name.className = 'vendor-name';
      name.textContent = v.name;
      var cat = document.createElement('span');
      cat.className = 'vendor-cat';
      cat.textContent = VENDOR_CATEGORY_LABELS[v.category] || v.category || 'Vendor';
      meta.appendChild(name);
      meta.appendChild(cat);

      if (v.phone) {
        var phoneNum = document.createElement('span');
        phoneNum.className = 'vendor-notes';
        phoneNum.textContent = v.phone;
        meta.appendChild(phoneNum);
      }
      if (v.notes) {
        var notes = document.createElement('span');
        notes.className = 'vendor-notes';
        notes.textContent = v.notes;
        meta.appendChild(notes);
      }

      row.appendChild(meta);

      if (v.phone) {
        var call = document.createElement('a');
        call.className = 'call-btn';
        call.href = 'tel:' + v.phone.replace(/[^+0-9]/g, '');
        call.textContent = 'Call';
        row.appendChild(call);
      } else {
        var noCall = document.createElement('span');
        noCall.className = 'call-btn disabled';
        noCall.textContent = 'No phone';
        row.appendChild(noCall);
      }

      var del = document.createElement('button');
      del.className = 'icon-btn'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
      del.addEventListener('click', function () {
        currentEventRecord.vendors = currentEventRecord.vendors.filter(function (x) { return x.id !== v.id; });
        currentEventRecord.updatedAt = new Date().toISOString();
        scheduleSave();
        renderEventVendors();
      });
      row.appendChild(del);

      li.appendChild(row);
      list.appendChild(li);
    });
    $('vendorCount').textContent = vendors.length;
    empty.classList.toggle('hidden', vendors.length > 0);
  }

  $('planVendorForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('pvName').value.trim();
    var category = $('pvCategory').value;
    var phone = $('pvPhone').value.trim();
    var notes = $('pvNotes').value.trim();
    if (!name) return;
    if (!currentEventRecord.vendors) currentEventRecord.vendors = [];
    currentEventRecord.vendors.push({ id: uid(), name: name, category: category, phone: phone, notes: notes });
    currentEventRecord.updatedAt = new Date().toISOString();
    scheduleSave();
    $('pvName').value = ''; $('pvPhone').value = ''; $('pvNotes').value = '';
    renderEventVendors();
  });

  // Expenses
  function renderExpenses() {
    var body = $('expenseBody');
    var empty = $('expenseEmpty');
    body.innerHTML = '';
    var sorted = currentEventRecord.expenses.slice();
    var total = 0;
    sorted.forEach(function (e) {
      total += Number(e.amount) || 0;
      var tr = document.createElement('tr');
      var tdDesc = document.createElement('td'); tdDesc.textContent = e.description;
      var tdAmt = document.createElement('td'); tdAmt.className = 'right'; tdAmt.textContent = fmtMoney(e.amount);
      var tdAct = document.createElement('td'); tdAct.className = 'right';
      var del = document.createElement('button');
      del.className = 'icon-btn'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
      del.addEventListener('click', function () {
        currentEventRecord.expenses = currentEventRecord.expenses.filter(function (x) { return x.id !== e.id; });
        scheduleSave(); renderExpenses();
      });
      tdAct.appendChild(del);
      tr.appendChild(tdDesc); tr.appendChild(tdAmt); tr.appendChild(tdAct);
      body.appendChild(tr);
    });
    $('expenseTotal').textContent = fmtMoney(total);
    empty.classList.toggle('hidden', currentEventRecord.expenses.length > 0);
    $('expenseTable').classList.toggle('hidden', currentEventRecord.expenses.length === 0);
  }

  $('expenseForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var desc = $('expDesc').value.trim();
    var amt = parseFloat($('expAmount').value);
    if (!desc || isNaN(amt)) return;
    currentEventRecord.expenses.push({ id: uid(), description: desc, amount: amt });
    currentEventRecord.updatedAt = new Date().toISOString();
    scheduleSave();
    $('expDesc').value = ''; $('expAmount').value = '';
    renderExpenses();
  });

  setInterval(function () {
    if (currentEventRecord) renderCountdown();
  }, 60 * 1000);

  // ── Vendor home (server-side bookings keyed by user_id) ──
  function renderBookingItem(ev) {
    var li = document.createElement('li');
    li.className = 'list-item';
    var main = document.createElement('div'); main.className = 'main';
    var title = document.createElement('span'); title.className = 'title';
    title.textContent = ev.client + ' · ' + ev.type;
    main.appendChild(title);
    var meta = document.createElement('span'); meta.className = 'meta';
    meta.textContent = fmtShortDate(ev.date) + (ev.venue ? ' · ' + ev.venue : '');
    main.appendChild(meta);
    var del = document.createElement('button');
    del.className = 'icon-btn'; del.type = 'button'; del.title = 'Remove'; del.textContent = '✕';
    del.addEventListener('click', function () {
      store.bookings = (store.bookings || []).filter(function (x) { return x.id !== ev.id; });
      scheduleSave();
      renderVendorBookings();
    });
    li.appendChild(main); li.appendChild(del);
    return li;
  }

  function renderVendorBookings() {
    var upcomingList = $('vendorUpcomingList');
    var pastList = $('vendorPastList');
    var upcomingEmpty = $('vendorUpcomingEmpty');
    var pastEmpty = $('vendorPastEmpty');
    upcomingList.innerHTML = '';
    pastList.innerHTML = '';

    var todayIso = new Date().toISOString().slice(0, 10);
    var bookings = (store.bookings || []).slice();
    var upcoming = bookings
      .filter(function (b) { return (b.date || '') >= todayIso; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var past = bookings
      .filter(function (b) { return (b.date || '') < todayIso; })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    upcoming.forEach(function (ev) { upcomingList.appendChild(renderBookingItem(ev)); });
    past.forEach(function (ev) { pastList.appendChild(renderBookingItem(ev)); });

    $('vendorUpcomingCount').textContent = upcoming.length;
    $('vendorPastCount').textContent = past.length;
    upcomingEmpty.classList.toggle('hidden', upcoming.length > 0);
    pastEmpty.classList.toggle('hidden', past.length > 0);
  }

  var vendorFormBound = false;
  function bindVendorForm() {
    if (vendorFormBound) return;
    vendorFormBound = true;
    $('vendorEventForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var client = $('veClient').value.trim();
      var type = $('veType').value;
      var date = $('veDate').value;
      var venue = $('veVenue').value.trim();
      if (!client || !date) return;
      if (!store.bookings) store.bookings = [];
      store.bookings.push({ id: uid(), client: client, type: type, date: date, venue: venue });
      scheduleSave();
      $('veClient').value = ''; $('veDate').value = ''; $('veVenue').value = '';
      renderVendorBookings();
    });
  }

  function showVendorHome(session) {
    $('authScreen').classList.add('hidden');
    $('homeScreen').classList.add('hidden');
    $('appShell').classList.add('hidden');
    $('vendorHome').classList.remove('hidden');
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);

    var category = session.vendorCategory || '';
    var label = VENDOR_CATEGORY_LABELS[category] || 'Vendor';
    $('vendorGreeting').textContent = 'Hi ' + (session.name || '').split(' ')[0];
    $('vendorCategoryChip').textContent = label;
    $('vpName').textContent = session.name || '—';
    $('vpCategory').textContent = label;
    $('vpPhone').textContent = session.vendorPhone || '—';
    $('vpCity').textContent = session.vendorCity || '—';
    bindVendorForm();

    var ensureLoaded = dataLoaded ? Promise.resolve() : loadStore();
    ensureLoaded.then(function () {
      renderVendorBookings();
    });
  }

  // ── Restore session on page load ─────────────────────────
  var existingSession = getSession();
  if (existingSession && existingSession.id) {
    routeAfterAuth(existingSession);
  }

})();
