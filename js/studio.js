/* FP-10 Instrument Box: effects, looper, recorder */

/* ---------- effects (phone/PC sounds only) ---------- */
const fxSet = store.get('fx', { dist: 0, chorus: 0, cutoff: 100, reso: 1, sweep: false, delay: 0, dTime: '8', fb: 35 });
const fx = {};
function buildFx(input) {
  const g = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
  // distortion (parallel dry/wet)
  fx.dist = ctx.createWaveShaper(); fx.dist.oversample = '2x';
  fx.distDry = g(1); fx.distWet = g(0);
  const m1 = g(1);
  input.connect(fx.distDry); input.connect(fx.dist); fx.dist.connect(fx.distWet);
  fx.distDry.connect(m1); fx.distWet.connect(m1);
  // chorus
  fx.chDelay = ctx.createDelay(0.05); fx.chDelay.delayTime.value = 0.018;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; const lg = g(0.004); lfo.connect(lg); lg.connect(fx.chDelay.delayTime); lfo.start();
  fx.chWet = g(0);
  const m2 = g(1);
  m1.connect(m2); m1.connect(fx.chDelay); fx.chDelay.connect(fx.chWet); fx.chWet.connect(m2);
  // filter with optional auto-sweep
  fx.filt = ctx.createBiquadFilter(); fx.filt.type = 'lowpass';
  fx.sweepLfo = ctx.createOscillator(); fx.sweepLfo.frequency.value = 0.25; fx.sweepGain = g(0);
  fx.sweepLfo.connect(fx.sweepGain); fx.sweepGain.connect(fx.filt.frequency); fx.sweepLfo.start();
  m2.connect(fx.filt);
  // delay
  fx.dl = ctx.createDelay(2); fx.fb = g(0.35); fx.dlWet = g(0);
  const out = g(1);
  fx.filt.connect(out); fx.filt.connect(fx.dl); fx.dl.connect(fx.fb); fx.fb.connect(fx.dl); fx.dl.connect(fx.dlWet); fx.dlWet.connect(out);
  applyFx();
  return out;
}
function distCurve(amount) {
  const k = amount * 4, c = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; c[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k); }
  return c;
}
function applyFx() {
  if (!fx.dist) return;
  const t = ctx.currentTime, s = fxSet;
  fx.dist.curve = distCurve(s.dist / 10);
  fx.distWet.gain.setTargetAtTime(s.dist / 100 * 0.8, t, 0.02);
  fx.distDry.gain.setTargetAtTime(1 - s.dist / 100 * 0.6, t, 0.02);
  fx.chWet.gain.setTargetAtTime(s.chorus / 100 * 0.8, t, 0.02);
  const cut = 120 * Math.pow(160, s.cutoff / 100);
  fx.filt.frequency.setTargetAtTime(Math.min(cut, 19000), t, 0.03);
  fx.filt.Q.setTargetAtTime(s.reso, t, 0.03);
  fx.sweepGain.gain.setTargetAtTime(s.sweep ? Math.min(cut * 0.8, 4000) : 0, t, 0.05);
  const beat = 60 / T.bpm, dt = { '16': beat / 4, '8': beat / 2, '8d': beat * 0.75, '4': beat }[s.dTime] || beat / 2;
  fx.dl.delayTime.setTargetAtTime(Math.min(1.9, dt), t, 0.05);
  fx.fb.gain.setTargetAtTime(s.fb / 100 * 0.85, t, 0.02);
  fx.dlWet.gain.setTargetAtTime(s.delay / 100 * 0.7, t, 0.02);
}
// re-time the delay when the tempo changes
const _setBpmFx = setBpm;
setBpm = function (v) { _setBpmFx(v); applyFx(); };

/* ---------- looper ---------- */
const looper = { bars: store.get('loopBars', 2), state: 'empty', takes: [], cur: null, startStep: 0, recFrom: 0, click: store.get('loopClick', true), open: new Map() };
const loopLen = () => looper.bars * 16;
CAPTURE.push({
  active: () => looper.state === 'rec' || looper.state === 'overdub',
  on(n, vel, outs) {
    const pos = ((stepAt(ctx.currentTime) - looper.startStep) % loopLen() + loopLen()) % loopLen();
    const ev = { pos, n, vel, outs, dur: 1 };
    looper.cur.push(ev); looper.open.set(n, { ev, from: stepAt(ctx.currentTime) });
  },
  off(n) {
    const o = looper.open.get(n); if (!o) return;
    o.ev.dur = clamp(stepAt(ctx.currentTime) - o.from, 0.25, loopLen()); looper.open.delete(n);
  },
  sched(n, vel, t, dur, outs) {
    const pos = ((stepAt(t) - looper.startStep) % loopLen() + loopLen()) % loopLen();
    looper.cur.push({ pos, n, vel, outs, dur: dur / stepDur() });
  }
});
function click(t, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = accent ? 1760 : 1200; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
}
STEP_LISTENERS.push((s, t) => {
  if (looper.state === 'empty' || looper.state === 'stopped') return;
  if (looper.state === 'count') {
    if (s % 4 === 0) click(t, s % 16 === 0);
    if (s >= looper.recFrom) { looper.state = 'rec'; looper.startStep = looper.recFrom; loopUi(); }
    else return;
  }
  const rel = s - looper.startStep; if (rel < 0) return;
  const pos = rel % loopLen();
  if (looper.click && s % 4 === 0) click(t, pos === 0);
  // finish first take after one full pass
  if (looper.state === 'rec' && rel > 0 && pos === 0) { looper.takes.push(looper.cur); looper.cur = null; looper.open.clear(); looper.state = 'play'; loopUi(); }
  if (pos === 0 && looper.state === 'overdub' && looper.cur && looper.cur.length && rel > 0) { /* keep overdubbing into the same take */ }
  const sd = stepDur();
  const playTakes = looper.state === 'overdub' ? [...looper.takes] : looper.takes;
  playTakes.forEach(take => take.forEach(ev => {
    if (Math.floor(ev.pos) !== pos) return;
    playVia(ev.outs, ev.n, ev.vel, t + (ev.pos - pos) * sd, ev.dur * sd);
  }));
  if (pos === 0) { const p = $('lPos'); if (p) p.textContent = 'Loop ' + (Math.floor(rel / loopLen()) + 1); }
});
function loopRecord() {
  initAudio();
  if (looper.state === 'empty') {
    looper.cur = []; looper.takes = [];
    if (!T.running) { transportNeed('looper', true); looper.recFrom = 16; looper.state = 'count'; }
    else { T.users.add('looper'); looper.recFrom = Math.ceil((T.step + 1) / 16) * 16; looper.state = 'count'; }
  } else if (looper.state === 'play' || looper.state === 'stopped') {
    if (looper.state === 'stopped') loopPlay();
    looper.cur = []; looper.takes.push(looper.cur); looper.state = 'overdub';
  } else if (looper.state === 'overdub') {
    if (!looper.cur.length) looper.takes.pop();
    looper.cur = null; looper.open.clear(); looper.state = 'play';
  } else if (looper.state === 'rec' || looper.state === 'count') {
    loopClear(); return;
  }
  loopUi();
}
function loopPlay() {
  if (looper.state === 'stopped') {
    if (!T.running) transportNeed('looper', true); else T.users.add('looper');
    looper.startStep = Math.ceil(T.step / 16) * 16; looper.state = 'play';
  } else if (looper.state === 'play' || looper.state === 'overdub') {
    if (looper.state === 'overdub') { if (!looper.cur.length) looper.takes.pop(); looper.cur = null; }
    looper.state = 'stopped'; transportNeed('looper', false);
  }
  loopUi();
}
function loopUndo() { if (looper.state === 'overdub') return; looper.takes.pop(); if (!looper.takes.length) loopClear(); loopUi(); }
function loopClear() { looper.state = 'empty'; looper.takes = []; looper.cur = null; looper.open.clear(); transportNeed('looper', false); loopUi(); }
function loopUi() {
  const st = looper.state, b = $('lRec');
  b.textContent = { empty: '● Record', count: 'Get ready… (tap to cancel)', rec: '● Recording… (tap to cancel)', play: '＋ Overdub', overdub: '✓ Done overdubbing', stopped: '＋ Overdub' }[st];
  b.classList.toggle('red', st === 'rec' || st === 'overdub' || st === 'count');
  $('lPlay').textContent = st === 'stopped' ? '▶ Play' : '■ Stop';
  $('lPlay').disabled = st === 'empty' || st === 'count' || st === 'rec';
  $('lState').textContent = { empty: 'Empty', count: 'Count-in', rec: 'Recording', play: 'Playing', overdub: 'Overdubbing', stopped: 'Stopped' }[st] + (looper.takes.length ? ' · ' + looper.takes.length + ' layer' + (looper.takes.length > 1 ? 's' : '') : '');
  $('lState').className = 'pill' + (st === 'rec' || st === 'overdub' || st === 'count' ? ' rec' : st === 'play' ? ' on' : '');
}

/* ---------- recorder ---------- */
const rec = { on: false, t0: 0, events: [], open: new Map(), media: null, chunks: [], audioBlob: null, wantAudio: store.get('recAudio', true), play: null };
CAPTURE.push({
  active: () => rec.on,
  on(n, vel, outs) { const ev = { t: ctx.currentTime - rec.t0, n, vel, outs, d: 0.3 }; rec.events.push(ev); rec.open.set(n, ev); },
  off(n) { const ev = rec.open.get(n); if (ev) { ev.d = Math.max(0.03, ctx.currentTime - rec.t0 - ev.t); rec.open.delete(n); } },
  sched(n, vel, t, dur, outs) { rec.events.push({ t: t - rec.t0, n, vel, outs, d: dur }); }
});
function recStart() {
  initAudio(); recPlayStop();
  rec.events = []; rec.open.clear(); rec.audioBlob = null; rec.t0 = ctx.currentTime; rec.on = true;
  if (rec.wantAudio && window.MediaRecorder) {
    try {
      if (!rec.dest) { rec.dest = ctx.createMediaStreamDestination(); master.connect(rec.dest); }
      rec.chunks = [];
      rec.media = new MediaRecorder(rec.dest.stream);
      rec.media.ondataavailable = e => e.data.size && rec.chunks.push(e.data);
      rec.media.onstop = () => { rec.audioBlob = new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' }); recUi(); };
      rec.media.start();
    } catch (e) { rec.media = null; }
  }
  recUi(); recTimer();
}
function recStop() {
  rec.on = false;
  rec.open.forEach(ev => ev.d = Math.max(0.05, ctx.currentTime - rec.t0 - ev.t)); rec.open.clear();
  rec.events.sort((a, b) => a.t - b.t);
  if (rec.media && rec.media.state !== 'inactive') rec.media.stop();
  recUi();
}
function recTimer() {
  if (!rec.on) return;
  const s = ctx.currentTime - rec.t0;
  $('rTime').textContent = Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  setTimeout(recTimer, 250);
}
function recPlay() {
  if (!rec.events.length) return;
  recPlayStop();
  const start = ctx.currentTime + 0.15, evs = rec.events; let i = 0;
  const p = { voices: [], timer: null };
  p.timer = setInterval(() => {
    const horizon = ctx.currentTime + 0.2;
    while (i < evs.length && start + evs[i].t < horizon) {
      const e = evs[i++]; p.voices.push(...playVia(e.outs, e.n, e.vel, start + e.t, e.d));
    }
    if (i >= evs.length && ctx.currentTime > start + evs[evs.length - 1].t + evs[evs.length - 1].d + 0.5) recPlayStop();
  }, 50);
  rec.play = p; recUi();
}
function recPlayStop() {
  if (!rec.play) return;
  clearInterval(rec.play.timer); rec.play.voices.forEach(v => { try { v.kill && v.kill(); } catch (e) {} });
  cc(PANEL_CH, 123, 0); cc(GM_CH, 123, 0);
  rec.play = null; recUi();
}
function midiFile(events, bpm) {
  const ppq = 480, tps = ppq * bpm / 60, msgs = [];
  events.forEach(e => { msgs.push([Math.round(e.t * tps), 0x90, e.n, clamp(Math.round(e.vel * 127), 1, 127)]); msgs.push([Math.round((e.t + e.d) * tps), 0x80, e.n, 0]); });
  msgs.sort((a, b) => a[0] - b[0] || (a[1] === 0x80 ? -1 : 1));
  const vlq = v => { const b = [v & 0x7f]; while (v >>= 7) b.unshift((v & 0x7f) | 0x80); return b; };
  const us = Math.round(60e6 / bpm), trk = [0, 0xFF, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
  let last = 0;
  msgs.forEach(([tk, st, a, b]) => { trk.push(...vlq(tk - last), st, a, b); last = tk; });
  trk.push(0, 0xFF, 0x2F, 0);
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  return new Uint8Array([0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255, 0x4D, 0x54, 0x72, 0x6B, ...u32(trk.length), ...trk]);
}
function recUi() {
  $('rRec').textContent = rec.on ? '■ Stop recording' : '● Record';
  $('rRec').classList.toggle('red', rec.on);
  $('rState').className = 'pill' + (rec.on ? ' rec' : rec.events.length ? ' on' : '');
  $('rState').textContent = rec.on ? 'Recording' : rec.events.length ? rec.events.length + ' notes' : 'Nothing yet';
  const has = !rec.on && rec.events.length > 0;
  $('rPlay').disabled = !has; $('rMidi').disabled = !has;
  $('rPlay').textContent = rec.play ? '■ Stop' : '▶ Play back';
  $('rWav').disabled = rec.on || !rec.audioBlob;
}

function buildStudioUi() {
  $('sec-studio').innerHTML = `
  <div class="card">
    <p class="label">Effects</p>
    <p class="tip" style="margin:0 0 8px">For sounds from your phone or PC (All sounds, Pro, Cool Synths, Phone synth). The piano's own speakers can't take effects.</p>
    <div class="ctl"><span>Distortion</span><input type="range" id="fxDist" min="0" max="100"></div>
    <div class="ctl"><span>Chorus</span><input type="range" id="fxChorus" min="0" max="100"></div>
    <div class="ctl"><span>Filter</span><input type="range" id="fxCut" min="0" max="100"></div>
    <div class="ctl"><span>Resonance</span><input type="range" id="fxReso" min="0.5" max="18" step="0.5"></div>
    <div class="toggle"><div>Filter sweep<small>Slowly opens and closes the filter</small></div><div class="sw" id="fxSweep"></div></div>
    <div class="ctl"><span>Delay</span><input type="range" id="fxDelay" min="0" max="100"></div>
    <div class="ctl"><span>Echo time</span><div class="seg2" id="fxTime"></div></div>
    <div class="ctl"><span>Echoes</span><input type="range" id="fxFb" min="0" max="95"></div>
    <div class="row"><button class="btn ghost sm" id="fxReset">Reset effects</button></div>
  </div>
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Looper</p><span class="pill" id="lState">Empty</span></div>
    <p class="tip" style="margin:6px 0 10px">Record a part, it repeats, then overdub more on top. You get a 1-bar count-in. Uses the band tempo.</p>
    <div class="row" style="margin-top:0"><button class="btn" id="lRec">● Record</button><button class="btn ghost" id="lPlay">■ Stop</button></div>
    <div class="row"><button class="btn ghost sm" id="lUndo">↶ Undo layer</button><button class="btn ghost sm" id="lClear">🗑 Clear</button><span class="pill" id="lPos"></span></div>
    <div class="ctl" style="margin-top:12px"><span>Length</span><div class="seg2" id="lBars"></div></div>
    <div class="ctl"><span>Tempo</span><input type="range" class="bpmRange" min="40" max="240"><span class="val"><span class="bpmVal"></span> bpm</span></div>
    <div class="toggle"><div>Click track</div><div class="sw" id="lClick"></div></div>
  </div>
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Recorder</p><span class="pill" id="rState">Nothing yet</span></div>
    <p class="tip" style="margin:6px 0 10px">Record what you play, play it back through the same sounds, and save it. Audio files only contain phone/PC sounds, because the piano's own speakers can't be recorded from here.</p>
    <div class="row" style="margin-top:0"><button class="btn" id="rRec">● Record</button><span class="big" id="rTime" style="font-size:22px">0:00</span></div>
    <div class="row"><button class="btn ghost sm" id="rPlay">▶ Play back</button><button class="btn ghost sm" id="rMidi">💾 Save MIDI</button><button class="btn ghost sm" id="rWav">💾 Save audio</button></div>
    <div class="toggle"><div>Also record audio<small>Phone/PC sounds only</small></div><div class="sw" id="rAudio"></div></div>
  </div>`;
  const bind = (id, key, num = true) => { $(id).value = fxSet[key]; $(id).oninput = e => { fxSet[key] = num ? +e.target.value : e.target.value; store.set('fx', fxSet); applyFx(); }; };
  bind('fxDist', 'dist'); bind('fxChorus', 'chorus'); bind('fxCut', 'cutoff'); bind('fxReso', 'reso'); bind('fxDelay', 'delay'); bind('fxFb', 'fb');
  $('fxSweep').classList.toggle('on', fxSet.sweep);
  $('fxSweep').onclick = () => { fxSet.sweep = !fxSet.sweep; $('fxSweep').classList.toggle('on', fxSet.sweep); store.set('fx', fxSet); applyFx(); };
  segmented('fxTime', [['16', '1/16'], ['8', '1/8'], ['8d', '1/8 dotted'], ['4', '1/4']], fxSet.dTime, v => { fxSet.dTime = v; store.set('fx', fxSet); applyFx(); });
  $('fxReset').onclick = () => { Object.assign(fxSet, { dist: 0, chorus: 0, cutoff: 100, reso: 1, sweep: false, delay: 0, dTime: '8', fb: 35 }); store.set('fx', fxSet); applyFx(); buildStudioUi(); };

  $('lRec').onclick = loopRecord; $('lPlay').onclick = loopPlay; $('lUndo').onclick = loopUndo; $('lClear').onclick = loopClear;
  segmented('lBars', [[1, '1 bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars']], looper.bars, v => { if (looper.state === 'empty') { looper.bars = +v; store.set('loopBars', +v); } else setSeg('lBars', looper.bars); });
  $('lClick').classList.toggle('on', looper.click);
  $('lClick').onclick = () => { looper.click = !looper.click; store.set('loopClick', looper.click); $('lClick').classList.toggle('on', looper.click); };
  document.querySelectorAll('#sec-studio .bpmRange').forEach(r => r.oninput = e => setBpm(+e.target.value));
  setBpm(T.bpm);
  loopUi();

  $('rRec').onclick = () => rec.on ? recStop() : recStart();
  $('rPlay').onclick = () => rec.play ? recPlayStop() : recPlay();
  $('rMidi').onclick = () => download('fp10-recording.mid', new Blob([midiFile(rec.events, T.bpm)], { type: 'audio/midi' }));
  $('rWav').onclick = () => { if (rec.audioBlob) download('fp10-recording.' + (rec.audioBlob.type.includes('ogg') ? 'ogg' : rec.audioBlob.type.includes('mp4') ? 'm4a' : 'webm'), rec.audioBlob); };
  $('rAudio').classList.toggle('on', rec.wantAudio);
  $('rAudio').onclick = () => { rec.wantAudio = !rec.wantAudio; store.set('recAudio', rec.wantAudio); $('rAudio').classList.toggle('on', rec.wantAudio); };
  recUi();
}
buildStudioUi();
