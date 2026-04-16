(function () {
  'use strict';

  const STORAGE_KEY = 'gruhapravesham-planner-v1';

  const defaultState = {
    muhurtham: { date: '', time: '', nakshatra: '', venue: '', priest: '', notes: '' },
    guests: [],
    tasks: [],
    expenses: []
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(defaultState), parsed);
    } catch (e) {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtMoney(n) {
    const num = Number(n) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------- Countdown ----------
  function renderCountdown() {
    const el = document.getElementById('daysToGo');
    const label = document.getElementById('eventDateLabel');
    const { date, time } = state.muhurtham;
    if (!date) {
      el.textContent = '--';
      label.textContent = 'Set the muhurtham below';
      return;
    }
    const target = new Date(date + 'T' + (time || '00:00') + ':00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
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

  // ---------- Muhurtham ----------
  function renderMuhurtham() {
    const m = state.muhurtham;
    document.getElementById('mDate').textContent = m.date ? fmtDate(m.date) : '\u2014';
    document.getElementById('mTime').textContent = m.time ? fmtTime(m.time) : '\u2014';
    document.getElementById('mNakshatra').textContent = m.nakshatra || '\u2014';
    document.getElementById('mVenue').textContent = m.venue || '\u2014';
    document.getElementById('mPriest').textContent = m.priest || '\u2014';
    document.getElementById('mNotes').textContent = m.notes || '\u2014';
  }

  function openMuhurthamForm() {
    const m = state.muhurtham;
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

  // ---------- Guests ----------
  function renderGuests() {
    const list = document.getElementById('guestList');
    const empty = document.getElementById('guestEmpty');
    list.innerHTML = '';
    let invited = 0;
    state.guests.forEach(function (g) {
      if (g.invited) invited++;
      const li = document.createElement('li');
      li.className = 'list-item';
      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = g.name;
      main.appendChild(title);
      if (g.phone) {
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = g.phone;
        main.appendChild(meta);
      }
      const tag = document.createElement('span');
      tag.className = 'invited-tag ' + (g.invited ? 'yes' : 'no');
      tag.textContent = g.invited ? 'Invited' : 'Pending';
      const toggle = document.createElement('button');
      toggle.className = 'toggle-btn';
      toggle.type = 'button';
      toggle.textContent = g.invited ? 'Mark pending' : 'Mark invited';
      toggle.addEventListener('click', function () {
        g.invited = !g.invited;
        saveState();
        renderGuests();
      });
      const del = document.createElement('button');
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
    empty.classList.toggle('hidden', state.guests.length > 0);
  }

  document.getElementById('guestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = document.getElementById('guestName').value.trim();
    const phone = document.getElementById('guestPhone').value.trim();
    if (!name) return;
    state.guests.push({ id: uid(), name: name, phone: phone, invited: false });
    saveState();
    document.getElementById('guestName').value = '';
    document.getElementById('guestPhone').value = '';
    renderGuests();
  });

  // ---------- Tasks ----------
  function dueClass(due) {
    if (!due) return '';
    const d = new Date(due + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'soon';
    return '';
  }

  function renderTasks() {
    const list = document.getElementById('taskList');
    const empty = document.getElementById('taskEmpty');
    list.innerHTML = '';
    const sorted = state.tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ad = a.due || '9999-12-31';
      const bd = b.due || '9999-12-31';
      return ad.localeCompare(bd);
    });
    let done = 0;
    sorted.forEach(function (t) {
      if (t.done) done++;
      const li = document.createElement('li');
      li.className = 'list-item' + (t.done ? ' done' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'task-check';
      cb.checked = !!t.done;
      cb.addEventListener('change', function () {
        t.done = cb.checked;
        saveState();
        renderTasks();
      });
      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = t.title;
      main.appendChild(title);
      if (t.due) {
        const due = document.createElement('span');
        due.className = 'task-due ' + (t.done ? '' : dueClass(t.due));
        due.textContent = 'Due ' + fmtDate(t.due);
        main.appendChild(due);
      }
      const del = document.createElement('button');
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
    const title = document.getElementById('taskTitle').value.trim();
    const due = document.getElementById('taskDue').value;
    if (!title) return;
    state.tasks.push({ id: uid(), title: title, due: due, done: false });
    saveState();
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDue').value = '';
    renderTasks();
  });

  // ---------- Expenses ----------
  function renderExpenses() {
    const body = document.getElementById('expenseBody');
    const empty = document.getElementById('expenseEmpty');
    const breakdown = document.getElementById('categoryBreakdown');
    body.innerHTML = '';
    breakdown.innerHTML = '';
    const sorted = state.expenses.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });
    let total = 0;
    const byCat = {};
    sorted.forEach(function (e) {
      total += Number(e.amount) || 0;
      byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
      const tr = document.createElement('tr');
      const tdDate = document.createElement('td');
      tdDate.textContent = e.date ? fmtDate(e.date) : '\u2014';
      const tdDesc = document.createElement('td');
      tdDesc.textContent = e.description;
      const tdCat = document.createElement('td');
      tdCat.textContent = e.category;
      const tdAmt = document.createElement('td');
      tdAmt.className = 'right';
      tdAmt.textContent = fmtMoney(e.amount);
      const tdAct = document.createElement('td');
      tdAct.className = 'right';
      const del = document.createElement('button');
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
      const pill = document.createElement('span');
      pill.className = 'cat-pill';
      pill.textContent = cat + ': ' + fmtMoney(byCat[cat]);
      breakdown.appendChild(pill);
    });
  }

  document.getElementById('expenseForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const desc = document.getElementById('expDesc').value.trim();
    const cat = document.getElementById('expCategory').value;
    const amt = parseFloat(document.getElementById('expAmount').value);
    const date = document.getElementById('expDate').value || new Date().toISOString().slice(0, 10);
    if (!desc || isNaN(amt)) return;
    state.expenses.push({ id: uid(), description: desc, category: cat, amount: amt, date: date });
    saveState();
    document.getElementById('expDesc').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expDate').value = '';
    renderExpenses();
  });

  // ---------- Init ----------
  renderMuhurtham();
  renderCountdown();
  renderGuests();
  renderTasks();
  renderExpenses();

  // refresh countdown at midnight rollover
  setInterval(renderCountdown, 60 * 1000);
})();
