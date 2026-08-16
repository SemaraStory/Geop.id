/* ============================================================
   GEOP.ID — app.js v2.0 "AI GEOLOCATOR EDITION"
   Forensik foto + Geolokasi cerdas 100% client-side.
   Tidak butuh exif.js (parser EXIF sudah built-in).
   Butuh internet hanya untuk: OCR (Tesseract CDN) & OpenStreetMap.
============================================================ */
(() => {
'use strict';

/* ---------------- 0. UTIL ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').replace(/\x00/g, '').trim();
const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB';
const cache = new Map();
const state = { results: [], seq: 0 };

const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------------- 1. INJEKSI CSS (agar panel AI selalu rapi) ---------------- */
(function injectCSS(){
  if ($('#geop-ai-style')) return;
  document.head.appendChild(el(`<style id="geop-ai-style">
    .geop-card{background:#0f1a2e;border:1px solid #22304d;border-radius:16px;margin:18px auto;max-width:1000px;overflow:hidden;color:#e6edf7;font-family:inherit}
    .geop-head{display:flex;gap:14px;align-items:center;padding:16px;flex-wrap:wrap}
    .geop-thumb{width:86px;height:86px;object-fit:cover;border-radius:12px;border:1px solid #22304d}
    .geop-titlebox{flex:1;min-width:200px}
    .geop-name{margin:0 0 8px;font-size:1.05rem;word-break:break-all}
    .geop-badge{padding:6px 12px;border-radius:999px;font-size:.72rem;font-weight:700;letter-spacing:.4px}
    .geop-badge.ok{background:rgba(52,211,153,.12);color:#34d399;border:1px solid rgba(52,211,153,.4)}
    .geop-badge.warn{background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.4)}
    .geop-badge.bad{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.4)}
    .geop-meta{display:flex;gap:16px;text-align:right}
    .geop-meta small{display:block;color:#8ea3c8;font-size:.68rem;margin-bottom:3px}
    .geop-meta code{color:#22d3ee;font-size:.75rem}
    .geop-body{border-top:1px solid #22304d;padding:16px}
    .geop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 22px}
    .geop-kv span{display:block;color:#8ea3c8;font-size:.75rem;margin-bottom:2px}
    .geop-kv b{font-size:.9rem;font-weight:600}
    .geop-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .geop-chip{border:1px solid #22304d;background:#0b1220;border-radius:999px;padding:6px 12px;font-size:.75rem;color:#cbd5e1}
    .geop-aibox{border-top:1px dashed #22304d;padding:16px;background:#0b1424}
    .geop-aihead{font-weight:800;color:#22d3ee;font-size:.85rem;letter-spacing:.5px;margin-bottom:10px}
    .geop-aiprogresswrap{height:5px;background:#16233c;border-radius:99px;overflow:hidden;margin-bottom:10px}
    .geop-aiprogress{height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#34d399);transition:width .2s}
    .geop-ailog{max-height:150px;overflow:auto;background:#0b1220;border:1px solid #22304d;border-radius:10px;padding:10px;font-size:.75rem;color:#9fb3d9;margin-bottom:12px}
    .geop-logline{margin:2px 0}
    .geop-aiactions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    .geop-btn{border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:.8rem}
    .geop-runai{background:linear-gradient(90deg,#0891b2,#22d3ee);color:#03121a}
    .geop-runai:disabled{opacity:.5;cursor:not-allowed}
    .geop-ghost{background:transparent;border:1px solid #22304d;color:#cbd5e1}
    .geop-input{flex:1;min-width:180px;background:#0b1220;border:1px solid #22304d;border-radius:10px;padding:10px 12px;color:#e6edf7;font-size:.8rem}
    .geop-cand{border:1px solid #22304d;border-radius:12px;padding:12px;margin:8px 0;background:#0f1a2e;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .geop-cand p{margin:0;flex:1;min-width:200px;font-size:.78rem;color:#cbd5e1}
    .geop-est{margin-top:12px;border:1px solid rgba(52,211,153,.4);background:rgba(52,211,153,.07);border-radius:12px;padding:12px}
    .geop-est a{color:#34d399;font-weight:700}
    .geop-mapframe{width:100%;height:260px;border:none;border-radius:12px;margin-top:10px;filter:saturate(.9)}
    .geop-scene{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
    .geop-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f1a2e;border:1px solid #22d3ee;color:#e6edf7;padding:10px 18px;border-radius:999px;font-size:.8rem;z-index:999;box-shadow:0 8px 30px rgba(0,0,0,.5)}
    @media(max-width:640px){.geop-meta{width:100%;justify-content:space-between;text-align:left}}
  </style>`));
})();

/* ---------------- 2. PARSER EXIF BUILT-IN (JPEG/EXIF/TIFF) ---------------- */
function readExif(buf){
  const out = { make:'', model:'', software:'', datetime:'', exposure:null, fnum:null, iso:null, focal:null, gps:null };
  try{
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    let off = 2;
    while (off + 4 < v.byteLength){
      const m = v.getUint16(off);
      if ((m & 0xFF00) !== 0xFF00) break;
      const t = m & 0xFF;
      if (t === 0xDA) break;
      const len = v.getUint16(off + 2);
      if (t === 0xE1 && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) parseTiff(v, off + 10, out);
      off += 2 + len;
    }
  }catch(e){}
  return out;
}
function parseTiff(v, base, out){
  const little = v.getUint16(base) === 0x4949;
  const u16 = o => v.getUint16(o, little), u32 = o => v.getUint32(o, little);
  const SIZES = {1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8};
  const readVal = (type, count, vo) => {
    const arr = [];
    for (let i = 0; i < count; i++){
      if (type === 2){ arr.push(String.fromCharCode(v.getUint8(vo + i))); continue; }
      if (type === 3){ arr.push(u16(vo + i * 2)); continue; }
      if (type === 4 || type === 9){ arr.push(type === 9 ? v.getInt32(vo + i * 4, little) : u32(vo + i * 4)); continue; }
      if (type === 5 || type === 10){
        const n = type === 10 ? v.getInt32(vo + i * 8, little) : u32(vo + i * 8);
        const d = type === 10 ? v.getInt32(vo + i * 8 + 4, little) : u32(vo + i * 8 + 4);
        arr.push(d ? n / d : n); continue;
      }
      arr.push(v.getUint8(vo + i));
    }
    if (type === 2) return arr.join('').replace(/\0+$/,'');
    return count === 1 ? arr[0] : arr;
  };
  const readIFD = off => {
    const n = u16(off), map = {};
    for (let i = 0; i < n; i++){
      const e = off + 2 + i * 12;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const bytes = (SIZES[type] || 1) * count;
      map[tag] = readVal(type, count, bytes > 4 ? base + u32(e + 8) : e + 8);
    }
    return map;
  };
  const ifd0 = base + u32(base + 2);
  const m0 = readIFD(ifd0);
  out.make = norm(m0[0x010F]); out.model = norm(m0[0x0110]);
  out.software = norm(m0[0x0131]); out.datetime = norm(m0[0x0132]);
  if (typeof m0[0x8769] === 'number'){
    const ex = readIFD(base + m0[0x8769]);
    out.datetime = norm(ex[0x9003]) || out.datetime;
    out.exposure = ex[0x829A]; out.fnum = ex[0x829D]; out.iso = ex[0x8827]; out.focal = ex[0x920A];
  }
  if (typeof m0[0x8825] === 'number'){
    const g = readIFD(base + m0[0x8825]);
    const latR = norm(g[1]), lonR = norm(g[3]);
    if (Array.isArray(g[2]) && Array.isArray(g[4])){
      let la = g[2][0] + (g[2][1] || 0) / 60 + (g[2][2] || 0) / 3600;
      let lo = g[4][0] + (g[4][1] || 0) / 60 + (g[4][2] || 0) / 3600;
      if (latR === 'S') la = -la;
      if (lonR === 'W') lo = -lo;
      if (isFinite(la) && isFinite(lo) && !(la === 0 && lo === 0)){
        let alt = null;
        if (g[6] != null){ alt = g[6]; if (g[5] === 1) alt = -alt; }
        out.gps = { lat: la, lon: lo, alt };
      }
    }
  }
}

/* ---------------- 3. SHA-256 & DETEKSI EDITING ---------------- */
async function sha256(blob){
  try{
    const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2,'0')).join('');
  }catch(e){ return 'tidak-tersedia'; }
}
const EDIT_APPS = ['photoshop','lightroom','snapseed','picsart','vsco','canva','gimp','affinity','polarr','inshot'];
const detectEdit = sw => { sw = (sw||'').toLowerCase(); return EDIT_APPS.some(a => sw.includes(a)); };

/* ---------------- 4. AI VISION — ANALISIS SCENE ---------------- */
function analyzeScene(blob){
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try{
        const S = 48, c = document.createElement('canvas');
        c.width = S; c.height = S;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        let veg = 0, water = 0, gray = 0, sky = 0, bright = 0;
        const N = S * S;
        for (let i = 0; i < N; i++){
          const r = d[i*4], g = d[i*4+1], b = d[i*4+2];
          const mx = Math.max(r,g,b), mn = Math.min(r,g,b), lum = (r+g+b)/3;
          bright += lum;
          if (g > r + 8 && g > b + 8) veg++;
          else if (b > r + 10 && b > g + 4 && lum > 60){ if (i < N * 0.35) sky++; else water++; }
          else if (mx - mn < 18 && lum > 40 && lum < 220) gray++;
        }
        bright /= N * 255;
        const P = x => x / N, tags = [];
        if (P(veg)  > .28) tags.push('🌿 Vegetasi dominan — pedesaan / taman / tepi kota');
        if (P(sky)  > .18) tags.push('🌇 Langit terbuka — foto luar ruangan');
        if (P(water)> .15) tags.push('🌊 Terindikasi perairan — pantai / danau / sungai');
        if (P(gray) > .35) tags.push('🏙️ Permukaan abu dominan — area perkotaan / bangunan');
        if (bright  < .22) tags.push('🌒 Gelap — dalam ruangan atau malam hari');
        if (!tags.length) tags.push('🖼️ Scene netral — minim petunjuk visual');
        URL.revokeObjectURL(url);
        resolve(tags);
      }catch(e){ URL.revokeObjectURL(url); resolve(['⚠️ Scene gagal dianalisis']); }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

/* ---------------- 5. AI OCR — BACA TEKS / PLANG ---------------- */
let tessPromise = null;
function loadTesseract(){
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessPromise) tessPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = () => rej(new Error('cdn'));
    document.head.appendChild(s);
  });
  return tessPromise;
}
async function runOCR(blob, onProg){
  const T = await loadTesseract();
  const { data } = await T.recognize(blob, 'ind+eng', { logger: m => { if (m.status === 'recognizing text' && onProg) onProg(m.progress); } });
  return data.text || '';
}
const PLACE_RX = [
  /(jl\.?|jln\.?|jalan)\s+[a-z0-9][a-z0-9.\- ]{2,40}/gi,
  /(desa|kel\.?|kelurahan|kec\.?|kecamatan|kab\.?|kabupaten|kota)\s+[a-z][a-z.\- ]{2,30}/gi,
  /(masjid|musholla|gereja|pura|vihara|klenteng)\s+[a-z][a-z.\- ]{2,30}/gi,
  /(sd|smp|sma|smk|universitas|univ|kampus|sekolah|ponpes|pesantren)\s+[a-z0-9][a-z.\- ]{2,30}/gi,
  /(pasar|mall|mal|plaza|alfamart|indomaret|pertamina|spbu|bandara|stasiun|terminal|hotel|rsud|rumah\s+sakit|bank\s+[a-z]+|bca|bri|mandiri|pt\s+[a-z][a-z.\- ]{2,30})/gi
];
function extractClues(text){
  const out = [], seen = new Set();
  for (const rx of PLACE_RX){
    let m;
    while ((m = rx.exec(text))){
      const s = m[0].replace(/\s+/g,' ').trim();
      const k = s.toLowerCase();
      if (s.length >= 6 && s.length <= 60 && !seen.has(k)){ seen.add(k); out.push(s); }
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/* ---------------- 6. OPENSTREETMAP (anti-banned + cache) ---------------- */
async function osmSearch(q){
  const key = 's:' + q.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  await sleep(1100);
  try{
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&accept-language=id&q=' + encodeURIComponent(q));
    const j = await r.json();
    cache.set(key, j);
    return j;
  }catch(e){ return []; }
}
async function osmReverse(lat, lon){
  const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);
  await sleep(1100);
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&lat=${lat}&lon=${lon}`);
    const j = await r.json();
    const addr = j.display_name || 'Alamat tidak ditemukan';
    cache.set(key, addr);
    return addr;
  }catch(e){ return 'Koneksi terputus'; }
}

/* ---------------- 7. INTEL FILENAME ---------------- */
function parseFileTime(name){
  const m = name.match(/(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  return `${+m[3]} ${B[mo-1]} ${m[1]}, ${m[4]}:${m[5]}:${m[6]} (waktu lokal perangkat)`;
}

/* ---------------- 8. UI HELPERS ---------------- */
function toast(msg){
  const t = el(`<div class="geop-toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function resultsBox(){
  let box = $('#results') || $('.results') || $('#resultContainer') || $('.result-container');
  if (!box){
    box = el('<section id="results" style="max-width:1100px;margin:0 auto;padding:0 16px"></section>');
    ($('main') || document.body).appendChild(box);
  }
  return box;
}
function bindToolbar(){
  $$('button, .btn, a').forEach(b => {
    const t = (b.textContent || '').toLowerCase();
    if (t.includes('csv'))      b.addEventListener('click', e => { e.preventDefault(); exportCSV(); });
    else if (t.includes('json'))     b.addEventListener('click', e => { e.preventDefault(); exportJSON(); });
    else if (t.includes('bersih'))   b.addEventListener('click', e => { e.preventDefault(); clearAll(); });
  });
  const input = $('input[type="file"]');
  $$('[id*="drop"], .dropzone, .drop-zone, .upload-box').forEach(dz => {
    dz.addEventListener('click', () => input && input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#22d3ee'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
    dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor = ''; handleDrop(e.dataTransfer); });
  });
  if (input) input.addEventListener('change', e => handleFiles([...e.target.files]));
}

/* ---------------- 9. KARTU HASIL ---------------- */
function buildCard(r){
  return el(`
  <article class="geop-card" id="card-${r.id}">
    <div class="geop-head">
      <img class="geop-thumb" src="${URL.createObjectURL(r.blob)}" alt="">
      <div class="geop-titlebox">
        <h3 class="geop-name">${esc(r.name)}</h3>
        <span class="geop-badge warn" id="badge-${r.id}">MEMPROSES…</span>
      </div>
      <div class="geop-meta">
        <div><small>SHA-256</small><code id="hash-${r.id}">…</code></div>
        <div><small>Ukuran</small><code>${fmtBytes(r.size)}</code></div>
      </div>
    </div>
    <div class="geop-body">
      <div class="geop-grid">
        <div class="geop-kv"><span>Device</span><b id="dev-${r.id}">…</b></div>
        <div class="geop-kv"><span>Waktu</span><b id="time-${r.id}">…</b></div>
        <div class="geop-kv"><span>Software</span><b id="soft-${r.id}">…</b></div>
        <div class="geop-kv"><span>GPS</span><b id="gps-${r.id}">…</b></div>
      </div>
      <div class="geop-chips" id="chips-${r.id}"></div>
    </div>
    <div class="geop-aibox" id="ai-${r.id}" hidden>
      <div class="geop-aihead">🤖 GEO-AI — ASISTEN PENCARI LOKASI (ESTIMASI)</div>
      <div class="geop-aiprogresswrap"><div class="geop-aiprogress" id="prog-${r.id}"></div></div>
      <div class="geop-ailog" id="log-${r.id}"></div>
      <div class="geop-aiout" id="out-${r.id}"></div>
      <div class="geop-aiactions">
        <button class="geop-btn geop-runai" id="run-${r.id}">🚀 Jalankan AI Geolocator</button>
        <input class="geop-input" id="man-${r.id}" placeholder="atau ketik petunjuk manual (nama jalan / tempat)…">
        <button class="geop-btn geop-ghost" id="manbtn-${r.id}">🔎 Cari Manual</button>
      </div>
    </div>
  </article>`);
}

/* ---------------- 10. ALUR ANALISIS ---------------- */
async function handleFiles(files){
  const imgs = files.filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name) || f.type.startsWith('image/'));
  if (!imgs.length){ toast('Tidak ada file gambar yang didukung'); return; }
  toast(`Memproses ${imgs.length} foto…`);
  for (const f of imgs){
    const r = { id: ++state.seq, name: f.name, size: f.size, blob: f, est: null, candidates: [], ocr: '', scene: [] };
    state.results.push(r);
    resultsBox().appendChild(buildCard(r));
    analyze(r);
  }
}
function handleDrop(dt){
  if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry){
    const entries = [...dt.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    Promise.all(entries.map(walkEntry)).then(a => handleFiles(a.flat()));
  } else handleFiles([...dt.files]);
}
function walkEntry(en){
  return new Promise(res => {
    if (en.isFile) en.file(f => res([f]), () => res([]));
    else if (en.isDirectory){
      en.createReader().readEntries(async es => res((await Promise.all(es.map(walkEntry))).flat()), () => res([]));
    } else res([]);
  });
}
async function analyze(r){
  const hash = await sha256(r.blob); r.hash = hash;
  $('#hash-' + r.id).textContent = hash.slice(0, 14) + '…';
  const buf = await r.blob.arrayBuffer();
  const ex = readExif(buf); r.exif = ex;
  const edited = detectEdit(ex.software);

  $('#dev-'  + r.id).textContent = (ex.make + ' ' + ex.model).trim() || 'Tidak diketahui';
  $('#time-' + r.id).textContent = ex.datetime || 'Tidak diketahui';
  $('#soft-' + r.id).textContent = ex.software || '–';

  const chips = $('#chips-' + r.id);
  if (ex.exposure) chips.appendChild(el(`<span class="geop-chip">Shutter ${ex.exposure < 1 ? '1/' + Math.round(1/ex.exposure) : ex.exposure}s</span>`));
  if (ex.fnum)     chips.appendChild(el(`<span class="geop-chip">f/${(+ex.fnum).toFixed(1)}</span>`));
  if (ex.iso)      chips.appendChild(el(`<span class="geop-chip">ISO ${ex.iso}</span>`));
  if (ex.focal)    chips.appendChild(el(`<span class="geop-chip">${Math.round(ex.focal)}mm</span>`));

  const badge = $('#badge-' + r.id), gpsEl = $('#gps-' + r.id);
  if (ex.gps){
    r.gps = ex.gps;
    badge.className = 'geop-badge ok';
    badge.textContent = edited ? 'TERDETEKSI EDITING • GPS ADA' : 'DATA LENGKAP • GPS ADA';
    if (edited) badge.className = 'geop-badge bad';
    gpsEl.innerHTML = `${ex.gps.lat.toFixed(6)}, ${ex.gps.lon.toFixed(6)} — <a style="color:#22d3ee" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${ex.gps.lat},${ex.gps.lon}">Buka Maps</a>`;
    osmReverse(ex.gps.lat, ex.gps.lon).then(a => { r.address = a; gpsEl.innerHTML += `<br><small style="color:#8ea3c8">${esc(a)}</small>`; });
  } else {
    badge.className = 'geop-badge ' + (edited ? 'bad' : 'warn');
    badge.textContent = edited ? 'TERDETEKSI EDITING • TANPA GPS' : 'ASLI • TANPA GPS';
    gpsEl.textContent = 'Tidak ada — GEO-AI siap mencari estimasi';
    $('#ai-' + r.id).hidden = false;
    $('#run-' + r.id).addEventListener('click', () => runAI(r));
    $('#manbtn-' + r.id).addEventListener('click', () => {
      const q = $('#man-' + r.id).value.trim();
      if (q) searchClues(r, [q]);
    });
  }
}

/* ---------------- 11. OTAK GEO-AI ---------------- */
async function runAI(r){
  const btn = $('#run-' + r.id), log = $('#log-' + r.id), prog = $('#prog-' + r.id);
  btn.disabled = true; btn.textContent = '⏳ AI bekerja…';
  const say = t => { log.appendChild(el(`<div class="geop-logline">▸ ${t}</div>`)); log.scrollTop = log.scrollHeight; };
  try{
    say('Memulai analisis multi-sinyal…');
    say('🧠 AI Vision: membaca scene & lingkungan…');
    r.scene = await analyzeScene(r.blob);
    r.scene.forEach(s => say(esc(s)));
    const ft = parseFileTime(r.name);
    if (ft) say(`🕐 Intelijen filename: diperkirakan diambil ${ft}`);
    say('🔤 AI OCR: membaca teks/plang pada foto (10–40 detik)…');
    try{
      const text = await runOCR(r.blob, p => prog.style.width = Math.round(p * 100) + '%');
      r.ocr = text.slice(0, 500);
      const first = norm(text.split('\n').slice(0, 2).join(' | ')).slice(0, 120);
      if (first) say(`📄 Teks terbaca: “${esc(first)}”`);
      const clues = extractClues(text);
      if (clues.length){ say(`🎯 ${clues.length} petunjuk tempat ditemukan!`); await searchClues(r, clues, say); }
      else say('⚠️ Tidak ada teks tempat terbaca. Coba petunjuk manual di bawah.');
    }catch(e){ say('⚠️ OCR gagal — butuh internet untuk memuat mesin OCR.'); }
  } finally {
    btn.disabled = false; btn.textContent = ' Jalankan Ulang AI';
  }
}
async function searchClues(r, clues, say){
  say = say || (t => { const l = $('#log-' + r.id); l.appendChild(el(`<div class="geop-logline">▸ ${t}</div>`)); l.scrollTop = l.scrollHeight; });
  const out = $('#out-' + r.id);
  for (const c of clues){
    say(`🗺️ Mencocokkan “${esc(c)}” ke OpenStreetMap…`);
    const hits = await osmSearch(c);
    hits.forEach(h => {
      const cand = { lat: +h.lat, lon: +h.lon, label: h.display_name, query: c };
      if (!r.candidates.some(x => Math.abs(x.lat - cand.lat) < .02 && Math.abs(x.lon - cand.lon) < .02)) r.candidates.push(cand);
    });
  }
  renderCandidates(r);
  say(r.candidates.length ? `✅ ${r.candidates.length} kandidat lokasi ditemukan — pilih di bawah.` : '❌ Belum ada kandidat. Coba petunjuk manual.');
}
function renderCandidates(r){
  const out = $('#out-' + r.id);
  out.innerHTML = '';
  if (r.scene.length){
    const sc = el('<div class="geop-scene"></div>');
    r.scene.forEach(s => sc.appendChild(el(`<span class="geop-chip">${esc(s)}</span>`)));
    out.appendChild(sc);
  }
  r.candidates.forEach((c, i) => {
    out.appendChild(el(`
      <div class="geop-cand">
        <p><b style="color:#22d3ee">${esc(c.query)}</b><br>${esc(c.label)}</p>
        <button class="geop-btn geop-runai" data-i="${i}">📍 Pakai Lokasi Ini</button>
      </div>`));
  });
  $$('.geop-runai[data-i]', out).forEach(b => b.addEventListener('click', () => setEstimated(r, r.candidates[+b.dataset.i])));
}
function setEstimated(r, c){
  r.est = c;
  const out = $('#out-' + r.id);
  $('.geop-est', out)?.remove(); $('.geop-mapframe', out)?.remove();
  out.appendChild(el(`
    <div class="geop-est">
      🎯 <b>ESTIMASI AI:</b> ${esc(c.label)}<br>
      Koordinat: ${c.lat.toFixed(6)}, ${c.lon.toFixed(6)} —
      <a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}">Buka Google Maps</a>
    </div>`));
  out.appendChild(el(`<iframe class="geop-mapframe" src="https://www.openstreetmap.org/export/embed.html?bbox=${c.lon-.01},${c.lat-.006},${c.lon+.01},${c.lat+.006}&layer=mapnik&marker=${c.lat},${c.lon}"></iframe>`));
  const badge = $('#badge-' + r.id);
  badge.className = 'geop-badge warn';
  badge.textContent = 'ESTIMASI AI • GPS ASLI TIDAK ADA';
  toast('Estimasi lokasi terkunci 🎯');
}

/* ---------------- 12. EXPORT & BERSIHKAN ---------------- */
function exportCSV(){
  if (!state.results.length) return toast('Belum ada hasil');
  const rows = [['File','SHA-256','Device','Waktu','Software','Edit','GPS_Lat','GPS_Lon','Alamat','Estimasi_Lat','Estimasi_Lon','Estimasi_Sumber']];
  state.results.forEach(r => rows.push([r.name, r.hash, ((r.exif?.make||'')+' '+(r.exif?.model||'')).trim(), r.exif?.datetime||'', r.exif?.software||'', detectEdit(r.exif?.software)?'YA':'TIDAK', r.gps?.lat??'', r.gps?.lon??'', r.address||'', r.est?.lat??'', r.est?.lon??'', r.est?.label||'']));
  download(rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'), 'geop_laporan.csv', 'text/csv');
}
function exportJSON(){
  if (!state.results.length) return toast('Belum ada hasil');
  download(JSON.stringify(state.results.map(r => ({ file: r.name, sha256: r.hash, device: (r.exif?.make||'')+' '+(r.exif?.model||''), waktu: r.exif?.datetime, software: r.exif?.software, gps: r.gps, alamat: r.address, estimasi_ai: r.est, kandidat: r.candidates, ocr: r.ocr, scene: r.scene })), null, 2), 'geop_laporan.json', 'application/json');
}
function download(content, name, type){
  const a = el(`<a href="${URL.createObjectURL(new Blob([content], { type }))}" download="${name}"></a>`);
  document.body.appendChild(a); a.click(); a.remove();
  toast('Laporan diunduh 📥');
}
function clearAll(){
  state.results = [];
  resultsBox().innerHTML = '';
  toast('Hasil dibersihkan ️');
}

/* ---------------- 13. INIT ---------------- */
document.addEventListener('DOMContentLoaded', () => { bindToolbar(); console.log('%cGEOP.ID v2 — AI GEOLOCATOR EDITION aktif 🛰️', 'color:#22d3ee;font-weight:bold'); });
})();
