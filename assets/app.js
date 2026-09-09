/* Kitchen Plan tracker.
   Static frontend. Auth and storage are Supabase. Row level security in the
   database is what keeps accounts apart, not anything in this file. */

(function () {
  'use strict';

  window.__KITCHEN_APP_LOADED = true;

  var CFG  = window.KITCHEN_CONFIG || {};
  var DATA = window.PLAN_DATA || {};
  var sb   = null;

  var S = {
    user: null, profile: null,
    date: today(),
    entries: [], foods: [], weights: [],
    tab: 'today', authMode: 'in',
    pickSlot: 'breakfast', pickFilter: 'plan', pickQuery: ''
  };

  // ------------------------------------------------------------ helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function h(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() {
    var d = new Date();
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function shift(iso, days) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  }
  function human(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (iso === today()) return 'Today';
    if (iso === shift(today(), -1)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function longDate(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function n0(v) { return Math.round(v).toLocaleString(); }
  function n1(v) { return (Math.round(v * 10) / 10).toString(); }
  function clip(s, max) {
    s = String(s || '');
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:]$/, '') + '\u2026';
  }

  var SLOTS = [
    ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'],
    ['small', 'Something small'], ['bed', 'Before bed'],
    ['fixed', 'Every day'], ['other', 'Other']
  ];
  function slotName(k) {
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i][0] === k) return SLOTS[i][1];
    return 'Other';
  }

  // ------------------------------------------------------ catalogue
  function catalogue() {
    var out = [];
    (DATA.meals || []).forEach(function (m) { out.push(withKind(m, 'plan')); });
    (DATA.fixed || []).forEach(function (m) { out.push(withKind(m, 'plan')); });
    (DATA.sides || []).forEach(function (m) { out.push(withKind(m, 'side')); });
    S.foods.forEach(function (f) {
      out.push({ id: 'food:' + f.id, name: f.name, slot: 'other', kcal: +f.kcal,
                 protein: +f.protein, blurb: f.unit || 'serving', kind: 'mine' });
    });
    return out;
  }
  function withKind(m, kind) {
    return { id: m.id, name: m.name, slot: m.slot, kcal: m.kcal,
             protein: m.protein, blurb: m.blurb || '', kind: kind };
  }

  // ------------------------------------------------------------- boot
  function boot() {
    var key = String(CFG.supabaseKey || CFG.supabaseAnonKey || '').trim();
    var url = String(CFG.supabaseUrl || '').trim();
    if (!url || /YOUR_/.test(url) || !key || /YOUR_/.test(key)) {
      return renderSetupNeeded();
    }
    // Tolerate the usual paste mistakes: trailing slash, /rest/v1, a copied
    // dashboard address, or a missing scheme.
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    try { url = new URL(url).origin; } catch (e) { /* handled below */ }
    if (/supabase\.(com|green)\/dashboard/.test(CFG.supabaseUrl) ||
        !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
      return renderBadUrl(CFG.supabaseUrl);
    }
    CFG.supabaseUrl = url;
    if (!window.supabase || !window.supabase.createClient) {
      return renderBroken(['assets/supabase.js']);
    }
    if (!window.PLAN_DATA) { return renderBroken(['assets/data.js']); }
    try {
      sb = window.supabase.createClient(url, key);
    } catch (e) { return fatal(e); }
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) { S.user = r.data.session.user; loadAll(); }
      else renderAuth();
    }).catch(function (e) {
      fatal(new Error('Could not reach Supabase. Check the Project URL in ' +
        'assets/config.js is exactly right. (' + ((e && e.message) || e) + ')'));
    });
    sb.auth.onAuthStateChange(function (evt, session) {
      if (evt === 'SIGNED_OUT') { S.user = null; renderAuth(); }
    });
  }

  function renderBadUrl(given) {
    document.getElementById('root').innerHTML =
      '<div class="gate"><span class="mark">Check the project URL</span>' +
      '<p class="lede">The address in <code>assets/config.js</code> is not a ' +
      'Supabase project URL:</p>' +
      '<div class="msg err"><code>' + h(given) + '</code></div>' +
      '<p class="lede">It has to be exactly the project host and nothing else, like ' +
      '<code>https://abcdefghijkl.supabase.co</code>. No trailing slash, no ' +
      '<code>/rest/v1</code> on the end, and not the <code>supabase.com/dashboard/...</code> ' +
      'address from your browser bar. Find the right one in the dashboard under ' +
      'Project Settings, then Data API, or behind the green Connect button.</p></div>';
  }

  function renderBroken(missing) {
    document.getElementById('root').innerHTML =
      '<div class="gate"><span class="mark">Files are missing</span>' +
      '<p class="lede">The page loaded but these did not:</p>' +
      '<div class="msg err"><code>' + missing.join('</code><br><code>') + '</code></div>' +
      '<p class="lede">Almost always this means the <code>assets</code> folder did not ' +
      'upload, or its files landed next to <code>index.html</code> instead of inside ' +
      'an <code>assets</code> folder. Open your repository on GitHub and check the ' +
      'structure, then re-upload the missing files into <code>assets/</code>.</p></div>';
  }

  function renderSetupNeeded() {
    $('#root').innerHTML =
      '<div class="gate"><span class="mark">The Kitchen Plan</span>' +
      '<p class="lede">This copy is not connected to a database yet. Open ' +
      '<code>assets/config.js</code> and paste in the project URL and publishable key ' +
      'from your Supabase dashboard, under Project Settings then API Keys. The ' +
      'README walks through it.</p></div>';
  }

  // ------------------------------------------------------------- auth
  function renderAuth() {
    var isIn = S.authMode === 'in';
    $('#root').innerHTML =
      '<div class="gate">' +
        '<span class="mark">The Kitchen Plan</span>' +
        '<p class="lede">' + (isIn
          ? 'Sign in to pick up your ledger.'
          : 'Create an account. Your log is yours alone, the database will not serve it to anyone else.') +
        '</p>' +
        '<div class="card">' +
          '<label class="f">Email<input type="email" id="em" autocomplete="email" ' +
            'inputmode="email" autocapitalize="none"></label>' +
          '<label class="f">Password<input type="password" id="pw" autocomplete="' +
            (isIn ? 'current-password' : 'new-password') + '"></label>' +
          '<div class="btnrow"><button class="btn wide" id="go">' +
            (isIn ? 'Sign in' : 'Create account') + '</button></div>' +
          '<div id="amsg"></div>' +
        '</div>' +
        '<p class="switch">' + (isIn ? 'No account yet? ' : 'Already have one? ') +
          '<button id="swap">' + (isIn ? 'Create one' : 'Sign in') + '</button></p>' +
      '</div>';

    $('#swap').onclick = function () { S.authMode = isIn ? 'up' : 'in'; renderAuth(); };
    $('#go').onclick = doAuth;
    $('#pw').onkeydown = function (e) { if (e.key === 'Enter') doAuth(); };
  }

  function doAuth() {
    var email = $('#em').value.trim(), pw = $('#pw').value;
    var msg = $('#amsg'), btn = $('#go');
    if (!email || !pw) { msg.innerHTML = '<div class="msg err">Enter an email and a password.</div>'; return; }
    if (S.authMode === 'up' && pw.length < 8) {
      msg.innerHTML = '<div class="msg err">Use at least 8 characters.</div>'; return;
    }
    btn.disabled = true; btn.textContent = 'Working';
    var call = S.authMode === 'in'
      ? sb.auth.signInWithPassword({ email: email, password: pw })
      : sb.auth.signUp({ email: email, password: pw });

    call.then(function (r) {
      btn.disabled = false;
      btn.textContent = S.authMode === 'in' ? 'Sign in' : 'Create account';
      if (r.error) { msg.innerHTML = '<div class="msg err">' + h(r.error.message) + '</div>'; return; }
      if (r.data.session) { S.user = r.data.session.user; loadAll(); }
      else {
        msg.innerHTML = '<div class="msg ok">Account made. Check your email for the ' +
          'confirmation link, then come back and sign in.</div>';
      }
    });
  }

  // ------------------------------------------------------------- data
  function loadAll() {
    $('#root').innerHTML = '<div class="gate"><p class="lede">Loading your ledger.</p></div>';
    Promise.all([
      sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle(),
      sb.from('foods').select('*').order('name'),
      sb.from('entries').select('*').order('created_at'),
      sb.from('weights').select('*').order('log_date')
    ]).then(function (r) {
      if (r[0].error && r[0].error.code !== 'PGRST116') return fatal(r[0].error);
      S.profile = r[0].data || { kcal_target: 1471, protein_target: 153, loud_day: 2200 };
      if (!r[0].data) {
        sb.from('profiles').insert({ id: S.user.id, kcal_target: 1471, protein_target: 153 })
          .then(function () {});
      }
      S.foods   = r[1].data || [];
      S.entries = r[2].data || [];
      S.weights = r[3].data || [];
      renderApp();
    }).catch(fatal);
  }

  function fatal(err) {
    $('#root').innerHTML = '<div class="gate"><span class="mark">Something broke</span>' +
      '<div class="msg err">' + h((err && err.message) || String(err)) + '</div>' +
      '<p class="lede">If this mentions a missing table, the schema has not been run yet. ' +
      'Paste <code>schema.sql</code> into the Supabase SQL editor and reload.</p></div>';
  }

  // ------------------------------------------------------------ shell
  function renderApp() {
    var tabs = [['today', 'Today'], ['ledger', 'Ledger'], ['recipes', 'Recipes'],
                ['foods', 'My foods'], ['settings', 'Settings']];
    $('#root').innerHTML =
      '<header class="topbar">' +
        '<div class="topbar-in"><span class="mark">The Kitchen Plan</span>' +
          '<span class="who">' + h(S.user.email) + '</span></div>' +
        '<nav class="tabs" role="tablist">' + tabs.map(function (t) {
          return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' +
                 (S.tab === t[0]) + '">' + t[1] + '</button>';
        }).join('') + '</nav>' +
      '</header><main class="wrap" id="view"></main>';

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.onclick = function () { S.tab = b.dataset.tab; renderApp(); };
    });
    ({ today: viewToday, ledger: viewLedger, recipes: viewRecipes,
       foods: viewFoods, settings: viewSettings })[S.tab]();
  }

  function dayEntries(iso) {
    return S.entries.filter(function (e) { return e.log_date === iso; });
  }
  function dayTotals(iso) {
    return dayEntries(iso).reduce(function (a, e) {
      a.k += (+e.kcal) * (+e.servings);
      a.p += (+e.protein) * (+e.servings);
      return a;
    }, { k: 0, p: 0 });
  }

  // ------------------------------------------------------------ today
  function viewToday() {
    var t = dayTotals(S.date);
    var kt = +S.profile.kcal_target, pt = +S.profile.protein_target;
    var pct = Math.min(100, kt ? (t.k / kt) * 100 : 0);
    var over = t.k > kt;
    var left = kt - t.k;
    var es = dayEntries(S.date);
    var isFuture = S.date > today();

    var groups = SLOTS.map(function (s) {
      var rows = es.filter(function (e) { return e.slot === s[0]; });
      if (!rows.length) return '';
      return '<div class="slot"><h4>' + s[1] + '</h4>' + rows.map(entryRow).join('') + '</div>';
    }).join('');

    var hasFixed = es.some(function (e) { return e.slot === 'fixed'; });

    $('#view').innerHTML =
      '<div class="datestrip">' +
        '<button class="arrow" id="prev" aria-label="Previous day">&#8249;</button>' +
        '<div class="d" style="text-align:center">' + h(human(S.date)) +
          '<small>' + h(longDate(S.date)) + '</small></div>' +
        '<button class="arrow" id="next" aria-label="Next day"' + (isFuture ? ' disabled' : '') +
          '>&#8250;</button>' +
      '</div>' +

      '<div class="card total">' +
        '<div class="n">' + n0(t.k) + '<span>kcal</span></div>' +
        '<div class="bar' + (over ? ' over' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="of">' + (over
          ? n0(Math.abs(left)) + ' over the ' + n0(kt) + ' target'
          : n0(left) + ' left of ' + n0(kt)) + '</div>' +
        '<div class="macro">' +
          '<div><div class="k">Protein</div><div class="v">' + n1(t.p) + ' g<span style="font-size:12px;color:var(--faint)"> of ' + pt + '</span></div></div>' +
          '<div><div class="k">Items logged</div><div class="v">' + es.length + '</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="btnrow">' +
        '<button class="btn" id="add">Add food</button>' +
        (hasFixed ? '' : '<button class="btn quiet" id="fixed">Add psyllium and miso</button>') +
        (S.date !== today() ? '<button class="btn ghost" id="jump">Back to today</button>' : '') +
      '</div>' +

      (es.length ? groups : '<p class="empty">Nothing logged for this day yet.</p>');

    $('#prev').onclick = function () { S.date = shift(S.date, -1); viewToday(); };
    $('#next').onclick = function () { if (!isFuture) { S.date = shift(S.date, 1); viewToday(); } };
    if ($('#jump')) $('#jump').onclick = function () { S.date = today(); viewToday(); };
    $('#add').onclick = openPicker;
    if ($('#fixed')) $('#fixed').onclick = function () {
      var items = (DATA.fixed || []).map(function (f) {
        return { name: f.name, slot: 'fixed', kcal: f.kcal, protein: f.protein, source: 'plan' };
      });
      addEntries(items);
    };
    wireEntryRows();
  }

  function entryRow(e) {
    var k = (+e.kcal) * (+e.servings), p = (+e.protein) * (+e.servings);
    return '<div class="row" data-id="' + e.id + '">' +
      '<div class="nm">' + h(e.name) +
        (+e.servings !== 1 ? '<em>' + n1(e.servings) + ' servings</em>' : '') + '</div>' +
      '<div class="qty">' +
        '<button data-act="less" aria-label="Less">&minus;</button>' +
        '<span>&times;' + n1(e.servings) + '</span>' +
        '<button data-act="more" aria-label="More">+</button></div>' +
      '<div class="fig"><b>' + n0(k) + '</b><i>' + n1(p) + ' g</i></div>' +
      '<button class="del" data-act="del" aria-label="Remove ' + h(e.name) + '">&times;</button>' +
    '</div>';
  }

  function wireEntryRows() {
    Array.prototype.forEach.call(document.querySelectorAll('.row [data-act]'), function (b) {
      b.onclick = function () {
        var id = b.closest('.row').dataset.id;
        var e = S.entries.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!e) return;
        if (b.dataset.act === 'del') return removeEntry(e);
        var step = (+e.servings) >= 1 ? 0.5 : 0.25;
        var v = (+e.servings) + (b.dataset.act === 'more' ? step : -step);
        v = Math.round(v * 100) / 100;
        if (v <= 0) return removeEntry(e);
        e.servings = v;
        viewToday();
        sb.from('entries').update({ servings: v }).eq('id', e.id).then(function () {});
      };
    });
  }

  function removeEntry(e) {
    S.entries = S.entries.filter(function (x) { return x.id !== e.id; });
    viewToday();
    sb.from('entries').delete().eq('id', e.id).then(function () {});
  }

  function addEntries(items) {
    var rows = items.map(function (it) {
      return { user_id: S.user.id, log_date: S.date, slot: it.slot, name: it.name,
               kcal: it.kcal, protein: it.protein, servings: it.servings || 1,
               source: it.source || 'custom' };
    });
    sb.from('entries').insert(rows).select().then(function (r) {
      if (r.error) return alert(r.error.message);
      S.entries = S.entries.concat(r.data);
      viewToday();
    });
  }

  // ----------------------------------------------------------- picker
  function openPicker() {
    S.pickQuery = '';
    var bg = document.createElement('div'); bg.className = 'sheet-bg';
    var sh = document.createElement('div'); sh.className = 'sheet';
    document.body.appendChild(bg); document.body.appendChild(sh);
    bg.onclick = close;
    function close() { bg.remove(); sh.remove(); }

    function draw() {
      var filters = [['plan', 'From the plan'], ['side', 'Sides'],
                     ['mine', 'My foods'], ['manual', 'Type it in']];
      sh.innerHTML =
        '<div class="sheet-hd"><div class="t"><h3>Add food</h3>' +
          '<button class="del" id="x" aria-label="Close">&times;</button></div>' +
          '<div class="chiprow">' + filters.map(function (f) {
            return '<button class="chip" data-f="' + f[0] + '" aria-pressed="' +
                   (S.pickFilter === f[0]) + '">' + f[1] + '</button>';
          }).join('') + '</div>' +
          (S.pickFilter === 'manual' ? '' :
            '<label class="f" style="margin-top:10px"><input type="text" id="q" ' +
            'placeholder="Search" value="' + h(S.pickQuery) + '" autocomplete="off"></label>') +
        '</div><div class="sheet-bd" id="sb"></div>';

      $('#x', sh).onclick = close;
      Array.prototype.forEach.call(sh.querySelectorAll('.chip'), function (c) {
        c.onclick = function () { S.pickFilter = c.dataset.f; S.pickQuery = ''; draw(); };
      });

      if (S.pickFilter === 'manual') return drawManual();

      var q = S.pickQuery.toLowerCase();
      var list = catalogue().filter(function (c) {
        if (S.pickFilter === 'plan' && c.kind !== 'plan') return false;
        if (S.pickFilter === 'side' && c.kind !== 'side') return false;
        if (S.pickFilter === 'mine' && c.kind !== 'mine') return false;
        return !q || c.name.toLowerCase().indexOf(q) >= 0;
      });

      if (!list.length) {
        $('#sb', sh).innerHTML = '<p class="empty">' + (S.pickFilter === 'mine'
          ? 'No saved foods yet. Add them under My foods and they show up here.'
          : 'Nothing matches that search.') + '</p>';
      } else {
        var byslot = {}; var order = [];
        list.forEach(function (c) {
          var key = c.kind === 'plan' ? slotName(c.slot) : (c.kind === 'side' ? 'Sides' : 'My foods');
          if (!byslot[key]) { byslot[key] = []; order.push(key); }
          byslot[key].push(c);
        });
        $('#sb', sh).innerHTML = order.map(function (key) {
          return '<div class="slot"><h4>' + h(key) + '</h4>' + byslot[key].map(function (c) {
            return '<button class="pickrow" data-id="' + h(c.id) + '">' +
              '<span class="nm">' + h(c.name) +
                (c.blurb ? '<em>' + h(clip(c.blurb, 74)) + '</em>' : '') + '</span>' +
              '<span class="fig">' + n0(c.kcal) + ' kcal &middot; ' + n1(c.protein) + ' g</span>' +
            '</button>';
          }).join('') + '</div>';
        }).join('');

        Array.prototype.forEach.call(sh.querySelectorAll('.pickrow'), function (b) {
          b.onclick = function () {
            var c = catalogue().filter(function (x) { return x.id === b.dataset.id; })[0];
            if (!c) return;
            var slot = c.kind === 'plan' ? c.slot : (c.slot || 'other');
            addEntries([{ name: c.name, slot: slot, kcal: c.kcal, protein: c.protein,
                          source: c.kind === 'mine' ? 'food' : 'plan' }]);
            close();
          };
        });
      }

      var qi = $('#q', sh);
      if (qi) qi.oninput = function () {
        S.pickQuery = qi.value;
        var pos = qi.selectionStart; draw();
        var nq = $('#q', sh); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
      };
    }

    function drawManual() {
      $('#sb', sh).innerHTML =
        '<label class="f">What was it?<input type="text" id="mn" placeholder="Flat white, oat"></label>' +
        '<div class="grid2">' +
          '<label class="f">Calories<input type="number" id="mk" inputmode="numeric" min="0"></label>' +
          '<label class="f">Protein, g<input type="number" id="mp" inputmode="decimal" min="0" step="0.1" value="0"></label>' +
        '</div>' +
        '<label class="f">Which slot?<select id="ms">' + SLOTS.map(function (s) {
          return '<option value="' + s[0] + '"' + (s[0] === 'other' ? ' selected' : '') +
                 '>' + s[1] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="f" style="display:flex;align-items:center;gap:8px;margin-top:14px">' +
          '<input type="checkbox" id="msave" style="width:auto;margin:0"> ' +
          'Also save it to My foods for next time</label>' +
        '<div class="btnrow"><button class="btn wide" id="mgo">Add to ' +
          h(human(S.date)).toLowerCase() + '</button></div>';

      $('#mgo', sh).onclick = function () {
        var name = $('#mn', sh).value.trim();
        var k = parseFloat($('#mk', sh).value);
        var p = parseFloat($('#mp', sh).value) || 0;
        if (!name || isNaN(k)) { alert('Needs a name and a calorie figure.'); return; }
        if ($('#msave', sh).checked) {
          sb.from('foods').insert({ user_id: S.user.id, name: name, kcal: k, protein: p })
            .select().then(function (r) { if (r.data) S.foods = S.foods.concat(r.data); });
        }
        addEntries([{ name: name, slot: $('#ms', sh).value, kcal: k, protein: p, source: 'custom' }]);
        close();
      };
    }

    draw();
  }

  // ----------------------------------------------------------- ledger
  function viewLedger() {
    var days = {};
    S.entries.forEach(function (e) {
      if (!days[e.log_date]) days[e.log_date] = { k: 0, p: 0 };
      days[e.log_date].k += (+e.kcal) * (+e.servings);
      days[e.log_date].p += (+e.protein) * (+e.servings);
    });
    var wmap = {};
    S.weights.forEach(function (w) { wmap[w.log_date] = +w.kg; });

    var list = Object.keys(days).sort().reverse();
    var kt = +S.profile.kcal_target;

    // rolling seven day average over the last seven logged days
    var recent = list.slice(0, 7);
    var avg = recent.length
      ? recent.reduce(function (a, d) { return a + days[d].k; }, 0) / recent.length : 0;
    var pavg = recent.length
      ? recent.reduce(function (a, d) { return a + days[d].p; }, 0) / recent.length : 0;

    if (!list.length) {
      $('#view').innerHTML = '<p class="empty">No days logged yet. ' +
        'Add something under Today and it turns up here.</p>';
      return;
    }

    $('#view').innerHTML =
      '<div class="card total">' +
        '<div class="n">' + n0(avg) + '<span>kcal</span></div>' +
        '<div class="of">Average across your last ' + recent.length +
          ' logged day' + (recent.length === 1 ? '' : 's') +
          '. This is the number that matters, not any single day.</div>' +
        '<div class="macro">' +
          '<div><div class="k">Protein, average</div><div class="v">' + n1(pavg) + ' g</div></div>' +
          '<div><div class="k">Against target</div><div class="v">' +
            (avg > kt ? '+' : '') + n0(avg - kt) + '</div></div>' +
          '<div><div class="k">Days logged</div><div class="v">' + list.length + '</div></div>' +
        '</div>' +
      '</div>' +
      chart(days, kt) +
      '<h3 class="sect">Every day</h3>' +
      '<table class="ltable"><tr><th>Day</th><th>kcal</th><th>vs target</th>' +
        '<th>protein</th><th>weight</th></tr>' +
      list.map(function (d) {
        var diff = days[d].k - kt;
        return '<tr><td>' + h(human(d)) + '</td>' +
          '<td>' + n0(days[d].k) + '</td>' +
          '<td class="d ' + (diff > 0 ? 'over' : 'under') + '">' +
            (diff > 0 ? '+' : '') + n0(diff) + '</td>' +
          '<td>' + n1(days[d].p) + ' g</td>' +
          '<td>' + (wmap[d] ? n1(wmap[d]) + ' kg' : '&mdash;') + '</td></tr>';
      }).join('') + '</table>';
  }

  function chart(days, kt) {
    var logged = Object.keys(days).sort();
    var d = today();
    var span = 30;
    if (logged.length) {
      var first = logged[0], n = 1, probe = first;
      while (probe < d && n < 30) { probe = shift(probe, 1); n++; }
      span = Math.max(7, Math.min(30, n));
    }
    var keys = [];
    for (var i = span - 1; i >= 0; i--) keys.push(shift(d, -i));
    var vals = keys.map(function (k) { return days[k] ? days[k].k : 0; });
    var max = Math.max(kt * 1.35, Math.max.apply(null, vals) * 1.1, 100);
    var W = 700, H = 120, bw = W / keys.length;
    var bars = vals.map(function (v, i) {
      if (!v) return '';
      var hgt = (v / max) * H;
      return '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (H - hgt).toFixed(1) +
        '" width="' + (bw - 2).toFixed(1) + '" height="' + hgt.toFixed(1) +
        '" rx="1.5" fill="' + (v > kt ? '#8C3B2E' : '#2F5D46') + '" opacity="' +
        (v > kt ? '.85' : '.8') + '"></rect>';
    }).join('');
    var ty = H - (kt / max) * H;
    return '<h3 class="sect">Last ' + keys.length + ' days</h3>' +
      '<p class="lede">Bars are days you logged. The line is your ' + n0(kt) + ' target.</p>' +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="Daily calories over the last " + keys.length + " days">' + bars +
      '<line x1="0" y1="' + ty.toFixed(1) + '" x2="' + W + '" y2="' + ty.toFixed(1) +
      '" stroke="#221F1B" stroke-width="1" stroke-dasharray="4 3" opacity=".45"></line></svg>';
  }

  // ---------------------------------------------------------- recipes
  function viewRecipes() {
    var groups = [
      ['Breakfast', (DATA.meals || []).filter(function (m) { return m.slot === 'breakfast'; })],
      ['Lunch',     (DATA.meals || []).filter(function (m) { return m.slot === 'lunch'; })],
      ['Dinner',    (DATA.meals || []).filter(function (m) { return m.slot === 'dinner'; })],
      ['Something small', (DATA.meals || []).filter(function (m) { return m.slot === 'small'; })],
      ['Before bed', (DATA.meals || []).filter(function (m) { return m.slot === 'bed'; })]
    ];
    var html = '<p class="lede" style="margin-top:16px">Every figure here is the same one ' +
      'printed in the plan, generated from the ingredient ledger rather than typed in.</p>';

    groups.forEach(function (g) {
      if (!g[1].length) return;
      html += '<h3 class="sect">' + g[0] + '</h3>' +
        g[1].sort(function (a, b) { return a.kcal - b.kcal; }).map(recipeCard).join('');
    });

    html += '<h3 class="sect">Marinades</h3>' +
      '<p class="lede">One serving covers 170 g raw thigh, or both salmon fillets.</p>' +
      (DATA.marinades || []).map(function (m) {
        return '<div class="rcard"><button class="rhead" data-mar="' + h(m.name) + '">' +
          '<span class="nm"><b>' + h(m.name) + '</b><em>' + h(m.blurb) + '</em></span>' +
          '<span class="fig">' + m.kcal + ' kcal<i>' + n1(m.protein) + ' g</i></span></button>' +
          '<div class="rbody hidden">' +
            '<ul class="ing">' + m.rows.map(function (r) {
              return '<li>' + h(r.label) + '<span>' + h(r.serving) + ' &middot; ' +
                     h(r.double) + ' double</span></li>';
            }).join('') + '</ul>' +
            '<ol class="steps">' + m.steps.map(function (s) {
              return '<li>' + h(s) + '</li>';
            }).join('') + '</ol></div></div>';
      }).join('');

    html += '<h3 class="sect">Dressings and sauces</h3>' +
      (DATA.dressings || []).map(function (d) {
        return '<div class="rcard"><div class="rhead">' +
          '<span class="nm"><b>' + h(d.name) + '</b><em>' + h(d.blurb) + '</em></span>' +
          '<span class="fig">' + d.kcal + ' kcal<i>' + n1(d.protein) + ' g</i></span></div></div>';
      }).join('');

    $('#view').innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('.rhead'), function (b) {
      if (b.tagName !== 'BUTTON') return;
      b.onclick = function (ev) {
        if (ev.target.closest('[data-log]')) return;
        var body = b.parentNode.querySelector('.rbody');
        if (body) body.classList.toggle('hidden');
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-log]'), function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var m = (DATA.meals || []).filter(function (x) { return x.id === b.dataset.log; })[0];
        if (!m) return;
        addEntries([{ name: m.name, slot: m.slot, kcal: m.kcal, protein: m.protein, source: 'plan' }]);
        S.tab = 'today'; renderApp();
      };
    });
  }

  function recipeCard(m) {
    return '<div class="rcard">' +
      '<button class="rhead" aria-expanded="false">' +
        '<span class="nm"><b>' + h(m.name) + '</b><em>' + h(m.blurb) + '</em></span>' +
        '<span class="fig">' + m.kcal + ' kcal<i>' + n1(m.protein) + ' g protein</i></span>' +
      '</button>' +
      '<div class="rbody hidden">' +
        (m.note ? '<p class="note">' + h(m.note) + '</p>' : '') +
        (m.salad ? '<p class="salad"><b>Salad.</b> ' + h(m.salad) + '</p>' : '') +
        '<ul class="ing">' + (m.rows || []).map(function (r) {
          return '<li>' + h(r.label) + '<span>' + h(r.amount) + '</span></li>';
        }).join('') + '</ul>' +
        '<ol class="steps">' + (m.steps || []).map(function (s) {
          return '<li>' + h(s) + '</li>';
        }).join('') + '</ol>' +
        '<div class="btnrow"><button class="btn quiet" data-log="' + h(m.id) +
          '">Log this to today</button></div>' +
      '</div></div>';
  }

  // ------------------------------------------------------------ foods
  function viewFoods() {
    $('#view').innerHTML =
      '<h3 class="sect">Add a food</h3>' +
      '<p class="lede">Anything you eat often that is not in the plan. Saved foods show ' +
      'up in the Add food list.</p>' +
      '<div class="card">' +
        '<label class="f">Name<input type="text" id="fn" placeholder="Protein bar, chocolate"></label>' +
        '<div class="grid2">' +
          '<label class="f">Calories per serving<input type="number" id="fk" inputmode="numeric" min="0"></label>' +
          '<label class="f">Protein, g<input type="number" id="fp" inputmode="decimal" min="0" step="0.1" value="0"></label>' +
        '</div>' +
        '<label class="f">What is one serving? <input type="text" id="fu" placeholder="1 bar, 60 g"></label>' +
        '<div class="btnrow"><button class="btn" id="fadd">Save food</button></div>' +
        '<div id="fmsg"></div>' +
      '</div>' +
      '<h3 class="sect">Saved foods</h3>' +
      (S.foods.length
        ? S.foods.map(function (f) {
            return '<div class="row" data-food="' + f.id + '">' +
              '<div class="nm">' + h(f.name) +
                (f.unit ? '<em>' + h(f.unit) + '</em>' : '') + '</div>' +
              '<div class="fig"><b>' + n0(f.kcal) + '</b><i>' + n1(f.protein) + ' g</i></div>' +
              '<button class="del" aria-label="Delete ' + h(f.name) + '">&times;</button></div>';
          }).join('')
        : '<p class="empty">Nothing saved yet.</p>');

    $('#fadd').onclick = function () {
      var name = $('#fn').value.trim(), k = parseFloat($('#fk').value);
      var p = parseFloat($('#fp').value) || 0, u = $('#fu').value.trim() || 'serving';
      if (!name || isNaN(k)) {
        $('#fmsg').innerHTML = '<div class="msg err">Needs a name and a calorie figure.</div>';
        return;
      }
      sb.from('foods').insert({ user_id: S.user.id, name: name, kcal: k, protein: p, unit: u })
        .select().then(function (r) {
          if (r.error) { $('#fmsg').innerHTML = '<div class="msg err">' + h(r.error.message) + '</div>'; return; }
          S.foods = S.foods.concat(r.data).sort(function (a, b) { return a.name.localeCompare(b.name); });
          viewFoods();
        });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-food] .del'), function (b) {
      b.onclick = function () {
        var id = b.closest('[data-food]').dataset.food;
        S.foods = S.foods.filter(function (f) { return String(f.id) !== String(id); });
        viewFoods();
        sb.from('foods').delete().eq('id', id).then(function () {});
      };
    });
  }

  // --------------------------------------------------------- settings
  function viewSettings() {
    var last = S.weights.length ? S.weights[S.weights.length - 1] : null;
    $('#view').innerHTML =
      '<h3 class="sect">Daily targets</h3>' +
      '<div class="card">' +
        '<div class="grid2">' +
          '<label class="f">Calories<input type="number" id="tk" value="' +
            h(S.profile.kcal_target) + '" inputmode="numeric"></label>' +
          '<label class="f">Protein, g<input type="number" id="tp" value="' +
            h(S.profile.protein_target) + '" inputmode="numeric"></label>' +
        '</div>' +
        '<p class="lede" style="margin-top:10px">The plan works out at ' +
          n0((DATA.plan || {}).kcalTarget || 1471) + ' kcal and ' +
          ((DATA.plan || {}).proteinTarget || 153) + ' g protein on an average day.</p>' +
        '<div class="btnrow"><button class="btn" id="tsave">Save targets</button></div>' +
        '<div id="tmsg"></div>' +
      '</div>' +

      '<h3 class="sect">Weight</h3>' +
      '<p class="lede">Same day, same time, after the bathroom, before food.' +
        (last ? ' Last entry ' + n1(last.kg) + ' kg on ' + h(human(last.log_date)) + '.' : '') + '</p>' +
      '<div class="card">' +
        '<div class="grid2">' +
          '<label class="f">Date<input type="date" id="wd" value="' + today() + '"></label>' +
          '<label class="f">Weight, kg<input type="number" id="wk" step="0.1" inputmode="decimal"></label>' +
        '</div>' +
        '<div class="btnrow"><button class="btn" id="wsave">Save weight</button></div>' +
        '<div id="wmsg"></div>' +
      '</div>' +

      '<h3 class="sect">Your data</h3>' +
      '<p class="lede">The free database has no automatic backups, so download a copy ' +
        'now and then. The file is plain JSON.</p>' +
      '<div class="btnrow">' +
        '<button class="btn ghost" id="exp">Download my data</button>' +
        '<button class="btn danger" id="out">Sign out</button>' +
      '</div>' +
      '<p class="foot">Signed in as ' + h(S.user.email) + '. Recipe figures come from the ' +
        'audited ingredient ledger behind the printed plan.</p>';

    $('#tsave').onclick = function () {
      var k = parseInt($('#tk').value, 10), p = parseInt($('#tp').value, 10);
      if (!k || !p) { $('#tmsg').innerHTML = '<div class="msg err">Both need a number.</div>'; return; }
      S.profile.kcal_target = k; S.profile.protein_target = p;
      sb.from('profiles').upsert({ id: S.user.id, kcal_target: k, protein_target: p })
        .then(function (r) {
          $('#tmsg').innerHTML = r.error
            ? '<div class="msg err">' + h(r.error.message) + '</div>'
            : '<div class="msg ok">Targets saved.</div>';
        });
    };

    $('#wsave').onclick = function () {
      var d = $('#wd').value, kg = parseFloat($('#wk').value);
      if (!d || !kg) { $('#wmsg').innerHTML = '<div class="msg err">Enter a date and a weight.</div>'; return; }
      sb.from('weights').upsert({ user_id: S.user.id, log_date: d, kg: kg })
        .then(function (r) {
          if (r.error) { $('#wmsg').innerHTML = '<div class="msg err">' + h(r.error.message) + '</div>'; return; }
          S.weights = S.weights.filter(function (w) { return w.log_date !== d; })
            .concat([{ log_date: d, kg: kg }])
            .sort(function (a, b) { return a.log_date.localeCompare(b.log_date); });
          $('#wmsg').innerHTML = '<div class="msg ok">Weight saved.</div>';
        });
    };

    $('#exp').onclick = function () {
      var blob = new Blob([JSON.stringify({
        exported: new Date().toISOString(), email: S.user.email,
        profile: S.profile, entries: S.entries, foods: S.foods, weights: S.weights
      }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kitchen-plan-' + today() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    $('#out').onclick = function () { sb.auth.signOut(); };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
