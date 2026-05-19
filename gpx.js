/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * gpx.js — build + download GPX with pampero: extensions from local IndexedDB.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
    }[c]));
  }

  function buildGpx(sailNumber, points) {
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    parts.push('<gpx version="1.1" creator="Pampero"\n');
    parts.push('     xmlns="http://www.topografix.com/GPX/1/1"\n');
    parts.push('     xmlns:pampero="https://pampero.pop.coop/xmlns/gpx/v1">\n');
    parts.push(`  <trk>\n    <name>${esc(sailNumber)}</name>\n    <trkseg>\n`);
    for (const p of points) {
      parts.push(`      <trkpt lat="${p.lat}" lon="${p.lon}">\n`);
      parts.push(`        <time>${esc(p.t)}</time>\n`);
      const ext = [];
      if (p.heel    != null) ext.push(`          <pampero:heel>${p.heel}</pampero:heel>`);
      if (p.heading != null) ext.push(`          <pampero:heading>${p.heading}</pampero:heading>`);
      if (p.sog     != null) ext.push(`          <pampero:sog>${p.sog}</pampero:sog>`);
      if (p.cog     != null) ext.push(`          <pampero:cog>${p.cog}</pampero:cog>`);
      if (ext.length) {
        parts.push('        <extensions>\n');
        parts.push(ext.join('\n') + '\n');
        parts.push('        </extensions>\n');
      }
      parts.push('      </trkpt>\n');
    }
    parts.push('    </trkseg>\n  </trk>\n</gpx>\n');
    return parts.join('');
  }

  async function share(sailNumber) {
    if (!window.Storage) return;
    const points = await Storage.allPoints();
    const xml = buildGpx(sailNumber, points);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    await Share.shareOrDownload(blob, `pampero-${sailNumber}-${stamp}.gpx`);
  }

  window.GPX = { buildGpx, share };
})();
