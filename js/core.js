/* FP-10 Instrument Box: core engine for the extra features.
   Input pipeline (piano keys -> hooks -> chord/arp transforms -> sound),
   a shared tempo clock, and scheduled playback through the current sound. */

/* ---------- small helpers ---------- */
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pcOf = n => ((n % 12) + 12) % 12;
function segmented(id, options, value, onChange) {
  const box = $(id); box.innerHTML = '';
  options.forEach(([v, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
    b.classList.toggle('sel', String(v) === String(value));
    b.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); onChange(v); };
    box.appendChild(b);
  });
}
function setSeg(id, value) { $(id).querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === String(value))); }

/* ---------- chords & scales ---------- */
const CHORD_TYPES = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]],
  ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['5', [0, 7]], ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]], ['9', [0, 4, 7, 10, 2]], ['add9', [0, 4, 7, 2]], ['m7♭5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['mMaj7', [0, 3, 7, 11]]];
function detectChord(notes) {
  if (!notes.length) return null;
  const pcs = [...new Set(notes.map(pcOf))], bass = pcOf(Math.min(...notes));
  if (pcs.length === 1) return { root: pcs[0], type: '', ivs: [0, 4, 7], name: NAMES[pcs[0]], single: true };
  let best = null;
  for (const r of pcs) for (const [nm, iv] of CHORD_TYPES) {
    const set = iv.map(x => (r + x) % 12);
    if (pcs.some(p => !set.includes(p))) continue;
    const miss = set.length - pcs.length;
    const score = pcs.length * 2 - miss * 3 + (r === bass ? 1.5 : 0) - iv.length * 0.1;
    if (!best || score > best.score) best = { root: r, type: nm, ivs: iv, score, miss };
  }
  if (!best || best.miss > 1) return null;
  best.name = NAMES[best.root] + best.type + (bass !== best.root ? '/' + NAMES[bass] : '');
  return best;
}
const SCALES = {
  off: ['Off', []], major: ['Major', [0, 2, 4, 5, 7, 9, 11]], minor: ['Minor', [0, 2, 3, 5, 7, 8, 10]],
  pentaM: ['Pentatonic major', [0, 2, 4, 7, 9]], pentam: ['Pentatonic minor', [0, 3, 5, 7, 10]],
  blues: ['Blues', [0, 3, 5, 6, 7, 10]], dorian: ['Dorian', [0, 2, 3, 5, 7, 9, 10]], mixo: ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]],
  harm: ['Harmonic minor', [0, 2, 3, 5, 7, 8, 11]], phryg: ['Phrygian', [0, 1, 3, 5, 7, 8, 10]]
};
let scaleKey = store.get('scaleKey', 0), scaleType = store.get('scaleType', 'off');
const inScale = n => scaleType !== 'off' && SCALES[scaleType][1].includes(pcOf(n - scaleKey));

/* ---------- tempo clock (16th-note steps, look-ahead scheduling) ---------- */
const T = { bpm: store.get('bpm2', 100), running: false, step: 0, nextTime: 0, timer: null, users: new Set(), swing: 0 };
const STEP_LISTENERS = [];
const stepDur = () => 60 / T.bpm / 4;
function transportNeed(who, on) {
  if (on) T.users.add(who); else T.users.delete(who);
  if (T.users.size && !T.running) transportStart();
  else if (!T.users.size && T.running) transportStop();
}
function transportStart() {
  initAudio(); T.running = true; T.step = 0; T.nextTime = ctx.currentTime + 0.12;
  clearInterval(T.timer); T.timer = setInterval(tick, 25); tick();
}
function transportStop() { T.running = false; clearInterval(T.timer); }
function tick() {
  while (T.running && T.nextTime < ctx.currentTime + 0.12) {
    const s = T.step;
    const t = T.nextTime + (T.swing && s % 2 === 1 ? stepDur() * T.swing : 0);
    STEP_LISTENERS.forEach(f => { try { f(s, t); } catch (e) { console.warn(e); } });
    T.step++; T.nextTime += stepDur();
  }
}
// fractional step position of an audio time
const stepAt = t => T.step - (T.nextTime - t) / stepDur();
function setBpm(v) { T.bpm = clamp(Math.round(v), 40, 240); store.set('bpm2', T.bpm); document.querySelectorAll('.bpmVal').forEach(e => e.textContent = T.bpm); document.querySelectorAll('.bpmRange').forEach(e => e.value = T.bpm); }

/* ---------- outputs: where a note sounds right now ---------- */
let layerMode = store.get('layerMode', 'layer'), splitPoint = store.get('splitPoint', 60);
function layersFor(n) {
  if (!layer2) return [0];
  if (layerMode === 'split') return n < splitPoint ? [1] : [0];
  return [0, 1];
}
function currentOutputs(n) {
  if (mode === 'phone') return [{ type: 'phone', inst: INST[(split && n < 60) ? 'bass' : current], bus: null, shift: octave * 12 + transpose }];
  if (mode === 'gm2') {
    initAudio(); ensureLayerBus();
    return layersFor(n).map(i => {
      const inst = instFor(i);
      if (inst === 'piano') return { type: 'piano', ch: GM_CH };
      return inst ? { type: 'phone', inst, bus: layerBus[i], shift: transpose } : null;
    }).filter(Boolean);
  }
  return [{ type: 'piano', ch: PANEL_CH }];
}
const flashTimers = {};
function flashKey(n, dur) {
  const e = keyEls[n]; if (!e) return;
  e.classList.add('down'); clearTimeout(flashTimers[n]);
  flashTimers[n] = setTimeout(() => { if (!held.has(n)) e.classList.remove('down'); }, Math.max(80, dur * 1000));
}
// play a note at audio time t for dur seconds through a list of outputs
function playVia(outs, n, vel, t, dur, opts = {}) {
  initAudio();
  const voices = [];
  outs.forEach(o => {
    if (o.type === 'phone') {
      const inst = o.inst;
      const pn = clamp(inst.drum ? n : n + (o.shift || 0), 12, 120);
      const v = withBus(o.bus || bus, () => inst.play(pn, vel, Math.max(t, ctx.currentTime)));
      if (!inst.drum && v && v.release) v.release(Math.max(t, ctx.currentTime) + dur);
      voices.push(v);
    } else {
      const ms = (t - ctx.currentTime) * 1000, ch = o.ch;
      setTimeout(() => send([0x90 | ch, n, clamp(Math.round(vel * 127), 1, 127)]), Math.max(0, ms));
      setTimeout(() => send([0x80 | ch, n, 0]), Math.max(0, ms + dur * 1000));
    }
  });
  if (!opts.quiet) setTimeout(() => { flashKey(n, dur); vizNote(n, vel); }, Math.max(0, (t - ctx.currentTime) * 1000));
  return voices;
}

/* ---------- input pipeline ---------- */
const HOOKS = { on: [], off: [], pedal: [] };
const rawHeld = new Set();          // keys physically held (piano or screen)
const inputHeld = new Map();        // input key -> what it produced
const outCount = new Map();         // output note -> how many inputs hold it
let chordMode = store.get('chordMode', 'off');
const CHORD_SHAPES = { maj: [0, 4, 7], min: [0, 3, 7], seven: [0, 4, 7, 10], power: [0, 7, 12], oct: [0, 12], sus: [0, 5, 7] };
function chordNotes(n) {
  if (chordMode === 'off') return [n];
  if (chordMode === 'scale') {
    if (scaleType === 'off') return [n, n + 4, n + 7];
    const sc = SCALES[scaleType][1], deg = sc.indexOf(pcOf(n - scaleKey));
    if (deg < 0) return [n];
    const up = k => { const d = deg + k, oct = Math.floor(d / sc.length); return n + (sc[d % sc.length] - sc[deg]) + 12 * oct; };
    return [n, up(2), up(4)];
  }
  return CHORD_SHAPES[chordMode].map(x => n + x);
}
function inputOn(n, vel, fromPiano) {
  rawHeld.add(n);
  HOOKS.on.forEach(f => { try { f(n, vel, fromPiano); } catch (e) { console.warn(e); } });
  if (bandMutes(n)) { inputHeld.set(n, { gen: [], silent: true }); return; }
  const notes = chordNotes(n).filter(x => x >= 0 && x <= 127);
  if (arp.on) { notes.forEach(x => arpAdd(x, vel)); inputHeld.set(n, { gen: notes, arp: true }); return; }
  notes.forEach((x, i) => outOn(x, vel, i === 0 ? fromPiano : false));
  inputHeld.set(n, { gen: notes, fromPiano });
}
function inputOff(n, fromPiano) {
  rawHeld.delete(n);
  HOOKS.off.forEach(f => { try { f(n); } catch (e) { console.warn(e); } });
  const e = inputHeld.get(n); inputHeld.delete(n);
  if (!e) { outOff(n, fromPiano); return; }
  if (e.silent) return;
  if (e.arp) { e.gen.forEach(arpRemove); return; }
  e.gen.forEach((x, i) => outOff(x, i === 0 ? fromPiano : false));
}
function outOn(n, vel, fromPiano) {
  const c = outCount.get(n) || 0; outCount.set(n, c + 1);
  noteOn(n, vel, fromPiano);
  captureOn(n, vel);
  vizNote(n, vel);
}
function outOff(n, fromPiano) {
  const c = (outCount.get(n) || 1) - 1;
  if (c > 0) { outCount.set(n, c); return; }
  outCount.delete(n);
  noteOff(n, fromPiano);
  captureOff(n);
}
// pedal + panic wrappers around the original functions
const _setPedal = setPedal;
setPedal = function (on, fromPiano) { _setPedal(on, fromPiano); HOOKS.pedal.forEach(f => f(on)); };
const _allOff = allOff;
allOff = function () {
  _allOff(); inputHeld.clear(); outCount.clear(); rawHeld.clear();
  if (typeof arp !== 'undefined') { arp.held = []; transportNeed('arp', false); }
};

/* ---------- arpeggiator ---------- */
const arp = { on: false, pattern: store.get('arpPat', 'up'), rate: store.get('arpRate', 2), octs: store.get('arpOct', 1), gate: 0.7, held: [], i: 0 };
function arpAdd(n, vel) { arp.held.push({ n, vel }); arp.held.sort((a, b) => a.n - b.n); transportNeed('arp', true); }
function arpRemove(n) {
  const k = arp.held.findIndex(x => x.n === n); if (k >= 0) arp.held.splice(k, 1);
  if (!arp.held.length) { arp.i = 0; transportNeed('arp', false); }
}
function arpSeq() {
  const base = [];
  for (let o = 0; o < arp.octs; o++) arp.held.forEach(x => base.push({ n: x.n + 12 * o, vel: x.vel }));
  if (arp.pattern === 'down') return base.reverse();
  if (arp.pattern === 'updown') return base.length < 3 ? base : [...base, ...base.slice(1, -1).reverse()];
  return base;
}
STEP_LISTENERS.push((s, t) => {
  if (!arp.on || !arp.held.length || s % arp.rate) return;
  const seq = arpSeq(); if (!seq.length) return;
  const note = arp.pattern === 'random' ? seq[Math.floor(Math.random() * seq.length)] : seq[arp.i++ % seq.length];
  const dur = stepDur() * arp.rate * arp.gate, outs = currentOutputs(note.n);
  playVia(outs, note.n, note.vel, t, dur);
  captureScheduled(note.n, note.vel, t, dur, outs);
});

/* ---------- capture (looper + recorder listen here) ---------- */
const CAPTURE = [];   // objects with on(n, vel, outs), off(n), sched(n, vel, t, dur, outs)
const pedalDeferred = new Set();
function captureOn(n, vel) { if (!CAPTURE.some(c => c.active())) return; const outs = currentOutputs(n); CAPTURE.forEach(c => c.active() && c.on(n, vel, outs)); }
function captureOff(n) {
  if (pedal) { pedalDeferred.add(n); return; }
  CAPTURE.forEach(c => c.active() && c.off(n));
}
HOOKS.pedal.push(on => { if (!on) { pedalDeferred.forEach(n => CAPTURE.forEach(c => c.active() && c.off(n))); pedalDeferred.clear(); } });
function captureScheduled(n, vel, t, dur, outs) { CAPTURE.forEach(c => c.active() && c.sched && c.sched(n, vel, t, dur, outs)); }

/* visualizer hook placeholder (replaced in extras.js) */
let vizNote = () => {};
/* band mute placeholder (replaced in band.js) */
let bandMutes = () => false;

/* ---------- live chord names on the keyboard ---------- */
const _updateNotes = updateNotes;
updateNotes = function () {
  const h = [...held].sort((a, b) => a - b);
  const ch = h.length >= 2 ? detectChord(h) : null;
  $('notes').textContent = h.length ? (ch ? ch.name + '  ·  ' : '') + h.slice(0, 6).map(noteName).join(' ') + (h.length > 6 ? ' …' : '') : '—';
  if ($('vizChord')) $('vizChord').textContent = ch ? ch.name : (h.length === 1 ? noteName(h[0]) : '');
};
function paintScale() {
  Object.entries(keyEls).forEach(([n, e]) => {
    e.classList.toggle('insc', inScale(+n));
    e.classList.toggle('root', scaleType !== 'off' && pcOf(n - scaleKey) === 0);
  });
}

/* ---------- section navigation + shared CSS ---------- */
document.head.appendChild(el(`<style>
.nav{position:sticky;top:0;z-index:20;display:flex;gap:4px;background:rgba(18,16,20,.92);backdrop-filter:blur(8px);padding:8px 0;margin:0 0 12px}
.nav button{flex:1;padding:10px 2px;border-radius:12px;font-size:13px;font-weight:700;color:var(--mute);background:#1d1a21;border:1px solid var(--line)}
.nav button.sel{background:var(--acc);color:#1a1205;border-color:var(--acc)}
.seg2{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.seg2 button{flex:1;min-width:46px;background:#26222b;border:1px solid var(--line);border-radius:10px;padding:8px 6px;font-size:13px;font-weight:600}
.seg2 button.sel{background:var(--acc);color:#1a1205;border-color:var(--acc)}
.big{font-size:28px;font-weight:700;letter-spacing:-.02em}
.pill{display:inline-block;padding:3px 10px;border-radius:12px;background:#26222b;border:1px solid var(--line);font-size:12px;color:var(--mute)}
.pill.on{background:#16351f;border-color:var(--ok);color:var(--ok)}
.pill.rec{background:#3a1515;border-color:var(--acc2);color:#ffb3aa}
.btn.on{background:var(--ok);color:#06210f}
.btn.red{background:var(--acc2);color:#2a0805}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:8px}
.hdr .btn{white-space:nowrap}
.w.insc::before,.k.insc::before{content:"";position:absolute;left:50%;transform:translateX(-50%);width:8px;height:8px;border-radius:50%;background:#5fd38d;bottom:22px}
.k.insc::before{bottom:10px}
.w.root::before,.k.root::before{background:var(--acc2)}
canvas{display:block;width:100%;border-radius:10px;background:#0b0a0d}
.stat{display:flex;gap:10px}
.stat>div{flex:1;background:#26222b;border-radius:12px;padding:10px;text-align:center}
.stat b{display:block;font-size:22px}
.stat small{color:var(--mute);font-size:12px}
.bars{display:flex;align-items:flex-end;gap:4px;height:70px;margin-top:10px}
.bars div{flex:1;background:var(--acc);border-radius:4px 4px 0 0;min-height:2px;opacity:.85}
.answers{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.answers button{background:#26222b;border:1px solid var(--line);border-radius:10px;padding:10px 4px;font-weight:600;font-size:13px}
.answers button.good{background:#16351f;border-color:var(--ok)}
.answers button.bad{background:#3a1515;border-color:var(--acc2)}
.scene{display:inline-flex;align-items:center;gap:6px;margin:0 6px 6px 0;background:#26222b;border:1px solid var(--line);border-radius:20px;padding:7px 12px;font-size:13px;font-weight:600}
.scene .x{color:var(--acc2);font-weight:700;padding-left:4px}
input[type=text]{background:#26222b;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px;font:inherit;flex:1;min-width:0}
</style>`));

function buildNav() {
  const tabs = $('tabs');
  const wrap = el('<div id="sec-sounds"></div>');
  tabs.parentNode.insertBefore(wrap, tabs);
  // move everything from the sound tabs up to (not including) the keyboard card into the Sounds section
  const kbCard = $('kbwrap').closest('.card');
  let node = wrap.nextSibling;
  while (node && node !== kbCard) { const nx = node.nextSibling; wrap.appendChild(node); node = nx; }
  ['band', 'studio', 'learn'].forEach(s => wrap.parentNode.insertBefore(el(`<div id="sec-${s}" class="hide"></div>`), kbCard));
  const nav = el(`<nav class="nav" id="nav">
    <button data-sec="sounds">🎹 Sounds</button><button data-sec="band">🥁 Band</button>
    <button data-sec="studio">🎛️ Studio</button><button data-sec="learn">🎓 Learn</button></nav>`);
  wrap.parentNode.insertBefore(nav, wrap);
  const show = s => {
    store.set('sec', s);
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.sec === s));
    ['sounds', 'band', 'studio', 'learn'].forEach(x => $('sec-' + x).classList.toggle('hide', x !== s));
    window.dispatchEvent(new CustomEvent('section', { detail: s }));
  };
  nav.querySelectorAll('button').forEach(b => b.onclick = () => show(b.dataset.sec));
  setTimeout(() => show(store.get('sec', 'sounds')), 0);

  // scale picker on the keyboard card
  const now = kbCard.querySelector('.now');
  now.insertAdjacentElement('afterend', el(`<div class="ctl" style="margin:0 0 8px"><span>Scale</span>
    <select id="scKey" style="flex:0 0 74px">${NAMES.map((x, i) => `<option value="${i}">${x}</option>`).join('')}</select>
    <select id="scType">${Object.entries(SCALES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>`));
  $('scKey').value = scaleKey; $('scType').value = scaleType;
  $('scKey').onchange = e => { scaleKey = +e.target.value; store.set('scaleKey', scaleKey); paintScale(); };
  $('scType').onchange = e => { scaleType = e.target.value; store.set('scaleType', scaleType); paintScale(); };
  paintScale();

  // split-with-two-sounds controls under Layer 2
  $('balRow').insertAdjacentElement('afterend', el(`<div id="splitBox" class="hide">
    <div class="ctl"><span>Layer 2 is</span><div class="seg2" id="lmode"></div></div>
    <div class="ctl" id="spRow"><span>Split at</span><b id="spName" style="min-width:44px"></b><button class="btn ghost sm" id="spSet">Set by playing a key</button></div></div>`));
  segmented('lmode', [['layer', 'Layered on top'], ['split', 'Left-hand split']], layerMode, v => {
    layerMode = v; store.set('layerMode', v); allOff(); syncSplitUi();
  });
  let waitSplit = false;
  $('spSet').onclick = () => { waitSplit = true; $('spSet').textContent = 'Play the split key…'; };
  HOOKS.on.unshift(n => {
    if (!waitSplit) return;
    waitSplit = false; splitPoint = n; store.set('splitPoint', n); syncSplitUi();
    $('spSet').textContent = 'Set by playing a key';
  });
  syncSplitUi();
}
function syncSplitUi() {
  if (!$('splitBox')) return;
  $('splitBox').classList.toggle('hide', !layer2);
  $('spRow').classList.toggle('hide', layerMode !== 'split');
  $('spName').textContent = noteName(splitPoint);
  $('balRow').classList.toggle('hide', !layer2 || layerMode === 'split');
}
// keep split UI in sync whenever the layer card redraws
const _updateWhere = updateWhere;
updateWhere = function () { _updateWhere(); syncSplitUi(); };

buildNav();
