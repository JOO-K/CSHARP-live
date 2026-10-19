/* ============================================================
   SNAP — copy the mockup as a PNG (csharpuser, 2026-10-01). Eric: "a button
   in the upper right where it lets me copy that page as png of the mockup as
   well as a longer version thats like 3x phone height to show what below the
   scrolling sections" — then "stay even when i switch versions and make it
   smaller no outlines".

   Two small buttons, fixed in the viewer's upper-right corner:
     PNG — the phone as it is on screen, scroll positions kept.
     3×  — the same phone grown to three screens tall, so the scrolling
           sections lay out to show what is below the fold.
   A click COPIES the image to the clipboard — it never downloads (Eric,
   2026-10-01: "copies the image not downloads it"). If the browser refuses
   the write (the capture can outlast the click's permission), the finished
   image is held and the button reads "Copy": one more click copies it at
   once. The clipboard needs a secure page — localhost / 127.0.0.1 or https;
   a LAN address (192.168.x) or file:// has no clipboard API at all, and the
   note says so.

   IN EVERY VERSION, LIKE versions.js: this file is identical in each version
   folder and each index.html loads it last. It carries its own styles and
   loads its own library, so a version needs nothing else. Adding a version:
   copy this file and its one <script> line.

   PRIVATE BY CONSTRUCTION: only built on a local address (the same test as
   versions.js), so the public site shows nothing.

   ⚠️ modern-screenshot, NOT html2canvas. html2canvas re-implements CSS and
   drops masks, mask-image fades and SVG masks — the bento and the feed lean on
   all three (see share.js's header). modern-screenshot clones the node into an
   SVG foreignObject and lets the BROWSER paint it. Loaded from jsdelivr on the
   first press, so it costs nothing until used.

   ⚠️ The long shot resizes the LIVE frame, briefly. The library inlines each
   clone's computed styles, so heights are frozen in px — growing the clone
   after the fact would not reflow anything. The frame is made 3× tall, given
   a moment to lay out, captured, and put back; a veil covers the stage while
   that happens so the jump is not seen.

   Desktop viewer only. Touches nothing in app.js.
   ============================================================ */

(function () {
  const isFile = location.protocol === 'file:';
  const isLocal = isFile ||
    /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(location.hostname);
  if (!isLocal) return;

  const LIB    = 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.js';
  const LONG_X = 3;       // the long shot is this many phone heights
  const SCALE  = 2;       // output pixels per CSS pixel

  const CSS = `
.sd-snap { position: fixed; top: 10px; right: 12px; z-index: 50; display: flex; align-items: center; gap: 3px; font-family: 'DM Sans', system-ui, sans-serif; }
.sd-snap-btn { border: 0; outline: 0; margin: 0; padding: 3px 7px; border-radius: 5px; background: rgba(255,255,255,0.05); color: #7a7a7a; font: inherit; font-size: 10px; font-weight: 600; letter-spacing: .3px; line-height: 1.4; cursor: pointer; box-shadow: none; }
.sd-snap-btn:hover { background: rgba(255,255,255,0.1); color: #e0e0e0; }
.sd-snap-btn:focus-visible { color: #e0e0e0; }
.sd-snap-btn:disabled { opacity: .4; cursor: default; }
.sd-snap-note { font-size: 10px; color: #8a8a8a; margin-right: 4px; opacity: 0; transition: opacity .2s; white-space: nowrap; }
.sd-snap-note.is-on { opacity: 1; }
.sd-snap-veil { position: fixed; inset: 0; z-index: 49; display: flex; align-items: center; justify-content: center; background: #0c0c0c; color: #6a6a6a; font: 12px 'DM Sans', system-ui, sans-serif; letter-spacing: .3px; }
.sd-snap-veil[hidden] { display: none; }
@media (max-width: 767px) { .sd-snap, .sd-snap-veil { display: none !important; } }`;

  let libP = null;
  function lib() {
    if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => window.modernScreenshot ? res(window.modernScreenshot) : rej(new Error('library missing'));
      s.onerror = () => { libP = null; rej(new Error('could not load the screenshot library (offline?)')); };
      document.head.appendChild(s);
    });
    return libP;
  }

  function frameEl() {
    const c = document.getElementById('phone-container');
    if (!c) return null;
    const wrap = c.querySelector('.phone-wrap.look-active') || c.querySelector('.phone-wrap');
    return wrap && wrap.querySelector('.phone-frame');
  }

  // The frame's own layout size in CSS px — untouched by zoom or transforms.
  function cssSize(el) {
    const cs = getComputedStyle(el);
    return { w: parseFloat(cs.width) || 393, h: parseFloat(cs.height) || 852 };
  }

  const nextPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function capture(long) {
    const ms = await lib();
    const frame = frameEl();
    if (!frame) throw new Error('no phone on stage');

    const veil = document.querySelector('.sd-snap-veil');
    const prevH = frame.style.height;
    if (long) {
      veil.hidden = false;
      frame.style.height = (cssSize(frame).h * LONG_X) + 'px';
      await nextPaint();
      await wait(120);    // let scrollers and anything measuring on resize settle
    }
    try {
      // ⚠️ The size is the frame's CSS size, PASSED IN. Left to itself the
      // library measures getBoundingClientRect, which includes the viewer's
      // zoom on #phone-container and the fit-to-window scale on .phone-wrap —
      // so the canvas came out that much bigger than the phone drawn into it,
      // and the mockup sat small in a corner of the PNG.
      const sz = cssSize(frame);
      return await ms.domToBlob(frame, {
        width: sz.w,
        height: sz.h,
        scale: SCALE,
        backgroundColor: null,
        type: 'image/png',
        features: { restoreScrollPosition: true },
      });
    } finally {
      if (long) {
        frame.style.height = prevH;
        veil.hidden = true;
      }
    }
  }

  let noteT = 0;
  function note(msg, sticky) {
    const el = document.querySelector('.sd-snap-note');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(noteT);
    if (!sticky) noteT = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  // A finished image the browser would not take on the first try, per button.
  const ready = { 0: null, 1: null };
  const LABEL = { 0: 'PNG', 1: '3×' };

  function canCopy() {
    return !!(window.isSecureContext && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
  }
  function why(e) {
    const m = (e && (e.name === 'NotAllowedError' ? 'the browser blocked it' : e.message)) || String(e);
    return m;
  }

  async function go(btn, long) {
    if (btn.disabled) return;
    const k = long ? 1 : 0;
    if (!canCopy()) {
      note('No clipboard here — open it on localhost (not ' + (location.protocol === 'file:' ? 'file://' : location.hostname) + ')');
      return;
    }

    // Second try: the image is already made, so the write lands inside this click.
    if (ready[k]) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': ready[k] })]);
        ready[k] = null; btn.textContent = LABEL[k];
        note(long ? 'Long PNG copied' : 'PNG copied');
      } catch (e) { note('Couldn’t copy: ' + why(e)); }
      return;
    }

    const btns = document.querySelectorAll('.sd-snap-btn');
    btns.forEach(b => b.disabled = true);
    note('Capturing…', true);

    // ⚠️ The clipboard write is started INSIDE the click, with the blob as a
    // promise — awaiting the capture first would spend the user gesture and
    // the browser would refuse the write.
    const blobP = capture(long);
    let err = null;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })]);
      note(long ? 'Long PNG copied' : 'PNG copied');
    } catch (e) { err = e; }
    if (err) {
      try {
        ready[k] = await blobP;          // made fine, the browser just wouldn't take it yet
        btn.textContent = 'Copy';
        note('Ready — click Copy');
      } catch (e) {
        note('Couldn’t capture: ' + why(e));
        console.warn('[snap]', e);
      }
    }
    btns.forEach(b => b.disabled = false);
  }

  // Sit under the toolbar when it is a real bar (?tools, or a version whose
  // toolbar always shows); in the corner when the toolbar floats or is absent.
  function place(wrap) {
    const tb = document.getElementById('toolbar');
    let top = 10;
    if (tb && getComputedStyle(tb).position !== 'absolute') {
      const r = tb.getBoundingClientRect();
      if (r.height > 0) top = Math.round(r.bottom + 8);
    }
    wrap.style.top = top + 'px';
  }

  function build() {
    if (document.querySelector('.sd-snap')) return;
    const st = document.createElement('style');
    st.id = 'sd-snap-css';
    st.textContent = CSS;
    document.head.appendChild(st);

    const wrap = document.createElement('div');
    wrap.className = 'sd-snap';
    wrap.innerHTML =
      '<span class="sd-snap-note" aria-live="polite"></span>' +
      '<button class="sd-snap-btn" type="button" data-long="0" ' +
        'title="Copy the phone as a PNG">PNG</button>' +
      '<button class="sd-snap-btn" type="button" data-long="1" ' +
        'title="Copy a 3× tall PNG showing what is below the fold">3×</button>';
    document.body.appendChild(wrap);

    const veil = document.createElement('div');
    veil.className = 'sd-snap-veil';
    veil.hidden = true;
    veil.textContent = 'Capturing…';
    document.body.appendChild(veil);

    wrap.addEventListener('click', e => {
      const b = e.target.closest('.sd-snap-btn');
      if (b) go(b, b.dataset.long === '1');
    });
    place(wrap);
    window.addEventListener('resize', () => place(wrap));
    setTimeout(() => place(wrap), 500);   // after app.js has set body.sd-tools
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
