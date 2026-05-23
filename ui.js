/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * ui.js — DOM updates only. No canvas; numbers-only layout.
 */
(function () {
  'use strict';

  const heelFill = document.getElementById('heel-fill');
  const heelBarVal = document.getElementById('heel-bar-val');
  const heelBarSide = document.getElementById('heel-bar-side');
  const headingVal = document.getElementById('heading-val');
  const headingSrc = document.getElementById('heading-src');
  const heelVal = document.getElementById('heel-val');
  const heelSide = document.getElementById('heel-side');
  const sogVal = document.getElementById('sog-val');
  const statusLine = document.getElementById('status-line');
  const debugLine = document.getElementById('debug-line');
  const sailBadge = document.getElementById('sail-badge');

  const timerVal = document.getElementById('timer-val');
  const distVal = document.getElementById('dist-val');
  const etaVal = document.getElementById('eta-val');
  const pin1Btn = document.getElementById('pin1-btn');
  const pin2Btn = document.getElementById('pin2-btn');
  const timerToggleBtn = document.getElementById('timer-toggle-btn');

  function fmtHdg(n)  { return (n == null || Number.isNaN(n)) ? '---' : Math.round(n).toString().padStart(3, '0'); }
  function fmtHeel(n) { return (n == null || Number.isNaN(n)) ? '--'  : Math.abs(Math.round(n)).toString(); }
  function fmtSog(n)  { return (n == null || Number.isNaN(n)) ? '--'  : n.toFixed(1); }
  function fmtAccel(n){ return (n == null || Number.isNaN(n)) ? '--'  : n.toFixed(2); }

  let last = { h: '', hsrc: '', he: '', hside: '', sog: '', dbg: '' };

  function render(snap) {
    const h = fmtHdg(snap.heading);
    if (h !== last.h) { headingVal.textContent = h; last.h = h; }

    const hsrc = snap.headingSrc ? snap.headingSrc.toUpperCase() : 'SEM BÚSSOLA';
    if (hsrc !== last.hsrc) { headingSrc.textContent = hsrc; last.hsrc = hsrc; }

    const he = fmtHeel(snap.heel);
    if (he !== last.he) { heelVal.textContent = he; last.he = he; }

    const hside = (snap.heel == null) ? '' : (snap.heel >= 0 ? 'BE' : 'BB');
    if (hside !== last.hside) { heelSide.textContent = hside; last.hside = hside; }

    if (heelFill && snap.heel != null) {
      const target = parseInt(localStorage.getItem('pampero.heelTarget') || '', 10) || 15;
      const abs = Math.abs(snap.heel);
      const pct = Math.min(100, (abs / 30) * 100);
      heelFill.style.width = pct + '%';
      heelFill.classList.toggle('over', abs > target);
      if (heelBarVal) heelBarVal.textContent = Math.round(abs);
      if (heelBarSide) {
        heelBarSide.textContent = abs < 0.5 ? '--' : (snap.heel >= 0 ? 'BE' : 'BB');
      }
    }

    const sog = fmtSog(snap.sog);
    if (sog !== last.sog) { sogVal.textContent = sog; last.sog = sog; }

    const dbg = `ax ${fmtAccel(snap.ax)}  ay ${fmtAccel(snap.ay)}  az ${fmtAccel(snap.az)}  ·  gz ${fmtAccel(snap.gyroZ)}°/s`;
    if (dbg !== last.dbg) { debugLine.textContent = dbg; last.dbg = dbg; }
  }

  function setStatus(text, kind = 'ok') {
    statusLine.textContent = text;
    statusLine.classList.remove('ok', 'warn', 'error');
    statusLine.classList.add(kind);
  }

  function setSailBadge(sn) {
    sailBadge.textContent = sn || '---';
  }

  function fmtTime(sec) {
    if (sec == null) return '--:--';
    if (!Number.isFinite(sec)) return '--:--';
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  function fmtEta(sec) {
    // ETA shown in raw seconds with sign. ∞ when SOG≈0, --:-- when no
    // intersection (proa parallel to the line, heading missing).
    if (sec == null) return '--';
    if (!Number.isFinite(sec)) return '∞';
    const s = Math.round(sec);
    return `${s}s`;
  }
  function fmtDist(m) {
    if (m == null || !Number.isFinite(m)) return '--';
    if (m < 100) return Math.round(m).toString();
    return Math.round(m / 5) * 5 + ''; // round to 5m for big distances
  }

  let lastStart = { timer: '', dist: '', eta: '', p1: '', p2: '', running: '' };

  function renderStart(snap, lineMetrics, timerRemaining, timerRunning) {
    const t = fmtTime(timerRemaining);
    if (t !== lastStart.timer) { timerVal.textContent = t; lastStart.timer = t; }

    const d = fmtDist(lineMetrics ? lineMetrics.distance : null);
    if (d !== lastStart.dist) { distVal.textContent = d; lastStart.dist = d; }

    const etaRaw = lineMetrics ? lineMetrics.eta : null;
    const eta = fmtEta(etaRaw);
    if (eta !== lastStart.eta) {
      etaVal.textContent = eta;
      etaVal.classList.toggle('neg', Number.isFinite(etaRaw) && etaRaw < 0);
      lastStart.eta = eta;
    }

    const p1Active = !!(lineMetrics && lineMetrics.hasMark1);
    const p1State = p1Active ? 'on' : 'off';
    if (p1State !== lastStart.p1) { pin1Btn.classList.toggle('active', p1Active); lastStart.p1 = p1State; }
    const p2Active = !!(lineMetrics && lineMetrics.hasMark2);
    const p2State = p2Active ? 'on' : 'off';
    if (p2State !== lastStart.p2) { pin2Btn.classList.toggle('active', p2Active); lastStart.p2 = p2State; }

    const running = !!timerRunning;
    const runningState = running ? 'on' : 'off';
    if (runningState !== lastStart.running) {
      timerToggleBtn.textContent = running ? '❚❚' : '▶';
      timerToggleBtn.classList.toggle('running', running);
      lastStart.running = runningState;
    }
  }

  window.UI = { render, renderStart, setStatus, setSailBadge };
})();
