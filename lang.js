const translations = {
  id: {
    appSubtitle: 'GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT & Editor',
    badgeBryton: 'Bryton Rider Format',
    badgeOsm: 'OSM Road Snap',
    badgeVercel: 'Vercel Ready',
    panelHeader: 'Panel',
    minimizePanel: 'Minimize Panel',
    uploadTitle: '1. Unggah File GPX',
    uploadHintClick: 'Klik untuk memilih',
    uploadHintOrDrag: 'atau seret file .gpx ke sini',
    uploadHintSupport: 'Mendukung file GPX dari Strava, Komoot, Garmin, OSM, dll.',
    changeFile: 'Ganti file',
    snapTitle: '2. Smoothing Presisi Jalan (Snap OSM)',
    snapDesc: 'Menyelaraskan garis GPS yang berliku/noise agar mengikuti lekuk aspal jalan resmi OpenStreetMap secara presisi, namun tetap mempertahankan jalur off-road/jalan setapak asli jika tidak ada jalan terdaftar di OSM.',
    btnSnap: 'Lakukan Smoothing Presisi Jalan Sekarang',
    tbtTitle: '3. Pengaturan Turn-by-Turn',
    tbtOsmAuto: 'Turn-by-Turn OpenStreetMap (OSRM)',
    tbtOsmDesc: 'Mengambil nama jalan resmi & manuver belokan dari OpenStreetMap OSRM Routing Engine.',
    orsKeyLabel: 'OpenRouteService API Key (Disarankan):',
    orsKeyPlaceholder: 'Masukkan API Key ORS (opsional)...',
    autoOsmNames: 'Auto Nama Jalan OSM (Reverse Geocode)',
    autoOsmDesc: 'Mengambil nama jalan asli dari OpenStreetMap untuk setiap titik belokan.',
    angleThreshold: 'Sudut Belokan Tambahan',
    angleDesc: 'Jika ada belokan &ge; sudut ini yang belum ada di OSM, belokan baru akan ditambahkan otomatis. Jika sudah ada di OSM, tidak diduplikasi.',
    dupRadius: 'Radius Proteksi Duplikasi',
    dupDesc: 'Jarak toleransi (meter) agar belokan sudut tidak menduplikasi belokan yang sudah terdaftar di OSM.',
    smoothRadius: 'Filter GPS Noise (Smoothing)',
    smoothDesc: 'Menghindari deteksi belokan palsu akibat jitter/noise sinyal GPS.',
    btnProcess: 'Analisis & Generate Route',
    downloadTitle: '4. Download Paket Bryton',
    routeNameLabel: 'Nama Rute di Perangkat Bryton (Opsional)',
    routeNamePlaceholder: 'Contoh: Gowes Sentul 50km',
    btnDownloadZip: 'Download Bryton Route (.ZIP)',
    guideTitle: 'Cara Pasang di Head Unit Bryton:',
    guide1: 'Ekstrak file .zip hasil download.',
    guide2: 'Hubungkan Bryton Rider ke Komputer via kabel USB.',
    guide3: 'Buka folder Bryton &rarr; tracks di dalam storage perangkat.',
    guide4: 'Salin file .smy, .track, dan .tinfo ke folder tracks tersebut.',
    guide5: 'Cabut aman (Eject), buka menu Follow Track / Ikuti Rute di Bryton Anda!',
    statDist: 'Jarak Total',
    statPoints: 'Titik Koordinat',
    statOsm: 'Belokan OSM',
    statAngle: 'Belokan Sudut',
    statTotal: 'Total Instruksi',
    btnEditModeOn: 'Mode Edit Rute (Geser/Tambah Titik)',
    btnEditModeOff: 'Batalkan Edit',
    btnCreateRoute: 'Buat Rute Manual',
    btnEndRoute: 'Selesai Buat Rute',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnSaveEdit: 'Simpan Perubahan',
    btnAddTurn: 'Tambah Belokan Manual',
    editHint: 'KLIK & GESER marker putih untuk mengubah rute. KLIK garis biru untuk menambah titik.',
    createHint: 'Klik pada peta untuk menggambar rute dari nol.',
    autoSnapLabel: 'Auto Snap Jalan',
    turnsTableTitle: 'Daftar Instruksi Turn-by-Turn',
    turnHeaderDir: 'Arah',
    turnHeaderInst: 'Instruksi / Nama Jalan',
    turnHeaderSrc: 'Sumber',
    turnHeaderDist: 'Jarak (m)',
    turnHeaderEst: 'Estimasi',
    turnHeaderCoord: 'Koordinat',
    turnHeaderAction: 'Aksi',
    emptyTable: 'Belum ada data turn-by-turn. Silakan upload file GPX terlebih dahulu.',
    noTurnsDetected: 'Tidak ada belokan terdeteksi.',
    startRoute: 'Mulai Perjalanan',
    badgeOsm: 'OSM',
    badgeExtra: 'Sudut',
    badgeManual: 'Manual',
    delTurnTitle: 'Hapus belokan ini',
    popupSource: 'Sumber:',
    popupDistance: 'Jarak ke belokan berikut:',
    modalTitle: 'Tambah Belokan Manual',
    modalCoord: 'Koordinat:',
    modalDir: 'Arah Belokan',
    modalInst: 'Nama Jalan / Instruksi (Opsional)',
    modalInstPlaceholder: 'Contoh: Jl. Sudirman',
    modalBtnCancel: 'Batal',
    modalBtnAdd: 'Tambahkan',
    btnCancelAddTurn: 'Batalkan Tambah Belokan',
    // Turn directions
    dirSharpLeft: 'Belok Tajam Kiri',
    dirLeft: 'Belok Kiri',
    dirSlightLeft: 'Serong Kiri',
    dirStraight: 'Lurus',
    dirSlightRight: 'Serong Kanan',
    dirRight: 'Belok Kanan',
    dirSharpRight: 'Belok Tajam Kanan',
    dirUturn: 'Putar Balik (U-Turn)',
    mapTitle: 'Visualisasi Rute & Titik Belokan',
    btnLocateMe: 'Pergi ke Lokasi Saat Ini',
    btnUndoEdit: 'Undo (Ctrl+Z)',
    btnRedoEdit: 'Redo (Ctrl+Y)',
    modeCreateActive: 'Mode Buat Rute Aktif: Klik pada peta untuk menggambar.',
    modeAddTurnActive: 'Mode Tambah Belokan Aktif: Klik pada garis rute di peta untuk memasang belokan manual. Klik lagi tombol untuk membatalkan.',
    chkSnapToRoad: 'Snap to Road (OSM)',
    mapPlaceholderText: 'Unggah file GPX atau klik <strong>Buat Rute Manual</strong> untuk memulai',
    legendOsm: 'OSM Turn (Cyan)',
    legendExtra: 'Extra Angle Turn (Orange)',
    legendTrack: 'Track Path (Blue)',
    layerHint: 'Gunakan ikon layer di pojok kanan atas peta untuk beralih ke <strong>Satelit</strong> / <strong>CyclOSM</strong> / <strong>Street</strong>.',
    turnCounterBadge: '0 Instruksi',
    btnMinimizeTable: 'Minimize Tabel'
  },
  en: {
    appSubtitle: 'GPX &rarr; Bryton Rider Route (.zip) with Road Snap, OSM TBT & Editor',
    badgeBryton: 'Bryton Rider Format',
    badgeOsm: 'OSM Road Snap',
    badgeVercel: 'Vercel Ready',
    panelHeader: 'Panel',
    minimizePanel: 'Minimize Panel',
    uploadTitle: '1. Upload GPX File',
    uploadHintClick: 'Click to select',
    uploadHintOrDrag: 'or drag .gpx file here',
    uploadHintSupport: 'Supports GPX files from Strava, Komoot, Garmin, OSM, etc.',
    changeFile: 'Change file',
    snapTitle: '2. Precision Road Smoothing (OSM Snap)',
    snapDesc: 'Aligns noisy/wiggly GPS lines to follow official OpenStreetMap roads precisely, while keeping original off-road paths if no OSM road exists.',
    btnSnap: 'Perform Precision Smoothing Now',
    tbtTitle: '3. Turn-by-Turn Settings',
    tbtOsmAuto: 'OpenStreetMap Turn-by-Turn (OSRM)',
    tbtOsmDesc: 'Retrieves official street names and turn maneuvers from OpenStreetMap OSRM Routing Engine.',
    orsKeyLabel: 'OpenRouteService API Key (Recommended):',
    orsKeyPlaceholder: 'Enter ORS API Key (optional)...',
    autoOsmNames: 'Auto OSM Street Names (Reverse Geocode)',
    autoOsmDesc: 'Retrieves native street names from OpenStreetMap for every turn coordinate.',
    angleThreshold: 'Extra Turn Angle Threshold',
    angleDesc: 'If a turn &ge; this angle is missing in OSM, a new turn will be added automatically. Duplicates are prevented if it already exists.',
    dupRadius: 'Duplicate Protection Radius',
    dupDesc: 'Tolerance distance (meters) to prevent angle-based turns from duplicating existing OSM turns.',
    smoothRadius: 'GPS Noise Filter (Smoothing)',
    smoothDesc: 'Prevents false turn detection caused by GPS signal jitter/noise.',
    btnProcess: 'Analyze & Generate Route',
    downloadTitle: '4. Download Bryton Package',
    routeNameLabel: 'Route Name on Bryton Device (Optional)',
    routeNamePlaceholder: 'e.g., Sunday Ride 50km',
    btnDownloadZip: 'Download Bryton Route (.ZIP)',
    guideTitle: 'How to Install on Bryton Head Unit:',
    guide1: 'Extract the downloaded .zip file.',
    guide2: 'Connect your Bryton Rider to the Computer via USB cable.',
    guide3: 'Open the Bryton &rarr; tracks folder in the device storage.',
    guide4: 'Copy the .smy, .track, and .tinfo files into the tracks folder.',
    guide5: 'Safely Eject, open the Follow Track menu on your Bryton!',
    statDist: 'Total Distance',
    statPoints: 'Coordinates',
    statOsm: 'OSM Turns',
    statAngle: 'Angle Turns',
    statTotal: 'Total Instructions',
    btnEditModeOn: 'Edit Route Mode (Move/Add Points)',
    btnEditModeOff: 'Cancel Edit',
    btnCreateRoute: 'Create Manual Route',
    btnEndRoute: 'Finish Route',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnSaveEdit: 'Save Changes',
    btnAddTurn: 'Add Manual Turn',
    editHint: 'CLICK & DRAG white markers to change route. CLICK blue line to add a point.',
    createHint: 'Click on the map to draw a route from scratch.',
    autoSnapLabel: 'Auto Snap to Roads',
    turnsTableTitle: 'Turn-by-Turn Instructions List',
    turnHeaderDir: 'Direction',
    turnHeaderInst: 'Instruction / Street Name',
    turnHeaderSrc: 'Source',
    turnHeaderDist: 'Distance (m)',
    turnHeaderEst: 'Estimate',
    turnHeaderCoord: 'Coordinates',
    turnHeaderAction: 'Action',
    emptyTable: 'No turn-by-turn data available. Please upload a GPX file first.',
    noTurnsDetected: 'No turns detected.',
    startRoute: 'Start Route',
    badgeOsm: 'OSM',
    badgeExtra: 'Angle',
    badgeManual: 'Manual',
    delTurnTitle: 'Delete this turn',
    popupSource: 'Source:',
    popupDistance: 'Distance to next turn:',
    modalTitle: 'Add Manual Turn',
    modalCoord: 'Coordinates:',
    modalDir: 'Turn Direction',
    modalInst: 'Street Name / Instruction (Optional)',
    modalInstPlaceholder: 'e.g., Main Street',
    modalBtnCancel: 'Cancel',
    modalBtnAdd: 'Add Turn',
    btnCancelAddTurn: 'Cancel Add Turn',
    // Turn directions
    dirSharpLeft: 'Sharp Left',
    dirLeft: 'Left',
    dirSlightLeft: 'Slight Left',
    dirStraight: 'Straight',
    dirSlightRight: 'Slight Right',
    dirRight: 'Right',
    dirSharpRight: 'Sharp Right',
    dirUturn: 'U-Turn',
    mapTitle: 'Route Visualization & Turn Points',
    btnLocateMe: 'Go to Current Location',
    btnUndoEdit: 'Undo (Ctrl+Z)',
    btnRedoEdit: 'Redo (Ctrl+Y)',
    modeCreateActive: 'Create Route Mode Active: Click on the map to draw.',
    modeAddTurnActive: 'Add Turn Mode Active: Click on the route line to add a manual turn. Click button again to cancel.',
    chkSnapToRoad: 'Snap to Road (OSM)',
    mapPlaceholderText: 'Upload a GPX file or click <strong>Create Manual Route</strong> to start',
    legendOsm: 'OSM Turn (Cyan)',
    legendExtra: 'Extra Angle Turn (Orange)',
    legendTrack: 'Track Path (Blue)',
    layerHint: 'Use the layer icon in the top right corner of the map to switch to <strong>Satellite</strong> / <strong>CyclOSM</strong> / <strong>Street</strong>.',
    turnCounterBadge: '0 Instructions',
    btnMinimizeTable: 'Minimize Table'
  }
};

let currentLang = localStorage.getItem('openbryton_lang') || 'id';

function t(key) {
  return translations[currentLang][key] || key;
}

function switchLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('openbryton_lang', lang);
  updateDOMText();
  
  // Re-render JS dynamic text (e.g. table if points exist)
  if (typeof updateStatsAndUI === 'function') {
    updateStatsAndUI();
  }
}

function updateDOMText() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang][key]) {
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = translations[currentLang][key];
      } else {
        el.textContent = translations[currentLang][key];
      }
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (translations[currentLang][key]) {
      el.title = translations[currentLang][key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[currentLang][key]) {
      el.placeholder = translations[currentLang][key];
    }
  });
  
  // Need to recreate lucide icons if we overwrote innerHTML
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  updateDOMText();
});
