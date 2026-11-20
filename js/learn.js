/* FP-10 Instrument Box: falling-notes songs, ear training, practice stats */

/* ---------- built-in songs (public-domain melodies) ---------- */
// "NOTE:beats" tokens, R = rest; default length given per song
const SONGS = [
  { name: 'Ode to Joy (Beethoven)', bpm: 100, len: 1, text: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
  { name: 'Twinkle Twinkle Little Star', bpm: 100, len: 1, text: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
  { name: 'Mary Had a Little Lamb', bpm: 110, len: 1, text: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
  { name: 'Jingle Bells (chorus)', bpm: 120, len: 1, text: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2' },
  { name: 'Für Elise (opening, Beethoven)', bpm: 70, len: 0.5, text: 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:1 R C4 E4 A4 B4:1 R E4 G#4 B4 C5:1 R E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:1 R C4 E4 A4 B4:1 R E4 C5 B4 A4:2' }
];
const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
function parseSong(song) {
  const spb = 60 / song.bpm, notes = []; let t = 0;
  song.text.trim().split(/\s+/).forEach(tok => {
    const [nm, beats] = tok.split(':'); const b = beats ? +beats : song.len;
    if (nm !== 'R') {
      const m = nm.match(NOTE_RE);
      const n = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1);
      notes.push({ t, d: b * spb * 0.9, n, v: 0.75, tr: 0 });
    }
    t += b * spb;
  });
  return notes;
}
function parseMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hl = d.getUint32(p); p += 4;
  const ntr = d.getUint16(p + 2), div = d.getUint16(p + 4); p += hl;
  if (div & 0x8000) throw new Error('this MIDI timing type is not supported');
  const tempos = [{ tick: 0, us: 500000 }], raw = [], names = {};
  for (let tr = 0; tr < ntr && p < d.byteLength; tr++) {
    const id = str(4), len = d.getUint32(p); p += 4; const end = p + len;
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, run = 0; const on = new Map();
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st & 0x80) { p++; if (st < 0xF0) run = st; } else st = run;
      if (st === 0xFF) {
        const type = d.getUint8(p++), l = vlq();
        if (type === 0x51) tempos.push({ tick, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
        if (type === 0x03 && !names[tr]) { let s = ''; for (let i = 0; i < l; i++) s += String.fromCharCode(d.getUint8(p + i)); names[tr] = s.trim(); }
        p += l; continue;
      }
      if (st === 0xF0 || st === 0xF7) { p += vlq(); continue; }
      const type = st & 0xF0, ch = st & 15, a = d.getUint8(p++), c = (type === 0xC0 || type === 0xD0) ? 0 : d.getUint8(p++);
      if (ch === 9) continue;
      if (type === 0x90 && c > 0) { if (!on.has(a)) on.set(a, { tick, v: c / 127 }); }
      else if (type === 0x80 || (type === 0x90 && c === 0)) { const o = on.get(a); if (o) { raw.push({ a: o.tick, b: tick, n: a, v: o.v, tr }); on.delete(a); } }
    }
    p = end;
  }
  tempos.sort((x, y) => x.tick - y.tick);
  const sec = tk => { let s = 0, last = 0, us = 500000; for (const tp of tempos) { if (tp.tick > tk) break; s += (tp.tick - last) / div * us / 1e6; last = tp.tick; us = tp.us; } return s + (tk - last) / div * us / 1e6; };
  const notes = raw.map(r => ({ t: sec(r.a), d: Math.max(0.05, sec(r.b) - sec(r.a)), n: r.n, v: r.v, tr: r.tr })).sort((x, y) => x.t - y.t);
  if (!notes.length) throw new Error('no notes found');
  const t0 = notes[0].t; notes.forEach(n => n.t -= t0);
  return { notes, names };
}

/* ---------- falling notes player ---------- */
const fn = { notes: [], song: '', now: 0, playing: false, mode: store.get('fnMode', 'wait'), speed: store.get('fnSpeed', 100), track: 'all',
  lo: 48, hi: 84, last: 0, nextIdx: 0, hits: 0, judged: 0, waitGroup: null, pressed: new Set(), raf: 0, tracks: {} };
const isMine = nt => fn.track === 'all' || String(nt.tr) === fn.track;
function fnLoad(notes, name, names = {}) {
  fnStop(); fn.notes = notes.map(n => ({ ...n, hit: false, missed: false, played: false })); fn.song = name; fn.now = -2;
  const ns = notes.map(n => n.n); fn.lo = Math.floor(Math.min(...ns) / 12) * 12; fn.hi = Math.ceil((Math.max(...ns) + 1) / 12) * 12 - 1;
  if (fn.hi - fn.lo < 23) fn.hi = fn.lo + 23;
  const trs = {}; notes.forEach(n => trs[n.tr] = (trs[n.tr] || 0) + 1);
  const sel = $('fnTrack'); sel.innerHTML = '<option value="all">All notes</option>' + Object.entries(trs).map(([k, c]) => `<option value="${k}">${names[k] || 'Track ' + (+k + 1)} (${c} notes)</option>`).join('');
  $('fnTrackRow').classList.toggle('hide', Object.keys(trs).length < 2);
  fn.track = 'all';
  $('fnTitle').textContent = name; fnScore(); fnDraw();
}
function fnStart() {
  if (!fn.notes.length) return; initAudio();
  if (fn.now >= fnEnd()) fnRestart();
  fn.playing = true; fn.last = performance.now(); $('fnPlay').textContent = '⏸ Pause';
  cancelAnimationFrame(fn.raf); fn.raf = requestAnimationFrame(fnLoop);
}
function fnStop() { fn.playing = false; cancelAnimationFrame(fn.raf); if ($('fnPlay')) $('fnPlay').textContent = '▶ Play'; }
function fnRestart() { fn.now = -2; fn.hits = 0; fn.judged = 0; fn.waitGroup = null; fn.notes.forEach(n => { n.hit = n.missed = n.played = false; }); fnScore(); fnDraw(); }
const fnEnd = () => fn.notes.length ? Math.max(...fn.notes.map(n => n.t + n.d)) + 1 : 0;
function fnLoop(ts) {
  if (!fn.playing) return;
  const dt = Math.min(0.1, (ts - fn.last) / 1000); fn.last = ts;
  const sp = fn.speed / 100;
  if (fn.mode === 'wait') {
    if (!fn.waitGroup) {
      const next = fn.notes.find(n => isMine(n) && !n.hit && n.t >= fn.now - 0.05);
      if (next && fn.now + dt * sp >= next.t) {
        fn.now = next.t;
        fn.waitGroup = fn.notes.filter(n => isMine(n) && !n.hit && Math.abs(n.t - next.t) < 0.06);
        fn.waitGroup.forEach(n => { if (rawHeld.has(n.n)) n.hit = true; });
      } else fn.now += dt * sp;
    }
    if (fn.waitGroup && fn.waitGroup.every(n => n.hit)) { fn.hits += fn.waitGroup.length; fn.judged += fn.waitGroup.length; fn.waitGroup = null; fnScore(); }
  } else fn.now += dt * sp;
  // auto-play: everything in Listen mode, other tracks in Play/Wait
  fn.notes.forEach(n => {
    if (n.played || n.t > fn.now) return;
    n.played = true;
    if (fn.mode === 'listen' || !isMine(n)) playVia(currentOutputs(n.n), n.n, n.v, ctx.currentTime + 0.01, n.d / sp);
  });
  if (fn.mode === 'play') fn.notes.forEach(n => { if (isMine(n) && !n.hit && !n.missed && n.t < fn.now - 0.3) { n.missed = true; fn.judged++; fnScore(); } });
  fnDraw();
  if (fn.now > fnEnd()) { fnStop(); fnScore(true); return; }
  fn.raf = requestAnimationFrame(fnLoop);
}
HOOKS.on.push(n => {
  if (!fn.notes.length || fn.mode === 'listen') return;
  if (fn.mode === 'wait' && fn.waitGroup) { const g = fn.waitGroup.find(x => x.n === n && !x.hit); if (g) g.hit = true; return; }
  if (fn.mode === 'play' && fn.playing) {
    const c = fn.notes.find(x => isMine(x) && !x.hit && !x.missed && x.n === n && Math.abs(x.t - fn.now) < 0.25);
    if (c) { c.hit = true; fn.hits++; fn.judged++; fnScore(); }
  }
});
function fnScore(done) {
  const mine = fn.notes.filter(isMine).length;
  $('fnScore').textContent = fn.mode === 'listen' ? 'Listening' :
    (fn.judged ? Math.round(fn.hits / fn.judged * 100) + '% · ' : '') + fn.hits + ' / ' + mine + ' notes' + (done ? ' · done! 🎉' : '');
}
function fnKeyX(n, W) {
  // white-key layout across lo..hi
  const whites = []; for (let k = fn.lo; k <= fn.hi; k++) if (![1, 3, 6, 8, 10].includes(pcOf(k))) whites.push(k);
  const ww = W / whites.length;
  const black = [1, 3, 6, 8, 10].includes(pcOf(n));
  const wi = whites.indexOf(black ? n - 1 : n);
  return black ? { x: (wi + 1) * ww - ww * 0.3, w: ww * 0.6, black } : { x: wi * ww, w: ww, black };
}
function fnDraw() {
  const cv = $('fnCanvas'); if (!cv) return;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b0a0d'; g.fillRect(0, 0, W, H);
  const kbH = 46, hitY = H - kbH, pps = 130;
  // lane guides at each C
  for (let k = fn.lo; k <= fn.hi; k++) if (pcOf(k) === 0) { const p = fnKeyX(k, W); g.fillStyle = '#1a171e'; g.fillRect(p.x, 0, 1, hitY); }
  fn.notes.forEach(nt => {
    if (nt.n < fn.lo || nt.n > fn.hi) return;
    const y2 = hitY - (nt.t - fn.now) * pps, y1 = y2 - nt.d * pps;
    if (y2 < 0 || y1 > hitY) return;
    const p = fnKeyX(nt.n, W), hue = pcOf(nt.n) * 30;
    g.fillStyle = nt.hit ? '#5fd38d' : nt.missed ? '#ff6f61' : !isMine(nt) ? '#4b4553' : `hsl(${hue},85%,${p.black ? 55 : 62}%)`;
    const r = Math.min(6, p.w / 3);
    g.beginPath(); g.roundRect ? g.roundRect(p.x + 1, y1, p.w - 2, Math.max(4, y2 - y1), r) : g.rect(p.x + 1, y1, p.w - 2, Math.max(4, y2 - y1)); g.fill();
  });
  g.fillStyle = '#ffb347'; g.fillRect(0, hitY - 2, W, 2);
  // mini keyboard
  const want = new Set((fn.waitGroup || []).filter(n => !n.hit).map(n => n.n));
  for (const pass of [false, true]) for (let k = fn.lo; k <= fn.hi; k++) {
    const p = fnKeyX(k, W); if (p.black !== pass) continue;
    g.fillStyle = rawHeld.has(k) ? '#ffb347' : want.has(k) ? '#5fd38d' : p.black ? '#111' : '#eee9df';
    g.fillRect(p.x + 0.5, hitY, p.w - 1, p.black ? kbH * 0.62 : kbH);
  }
  if (fn.mode === 'wait' && fn.waitGroup) { g.fillStyle = '#5fd38d'; g.font = '600 13px Space Grotesk, sans-serif'; g.fillText('Play the green keys', 8, 18); }
  if (!fn.notes.length) { g.fillStyle = '#a59fae'; g.font = '14px Space Grotesk, sans-serif'; g.fillText('Pick a song or load a MIDI file', 12, H / 2); }
}

/* ---------- ear training ---------- */
const ear = { mode: store.get('earMode', 'note'), q: null, score: 0, tries: 0, streak: 0, best: store.get('earBest', 0), answered: false };
const INTERVALS = [['m2', 1], ['M2', 2], ['m3', 3], ['M3', 4], ['P4', 5], ['Tritone', 6], ['P5', 7], ['m6', 8], ['M6', 9], ['m7', 10], ['M7', 11], ['Octave', 12]];
const EAR_CHORDS = [['Major', [0, 4, 7]], ['Minor', [0, 3, 7]], ['Diminished', [0, 3, 6]], ['Augmented', [0, 4, 8]], ['Dominant 7', [0, 4, 7, 10]], ['Major 7', [0, 4, 7, 11]], ['Minor 7', [0, 3, 7, 10]], ['Sus4', [0, 5, 7]]];
function earPlay() {
  if (!ear.q) return; initAudio();
  const t = ctx.currentTime + 0.05, q = ear.q;
  const outs = n => currentOutputs(n);
  if (ear.mode === 'note') playVia(outs(q.root), q.root, 0.8, t, 0.9, { quiet: true });
  else if (ear.mode === 'interval') { playVia(outs(q.root), q.root, 0.8, t, 0.7, { quiet: true }); playVia(outs(q.root + q.iv), q.root + q.iv, 0.8, t + 0.75, 0.7, { quiet: true }); }
  else q.ivs.forEach(iv => playVia(outs(q.root + iv), q.root + iv, 0.7, t, 1.4, { quiet: true }));
}
function earNext() {
  const root = 55 + Math.floor(Math.random() * 13);
  if (ear.mode === 'note') ear.q = { root };
  else if (ear.mode === 'interval') { const k = Math.floor(Math.random() * INTERVALS.length); ear.q = { root, iv: INTERVALS[k][1], ans: k }; }
  else { const k = Math.floor(Math.random() * EAR_CHORDS.length); ear.q = { root, ivs: EAR_CHORDS[k][1], ans: k }; }
  ear.answered = false; $('earMsg').textContent = ear.mode === 'note' ? 'Play the note you hear on the piano (any octave).' : 'Which one is it?';
  earAnswers(); earPlay();
}
function earJudge(ok, reveal) {
  if (ear.answered) return; ear.answered = true; ear.tries++;
  if (ok) { ear.score++; ear.streak++; if (ear.streak > ear.best) { ear.best = ear.streak; store.set('earBest', ear.best); } }
  else ear.streak = 0;
  $('earMsg').innerHTML = (ok ? '✅ Correct!' : '❌ It was <b>' + reveal + '</b>') + ' Tap Next.';
  $('earStats').textContent = ear.score + ' / ' + ear.tries + ' · streak ' + ear.streak + ' · best ' + ear.best;
}
function earAnswers() {
  const box = $('earAns'); box.innerHTML = '';
  if (ear.mode === 'note') return;
  const list = ear.mode === 'interval' ? INTERVALS : EAR_CHORDS;
  list.forEach(([name], i) => {
    const b = el(`<button>${name}</button>`);
    b.onclick = () => {
      if (!ear.q || ear.answered) return;
      const ok = i === ear.q.ans; b.classList.add(ok ? 'good' : 'bad');
      if (!ok) box.children[ear.q.ans].classList.add('good');
      earJudge(ok, list[ear.q.ans][0]);
    };
    box.appendChild(b);
  });
}
HOOKS.on.push(n => { if (ear.mode === 'note' && ear.q && !ear.answered && $('sec-learn') && !$('sec-learn').classList.contains('hide')) earJudge(pcOf(n) === pcOf(ear.q.root), NAMES[pcOf(ear.q.root)]); });

/* ---------- practice stats ---------- */
const stats = store.get('stats', { days: {} });
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
let statsSaveT;
HOOKS.on.push((n, v, fromPiano) => {
  const k = dayKey(), d = stats.days[k] || (stats.days[k] = { notes: 0, mins: 0, lastMin: 0 });
  d.notes++;
  const m = Math.floor(Date.now() / 60000); if (d.lastMin !== m) { d.mins++; d.lastMin = m; }
  clearTimeout(statsSaveT); statsSaveT = setTimeout(() => { store.set('stats', stats); statsUi(); }, 1500);
});
function streak() {
  let s = 0; const d = new Date();
  if (!stats.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (stats.days[dayKey(d)] && stats.days[dayKey(d)].notes > 0) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function statsUi() {
  if (!$('stToday')) return;
  const t = stats.days[dayKey()] || { notes: 0, mins: 0 };
  const total = Object.values(stats.days).reduce((a, d) => a + d.mins, 0);
  $('stToday').textContent = t.mins; $('stNotes').textContent = t.notes.toLocaleString(); $('stStreak').textContent = streak();
  $('stTotal').textContent = total >= 60 ? (total / 60).toFixed(1) + ' h' : total + ' min';
  const bars = $('stBars'); bars.innerHTML = '';
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(stats.days[dayKey(d)] || { mins: 0 }); }
  const max = Math.max(5, ...days.map(d => d.mins));
  days.forEach(d => { const b = document.createElement('div'); b.style.height = (d.mins / max * 100) + '%'; b.title = d.mins + ' min'; bars.appendChild(b); });
}

function buildLearnUi() {
  $('sec-learn').innerHTML = `
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Falling notes</p><span class="pill" id="fnScore">—</span></div>
    <p class="tip" style="margin:6px 0 8px" id="fnTitle">Pick a song or load a MIDI file.</p>
    <div class="ctl" style="margin-top:0"><span>Song</span><select id="fnSong"><option value="">Choose…</option>${SONGS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:4px"><label class="btn ghost sm" style="cursor:pointer">📂 Load MIDI file<input type="file" id="fnFile" accept=".mid,.midi,audio/midi" hidden></label></div>
    <div class="ctl hide" id="fnTrackRow"><span>I play</span><select id="fnTrack"></select></div>
    <canvas id="fnCanvas" style="height:300px;margin-top:10px"></canvas>
    <div class="row"><button class="btn" id="fnPlay">▶ Play</button><button class="btn ghost" id="fnRestart">⟲ Restart</button></div>
    <div class="ctl" style="margin-top:12px"><span>Mode</span><div class="seg2" id="fnMode"></div></div>
    <div class="ctl"><span>Speed</span><input type="range" id="fnSpeed" min="25" max="150" step="5"><span class="val" id="fnSpeedV"></span></div>
  </div>
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Ear training</p><span class="pill" id="earStats">0 / 0</span></div>
    <div class="ctl"><span>Game</span><div class="seg2" id="earMode"></div></div>
    <p class="tip" id="earMsg" style="margin:8px 0">Tap Start, listen, then answer.</p>
    <div class="row" style="margin-top:0"><button class="btn" id="earStart">▶ Start / Next</button><button class="btn ghost" id="earAgain">🔁 Hear again</button></div>
    <div class="answers" id="earAns"></div>
  </div>
  <div class="card">
    <p class="label">Practice stats</p>
    <div class="stat"><div><b id="stToday">0</b><small>min today</small></div><div><b id="stNotes">0</b><small>notes today</small></div><div><b id="stStreak">0</b><small>day streak 🔥</small></div><div><b id="stTotal">0</b><small>total</small></div></div>
    <div class="bars" id="stBars"></div>
    <p class="tip" style="margin:6px 0 0">Last 14 days, minutes played. Counted on this device.</p>
  </div>`;
  $('fnSong').onchange = e => { const s = SONGS[+e.target.value]; if (s) fnLoad(parseSong(s), s.name); };
  $('fnFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const { notes, names } = parseMidi(await f.arrayBuffer()); fnLoad(notes, f.name.replace(/\.midi?$/i, ''), names); $('fnSong').value = ''; }
    catch (err) { $('fnTitle').textContent = 'Couldn\'t read that file: ' + err.message; }
  };
  $('fnTrack').onchange = e => { fn.track = e.target.value; fnRestart(); };
  $('fnPlay').onclick = () => fn.playing ? fnStop() : fnStart();
  $('fnRestart').onclick = () => { fnRestart(); };
  segmented('fnMode', [['wait', 'Wait for me'], ['play', 'Play along'], ['listen', 'Listen']], fn.mode, v => { fn.mode = v; store.set('fnMode', v); fnRestart(); });
  $('fnSpeed').value = fn.speed; $('fnSpeedV').textContent = fn.speed + '%';
  $('fnSpeed').oninput = e => { fn.speed = +e.target.value; store.set('fnSpeed', fn.speed); $('fnSpeedV').textContent = fn.speed + '%'; fnDraw(); };
  segmented('earMode', [['note', 'Notes'], ['interval', 'Intervals'], ['chord', 'Chords']], ear.mode, v => { ear.mode = v; store.set('earMode', v); ear.q = null; earAnswers(); $('earMsg').textContent = 'Tap Start, listen, then answer.'; });
  $('earStart').onclick = earNext; $('earAgain').onclick = earPlay;
  $('earStats').textContent = '0 / 0 · best ' + ear.best;
  statsUi(); fnDraw(); fnScore();
}
buildLearnUi();
window.addEventListener('section', e => { if (e.detail === 'learn') { statsUi(); setTimeout(fnDraw, 0); } else fnStop(); });
window.addEventListener('resize', () => fnDraw());
