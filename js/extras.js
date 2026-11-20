/* FP-10 Instrument Box: visualizer, scenes, installable app */

/* ---------- visualizer ---------- */
const viz = { open: false, parts: [], rings: [], raf: 0, last: 0 };
vizNote = (n, vel) => {
  if (!viz.open) return;
  const W = $('vizCanvas').clientWidth, H = $('vizCanvas').clientHeight;
  const x = (clamp(n, 21, 108) - 21) / 87 * W * 0.9 + W * 0.05, hue = pcOf(n) * 30, cnt = 18 + Math.round(vel * 40);
  for (let i = 0; i < cnt; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 2 + Math.random() * 7 * (0.5 + vel);
    viz.parts.push({ x, y: H * 0.82, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: hue + (Math.random() - 0.5) * 30, r: 1.5 + Math.random() * 3.5 * vel });
  }
  viz.rings.push({ x, y: H * 0.82, r: 6, life: 1, hue });
  if (viz.parts.length > 2500) viz.parts.splice(0, viz.parts.length - 2500);
};
function vizLoop(ts) {
  if (!viz.open) return;
  const cv = $('vizCanvas'), W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = 'rgba(8,6,12,0.22)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  viz.rings = viz.rings.filter(r => {
    r.r += 6; r.life -= 0.025;
    g.strokeStyle = `hsla(${r.hue},90%,60%,${Math.max(0, r.life) * 0.6})`; g.lineWidth = 3;
    g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke();
    return r.life > 0;
  });
  viz.parts = viz.parts.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.99; p.life -= 0.012;
    g.fillStyle = `hsla(${p.hue},95%,${55 + p.life * 20}%,${Math.max(0, p.life)})`;
    g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + p.life), 0, Math.PI * 2); g.fill();
    return p.life > 0 && p.y < H + 20;
  });
  g.globalCompositeOperation = 'source-over';
  // glowing key strip for held notes
  held.forEach(n => {
    const x = (clamp(n, 21, 108) - 21) / 87 * W * 0.9 + W * 0.05;
    const gr = g.createRadialGradient(x, H * 0.82, 0, x, H * 0.82, 60);
    gr.addColorStop(0, `hsla(${pcOf(n) * 30},90%,65%,0.5)`); gr.addColorStop(1, 'transparent');
    g.fillStyle = gr; g.fillRect(x - 60, H * 0.82 - 60, 120, 120);
  });
  viz.raf = requestAnimationFrame(vizLoop);
}
function vizOpen() {
  viz.open = true; $('viz').classList.remove('hide');
  try { $('viz').requestFullscreen && $('viz').requestFullscreen().catch(() => {}); } catch (e) {}
  updateNotes(); cancelAnimationFrame(viz.raf); viz.raf = requestAnimationFrame(vizLoop);
}
function vizClose() {
  viz.open = false; $('viz').classList.add('hide'); cancelAnimationFrame(viz.raf);
  try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {}
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && viz.open) vizClose(); });

/* ---------- scenes ---------- */
const DEFAULT_SCENES = [
  { name: '👽 Theremin + strings', s: { mode: 'gm2', gmSource: 'samples', gmSel: { cat: 'Cool Synths', idx: 0 }, layer2: { cat: 'Ensemble', idx: 0 }, balance: 60, layerMode: 'layer', fx: { dist: 0, chorus: 30, cutoff: 100, reso: 1, sweep: false, delay: 30, dTime: '8d', fb: 40 } } },
  { name: '🌙 Lo-fi keys', s: { mode: 'gm2', gmSource: 'samples', gmSel: { cat: 'Piano', idx: 4 }, layer2: null, fx: { dist: 8, chorus: 35, cutoff: 62, reso: 1, sweep: false, delay: 20, dTime: '8', fb: 30 }, band: { style: 'lofi', bpm: 76, out: 'phone', parts: { drums: true, bass: true, keys: false } } } },
  { name: '🎸 Rock band', s: { mode: 'gm2', gmSource: 'samples', gmSel: { cat: 'Guitar', idx: 6 }, layer2: null, fx: { dist: 35, chorus: 0, cutoff: 100, reso: 1, sweep: false, delay: 10, dTime: '8', fb: 25 }, band: { style: 'rock', bpm: 120, out: 'phone', parts: { drums: true, bass: true, keys: false } } } },
  { name: '🎹 Piano + bass split', s: { mode: 'gm2', gmSource: 'samples', gmSel: { cat: 'Pro', idx: 0 }, layer2: { cat: 'Pro', idx: 4 }, layerMode: 'split', splitPoint: 55, balance: 50 } },
  { name: '⚡ Supersaw anthem', s: { mode: 'gm2', gmSource: 'samples', gmSel: { cat: 'Cool Synths', idx: 1 }, layer2: { cat: 'Cool Synths', idx: 2 }, layerMode: 'split', splitPoint: 48, fx: { dist: 0, chorus: 20, cutoff: 80, reso: 4, sweep: true, delay: 25, dTime: '8d', fb: 45 }, band: { style: 'edm', bpm: 126, out: 'phone', parts: { drums: true, bass: false, keys: false } } } }
];
let scenes = store.get('scenes', null) || DEFAULT_SCENES;
let sceneEdit = false;
function snapshot() {
  return { mode, pianoTone, gmSource, gmSel: { ...gmSel }, layer2: layer2 ? { ...layer2 } : null, balance, layerMode, splitPoint, current, split, octave,
    transpose, tuneHz, pvol, revType, fx: { ...fxSet }, chordMode, scaleKey, scaleType,
    arp: { on: arp.on, pattern: arp.pattern, rate: arp.rate, octs: arp.octs },
    band: { style: band.style, bpm: T.bpm, out: band.out, parts: { ...band.parts }, split: band.split } };
}
function applyScene(s) {
  initAudio(); allOff();
  if (s.gmSource && s.gmSource !== gmSource) setSource(s.gmSource, true);
  if (s.gmSel) { gmSel = { ...s.gmSel }; store.set('gm', gmSel); }
  if ('layer2' in s) { layer2 = s.layer2 ? { ...s.layer2 } : null; store.set('l2', layer2); }
  if (s.balance !== undefined) { balance = s.balance; store.set('bal', balance); $('bal').value = balance; }
  if (s.layerMode) { layerMode = s.layerMode; store.set('layerMode', layerMode); setSeg('lmode', layerMode); }
  if (s.splitPoint) { splitPoint = s.splitPoint; store.set('splitPoint', splitPoint); }
  if (s.pianoTone !== undefined) { pianoTone = s.pianoTone; store.set('ptone', pianoTone); selIn($('pianoGrid'), pianoTone); }
  if (s.current && INST[s.current]) { current = s.current; store.set('inst', current); document.querySelectorAll('#grid .inst').forEach(x => x.classList.toggle('sel', x.dataset.k === current)); }
  if (s.transpose !== undefined) { transpose = s.transpose; store.set('tr', transpose); }
  if (s.tuneHz) { tuneHz = s.tuneHz; store.set('tune', tuneHz); }
  if (s.pvol !== undefined) { pvol = s.pvol; store.set('pvol', pvol); }
  if (s.revType !== undefined) { revType = s.revType; store.set('rev', revType); }
  if (s.fx) { Object.assign(fxSet, s.fx); store.set('fx', fxSet); applyFx(); buildStudioUi(); }
  if (s.chordMode) { chordMode = s.chordMode; store.set('chordMode', chordMode); setSeg('cMode', chordMode); }
  if (s.scaleType) { scaleKey = s.scaleKey || 0; scaleType = s.scaleType; store.set('scaleKey', scaleKey); store.set('scaleType', scaleType); $('scKey').value = scaleKey; $('scType').value = scaleType; paintScale(); }
  if (s.arp) { Object.assign(arp, s.arp); $('aOn').classList.toggle('on', arp.on); setSeg('aPat', arp.pattern); setSeg('aRate', arp.rate); setSeg('aOct', arp.octs); }
  if (s.band) {
    if (band.on) bandStop();
    band.style = s.band.style || band.style; band.out = s.band.out || band.out; if (s.band.parts) band.parts = { ...s.band.parts }; if (s.band.split) band.split = s.band.split;
    store.set('bStyle', band.style); store.set('bOut', band.out); store.set('bParts', band.parts); store.set('bSplit', band.split);
    if (s.band.bpm) setBpm(s.band.bpm);
    buildBandUi();
  }
  ensureLayerBus(); applyBalance();
  setMode(s.mode || mode, true);
  if (window.renderGm) renderGm();
  showSettings(); if (isConnected()) sendAllSettings();
  loadSamples(); updateWhere();
}
function scenesUi() {
  const box = $('scList'); box.innerHTML = '';
  scenes.forEach((sc, i) => {
    const b = el(`<button class="scene">${sc.name}${sceneEdit ? '<span class="x">✕</span>' : ''}</button>`);
    b.onclick = () => {
      if (sceneEdit) { scenes.splice(i, 1); store.set('scenes', scenes); scenesUi(); return; }
      applyScene(sc.s);
      $('scMsg').textContent = 'Loaded: ' + sc.name;
    };
    box.appendChild(b);
  });
  $('scEdit').textContent = sceneEdit ? 'Done' : 'Edit';
}
function buildScenesUi() {
  $('sec-sounds').insertAdjacentElement('afterbegin', el(`<div class="card">
    <div class="hdr"><p class="label" style="margin:0">⭐ Scenes</p><button class="btn ghost sm" id="scEdit">Edit</button></div>
    <p class="tip" id="scMsg" style="margin:6px 0 8px">One tap loads a whole setup: sounds, layers, effects and band.</p>
    <div id="scList"></div>
    <div class="row" style="margin-top:6px"><input type="text" id="scName" placeholder="Name for your current setup" maxlength="40"><button class="btn sm" id="scSave">Save</button></div>
  </div>`));
  $('scEdit').onclick = () => { sceneEdit = !sceneEdit; scenesUi(); };
  $('scSave').onclick = () => {
    const name = $('scName').value.trim() || 'Scene ' + (scenes.length + 1);
    scenes.push({ name, s: snapshot() }); store.set('scenes', scenes); $('scName').value = ''; scenesUi();
    $('scMsg').textContent = 'Saved: ' + name;
  };
  scenesUi();
}

/* ---------- header buttons, visualizer overlay, installable app ---------- */
function buildExtrasUi() {
  document.head.appendChild(el(`<style>
  .viz{position:fixed;inset:0;z-index:60;background:#08060c}
  .viz canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:0;background:transparent}
  .viz .vchord{position:absolute;top:12%;width:100%;text-align:center;font-size:clamp(40px,10vw,110px);font-weight:700;color:#fff;text-shadow:0 0 30px rgba(255,179,71,.7);pointer-events:none}
  .viz .vclose{position:absolute;top:14px;right:14px;z-index:2}
  .topbar{display:flex;gap:8px;align-items:center;justify-content:space-between}
  </style>`));
  const h1 = document.querySelector('h1');
  const bar = el('<div class="topbar"></div>'); h1.parentNode.insertBefore(bar, h1); bar.appendChild(h1);
  const btns = el('<div style="display:flex;gap:6px"><button class="btn ghost sm hide" id="installBtn">📲 Install</button><button class="btn sm" id="vizBtn">✨ Visualizer</button></div>');
  bar.appendChild(btns);
  document.body.appendChild(el(`<div class="viz hide" id="viz"><canvas id="vizCanvas"></canvas><div class="vchord" id="vizChord"></div><button class="btn ghost sm vclose" id="vizClose">✕ Close</button></div>`));
  $('vizBtn').onclick = () => { initAudio(); vizOpen(); };
  $('vizClose').onclick = vizClose;
  // the visualizer also reacts to the band and looper
  const _pv = playVia;
  playVia = function (outs, n, vel, t, dur, opts = {}) {
    if (viz.open && opts.quiet) setTimeout(() => vizNote(n, vel * 0.6), Math.max(0, (t - ctx.currentTime) * 1000));
    return _pv(outs, n, vel, t, dur, opts);
  };
  // install as an app
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
  $('installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); };
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
buildExtrasUi();
buildScenesUi();
