/* FP-10 Instrument Box: backing band (auto-accompaniment + drum grooves), chord & arpeggio modes */

// drum voices: p = note for the app's drum kit, g = General MIDI drum note (piano speakers)
const KIT = { K: { p: 36, g: 36 }, R: { p: 37, g: 37 }, S: { p: 38, g: 38 }, C: { p: 39, g: 39 }, L: { p: 41, g: 41 }, H: { p: 42, g: 42 },
  M: { p: 43, g: 45 }, P: { p: 44, g: 44 }, T: { p: 45, g: 48 }, O: { p: 46, g: 46 }, X: { p: 47, g: 49 } };
// bass: [step, interval, length in 16ths]; keys: [step, length]; drums: 16-step strings (x hit, X accent, o ghost)
const STYLES = {
  pop: { name: 'Pop', bpm: 100, drums: { K: 'x.....x.x.......', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 0, 3], [6, 0, 2], [8, 0, 3], [12, 7, 2], [14, 12, 2]], bassProg: 33, keysProg: 0, keys: [[0, 5], [6, 2], [8, 5], [14, 2]] },
  rock: { name: 'Rock', bpm: 120, drums: { K: 'x.......x.x.....', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 0, 2]], bassProg: 34, keysProg: 30, power: true,
    keys: [[0, 6], [6, 2], [8, 6], [14, 2]] },
  hiphop: { name: 'Hip-Hop', bpm: 88, swing: 0.3, drums: { K: 'x......x..x.....', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 0, 6], [7, 0, 2], [10, 7, 4]], bassProg: 38, keysProg: 4, keys: [[0, 8], [10, 6]] },
  lofi: { name: 'Lo-fi', bpm: 76, swing: 0.25, drums: { K: 'x.........x.....', S: '....x.......x..o', H: 'x.xox.x.x.xox.x.' },
    bass: [[0, 0, 7], [10, 7, 6]], bassProg: 32, keysProg: 4, keys: [[0, 7], [7, 1], [10, 6]] },
  bossa: { name: 'Bossa Nova', bpm: 130, drums: { K: 'x..xx..xx..xx..x', R: 'x..x..x...x..x..', H: 'o.o.o.o.o.o.o.o.' },
    bass: [[0, 0, 3], [3, 7, 1], [4, 7, 4], [8, 0, 3], [11, 7, 1], [12, 7, 4]], bassProg: 32, keysProg: 24, keys: [[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]] },
  ballad: { name: 'Ballad', bpm: 72, drums: { K: 'x.......x.......', S: '....x.......x...', H: 'o.o.o.o.o.o.o.o.' },
    bass: [[0, 0, 8], [8, 7, 8]], bassProg: 33, keysProg: 48, keys: [[0, 16]] },
  reggaeton: { name: 'Reggaeton', bpm: 95, drums: { K: 'x...x...x...x...', C: '...x..x....x..x.', H: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 0, 3], [3, 0, 1], [6, 0, 2], [8, 0, 3], [11, 0, 1], [14, 0, 2]], bassProg: 38, keysProg: 81, keys: [[0, 1], [3, 1], [6, 1], [8, 1], [11, 1], [14, 1]] },
  funk: { name: 'Funk', bpm: 104, drums: { K: 'x.....x...x..x..', S: '....x..o.o..x..o', H: 'xoxoxoxoxoxoxoxo' },
    bass: [[0, 0, 1], [3, 12, 1], [6, 0, 1], [7, 0, 1], [10, 7, 1], [13, 12, 1], [14, 10, 1]], bassProg: 36, keysProg: 27, keys: [[2, 1], [6, 1], [10, 1], [14, 1]] },
  disco: { name: 'Disco', bpm: 118, drums: { K: 'x...x...x...x...', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '..x...x...x...x.' },
    bass: [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 12, 1]], bassProg: 33, keysProg: 48, keys: [[2, 1], [6, 1], [10, 1], [14, 1]] },
  edm: { name: 'EDM', bpm: 126, drums: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.' },
    bass: [[2, 0, 1], [6, 0, 1], [10, 0, 1], [14, 0, 1]], bassProg: 38, keysProg: 90, keys: [[0, 16]] },
  metronome: { name: 'Click only', bpm: 100, drums: { R: 'x...x...x...x...' }, bass: [], keys: [] }
};
const FILL = { K: 'x...............', S: '....x.x.xxxx....', T: '............xx..', M: '..............x.', L: '...............x' };

const band = { on: false, waiting: false, style: store.get('bStyle', 'pop'), out: store.get('bOut', 'phone'), vol: store.get('bVol', 80),
  parts: store.get('bParts', { drums: true, bass: true, keys: true }), split: store.get('bSplit', 60), muteLeft: store.get('bMute', false),
  chord: { root: 0, ivs: [0, 4, 7], name: 'C' }, startStep: 0, fillBar: -1, crash: false, bus: null, packs: {} };

function bandBus() {
  if (!band.bus) { band.bus = gain(band.vol / 100); band.bus.connect(master); band.bus.connect(revGain); }
  return band.bus;
}
function bandPhoneInst(prog, fallback) {
  const set = band.packs[prog];
  return set ? makeSampler(set) : INST[fallback];
}
async function bandLoadSounds() {
  const st = STYLES[band.style];
  for (const p of [st.bassProg, st.keysProg]) {
    if (p === undefined || band.packs[p]) continue;
    try { band.packs[p] = await loadPack('sf2/' + p + '.bin'); } catch (e) { /* synth fallback */ }
  }
}
function bandPianoSetup() {
  const st = STYLES[band.style];
  if (st.bassProg !== undefined) bank(1, 121, 0, st.bassProg);
  if (st.keysProg !== undefined) bank(2, 121, 0, st.keysProg);
  bank(9, 120, 0, 0);
  const v = Math.round(band.vol / 100 * 110);
  [1, 2, 9].forEach(ch => cc(ch, 7, v));
}
function bandHit(outs, n, vel, t, dur) { playVia(outs, n, vel, t, dur, { quiet: true }); }

STEP_LISTENERS.push((s, t) => {
  if (!band.on || band.waiting || s < band.startStep) return;
  const st = STYLES[band.style], rel = s - band.startStep, s16 = rel % 16, bar = Math.floor(rel / 16), sd = stepDur();
  const piano = band.out === 'piano';
  // drums
  if (band.parts.drums) {
    const pat = bar === band.fillBar ? FILL : st.drums;
    const dOut = piano ? [{ type: 'piano', ch: 9 }] : [{ type: 'phone', inst: INST.drums, bus: bandBus() }];
    if (s16 === 0 && band.crash) { band.crash = false; bandHit(dOut, piano ? KIT.X.g : KIT.X.p, 0.8, t, 0.2); }
    for (const [lane, str] of Object.entries(pat)) {
      const c = str[s16]; if (!c || c === '.') continue;
      let vel = c === 'X' ? 1 : c === 'o' ? 0.35 : 0.75;
      if (lane === 'H') vel *= s16 % 4 === 0 ? 1 : 0.7;
      bandHit(dOut, piano ? KIT[lane].g : KIT[lane].p, vel, t, 0.1);
    }
    if (bar === band.fillBar && s16 === 15) { band.crash = true; }
  }
  const ch = band.chord;
  // bass
  if (band.parts.bass) st.bass.forEach(([step, iv, len]) => {
    if (step !== s16) return;
    const fifth = ch.ivs.includes(7) ? 7 : ch.ivs.includes(6) ? 6 : ch.ivs.includes(8) ? 8 : 7;
    const off = iv === 7 ? fifth : iv === 10 ? (ch.ivs.includes(10) ? 10 : 12) : iv;
    const n = 36 + ch.root + off - (ch.root > 7 ? 12 : 0);
    const outs = piano ? [{ type: 'piano', ch: 1 }] : [{ type: 'phone', inst: bandPhoneInst(st.bassProg, 'bass'), bus: bandBus() }];
    bandHit(outs, n, 0.8, t, len * sd * 0.92);
  });
  // keys / comping
  if (band.parts.keys) st.keys.forEach(([step, len]) => {
    if (step !== s16) return;
    let base = 48 + ch.root; if (base < 53) base += 12;
    const notes = st.power ? [base, base + 7, base + 12] : ch.ivs.slice(0, 4).map(i => base + i);
    const outs = piano ? [{ type: 'piano', ch: 2 }] : [{ type: 'phone', inst: bandPhoneInst(st.keysProg, 'ep'), bus: bandBus() }];
    notes.forEach(n => bandHit(outs, n, 0.55, t, len * sd * 0.95));
  });
  if (s16 === 0) bandBeatUi(bar);
});

function bandChordFromHands() {
  const left = [...rawHeld].filter(n => n < band.split);
  if (!left.length) return;
  const c = detectChord(left);
  if (c) { band.chord = c; $('bChord').textContent = c.name; }
  if (band.waiting) bandGo();
}
HOOKS.on.push((n) => { if (band.on && n < band.split) bandChordFromHands(); });
HOOKS.off.push((n) => { if (band.on && n < band.split) setTimeout(bandChordFromHands, 0); });
bandMutes = n => band.on && band.muteLeft && n < band.split && mode !== 'piano';

async function bandStart(sync) {
  initAudio();
  band.on = true; band.waiting = !!sync;
  const st = STYLES[band.style];
  if (band.out === 'piano') bandPianoSetup(); else bandLoadSounds();
  T.swing = st.swing || 0;
  bandUi();
  if (!band.waiting) bandGo();
}
function bandGo() {
  band.waiting = false;
  if (!T.running) transportNeed('band', true); else T.users.add('band');
  band.startStep = T.running && T.step > 0 ? Math.ceil(T.step / 16) * 16 : 0;
  band.crash = true;
  bandUi();
}
function bandStop() {
  band.on = false; band.waiting = false; transportNeed('band', false); T.swing = 0;
  if (band.out === 'piano') [1, 2, 9].forEach(ch => cc(ch, 123, 0));
  bandUi();
}
function bandFill() {
  if (!band.on || band.waiting) return;
  const rel = Math.max(0, T.step - band.startStep);
  band.fillBar = Math.floor(rel / 16) + (rel % 16 > 12 ? 1 : 0);
}
function bandBeatUi(bar) { const p = $('bBeat'); if (p) { p.textContent = 'Bar ' + (bar + 1); p.classList.add('on'); } }
function bandUi() {
  $('bStart').textContent = band.on ? '■ Stop' : '▶ Start';
  $('bStart').classList.toggle('red', band.on);
  $('bSync').classList.toggle('hide', band.on);
  $('bBeat').textContent = band.waiting ? 'Waiting for your left hand…' : band.on ? 'Playing' : 'Stopped';
  $('bBeat').className = 'pill' + (band.on ? ' on' : '');
}

function buildBandUi() {
  $('sec-band').innerHTML = `
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Backing band</p><span class="pill" id="bBeat">Stopped</span></div>
    <p class="tip" style="margin:6px 0 10px">Play chords with your left hand (below the split) and the band follows. Turn off bass and keys for drum grooves only.</p>
    <div class="row" style="margin-top:0"><button class="btn" id="bStart">▶ Start</button><button class="btn ghost" id="bSync">Start when I play</button><button class="btn ghost" id="bFill">🥁 Fill</button></div>
    <div class="ctl" style="margin-top:14px"><span>Chord</span><span class="big" id="bChord">C</span></div>
    <p class="label" style="margin-top:12px">Style</p>
    <div class="grid" id="bStyles"></div>
    <div class="ctl" style="margin-top:12px"><span>Tempo</span><input type="range" class="bpmRange" id="bBpm" min="40" max="240"><span class="val"><span class="bpmVal"></span> bpm</span></div>
    <div class="ctl"><span>Parts</span><div class="seg2" id="bParts"></div></div>
    <div class="ctl"><span>Plays on</span><div class="seg2" id="bOut"></div></div>
    <div class="ctl"><span>Band vol</span><input type="range" id="bVol" min="0" max="100"></div>
    <div class="ctl"><span>Chord zone</span><b id="bSplitName"></b><button class="btn ghost sm" id="bSplitSet">Set by playing a key</button></div>
    <div class="toggle"><div>Silence my left hand<small>Left hand only picks chords (not in Piano tones)</small></div><div class="sw" id="bMute"></div></div>
  </div>
  <div class="card">
    <p class="label">Chord mode</p>
    <p class="tip" style="margin:0 0 8px">One key plays a whole chord. "Scale chords" uses the scale picked under the keyboard.</p>
    <div class="seg2" id="cMode"></div>
  </div>
  <div class="card">
    <div class="hdr"><p class="label" style="margin:0">Arpeggiator</p><div class="sw" id="aOn"></div></div>
    <p class="tip" style="margin:6px 0 8px">Hold a chord and it plays the notes one by one in time with the tempo. Best in All sounds or Phone synth, because in Piano tones the piano also plays the keys you hold.</p>
    <div class="ctl"><span>Pattern</span><div class="seg2" id="aPat"></div></div>
    <div class="ctl"><span>Speed</span><div class="seg2" id="aRate"></div></div>
    <div class="ctl"><span>Octaves</span><div class="seg2" id="aOct"></div></div>
    <div class="ctl"><span>Tempo</span><input type="range" class="bpmRange" min="40" max="240"><span class="val"><span class="bpmVal"></span> bpm</span></div>
  </div>`;
  const g = $('bStyles');
  Object.entries(STYLES).forEach(([k, st]) => {
    const b = el(`<button class="inst${k === band.style ? ' sel' : ''}">${st.name}</button>`);
    b.onclick = () => {
      band.style = k; store.set('bStyle', k); setBpm(st.bpm); T.swing = band.on ? (st.swing || 0) : 0;
      g.querySelectorAll('.inst').forEach(x => x.classList.toggle('sel', x === b));
      if (band.on) { if (band.out === 'piano') bandPianoSetup(); else bandLoadSounds(); }
    };
    g.appendChild(b);
  });
  $('bStart').onclick = () => band.on ? bandStop() : bandStart(false);
  $('bSync').onclick = () => bandStart(true);
  $('bFill').onclick = bandFill;
  document.querySelectorAll('.bpmRange').forEach(r => r.oninput = e => setBpm(+e.target.value));
  setBpm(T.bpm);
  const partsSeg = () => segmentedMulti('bParts', [['drums', 'Drums'], ['bass', 'Bass'], ['keys', 'Keys']], band.parts, p => { band.parts = p; store.set('bParts', p); });
  partsSeg();
  segmented('bOut', [['phone', 'Phone / PC'], ['piano', 'Piano speakers']], band.out, v => {
    if (band.on && band.out === 'piano') [1, 2, 9].forEach(ch => cc(ch, 123, 0));
    band.out = v; store.set('bOut', v);
    if (band.on) { if (v === 'piano') bandPianoSetup(); else bandLoadSounds(); }
  });
  $('bVol').value = band.vol;
  $('bVol').oninput = e => {
    band.vol = +e.target.value; store.set('bVol', band.vol);
    if (band.bus) band.bus.gain.setTargetAtTime(band.vol / 100, ctx.currentTime, 0.02);
    if (band.out === 'piano' && band.on) [1, 2, 9].forEach(ch => cc(ch, 7, Math.round(band.vol / 100 * 110)));
  };
  let waitSplit = false;
  const showSplit = () => $('bSplitName').textContent = 'below ' + noteName(band.split);
  showSplit();
  $('bSplitSet').onclick = () => { waitSplit = true; $('bSplitSet').textContent = 'Play the key…'; };
  HOOKS.on.unshift(n => { if (!waitSplit) return; waitSplit = false; band.split = n; store.set('bSplit', n); showSplit(); $('bSplitSet').textContent = 'Set by playing a key'; });
  $('bMute').classList.toggle('on', band.muteLeft);
  $('bMute').onclick = () => { band.muteLeft = !band.muteLeft; store.set('bMute', band.muteLeft); $('bMute').classList.toggle('on', band.muteLeft); };

  segmented('cMode', [['off', 'Off'], ['maj', 'Major'], ['min', 'Minor'], ['seven', '7th'], ['power', 'Power'], ['oct', 'Octave'], ['sus', 'Sus4'], ['scale', 'Scale chords']], chordMode,
    v => { allOff(); chordMode = v; store.set('chordMode', v); });
  $('aOn').onclick = () => { allOff(); arp.on = !arp.on; $('aOn').classList.toggle('on', arp.on); };
  segmented('aPat', [['up', 'Up'], ['down', 'Down'], ['updown', 'Up-down'], ['random', 'Random']], arp.pattern, v => { arp.pattern = v; store.set('arpPat', v); });
  segmented('aRate', [[4, '1/4'], [2, '1/8'], [1, '1/16']], arp.rate, v => { arp.rate = +v; store.set('arpRate', +v); });
  segmented('aOct', [[1, '1'], [2, '2'], [3, '3']], arp.octs, v => { arp.octs = +v; store.set('arpOct', +v); });
  bandUi();
}
function segmentedMulti(id, options, obj, onChange) {
  const box = $(id); box.innerHTML = '';
  options.forEach(([k, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.classList.toggle('sel', !!obj[k]);
    b.onclick = () => { obj[k] = !obj[k]; b.classList.toggle('sel', obj[k]); onChange({ ...obj }); };
    box.appendChild(b);
  });
}
buildBandUi();
