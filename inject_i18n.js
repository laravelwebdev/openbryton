const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacements = [
  ['GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT &amp; Editor', '<span data-i18n-html data-i18n="appSubtitle">GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT & Editor</span>'],
  ['GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT & Editor', '<span data-i18n-html data-i18n="appSubtitle">GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT & Editor</span>'],
  ['1. Unggah File GPX', '<span data-i18n="uploadTitle">1. Unggah File GPX</span>'],
  ['<strong>Klik untuk memilih</strong>', '<strong data-i18n="uploadHintClick">Klik untuk memilih</strong>'],
  ['atau seret file <code>.gpx</code> ke sini', '<span data-i18n="uploadHintOrDrag">atau seret file .gpx ke sini</span>'],
  ['Mendukung file GPX dari Strava, Komoot, Garmin, OSM, dll.', '<span data-i18n="uploadHintSupport">Mendukung file GPX dari Strava, Komoot, Garmin, OSM, dll.</span>'],
  ['2. Smoothing Presisi Jalan (Snap OSM)', '<span data-i18n="snapTitle">2. Smoothing Presisi Jalan (Snap OSM)</span>'],
  ['Menyelaraskan garis GPS yang berliku/noise agar mengikuti lekuk aspal jalan resmi OpenStreetMap secara presisi, namun tetap mempertahankan jalur off-road/jalan setapak asli jika tidak ada jalan terdaftar di OSM.', '<span data-i18n="snapDesc">Menyelaraskan garis GPS yang berliku/noise agar mengikuti lekuk aspal jalan resmi OpenStreetMap secara presisi, namun tetap mempertahankan jalur off-road/jalan setapak asli jika tidak ada jalan terdaftar di OSM.</span>'],
  ['Lakukan Smoothing Presisi Jalan Sekarang', '<span data-i18n="btnSnap">Lakukan Smoothing Presisi Jalan Sekarang</span>'],
  ['3. Pengaturan Turn-by-Turn', '<span data-i18n="tbtTitle">3. Pengaturan Turn-by-Turn</span>'],
  ['Turn-by-Turn OpenStreetMap (OSRM)', '<span data-i18n="tbtOsmAuto">Turn-by-Turn OpenStreetMap (OSRM)</span>'],
  ['Mengambil nama jalan resmi &amp; manuver belokan dari OpenStreetMap OSRM Routing Engine.', '<span data-i18n="tbtOsmDesc">Mengambil nama jalan resmi & manuver belokan dari OpenStreetMap OSRM Routing Engine.</span>'],
  ['Mengambil nama jalan resmi & manuver belokan dari OpenStreetMap OSRM Routing Engine.', '<span data-i18n="tbtOsmDesc">Mengambil nama jalan resmi & manuver belokan dari OpenStreetMap OSRM Routing Engine.</span>'],
  ['OpenRouteService API Key', '<span data-i18n="orsKeyLabel">OpenRouteService API Key</span>'],
  ['Auto Nama Jalan OSM (Reverse Geocode)', '<span data-i18n="autoOsmNames">Auto Nama Jalan OSM (Reverse Geocode)</span>'],
  ['Mengambil nama jalan asli dari OpenStreetMap untuk setiap titik belokan.', '<span data-i18n="autoOsmDesc">Mengambil nama jalan asli dari OpenStreetMap untuk setiap titik belokan.</span>'],
  ['Sudut Belokan Tambahan', '<span data-i18n="angleThreshold">Sudut Belokan Tambahan</span>'],
  ['Radius Proteksi Duplikasi', '<span data-i18n="dupRadius">Radius Proteksi Duplikasi</span>'],
  ['Filter GPS Noise (Smoothing)', '<span data-i18n="smoothRadius">Filter GPS Noise (Smoothing)</span>'],
  ['Menghindari deteksi belokan palsu akibat jitter/noise sinyal GPS.', '<span data-i18n="smoothDesc">Menghindari deteksi belokan palsu akibat jitter/noise sinyal GPS.</span>'],
  ['Analisis &amp; Generate Route', '<span data-i18n="btnProcess">Analisis & Generate Route</span>'],
  ['Analisis & Generate Route', '<span data-i18n="btnProcess">Analisis & Generate Route</span>'],
  ['4. Download Paket Bryton', '<span data-i18n="downloadTitle">4. Download Paket Bryton</span>'],
  ['Nama Rute di Perangkat Bryton (Opsional)', '<span data-i18n="routeNameLabel">Nama Rute di Perangkat Bryton (Opsional)</span>'],
  ['Download Bryton Route (.ZIP)', '<span data-i18n="btnDownloadZip">Download Bryton Route (.ZIP)</span>'],
  ['Cara Pasang di Head Unit Bryton:', '<span data-i18n="guideTitle">Cara Pasang di Head Unit Bryton:</span>'],
  ['Ekstrak file .zip hasil download.', '<span data-i18n="guide1">Ekstrak file .zip hasil download.</span>'],
  ['Hubungkan Bryton Rider ke Komputer via kabel USB.', '<span data-i18n="guide2">Hubungkan Bryton Rider ke Komputer via kabel USB.</span>'],
  ['Buka folder Bryton &rarr; tracks di dalam storage perangkat.', '<span data-i18n-html data-i18n="guide3">Buka folder Bryton &rarr; tracks di dalam storage perangkat.</span>'],
  ['Salin file .smy, .track, dan .tinfo ke folder tracks tersebut.', '<span data-i18n="guide4">Salin file .smy, .track, dan .tinfo ke folder tracks tersebut.</span>'],
  ['Cabut aman (Eject), buka menu Follow Track / Ikuti Rute di Bryton Anda!', '<span data-i18n="guide5">Cabut aman (Eject), buka menu Follow Track / Ikuti Rute di Bryton Anda!</span>']
];

replacements.forEach(([find, replace]) => {
  html = html.replace(find, replace);
});

fs.writeFileSync('index.html', html);
console.log('Done replacing index.html');
