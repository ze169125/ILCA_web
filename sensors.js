/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * sensors.js — compass, heel (inclinometer), GPS.
 *
 * Exports a single global `Sensors` object with:
 *   start()              attach listeners (must be called after a user gesture)
 *   read()               return latest consolidated snapshot
 *   zeroHeel(current)    store offset so current reading becomes 0
 *   state                {heading, headingSrc, heel, lat, lon, sog, cog, acc, t}
 */
(function () {
  'use strict';

  const HEEL_OFFSET_KEY = 'pampero.heelOffset';
  const DEG = 180 / Math.PI;

  const state = {
    heading: null,       // degrees magnetic, 0=N
    headingSrc: null,    // 'ios' | 'android' | 'gps' | null
    heelRaw: null,       // degrees (pre-offset, smoothed)
    heel: null,          // degrees (post-offset)
    heelOffset: parseFloat(localStorage.getItem(HEEL_OFFSET_KEY) || '0') || 0,
    lat: null,
    lon: null,
    sog: null,           // knots
    cog: null,           // degrees true (from GPS)
    acc: null,           // meters
    t: null,             // ISO timestamp of last GPS fix
  };

  // EMA filter for heel (alpha=0.1, per plan)
  const EMA_ALPHA = 0.1;

  function handleOrientation(e) {
    // iOS: webkitCompassHeading is degrees magnetic, 0=N.
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      state.heading = e.webkitCompassHeading;
      state.headingSrc = 'ios';
      return;
    }
    // Android: alpha in degrees counter-clockwise from device north.
    if (e.absolute === true && typeof e.alpha === 'number') {
      state.heading = (360 - e.alpha) % 360;
      state.headingSrc = 'android';
    }
  }

  function handleMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    const { x, z } = g;
    if (x == null || z == null) return;
    // Phone in portrait, top pointing to bow, screen up.
    // heel = atan2(ax, az) in degrees
    const raw = Math.atan2(x, z) * DEG;
    if (state.heelRaw == null) state.heelRaw = raw;
    else state.heelRaw = state.heelRaw + EMA_ALPHA * (raw - state.heelRaw);
    state.heel = state.heelRaw - state.heelOffset;
  }

  function handlePosition(p) {
    const c = p.coords;
    if (c.accuracy != null && c.accuracy > 30) return;  // discard noisy
    state.lat = c.latitude;
    state.lon = c.longitude;
    state.acc = c.accuracy;
    state.sog = (c.speed != null && c.speed >= 0) ? c.speed * 1.94384 : null;
    state.cog = (c.heading != null && !Number.isNaN(c.heading)) ? c.heading : null;
    state.t = new Date(p.timestamp || Date.now()).toISOString();
    // GPS fallback for heading: only valid with SOG > 1.5 kn
    if (state.headingSrc !== 'ios' && state.headingSrc !== 'android') {
      if (state.cog != null && state.sog != null && state.sog > 1.5) {
        state.heading = state.cog;
        state.headingSrc = 'gps';
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

    // iOS prefers 'deviceorientation'; Android may need 'deviceorientationabsolute'
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
    // Return a plain snapshot (null where unknown).
    return {
      t: new Date().toISOString(),
      lat: state.lat,
      lon: state.lon,
      sog: state.sog,
      cog: state.cog,
      heading: state.heading,
      heel: state.heel,
      acc: state.acc,
      headingSrc: state.headingSrc,
    };
  }

  function zeroHeel() {
    if (state.heelRaw == null) return false;
    state.heelOffset = state.heelRaw;
    localStorage.setItem(HEEL_OFFSET_KEY, String(state.heelOffset));
    state.heel = 0;
    return true;
  }

  window.Sensors = { start, stop, read, zeroHeel, state };
})();
