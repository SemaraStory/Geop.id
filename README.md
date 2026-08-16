# 📡 Geop.id — Forensik Foto & Geolokasi Digital

Tool forensik web ringan untuk membaca metadata EXIF, mengekstrak koordinat GPS, mendeteksi manipulasi foto, dan melakukan *reverse geocoding* — **100% berjalan di browser, tanpa server**.

## ✨ Fitur Utama

- 🔒 **100% Client-Side** — Foto tidak pernah diunggah. Semua pemrosesan dilakukan di browser Anda menggunakan JavaScript.
- 📊 **EXIF Penuh** — Merek perangkat, model, waktu pengambilan, software, setting kamera (ISO, aperture, shutter, focal length, lensa).
- 🗺️ **GPS & Reverse Geocoding** — Koordinat latitude/longitude + alamat fisik via OpenStreetMap Nominatim.
- 🛡️ **Deteksi Manipulasi** — Otomatis mendeteksi jejak software editing: Photoshop, Lightroom, Snapseed, VSCO, PicsArt, dll.
- #️⃣ **SHA-256 Hashing** — Sidik jari digital untuk integritas barang bukti (Chain of Custody).
- 📁 **Batch Scan** — Unggah seluruh folder sekaligus (hingga 200 file).
- 📋 **Export Laporan** — Unduh hasil dalam format **CSV** atau **JSON** untuk laporan investigasi.
- 🌐 **Responsive** — Rapi di desktop, tablet, dan mobile.
- 🕶️ **Privasi Pertama** — Tidak ada tracking, tidak ada analytics, tidak ada iklan.

## 🚀 Cara Menjalankan Lokal

### Opsi 1: Klik Ganda
Buka `index.html` langsung di browser (Chrome / Edge / Firefox).
> Catatan: `crypto.subtle` (SHA-256) membutuhkan konteks aman. Pada `file://` umumnya berfungsi di Chrome/Edge modern, tapi jika hash tidak muncul, gunakan Opsi 2.

### Opsi 2: Local Server (Direkomendasikan)
```bash
# Dengan Python
python -m http.server 8000

# Atau Node.js
npx serve
```
Lalu buka `http://localhost:8000`.

## 🌍 Deploy ke GitHub Pages (Gratis)

1. Buat repository baru di GitHub, misal: `geop-id`
2. Upload seluruh isi folder ini (`index.html`, `css/`, `js/`, `README.md`) ke branch `main`
3. Masuk ke **Settings → Pages**
4. Pilih **Deploy from a branch**, branch `main`, folder `/ (root)`
5. Klik **Save**. Website akan live di `https://<username>.github.io/geop-id/`

### Alternatif: Custom Domain (geop.id)
Setelah deploy, tambahkan file `CNAME` berisi `geop.id`, lalu arahkan DNS domain Anda ke GitHub Pages via CNAME record `<username>.github.io`.

## 📂 Struktur Folder

```
Geop.id/
├── index.html       # Halaman utama
├── css/
│   └── style.css    # Styling (tema cyber forensic)
├── js/
│   ├── exif.js      # Parser EXIF murni (tanpa library)
│   └── app.js       # Logika aplikasi & UI
└── README.md        # Dokumentasi ini
```

## 🧠 Keunggulan Arsitektur

- **Tanpa Library Eksternal**: Parser EXIF ditulis dari nol, tidak bergantung pada `exif-js`, `exifreader`, atau library lain. Ini berarti: tidak ada masalah CDN mati, tidak ada dependensi yang perlu di-update, dan ukuran total sangat kecil (~18 KB).
- **Anti-Banned Nominatim**: Dilengkapi cache alamat + delay 1.1 detik antar-request untuk mematuhi kebijakan OpenStreetMap.
- **Anti-Crash**: Parser dilengkapi try/catch di setiap langkah dan *sanity check* jumlah entry IFD.
- **Verdict Engine**: Otomatis memberi "vonis" pada setiap foto: DATA LENGKAP / ASLI / TERDETEKSI EDITING / METADATA KOSONG.

## ⚙️ Batasan Teknis

- Hanya mendukung format **JPG / JPEG**. File **HEIC, PNG, WEBP** tidak bisa dibaca di versi web karena keterbatasan parser bawaan browser. Gunakan **versi Python (Forensic Pro V4)** untuk format lain.
- Reverse geocoding membutuhkan koneksi internet (ke server Nominatim OpenStreetMap).
- Metadata pada foto dari **WhatsApp / Instagram / Facebook / Twitter / Telegram** biasanya sudah di-strip otomatis oleh platform sebelum diunggah — tool akan menampilkannya sebagai "METADATA KOSONG". Ini adalah perilaku **normal**, bukan bug.
- SHA-256 membutuhkan *secure context* (HTTPS atau localhost).

## 🛠️ Teknologi

- **Vanilla JavaScript** (tanpa React/Vue/framework)
- **Web Crypto API** untuk SHA-256
- **Fetch API** untuk reverse geocoding
- **OpenStreetMap** untuk embed peta
- **CSS Grid & Flexbox** untuk layout responsif
- **Plus Jakarta Sans** sebagai tipografi utama

## 📸 Screenshot

*Tambahkan screenshot Anda sendiri setelah deploy.*

## 🤝 Kontribusi

Kontribusi, saran, dan laporan bug sangat diterima. Silakan buat **Issue** atau **Pull Request** di repository ini.

## 📜 Lisensi

Dirilis untuk tujuan edukasi literasi digital.

> ⚖️ **Disclaimer:** Tool ini ditujukan untuk edukasi dan analisis pribadi. Pengguna bertanggung jawab atas kepatuhan terhadap hukum privasi yang berlaku di wilayahnya. Jangan gunakan untuk tujuan ilegal seperti stalking, doxxing, atau pelanggaran privasi orang lain.

---

Made with 💙 in Indonesia · © 2026 Geop.id
