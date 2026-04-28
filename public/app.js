(function () {
  'use strict';

  // ── Utilities ────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── API helper ───────────────────────────────────────────
  function apiCall(method, path, body, token) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    return fetch('/api/' + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); }
          catch (e) {
            throw new Error('Server returned an unexpected response (' + res.status + '). ' + (text.slice(0, 120) || ''));
          }
        }
        if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
        return data;
      });
    });
  }

  function getToken() {
    return localStorage.getItem('gp-jwt');
  }

  function isTokenExpired(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch (e) {
      return true;
    }
  }

  // ── Auth ─────────────────────────────────────────────────
  var GP_SESSION_KEY = 'gp-session';
  var GP_EVENT_KEY = 'gp-event';
  var GP_VENDOR_EVENTS_KEY = 'gp-vendor-events';

  var VENDOR_CATEGORY_LABELS = {
    caterer: 'Caterer',
    photographer: 'Photographer',
    priest: 'Priest',
    decorator: 'Decorator',
    makeup: 'Makeup Artist',
    venue: 'Venue',
    entertainment: 'Entertainment',
    other: 'Other'
  };

  var ALL_FIELDS = ['date', 'time', 'nakshatra', 'venue', 'priest', 'honoree', 'theme', 'notes'];

  var EVENT_TYPES = [
    {
      id: 'gruhapravesham', label: 'House Warming', icon: '\uD83C\uDFE0',
      title: 'Gruhapravesham Planner', tagline: 'Plan the housewarming with calm and clarity',
      themeClass: 'theme-gruhapravesham',
      sectionTitle: 'Muhurtham Details',
      countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'notes'],
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Return Gifts', 'Gifts', 'Travel', 'Other']
    },
    {
      id: 'birthday', label: 'Birthday', icon: '\uD83C\uDF82',
      title: 'Birthday Planner', tagline: 'Plan a joyful celebration',
      themeClass: 'theme-birthday',
      sectionTitle: 'Birthday Details',
      countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'honoree', 'theme', 'notes'],
      honoreeLabel: 'Birthday Person',
      categories: ['Cake', 'Food & Catering', 'Decoration', 'Venue', 'Photographer', 'Makeup', 'Entertainment', 'Gifts', 'Return Gifts', 'Other']
    },
    {
      id: 'marriage', label: 'Marriage', icon: '\uD83D\uDC8D',
      title: 'Marriage Planner', tagline: 'Plan the auspicious union with grace',
      themeClass: 'theme-marriage',
      sectionTitle: 'Wedding Details',
      countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'notes'],
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Attire', 'Jewelry', 'Venue', 'Return Gifts', 'Gifts', 'Travel', 'Other']
    },
    {
      id: 'engagement', label: 'Engagement', icon: '\uD83D\uDC8D',
      title: 'Engagement Planner', tagline: 'Plan the betrothal with grace',
      themeClass: 'theme-engagement',
      sectionTitle: 'Engagement Details',
      countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'honoree', 'theme', 'notes'],
      honoreeLabel: 'Couple',
      categories: ['Pooja', 'Food & Catering', 'Decoration', 'Priest Dakshina', 'Photographer', 'Makeup', 'Attire', 'Jewelry', 'Venue', 'Rings', 'Return Gifts', 'Gifts', 'Travel', 'Other']
    },
    {
      id: 'puja', label: 'Puja', icon: '\u0950',
      title: 'Puja Planner', tagline: 'Plan the ritual with devotion',
      themeClass: 'theme-puja',
      sectionTitle: 'Puja Details',
      countdownPlaceholder: 'Set the muhurtham below',
      fields: ['date', 'time', 'nakshatra', 'venue', 'priest', 'notes'],
      categories: ['Pooja Items', 'Food & Prasadam', 'Priest Dakshina', 'Decoration', 'Flowers', 'Other']
    },
    {
      id: 'retirement', label: 'Retirement', icon: '\uD83C\uDF89',
      title: 'Retirement Planner', tagline: 'Honour a life of service',
      themeClass: 'theme-retirement',
      sectionTitle: 'Retirement Details',
      countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'honoree', 'notes'],
      honoreeLabel: 'Honoree',
      categories: ['Food & Catering', 'Venue', 'Decoration', 'Photographer', 'Makeup', 'Mementos', 'Gifts', 'Other']
    },
    {
      id: 'other', label: 'Other', icon: '\u2728',
      title: 'Event Planner', tagline: 'Plan your special occasion',
      themeClass: 'theme-other',
      sectionTitle: 'Event Details',
      countdownPlaceholder: 'Set the date below',
      fields: ['date', 'time', 'venue', 'notes'],
      categories: ['Food & Catering', 'Venue', 'Decoration', 'Photographer', 'Makeup', 'Gifts', 'Other']
    }
  ];

  var currentEvent = null;

  function getEvent() {
    try { return JSON.parse(localStorage.getItem(GP_EVENT_KEY)); }
    catch (e) { return null; }
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(GP_SESSION_KEY)); }
    catch (e) { return null; }
  }

  function setAuthError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearAuthError(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function setSubmitState(form, loading) {
    var btn = form.querySelector('.auth-submit');
    btn.disabled = loading;
    btn.textContent = loading
      ? (form.id === 'loginForm' ? 'Entering…' : 'Creating account…')
      : (form.id === 'loginForm' ? 'Enter \u2192' : 'Create Account \u2192');
  }

  // Auth tab switching
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var loginFormEl = document.getElementById('loginForm');
  var registerFormEl = document.getElementById('registerForm');

  tabLogin.addEventListener('click', function () {
    tabLogin.classList.add('auth-tab-active');
    tabRegister.classList.remove('auth-tab-active');
    loginFormEl.classList.remove('hidden');
    registerFormEl.classList.add('hidden');
    clearAuthError('loginError');
  });

  tabRegister.addEventListener('click', function () {
    tabRegister.classList.add('auth-tab-active');
    tabLogin.classList.remove('auth-tab-active');
    registerFormEl.classList.remove('hidden');
    loginFormEl.classList.add('hidden');
    clearAuthError('registerError');
  });

  // Role toggle (User vs Vendor)
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
    document.getElementById('vendorCategoryField').classList.toggle('hidden', !isVendor);
    document.getElementById('vendorPhoneField').classList.toggle('hidden', !isVendor);
    document.getElementById('vendorCityField').classList.toggle('hidden', !isVendor);
    document.getElementById('regNameLabel').textContent = isVendor ? 'Business / Your Name' : 'Your Name';
    var nameInput = document.getElementById('regName');
    nameInput.placeholder = isVendor ? 'e.g. Lakshmi Caterers' : 'e.g. Priya Krishnan';
  }
  for (var i = 0; i < roleOptions.length; i++) {
    (function (opt) {
      opt.addEventListener('click', function () {
        applyRoleSelection(opt.getAttribute('data-role'));
      });
    })(roleOptions[i]);
  }

  function routeAfterAuth(user) {
    if (user && user.role === 'vendor') {
      showVendorHome(user);
    } else {
      showEventPicker(user);
    }
  }

  loginFormEl.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAuthError('loginError');
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    setSubmitState(loginFormEl, true);
    apiCall('POST', 'login', { email: email, password: password })
      .then(function (res) {
        localStorage.setItem('gp-jwt', res.token);
        localStorage.setItem(GP_SESSION_KEY, JSON.stringify(res.user));
        routeAfterAuth(res.user);
        setSubmitState(loginFormEl, false);
      })
      .catch(function (err) {
        setAuthError('loginError', err.message);
        setSubmitState(loginFormEl, false);
      });
  });

  registerFormEl.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAuthError('registerError');
    var name = document.getElementById('regName').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var confirm = document.getElementById('regConfirm').value;

    if (password !== confirm) {
      setAuthError('registerError', 'Passwords do not match.');
      return;
    }

    var payload = { name: name, email: email, password: password, role: selectedRole };
    if (selectedRole === 'vendor') {
      payload.vendorCategory = document.getElementById('regVendorCategory').value;
      payload.vendorPhone = document.getElementById('regVendorPhone').value.trim();
      payload.vendorCity = document.getElementById('regVendorCity').value.trim();
    }

    setSubmitState(registerFormEl, true);
    apiCall('POST', 'register', payload)
      .then(function (res) {
        localStorage.setItem('gp-jwt', res.token);
        localStorage.setItem(GP_SESSION_KEY, JSON.stringify(res.user));
        routeAfterAuth(res.user);
        setSubmitState(registerFormEl, false);
      })
      .catch(function (err) {
        setAuthError('registerError', err.message);
        setSubmitState(registerFormEl, false);
      });
  });

  function performLogout() {
    localStorage.removeItem('gp-jwt');
    localStorage.removeItem(GP_SESSION_KEY);
    localStorage.removeItem(GP_EVENT_KEY);
    currentEvent = null;
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);
    document.body.classList.remove('theme-vendor');
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('eventPicker').classList.add('hidden');
    document.getElementById('vendorHome').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    loginFormEl.reset();
    registerFormEl.reset();
    applyRoleSelection('user');
    clearAuthError('loginError');
  }

  document.getElementById('logoutBtn').addEventListener('click', performLogout);
  document.getElementById('vendorLogoutBtn').addEventListener('click', performLogout);

  document.getElementById('eventBackBtn').addEventListener('click', function () {
    document.getElementById('logoutBtn').click();
  });

  document.getElementById('changeEventBtn').addEventListener('click', function () {
    var session = getSession();
    if (session) showEventPicker(session);
  });

  function renderEventTiles(session) {
    var grid = document.getElementById('eventGrid');
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
        localStorage.setItem(GP_EVENT_KEY, JSON.stringify(ev));
        showApp(session, ev);
      });
      grid.appendChild(btn);
    });
  }

  function showEventPicker(session) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('vendorHome').classList.add('hidden');
    document.getElementById('eventPicker').classList.remove('hidden');
    document.getElementById('eventPickerGreeting').textContent =
      'Namaste, ' + session.name.split(' ')[0] + ' \u2014 what are we planning?';
    renderEventTiles(session);
  }

  // \u2500\u2500 Vendor Home \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function getVendorEvents() {
    try { return JSON.parse(localStorage.getItem(GP_VENDOR_EVENTS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveVendorEvents(list) {
    localStorage.setItem(GP_VENDOR_EVENTS_KEY, JSON.stringify(list));
  }

  function renderVendorEvents() {
    var list = document.getElementById('vendorEventList');
    var empty = document.getElementById('vendorEventEmpty');
    list.innerHTML = '';
    var events = getVendorEvents().slice().sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '');
    });
    events.forEach(function (ev) {
      var li = document.createElement('li');
      li.className = 'list-item';
      var main = document.createElement('div');
      main.className = 'main';
      var title = document.createElement('span');
      title.className = 'title';
      title.textContent = ev.client + ' \u00b7 ' + ev.type;
      main.appendChild(title);
      var meta = document.createElement('span');
      meta.className = 'meta';
      var d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
      var dateStr = d && !isNaN(d) ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ev.date;
      meta.textContent = dateStr + (ev.venue ? ' \u00b7 ' + ev.venue : '');
      main.appendChild(meta);
      var del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.title = 'Remove';
      del.textContent = '\u2715';
      del.addEventListener('click', function () {
        var remaining = getVendorEvents().filter(function (x) { return x.id !== ev.id; });
        saveVendorEvents(remaining);
        renderVendorEvents();
      });
      li.appendChild(main);
      li.appendChild(del);
      list.appendChild(li);
    });
    document.getElementById('vendorEventCount').textContent = events.length;
    empty.classList.toggle('hidden', events.length > 0);
  }

  var vendorFormBound = false;
  function bindVendorForm() {
    if (vendorFormBound) return;
    vendorFormBound = true;
    document.getElementById('vendorEventForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var client = document.getElementById('veClient').value.trim();
      var type = document.getElementById('veType').value;
      var date = document.getElementById('veDate').value;
      var venue = document.getElementById('veVenue').value.trim();
      if (!client || !date) return;
      var events = getVendorEvents();
      events.push({ id: uid(), client: client, type: type, date: date, venue: venue });
      saveVendorEvents(events);
      document.getElementById('veClient').value = '';
      document.getElementById('veDate').value = '';
      document.getElementById('veVenue').value = '';
      renderVendorEvents();
    });
  }

  function showVendorHome(session) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('eventPicker').classList.add('hidden');
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('vendorHome').classList.remove('hidden');
    document.body.classList.add('theme-vendor');

    var category = session.vendorCategory || '';
    var label = VENDOR_CATEGORY_LABELS[category] || 'Vendor';
    document.getElementById('vendorGreeting').textContent = 'Namaste, ' + session.name.split(' ')[0];
    document.getElementById('vendorTitle').textContent = label + ' Dashboard';
    document.getElementById('vendorCategoryChip').textContent = label;
    document.getElementById('vpName').textContent = session.name || '\u2014';
    document.getElementById('vpCategory').textContent = label;
    document.getElementById('vpPhone').textContent = session.vendorPhone || '\u2014';
    document.getElementById('vpCity').textContent = session.vendorCity || '\u2014';

    bindVendorForm();
    renderVendorEvents();
  }

  function applyEventTheme(event) {
    var allThemes = EVENT_TYPES.map(function (e) { return e.themeClass; });
    document.body.classList.remove.apply(document.body.classList, allThemes);
    document.body.classList.add(event.themeClass);

    document.getElementById('appTitle').textContent = event.title;
    document.getElementById('appTagline').textContent = event.tagline;
    document.getElementById('appOm').textContent = event.icon;
    document.getElementById('muhurthamSectionTitle').textContent = event.sectionTitle;

    ALL_FIELDS.forEach(function (f) {
      var visible = event.fields.indexOf(f) >= 0;
      var nodes = document.querySelectorAll('[data-field="' + f + '"]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('hidden', !visible);
      }
    });

    if (event.honoreeLabel) {
      var hLabel = document.getElementById('mHonoreeLabel');
      var fLabel = document.getElementById('fHonoreeLabel');
      if (hLabel) hLabel.textContent = event.honoreeLabel;
      if (fLabel) {
        fLabel.childNodes[0].nodeValue = event.honoreeLabel;
      }
    }

    var sel = document.getElementById('expCategory');
    var prev = sel.value;
    sel.innerHTML = '';
    event.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
    if (event.categories.indexOf(prev) >= 0) sel.value = prev;
  }

  var appInitialized = false;
  function showApp(session, event) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('eventPicker').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('userGreeting').textContent = 'Namaste, ' + session.name.split(' ')[0];
    if (event) {
      currentEvent = event;
      applyEventTheme(event);
    }
    if (!appInitialized) {
      initApp();
      appInitialized = true;
    } else {
      renderCountdownIfPossible();
    }
  }

  function renderCountdownIfPossible() {
    var label = document.getElementById('eventDateLabel');
    if (label && !label.textContent.match(/\d/)) {
      label.textContent = currentEvent ? currentEvent.countdownPlaceholder : 'Set the date below';
    }
  }

  // Restore session on page load
  var existingSession = getSession();
  var existingToken = getToken();
  var existingEvent = getEvent();
  if (existingSession && existingToken && !isTokenExpired(existingToken)) {
    if (existingSession.role === 'vendor') {
      showVendorHome(existingSession);
    } else if (existingEvent) {
      showApp(existingSession, existingEvent);
    } else {
      showEventPicker(existingSession);
    }
  }

  // ── Main App ─────────────────────────────────────────────
  function initApp() {
    var defaultState = {
      muhurtham: { date: '', time: '', nakshatra: '', venue: '', priest: '', honoree: '', theme: '', notes: '' },
      guests: [],
      tasks: [],
      expenses: []
    };

    var state = JSON.parse(JSON.stringify(defaultState));
    var saveTimer;

    // Load from API then render everything
    apiCall('GET', 'data', null, getToken())
      .then(function (data) {
        if (data) state = Object.assign(JSON.parse(JSON.stringify(defaultState)), data);
        renderAll();
      })
      .catch(function () {
        renderAll();
      });

    function renderAll() {
      renderMuhurtham();
      renderCountdown();
      renderGuests();
      renderTasks();
      renderExpenses();
    }

    // Debounced — batches rapid changes into a single API write
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        apiCall('PUT', 'data', state, getToken()).catch(function () {});
      }, 800);
    }

    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso + 'T00:00:00');
      if (isNaN(d)) return iso;
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

    // ── Countdown ──
    function renderCountdown() {
      var el = document.getElementById('daysToGo');
      var label = document.getElementById('eventDateLabel');
      var date = state.muhurtham.date;
      var time = state.muhurtham.time;
      if (!date) {
        el.textContent = '--';
        label.textContent = (currentEvent && currentEvent.countdownPlaceholder) || 'Set the date below';
        return;
      }
      var target = new Date(date + 'T' + (time || '00:00') + ':00');
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var eventDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      var diffDays = Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
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
      label.textContent = fmtDate(date) + (time ? ' \u00b7 ' + fmtTime(time) : '');
    }

    // ── Muhurtham ──
    function renderMuhurtham() {
      var m = state.muhurtham;
      document.getElementById('mDate').textContent = m.date ? fmtDate(m.date) : '\u2014';
      document.getElementById('mTime').textContent = m.time ? fmtTime(m.time) : '\u2014';
      document.getElementById('mNakshatra').textContent = m.nakshatra || '\u2014';
      document.getElementById('mVenue').textContent = m.venue || '\u2014';
      document.getElementById('mPriest').textContent = m.priest || '\u2014';
      document.getElementById('mHonoree').textContent = m.honoree || '\u2014';
      document.getElementById('mTheme').textContent = m.theme || '\u2014';
      document.getElementById('mNotes').textContent = m.notes || '\u2014';
    }

    function openMuhurthamForm() {
      var m = state.muhurtham;
      document.getElementById('fDate').value = m.date || '';
      document.getElementById('fTime').value = m.time || '';
      document.getElementById('fNakshatra').value = m.nakshatra || '';
      document.getElementById('fVenue').value = m.venue || '';
      document.getElementById('fPriest').value = m.priest || '';
      document.getElementById('fHonoree').value = m.honoree || '';
      document.getElementById('fTheme').value = m.theme || '';
      document.getElementById('fNotes').value = m.notes || '';
      document.getElementById('muhurthamView').classList.add('hidden');
      document.getElementById('muhurthamForm').classList.remove('hidden');
    }

    function closeMuhurthamForm() {
      document.getElementById('muhurthamForm').classList.add('hidden');
      document.getElementById('muhurthamView').classList.remove('hidden');
    }

    document.getElementById('editMuhurthamBtn').addEventListener('click', openMuhurthamForm);
    document.getElementById('cancelMuhurthamBtn').addEventListener('click', closeMuhurthamForm);
    document.getElementById('muhurthamForm').addEventListener('submit', function (e) {
      e.preventDefault();
      state.muhurtham = {
        date: document.getElementById('fDate').value,
        time: document.getElementById('fTime').value,
        nakshatra: document.getElementById('fNakshatra').value.trim(),
        venue: document.getElementById('fVenue').value.trim(),
        priest: document.getElementById('fPriest').value.trim(),
        honoree: document.getElementById('fHonoree').value.trim(),
        theme: document.getElementById('fTheme').value.trim(),
        notes: document.getElementById('fNotes').value.trim()
      };
      saveState();
      renderMuhurtham();
      renderCountdown();
      closeMuhurthamForm();
    });

    // ── Guests ──
    function renderGuests() {
      var list = document.getElementById('guestList');
      var empty = document.getElementById('guestEmpty');
      list.innerHTML = '';
      var invited = 0;
      var totalHeadcount = 0;
      state.guests.forEach(function (g) {
        var gCount = g.count || 1;
        if (g.invited) invited++;
        totalHeadcount += gCount;
        var li = document.createElement('li');
        li.className = 'list-item';
        var main = document.createElement('div');
        main.className = 'main';
        var title = document.createElement('span');
        title.className = 'title';
        title.textContent = g.name;
        main.appendChild(title);
        var metaLine = document.createElement('span');
        metaLine.className = 'meta';
        var metaParts = [];
        if (g.phone) metaParts.push(g.phone);
        metaParts.push(gCount === 1 ? '1 person' : gCount + ' people');
        metaLine.textContent = metaParts.join(' \u00b7 ');
        main.appendChild(metaLine);
        var tag = document.createElement('span');
        tag.className = 'invited-tag ' + (g.invited ? 'yes' : 'no');
        tag.textContent = g.invited ? 'Invited' : 'Pending';
        var toggle = document.createElement('button');
        toggle.className = 'toggle-btn';
        toggle.type = 'button';
        toggle.textContent = g.invited ? 'Mark pending' : 'Mark invited';
        toggle.addEventListener('click', function () {
          g.invited = !g.invited;
          saveState();
          renderGuests();
        });
        var del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.title = 'Remove';
        del.textContent = '\u2715';
        del.addEventListener('click', function () {
          state.guests = state.guests.filter(function (x) { return x.id !== g.id; });
          saveState();
          renderGuests();
        });
        li.appendChild(main);
        li.appendChild(tag);
        li.appendChild(toggle);
        li.appendChild(del);
        list.appendChild(li);
      });
      document.getElementById('invitedCount').textContent = invited;
      document.getElementById('pendingInviteCount').textContent = state.guests.length - invited;
      document.getElementById('totalHeadcount').textContent = totalHeadcount;
      empty.classList.toggle('hidden', state.guests.length > 0);
    }

    document.getElementById('guestForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('guestName').value.trim();
      var phone = document.getElementById('guestPhone').value.trim();
      var count = Math.max(1, parseInt(document.getElementById('guestCount').value, 10) || 1);
      if (!name) return;
      state.guests.push({ id: uid(), name: name, phone: phone, count: count, invited: false });
      saveState();
      document.getElementById('guestName').value = '';
      document.getElementById('guestPhone').value = '';
      document.getElementById('guestCount').value = '1';
      renderGuests();
    });

    // ── Tasks ──
    function dueClass(due) {
      if (!due) return '';
      var d = new Date(due + 'T00:00:00');
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var diff = Math.round((d - today) / (1000 * 60 * 60 * 24));
      if (diff < 0) return 'overdue';
      if (diff <= 3) return 'soon';
      return '';
    }

    function renderTasks() {
      var list = document.getElementById('taskList');
      var empty = document.getElementById('taskEmpty');
      list.innerHTML = '';
      var sorted = state.tasks.slice().sort(function (a, b) {
        if (a.done !== b.done) return a.done ? 1 : -1;
        var ad = a.due || '9999-12-31';
        var bd = b.due || '9999-12-31';
        return ad.localeCompare(bd);
      });
      var done = 0;
      sorted.forEach(function (t) {
        if (t.done) done++;
        var li = document.createElement('li');
        li.className = 'list-item' + (t.done ? ' done' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-check';
        cb.checked = !!t.done;
        cb.addEventListener('change', function () {
          t.done = cb.checked;
          saveState();
          renderTasks();
        });
        var main = document.createElement('div');
        main.className = 'main';
        var title = document.createElement('span');
        title.className = 'title';
        title.textContent = t.title;
        main.appendChild(title);
        if (t.due) {
          var due = document.createElement('span');
          due.className = 'task-due ' + (t.done ? '' : dueClass(t.due));
          due.textContent = 'Due Date: ' + fmtDate(t.due);
          main.appendChild(due);
        }
        var del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.title = 'Remove';
        del.textContent = '\u2715';
        del.addEventListener('click', function () {
          state.tasks = state.tasks.filter(function (x) { return x.id !== t.id; });
          saveState();
          renderTasks();
        });
        li.appendChild(cb);
        li.appendChild(main);
        li.appendChild(del);
        list.appendChild(li);
      });
      document.getElementById('doneCount').textContent = done;
      document.getElementById('pendingTaskCount').textContent = state.tasks.length - done;
      empty.classList.toggle('hidden', state.tasks.length > 0);
    }

    document.getElementById('taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = document.getElementById('taskTitle').value.trim();
      var due = document.getElementById('taskDue').value;
      if (!title) return;
      state.tasks.push({ id: uid(), title: title, due: due, done: false });
      saveState();
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDue').value = '';
      renderTasks();
    });

    // ── Expenses ──
    function renderExpenses() {
      var body = document.getElementById('expenseBody');
      var empty = document.getElementById('expenseEmpty');
      var breakdown = document.getElementById('categoryBreakdown');
      body.innerHTML = '';
      breakdown.innerHTML = '';
      var sorted = state.expenses.slice().sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      });
      var total = 0;
      var byCat = {};
      sorted.forEach(function (e) {
        total += Number(e.amount) || 0;
        byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
        var tr = document.createElement('tr');
        var tdDate = document.createElement('td');
        tdDate.textContent = e.date ? fmtDate(e.date) : '\u2014';
        var tdDesc = document.createElement('td');
        tdDesc.textContent = e.description;
        var tdCat = document.createElement('td');
        tdCat.textContent = e.category;
        var tdAmt = document.createElement('td');
        tdAmt.className = 'right';
        tdAmt.textContent = fmtMoney(e.amount);
        var tdAct = document.createElement('td');
        tdAct.className = 'right';
        var del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.title = 'Remove';
        del.textContent = '\u2715';
        del.addEventListener('click', function () {
          state.expenses = state.expenses.filter(function (x) { return x.id !== e.id; });
          saveState();
          renderExpenses();
        });
        tdAct.appendChild(del);
        tr.appendChild(tdDate);
        tr.appendChild(tdDesc);
        tr.appendChild(tdCat);
        tr.appendChild(tdAmt);
        tr.appendChild(tdAct);
        body.appendChild(tr);
      });
      document.getElementById('expenseTotal').textContent = fmtMoney(total);
      empty.classList.toggle('hidden', state.expenses.length > 0);
      document.getElementById('expenseTable').classList.toggle('hidden', state.expenses.length === 0);
      Object.keys(byCat).sort().forEach(function (cat) {
        var pill = document.createElement('span');
        pill.className = 'cat-pill';
        pill.textContent = cat + ': ' + fmtMoney(byCat[cat]);
        breakdown.appendChild(pill);
      });
    }

    document.getElementById('expenseForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var desc = document.getElementById('expDesc').value.trim();
      var cat = document.getElementById('expCategory').value;
      var amt = parseFloat(document.getElementById('expAmount').value);
      var date = document.getElementById('expDate').value || new Date().toISOString().slice(0, 10);
      if (!desc || isNaN(amt)) return;
      state.expenses.push({ id: uid(), description: desc, category: cat, amount: amt, date: date });
      saveState();
      document.getElementById('expDesc').value = '';
      document.getElementById('expAmount').value = '';
      document.getElementById('expDate').value = '';
      renderExpenses();
    });

    setInterval(renderCountdown, 60 * 1000);
  }

})();
