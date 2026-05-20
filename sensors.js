/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * sensors.js — compass, heel (inclinometer), GPS.
 *
 * Native sensor events fire at ~60Hz and are buffered. read() returns the
 * mean over the last WINDOW_MS milliseconds (circular mean for heading,
 * linear mean for heel). Visual layer is expected to poll at 2Hz.
 */
(function () {
  'use strict';

  const HEEL_OFFSET_KEY = 'pampero.heelOffset';
  const DEG = 180 / Math.PI;

  // Sliding-window means. Tune to taste: bigger → smoother but more lag.
  const WINDOW_MS = 500;
  // Widen up to this when the default window has no samples (e.g. GPS at 1Hz
  // with no compass). Prevents the display flickering to "---" between fixes.
  const FALLBACK_WINDOW_MS = 3000;
  // Keep a bit of margin in the buffer so trimming is cheap.
  const BUFFER_MS = 4000;

  // Complementary filter blend: higher = trust gyro more (rejects motion
  // accels) but drifts faster; lower = trust accel more (locks to gravity).
  // 0.98 at 60Hz → time-constant ~0.8s for accel correction.
  const FUSION_ALPHA = 0.98;

  const state = {
    headingSrc: null,     // 'ios' | 'android' | 'gps' | null
    heelOffset: parseFloat(localStorage.getItem(HEEL_OFFSET_KEY) || '0') || 0,
    heelFused: null,      // current fused heel estimate, degrees, pre-offset
    lastMotionT: null,    // performance.now() of last fusion update
    lastGyroZ: null,      // last gyro rate around phone Z axis (deg/s), debug
    lat: null,
    lon: null,
    sog: null,
    cog: null,
    acc: null,
    t: null,
    sampleHz: 0,
  };

  // Ring buffers
  const headBuf = []; // {t, v: degrees}
  const motionBuf = []; // {t, x, y, z}

  function pushBuf(buf, v) {
    const now = performance.now();
    buf.push({ t: now, v });
    const cutoff = now - BUFFER_MS;
    while (buf.length && buf[0].t < cutoff) buf.shift();
  }

  function pushMotion(x, y, z) {
    const now = performance.now();
    motionBuf.push({ t: now, x, y, z });
    const cutoff = now - BUFFER_MS;
    while (motionBuf.length && motionBuf[0].t < cutoff) motionBuf.shift();
  }

  function meanMotion(windowMs) {
    const cutoff = performance.now() - windowMs;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let i = motionBuf.length - 1; i >= 0; i--) {
      const m = motionBuf[i];
      if (m.t < cutoff) break;
      sx += m.x; sy += m.y; sz += m.z; n++;
    }
    if (!n) return null;
    return { ax: sx/n, ay: sy/n, az: sz/n };
  }

  // Universal heel formula. Phone upright in portrait, top to sky, screen
  // facing the sailor (back to bow). When the boat heels, gravity in phone
  // frame tilts in the X direction. The sign of ay is platform-dependent
  // (iOS Safari and Android Chrome report opposite signs for
  // accelerationIncludingGravity), so we use sign(ay) to normalize.
  //
  // Returns degrees: 0 = level, +N = starboard heel (BE), -N = port (BB).
  function computeHeel(ax, ay) {
    if (ay == null || Math.abs(ay) < 0.01) return null;
    return -Math.sign(ay) * Math.atan2(ax, Math.abs(ay)) * DEG;
  }

  function meanCircularInWindow(buf, windowMs) {
    const cutoff = performance.now() - windowMs;
    let sx = 0, sy = 0, n = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const s = buf[i];
      if (s.t < cutoff) break;
      const r = s.v * Math.PI / 180;
      sx += Math.sin(r);
      sy += Math.cos(r);
      n++;
    }
    if (!n) return null;
    const deg = Math.atan2(sx, sy) * DEG;
    return (deg + 360) % 360;
  }

  // Tries windowMs first (good for 60Hz magnetometer); if no samples, widens
  // up to fallbackMs (covers gaps between 1Hz GPS fixes so the display
  // doesn't flicker to "---").
  function meanCircularRecent(buf, windowMs, fallbackMs) {
    const fast = meanCircularInWindow(buf, windowMs);
    if (fast != null) return fast;
    if (fallbackMs && fallbackMs > windowMs) {
      return meanCircularInWindow(buf, fallbackMs);
    }
    return null;
  }

  // --- sample-rate meter (sliding 1s window on heading buffer) ---
  function calcRate() {
    const cutoff = performance.now() - 1000;
    let n = 0;
    for (let i = headBuf.length - 1; i >= 0; i--) {
      if (headBuf[i].t < cutoff) break;
      n++;
    }
    return n;
  }

  function handleOrientation(e) {
    // User-forced GPS mode: ignore compass entirely.
    if (localStorage.getItem('pampero.headingSource') === 'gps') return;

    let raw = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      raw = e.webkitCompassHeading;
      state.headingSrc = 'ios';
    } else if (e.absolute === true && typeof e.alpha === 'number') {
      raw = (360 - e.alpha) % 360;
      state.headingSrc = 'android';
    }
    if (raw != null) pushBuf(headBuf, raw);
  }

  function handleMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    const { x, y, z } = g;
    if (x == null || y == null || z == null) return;
    pushMotion(x, y, z);

    // Gyro rate around the phone's Z axis (rotationRate.alpha). For phone
    // upright with screen toward the sailor, Z = bow-stern axis → heel rate.
    // Right-hand rule: +Z out of screen, +alpha = CCW viewed from +Z, which
    // is the right side of the phone moving UP (= port heel). We want
    // +heel = starboard, so we negate.
    const r = e.rotationRate;
    const gyroZ = (r && typeof r.alpha === 'number' && !Number.isNaN(r.alpha))
      ? r.alpha : null;
    state.lastGyroZ = gyroZ;

    updateHeelFusion(x, y, gyroZ, performance.now());
  }

  function updateHeelFusion(ax, ay, gyroZ, nowMs) {
    const accelHeel = computeHeel(ax, ay);
    if (accelHeel == null) return;

    if (state.heelFused == null || state.lastMotionT == null || gyroZ == null) {
      state.heelFused = accelHeel;
      state.lastMotionT = nowMs;
      return;
    }
    const dt = (nowMs - state.lastMotionT) / 1000;
    state.lastMotionT = nowMs;
    if (dt <= 0 || dt > 0.5) {
      // gap too big (tab inactive, sensor stalled) — re-seed from accel
      state.heelFused = accelHeel;
      return;
    }
    const gyroDelta = -gyroZ * dt;
    state.heelFused = FUSION_ALPHA * (state.heelFused + gyroDelta)
                    + (1 - FUSION_ALPHA) * accelHeel;
  }

  function handlePosition(p) {
    const c = p.coords;
    if (c.accuracy != null && c.accuracy > 30) return;
    state.lat = c.latitude;
    state.lon = c.longitude;
    state.acc = c.accuracy;
    state.sog = (c.speed != null && c.speed >= 0) ? c.speed * 1.94384 : null;
    state.cog = (c.heading != null && !Number.isNaN(c.heading)) ? c.heading : null;
    state.t = new Date(p.timestamp || Date.now()).toISOString();
    const forceGps = localStorage.getItem('pampero.headingSource') === 'gps';
    if (forceGps || (state.headingSrc !== 'ios' && state.headingSrc !== 'android')) {
      // Lower threshold when user explicitly chose GPS — they accept noisy
      // COG at low speed in exchange for not trusting the magnetometer.
      const minSog = forceGps ? 0.5 : 1.5;
      if (state.cog != null && state.sog != null && state.sog > minSog) {
        pushBuf(headBuf, state.cog);
        state.headingSrc = 'gps';
      } else if (forceGps) {
        // Keep showing last GPS reading; don't reset to null mid-flight.
        if (state.headingSrc !== 'gps') state.headingSrc = 'gps';
      } else if (state.headingSrc !== 'gps') {
        state.headingSrc = null;
      }
    }
  }

  function handlePositionError(err) {
    console.warn('[sensors] GPS error', err.code, err.message);
  }

  let started = false;
  let watchId = null;

  async function start() {
    if (started) return;
    started = true;

    if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    }
    if (typeof DeviceMotionEvent !== 'undefined'
        && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission(); } catch (_) {}
    }

    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('devicemotion', handleMotion, true);

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handlePositionError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    }
  }

  function stop() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('devicemotion', handleMotion, true);
    started = false;
  }

  function read() {
    const heading = meanCircularRecent(headBuf, WINDOW_MS, FALLBACK_WINDOW_MS);
    const m = meanMotion(WINDOW_MS);
    const heel = (state.heelFused == null) ? null : state.heelFused - state.heelOffset;
    state.sampleHz = calcRate();
    return {
      t: new Date().toISOString(),
      lat: state.lat,
      lon: state.lon,
      sog: state.sog,
      cog: state.cog,
      heading,
      heel,
      acc: state.acc,
      headingSrc: state.headingSrc,
      sampleHz: state.sampleHz,
      ax: m ? m.ax : null,
      ay: m ? m.ay : null,
      az: m ? m.az : null,
      gyroZ: state.lastGyroZ,
    };
  }

  function zeroHeel() {
    if (state.heelFused == null) return false;
    state.heelOffset = state.heelFused;
    localStorage.setItem(HEEL_OFFSET_KEY, String(state.heelOffset));
    return true;
  }

  window.Sensors = { start, stop, read, zeroHeel, state, WINDOW_MS };
})();
