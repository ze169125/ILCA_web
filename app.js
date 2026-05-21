/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * app.js — orchestration: init, wake lock, render loop, view switching.
 *
 * Two views: 'main' (HDG/HEEL/SOG) and 'start' (race-start aid with timer +
 * line metrics). View is persisted in localStorage so it survives reloads.
 * When the start timer hits 0, switches back to main and auto-starts
 * recording (so the race data captures from the gun).
 */
(function () {
  'use strict';

  const RECORDING_KEY = 'pampero.recording';
  const RACE_START_KEY = 'pampero.raceStart';
  const HEADING_SOURCE_KEY = 'pampero.headingSource';
  const VIEW_KEY = 'pampero.view';

  function getHeadingSource() {
    return localStorage.getItem(HEADING_SOURCE_KEY) === 'gps' ? 'gps' : 'auto';
  }
  function setHeadingSource(v) {
    if (v === 'gps') localStorage.setItem(HEADING_SOURCE_KEY, 'gps');
    else localStorage.removeItem(HEADING_SOURCE_KEY);
    refreshHeadingSourceLabel();
  }
  function refreshHeadingSourceLabel() {
    const el = document.getElementById('heading-source-label');
    if (el) el.textContent = getHeadingSource() === 'gps' ? 'GPS' : 'Bússola';
  }

  const sailNumber = (localStorage.getItem('pampero.sail') || '').toUpperCase();
  if (!sailNumber) {
    location.replace('setup.html');
    return;
  }
  UI.setSailBadge(sailNumber);

  function isRecording() {
    return localStorage.getItem(RECORDING_KEY) === '1';
  }
  function startRecording() {
    if (!localStorage.getItem(RACE_START_KEY)) {
      localStorage.setItem(RACE_START_KEY, new Date().toISOString());
    }
    localStorage.setItem(RECORDING_KEY, '1');
  }
  function stopRecording() {
    localStorage.removeItem(RECORDING_KEY);
  }

  // --- view switching ---
  function getView() {
    return localStorage.getItem(VIEW_KEY) === 'start' ? 'start' : 'main';
  }
  function setView(v) {
    if (v === 'start') localStorage.setItem(VIEW_KEY, 'start');
    else localStorage.removeItem(VIEW_KEY);
    document.body.classList.remove('view-main', 'view-start');
    document.body.classList.add(`view-${v}`);
    const toggle = document.getElementById('view-toggle-btn');
    if (toggle) toggle.textContent = v === 'start' ? 'Regata' : 'Largada';
  }

  // --- timer end detection ---
  let prevTimerRemaining = null;
  function checkTimerEnd(now) {
    if (now != null && prevTimerRemaining != null && prevTimerRemaining > 0 && now <= 0) {
      // Timer just hit 0
      StartLine.cue('go');
      StartLine.stopTimer();
      startRecording();
      setView('main');
      UI.setStatus('LARGADA! gravando', 'ok');
    } else if (now != null && prevTimerRemaining != null) {
      // Mid-timer cues
      const prevSec = Math.ceil(prevTimerRemaining);
      const nowSec = Math.ceil(now);
      if (prevSec > nowSec) {
        // crossed an integer second
        if (nowSec === 60 || nowSec === 30 || nowSec === 10) StartLine.cue('minute');
        else if (nowSec <= 5 && nowSec > 0) StartLine.cue('tick');
      }
    }
    prevTimerRemaining = now;
  }

  let wakeLock = null;
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (err) {
        console.warn('[app] wakeLock failed', err);
      }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
  });

  async function init() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); }
      catch (e) { console.warn('[app] sw register failed', e); }
    }
    await Sensors.start();
    await requestWakeLock();

    if (window.Storage && typeof Storage.init === 'function') {
      await Storage.init();
    }

    setView(getView());
    refreshHeadingSourceLabel();
    UI.setStatus('pronto', 'ok');
    setInterval(renderTick, 500);
    setInterval(slowTick, 1000);
  }

  function renderTick() {
    const snap = Sensors.read();
    if (getView() === 'start') {
      const metrics = StartLine.metrics(snap);
      const remaining = StartLine.getTimerRemaining();
      checkTimerEnd(remaining);
      UI.renderStart(snap, metrics, remaining);
    } else {
      UI.render(snap);
    }
  }

  async function slowTick() {
    const snap = Sensors.read();
    const rec = isRecording();

    if (rec && snap.lat != null && snap.lon != null && window.Storage) {
      await Storage.addPoint({
        t: snap.t,
        sail_number: sailNumber,
        lat: snap.lat,
        lon: snap.lon,
        sog: snap.sog,
        cog: snap.cog,
        heading: snap.heading,
        heel: snap.heel,
        acc: snap.acc,
      });
    }

    if (window.Storage && typeof Storage.pendingCount === 'function') {
      const n = await Storage.pendingCount();
      const mark = rec ? '●' : '○';
      const label = rec ? 'gravando' : 'parado';
      UI.setStatus(`${mark} ${label} · ${n} pts · ${snap.sampleHz}Hz`, rec ? 'ok' : 'warn');
    }
  }

  // --- main menu ---
  const menu = document.getElementById('menu');
  document.getElementById('menu-btn').addEventListener('click', () => menu.showModal());
  document.getElementById('view-toggle-btn').addEventListener('click', () => {
    StartLine.ensureAudio();
    setView(getView() === 'start' ? 'main' : 'start');
  });
  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'close') {
      menu.close();
    } else if (action === 'open-start') {
      StartLine.ensureAudio();
      setView('start');
      menu.close();
    } else if (action === 'start-race') {
      startRecording();
      UI.setStatus('regata iniciada', 'ok');
      menu.close();
    } else if (action === 'stop-race') {
      stopRecording();
      UI.setStatus('regata parada (dados mantidos)', 'warn');
      menu.close();
    } else if (action === 'zero-heel') {
      const ok = Sensors.zeroHeel();
      UI.setStatus(ok ? 'heel zerado' : 'sem leitura pra zerar', ok ? 'ok' : 'warn');
      menu.close();
    } else if (action === 'toggle-heading-source') {
      const next = getHeadingSource() === 'gps' ? 'auto' : 'gps';
      setHeadingSource(next);
      UI.setStatus(`fonte: ${next === 'gps' ? 'GPS' : 'Bússola'}`, 'ok');
      menu.close();
    } else if (action === 'share-gpx') {
      menu.close();
      if (window.GPX && typeof GPX.share === 'function') {
        await GPX.share(sailNumber);
      } else {
        UI.setStatus('gpx indisponível', 'warn');
      }
    } else if (action === 'share-csv') {
      menu.close();
      if (window.CSV && typeof CSV.share === 'function') {
        await CSV.share(sailNumber);
      } else {
        UI.setStatus('csv indisponível', 'warn');
      }
    } else if (action === 'open-docs') {
      menu.close();
      location.href = 'como-usar.html';
    } else if (action === 'clear-data') {
      if (confirm('Apagar todos os dados locais e o número do barco?')) {
        if (window.Storage && Storage.clearAll) await Storage.clearAll();
        stopRecording();
        StartLine.stopTimer();
        StartLine.clearMarks();
        localStorage.removeItem(RACE_START_KEY);
        localStorage.removeItem(VIEW_KEY);
        localStorage.removeItem('pampero.sail');
        location.replace('setup.html');
      } else {
        menu.close();
      }
    }
  });

  // --- start view actions ---
  document.getElementById('view-start').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-startaction]');
    if (!btn) return;
    StartLine.ensureAudio();
    const a = btn.dataset.startaction;
    const snap = Sensors.read();
    if (a === 'pin1') {
      if (snap.lat == null) { UI.setStatus('sem GPS pra pingar', 'warn'); return; }
      StartLine.setMark(0, snap.lat, snap.lon);
    } else if (a === 'pin2') {
      if (snap.lat == null) { UI.setStatus('sem GPS pra pingar', 'warn'); return; }
      StartLine.setMark(1, snap.lat, snap.lon);
    } else if (a === 't5') {
      StartLine.startTimer(300);
    } else if (a === 't4') {
      StartLine.startTimer(240);
    } else if (a === 't3') {
      StartLine.startTimer(180);
    } else if (a === 'cancel-timer') {
      StartLine.stopTimer();
      prevTimerRemaining = null;
    } else if (a === 'exit') {
      setView('main');
    }
  });

  init();
})();
