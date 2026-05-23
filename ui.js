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
  const headingVal = document.getElementById('heading-val');
  const headingSrc = document.getElementById('heading-src');
  const heelVal = document.getElementById('heel-val');
  const heelRow = document.querySelector('.row-heel');
  const sogRow = document.querySelector('.row-sog');
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

  let last = { h: '', hsrc: '', he: '', sog: '', dbg: '', hstate: '', sgstate: '' };

  const HEEL_STATE_BAND = 3; // ±3° around target = green; outside = blue/red
  const SOG_STATE_BAND = 0.3; // ±0.3 nó around target = green
  function heelState(absHeel, target) {
    if (absHeel == null || !Number.isFinite(absHeel)) return '';
    if (absHeel < target - HEEL_STATE_BAND) return 'under';
    if (absHeel > target + HEEL_STATE_BAND) return 'over';
    return 'on';
  }
  function sogState(sog, target) {
    if (sog == null || !Number.isFinite(sog) || target == null || target <= 0) return '';
    if (sog < target - SOG_STATE_BAND) return 'under';
    if (sog > target + SOG_STATE_BAND) return 'over';
    return 'on';
  }

  function render(snap) {
    const h = fmtHdg(snap.heading);
    if (h !== last.h) { headingVal.textContent = h; last.h = h; }

    const hsrc = snap.headingSrc ? snap.headingSrc.toUpperCase() : 'SEM BÚSSOLA';
    if (hsrc !== last.hsrc) { headingSrc.textContent = hsrc; last.hsrc = hsrc; }

    const he = fmtHeel(snap.heel);
    if (he !== last.he) { heelVal.textContent = he; last.he = he; }

    const target = parseInt(localStorage.getItem('pampero.heelTarget') || '', 10) || 15;
    const absHeel = snap.heel == null ? null : Math.abs(snap.heel);
    const state = heelState(absHeel, target);
    if (state !== last.hstate) {
      if (heelRow) heelRow.dataset.state = state;
      last.hstate = state;
    }

    if (heelFill && snap.heel != null) {
      const pct = Math.min(100, (absHeel / 30) * 100);
      heelFill.style.width = pct + '%';
      if (heelBarVal) heelBarVal.textContent = Math.round(absHeel);
    }

    const sog = fmtSog(snap.sog);
    if (sog !== last.sog) { sogVal.textContent = sog; last.sog = sog; }

    const sogTarget = parseInt(localStorage.getItem('pampero.sogTarget') || '', 10) || 0;
    const sgs = sogState(snap.sog, sogTarget);
    if (sgs !== last.sgstate) {
      if (sogRow) sogRow.dataset.state = sgs;
      last.sgstate = sgs;
    }

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
