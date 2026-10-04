# OpenBryton Pro — Vercel Web Application

Aplikasi web modern siap deploy di **Vercel** untuk mengonversi file rute **GPX** menjadi format rute **Bryton Rider** lengkap dengan notifikasi **Turn-by-Turn (TBT)** dari **OpenStreetMap (OSRM & Overpass)**, **Reverse Geocoding Nama Jalan**, **Smart Angle Turn Detection**, **Satelit HD**, **Editor Geser & Tambah Titik di Peta**, **Tambah/Hapus Belokan Manual**, dan **Sinkronisasi Interaktif Peta ke Tabel**.

---

## 💡 Jawaban & Solusi Permintaan Anda:

### 1. Kenapa TBT OSM Tidak Pernah Muncul? Apakah Harus Pakai API?
- **Penyebab Utama**: Server demo publik OSRM (`router.project-osrm.org`) sangat sering membatasi request langsung dari browser JavaScript (masalah **CORS** atau batas rate-limit **HTTP 429 Too Many Requests**). Selain itu, jika file GPX direkam di jalan setapak/sepeda dan server publik hanya mengaktifkan profil mobil, OSRM menolak rute tersebut.
- **Solusi yang Kami Terapkan**:
  1. **Built-in OpenStreetMap Overpass & Nominatim Engine**: Sistem kini langsung membaca data persimpangan jalan dan nama jalan resmi dari OpenStreetMap tanpa bergantung pada server routing demo publik! Belokan OSM (Cyan) kini **dipastikan selalu muncul**.
  2. **Dukungan API Key OpenRouteService (Opsional)**: Kami menambahkan kolom input API Key OpenRouteService (`openrouteservice.org`) bagi yang ingin menggunakan API key pribadi gratis. Jika tidak diisi pun, sistem tetap mendeteksi belokan secara otomatis!

### 2. Perbaikan Snap ke OSM: Mencegah Jalur Ganda (Double Track)
- Algoritma Snap to Road kini dilengkapi **Monotonic Forward Filter & Distance Simplifier**.
- Sistem menyaring titik-titik balik arah (loop balik) dan duplikasi titik di bawah 4 meter, sehingga jalur yang menempel pada jalan aspal tetap **satu garis bersih**, sementara bagian off-road tetap dipertahankan.

### 3. Opsi Tambah Titik di GPX Saat Edit Rute
- Saat **Mode Edit Rute** aktif, Anda cukup **klik di bagian mana saja pada garis rute biru** untuk menyisipkan titik koordinat baru secara instan.
- Titik baru akan langsung menjadi bulatan *handle* putih yang bisa digeser sesuai keinginan.

### 4. Opsi Tambah Belokan Manual di Peta
- Terdapat tombol **"+ Tambah Belokan Manual"**.
- Saat aktif, klik di mana saja pada rute peta untuk memunculkan jendela pilihan:
  - Pilihan arah (Kanan, Kiri, Serong, Tajam, U-Turn).
  - Teks instruksi kustom (misal: *"Belok Kanan ke Warung Kopi"* atau *"Pertigaan Pohon Rindang"*).
- Belokan manual ditandai dengan **badge hijau (Manual)** dan ikut dikemas ke dalam file `.tinfo` Bryton.

### 5. Klik Belokan di Peta Otomatis Diarahkan ke Baris Tabel
- Setiap pin belokan (angka & panah arah) di peta dapat diklik.
- Saat diklik, tabel di bawah **otomatis di-scroll ke baris instruksi tersebut** dan barisnya diberi **animasi highlight cyan menyala**.

---

## 🚴‍♂️ Format File Bryton Rider di ZIP:
- **`.smy`**: Header 24 byte (Bounding Box, total titik, total jarak).
- **`.track`**: Koordinat biner 16 byte per titik.
- **`.tinfo`**: 42 byte per belokan (index titik, kode arah, jarak, estimasi waktu, nama jalan 32 byte).
- **`.gpx`**: Rute GPX 1.1 standar.
- **`.kml`**: Rute Google Earth KML.

Salin file `.smy`, `.track`, dan `.tinfo` ke folder **`Bryton / tracks /`** di perangkat GPS Bryton Rider Anda.
