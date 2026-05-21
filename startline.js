/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * startline.js — race-start helper: pin two marks, distance + ETA to the
 * imaginary line, countdown timer with vibration/beep cues.
 *
 * Geometry is local equirectangular relative to the midpoint of the line —
 * accurate to <0.1% for any line < a few km, which is fine for sailing.
 */
(function () {
  'use strict';

  const RAD = Math.PI / 180;
  const EARTH_R = 6371000;
  const KNOT_TO_MS = 0.5144;

  const MARK_KEYS = ['pampero.mark1', 'pampero.mark2'];
  const TIMER_START_KEY = 'pampero.timerStart';
  const TIMER_DURATION_KEY = 'pampero.timerDuration';

  // --- marks ---
  function getMark(i) {
    const raw = localStorage.getItem(MARK_KEYS[i]);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
  function setMark(i, lat, lon) {
    const v = { lat, lon, t: new Date().toISOString() };
    localStorage.setItem(MARK_KEYS[i], JSON.stringify(v));
    return v;
  }
  function clearMarks() {
    MARK_KEYS.forEach(k => localStorage.removeItem(k));
  }

  // --- timer ---
  function startTimer(durationSec) {
    localStorage.setItem(TIMER_START_KEY, String(Date.now()));
    localStorage.setItem(TIMER_DURATION_KEY, String(durationSec));
  }
  function stopTimer() {
    localStorage.removeItem(TIMER_START_KEY);
    localStorage.removeItem(TIMER_DURATION_KEY);
  }
  function getTimerRemaining() {
    const start = parseInt(localStorage.getItem(TIMER_START_KEY) || '0', 10);
    if (!start) return null;
    const duration = parseFloat(localStorage.getItem(TIMER_DURATION_KEY) || '0');
    const elapsed = (Date.now() - start) / 1000;
    return Math.max(0, duration - elapsed);
  }

  // --- math (local equirectangular) ---
  function toLocalMeters(lat0, lon0, lat, lon) {
    const x = (lon - lon0) * RAD * EARTH_R * Math.cos(lat0 * RAD);
    const y = (lat - lat0) * RAD * EARTH_R;
    return { x, y };
  }

  function perpDistance(P, A, B) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return Math.hypot(P.x - A.x, P.y - A.y);
    return Math.abs(dx * (A.y - P.y) - (A.x - P.x) * dy) / len;
  }

  // Intersection of ray P + t*(sin(h), cos(h)) with the infinite line A-B.
  // Returns t in meters if the line is ahead of P, otherwise null.
  function rayToLine(P, headingDeg, A, B) {
    const dx = Math.sin(headingDeg * RAD);
    const dy = Math.cos(headingDeg * RAD);
    const ex = B.x - A.x;
    const ey = B.y - A.y;
    const det = -dx * ey + dy * ex;
    if (Math.abs(det) < 1e-9) return null; // parallel
    const t = ((P.x - A.x) * ey - (P.y - A.y) * ex) / det;
    return t > 0 ? t : null;
  }

  function metrics(snap) {
    const m1 = getMark(0), m2 = getMark(1);
    const out = {
      hasLine: !!(m1 && m2),
      hasMark1: !!m1,
      hasMark2: !!m2,
      distance: null,
      eta: null,
    };
    if (!out.hasLine || snap.lat == null || snap.lon == null) return out;
    const lat0 = (m1.lat + m2.lat) / 2;
    const lon0 = (m1.lon + m2.lon) / 2;
    const A = toLocalMeters(lat0, lon0, m1.lat, m1.lon);
    const B = toLocalMeters(lat0, lon0, m2.lat, m2.lon);
    const P = toLocalMeters(lat0, lon0, snap.lat, snap.lon);
    out.distance = perpDistance(P, A, B);
    if (snap.heading != null && snap.sog != null && snap.sog > 0.1) {
      const t = rayToLine(P, snap.heading, A, B);
      if (t != null) out.eta = t / (snap.sog * KNOT_TO_MS);
    }
    return out;
  }

  // --- audio cue (oscillator beep) — initialized lazily on first user gesture ---
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try { audioCtx = new Ctx(); } catch (_) {}
  }
  function beep(freq, ms) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  }
  function cue(kind) {
    // 'tick' (short), 'minute' (medium), 'go' (long)
    if (kind === 'tick') { beep(880, 80); navigator.vibrate && navigator.vibrate(40); }
    else if (kind === 'minute') { beep(700, 150); navigator.vibrate && navigator.vibrate(80); }
    else if (kind === 'go') {
      beep(1200, 600);
      navigator.vibrate && navigator.vibrate([200, 80, 200, 80, 600]);
    }
  }

  window.StartLine = {
    getMark, setMark, clearMarks,
    startTimer, stopTimer, getTimerRemaining,
    metrics,
    ensureAudio, cue,
  };
})();
