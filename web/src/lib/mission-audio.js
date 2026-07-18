// Mission audio — the launch-control layer of the kitchen.
//  - music: full Mozart symphonies (No. 25 → 40 → 41, every movement, in
//    order, never repeating a snippet) streamed from Wikimedia Commons —
//    public-domain recordings of public-domain works. If streaming fails
//    (offline, rate limit), a synthesized Symphony-40 phrase loop takes over.
//  - say(): flight-director commentary via the browser's speech synthesis
//  - applause() / cheer(): shaped-noise crowds for approvals and milestones
// The AudioContext is created lazily from a user gesture (autoplay policy).

let ctx = null;
let musicNodes = null; // { master, timer } while the fallback synth is playing

// ── The concert programme ────────────────────────────────────
const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
const PLAYLIST = [
  'W. A. Mozart - Symphony n. 25 - I. Allegro con brio.ogg',
  'W. A. Mozart - Symphony n. 25 - II. Andante.ogg',
  'W. A. Mozart - Symphony n. 25 - III. Menuetto & Trio.ogg',
  'W. A. Mozart - Symphony n. 25 - IV. Allegro.ogg',
  'Wolfgang Amadeus Mozart - Symphony 40 g-moll - 1. Molto allegro.ogg',
  'Wolfgang Amadeus Mozart - Symphony 40 g-moll - 2. Andante.ogg',
  'Wolfgang Amadeus Mozart - Symphony 40 g-moll - 3. Menuetto, Allegretto-Trio.ogg',
  'Wolfgang Amadeus Mozart - Symphony 40 g-moll - 4. Allegro assai.ogg',
  'Wolfgang Amadeus Mozart - Symphony No. 41 1st Movement (Jupiter), K.551.ogg',
  'Wolfgang Amadeus Mozart - Symphony No. 41 2nd Movement (Jupiter), K.551.ogg',
  'Wolfgang Amadeus Mozart - Symphony No. 41 3rd Movement (Jupiter), K.551.ogg',
  'Wolfgang Amadeus Mozart - Symphony No. 41 4th Movement (Jupiter), K.551.ogg',
].map(f => COMMONS + encodeURIComponent(f));

const MUSIC_VOL = 0.35;
const DUCK_VOL = 0.08;

let audioEl = null;
let trackIdx = 0;
let streamOn = false;
let streamErrors = 0;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ── Mozart 40, first movement theme (G minor) ────────────────
// [midi, eighth-note units]; 0 = rest. Melody over a quiet bass line.
const MELODY = [
  [75, 1], [74, 1], [74, 2], [75, 1], [74, 1], [74, 2],
  [75, 1], [74, 1], [74, 2], [82, 3], [0, 1],
  [82, 1], [81, 1], [79, 2], [79, 1], [77, 1], [75, 2],
  [75, 1], [74, 1], [72, 2], [72, 1], [70, 1], [70, 3], [0, 1],
];
const BASS = [
  [43, 4], [43, 4], [43, 4], [46, 4],
  [48, 4], [43, 4], [50, 4], [43, 3], [0, 1],
];
const EIGHTH = 0.16; // ≈ molto allegro

function scheduleNote(dest, midi, when, dur, { type = 'triangle', gain = 1 }) {
  const c = ensureCtx();
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = midiHz(midi);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.02);
  env.gain.setTargetAtTime(gain * 0.6, when + 0.05, 0.08);
  env.gain.setTargetAtTime(0, when + dur - 0.04, 0.03);
  osc.connect(env).connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.15);
}

function schedulePhrase(dest, notes, startAt, opts) {
  let t = startAt;
  for (const [midi, units] of notes) {
    const dur = units * EIGHTH;
    if (midi !== 0) scheduleNote(dest, midi, t, dur, opts);
    t += dur;
  }
  return t - startAt;
}

// Fallback: the synthesized Symphony-40 phrase, looped quietly. Only used
// when streaming is unavailable.
function startFallbackLoop() {
  const c = ensureCtx();
  if (musicNodes) return;
  const master = c.createGain();
  master.gain.value = 0.07; // kitchen-radio volume, never foreground
  const lowpass = c.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2600;
  master.connect(lowpass).connect(c.destination);

  let nextStart = c.currentTime + 0.1;
  function scheduleLoop() {
    if (!musicNodes) return;
    const len = schedulePhrase(master, MELODY, nextStart, { type: 'triangle', gain: 0.9 });
    schedulePhrase(master, BASS, nextStart, { type: 'sine', gain: 0.55 });
    nextStart += len + EIGHTH * 2;
    // Re-arm one phrase ahead of playback.
    musicNodes.timer = setTimeout(scheduleLoop, (nextStart - c.currentTime - 1) * 1000);
  }
  musicNodes = { master, timer: null };
  scheduleLoop();
}

function stopFallbackLoop() {
  if (!musicNodes) return;
  clearTimeout(musicNodes.timer);
  const { master } = musicNodes;
  musicNodes = null;
  if (ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => master.disconnect(), 1500);
  }
}

function playTrack(i) {
  if (!streamOn) return;
  if (i >= PLAYLIST.length) return; // programme over — the concert ends, no repeat
  trackIdx = i;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.addEventListener('ended', () => playTrack(trackIdx + 1));
    audioEl.addEventListener('error', () => {
      streamErrors += 1;
      // A track can individually 404/429 — skip it. If everything fails
      // (offline), fall back to the synthesized phrase so music still plays.
      if (streamErrors >= 3) {
        stopStream();
        streamOn = true; // still "on" conceptually
        startFallbackLoop();
      } else {
        playTrack(trackIdx + 1);
      }
    });
    audioEl.addEventListener('playing', () => { streamErrors = 0; });
  }
  audioEl.volume = MUSIC_VOL;
  audioEl.src = PLAYLIST[i];
  audioEl.play().catch(() => { /* autoplay guard — unlock() click precedes this */ });
}

function stopStream() {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
  }
}

export function startMusic() {
  ensureCtx();
  if (streamOn) return;
  streamOn = true;
  streamErrors = 0;
  if (musicNodes) return; // already on the synth fallback
  playTrack(trackIdx); // resume the programme where it left off
}

export function stopMusic() {
  streamOn = false;
  stopStream();
  stopFallbackLoop();
}

// Must be called from inside a click handler at least once — creates/resumes
// the AudioContext within the user gesture so later scheduling is allowed.
export function unlock() {
  ensureCtx();
}

// ── Applause: a crowd of noise-grain claps ───────────────────
let noiseBuf = null;
function noiseBuffer() {
  const c = ensureCtx();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

export function applause(duration = 1.6) {
  const c = ensureCtx();
  const master = c.createGain();
  master.gain.value = 0.5;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400;
  band.Q.value = 0.7;
  master.connect(band).connect(c.destination);

  const claps = Math.floor(duration * 26);
  for (let i = 0; i < claps; i++) {
    const when = c.currentTime + Math.random() * duration;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer();
    src.playbackRate.value = 0.7 + Math.random() * 0.7;
    const env = c.createGain();
    // Each clap: sharp attack, 30–70ms tail; the crowd thins toward the end.
    const peak = 0.25 + Math.random() * 0.5 * (1 - when / (c.currentTime + duration));
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.004);
    env.gain.setTargetAtTime(0, when + 0.01, 0.02 + Math.random() * 0.02);
    src.connect(env).connect(master);
    src.start(when, Math.random() * 0.5, 0.12);
  }
  setTimeout(() => master.disconnect(), (duration + 0.5) * 1000);
}

// ── Crowd cheer: applause plus a handful of rising "whoo"s ───
export function cheer(duration = 2.0) {
  applause(duration);
  const c = ensureCtx();
  const whoops = 5;
  for (let i = 0; i < whoops; i++) {
    const t0 = c.currentTime + Math.random() * (duration * 0.5);
    const f0 = 240 + Math.random() * 160;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.3, t0 + 0.16);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.3, t0 + 0.45);
    const vowel = c.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.frequency.value = 850;
    vowel.Q.value = 1.6;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.055, t0 + 0.06);
    env.gain.setTargetAtTime(0, t0 + 0.35, 0.12);
    osc.connect(vowel).connect(env).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.8);
  }
}

// ── Flight-director commentary ───────────────────────────────
export function say(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 0.85;
  u.volume = 0.9;
  // Duck the symphony while the flight director talks.
  const ducked = [];
  if (audioEl && !audioEl.paused) {
    audioEl.volume = DUCK_VOL;
    ducked.push(() => { if (audioEl) audioEl.volume = MUSIC_VOL; });
  }
  if (musicNodes && ctx) {
    const g = musicNodes.master.gain;
    g.setTargetAtTime(0.025, ctx.currentTime, 0.1);
    ducked.push(() => { if (musicNodes && ctx) g.setTargetAtTime(0.07, ctx.currentTime, 0.4); });
  }
  if (ducked.length) u.onend = () => ducked.forEach(fn => fn());
  window.speechSynthesis.speak(u);
}

export function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
