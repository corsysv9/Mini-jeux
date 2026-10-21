// Bruitages et ambiance fabriqués avec Web Audio : aucun fichier à télécharger.
const NOTES = { B3: 246.94, E3: 164.81, E4: 329.63, Fs4: 369.99, Gs4: 415.3, B4: 493.88, Cs5: 554.37, Ds5: 622.25, E5: 659.25, A4: 440, Fs5: 739.99, Gs5: 830.61 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let amb = null;
  let noise = null;
  let brown = null;
  let on = true;
  let timer = 0;
  let nextTick = 0;
  let tock = false;
  let period = 1;
  let ambienceOn = false;
  try { on = localStorage.getItem('mj_sound') !== '0'; } catch (e) { /* stockage indisponible */ }

  let unlocked = false; // pas de son avant un geste de l'utilisateur

  function ensure() {
    if (!ctx && !unlocked) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = on ? 0.85 : 0;
      master.connect(comp).connect(ctx.destination);
      amb = ctx.createGain();
      amb.gain.value = 1;
      amb.connect(master);
      const len = ctx.sampleRate * 2;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      brown = ctx.createBuffer(1, len, ctx.sampleRate);
      const w = noise.getChannelData(0);
      const b = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        w[i] = Math.random() * 2 - 1;
        last = (last + 0.02 * w[i]) / 1.02;
        b[i] = last * 3.5;
      }
    }
    if (ctx.state === 'suspended' && on) ctx.resume().catch(() => {});
    return ctx;
  }

  const now = () => ctx.currentTime;

  function src(buf, loop) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = !!loop;
    return s;
  }

  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  // Enveloppe percussive : montée rapide, descente exponentielle.
  function env(t, attack, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function burst(t, dur, type, freq, q, peak, out) {
    const s = src(noise);
    const g = env(t, 0.002, peak, dur);
    s.connect(filter(type, freq, q)).connect(g).connect(out || master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  function tone(t, type, f0, f1, dur, peak, out) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = env(t, 0.005, peak, dur);
    o.connect(g).connect(out || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Cloche : partiels inharmoniques d'une cloche d'église.
  function bell(f, t, vol, dur) {
    const parts = [[0.5, 0.5, 1], [1, 1, 0.8], [1.19, 0.55, 0.55], [1.5, 0.35, 0.45], [2, 0.6, 0.35], [2.51, 0.22, 0.22], [3.01, 0.15, 0.18], [4.07, 0.08, 0.1]];
    parts.forEach(([m, a, d]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * m * (1 + (Math.random() - 0.5) * 0.002);
      const g = env(t, 0.004, vol * a, dur * d);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur * d + 0.1);
    });
    burst(t, 0.04, 'bandpass', f * 4, 2, vol * 0.4);
  }

  // ---------- Ambiance : pluie, vent, tic-tac de la grande horloge ----------

  function startAmbience() {
    if (!ensure() || ambienceOn) return;
    ambienceOn = true;
    const t = now();
    const rain = src(noise, true);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.05, t + 3);
    rain.connect(filter('highpass', 1400)).connect(filter('lowpass', 7000)).connect(rg).connect(amb);
    rain.start();
    const wind = src(brown, true);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.09, t + 4);
    const wf = filter('bandpass', 380, 0.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(wf.frequency);
    lfo.start();
    wind.connect(wf).connect(wg).connect(amb);
    wind.start();
    amb.userData = [rain, wind, lfo];
    nextTick = t + 0.5;
    schedule();
  }

  function stopAmbience() {
    ambienceOn = false;
    clearTimeout(timer);
    if (amb && amb.userData) {
      amb.userData.forEach((s) => { try { s.stop(); } catch (e) { /* déjà arrêté */ } });
      amb.userData = null;
    }
  }

  // Programmateur : tic-tac et gouttes de pluie un peu en avance sur l'horloge audio.
  function schedule() {
    if (!ambienceOn) return;
    const horizon = now() + 0.25;
    while (nextTick < horizon) {
      const f = tock ? 2300 : 3100;
      burst(nextTick, 0.03, 'bandpass', f, 9, 0.5, amb);
      tone(nextTick, 'sine', tock ? 620 : 820, tock ? 600 : 790, 0.04, 0.08, amb);
      tock = !tock;
      nextTick += period;
    }
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.5) burst(now() + Math.random() * 0.2, 0.012, 'bandpass', 2500 + Math.random() * 3500, 6, 0.04 + Math.random() * 0.05, amb);
    }
    timer = setTimeout(schedule, 120);
  }

  const api = {
    unlock() { unlocked = true; if (on) ensure(); },
    get on() { return on; },
    setOn(v) {
      on = !!v;
      try { localStorage.setItem('mj_sound', on ? '1' : '0'); } catch (e) { /* ignoré */ }
      if (!ensure()) return;
      master.gain.setTargetAtTime(on ? 0.85 : 0, now(), 0.05);
      if (on) ctx.resume().catch(() => {});
    },
    ambience(v) { if (v) startAmbience(); else stopAmbience(); },
    tempo(p) { period = p; },
    // Carillon de Westminster puis le gros bourdon.
    quarters() {
      if (!ensure() || !on) return;
      const t = now() + 0.1;
      ['E4', 'Gs4', 'Fs4', 'B3'].forEach((n, i) => bell(NOTES[n], t + i * 0.62, 0.22, 3.2));
      bell(NOTES.E3, t + 3.1, 0.42, 6);
    },
    bongs(count) {
      if (!ensure() || !on) return;
      for (let i = 0; i < count; i++) bell(NOTES.E3, now() + 0.05 + i * 1.1, 0.4, 5);
    },
    swish(delay) {
      if (!ensure() || !on) return;
      const t = now() + (delay || 0);
      const s = src(noise);
      const f = filter('bandpass', 700, 1.2);
      f.frequency.setValueAtTime(700, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.14);
      const g = env(t, 0.03, 0.35, 0.14);
      s.connect(f).connect(g).connect(master);
      s.start(t, Math.random());
      s.stop(t + 0.25);
    },
    deal(count) { for (let i = 0; i < count; i++) api.swish(i * 0.055); },
    snip() {
      if (!ensure() || !on) return;
      const t = now();
      burst(t, 0.02, 'highpass', 3500, 1, 0.5);
      tone(t, 'triangle', 4200, 2600, 0.05, 0.12);
      burst(t + 0.08, 0.03, 'highpass', 2800, 1, 0.6);
      tone(t + 0.08, 'square', 1800, 900, 0.04, 0.05);
    },
    // Roulement de tambour avant de retourner la carte.
    suspense(dur) {
      if (!ensure() || !on) return;
      const t = now();
      const hits = Math.floor(dur / 0.035);
      for (let i = 0; i < hits; i++) burst(t + i * 0.035, 0.03, 'bandpass', 1700, 1.5, 0.04 + 0.22 * (i / hits));
    },
    wire() {
      if (!ensure() || !on) return;
      const t = now();
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
      const f = filter('bandpass', 2600, 3);
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(350, t + 0.35);
      const g = env(t, 0.005, 0.4, 0.35);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.45);
      for (let i = 0; i < 12; i++) burst(t + Math.random() * 0.3, 0.008, 'highpass', 4000, 1, 0.25);
      tone(t + 0.25, 'sine', NOTES.E5 * 2, NOTES.E5 * 2, 0.9, 0.16);
      tone(t + 0.25, 'sine', NOTES.B4 * 4, NOTES.B4 * 4, 0.7, 0.08);
    },
    safe() {
      if (!ensure() || !on) return;
      const t = now();
      tone(t, 'sine', 320, 150, 0.16, 0.45);
      burst(t, 0.03, 'bandpass', 900, 2, 0.3);
      tone(t + 0.18, 'triangle', 392, 392, 0.25, 0.06);
      tone(t + 0.34, 'triangle', 329.6, 329.6, 0.4, 0.06);
    },
    // Carte Big Ben : coup de cuivre grave avant l'explosion.
    bombCard() {
      if (!ensure() || !on) return;
      const t = now();
      [55, 82.4, 110].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const lp = filter('lowpass', 900, 1);
        const g = env(t, 0.02, 0.22, 0.9);
        o.connect(lp).connect(g).connect(master);
        o.start(t);
        o.stop(t + 1.0);
      });
    },
    boom() {
      if (!ensure() || !on) return;
      const t = now();
      const s = src(noise);
      const lp = filter('lowpass', 5000, 0.7);
      lp.frequency.setValueAtTime(5000, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + 2.8);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 4); }
      shaper.curve = curve;
      const g = env(t, 0.008, 1.2, 3.6);
      s.connect(lp).connect(shaper).connect(g).connect(master);
      s.start(t);
      s.stop(t + 4);
      tone(t, 'sine', 95, 26, 2.2, 1.2);
      const rumble = src(brown);
      const rg = env(t + 0.1, 0.2, 0.7, 5);
      rumble.connect(filter('lowpass', 500)).connect(rg).connect(master);
      rumble.start(t + 0.1);
      rumble.stop(t + 5.5);
      // Le verre des cadrans qui vole en éclats
      for (let i = 0; i < 70; i++) {
        const at = t + 0.05 + Math.random() * 1.4;
        burst(at, 0.03 + Math.random() * 0.06, 'bandpass', 3000 + Math.random() * 6000, 14, 0.05 + Math.random() * 0.12);
        if (i % 3 === 0) tone(at, 'sine', 3000 + Math.random() * 4000, 2500 + Math.random() * 3000, 0.08, 0.03);
      }
      // Les cloches qui dégringolent
      [NOTES.E4, NOTES.Gs4, NOTES.B3, NOTES.Fs4].forEach((f, i) => bell(f * (0.97 + Math.random() * 0.06), t + 0.5 + i * 0.45, 0.16, 2.5));
    },
    victory() {
      if (!ensure() || !on) return;
      const t = now();
      const peal = ['E5', 'Ds5', 'Cs5', 'B4', 'A4', 'Gs4', 'Fs4', 'E4'];
      for (let r = 0; r < 3; r++) peal.forEach((n, i) => bell(NOTES[n], t + r * 1.5 + i * 0.17, 0.12, 2.2));
      ['E4', 'Gs4', 'B4', 'E5'].forEach((n, i) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = NOTES[n];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.6 + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        o.connect(g).connect(master);
        o.start(t + i * 0.12);
        o.stop(t + 4.6);
      });
    },
    thunder() {
      if (!ensure() || !on || !ambienceOn) return;
      const t = now();
      const s = src(brown);
      const lp = filter('lowpass', 260, 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      let at = t;
      for (let i = 0; i < 6; i++) {
        at += 0.2 + Math.random() * 0.5;
        g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.45, at);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.5);
      s.connect(lp).connect(g).connect(amb);
      s.start(t);
      s.stop(at + 2.6);
    },
    click() {
      if (!ensure() || !on) return;
      burst(now(), 0.01, 'bandpass', 2000, 2, 0.15);
    },
  };
  return api;
}
