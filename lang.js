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
    routeToolsTitle: '2. Alat Rute Tambahan',
    btnSimplifyRdp: 'Optimasi Garis Lurus (RDP)',
    rdpDesc: 'Membuang titik berlebih di jalur lurus untuk meringankan ukuran file tanpa mengubah bentuk asli rute.',
    tbtTitle: '3. Pengaturan Turn-by-Turn',
    tbtOsmAuto: 'Turn-by-Turn OpenStreetMap (OSRM)',
    tbtOsmDesc: 'Mengambil nama jalan resmi & manuver belokan dari OpenStreetMap OSRM Routing Engine.',
    orsKeyLabel: 'OpenRouteService API Key (Disarankan):',
    orsKeyPlaceholder: 'Masukkan API Key ORS (opsional)...',
    autoOsmNames: 'Auto Nama Jalan OSM (Reverse Geocode)',
    autoOsmDesc: 'Mengambil nama jalan asli dari OpenStreetMap untuk setiap titik belokan.',
    angleThreshold: 'Sudut Belokan Tambahan',
    angleDesc: 'Jika ada belokan ≥ sudut ini yang belum ada di OSM, belokan baru akan ditambahkan otomatis. Jika sudah ada di OSM, tidak diduplikasi.',
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
    btnSaveDb: 'Simpan ke Database',
    btnDownloadBryton: 'Bryton (.ZIP)',
    btnDownloadFit: 'FIT',
    btnDownloadKml: 'KML',
    btnDownloadGpx: 'GPX',
    btnViewRoute: 'Lihat',
    btnDeleteRoute: 'Hapus',
    confirmDeleteRoute: 'Hapus rute ini?',
    alertDeleteFailed: 'Gagal menghapus: ',
    statDist: 'Jarak Total',
    statPoints: 'Titik Koordinat',
    statOsm: 'Belokan OSM',
    statAngle: 'Belokan Sudut',
    statTotal: 'Total Instruksi',
    btnEditModeOn: 'Mode Edit Rute',
    btnEditModeOff: 'Batalkan Edit',
    btnCreateRoute: 'Buat Rute Manual',
    btnEndRoute: 'Selesai Buat Rute',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnSaveEdit: 'Simpan Perubahan',
    btnAddTurn: 'Tambah Belokan',
    editHint: 'KLIK & GESER marker putih untuk mengubah rute. KLIK garis biru (atau peta) untuk tambah titik. KLIK KANAN marker untuk hapus.',
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
    toastLocError: 'Gagal mendapatkan lokasi Anda. Pastikan izin GPS (Lokasi) diaktifkan di browser.',
    toastFormatGpx: 'Harap pilih file dengan format .gpx!',
    toastGpxLoaded: 'File GPX dimuat! Klik "Analisis & Generate Route"',
    toastGpxInvalid: 'Format GPX tidak valid atau tidak memiliki titik koordinat.',
    toastSmoothing: 'Sedang melakukan smoothing jalan OSM (Anti-Double Track)...',
    toastSmoothSuccess: 'Smoothing presisi jalan berhasil tanpa double jalur!',
    toastSnapFailed: 'Gagal melakukan snap jalan, menggunakan koordinat GPX asli.',
    toastUploadFirstEdit: 'Upload file GPX terlebih dahulu untuk mengedit rute.',
    toastEditModeOn: 'Mode Edit Aktif: Geser / Kanan-Klik marker, atau KLIK garis biru (atau peta) untuk tambah titik.',
    toastRoutingNewPoint: 'Membuat rute ke titik baru...',
    toastUndo: 'Undo berhasil',
    toastRedo: 'Redo berhasil',
    toastRouteUpdated: 'Rute berhasil diperbarui!',
    toastUploadFirst: 'Upload file GPX terlebih dahulu.',
    toastClickManualTurn: 'Klik pada garis rute di peta untuk memasang belokan manual.',
    toastStartPointAdded: 'Titik awal rute ditambahkan!',
    toastRoutingRoad: 'Merutekan ke jalan...',
    toastPointSnapped: 'Titik ditambahkan (Snap ke Jalan)!',
    toastPointOffroad: 'Titik lurus ditambahkan (Offroad)!',
    toastClickMapManual: 'Klik pada peta untuk mulai menggambar rute manual.',
    toastAnalyzing: 'Sedang menganalisis rute & mendeteksi belokan OSM...',
    toastFetchORS: 'Mengambil TBT via OpenRouteService API...',
    toastFetchOverpass: 'Menggunakan engine deteksi jalan OSM langsung (Overpass)...',
    toastFetchOsmNames: 'Mengambil nama jalan resmi dari OpenStreetMap...',
    toastAnalyzeFirst: 'Silakan lakukan analisis rute terlebih dahulu.',
    toastCreatingZip: 'Sedang membuat file ZIP Bryton...',
    toastZipSuccess: 'Download ZIP berhasil! Silakan salin file ke Bryton Anda.',
    toastPointAddedIndex: 'Titik baru ditambahkan di indeks #{idx}!',
    toastTurnAdded: 'Belokan manual "{text}" berhasil ditambahkan!',
    toastAnalysisDone: 'Analisis selesai! Terdeteksi {count} instruksi turn-by-turn.',
    toastAnalyzeError: 'Terjadi kesalahan saat analisis: ',
    toastRdpNoRoute: 'Pilih rute terlebih dahulu.',
    toastRdpConfirm: 'Apakah Anda yakin ingin membuang titik lurus yang berlebihan? Tindakan ini akan mengoptimasi rute secara permanen.',
    toastRdpSuccess: 'Optimasi: {0} titik lurus dibuang.',
    toastRdpNoOp: 'Rute sudah optimal, tidak ada titik lurus yang dibuang.',
    toastTurnDeleted: 'Belokan "{text}" dihapus.',
    toastZipError: 'Gagal membuat ZIP: ',
    btnShowPanel: 'Tampilkan',
    btnHidePanel: 'Sembunyikan',
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
    poiFood: '🍴 Food',
    poiWater: '💧 Water',
    poiSummit: '⛺ Camping',
    poiGroup: '👥 Group',
    poiSprint: '⚡ Sprint',
    poiFirstAid: '➕ First Aid',
    poiCheck: '☑️ Checkpoint',
    poiTarget: '🎯 Target',
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
    instructionCountWord: 'Instruksi',
    btnMinimizeTable: 'Minimize Tabel',
    climbTitle: 'Kriteria Deteksi Tanjakan',
    climbMinDist: 'Jarak Minimal',
    climbMinGrade: 'Grade Rata-rata Minimal',
    climbMinScore: 'Skor Tanjakan (Jarak x Grade)',
    btnAddPoi: 'Tambah POI',
    tabTurns: 'Turn-by-Turn',
    tabPois: 'POI',
    tabClimbs: 'Climb',
    poiHeaderIcon: 'Ikon',
    poiHeaderName: 'Nama POI',
    emptyPois: 'Belum ada data POI.',
    climbHeaderIcon: 'Aksi',
    climbHeaderName: 'Nama Tanjakan',
    climbHeaderGrade: 'Grade (%)',
    emptyClimbs: 'Belum ada data Tanjakan.',
    climbPrefix: 'Tanjakan'
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
    routeToolsTitle: '2. Route Tools',
    btnSimplifyRdp: 'Straight Line Optimization (RDP)',
    rdpDesc: 'Removes redundant points on straight lines to reduce file size without changing the route shape.',
    tbtTitle: '3. Turn-by-Turn Settings',
    tbtOsmAuto: 'OpenStreetMap Turn-by-Turn (OSRM)',
    tbtOsmDesc: 'Retrieves official street names and turn maneuvers from OpenStreetMap OSRM Routing Engine.',
    orsKeyLabel: 'OpenRouteService API Key (Recommended):',
    orsKeyPlaceholder: 'Enter ORS API Key (optional)...',
    autoOsmNames: 'Auto OSM Street Names (Reverse Geocode)',
    autoOsmDesc: 'Retrieves native street names from OpenStreetMap for every turn coordinate.',
    angleThreshold: 'Extra Turn Angle Threshold',
    angleDesc: 'If a turn ≥ this angle is missing in OSM, a new turn will be added automatically. Duplicates are prevented if it already exists.',
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
    btnSaveDb: 'Save to Database',
    btnDownloadBryton: 'Bryton (.ZIP)',
    btnDownloadFit: 'FIT',
    btnDownloadKml: 'KML',
    btnDownloadGpx: 'GPX',
    btnViewRoute: 'View',
    btnDeleteRoute: 'Delete',
    confirmDeleteRoute: 'Delete this route?',
    alertDeleteFailed: 'Failed to delete: ',
    statDist: 'Total Distance',
    statPoints: 'Coordinates',
    statOsm: 'OSM Turns',
    statAngle: 'Angle Turns',
    statTotal: 'Total Instructions',
    btnEditModeOn: 'Edit Route Mode',
    btnEditModeOff: 'Cancel Edit',
    btnCreateRoute: 'Create Manual Route',
    btnEndRoute: 'Finish Route',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnSaveEdit: 'Save Changes',
    btnAddTurn: 'Add Turn',
    editHint: 'CLICK & DRAG white markers to change route. CLICK blue line (or map) to add a point. RIGHT CLICK marker to delete.',
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
    toastLocError: 'Failed to get location. Ensure GPS permission is enabled in browser.',
    toastFormatGpx: 'Please select a .gpx file!',
    toastGpxLoaded: 'GPX loaded! Click "Analyze & Generate Route"',
    toastGpxInvalid: 'Invalid GPX format or missing coordinates.',
    toastSmoothing: 'Performing OSM road smoothing (Anti-Double Track)...',
    toastSmoothSuccess: 'Precision road smoothing successful without double tracks!',
    toastSnapFailed: 'Road snap failed, using original GPX coordinates.',
    toastUploadFirstEdit: 'Upload a GPX file first to edit the route.',
    toastEditModeOn: 'Edit Mode Active: Drag / Right-Click markers, or CLICK the blue line (or map) to add points.',
    toastRoutingNewPoint: 'Routing to new point...',
    toastUndo: 'Undo successful',
    toastRedo: 'Redo successful',
    toastRouteUpdated: 'Route successfully updated!',
    toastUploadFirst: 'Please upload a GPX file first.',
    toastClickManualTurn: 'Click on the route line on the map to place a manual turn.',
    toastStartPointAdded: 'Route start point added!',
    toastRoutingRoad: 'Routing to road...',
    toastPointSnapped: 'Point added (Snapped to Road)!',
    toastPointOffroad: 'Straight point added (Offroad)!',
    toastClickMapManual: 'Click on the map to start drawing a manual route.',
    toastAnalyzing: 'Analyzing route & detecting OSM turns...',
    toastFetchORS: 'Fetching TBT via OpenRouteService API...',
    toastFetchOverpass: 'Using direct OSM road detection engine (Overpass)...',
    toastFetchOsmNames: 'Fetching official street names from OpenStreetMap...',
    toastAnalyzeFirst: 'Please analyze the route first.',
    toastCreatingZip: 'Creating Bryton ZIP file...',
    toastZipSuccess: 'ZIP Download successful! Please copy the files to your Bryton.',
    toastPointAddedIndex: 'New point added at index #{idx}!',
    toastTurnAdded: 'Manual turn "{text}" successfully added!',
    toastAnalysisDone: 'Analysis complete! {count} turn-by-turn instructions detected.',
    toastAnalyzeError: 'An error occurred during analysis: ',
    toastRdpNoRoute: 'Please select a route first.',
    toastRdpConfirm: 'Are you sure you want to remove redundant straight points? This will optimize the route permanently.',
    toastRdpSuccess: 'Optimization: {0} straight points removed.',
    toastRdpNoOp: 'Route is already optimized, no straight points were removed.',
    toastTurnDeleted: 'Turn "{text}" deleted.',
    toastZipError: 'Failed to create ZIP: ',
    btnShowPanel: 'Show',
    btnHidePanel: 'Hide',
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
    modalBtnAdd: 'Add',
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
    poiFood: '🍴 Food',
    poiWater: '💧 Water',
    poiSummit: '⛺ Camping',
    poiGroup: '👥 Group',
    poiSprint: '⚡ Sprint',
    poiFirstAid: '➕ First Aid',
    poiCheck: '☑️ Checkpoint',
    poiTarget: '🎯 Target',
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
    instructionCountWord: 'Instructions',
    btnMinimizeTable: 'Minimize Table',
    climbTitle: 'Climb Detection Criteria',
    climbMinDist: 'Minimum Distance',
    climbMinGrade: 'Minimum Average Grade',
    climbMinScore: 'Climb Score (Dist x Grade)',
    btnAddPoi: 'Add POI',
    tabTurns: 'Turn-by-Turn',
    tabPois: 'POI',
    tabClimbs: 'Climb',
    poiHeaderIcon: 'Icon',
    poiHeaderName: 'POI Name',
    emptyPois: 'No POI data available.',
    climbHeaderIcon: 'Action',
    climbHeaderName: 'Climb Name',
    climbHeaderGrade: 'Grade (%)',
    emptyClimbs: 'No climb data available.',
    climbPrefix: 'Climb'
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

function updateLangDropdownUI() {
  const btnIcon = document.getElementById('currentLangIcon');
  const btnText = document.getElementById('currentLangText');
  const options = document.querySelectorAll('.lang-option');

  if (btnIcon && btnText) {
    if (currentLang === 'id') {
      btnIcon.textContent = '🇮🇩';
      btnText.textContent = 'ID';
    } else {
      btnIcon.textContent = '🇬🇧';
      btnText.textContent = 'EN';
    }
  }

  options.forEach(opt => {
    if (opt.getAttribute('data-value') === currentLang) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
}

function initLangDropdown() {
  const dropdown = document.getElementById('langDropdown');
  const btn = document.getElementById('langDropdownBtn');
  const options = document.querySelectorAll('.lang-option');

  if (!dropdown || !btn) return;

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Handle option click
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      const val = opt.getAttribute('data-value');
      if (val !== currentLang) {
        switchLanguage(val);
      }
      dropdown.classList.remove('open');
    });
  });

  updateLangDropdownUI();
}

// Override switchLanguage to also update UI
const originalSwitchLanguage = switchLanguage;
window.switchLanguage = function(lang) {
  originalSwitchLanguage(lang);
  updateLangDropdownUI();
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  updateDOMText();
  initLangDropdown();
});
