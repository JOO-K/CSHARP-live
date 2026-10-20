/* ══ ACCOUNTS (csharpuserlive, 2026-10-19) ═══════════════════════════════════
   Eric: "make it so u kinda have to go through this process of onboarding at
   least once, and then u dont have to do it again … make account with gmail or
   email … if they lose their info i can always send them something to recover
   access". And: the reviews must survive clearing cookies and history.

   Then (same day): "instead of email rn … a simple login userid and password
   system min 5 chars for both, super simple, my friends are testing".
   So: a real account (Supabase Auth, username + password — see THE AUTH
   SCREEN for how a username becomes an account without an email), and the
   database is the SOURCE OF TRUTH. localStorage stays what the 14k lines of
   app.js already read and write; this file mirrors it to the account and
   back. Nothing in app.js had to learn about the network.

   · BOOT (sdAccountBootScreen, read by init() in app.js before the first
     render): no account → the auth screen; signed in but not onboarded →
     onboarding; onboarded → home. Decided SYNCHRONOUSLY from the cached
     account + the saved session, then checked against the server.
   · SIGN-IN (sdAfterSignIn): fetch or create the profile row, pull the
     reviews / settings / taste down (merging anything already on this phone
     up), cache the account. Onboarded → reload into the app with the data;
     new → obStart().
   · SYNC: Storage.prototype.setItem is wrapped, so a write to one of the
     synced keys schedules an upload. Reviews go one row per review; the base
     of what the server last confirmed is kept (`spindeck-sync-base`), so an
     upload that failed is simply a difference that is still there — retried
     on `online`, on a timer and on the next load. Never silently dropped.
   · ONBOARDING (obFinish wrapped): writes the username + the answers +
     onboarded = true. Only a confirmed write lets the user through, so
     "onboarded" on the server and on screen can't disagree.

   Tables + policies: tools/supabase-accounts.sql. The keys below are the
   project's PUBLIC ones (the same as recorder.js) — row level security is
   what keeps one tester out of another's rows.
   ⚠ storageKey 'spindeck-auth', not Supabase's default: sessions.html signs in
   to the SAME project as the viewer account, and with the default key the app
   would think that viewer was a tester (and vice versa). */
(function () {
  const SB_URL = 'https://msxbtpnpioqtypkfyzhm.supabase.co';
  const SB_KEY = 'sb_publishable_jPR6r7DVZTNMv_KPesf8uw_urETvpwt';
  const AUTH_KEY = 'spindeck-auth';          // the Supabase session
  const ACC_KEY = 'spindeck-account';        // cached {id, email, username, onboarded, profile}
  const BASE_KEY = 'spindeck-sync-base';     // reviews as the server last confirmed them: {key: json}
  const DIRTY_KEY = 'spindeck-sync-dirty';   // profile columns waiting to upload
  const LOGS_KEY = 'spindeck-logs';
  const COLS = { 'spindeck-settings': 'settings', 'spindeck-taste': 'taste' };
  // What a sign-out wipes from this browser (the account keeps all of it).
  const PRIVATE_KEYS = [LOGS_KEY, 'spindeck-logs-wip', 'spindeck-settings', 'spindeck-taste',
                        ACC_KEY, BASE_KEY, DIRTY_KEY];
  // The Edit profile fields that are the user's (pfeditSave's whitelist, less the generated stats).
  const PROFILE_FIELDS = ['name', 'handle', 'bio', 'location', 'tags', 'skin', 'pic', 'favs',
                          'socials', 'favSongs', 'playlistNames', 'playlistCovers', 'pins'];

  const ls = window.localStorage;
  const _set = Storage.prototype.setItem;
  const _remove = Storage.prototype.removeItem;
  let MUTE = false;                          // our own writes must not schedule uploads
  const rawSet = (k, v) => { MUTE = true; try { _set.call(ls, k, v); } catch (e) {} MUTE = false; };
  const rawDel = k => { MUTE = true; try { _remove.call(ls, k); } catch (e) {} MUTE = false; };
  const readJSON = (k, d) => { try { const v = JSON.parse(ls.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };

  let sb = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true,
                detectSessionInUrl: true,
                // implicit: the tokens come back in the #hash, so Spotify's
                // ?code= return (CONNECTED SERVICES, app.js) can't be mistaken for ours.
                flowType: 'implicit' },
      });
    }
  } catch (e) { sb = null; }
  window.SD_SB = sb;

  const acc = () => readJSON(ACC_KEY, null);
  const saveAcc = a => rawSet(ACC_KEY, JSON.stringify(a));
  let UID = (acc() || {}).id || null;

  /* ── BOOT ─────────────────────────────────────────────────────────────────
     Synchronous — init() asks before anything paints. If the library didn't
     load (offline, CDN down) the app falls back to the old local-only
     behaviour rather than locking everyone out. */
  window.sdAccountBootScreen = function () {
    if (!sb) return 'onboarding';
    const a = acc();
    if (a && ls.getItem(AUTH_KEY)) return a.onboarded ? 'home' : 'onboarding';
    return 'auth';
  };
  window.sdSignedIn = () => !!(sb && UID);

  // The signed-in profile shows on the profile page before the first render.
  function applyProfile(a) {
    if (!a || !window.PROFILE) return;
    const p = a.profile || {};
    PROFILE_FIELDS.forEach(f => { if (p[f] !== undefined) window.PROFILE[f] = p[f]; });
    if (a.username && !p.handle) window.PROFILE.handle = a.username;
    if (a.username && !p.name) window.PROFILE.name = a.username;
  }
  applyProfile(acc());
  /* ⚠ Every load re-applies the persona (initPersonas → applyPersona), and
     that deals the persona's / a random profile over PROFILE — so a signed-in
     tester came back as @ericd. Re-apply the account's fields after both
     dealers. randomizeProfile WITH a name is a friend's page (guest), so
     only the no-argument call (your own profile) is followed. Both are
     global function declarations, so reassigning them is what app.js's own
     calls reach. */
  ['personaProfile', 'randomizeProfile'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (arg) {
      const r = orig.apply(this, arguments);
      if (UID && !(fn === 'randomizeProfile' && arg)) applyProfile(acc());
      return r;
    };
  });

  /* ── THE AUTH SCREEN: username + password ────────────────────────────────
     Supabase Auth needs an email, so a LOGIN ID is turned into a stand-in
     address no mail ever goes to (`USER_DOMAIN`) — the same trick as the
     viewer's me@sd.app. Needs "Confirm email" OFF in the dashboard.
     ⚠ PEPPER: Supabase's shortest allowed password is 6, Eric wants 5, so
     what is sent is the typed password + PEPPER. Deterministic, so log in
     works; to reset a friend's password by SQL, hash `newpass` + PEPPER
     The login ID is NOT the @username — that one is picked in onboarding;
     (tools/supabase-accounts.sql has the snippet). Don't change PEPPER —
     every existing password stops working. */
  const USER_DOMAIN = 'users.spindeck.app';
  const PEPPER = '~sd';
  const A = window.AUTHUI = window.AUTHUI || { user: '', msg: '', err: false, busy: false };
  let PASS = '';   // in memory only; never rendered back into the markup

  function sdAuthSync() {
    document.querySelectorAll('.s-auth').forEach(r => {
      const u = r.querySelector('.auth-user');
      if (u && document.activeElement !== u && u.value !== A.user) u.value = A.user;
      const m = r.querySelector('.auth-msg');
      if (m) { m.textContent = A.msg; m.classList.toggle('err', !!A.err); }
      r.querySelectorAll('.auth-body button').forEach(b => { b.disabled = !!A.busy; });
    });
  }
  window.sdAuthSync = sdAuthSync;
  const say = (msg, err) => { A.msg = msg || ''; A.err = !!err; sdAuthSync(); };

  // The viewer draws Dark and Light side by side: keep both copies in step.
  window.sdAuthUserInput = function (el) {
    el.value = el.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    A.user = el.value;
    document.querySelectorAll('.s-auth .auth-user').forEach(i => { if (i !== el) i.value = el.value; });
  };
  window.sdAuthPassInput = function (el) {
    PASS = el.value;
    document.querySelectorAll('.s-auth .auth-pass').forEach(i => { if (i !== el) i.value = el.value; });
  };

  function creds() {
    const user = (A.user || '').trim();
    if (!/^[a-z0-9_]{5,18}$/.test(user)) { say('Login ID: 5–18 letters, numbers or _.', true); return null; }
    if ((PASS || '').length < 5) { say('Password: at least 5 characters.', true); return null; }
    return { user, email: user + '@' + USER_DOMAIN, password: PASS + PEPPER };
  }
  const offline = () => say('Can’t reach Spindeck right now — check your connection.', true);

  window.sdAuthLogin = async function () {
    if (!sb) return offline();
    const c = creds(); if (!c || A.busy) return;
    A.busy = true; say('Logging in…');
    const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
    if (error || !data.session) {
      A.busy = false;
      if (!/invalid/i.test((error || {}).message || '')) return say((error && error.message) || 'Couldn’t log in.', true);
      // Supabase says "invalid credentials" either way — ask which it was.
      const { data: exists, error: e2 } = await sb.rpc('login_exists', { login: c.user });
      return say(e2 ? 'Wrong login ID or password.'
        : exists ? 'Wrong password.' : 'No account under that login ID — create one above.', true);
    }
    await sdAfterSignIn(data.session.user);
  };

  window.sdAuthSignup = async function () {
    if (!sb) return offline();
    const c = creds(); if (!c || A.busy) return;
    A.busy = true; say('Creating your account…');
    const { data, error } = await sb.auth.signUp({ email: c.email, password: c.password });
    if (error) {
      A.busy = false;
      return say(/already|registered|exists/i.test(error.message) ? 'That login ID already has an account — log in below.' : error.message, true);
    }
    if (!data.session) {   // "Confirm email" is still on in the dashboard
      A.busy = false;
      return say('Account made, but sign-ups need “Confirm email” turned off in Supabase.', true);
    }
    await sdAfterSignIn(data.session.user);
  };

  /* ── SIGN-IN: the account comes down to this phone ────────────────────── */
  async function sdAfterSignIn(user) {
    UID = user.id;
    A.busy = true; say('Loading your account…');
    let { data: prof, error } = await sb.from('profiles').select('*').eq('id', UID).maybeSingle();
    if (!error && !prof) {
      ({ data: prof, error } = await sb.from('profiles').insert({ id: UID, email: user.email }).select().single());
    }
    if (error || !prof) {
      A.busy = false;
      return say('Signed in, but your profile couldn’t load. Try again in a moment.', true);
    }
    // Settings + taste: the account's copy wins; this phone's goes up if the account has none.
    Object.keys(COLS).forEach(k => {
      const col = COLS[k], server = prof[col];
      const hasServer = server && (typeof server !== 'object' || Object.keys(server).length);
      if (hasServer) rawSet(k, JSON.stringify(server));
      else if (ls.getItem(k)) markDirty(col);
    });
    saveAcc({ id: UID, email: user.email, username: prof.username || '', onboarded: !!prof.onboarded, profile: prof.profile || {} });
    await pullReviews();
    flushProfile();
    // Clean the #access_token off the address before anything else reads it.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (prof.onboarded) { location.reload(); return; }
    A.busy = false; say('');
    if (typeof window.obStart === 'function') window.obStart();   // the @username is picked on step 1
  }

  // A cookie-cleared phone, an expired session, a different person: start over.
  function forget() {
    PRIVATE_KEYS.forEach(rawDel);
    UID = null;
  }

  window.sdSignOut = async function () {
    try { await flushAll(); } catch (e) {}
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    forget();
    location.href = location.pathname;
  };

  /* ── SYNC ─────────────────────────────────────────────────────────────── */
  Storage.prototype.setItem = function (k, v) {
    _set.call(this, k, v);
    if (this === ls && !MUTE) onLocalWrite(k);
  };
  Storage.prototype.removeItem = function (k) {
    _remove.call(this, k);
    if (this === ls && !MUTE) onLocalWrite(k);
  };
  function onLocalWrite(k) {
    if (!UID) return;
    if (k === LOGS_KEY) schedule(flushReviews, 500);
    else if (COLS[k]) { markDirty(COLS[k]); schedule(flushProfile, 800); }
  }
  const timers = new Map();
  function schedule(fn, ms) { clearTimeout(timers.get(fn)); timers.set(fn, setTimeout(fn, ms)); }
  function markDirty(col) {
    const d = readJSON(DIRTY_KEY, []);
    if (!d.includes(col)) { d.push(col); rawSet(DIRTY_KEY, JSON.stringify(d)); }
  }

  const stamp = d => new Date((d && d.updated) || Date.now()).toISOString();

  async function pullReviews() {
    if (!UID) return false;
    const { data, error } = await sb.from('reviews').select('key,data').eq('user_id', UID);
    if (error) return false;
    const server = {}; (data || []).forEach(r => { server[r.key] = r.data; });
    const local = readJSON(LOGS_KEY, {});
    const base = readJSON(BASE_KEY, {});
    const merged = {};
    new Set([...Object.keys(server), ...Object.keys(local)]).forEach(k => {
      const s = server[k], l = local[k];
      if (s && l) merged[k] = ((l.updated || 0) > (s.updated || 0)) ? l : s;
      else if (s) { if (!(k in base)) merged[k] = s; }       // in base but gone locally = deleted here, still to send
      else if (l) { if (!(k in base)) merged[k] = l; }       // in base but gone on the server = deleted elsewhere
    });
    const before = ls.getItem(LOGS_KEY) || '{}';
    const after = JSON.stringify(merged);
    rawSet(LOGS_KEY, after);
    const nb = {}; Object.keys(server).forEach(k => { nb[k] = JSON.stringify(server[k]); });
    rawSet(BASE_KEY, JSON.stringify(nb));
    await flushReviews();
    return before !== after;
  }

  let flushing = null, again = false;
  async function flushReviews() {
    if (!UID || !sb) return true;
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      const local = readJSON(LOGS_KEY, {});
      const base = readJSON(BASE_KEY, {});
      const ups = [], dels = [];
      Object.keys(local).forEach(k => {
        const s = JSON.stringify(local[k]);
        if (base[k] !== s) ups.push({ user_id: UID, key: k, data: local[k], updated_at: stamp(local[k]) });
      });
      Object.keys(base).forEach(k => { if (!(k in local)) dels.push(k); });
      if (!ups.length && !dels.length) return true;
      let ok = true;
      if (ups.length) {
        const { error } = await sb.from('reviews').upsert(ups, { onConflict: 'user_id,key' });
        if (error) ok = false; else ups.forEach(r => { base[r.key] = JSON.stringify(r.data); });
      }
      if (dels.length) {
        const { error } = await sb.from('reviews').delete().eq('user_id', UID).in('key', dels);
        if (error) ok = false; else dels.forEach(k => { delete base[k]; });
      }
      rawSet(BASE_KEY, JSON.stringify(base));
      syncState(ok);
      return ok;
    })();
    const res = await flushing; flushing = null;
    if (again) { again = false; return flushReviews(); }
    return res;
  }

  async function flushProfile() {
    if (!UID || !sb) return true;
    const dirty = readJSON(DIRTY_KEY, []);
    if (!dirty.length) return true;
    const patch = { updated_at: new Date().toISOString() };
    dirty.forEach(col => {
      if (col === 'profile') patch.profile = (acc() || {}).profile || {};
      else { const k = Object.keys(COLS).find(x => COLS[x] === col); patch[col] = readJSON(k, null); }
    });
    const { error } = await sb.from('profiles').update(patch).eq('id', UID);
    if (!error) rawSet(DIRTY_KEY, JSON.stringify(readJSON(DIRTY_KEY, []).filter(c => !dirty.includes(c))));
    syncState(!error);
    return !error;
  }
  const flushAll = () => Promise.all([flushReviews(), flushProfile()]);

  /* The one thing the user sees of all this: a quiet pill when their work
     hasn't reached the account yet, and another when it has. */
  let failing = false;
  function syncState(ok) {
    if (!ok && !failing) { failing = true; toast('Not saved to your account yet — will keep trying', true); }
    else if (ok && failing) { failing = false; toast('Saved to your account'); }
  }
  function toast(text, warn) {
    let t = document.querySelector('.sd-acc-toast');
    if (!t) { t = document.createElement('div'); t.className = 'sd-acc-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.classList.toggle('warn', !!warn); t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), warn ? 5000 : 2200);
  }
  window.addEventListener('online', () => flushAll());
  setInterval(() => { if (failing || readJSON(DIRTY_KEY, []).length) flushAll(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

  /* ── ONBOARDING, ONCE ─────────────────────────────────────────────────── */
  function hookOnboarding() {
    // Step 1's handle must be free before Continue goes anywhere.
    const _next = window.obNext;
    if (_next && !_next._acc) {
      window.obNext = async function (skip) {
        if (typeof OB !== 'undefined' && OB.step === 0) {
          if (skip || !obUserValid()) return;
          if (sb && UID) {
            const { data: taken, error } = await sb.rpc('username_taken', { name: OB.username });
            if (!error && taken) {
              document.querySelectorAll('.s-onboarding .ob-user-hint').forEach(h => {
                h.classList.remove('ob-user-hint--ok'); h.textContent = '@' + OB.username + ' is taken — try another';
              });
              return;
            }
            // The handle is CLAIMED here, not at the end: once you have an
            // @username the account is set up, so leaving partway through and
            // logging in again goes straight to the app. The rest of the wizard
            // is a first-visit extra (its answers are saved by obFinish).
            if (!(await claimHandle(OB.username))) return;
          }
        }
        return _next.apply(this, arguments);
      };
      window.obNext._acc = true;
    }

    async function claimHandle(name) {
      const btns = [...document.querySelectorAll('.s-onboarding .ob-next')];
      btns.forEach(b => { b.disabled = true; b.textContent = 'Saving…'; });
      const profile = Object.assign({}, (acc() || {}).profile, { name, handle: name });
      const { error } = await sb.from('profiles').update({
        username: name, onboarded: true, profile, updated_at: new Date().toISOString(),
      }).eq('id', UID);
      btns.forEach(b => { b.disabled = false; b.textContent = 'Continue'; });
      if (error) {
        if (error.code === '23505') {
          document.querySelectorAll('.s-onboarding .ob-user-hint').forEach(h => {
            h.classList.remove('ob-user-hint--ok'); h.textContent = '@' + name + ' is taken — try another';
          });
        } else toast('Couldn’t save your username — check your connection and try again', true);
        return false;
      }
      const a = acc() || {};
      saveAcc(Object.assign(a, { username: name, onboarded: true, profile }));
      applyProfile(acc());
      return true;
    }

    const _finish = window.obFinish;
    if (_finish && !_finish._acc) {
      window.obFinish = async function () {
        if (!(sb && UID)) return _finish.apply(this, arguments);
        const btns = [...document.querySelectorAll('.s-onboarding .ob-next')];
        btns.forEach(b => { b.disabled = true; b.textContent = 'Saving…'; });
        const name = OB.username;
        const profile = Object.assign({}, (acc() || {}).profile, { name, handle: name, bio: '', location: '' }, OB.pic ? { pic: OB.pic } : {});
        const { error } = await sb.from('profiles').update({
          username: name, onboarded: true, profile, updated_at: new Date().toISOString(),
          onboarding: { service: OB.service, tracking: OB.tracking, genres: [...OB.genres],
                        artists: [...OB.artists], albums: [...OB.albums], following: [...OB.following] },
        }).eq('id', UID);
        if (error) {
          btns.forEach(b => { b.disabled = false; b.textContent = 'Start exploring'; });
          if (error.code === '23505') {   // unique_violation: someone took the handle meanwhile
            OB.step = 0; obSync();
            document.querySelectorAll('.s-onboarding .ob-user-hint').forEach(h => { h.textContent = '@' + name + ' is taken — try another'; });
          } else toast('Couldn’t save your profile — check your connection and try again', true);
          return;
        }
        const a = acc() || {};
        saveAcc(Object.assign(a, { username: name, onboarded: true, profile }));
        applyProfile(acc());
        await flushAll();
        return _finish.apply(this, arguments);
      };
      window.obFinish._acc = true;
    }

    // Edit profile → the account.
    const _pfSave = window.pfeditSave;
    if (_pfSave && !_pfSave._acc) {
      window.pfeditSave = function () {
        const r = _pfSave.apply(this, arguments);
        if (UID && window.PROFILE) {
          const p = {}; PROFILE_FIELDS.forEach(f => { if (window.PROFILE[f] !== undefined) p[f] = window.PROFILE[f]; });
          const a = acc(); if (a) { a.profile = p; saveAcc(a); }
          markDirty('profile'); flushProfile();
        }
        return r;
      };
      window.pfeditSave._acc = true;
    }
  }
  hookOnboarding();

  /* ── ON LOAD: check the cached account against the server ─────────────── */
  if (sb) {
    sb.auth.getSession().then(async ({ data }) => {
      const session = data && data.session;
      const a = acc();
      if (!session) {
        if (a) {                       // signed out elsewhere, or the session expired
          forget();
          if (typeof navigate === 'function') navigate('auth');
        }
        if (A.busy) { A.busy = false; say(''); }
        return;
      }
      if (!a || a.id !== session.user.id) { await sdAfterSignIn(session.user); return; }
      UID = session.user.id;
      // Same person, same phone: send up anything that didn't make it last
      // time, and bring down reviews written on another device.
      flushProfile();
      if (await pullReviews() && typeof sdRerender === 'function') sdRerender();
    });
  }

  /* ── STYLES (the auth screen's moving parts + the toast) ──────────────── */
  const css = document.createElement('style');
  css.textContent = `
    .s-auth .auth-body { gap: 0; }
    .s-auth .auth-msg { min-height: 20px; margin: 14px 0 0; font-size: 13px; color: var(--text2); text-align: center; }
    .s-auth .auth-msg.err { color: #e5484d; }
    .s-auth .auth-fine { margin: auto 0 0; padding-top: 18px; font-size: 12px; color: var(--text3); text-align: center; line-height: 1.5; }
    .s-auth button:disabled { opacity: .55; }
    .sd-acc-toast { position: fixed; left: 50%; bottom: 28px; transform: translate(-50%, 12px); z-index: 99999;
      padding: 10px 16px; border-radius: 999px; background: #1c1c22; color: #e8e2d6;
      font: 600 13px/1.3 'DM Sans', system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.35);
      opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; max-width: calc(100vw - 32px); text-align: center; }
    .sd-acc-toast.on { opacity: 1; transform: translate(-50%, 0); }
    .sd-acc-toast.warn { background: #3a1d1f; color: #ffd7d9; }
  `;
  document.head.appendChild(css);
})();
