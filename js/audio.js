// ===================================================================
//  Efectos de sonido sintetizados con la Web Audio API (sin archivos).
// ===================================================================

let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

export function setSound(on) { enabled = on; }
export function isSoundOn() { return enabled; }

// Resume el contexto tras la primera interacción del usuario.
export function unlock() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume();
}

function tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.2, slideTo = null, delay = 0 }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, gain = 0.3, delay = 0 }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, t0);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

export const Sfx = {
  drop() { tone({ freq: 480, slideTo: 180, type: 'sine', dur: 0.18, gain: 0.18 }); },
  click() { tone({ freq: 660, type: 'triangle', dur: 0.06, gain: 0.12 }); },
  bomb() { noise({ dur: 0.5, gain: 0.4 }); tone({ freq: 120, slideTo: 40, type: 'sawtooth', dur: 0.5, gain: 0.25 }); },
  block() { tone({ freq: 300, type: 'square', dur: 0.1, gain: 0.15 }); tone({ freq: 300, type: 'square', dur: 0.1, gain: 0.15, delay: 0.12 }); },
  freeze() { tone({ freq: 900, slideTo: 1600, type: 'sine', dur: 0.4, gain: 0.15 }); },
  swap() { tone({ freq: 500, slideTo: 1000, type: 'triangle', dur: 0.18, gain: 0.15 }); tone({ freq: 1000, slideTo: 500, type: 'triangle', dur: 0.18, gain: 0.15, delay: 0.18 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.25, gain: 0.2, delay: i * 0.13 })); },
  lose() { [400, 330, 262].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.3, gain: 0.18, delay: i * 0.18 })); },
};
