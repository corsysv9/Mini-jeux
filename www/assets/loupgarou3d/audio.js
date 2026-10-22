// Bruitages et ambiance de la forêt, fabriqués avec Web Audio : aucun fichier à télécharger.
export function createAudio() {
  let ctx = null;
  let master = null;
  let amb = null;
  let wet = null;
  let noise = null;
  let brown = null;
  let on = true;
  let unlocked = false;
  let ambienceOn = false;
  let timer = 0;
  let night = 1; // 1 : grillons et hiboux ; 0 : oiseaux du matin
  let firePower = 1;
  let nightGain = null;
  let fireGain = null;
  let nextOwl = 0;
  let nextHowl = 0;
  let nextBird = 0;
  try { on = localStorage.getItem('mj_sound') !== '0'; } catch (e) { /* stockage indisponible */ }

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
      // Réverbération de plein air : écho qui s'éteint dans la forêt.
      const irLen = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * (i < 800 ? i / 800 : 1);
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      wet = ctx.createGain();
      wet.gain.value = 0.35;
      wet.connect(conv).connect(master);
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

  function env(t, attack, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  // Envoie un son à la fois en direct et dans la réverbération.
  function out(node, dry, reverb) {
    const d = ctx.createGain();
    d.gain.value = dry === undefined ? 1 : dry;
    node.connect(d).connect(master);
    if (reverb) {
      const r = ctx.createGain();
      r.gain.value = reverb;
      node.connect(r).connect(wet);
    }
  }

  function burst(t, dur, type, freq, q, peak, dest) {
    const s = src(noise);
    const g = env(t, 0.002, peak, dur);
    s.connect(filter(type, freq, q)).connect(g).connect(dest || master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  function tone(t, type, f0, f1, dur, peak, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = env(t, 0.005, peak, dur);
    o.connect(g).connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function bell(f, t, vol, dur, dest) {
    const parts = [[0.5, 0.5, 1], [1, 1, 0.8], [1.19, 0.55, 0.55], [1.5, 0.35, 0.45], [2, 0.6, 0.35], [2.51, 0.22, 0.22], [3.01, 0.15, 0.18]];
    parts.forEach(([m, a, d]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = env(t, 0.004, vol * a, dur * d);
      o.connect(g).connect(dest || master);
      o.start(t);
      o.stop(t + dur * d + 0.1);
    });
  }

  // Hurlement : glissando qui monte, tient en vibrant, puis retombe ; deux formants de gorge.
  function howl(t, base, vol, len) {
    const L = len || 3;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const s = ctx.createOscillator();
    s.type = 'sine';
    [o, s].forEach((osc) => {
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.55, t + L * 0.25);
      osc.frequency.setValueAtTime(base * 1.55, t + L * 0.65);
      osc.frequency.exponentialRampToValueAtTime(base * 1.05, t + L);
    });
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vd = ctx.createGain();
    vd.gain.value = base * 0.02;
    vib.connect(vd);
    vd.connect(o.frequency);
    vd.connect(s.frequency);
    const f1 = filter('bandpass', base * 2.2, 3);
    const f2 = filter('lowpass', 1800, 0.7);
    const go = ctx.createGain();
    go.gain.value = 0.18;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.4);
    g.gain.setValueAtTime(vol, t + L * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.2);
    o.connect(go).connect(f1).connect(g);
    s.connect(f2).connect(g);
    out(g, 0.8, 0.9);
    [o, s, vib].forEach((x) => { x.start(t); x.stop(t + L + 0.3); });
  }

  function growl(t, dur, vol) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(72, t);
    o.frequency.linearRampToValueAtTime(88, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(64, t + dur);
    const rattle = ctx.createOscillator();
    rattle.frequency.value = 23;
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    rattle.connect(rg).connect(am.gain);
    const lp = filter('lowpass', 520, 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(am).connect(lp).connect(g);
    out(g, 1, 0.3);
    const n = src(brown);
    const ng = env(t, 0.2, vol * 0.5, dur);
    n.connect(filter('bandpass', 300, 1.5)).connect(ng).connect(master);
    n.start(t);
    n.stop(t + dur + 0.1);
    [o, rattle].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
  }

  // ---------- Ambiance : feu qui crépite, vent, grillons, hiboux, oiseaux ----------

  function startAmbience() {
    if (!ensure() || ambienceOn) return;
    ambienceOn = true;
    const t = now();
    const nodes = [];
    // Grondement du feu
    fireGain = ctx.createGain();
    fireGain.gain.setValueAtTime(0.0001, t);
    fireGain.gain.exponentialRampToValueAtTime(0.06 * firePower + 0.005, t + 2);
    fireGain.connect(amb);
    const roar = src(brown, true);
    roar.connect(filter('lowpass', 380)).connect(fireGain);
    roar.start();
    nodes.push(roar);
    // Vent dans les sapins
    const wind = src(brown, true);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.05, t + 4);
    const wf = filter('bandpass', 500, 0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const depth = ctx.createGain();
    depth.gain.value = 250;
    lfo.connect(depth).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(amb);
    wind.start();
    lfo.start();
    nodes.push(wind, lfo);
    // Grillons : deux chanteurs, trilles hachées
    nightGain = ctx.createGain();
    nightGain.gain.value = night * 0.022;
    nightGain.connect(amb);
    [[4300, 28, 0.55], [4750, 34, 0.8]].forEach(([f, rate, grp]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const pulse = ctx.createOscillator();
      pulse.type = 'square';
      pulse.frequency.value = rate;
      const pg = ctx.createGain();
      pg.gain.value = 0.5;
      const group = ctx.createOscillator();
      group.type = 'square';
      group.frequency.value = grp;
      const gg = ctx.createGain();
      gg.gain.value = 0.5;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      pulse.connect(pg).connect(am.gain);
      group.connect(gg).connect(mix.gain);
      o.connect(am).connect(mix).connect(nightGain);
      [o, pulse, group].forEach((x) => { x.start(); nodes.push(x); });
    });
    amb.userData = nodes;
    nextOwl = t + 6 + Math.random() * 8;
    nextHowl = t + 25 + Math.random() * 20;
    nextBird = t + 1;
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

  function owl(t) {
    const hoot = (at, f, d) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, at + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(filter('lowpass', 700)).connect(g);
      out(g, 0.6, 0.8);
      o.start(at);
      o.stop(at + d + 0.05);
    };
    hoot(t, 390, 0.5);
    hoot(t + 0.9, 380, 0.18);
    hoot(t + 1.15, 385, 0.18);
    hoot(t + 1.4, 375, 0.5);
  }

  function bird(t) {
    const base = 2600 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.09 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), at);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), at + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, at + 0.08);
      const g = env(at, 0.005, 0.03 * (1 - night), 0.08);
      o.connect(g);
      out(g, 0.7, 0.5);
      o.start(at);
      o.stop(at + 0.12);
    }
  }

  function schedule() {
    if (!ambienceOn) return;
    const t = now();
    // Crépitements et petites explosions de sève
    const rate = 10 * firePower;
    for (let i = 0; i < 3; i++) {
      if (Math.random() < rate * 0.04) burst(t + Math.random() * 0.12, 0.004 + Math.random() * 0.012, 'highpass', 1800 + Math.random() * 3000, 0.7, 0.03 + Math.random() * 0.1 * firePower, amb);
    }
    if (Math.random() < 0.015 * firePower) {
      burst(t + 0.05, 0.03, 'bandpass', 900, 1, 0.25, amb);
      burst(t + 0.07, 0.01, 'highpass', 3000, 1, 0.15, amb);
    }
    if (night > 0.5 && t > nextOwl) {
      nextOwl = t + 18 + Math.random() * 25;
      owl(t + 0.1);
    }
    if (night > 0.5 && t > nextHowl) {
      nextHowl = t + 45 + Math.random() * 40;
      howl(t + 0.1, 330 + Math.random() * 60, 0.018, 3.2);
    }
    if (night < 0.5 && t > nextBird) {
      nextBird = t + 0.8 + Math.random() * 3;
      bird(t + 0.05);
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
    setNight(v) {
      night = v;
      if (nightGain) nightGain.gain.setTargetAtTime(night * 0.022, now(), 0.8);
    },
    setFire(p) {
      firePower = p;
      if (fireGain) fireGain.gain.setTargetAtTime(0.06 * p + 0.005, now(), 0.5);
    },
    growl(dur, vol) { if (ensure() && on) growl(now() + 0.02, dur || 1.6, vol || 0.5); },
    snarl() {
      if (!ensure() || !on) return;
      const t = now();
      growl(t, 0.7, 0.8);
      burst(t + 0.05, 0.35, 'bandpass', 1400, 1.2, 0.35);
      burst(t + 0.25, 0.2, 'bandpass', 2400, 2, 0.2);
    },
    howl(vol) { if (ensure() && on) howl(now() + 0.05, 320 + Math.random() * 40, vol || 0.12, 3.4); },
    howls() {
      if (!ensure() || !on) return;
      const t = now();
      [[310, 0], [370, 0.7], [270, 1.3], [420, 2.1]].forEach(([f, d]) => howl(t + d, f, 0.1, 3.2 + Math.random()));
    },
    rustle(vol) {
      if (!ensure() || !on) return;
      const t = now();
      for (let i = 0; i < 16; i++) burst(t + Math.random() * 0.7, 0.04 + Math.random() * 0.08, 'bandpass', 2000 + Math.random() * 3000, 0.8, (vol || 0.12) * (0.4 + Math.random()));
    },
    steps(n, gap) {
      if (!ensure() || !on) return;
      const t = now();
      for (let i = 0; i < n; i++) {
        tone(t + i * gap, 'sine', 110, 50, 0.08, 0.2);
        burst(t + i * gap, 0.05, 'bandpass', 600, 1, 0.12);
      }
    },
    bite() {
      if (!ensure() || !on) return;
      const t = now();
      tone(t, 'sine', 140, 45, 0.2, 0.7);
      burst(t, 0.12, 'lowpass', 1200, 1, 0.6);
      burst(t + 0.02, 0.05, 'highpass', 3000, 1, 0.3);
    },
    scream() {
      if (!ensure() || !on) return;
      const t = now();
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(280, t);
      o.frequency.exponentialRampToValueAtTime(560, t + 0.18);
      o.frequency.exponentialRampToValueAtTime(330, t + 0.8);
      const vib = ctx.createOscillator();
      vib.frequency.value = 7;
      const vd = ctx.createGain();
      vd.gain.value = 12;
      vib.connect(vd).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      [[850, 6], [1250, 7], [2600, 9]].forEach(([f, q]) => o.connect(filter('bandpass', f, q)).connect(g));
      out(g, 1, 0.6);
      [o, vib].forEach((x) => { x.start(t); x.stop(t + 0.9); });
    },
    gasp() {
      if (!ensure() || !on) return;
      burst(now(), 0.3, 'bandpass', 1500, 1, 0.12);
    },
    drag(dur) {
      if (!ensure() || !on) return;
      const t = now();
      const s = src(brown);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < dur * 6; k++) g.gain.setValueAtTime(0.1 + Math.random() * 0.25, t + k / 6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(filter('bandpass', 700, 0.8)).connect(g).connect(master);
      s.start(t);
      s.stop(t + dur + 0.1);
      api.rustle(0.08);
    },
    heartbeat(n) {
      if (!ensure() || !on) return;
      const t = now();
      for (let i = 0; i < n; i++) {
        tone(t + i * 0.8, 'sine', 70, 40, 0.14, 0.5);
        tone(t + i * 0.8 + 0.22, 'sine', 64, 38, 0.12, 0.35);
      }
    },
    gunshot() {
      if (!ensure() || !on) return;
      const t = now();
      const s = src(noise);
      const g = env(t, 0.002, 1.0, 0.35);
      s.connect(filter('lowpass', 5000, 0.7)).connect(g);
      out(g, 1, 1.2);
      s.start(t);
      s.stop(t + 0.5);
      tone(t, 'sine', 110, 35, 0.35, 0.9);
    },
    // Cloches du village au lever du jour (au loin).
    bells(count) {
      if (!ensure() || !on) return;
      const t = now() + 0.1;
      const lp = filter('lowpass', 1800, 0.7);
      lp.connect(master);
      const r = ctx.createGain();
      r.gain.value = 0.9;
      lp.connect(r).connect(wet);
      for (let i = 0; i < count; i++) bell(392 * (i % 2 ? 0.84 : 1), t + i * 0.9, 0.14, 4, lp);
    },
    peal() {
      if (!ensure() || !on) return;
      const t = now() + 0.1;
      const notes = [659.25, 587.33, 523.25, 493.88, 440, 392, 349.23, 329.63];
      for (let r = 0; r < 3; r++) notes.forEach((f, i) => bell(f, t + r * 1.5 + i * 0.17, 0.1, 2.2));
    },
    magic() {
      if (!ensure() || !on) return;
      const t = now();
      [784, 988, 1175, 1568, 1976].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = env(t + i * 0.07, 0.01, 0.06, 1.2);
        o.connect(g);
        out(g, 0.7, 0.8);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 1.3);
      });
    },
    // Gong sourd quand le village s'endort.
    dusk() {
      if (!ensure() || !on) return;
      const t = now();
      bell(110, t, 0.18, 5);
    },
    vote() {
      if (!ensure() || !on) return;
      const t = now();
      burst(t, 0.05, 'bandpass', 700, 3, 0.4);
      tone(t, 'sine', 220, 180, 0.12, 0.15);
    },
    swish() {
      if (!ensure() || !on) return;
      const t = now();
      const s = src(noise);
      const f = filter('bandpass', 700, 1.2);
      f.frequency.setValueAtTime(700, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.14);
      const g = env(t, 0.03, 0.3, 0.14);
      s.connect(f).connect(g).connect(master);
      s.start(t, Math.random());
      s.stop(t + 0.25);
    },
    click() {
      if (!ensure() || !on) return;
      burst(now(), 0.01, 'bandpass', 2000, 2, 0.15);
    },
  };
  return api;
}
