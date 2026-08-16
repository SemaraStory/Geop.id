/* ============================================================
   Geop.id — Aplikasi Utama
   Orkestrasi UI, analisis file, geocoding, dan export laporan
   ============================================================ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const EDIT_APPS = ['photoshop', 'lightroom', 'snapseed', 'picsart', 'vsco', 'canva', 'gimp', 'affinity photo', 'polarr', 'afterlight', 'pixlr', 'facetune', 'airbrush'];

  const state = { results: [] };
  const geoCache = new Map();
  let lastGeo = 0;
  let isProcessing = false;

  /* ---------------- UTILS ---------------- */
  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  async function sha256(buf) {
    try {
      if (!window.crypto || !crypto.subtle) return 'tidak tersedia (butuh HTTPS atau localhost)';
      const h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return 'gagal hash'; }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtExposure(v) {
    if (v == null) return '-';
    v = Number(v);
    if (!isFinite(v)) return '-';
    return v < 1 ? '1/' + Math.round(1 / v) + 's' : v.toFixed(1) + 's';
  }

  function verdict(r) {
    if (r.error) return { label: r.error.length > 32 ? 'TIDAK DAPAT DIPROSES' : r.error, cls: 'err' };
    if (r.tampered) return { label: 'TERDETEKSI EDITING', cls: 'bad' };
    if (!r.hasExif) return { label: 'METADATA KOSONG', cls: 'warn' };
    if (r.gps) return { label: 'DATA LENGKAP', cls: 'ok' };
    return { label: 'ASLI • TANPA GPS', cls: 'ok' };
  }

  function mapEmbed(lat, lon) {
    const d = 0.0035;
    const bbox = `${lon - d * 1.6},${lat - d},${lon + d * 1.6},${lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
  }

  async function geocode(lat, lon) {
    const key = lat.toFixed(4) + ',' + lon.toFixed(4);
    if (geoCache.has(key)) return geoCache.get(key);
    const wait = Math.max(0, lastGeo + 1100 - Date.now());
    if (wait) await sleep(wait);
    lastGeo = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=id`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const addr = d.display_name || 'Alamat tidak ditemukan';
      geoCache.set(key, addr);
      return addr;
    } catch (e) {
      const msg = 'Gagal menghubungi server peta';
      geoCache.set(key, msg);
      return msg;
    }
  }

  /* ---------------- ANALISIS ---------------- */
  async function analyzeFile(file) {
    const res = {
      name: file.name,
      size: formatBytes(file.size),
      hash: '',
      device: '-', waktu: '-', software: '-',
      tampered: false, hasExif: false,
      camera: [],
      gps: null,
      address: null,
      error: null,
      thumbUrl: null
    };

    const isJpeg = /\.(jpe?g)$/i.test(file.name) || file.type === 'image/jpeg';
    if (!isJpeg) {
      res.error = 'Format tidak didukung (hanya JPG/JPEG). Gunakan versi Python untuk HEIC/PNG.';
      return res;
    }

    try {
      res.thumbUrl = URL.createObjectURL(file);
    } catch { /* ignore */ }

    let buf;
    try { buf = await file.arrayBuffer(); }
    catch (e) { res.error = 'Gagal membaca file.'; return res; }

    res.hash = await sha256(buf);

    let exif;
    try { exif = ExifParser.parse(buf); }
    catch (e) { exif = null; }

    if (!exif) {
      res.hasExif = false;
      res.error = 'EXIF tidak ditemukan (file mungkin hanya gambar biasa).';
      return res;
    }

    const b = exif.basic || {};
    const x = exif.exif || {};
    const g = exif.gps || {};
    res.hasExif = Object.keys(b).length > 0 || Object.keys(x).length > 0;

    const make = String(b.Make || '').replace(/\0/g, '').trim();
    const model = String(b.Model || '').replace(/\0/g, '').trim();
    res.device = (make + ' ' + model).trim() || '-';
    res.waktu = String(x.DateTimeOriginal || b.DateTime || '').replace(/\0/g, '').trim() || '-';
    res.software = String(b.Software || '').replace(/\0/g, '').trim() || '-';

    if (res.software !== '-') {
      const low = res.software.toLowerCase();
      res.tampered = EDIT_APPS.some(a => low.includes(a));
    }

    if (x.ExposureTime != null) res.camera.push('Shutter ' + fmtExposure(x.ExposureTime));
    if (x.FNumber != null) res.camera.push('f/' + Number(x.FNumber).toFixed(1));
    if (x.ISO != null) {
      const iso = Array.isArray(x.ISO) ? x.ISO[0] : x.ISO;
      res.camera.push('ISO ' + iso);
    }
    if (x.FocalLength != null) res.camera.push(Math.round(Number(x.FocalLength)) + 'mm');
    if (x.LensModel) res.camera.push(String(x.LensModel).replace(/\0/g, '').trim());

    const lat = ExifParser.dmsToDecimal(g.Latitude, g.LatitudeRef);
    const lon = ExifParser.dmsToDecimal(g.Longitude, g.LongitudeRef);
    if (lat !== null && lon !== null) {
      let alt = null;
      if (typeof g.Altitude === 'number') {
        alt = g.AltitudeRef === 1 ? -g.Altitude : g.Altitude;
      }
      res.gps = { lat, lon, alt };
    }

    return res;
  }

  /* ---------------- RENDER ---------------- */
  function cardHTML(r, i) {
    const v = verdict(r);
    const hashShort = r.hash ? (r.hash.length > 16 ? r.hash.slice(0, 16) + '…' : r.hash) : '-';

    const cameraPills = r.camera.length
      ? r.camera.map(c => `<span class="pill">${esc(c)}</span>`).join('')
      : '<span class="muted small">Tidak ada data kamera</span>';

    let geoBlock = '';
    if (r.gps) {
      const altStr = r.gps.alt != null ? ` · Altitude ${r.gps.alt.toFixed(1)}m` : '';
      const latLon = `${r.gps.lat.toFixed(6)}, ${r.gps.lon.toFixed(6)}`;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${r.gps.lat},${r.gps.lon}`;
      geoBlock = `
        <div class="geo-section">
          <h4>📍 Data GPS</h4>
          <div class="geo-coords">${esc(latLon)}${esc(altStr)}</div>
          <div class="geo-actions">
            <a class="btn btn-primary btn-mini" href="${mapsUrl}" target="_blank" rel="noopener">🗺 Buka Google Maps</a>
            <button class="btn btn-ghost btn-mini" data-copy="${esc(latLon)}">📋 Salin Koordinat</button>
          </div>
          <iframe class="map-frame" src="${mapEmbed(r.gps.lat, r.gps.lon)}" loading="lazy"></iframe>
          <div class="address-line" id="addr-${i}">⏳ Mencari alamat fisik...</div>
        </div>
      `;
    }

    return `
      <article class="card">
        <div class="card-head">
          <div class="thumb">${r.thumbUrl ? `<img src="${esc(r.thumbUrl)}" alt="">` : ''}</div>
          <div class="card-head-info">
            <h3>${esc(r.name)}</h3>
            <span class="badge ${v.cls}">${esc(v.label)}</span>
          </div>
          <div class="card-head-meta">
            <small>SHA-256</small>
            <div>${esc(hashShort)}</div>
            <small style="margin-top:6px">Ukuran</small>
            <div>${esc(r.size)}</div>
          </div>
        </div>
        <div class="card-body">
          <dl class="info-grid">
            <dt>Device</dt><dd>${esc(r.device)}</dd>
            <dt>Waktu</dt><dd>${esc(r.waktu)}</dd>
            <dt>Software</dt><dd>${esc(r.software)}</dd>
            <dt>GPS</dt><dd>${r.gps ? '<span style="color:var(--accent-2);font-weight:600">✓ Ditemukan</span>' : '<span class="muted">Tidak ada</span>'}</dd>
          </dl>
          <div>
            <div class="muted small" style="margin-bottom:8px;font-weight:600">⚙️ CAMERA SETTINGS</div>
            <div class="camera-pills">${cameraPills}</div>
          </div>
        </div>
        ${geoBlock}
      </article>
    `;
  }

  function updateSummary() {
    const s = state.results;
    $('#statTotal').textContent = s.length;
    $('#statGps').textContent = s.filter(r => r.gps).length;
    $('#statNoExif').textContent = s.filter(r => !r.hasExif).length;
    $('#statEdited').textContent = s.filter(r => r.tampered).length;
    $('#summary').classList.toggle('hidden', s.length === 0);
  }

  function setProgress(i, total, name) {
    const pct = Math.round(((i + 1) / total) * 100);
    $('#progressFill').style.width = pct + '%';
    $('#progressText').textContent = `Memproses ${i + 1}/${total} · ${name}`;
  }

  function showProgress(v) {
    $('#progressWrap').classList.toggle('hidden', !v);
  }

  async function processFiles(fileList) {
    if (isProcessing) return;
    const files = Array.from(fileList).filter(f => /\.(jpe?g)$/i.test(f.name) || f.type === 'image/jpeg');
    if (!files.length) {
      alert('Tidak ada file JPG/JPEG yang ditemukan dalam pilihan Anda.');
      return;
    }
    if (files.length > 200) {
      if (!confirm(`Anda memilih ${files.length} file. Proses bisa memakan waktu lama. Lanjutkan?`)) return;
    }
    isProcessing = true;
    showProgress(true);
    for (let i = 0; i < files.length; i++) {
      setProgress(i, files.length, files[i].name);
      const r = await analyzeFile(files[i]);
      state.results.push(r);
      const idx = state.results.length - 1;
      $('#results').insertAdjacentHTML('beforeend', cardHTML(r, idx));
      if (r.gps) {
        enrichGeo(r, idx);
      }
      updateSummary();
      if (i % 3 === 2) await sleep(0);
    }
    setProgress(files.length - 1, files.length, 'Selesai!');
    await sleep(400);
    showProgress(false);
    isProcessing = false;
  }

  async function enrichGeo(r, i) {
    const el = document.getElementById('addr-' + i);
    if (!el) return;
    try {
      const addr = await geocode(r.gps.lat, r.gps.lon);
      r.address = addr;
      el.textContent = '📍 ' + addr;
    } catch (e) {
      el.textContent = '⚠️ Gagal mendapatkan alamat';
    }
  }

  /* ---------------- EXPORT ---------------- */
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  function exportCSV() {
    if (!state.results.length) { alert('Belum ada data.'); return; }
    const cols = ['Nama File', 'Ukuran', 'SHA-256', 'Device', 'Waktu', 'Software', 'Terindikasi Edit', 'Latitude', 'Longitude', 'Altitude', 'Alamat', 'Status'];
    const rows = state.results.map(r => {
      const v = verdict(r);
      return [
        r.name, r.size, r.hash, r.device, r.waktu, r.software,
        r.tampered ? 'YA' : 'TIDAK',
        r.gps ? r.gps.lat.toFixed(6) : '',
        r.gps ? r.gps.lon.toFixed(6) : '',
        (r.gps && r.gps.alt != null) ? r.gps.alt.toFixed(1) : '',
        r.address || '',
        v.label
      ].map(cell => {
        cell = String(cell ?? '');
        if (/[",\n]/.test(cell)) cell = '"' + cell.replace(/"/g, '""') + '"';
        return cell;
      });
    });
    const csv = [cols.join(','), ...rows.map(r => r.join(','))].join('\n');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    download(`Geop_Report_${ts}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportJSON() {
    if (!state.results.length) { alert('Belum ada data.'); return; }
    const data = state.results.map(r => {
      const v = verdict(r);
      return {
        file: r.name, size: r.size, sha256: r.hash,
        device: r.device, waktu: r.waktu, software: r.software,
        tampered: r.tampered, verdict: v.label,
        gps: r.gps ? { lat: r.gps.lat, lon: r.gps.lon, altitude: r.gps.alt } : null,
        address: r.address, camera: r.camera
      };
    });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    download(`Geop_Report_${ts}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  /* ---------------- EVENTS ---------------- */
  function wire() {
    const dz = $('#dropzone');
    const inputFiles = $('#inputFiles');
    const inputFolder = $('#inputFolder');

    $('#btnFiles').addEventListener('click', (e) => { e.stopPropagation(); inputFiles.click(); });
    $('#btnFolder').addEventListener('click', (e) => { e.stopPropagation(); inputFolder.click(); });
    dz.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      inputFiles.click();
    });

    ['dragenter', 'dragover'].forEach(ev =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); })
    );
    dz.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) processFiles(dt.files);
    });

    inputFiles.addEventListener('change', (e) => {
      if (e.target.files.length) processFiles(e.target.files);
      e.target.value = '';
    });
    inputFolder.addEventListener('change', (e) => {
      if (e.target.files.length) processFiles(e.target.files);
      e.target.value = '';
    });

    $('#btnCSV').addEventListener('click', exportCSV);
    $('#btnJSON').addEventListener('click', exportJSON);
    $('#btnClear').addEventListener('click', () => {
      if (!state.results.length) return;
      if (!confirm('Hapus semua hasil analisis?')) return;
      state.results.forEach(r => { if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl); });
      state.results = [];
      $('#results').innerHTML = '';
      updateSummary();
    });

    $('#results').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const txt = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(txt).then(() => {
        const old = btn.textContent;
        btn.textContent = '✓ Tersalin!';
        setTimeout(() => { btn.textContent = old; }, 1400);
      }).catch(() => {
        alert('Salin manual: ' + txt);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
