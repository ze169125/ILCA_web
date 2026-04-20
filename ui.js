/* ui.js — canvas rendering (compass + heel) and DOM updates. */
(function () {
  'use strict';

  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function fitCanvas(cv) {
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
  }

  const compass = document.getElementById('compass');
  const heel = document.getElementById('heel');
  const headingVal = document.getElementById('heading-val');
  const headingSrc = document.getElementById('heading-src');
  const heelVal = document.getElementById('heel-val');
  const heelSide = document.getElementById('heel-side');
  const sogVal = document.getElementById('sog-val');
  const statusLine = document.getElementById('status-line');
  const sailBadge = document.getElementById('sail-badge');

  function resizeAll() {
    fitCanvas(compass);
    fitCanvas(heel);
  }
  window.addEventListener('resize', resizeAll);
  window.addEventListener('orientationchange', resizeAll);

  const QORI = '#FCDD09';
  const FG = '#e8e8e8';
  const DIM = '#666';

  function drawCompass(headingDeg) {
    const w = compass.width, h = compass.height;
    const ctx = compass.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.42;

    // outer ring
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // rotating dial: rotate by -heading so current heading is at the top
    ctx.save();
    ctx.translate(cx, cy);
    if (headingDeg != null) ctx.rotate(-headingDeg * Math.PI / 180);

    // tick marks every 10°, big every 30°
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = deg * Math.PI / 180;
      const isBig = deg % 30 === 0;
      const t1 = r - (isBig ? 16 * dpr : 8 * dpr);
      const t2 = r;
      ctx.strokeStyle = isBig ? FG : DIM;
      ctx.lineWidth = (isBig ? 2 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(Math.sin(rad) * t1, -Math.cos(rad) * t1);
      ctx.lineTo(Math.sin(rad) * t2, -Math.cos(rad) * t2);
      ctx.stroke();
    }

    // cardinals
    ctx.fillStyle = FG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${22 * dpr}px system-ui, sans-serif`;
    const card = [['N', 0, QORI], ['E', 90, FG], ['S', 180, FG], ['W', 270, FG]];
    for (const [label, deg, col] of card) {
      const rad = deg * Math.PI / 180;
      const rr = r - 36 * dpr;
      ctx.fillStyle = col;
      ctx.fillText(label, Math.sin(rad) * rr, -Math.cos(rad) * rr);
    }
    ctx.restore();

    // fixed bow arrow on top
    ctx.fillStyle = QORI;
    ctx.beginPath();
    const ay = cy - r - 2 * dpr;
    ctx.moveTo(cx, ay - 14 * dpr);
    ctx.lineTo(cx - 10 * dpr, ay + 2 * dpr);
    ctx.lineTo(cx + 10 * dpr, ay + 2 * dpr);
    ctx.closePath();
    ctx.fill();
  }

  function drawHeel(heelDeg) {
    const w = heel.width, hh = heel.height;
    const ctx = heel.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh * 0.85;
    const r = Math.min(w * 0.45, hh * 0.85);

    // arc from -45° (left) to +45° (right). In canvas, angles from east ccw.
    // We want a horizontal arc above the center: from 180+45 to 360-45 going CW.
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI + Math.PI * 0.25, 2 * Math.PI - Math.PI * 0.25, false);
    ctx.stroke();

    // tick marks every 10° on the arc (range -45..+45)
    for (let d = -45; d <= 45; d += 10) {
      const ang = -Math.PI / 2 + (d * Math.PI / 180); // 0 at top
      const x1 = cx + Math.cos(ang) * (r - 8 * dpr);
      const y1 = cy + Math.sin(ang) * (r - 8 * dpr);
      const x2 = cx + Math.cos(ang) * r;
      const y2 = cy + Math.sin(ang) * r;
      ctx.strokeStyle = d === 0 ? QORI : DIM;
      ctx.lineWidth = (d === 0 ? 2 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // bubble at current heel (clamp -45..+45)
    if (heelDeg != null) {
      const d = Math.max(-45, Math.min(45, heelDeg));
      const ang = -Math.PI / 2 + (d * Math.PI / 180);
      const bx = cx + Math.cos(ang) * (r - 20 * dpr);
      const by = cy + Math.sin(ang) * (r - 20 * dpr);
      ctx.fillStyle = QORI;
      ctx.beginPath();
      ctx.arc(bx, by, 10 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function fmtInt(n) { return (n == null || Number.isNaN(n)) ? '--' : Math.round(n).toString().padStart(3, '0'); }
  function fmtHeel(n) { return (n == null || Number.isNaN(n)) ? '--' : Math.abs(Math.round(n)).toString(); }
  function fmtSog(n)  { return (n == null || Number.isNaN(n)) ? '--' : n.toFixed(1); }

  function render(snap) {
    drawCompass(snap.heading);
    drawHeel(snap.heel);
    headingVal.textContent = fmtInt(snap.heading);
    headingSrc.textContent = snap.headingSrc ? `(${snap.headingSrc})` : 'sem bússola';
    heelVal.textContent = fmtHeel(snap.heel);
    heelSide.textContent = (snap.heel == null) ? ''
      : (snap.heel >= 0 ? '→ BE' : '← BB');
    sogVal.textContent = fmtSog(snap.sog);
  }

  function setStatus(text, kind = 'ok') {
    statusLine.textContent = text;
    statusLine.classList.remove('ok', 'warn', 'error');
    statusLine.classList.add(kind);
  }

  function setSailBadge(sn) {
    sailBadge.textContent = sn || '---';
  }

  // Initial canvas fit + first paint
  requestAnimationFrame(() => {
    resizeAll();
    drawCompass(null);
    drawHeel(null);
  });

  window.UI = { render, setStatus, setSailBadge, resizeAll };
})();
