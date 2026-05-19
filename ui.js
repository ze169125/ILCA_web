/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * ui.js — DOM updates only. No canvas; numbers-only layout.
 */
(function () {
  'use strict';

  const headingVal = document.getElementById('heading-val');
  const headingSrc = document.getElementById('heading-src');
  const heelVal = document.getElementById('heel-val');
  const heelSide = document.getElementById('heel-side');
  const sogVal = document.getElementById('sog-val');
  const statusLine = document.getElementById('status-line');
  const debugLine = document.getElementById('debug-line');
  const sailBadge = document.getElementById('sail-badge');

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

  window.UI = { render, setStatus, setSailBadge };
})();
