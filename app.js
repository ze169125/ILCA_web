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
  const SOG_WINDOW_KEY = 'pampero.sogWindowMs';
  const SOG_WINDOW_OPTIONS = [0, 1000, 2000, 3000, 5000];
  const HEEL_MODE_KEY = 'pampero.heelMode';
  const HEEL_TARGET_KEY = 'pampero.heelTarget';
  const HEEL_TARGET_OPTIONS = [10, 15, 20, 25, 30];

  function getHeelMode() {
    return localStorage.getItem(HEEL_MODE_KEY) === 'bar' ? 'bar' : 'number';
  }
  function getHeelTarget() {
    const v = parseInt(localStorage.getItem(HEEL_TARGET_KEY) || '', 10);
    return HEEL_TARGET_OPTIONS.includes(v) ? v : 15;
  }
  function applyHeelMode() {
    const row = document.querySelector('.row-heel');
    if (row) row.dataset.mode = getHeelMode();
    const target = getHeelTarget();
    const ln = document.getElementById('heel-label-neg');
    const lp = document.getElementById('heel-label-pos');
    if (ln) ln.textContent = `-${target}°`;
    if (lp) lp.textContent = `+${target}°`;
  }

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

  function getSogWindowMs() {
    const v = parseInt(localStorage.getItem(SOG_WINDOW_KEY) || '', 10);
    return SOG_WINDOW_OPTIONS.includes(v) ? v : 2000;
  }
  function cycleSogWindow() {
    const cur = getSogWindowMs();
    const idx = SOG_WINDOW_OPTIONS.indexOf(cur);
    const next = SOG_WINDOW_OPTIONS[(idx + 1) % SOG_WINDOW_OPTIONS.length];
    if (next === 2000) localStorage.removeItem(SOG_WINDOW_KEY);
    else localStorage.setItem(SOG_WINDOW_KEY, String(next));
    refreshSogWindowLabel();
    return next;
  }
  function refreshSogWindowLabel() {
    const el = document.getElementById('sog-window-label');
    if (el) {
      const ms = getSogWindowMs();
      el.textContent = ms === 0 ? 'cru' : `${ms / 1000}s`;
    }
  }

  const sailNumber = (localStorage.getItem('pampero.sail') || '').trim();
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
  // Header toggle only swaps main ↔ start. Settings is opened from the menu
  // and the Back button returns to whatever view was previously active.
  let returnView = 'main';
  function getView() {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'start' || v === 'settings') return v;
    return 'main';
  }
  function setView(v) {
    if (v === 'main') localStorage.removeItem(VIEW_KEY);
    else localStorage.setItem(VIEW_KEY, v);
    document.body.classList.remove('view-main', 'view-start', 'view-settings');
    document.body.classList.add(`view-${v}`);
    const toggle = document.getElementById('view-toggle-btn');
    if (toggle) {
      // Header toggle is hidden in settings; otherwise shows the other live view.
      toggle.textContent = v === 'start' ? 'Regata' : 'Largada';
      toggle.style.display = v === 'settings' ? 'none' : '';
    }
    if (v === 'settings') refreshSettingsUI();
  }

  function refreshSettingsUI() {
    const src = getHeadingSource();
    document.querySelectorAll('#seg-source button').forEach(b => {
      b.classList.toggle('active', b.dataset.source === src);
    });
    const sog = String(getSogWindowMs());
    document.querySelectorAll('#seg-sog button').forEach(b => {
      b.classList.toggle('active', b.dataset.sog === sog);
    });
    const heelMode = getHeelMode();
    document.querySelectorAll('#seg-heel-mode button').forEach(b => {
      b.classList.toggle('active', b.dataset.heelMode === heelMode);
    });
    const heelTarget = String(getHeelTarget());
    document.querySelectorAll('#seg-heel-target button').forEach(b => {
      b.classList.toggle('active', b.dataset.heelTarget === heelTarget);
    });
  }

  // --- timer end detection ---
  let prevTimerRemaining = null;
  function checkTimerEnd(now) {
    if (now != null && prevTimerRemaining != null && prevTimerRemaining > 0 && now <= 0
        && StartLine.isRunning()) {
      // Timer just hit 0 while running (not manually zeroed via -1min while paused)
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
    refreshSogWindowLabel();
    applyHeelMode();
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
      UI.renderStart(snap, metrics, remaining, StartLine.isRunning());
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
    const next = getView() === 'start' ? 'main' : 'start';
    if (next === 'start') StartLine.ensureDefaultTimer();
    setView(next);
  });
  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'close') {
      menu.close();
    } else if (action === 'open-start') {
      StartLine.ensureAudio();
      StartLine.ensureDefaultTimer();
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
    } else if (action === 'open-settings') {
      returnView = getView() === 'start' ? 'start' : 'main';
      setView('settings');
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
    } else if (action === 'open-download') {
      menu.close();
      location.href = 'baixar.html';
    }
  });

  // --- settings view actions ---
  async function clearAllData() {
    if (window.Storage && Storage.clearAll) await Storage.clearAll();
    stopRecording();
    StartLine.stopTimer();
    StartLine.clearMarks();
    localStorage.removeItem(RACE_START_KEY);
    localStorage.removeItem(VIEW_KEY);
    localStorage.removeItem(SOG_WINDOW_KEY);
    localStorage.removeItem(HEADING_SOURCE_KEY);
    localStorage.removeItem(HEEL_MODE_KEY);
    localStorage.removeItem(HEEL_TARGET_KEY);
    localStorage.removeItem('pampero.sail');
    location.replace('setup.html');
  }

  document.getElementById('view-settings').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-settingsaction], button[data-source], button[data-sog], button[data-heel-mode], button[data-heel-target]');
    if (!btn) return;
    if (btn.dataset.source) {
      setHeadingSource(btn.dataset.source);
      refreshSettingsUI();
      return;
    }
    if (btn.dataset.sog) {
      const ms = parseInt(btn.dataset.sog, 10);
      if (ms === 2000) localStorage.removeItem(SOG_WINDOW_KEY);
      else localStorage.setItem(SOG_WINDOW_KEY, String(ms));
      refreshSettingsUI();
      return;
    }
    if (btn.dataset.heelMode) {
      if (btn.dataset.heelMode === 'number') localStorage.removeItem(HEEL_MODE_KEY);
      else localStorage.setItem(HEEL_MODE_KEY, btn.dataset.heelMode);
      applyHeelMode();
      refreshSettingsUI();
      return;
    }
    if (btn.dataset.heelTarget) {
      if (btn.dataset.heelTarget === '15') localStorage.removeItem(HEEL_TARGET_KEY);
      else localStorage.setItem(HEEL_TARGET_KEY, btn.dataset.heelTarget);
      applyHeelMode();
      refreshSettingsUI();
      return;
    }
    const a = btn.dataset.settingsaction;
    if (a === 'back') {
      setView(returnView);
    } else if (a === 'zero-heel') {
      const ok = Sensors.zeroHeel();
      UI.setStatus(ok ? 'heel zerado' : 'sem leitura pra zerar', ok ? 'ok' : 'warn');
    } else if (a === 'clear-data') {
      if (confirm('Apagar TODOS os dados locais (gravação, número da vela, marcas, calibração)?')) {
        await clearAllData();
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
    if (a === 'pin1' || a === 'pin2') {
      const idx = a === 'pin1' ? 0 : 1;
      const label = idx === 0 ? 'Bóia' : 'CR';
      if (StartLine.getMark(idx)) {
        StartLine.clearMark(idx);
        UI.setStatus(`${label} apagada`, 'warn');
      } else {
        if (snap.lat == null) { UI.setStatus('sem GPS pra pingar', 'warn'); return; }
        StartLine.setMark(idx, snap.lat, snap.lon);
        UI.setStatus(`${label} marcada`, 'ok');
      }
    } else if (a === 't-1') {
      StartLine.adjustTimer(-60);
    } else if (a === 't+1') {
      StartLine.adjustTimer(60);
    } else if (a === 'toggle-timer') {
      if (StartLine.isRunning()) {
        StartLine.pauseTimer();
      } else {
        StartLine.startTimer();
      }
      prevTimerRemaining = null;
    } else if (a === 'round') {
      StartLine.roundTimerToMinute();
    } else if (a === 'exit') {
      setView('main');
    }
  });

  init();
})();
