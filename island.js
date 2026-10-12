/* Minimo OS · clon interactivo de la isla dinámica.
   Puerto 1:1 de minimo-shell: Island.qml, IslandCompact.qml, IslandMenu.qml, StatusPanel.qml, AppsPanel.qml,
   Zzz.qml, Character/Character.qml, Character/Reactions.qml, Character/Heart.qml, Common/Theme.qml. */
(() => {
'use strict';
const root = document.getElementById('mo'); if (!root) return;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => performance.now();

/* ---------- Curvas de Qt (QEasingCurve) ---------- */
const E = {
  Linear: t => t, InQuad: t => t * t, OutQuad: t => 1 - (1 - t) * (1 - t),
  OutCubic: t => 1 - Math.pow(1 - t, 3), InOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  OutQuint: t => 1 - Math.pow(1 - t, 5), InOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2, OutSine: t => Math.sin(t * Math.PI / 2),
  OutBack: (t, s) => { s = s === undefined ? 1.70158 : s; t -= 1; return t * t * ((s + 1) * t + s) + 1 }
};
const V = v => typeof v === 'function' ? v() : v;

/* ---------- Motor de animación (SequentialAnimation / ParallelAnimation / NumberAnimation) ---------- */
function num(tg, props, to, ms, ease, os, from) {
  const ps = props.split(','); let t0, fr, T, D, o, ez;
  return {
    start(t) { t0 = t; o = V(tg); T = V(to); D = V(ms); ez = V(ease) || 'Linear';
      if (from !== undefined) ps.forEach(p => o[p] = V(from)); fr = ps.map(p => o[p]) },
    tick(t) { const k = D <= 0 ? 1 : Math.min(1, (t - t0) / D), e = E[ez](k, os); ps.forEach((p, i) => o[p] = fr[i] + (T - fr[i]) * e); return k >= 1 }
  };
}
const pause = ms => { let t0, D; return { start(t) { t0 = t; D = V(ms) }, tick(t) { return t - t0 >= D } } };
const script = fn => ({ start() { fn() }, tick() { return true } });
const seq = (...a) => { let i; return {
  start(t) { i = 0; a[0].start(t) },
  tick(t) { while (i < a.length) { if (!a[i].tick(t)) return false; i++; if (i < a.length) a[i].start(t) } return true } } };
const par = (...a) => { let d; return {
  start(t) { d = a.map(() => false); a.forEach(x => x.start(t)) },
  tick(t) { let all = true; a.forEach((x, k) => { if (!d[k]) { d[k] = x.tick(t); all = all && d[k] } }); return all } } };
const loop = a => ({ start(t) { a.start(t) }, tick(t) { if (a.tick(t)) a.start(t); return false } });
const live = new Set();
function A(def) {
  return { def, running: false, onStopped: null,
    start() { this.running = true; def.start(now()); live.add(this) },
    stop() { if (!this.running) return; this.running = false; live.delete(this); this.onStopped && this.onStopped() },
    restart() { this.stop(); this.start() } };
}
// Behavior on <prop> { NumberAnimation { … } }
function beh(o, p, ms, ease, os) {
  let a = null, tv = o[p];
  return v => { if (v === tv) return; tv = v; if (a) a.stop();
    if (RM || V(ms) <= 0) { o[p] = v; return } a = A(num(o, p, v, V(ms), V(ease), os)); a.start() };
}

/* ---------- Estado global (singletons de Common/) ---------- */
const S = {
  dark: false, sleepForced: false, recording: false, starting: false, elapsed: 0, notice: '',
  player: null,                       // { title, artist, playing, pos, len }
  get playing() { return !!(S.player && S.player.playing) },
  notif: null, hovers: 0,
  ws: [1, 2, 3], wsActive: 1,
  vol: 1, muted: false, bright: 1, sat: 1,
  cursor: { x: -1, y: -1, last: 0, ok: false },
  hearts: 0,
};
const chars = [];
const bus = { typed() { chars.forEach(c => c.onTyped()) }, typingStopped() { chars.forEach(c => c.onTypingStopped()) },
  react(n) { chars.forEach(c => c.react(n)) } };

/* ---------- DOM ---------- */
const $ = (sel, el = root) => el.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e };
const icon = (name, tone = 'dark', size = 20) => `<img alt="" draggable="false" data-icon="${name}" data-tone="${tone}" width="${size}" height="${size}" src="${iconSrc(name, tone)}">`;
function iconSrc(name, tone) { const t = !S.dark ? tone : (tone === 'dark' ? 'white' : tone === 'white' ? 'dark' : 'graydark'); return `assets/icons/${t}/${name}.svg` }
function setIcon(img, name, tone) { if (!img) return; if (name) img.dataset.icon = name; if (tone) img.dataset.tone = tone; const s = iconSrc(img.dataset.icon, img.dataset.tone); if (img.getAttribute('src') !== s) img.src = s }
const refreshIcons = () => root.querySelectorAll('img[data-icon]').forEach(i => setIcon(i));
const pad2 = n => (n < 10 ? '0' : '') + n;
const hhmm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const dateES = d => { const t = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''); return t.charAt(0).toUpperCase() + t.slice(1) };

const stage = $('.mo-stage');
const wall = $('.mo-wall');

/* ---------- Personaje (Character.qml + Reactions.qml) ---------- */
class Character {
  constructor(el, size, opts = {}) {
    this.el = el; this.s = size; this.r = size / 2; this.clickable = !!opts.clickable;
    el.classList.add('mo-chr'); el.style.width = el.style.height = size + 'px';
    el.innerHTML = '<div class="mo-body"><div class="mo-sph"></div><div class="mo-face"><div class="mo-roll"><div class="mo-eye"><i></i></div><div class="mo-eye"><i></i></div></div></div></div>';
    this.body = el.firstChild; this.rollEl = $('.mo-roll', el); this.eyes = [...el.querySelectorAll('.mo-eye')];
    Object.assign(this, { active: false, lookX: 0, lookY: 0, idleX: 0, idleY: 0, eyeX: 0, eyeY: 0, vX: 0, vY: 0, gX: 0, gY: 0, gOn: 0,
      blink: 1, doubleBlink: false, sleepy: 0, petting: false, petSide: 1, petK: 0, petLean: 6, petPuff: 1, petHopY: 0,
      roll: 0, bounceY: 0, squashX: 1, squashY: 1, breath: 1, rScale: 1, rX: 0, rY: 0, rRot: 0, lookOverride: 0, oX: 0, oY: 0,
      eyeHMul: 1, eyeWMul: 1, openL: 1, openR: 1, smile: 0, wobble: 0, wobblePh: 0, half: 1, squint: 0, squintT: 0,
      worry: 0, tired: 0, moodShake: 0, danceOn: 0, beat: 0, sway: 0, clickTimes: [], _asleep: false, _dancing: false });
    const c = this;
    this.setGOn = beh(this, 'gOn', 250);
    this.setSleepy = beh(this, 'sleepy', () => c.asleep ? 2400 : 700, () => c.asleep ? 'InOutSine' : 'OutCubic');
    this.setPetK = beh(this, 'petK', () => c.petting ? 700 : 420, 'InOutSine');
    this.setDance = beh(this, 'danceOn', 400, 'InOutSine');
    const sq = (sx, sy, toY, ms, ease, os = 1) => par(num(c, 'squashX', sx, ms, ease, os), num(c, 'squashY', sy, ms, ease, os), num(c, 'bounceY', toY || 0, ms, ease, os));
    this.sq = sq;
    this.blinkAnim = A(seq(
      num(c, 'blink', .06, () => c.petting ? 260 : 55, () => c.petting ? 'InOutSine' : 'InQuad'),
      pause(() => c.petting ? 180 : 25),
      num(c, 'blink', 1, () => c.petting ? 420 : 80, () => c.petting ? 'InOutSine' : 'OutCubic'),
      pause(() => c.doubleBlink ? 90 : 0),
      num(c, 'blink', () => c.doubleBlink ? .06 : 1, () => c.doubleBlink ? 55 : 0, 'InQuad'),
      num(c, 'blink', 1, () => c.doubleBlink ? 85 : 0, 'OutCubic')));
    this.petLeanAnim = A(loop(seq(num(c, 'petLean', 9, 900, 'InOutSine'), num(c, 'petLean', 6, 900, 'InOutSine'))));
    this.puffAnim = A(seq(num(c, 'petPuff', 1.04, 220, 'OutCubic'), num(c, 'petPuff', 1, 460, 'OutBack', 1.2)));
    this.petHop = A(seq(num(c, 'petHopY', -c.s * .06, 150, 'OutCubic'), num(c, 'petHopY', 0, 150, 'InQuad'),
      num(c, 'petHopY', -c.s * .035, 120, 'OutCubic'), num(c, 'petHopY', 0, 130, 'InQuad')));
    this.sighAnim = A(seq(sq(1.04, .96, 0, 320, 'InOutSine'), sq(1, 1, 0, 460, 'OutBack'), script(() => { if (!c.asleep) c.doBlink(true) })));
    this.restAnim = A(par(num(c, 'blink', 1, 220, 'OutCubic'), num(c, 'petHopY', 0, 260, 'OutCubic'), num(c, 'petPuff', 1, 260, 'OutCubic'),
      num(c, 'petLean', 6, 260, 'OutCubic'), num(c, 'moodShake', 0, 200, 'OutCubic')));
    this.wakeAnim = A(seq(sq(.96, 1.04, -c.s * .02, 420, 'InOutSine'), sq(1, 1, 0, 380, 'OutBack'), pause(120), script(() => c.doBlink(true))));
    this.breathAnim = A(loop(seq(num(c, 'breath', () => c.asleep ? 1.025 : 1.012, () => c.asleep ? 3200 : 2400, 'InOutSine'),
      num(c, 'breath', 1, () => c.asleep ? 3200 : 2400, 'InOutSine'))));
    this.breathRest = A(num(c, 'breath', 1, 600, 'InOutSine'));
    this.breathAnim.onStopped = () => c.breathRest.restart();
    this.rx = new Reactions(this);
    // Timers
    const every = (first, next, fn) => { const run = () => { fn(); t = setTimeout(run, next()) }; let t = setTimeout(run, first) };
    every(3500, () => 3000 + Math.random() * 3000, () => { if (c.active && !c.asleep && !RM) c.doBlink(Math.random() < .15) });
    every(3000, () => 2500 + Math.random() * 2500, () => { if (!c.active || c.asleep) return;
      if (Math.random() < .5) { const t = Math.random() * Math.PI * 2, m = .25 + Math.random() * .4; c.idleX = Math.cos(t) * m; c.idleY = Math.sin(t) * m } else { c.idleX = 0; c.idleY = 0 }
      c.updateLook() });
    every(60000, () => 45000 + Math.random() * 75000, () => { if (c.active && !c.asleep && !c.dancing && !c.petting && !c.rx.busy) c.rx.playRandom(now() - S.cursor.last) });
    if (this.clickable) el.addEventListener('click', e => { e.stopPropagation(); const r = el.getBoundingClientRect(); c.clicked((e.clientX - r.left - r.width / 2) / (r.width / 2)) });
    chars.push(this);
  }
  get asleep() { return S.sleepForced && !S.playing && !S.recording }
  get dancing() { return this.active && S.playing }
  setActive(v) {
    if (RM) v = false;
    if (v === this.active) return; this.active = v;
    if (!v) this.toRest(); else this.rx.resetClicks();
  }
  doBlink(twice) { this.doubleBlink = twice; this.blinkAnim.restart() }
  updateLook() {
    if (!this.active) return;
    if (this.asleep) { this.lookX = 0; this.lookY = .75; return }
    const cu = S.cursor, idle = !cu.ok || now() - cu.last > 4000;
    if (idle) { this.lookX = this.idleX; this.lookY = this.idleY; return }
    const r = this.el.getBoundingClientRect(), st = stage.getBoundingClientRect();
    const px = r.left + r.width / 2, py = r.top + r.height / 2;
    const dx = cu.x - px, dy = cu.y - py;
    const nx = dx / 320, ny = dy < 0 ? dy / Math.max(24, py - st.top) : dy / 320;
    const m = Math.hypot(nx, ny), k = m > 1 ? 1 / m : 1;
    this.lookX = nx * k; this.lookY = ny * k;
  }
  opened() { if (this.active) { this.rx.resetClicks(); this.rx.playOpen() } }
  hop() { if (this.active && !this.asleep && !this.rx.busy) this.rx.play('hop') }
  react(n) { if (this.active && !this.asleep) this.rx.play(n) }
  clicked(side) {
    if (!this.active) { if (RM && this.asleep) wake(); return }
    if (this.asleep) { wake(); this.clickTimes = []; return }
    const t = now(); this.clickTimes = this.clickTimes.filter(x => t - x < 1500).concat([t]);
    if (this.petting || this.clickTimes.length >= 4) this.pet(side);
    else if (this.clickTimes.length === 1) this.rx.playClick();
  }
  pet(side) {
    if (!this.active || this.asleep) return;
    if (side !== undefined && side !== null && Math.abs(side) > .05) this.petSide = side > 0 ? 1 : -1;
    if (!this.petting) { if (side === undefined || side === null) this.petSide = Math.random() < .5 ? -1 : 1;
      this.rx.calm(); this.petting = true; this.puffAnim.restart() }
    clearTimeout(this.petEnd); this.petEnd = setTimeout(() => { this.petting = false; this.sighAnim.restart() }, 1700);
    if (!this.petHop.running) this.petHop.restart();
    const n = 2 + (Math.random() < .5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.spawnHeart(i * 90);
  }
  spawnHeart(delay) {
    if (S.hearts >= 24) return;
    const r = this.el.getBoundingClientRect(), st = stage.getBoundingClientRect(), s = this.s;
    const hs = Math.max(7, s * (.16 + Math.random() * .16));
    new Heart({ size: hs, x: r.left - st.left + r.width / 2 - hs / 2 + (Math.random() - .5) * s * .5, y: r.top - st.top + r.height * .2 - hs / 2,
      rise: s * (.7 + Math.random() * .5), drift: (Math.random() - .5) * s * .7, delay: delay || 0 });
  }
  onTyped() { if (this.active && !this.asleep) { this.squintT = 1; clearTimeout(this.sqR); this.sqR = setTimeout(() => this.squintT = 0, 600) } }
  onTypingStopped() { clearTimeout(this.sqR); this.squintT = 0 }
  toRest() {
    this.blinkAnim.stop(); this.petHop.stop(); this.puffAnim.stop(); clearTimeout(this.petEnd);
    this.petting = false; this.clickTimes = []; clearTimeout(this.sqR); this.squintT = 0; this.squint = 0;
    this.idleX = 0; this.idleY = 0; this.lookX = 0; this.lookY = this.asleep ? .75 : 0; this.gOn = 0;
    this.rx.rest(); this.restAnim.restart();
  }
  frame(t, dt) {
    // Cambios de estado (onAsleepChanged / onDancingChanged)
    const as = this.asleep, da = this.dancing;
    if (as !== this._asleep) { this._asleep = as; this.updateLook(); this.setSleepy(as ? 1 : 0);
      if (as) { this.rx.calm(); this.petting = false } else if (this.active) this.wakeAnim.restart() }
    if (da !== this._dancing) { this._dancing = da; if (da) { this.rx.calm(); this.danceT0 = t } }
    this.setDance(da ? 1 : 0); this.setPetK(this.petting ? 1 : 0);
    if (da) { this.beat = ((t - this.danceT0) % 500) / 500; this.sway = ((t - this.danceT0) % 1000) / 1000 }
    const wantLean = this.petK > .01 && this.active; if (wantLean !== this.petLeanAnim.running) wantLean ? this.petLeanAnim.start() : this.petLeanAnim.stop();
    if (this.active !== this.breathAnim.running) this.active ? this.breathAnim.start() : this.breathAnim.stop();
    // SmoothedAnimation { velocity: 3.5 } sobre squint
    const step = 3.5 * dt / 1000; this.squint += Math.max(-step, Math.min(step, this.squintT - this.squint));
    // SpringAnimation sobre eyeX/eyeY (pasos de 16 ms como Qt)
    this.acc = (this.acc || 0) + dt; const sp = as ? .8 : 2.8, dm = as ? .95 : .5;
    while (this.acc >= 16) { this.acc -= 16;
      this.vX += sp * (this.lookX - this.eyeX) - dm * this.vX; this.eyeX += this.vX * .016;
      this.vY += sp * (this.lookY - this.eyeY) - dm * this.vY; this.eyeY += this.vY * .016 }
    this.render();
  }
  render() {
    const c = this, s = c.s, r = c.r;
    const hopT = Math.sin(Math.PI * c.beat), dAmp = Math.min(1, 1) * c.danceOn;
    const danceY = -hopT * s * .08 * dAmp, danceSy = 1 + dAmp * (.03 * hopT - .05 * Math.pow(1 - hopT, 3)),
      danceSx = 1 + dAmp * (.05 * Math.pow(1 - hopT, 3) - .02 * hopT), danceRot = dAmp * 4 * Math.sin(2 * Math.PI * c.sway);
    const rot = danceRot + c.rRot + c.moodShake - 4 * c.tired + c.petSide * c.petLean * c.petK;
    const s1x = c.squashX * c.breath * danceSx, s1y = c.squashY * c.breath * danceSy;
    const s3x = c.petPuff * (1 + .02 * c.petK), s3y = c.petPuff * (1 - .02 * c.petK);
    const tx = c.rX + c.petSide * s * .045 * c.petK * (c.petLean - 5) / 4, ty = c.bounceY + danceY + c.rY + c.petHopY;
    c.body.style.transform = `translate(${r}px,${r}px) rotate(${rot}deg) translate(${-r}px,${-r}px) translate(${tx}px,${ty}px)`
      + ` translate(${r}px,${s}px) scale(${s3x},${s3y}) translate(${-r}px,${-s}px)`
      + ` translate(${r}px,${r}px) scale(${c.rScale}) translate(${-r}px,${-r}px)`
      + ` translate(${r}px,${s}px) scale(${s1x},${s1y}) translate(${-r}px,${-s}px)`;
    c.rollEl.style.transform = `rotate(${c.roll}deg)`;
    const lo = c.lookOverride;
    const bX = c.eyeX * (1 - lo) + c.oX * lo + c.wobble * Math.cos(c.wobblePh), bY = c.eyeY * (1 - lo) + c.oY * lo + c.wobble * Math.sin(c.wobblePh);
    const fX = bX * (1 - c.gOn) + c.gX * c.gOn, fY = bY * (1 - c.gOn) + c.gY * c.gOn + .3 * c.squint;
    const eyeW = s * .149, eyeH = s * .3375, eyeSep = s * .149;
    const L = Math.hypot(fX, fY), gk = L > 1 ? 1 / L : 1;
    const yaw = fX * gk * .8, pitch = fY * gk * (fY > 0 ? .66 : .6), eyeAng = Math.asin(Math.min(.9, eyeSep / r));
    const sinP = Math.sin(pitch), cosP = Math.cos(pitch), tilt = Math.max(-30, Math.min(30, 120 * Math.sin(yaw) * sinP));
    const openness = (1 - .8 * c.squint) * c.blink * c.half * (1 - .9 * c.sleepy) * (1 - .4 * c.tired) * (1 - .62 * c.petK);
    const joy = Math.max(c.smile, .45 * c.danceOn, .8 * c.petK) * (1 - c.sleepy);
    [-1, 1].forEach((m, k) => {
      const yw = yaw + m * eyeAng, cosY = Math.cos(yw), px = r * Math.sin(yw) * cosP, py = r * sinP, t = tilt * Math.PI / 180;
      const fcx = r * Math.sin(yaw) * cosP, dx = px - fcx, cx = r + fcx + dx * Math.cos(t), cy = r + py + dx * Math.sin(t);
      const kB = Math.max(.12, cosY), kA = Math.max(.2, cosP), own = m < 0 ? c.openL : c.openR;
      const w = eyeW * kB * c.eyeWMul * (1 - .12 * c.worry) * (1 + .15 * c.squint);
      const hh = Math.max(w * .35, eyeH * kA * c.eyeHMul * openness * own * (1 - .25 * c.worry) * (1 - .28 * joy));
      const e = c.eyes[k], p = e.firstChild;
      e.style.opacity = cosY > 0 ? 1 : 0;
      e.style.transform = `translate(${cx}px,${cy}px) rotate(${tilt - m * 14 * c.worry}deg)`;
      p.style.width = w + 'px'; p.style.height = hh + 'px'; p.style.borderRadius = Math.min(w, hh) / 2 + 'px';
      p.style.left = -w / 2 + 'px'; p.style.top = (-hh / 2 - eyeH * .12 * joy) + 'px';
    });
  }
}

class Reactions {
  constructor(c) {
    this.c = c; this.history = []; this.current = null; this.pending = null; this.clickIdx = 0;
    const s = c.s, sq = c.sq, n = (p, to, ms, e, os, from) => num(c, p, to, ms, e, os, from);
    const gstep = (rot, y, ms = 120) => par(n('rRot', rot, ms, 'InOutSine'), n('bounceY', y, ms, 'InOutSine'));
    const rep3 = (amp, drop) => seq(gstep(amp, -drop, 110), gstep(-amp * .85, 0), gstep(amp * .6, -drop * .7), gstep(-amp * .35, 0), gstep(0, 0, 160));
    const self = this; this.winkSide = 1; this.curSide = 1;
    this.settle = A(seq(par(n('rScale,squashX,squashY,eyeHMul,eyeWMul,openL,openR,half', 1, 160, 'OutCubic'),
      n('rX,rY,rRot,roll,bounceY,lookOverride,oX,oY,smile,wobble', 0, 160, 'OutCubic')),
      script(() => { self.reset(); if (self.pending) { self.current = self.pending; self.pending = null; self.current.start() } })));
    const W = () => self.winkSide, CS = () => self.curSide;
    this.anims = {
      hop: seq(sq(1.06, .94, 0, 130, 'OutCubic'), sq(.96, 1.05, -s * .16, 200, 'OutCubic'), sq(1, 1, 0, 170, 'InQuad'), sq(1.05, .95, 0, 70, 'OutQuad'), sq(1, 1, 0, 260, 'OutBack')),
      doubleHop: seq(sq(1.06, .94, 0, 120, 'OutCubic'), sq(.97, 1.04, -s * .12, 170, 'OutCubic'), sq(1, 1, 0, 140, 'InQuad'), sq(1.05, .95, 0, 70, 'OutQuad'),
        sq(.96, 1.05, -s * .18, 200, 'OutCubic'), sq(1, 1, 0, 180, 'InQuad'), sq(1.05, .95, 0, 70, 'OutQuad'), sq(1, 1, 0, 280, 'OutBack')),
      giggle: seq(par(n('rScale', .92, 280, 'OutCubic'), n('rY', -s * .04, 280, 'OutCubic'), n('smile', 1, 220, 'OutCubic')), rep3(6, s * .035),
        par(n('rScale', 1, 360, 'OutBack', 1), n('rY', 0, 360, 'OutCubic'), seq(pause(140), n('smile', 0, 260, 'InOutSine')))),
      lookAround: seq(par(n('lookOverride', 1, 220, 'OutCubic'), n('oX', -.85, 460, 'InOutSine', undefined, 0), n('rRot', -4, 520, 'InOutSine')), pause(380),
        par(n('oX', .85, 820, 'InOutCubic'), n('rRot', 4, 880, 'InOutCubic')), pause(420),
        par(n('oX', 0, 420, 'OutCubic'), n('rRot', 0, 480, 'OutBack', 1)), n('lookOverride', 0, 320, 'InOutSine')),
      surprise: seq(par(n('eyeHMul', 1.18, 140, 'OutCubic'), n('eyeWMul', 1.15, 140, 'OutCubic'), sq(.95, 1.05, -s * .08, 160, 'OutCubic')), sq(1, 1, 0, 260, 'OutBack'), pause(520),
        par(n('eyeHMul', 1, 360, 'InOutSine'), n('eyeWMul', 1, 360, 'InOutSine'))),
      wink: seq(script(() => self.winkSide = Math.random() < .7 ? 1 : -1),
        par(n('openR', () => W() > 0 ? .08 : .82, () => W() > 0 ? 90 : 140, () => W() > 0 ? 'InQuad' : 'OutCubic'),
          n('openL', () => W() > 0 ? .82 : .08, () => W() > 0 ? 140 : 90, () => W() > 0 ? 'OutCubic' : 'InQuad'),
          n('smile', .7, 140, 'OutCubic'), n('eyeWMul', 1.06, 120, 'OutCubic'), n('rRot', () => 5 * W(), 200, 'OutCubic'), sq(1.03, .97, 0, 110, 'OutCubic')),
        pause(180),
        par(n('openR,openL', 1, 260, 'OutBack', 1.2), n('eyeWMul', 1, 260, 'OutCubic'), sq(1, 1, 0, 300, 'OutBack'), n('rRot', 0, 380, 'OutBack', 1),
          seq(pause(80), n('smile', 0, 320, 'InOutSine')))),
      dizzy: seq(n('roll', 360, 620, 'InOutCubic', undefined, 0), script(() => c.roll = 0),
        par(n('wobble', .28, 200, 'OutCubic'), n('wobblePh', Math.PI * 4, 1200, 'OutSine', undefined, 0),
          seq(n('rRot', 6, 320, 'InOutSine'), n('rRot', -4, 400, 'InOutSine'), n('rRot', 0, 420, 'InOutSine')), seq(pause(800), n('wobble', 0, 400, 'InOutSine')))),
      yawn: seq(par(n('half', .45, 500, 'InOutSine'), sq(.94, 1.07, -s * .02, 760, 'InOutSine'), n('lookOverride', 1, 420, 'InOutSine'), n('oY', -.45, 760, 'InOutSine')), pause(380),
        par(sq(1.05, .95, 0, 300, 'InOutSine'), n('oY', .15, 360, 'InOutSine')),
        par(sq(1, 1, 0, 420, 'OutBack'), n('half', 1, 640, 'InOutSine'), n('lookOverride', 0, 640, 'InOutSine'))),
      curious: seq(script(() => self.curSide = Math.random() < .5 ? -1 : 1),
        par(n('rRot', () => 9 * CS(), 460, 'OutBack', 1), n('rX', () => s * .03 * CS(), 460, 'OutCubic'), n('lookOverride', 1, 300, 'OutCubic'),
          n('oX', () => .85 * CS(), 420, 'OutCubic'), n('oY', -.15, 420, 'OutCubic'), n('eyeHMul', 1.06, 360, 'OutCubic')), pause(950),
        par(n('rRot', 0, 480, 'OutBack', 1), n('rX', 0, 480, 'InOutSine'), n('lookOverride', 0, 480, 'InOutSine'), n('eyeHMul', 1, 360, 'InOutSine'))),
      greet: seq(sq(1.05, .95, 0, 110, 'OutCubic'), par(n('smile', 1, 220, 'OutCubic'), sq(.97, 1.04, -s * .1, 220, 'OutCubic')),
        par(sq(1, 1, 0, 300, 'OutBack'), seq(n('rRot', 6, 180, 'InOutSine'), n('rRot', -4, 220, 'InOutSine'), n('rRot', 0, 260, 'OutBack', 1))), pause(240), n('smile', 0, 320, 'InOutSine')),
      happyBounce: seq(par(n('smile', 1, 180, 'OutCubic'), sq(1.06, .94, 0, 110, 'OutCubic')), sq(.96, 1.05, -s * .14, 180, 'OutCubic'), sq(1, 1, 0, 150, 'InQuad'),
        sq(1.04, .96, 0, 70, 'OutQuad'), sq(.98, 1.02, -s * .07, 150, 'OutCubic'), sq(1, 1, 0, 130, 'InQuad'), sq(1, 1, 0, 220, 'OutBack'), n('smile', 0, 300, 'InOutSine')),
      startled: seq(par(n('eyeHMul', 1.14, 100, 'OutCubic'), n('eyeWMul', 1.12, 100, 'OutCubic'), sq(.96, 1.04, -s * .06, 120, 'OutCubic')), sq(1, 1, 0, 260, 'OutBack'),
        par(n('eyeHMul', 1, 320, 'InOutSine'), n('eyeWMul', 1, 320, 'InOutSine'))),
    };
    for (const k in this.anims) this.anims[k] = A(this.anims[k]);
    this.clickCycle = ['wink', 'giggle', 'wink', 'happyBounce', 'wink', 'curious'];
  }
  get busy() { return (this.current !== null && this.current.running) || this.settle.running }
  idleWeights(ms) { return { hop: 1.8, wink: 2.2, doubleHop: .8, giggle: 1.2, lookAround: 1.6, surprise: .6, dizzy: .3, curious: 1.4, yawn: ms > 25000 ? 2.5 : .4 } }
  pick(w) { const h = this.history, ks = Object.keys(w).filter(k => k === 'wink' ? !(h[0] === 'wink' && h[1] === 'wink') : h.indexOf(k) < 0);
    let tot = 0; for (const k of ks) tot += w[k]; let x = Math.random() * tot; for (const k of ks) { x -= w[k]; if (x <= 0) return k } return ks[ks.length - 1] }
  playRandom(ms) { this.play(this.pick(this.idleWeights(ms))) }
  playOpen() { this.play(this.pick({ greet: 1.3, happyBounce: 1.1 })) }
  resetClicks() { this.clickIdx = 0 }
  playClick() { const n = this.clickCycle[this.clickIdx % this.clickCycle.length]; this.clickIdx++; this.play(n, true) }
  play(name, fromClick) {
    const a = this.anims[name]; if (!a) return;
    if (!fromClick) this.history = [name].concat(this.history).slice(0, 2);
    if (this.busy) { this.stopAll(); this.pending = a; this.settle.restart() } else { this.reset(); this.current = a; a.start() }
  }
  rest() { this.stopAll(); this.pending = null; this.settle.restart() }
  calm() { if (this.busy) { this.stopAll(); this.pending = null; this.settle.restart() } }
  stopAll() { const c = this.c; if (this.current && this.current.running) this.current.stop(); this.current = null;
    c.roll = ((c.roll % 360) + 540) % 360 - 180; c.rRot = ((c.rRot % 360) + 540) % 360 - 180 }
  reset() { Object.assign(this.c, { rScale: 1, rX: 0, rY: 0, rRot: 0, roll: 0, bounceY: 0, squashX: 1, squashY: 1, lookOverride: 0, oX: 0, oY: 0,
    eyeHMul: 1, eyeWMul: 1, openL: 1, openR: 1, smile: 0, wobble: 0, half: 1 }) }
}

/* Heart.qml */
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21.2C10.9 20.3 2.5 14.2 2.5 8.4 2.5 5.3 4.9 3 7.8 3c1.8 0 3.3.9 4.2 2.3C12.9 3.9 14.4 3 16.2 3c2.9 0 5.3 2.3 5.3 5.4 0 5.8-8.4 11.9-9.5 12.8z"/></svg>';
class Heart {
  constructor(o) {
    S.hearts++; const e = h('div', 'mo-heart', HEART); e.style.width = e.style.height = o.size + 'px'; stage.appendChild(e);
    const st = { x: o.x, y: o.y, scale: .3, opacity: 0, rotation: 0 };
    const life = 1150 + Math.round(Math.random() * 350), sway = 6 + Math.random() * 6, peak = .9 + Math.random() * .2;
    const n = (p, to, ms, ez, os) => num(st, p, to, ms, ez, os);
    const a = A(seq(pause(o.delay), par(n('y', o.y - o.rise, life, 'OutCubic'), n('x', o.x + o.drift, life, 'InOutSine'), n('scale', peak, 320, 'OutBack', 2.2),
      seq(n('rotation', sway, 320, 'InOutSine'), n('rotation', -sway * .8, 420, 'InOutSine'), n('rotation', sway * .4, 560, 'InOutSine')),
      seq(n('opacity', 1, 160, 'OutCubic'), pause(life - 740), n('opacity', 0, 580, 'InOutSine')))));
    a.onStopped = () => { e.remove(); S.hearts--; renders.delete(draw) };
    const draw = () => { e.style.opacity = st.opacity; e.style.transform = `translate(${st.x}px,${st.y}px) rotate(${st.rotation}deg) scale(${st.scale})` };
    renders.add(draw); draw(); a.start();
  }
}
const renders = new Set();

/* ---------- Construcción de la isla ---------- */
const pill = $('.mo-pill');
pill.innerHTML = `
<div class="mo-view mo-compact">
  <div class="mo-c-chr" style="position:relative"></div>
  <span class="mo-time"></span>
  <span class="mo-rec" hidden><i></i><span class="mo-el">00:00</span></span>
  <span class="mo-notice" hidden></span>
  <span class="mo-toast" hidden><svg class="mo-ni" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span></span></span>
  <span class="mo-dots"></span>
</div>
<div class="mo-view mo-menu off">
  <div class="mo-page mo-p-menu"><div class="mo-col">
    <div class="mo-rv" data-step="0"><div class="mo-head"><div class="mo-m-chr"></div><div class="mo-clock"><b class="mo-time2"></b><span class="mo-date"></span></div></div></div>
    <div class="mo-rv" data-step="1"><div class="mo-search"><label class="mo-box">${icon('search', 'gray', 16)}<input type="text" placeholder="Buscar" aria-label="Buscar" spellcheck="false" autocomplete="off"></label><div class="mo-results"></div></div></div>
    <div class="mo-rv mo-rv-media" data-step="2" hidden><div class="mo-media">
      <div class="mo-art"><div class="cv"></div><i></i></div>
      <div class="mo-mt"><b class="mo-tit"></b><span class="mo-art2"></span><div class="mo-mbar"><div></div></div></div>
      <div class="mo-ctrls"><button aria-label="Anterior" data-m="prev">${icon('prev')}</button><button aria-label="Reproducir o pausar" data-m="play">${icon('play')}</button><button aria-label="Siguiente" data-m="next">${icon('next')}</button></div>
    </div></div>
    <div class="mo-rv" data-step="3"><div class="mo-sliders"></div></div>
    <div class="mo-rv" data-step="4"><div class="mo-acts"><div class="mo-a1"></div><div class="mo-a2"></div></div></div>
  </div></div>
  <div class="mo-page mo-p-desks" style="opacity:0;transform:translateX(120px);pointer-events:none">
    <div class="mo-desk-h"><span class="mo-back" data-int>${icon('back', 'dark', 18)}</span>Escritorios</div>
    <div class="mo-grid"></div><div class="mo-cap">Arrastrá un escritorio para reordenarlo</div>
  </div>
</div>
<div class="mo-view mo-panel mo-status off">
  <div class="mo-ph"><div class="mo-s-chr"></div></div>
  <div class="mo-tt">Internet</div>
  <div class="mo-card"><div class="mo-r2">${icon('ethernet', 'dark', 18)}<span class="l">Ethernet</span><span class="v">Conectado</span></div></div>
  <div class="mo-tt p">Recursos</div>
  <div class="mo-card">
    <div class="mo-r2">${icon('chip', 'dark', 18)}<span class="l">CPU</span><span class="v mo-cpu"></span></div><div class="mo-bar"><div><i class="mo-cpub"></i></div></div>
    <div class="mo-r2">${icon('apps', 'dark', 18)}<span class="l">Memoria</span><span class="v mo-mem"></span></div><div class="mo-bar"><div><i class="mo-memb"></i></div></div>
    <div class="mo-r2">${icon('folder', 'dark', 18)}<span class="l">Disco</span><span class="v">13% · 188,8 GB libres</span></div><div class="mo-bar"><div><i style="width:13%"></i></div></div>
    <div class="mo-r2">${icon('display', 'dark', 18)}<span class="l">Gráficos</span><span class="v mo-gpu"></span></div>
  </div>
  <div class="mo-tt p">Dispositivos</div>
  <div class="mo-card">
    <div class="mo-r2">${icon('keyboard', 'dark', 18)}<span class="l">Teclado</span><span class="v">Teclado inalámbrico</span></div>
    <div class="mo-r2">${icon('mouse', 'dark', 18)}<span class="l">Mouse</span><span class="v">Mouse inalámbrico</span></div>
    <div class="mo-r2">${icon('volume', 'dark', 18)}<span class="l">Audio</span><span class="v">Parlantes USB</span></div>
  </div>
</div>
<div class="mo-view mo-panel mo-apps off">
  <div class="mo-ph"><div class="mo-ap-chr"></div></div>
  <div class="mo-tt">En segundo plano</div>
  <div class="mo-card mo-applist"></div>
</div>`;
const V_ = { compact: $('.mo-compact'), menu: $('.mo-menu'), status: $('.mo-status'), apps: $('.mo-apps') };
const cC = new Character($('.mo-c-chr'), 22);
const cM = new Character($('.mo-m-chr'), 44, { clickable: true });
const cS = new Character($('.mo-s-chr'), 60, { clickable: true });
const cA = new Character($('.mo-ap-chr'), 60, { clickable: true });
// Zzz junto al personaje compacto
const zzz = h('div', 'mo-zzz', [0, 1, 2].map(i => `<span style="font-size:${9 + i * 1.5}px;animation-delay:${i * 900}ms"><em style="animation-delay:${i * 900}ms"><u style="animation-delay:${i * 900}ms">z</u></em></span>`).join(''));
V_.compact.appendChild(zzz);

/* Sliders (MSlider.qml) */
const sliders = $('.mo-sliders');
function mkSlider(o) {
  const el = h('div', 'mo-sl', `<div class="f"></div>${icon(o.icon, 'dark', 18)}<span></span>`); el.dataset.int = '';
  sliders.appendChild(el); const f = el.firstChild, ic = el.querySelector('img'), tx = el.querySelector('span');
  const upd = () => { const v = o.get(), fr = Math.max(0, Math.min(1, (v - o.from) / (o.to - o.from))), W = el.clientWidth || 352;
    const fw = Math.max(40, W * fr); f.style.width = fw + 'px'; setIcon(ic, o.iconName ? o.iconName() : o.icon, fw > 36 ? 'white' : 'dark');
    tx.textContent = o.text ? o.text(v) : Math.round(v * 100) + '%'; tx.classList.toggle('inv', fr > .9) };
  const at = x => { const r = el.getBoundingClientRect(); const lm = o.iconClick ? 40 : 0; return o.from + Math.max(0, Math.min(1, (x - r.left) / r.width)) * (o.to - o.from) + 0 * lm };
  el.addEventListener('pointerdown', e => { e.stopPropagation(); const r = el.getBoundingClientRect();
    if (o.iconClick && e.clientX - r.left < 40) { o.iconClick(); upd(); return }
    el.setPointerCapture(e.pointerId); el.classList.add('drag'); o.set(at(e.clientX)); upd();
    const mv = ev => { o.set(at(ev.clientX)); upd() }, up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up) };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up) });
  el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); o.set(Math.max(o.from, Math.min(o.to, o.get() + (e.deltaY < 0 ? 1 : -1) * (o.to - o.from) * .05))); upd() }, { passive: false });
  o.upd = upd; return o;
}
const sl = [
  mkSlider({ icon: 'volume', iconName: () => S.muted ? 'mute' : 'volume', from: 0, to: 1, get: () => S.muted ? 0 : S.vol, set: v => { S.vol = v; if (v > 0) S.muted = false },
    text: v => S.muted ? 'Silencio' : Math.round(v * 100) + '%', iconClick: () => S.muted = !S.muted }),
  mkSlider({ icon: 'sun', from: .3, to: 1, get: () => S.bright, set: v => { S.bright = v; applyDisplay() } }),
  mkSlider({ icon: 'drop', from: 0, to: 2, get: () => S.sat, set: v => { S.sat = Math.abs(v - 1) < .04 ? 1 : v; applyDisplay() }, iconClick: () => { S.sat = 1; applyDisplay() } }),
];
function applyDisplay() { wall.style.filter = (S.bright < 1 || S.sat !== 1) ? `brightness(${S.bright}) saturate(${S.sat})` : '' }

/* Botones (MenuButton.qml / ActionsSection.qml) */
function mkBtn(parent, o) {
  const el = h('div', 'mo-mb', `<div class="c" data-int role="button" tabindex="0">${icon(o.icon, 'dark', 22)}</div><span>${o.label}</span>`); parent.appendChild(el);
  const c = el.firstChild, img = el.querySelector('img'), lab = el.querySelector('span');
  o.sync = () => { const on = !!(o.armed || (o.active && o.active())); el.classList.toggle('on', on); setIcon(img, o.iconName ? o.iconName() : o.icon, on ? 'white' : 'dark');
    lab.textContent = o.armed ? 'Confirmar' : (o.labelFn ? o.labelFn() : o.label) };
  c.addEventListener('click', e => { e.stopPropagation();
    if (o.confirm && !o.armed) { o.armed = true; o.sync(); clearTimeout(o.t); o.t = setTimeout(() => { o.armed = false; o.sync() }, 3000); return }
    o.armed = false; o.sync(); o.run() });
  return o;
}
const done = () => collapse();
const btns = [
  mkBtn($('.mo-a1'), { icon: 'terminal', label: 'Terminal', run: done }),
  mkBtn($('.mo-a1'), { icon: 'record', iconName: () => S.recording ? 'stop' : 'record', label: 'Grabar', labelFn: () => S.recording ? 'Detener' : 'Grabar', active: () => S.recording,
    run: () => { S.recording ? recStop() : recStart(400); done() } }),
  mkBtn($('.mo-a1'), { icon: 'capture', label: 'Captura', run: done }),
  mkBtn($('.mo-a1'), { icon: 'desktops', label: 'Escritorios', run: () => { renderDesks(); setPage('desks') } }),
  mkBtn($('.mo-a2'), { icon: 'logout', label: 'Cerrar sesión', confirm: true, run: done }),
  mkBtn($('.mo-a2'), { icon: 'restart', label: 'Reiniciar', confirm: true, run: done }),
  mkBtn($('.mo-a2'), { icon: 'power', label: 'Apagar', confirm: true, run: done }),
  mkBtn($('.mo-a2'), { icon: 'settings', label: 'Ajustes', run: done }),
];
btns.forEach(b => b.sync());

/* Escritorios (WorkspacesView.qml) */
const pMenu = $('.mo-p-menu'), pDesks = $('.mo-p-desks'); let page = 'menu';
function setPage(p) { page = p;
  pMenu.style.transform = p === 'menu' ? 'none' : 'translateX(-120px)'; pMenu.style.opacity = p === 'menu' ? 1 : 0; pMenu.style.pointerEvents = p === 'menu' ? '' : 'none';
  pDesks.style.transform = p === 'desks' ? 'none' : 'translateX(120px)'; pDesks.style.opacity = p === 'desks' ? 1 : 0; pDesks.style.pointerEvents = p === 'desks' ? '' : 'none' }
function renderDesks() {
  const g = $('.mo-grid'); g.innerHTML = '';
  S.ws.forEach(id => { const t = h('div', 'mo-tile' + (id === S.wsActive ? ' a' : ''), String(id)); t.dataset.int = ''; t.onclick = e => { e.stopPropagation(); goWs(id); done() }; g.appendChild(t) });
  const p = h('div', 'mo-tile plus', icon('plus', 'gray', 22)); p.dataset.int = ''; p.onclick = e => { e.stopPropagation(); S.ws.push(S.ws.length + 1); goWs(S.ws.length); done() }; g.appendChild(p);
}
$('.mo-back').addEventListener('click', e => { e.stopPropagation(); setPage('menu') });

/* Búsqueda (SearchSection.qml) */
const APPS = [['Terminal', 'terminal'], ['Archivos', 'folder'], ['Ajustes', 'settings'], ['Navegador', 'external'], ['Música', 'music'], ['Captura de pantalla', 'capture'], ['Notas', 'brush'], ['Monitor del sistema', 'chip']];
const input = $('.mo-box input'), box = $('.mo-box'), results = $('.mo-results'); let sel = 0, res = [];
function search() { const q = input.value.trim().toLowerCase(); res = q ? APPS.filter(a => a[0].toLowerCase().includes(q)).slice(0, 5) : []; sel = 0; drawRes() }
function drawRes() { results.innerHTML = ''; res.forEach((a, i) => { const r = h('div', 'mo-res' + (i === sel ? ' sel' : ''), `${icon(a[1], 'dark', 24)}<span>${a[0]}</span>`);
  r.dataset.int = ''; r.onclick = e => { e.stopPropagation(); done() }; results.appendChild(r) }) }
input.addEventListener('input', () => { bus.typed(); search() });
input.addEventListener('focus', () => box.classList.add('on'));
input.addEventListener('blur', () => { box.classList.remove('on'); bus.typingStopped() });
input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, res.length - 1); drawRes(); e.preventDefault() }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); drawRes(); e.preventDefault() } else if (e.key === 'Enter' && res[sel]) done();
  else if (e.key === 'Escape') { collapse(); e.preventDefault() } e.stopPropagation() });
box.dataset.int = '';

/* Música (MediaSection.qml) */
$('.mo-ctrls').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const p = S.player; if (!p) return;
  if (b.dataset.m === 'play') p.playing = !p.playing; else { p.pos = 0; const t = TRACKS[(TRACKS.findIndex(x => x[0] === p.title) + (b.dataset.m === 'next' ? 1 : TRACKS.length - 1)) % TRACKS.length]; p.title = t[0]; p.artist = t[1]; p.len = t[2] } });
$('.mo-ctrls').dataset.int = '';
const TRACKS = [['Afterglow', 'Nova Ensemble', 214], ['Quiet Hours', 'Nova Ensemble', 188], ['Low Tide', 'Halden', 201]];
let artAngle = 0;

/* Apps en segundo plano (AppsPanel.qml) */
let trayItems = [{ id: 'sync', name: 'Sincronización', icon: 'restart' }, { id: 'music', name: 'Música', icon: 'music' }, { id: 'vpn', name: 'Conexión segura', icon: 'lock' }], menuFor = null;
function renderApps() {
  const L = $('.mo-applist'); L.innerHTML = '';
  if (!trayItems.length) { L.innerHTML = '<div class="mo-empty">No hay apps en segundo plano</div>'; return }
  trayItems.forEach(it => { const row = h('div', 'mo-app' + (menuFor === it.id ? ' open' : ''), `<div class="rw" data-int>${icon(it.icon, 'dark', 20)}<span>${it.name}</span></div><div class="mo-tray"><div data-int>Cerrar</div></div>`);
    const rw = row.firstChild, tray = row.lastChild;
    if (menuFor === it.id) { tray.style.height = '40px'; tray.style.opacity = 1 }
    rw.addEventListener('click', e => { e.stopPropagation(); menuFor = null; collapse() });
    rw.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); menuFor = menuFor === it.id ? null : it.id; renderApps() });
    tray.firstChild.addEventListener('click', e => { e.stopPropagation(); trayItems = trayItems.filter(x => x !== it); menuFor = null; renderApps() });
    L.appendChild(row) });
}

/* ---------- Isla (Island.qml) ---------- */
const I = { expanded: false, panel: false, kind: 'status', w: 112, h: 36, dragging: false, dragDx: 0 };
const setW = beh(I, 'w', 360, 'OutBack', .9), setH = beh(I, 'h', 400, 'OutBack', .7);
let stageN = 0, staggerT = null;
const open = () => I.expanded || I.panel;
function collapse() { I.expanded = false; I.panel = false; sync() }
function expand() { I.expanded = true; sync() }
function openPanel(kind) { I.panel = !(I.panel && I.kind === kind); I.kind = kind; I.expanded = false; sync() }
let wasExp = false, wasPanel = '';
function sync() {
  const k = I.expanded ? 'menu' : I.panel ? I.kind : 'compact';
  V_.compact.classList.toggle('off', open()); V_.menu.classList.toggle('off', !I.expanded);
  V_.status.classList.toggle('off', !(I.panel && I.kind === 'status')); V_.apps.classList.toggle('off', !(I.panel && I.kind === 'apps'));
  pill.classList.toggle('exp', I.expanded);
  cC.setActive(!open()); cM.setActive(I.expanded); cS.setActive(I.panel && I.kind === 'status'); cA.setActive(I.panel && I.kind === 'apps');
  if (I.expanded !== wasExp) { wasExp = I.expanded;
    input.value = ''; input.blur(); search();
    clearInterval(staggerT); stageN = 0; drawStage();
    if (I.expanded) { staggerT = setInterval(() => { stageN++; drawStage(); if (stageN >= 6) clearInterval(staggerT) }, 45); cM.opened(); drawMenu() }
    else setPage('menu') }
  const pk = I.panel ? I.kind : '';
  if (pk !== wasPanel) { wasPanel = pk; menuFor = null; if (pk === 'apps') renderApps();
    if (pk) setTimeout(() => (pk === 'status' ? cS : cA).react('greet'), 280) }
  ctlSync();
}
function drawStage() { root.querySelectorAll('.mo-rv').forEach(r => r.classList.toggle('in', RM || stageN > +r.dataset.step)) }

// Arrastre / clic (hoverZone)
let press = null;
pill.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-int],input,button')) return;
  if (I.expanded && e.button === 0) { e.stopPropagation(); return }
  press = { x: e.clientX, btn: e.button, vel: 0, lx: e.clientX, lt: now() }; I.dragging = false; I.dragDx = 0;
  pill.setPointerCapture(e.pointerId); e.stopPropagation();
});
pill.addEventListener('pointermove', e => {
  if (!press || I.expanded) return; const t = now();
  if (t > press.lt) { press.vel = press.vel * .6 + .4 * (e.clientX - press.lx) / (t - press.lt); press.lx = e.clientX; press.lt = t }
  const dx = e.clientX - press.x; if (!I.dragging && Math.abs(dx) > 8) I.dragging = true; if (I.dragging) I.dragDx = dx;
});
pill.addEventListener('pointerup', e => {
  if (!press) return; const p = press; press = null;
  if (!I.dragging && !open() && S.notif) { if (p.btn === 2) notifDismiss(); else notifDismiss(); I.dragDx = 0; return }
  if (p.btn === 2) { I.dragging = false; I.dragDx = 0; return }
  if (I.dragging) { let v = p.vel; if (now() - p.lt > 80) v = 0; const fling = Math.abs(v) > .6 && Math.abs(I.dragDx) > 16;
    if (Math.abs(I.dragDx) > 40 || fling) { if (I.panel) { I.panel = false; sync() } else openPanel((fling ? v : I.dragDx) > 0 ? 'status' : 'apps') } }
  else if (!open()) expand();
  I.dragging = false; I.dragDx = 0;
});
pill.addEventListener('pointercancel', () => { press = null; I.dragging = false; I.dragDx = 0 });
pill.addEventListener('contextmenu', e => e.preventDefault());
pill.addEventListener('click', e => e.stopPropagation());
pill.addEventListener('mouseenter', () => S.hovers++); pill.addEventListener('mouseleave', () => S.hovers = Math.max(0, S.hovers - 1));
stage.addEventListener('pointerdown', e => { if (open() && !pill.contains(e.target)) collapse() });
root.addEventListener('keydown', e => { if (e.key === 'Escape' && open()) collapse() });
pill.addEventListener('wheel', e => { if (open()) return; e.preventDefault(); goWs(Math.max(1, Math.min(S.ws.length, S.wsActive + (e.deltaY > 0 ? 1 : -1)))) }, { passive: false });

/* WorkspaceDots.qml */
const dots = $('.mo-dots'); let dotsT;
function goWs(id) { S.wsActive = id; dots.innerHTML = S.ws.map(w => `<b class="${w === S.wsActive ? 'a' : ''}"></b>`).join(''); dots.classList.add('on'); clearTimeout(dotsT); dotsT = setTimeout(() => dots.classList.remove('on'), 1100) }
dots.innerHTML = S.ws.map(w => `<b class="${w === 1 ? 'a' : ''}"></b>`).join('');

/* Notifs.qml */
let notifT;
function notify() { S.notif = { summary: 'Calendario', body: 'Reunión de diseño en 10 minutos' }; chars.forEach(c => c.react('curious')); restartLife() }
function restartLife() { clearTimeout(notifT); notifT = setTimeout(function tick() { if (S.hovers > 0) { notifT = setTimeout(tick, 250); return } S.notif = null }, 5000) }
function notifDismiss() { S.notif = null; clearTimeout(notifT) }

/* Recorder.qml */
let recI, noticeT;
function recStart(delay) { if (S.recording || S.starting) return; S.starting = true; setTimeout(() => { S.starting = false; S.elapsed = 0; S.recording = true;
  recI = setInterval(() => S.elapsed++, 1000) }, delay || 0) }
function recStop() { if (!S.recording) return; clearInterval(recI); const had = S.elapsed > 0; S.recording = false;
  const d = new Date(), stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
  S.notice = had ? 'Guardado · Minimo-' + stamp + '.mp4' : 'No se pudo grabar'; clearTimeout(noticeT); noticeT = setTimeout(() => S.notice = '', had ? 2200 : 2500) }

/* Dormir / despertar (IdleState.qml) */
function sleepNow() { S.sleepForced = true }
function wake() { S.sleepForced = false }

/* ---------- Bucle de cuadro ---------- */
const els = { time: $('.mo-time'), rec: $('.mo-rec'), el: $('.mo-el'), notice: $('.mo-notice'), toast: $('.mo-toast'), toastT: $('.mo-toast span'),
  time2: $('.mo-time2'), date: $('.mo-date'), media: $('.mo-rv-media'), tit: $('.mo-tit'), art2: $('.mo-art2'), mbar: $('.mo-mbar div'), mbarW: $('.mo-mbar'),
  cv: $('.mo-art .cv'), play: $('.mo-ctrls [data-m=play] img'), cpu: $('.mo-cpu'), cpub: $('.mo-cpub'), mem: $('.mo-mem'), memb: $('.mo-memb'), gpu: $('.mo-gpu') };
let res_ = { cpu: 5, temp: 30, mem: 1.6, gpu: 6, gt: 35 };
function drawStatus() { els.cpu.textContent = res_.cpu + '% · ' + res_.temp + ' °C'; els.cpub.style.width = res_.cpu + '%'; els.cpub.classList.toggle('hot', res_.cpu > 90);
  els.mem.textContent = res_.mem.toFixed(1).replace('.', ',') + ' / 31,2 GB'; els.memb.style.width = (res_.mem / 31.2 * 100) + '%'; els.gpu.textContent = res_.gpu + '% · ' + res_.gt + ' °C' }
setInterval(() => { if (!(I.panel && I.kind === 'status')) return; res_.cpu = Math.max(2, Math.min(40, res_.cpu + Math.round((Math.random() - .5) * 8))); res_.temp = 29 + Math.round(res_.cpu / 8);
  res_.mem = Math.max(1.5, Math.min(2.9, res_.mem + (Math.random() - .5) * .2)); res_.gpu = Math.max(1, Math.min(30, res_.gpu + Math.round((Math.random() - .5) * 6))); drawStatus() }, 2000);
drawStatus();
function drawMenu() { const d = new Date(); els.time2.textContent = hhmm(d); els.date.textContent = dateES(d) }
setInterval(() => { if (S.player && S.player.playing) { S.player.pos++; if (S.player.pos >= S.player.len) S.player.pos = 0 } if (S.recording) {} }, 1000);

let last = now(), visible = true;
function frame(t) {
  const dt = Math.min(100, t - last); last = t;
  for (const a of [...live]) if (a.running && a.def.tick(t)) { a.running = false; live.delete(a); a.onStopped && a.onStopped() }
  if (visible) {
    // Compacta
    const n = S.notif;
    els.time.hidden = !!n; els.time.textContent = hhmm(new Date());
    els.rec.hidden = !(S.recording && S.notice === ''); els.el.textContent = pad2(Math.floor(S.elapsed / 60)) + ':' + pad2(S.elapsed % 60);
    els.notice.hidden = S.notice === ''; els.notice.textContent = S.notice;
    els.toast.hidden = !(n && S.notice === ''); if (n) els.toastT.textContent = n.summary + ' · ' + n.body;
    const asleep = S.sleepForced && !S.playing && !S.recording;
    zzz.classList.toggle('on', asleep && !open());
    zzz.style.left = (cC.el.offsetLeft + 22 - 1) + 'px'; zzz.style.top = (cC.el.offsetTop - 14) + 'px';
    // Media
    const p = S.player; els.media.hidden = !p;
    if (p) { els.tit.textContent = p.title; els.art2.textContent = p.artist; els.mbar.style.width = (100 * p.pos / p.len) + '%'; setIcon(els.play, p.playing ? 'pause' : 'play');
      if (p.playing && !RM) artAngle = (artAngle + dt * 360 / 8000) % 360; els.cv.style.transform = `rotate(${artAngle}deg)` }
    sl.forEach(s => s.upd()); btns.forEach(b => b.sync());
    // Geometría de la píldora
    const rubber = I.dragging ? I.dragDx / (1 + Math.abs(I.dragDx) / 60) : 0;
    const cw = V_.compact.offsetWidth;
    const tw = I.expanded || I.panel ? 400 : Math.max(112, cw + 32) + Math.abs(rubber) * 1.2;
    const th = I.expanded ? Math.min(V_.menu.firstElementChild && (page === 'desks' ? pDesks.offsetHeight : pMenu.offsetHeight) + 48, 900)
      : I.panel ? (I.kind === 'apps' ? V_.apps.offsetHeight : V_.status.offsetHeight) : 36;
    setW(tw); setH(th);
    const SW = stage.clientWidth;
    pill.style.width = I.w + 'px'; pill.style.height = I.h + 'px'; pill.style.borderRadius = Math.min(I.h / 2, 28) + 'px';
    pill.style.transform = `translateX(${(SW - I.w) / 2 + rubber * .5}px)`;
    V_.menu.style.transform = V_.status.style.transform = V_.apps.style.transform = 'translateX(-50%)';
    chars.forEach(c => c.frame(t, dt));
    renders.forEach(f => f());
  }
  requestAnimationFrame(frame);
}
new IntersectionObserver(es => { visible = es[0].isIntersecting }).observe(stage);
addEventListener('pointermove', e => { const cu = S.cursor; cu.ok = true; const t = now();
  // cursorMoved(): sobresalto si el mouse pasa muy rápido
  if (cu.pt && t - cu.pt < 200) { const v = Math.hypot(e.clientX - cu.x, e.clientY - cu.y) / Math.max(16, t - cu.pt) * 1000;
    if (v > 4500) chars.forEach(c => { if (t - (c._ls || 0) > 5000 && !c.rx.busy && c.active && !c.dancing) { c._ls = t; c.rx.play('startled') } }) }
  cu.x = e.clientX; cu.y = e.clientY; cu.last = t; cu.pt = t; chars.forEach(c => c.updateLook()) }, { passive: true });

/* ---------- Controles de la demo ---------- */
const ctl = $('.mo-ctl');
const C = {
  menu: () => { I.panel = false; I.expanded ? collapse() : expand() },
  status: () => openPanel('status'),
  apps: () => openPanel('apps'),
  music: () => { if (!S.player) S.player = { title: TRACKS[0][0], artist: TRACKS[0][1], len: TRACKS[0][2], pos: 12, playing: true }; else S.player.playing = !S.player.playing },
  notif: () => notify(),
  rec: () => S.recording ? recStop() : recStart(0),
  sleep: () => S.sleepForced ? wake() : sleepNow(),
  pet: () => { const c = I.expanded ? cM : I.panel ? (I.kind === 'status' ? cS : cA) : cC; c.pet() },
  dark: () => { S.dark = !S.dark; root.classList.toggle('dark', S.dark); refreshIcons() },
};
ctl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); C[b.dataset.a](); ctlSync() });
ctl.addEventListener('pointerdown', e => e.stopPropagation());
function ctlSync() { const on = { menu: I.expanded, status: I.panel && I.kind === 'status', apps: I.panel && I.kind === 'apps', music: S.playing, rec: S.recording, sleep: S.sleepForced, dark: S.dark };
  ctl.querySelectorAll('button').forEach(b => b.classList.toggle('on', !!on[b.dataset.a])) }
setInterval(ctlSync, 500);

sync(); requestAnimationFrame(frame);
root.__mo = { S, I, C, chars, collapse, expand, openPanel, notify };
})();
