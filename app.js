(function () {
  'use strict';

  // ── Utilities ────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Auth ─────────────────────────────────────────────────
  var AUTH_USERS_KEY = 'gp-users';
  var AUTH_SESSION_KEY = 'gp-session';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || []; }
    catch (e) { return []; }
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)); }
    catch (e) { return null; }
  }

  function register(name, email, password) {
    var users = getUsers();
    if (users.find(function (u) { return u.email.toLowerCase() === email.toLowerCase(); })) {
      return { error: 'An account with this email already exists.' };
    }
    var user = { id: uid(), name: name.trim(), email: email.toLowerCase() };
    users.push(Object.assign({}, user, { password: password }));
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
    return { user: user };
  }

  function loginUser(email, password) {
    var users = getUsers();
    var found = users.find(function (u) {
      return u.email.toLowerCase() === email.toLowerCase() && u.password === password;
    });
    if (!found) return { error: 'Incorrect email or password.' };
    return { user: { id: found.id, name: found.name, email: found.email } };
  }

  function showApp(session) {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    document.getElementById('authScreen').classList.add('hidden');
    var shell = document.getElementById('appShell');
    shell.classList.remove('hidden');
    var firstName = session.name.split(' ')[0];
    document.getElementById('userGreeting').textContent = 'Namaste, ' + firstName;
    initApp(session.id);
  }

  function logout() {
    localStorage.removeItem(AUTH_SESSION_KEY);
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
  }

  // Auth tab switching
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var loginForm = document.getElementById('loginForm');
  var registerForm = document.getElementById('registerForm');

  tabLogin.addEventListener('click', function () {
    tabLogin.classList.add('auth-tab-active');
    tabRegister.classList.remove('auth-tab-active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    document.getElementById('loginError').classList.add('hidden');
  });

  tabRegister.addEventListener('click', function () {
    tabRegister.classList.add('auth-tab-active');
    tabLogin.classList.remove('auth-tab-active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
  });

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var result = loginUser(email, password);
    var errEl = document.getElementById('loginError');
    if (result.error) {
      errEl.textContent = result.error;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
      showApp(result.user);
    }
  });

  registerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('regName').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var password = document.getElementById('regPassword').value;
    var confirm = document.getElementById('regConfirm').value;
    var errEl = document.getElementById('registerError');

    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    var result = register(name, email, password);
    if (result.error) {
      errEl.textContent = result.error;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
      showApp(result.user);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Restore existing session on load
  var existingSession = getSession();
  if (existingSession) {
    showApp(existingSession);
  }

  // ── Main App ─────────────────────────────────────────────
  // Called once after successful auth; userId scopes the data.
  function initApp(userId) {
    var STORAGE_KEY = 'gruhapravesham-planner-v1-' + userId;

    var defaultState = {
      muhurtham: { date: '', time: '', nakshatra: '', venue: '', priest: '', notes: '' },
      guests: [],
      tasks: [],
      expenses: []
    };

    var state = loadState();

    function loadState() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(defaultState));
        return Object.assign(JSON.parse(JSON.stringify(defaultState)), JSON.parse(raw));
      } catch (e) {
        return JSON.parse(JSON.stringify(defaultState));
      }
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
        label.textContent = 'Set the muhurtham below';
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
      document.getElementById('mNotes').textContent = m.notes || '\u2014';
    }

    function openMuhurthamForm() {
      var m = state.muhurtham;
      document.getElementById('fDate').value = m.date || '';
      document.getElementById('fTime').value = m.time || '';
      document.getElementById('fNakshatra').value = m.nakshatra || '';
      document.getElementById('fVenue').value = m.venue || '';
      document.getElementById('fPriest').value = m.priest || '';
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

    // ── Init renders ──
    renderMuhurtham();
    renderCountdown();
    renderGuests();
    renderTasks();
    renderExpenses();

    setInterval(renderCountdown, 60 * 1000);
  }

})();