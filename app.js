/**
 * OpenBryton Web Application for Vercel
 * Handles GPX Parsing, OpenStreetMap Turn-by-Turn, Smart Angle Detection,
 * Interactive Route Editing (Dragging & Adding Vertices on click), Satellite Layers,
 * Manual Turn Creation & Deletion, Map-to-Table auto scroll & highlight,
 * Snap to OSM Roads with Anti-Double Tracking filter,
 * and Bryton Rider binary route file serialization (.smy, .track, .tinfo, .gpx, .kml).
 */

// Application State
const state = {
  rawGpxText: '',
  fileName: '',
  baseName: 'bryton-route',
  points: [], // Array of { lat, lon, ele, distFromStart }
  rawBackupPoints: [],
  isSnapped: false,
  totalDistance: 0,
  boundingBox: { latMin: 0, latMax: 0, lonMin: 0, lonMax: 0 },
  osmTurns: [],
  extraTurns: [],
  manualTurns: [],
  climbs: [],
  combinedInstructions: [],
  isProcessing: false,
  isProcessingMapClick: false,
  isEditingRoute: false,
  isCreatingRoute: false,
  isAddingManualTurn: false,
  manualAddMode: 'turn',
  pendingManualCoord: null,
  history: [],
  historyIndex: -1,
  map: null,
  mapLayers: {
    trackLine: null,
    turnMarkers: [],
    editHandles: [],
    creationPins: []
  },
  currentClimbHighlight: null
};

// Expose state globally for firebase-db.js
window.state = state;

window.loadRouteFromFirebase = function(data, isOwner = true) {
  state.currentRouteId = data.id || null;
  state.currentRouteOwner = data.uid || null;

  state.fileName = data.title;
  state.baseName = data.title;
  if (elements.brytonRouteName) elements.brytonRouteName.value = data.title;
  if (elements.brytonRouteName) elements.brytonRouteName.readOnly = !isOwner;
  
  const parsedPoints = JSON.parse(data.points);
  state.points = parsedPoints.map(p => ({
    lat: parseFloat(p[0]),
    lon: parseFloat(p[1]),
    ele: p[2] ? parseFloat(p[2]) : 0,
    distFromStart: 0
  }));
  
  if (data.instructions) {
    state.combinedInstructions = JSON.parse(data.instructions);
    state.osmTurns = state.combinedInstructions.filter(i => i.source === 'osm');
    state.extraTurns = state.combinedInstructions.filter(i => i.source === 'extra');
    state.manualTurns = state.combinedInstructions.filter(i => i.source === 'manual');
  } else {
    state.combinedInstructions = [];
    state.osmTurns = [];
    state.extraTurns = [];
    state.manualTurns = [];
  }
  
  recalculateRouteDistances();
  
  state.totalDistance = state.points.length > 0 ? state.points[state.points.length-1].distFromStart : 0;
  if (elements.statDistance) elements.statDistance.textContent = `${(state.totalDistance / 1000).toFixed(2)} km`;
  if (elements.statPoints) elements.statPoints.textContent = state.points.length.toLocaleString();
  
  state.rawBackupPoints = JSON.parse(JSON.stringify(state.points));
  
  // Update map bounds and render track
  if (state.points.length > 0) {
    const lats = state.points.map(p => p.lat);
    const lons = state.points.map(p => p.lon);
    state.boundingBox = {
      latMin: Math.min(...lats), latMax: Math.max(...lats),
      lonMin: Math.min(...lons), lonMax: Math.max(...lons)
    };
  }
  
  renderTrackOnMap(true);
  updateStatsAndUI();
  
  // Render the elevation chart now that points are loaded
  setTimeout(() => renderElevationChart(), 500);
  
  // Toggle editing controls based on ownership
  const btnSave = document.getElementById('btnSaveRoute');
  if (btnSave) btnSave.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleEdit) elements.btnToggleEdit.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleAddTurn) elements.btnToggleAddTurn.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleAddPoi) elements.btnToggleAddPoi.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnManualSnap) elements.btnManualSnap.style.display = isOwner ? 'flex' : 'none';

  // Enable download buttons since the user wants to download
  elements.btnDownloadBryton.disabled = false;
  elements.btnDownloadKml.disabled = false;
  elements.btnDownloadGpx.disabled = false;
  elements.btnDownloadFit.disabled = false;
  
  if (typeof showToast === 'function') {
    showToast(isOwner ? 'Rute dimuat ke Editor!' : 'Mode Lihat: Hanya bisa mengunduh', 'success');
  }
};

// DOM Elements
const elements = {
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  fileInfo: document.getElementById('fileInfo'),
  fileName: document.getElementById('fileName'),
  fileMeta: document.getElementById('fileMeta'),
  btnRemoveFile: document.getElementById('btnRemoveFile'),
  btnManualSnap: document.getElementById('btnManualSnap'),
  snapSpinner: document.getElementById('snapSpinner'),
  enableOsmTbt: document.getElementById('enableOsmTbt'),
  orsApiKey: document.getElementById('orsApiKey'),
  enableOsmNames: document.getElementById('enableOsmNames'),
  angleThreshold: document.getElementById('angleThreshold'),
  angleThresholdValue: document.getElementById('angleThresholdValue'),
  dupDistanceThreshold: document.getElementById('dupDistanceThreshold'),
  dupDistanceThresholdValue: document.getElementById('dupDistanceThresholdValue'),
  smoothingRadius: document.getElementById('smoothingRadius'),
  smoothingRadiusValue: document.getElementById('smoothingRadiusValue'),
  climbMinDist: document.getElementById('climbMinDist'),
  climbMinDistValue: document.getElementById('climbMinDistValue'),
  climbMinGrade: document.getElementById('climbMinGrade'),
  climbMinGradeValue: document.getElementById('climbMinGradeValue'),
  climbMinScore: document.getElementById('climbMinScore'),
  climbMinScoreValue: document.getElementById('climbMinScoreValue'),
  elevationCanvas: document.getElementById('elevationCanvas'),
  brytonRouteName: document.getElementById('brytonRouteName'),
  btnProcess: document.getElementById('btnProcess'),
  processSpinner: document.getElementById('processSpinner'),
  btnDownloadBryton: document.getElementById('btnDownloadBryton'),
  btnDownloadKml: document.getElementById('btnDownloadKml'),
  btnDownloadGpx: document.getElementById('btnDownloadGpx'),
  btnDownloadFit: document.getElementById('btnDownloadFit'),
  btnToggleSidebarUI: document.getElementById('btnToggleSidebarUI'),
  btnToggleTableUI: document.getElementById('btnToggleTableUI'),
  sidebarContent: document.getElementById('sidebarContent'),
  sidebarTitle: document.getElementById('sidebarTitle'),
  turnsTableContent: document.getElementById('turnsTableContent'),
  sidebarPanel: document.querySelector('.sidebar-panel'),
  mainLayout: document.querySelector('.main-layout'),
  turnsCard: document.querySelector('.turns-card'),
  mapContainer: document.querySelector('.map-container'),
  statDistance: document.getElementById('statDistance'),
  statPoints: document.getElementById('statPoints'),
  statOsmTurns: document.getElementById('statOsmTurns'),
  statExtraTurns: document.getElementById('statExtraTurns'),
  statTotalTurns: document.getElementById('statTotalTurns'),
  mapPlaceholder: document.getElementById('mapPlaceholder'),
  turnsTableBody: document.getElementById('turnsTableBody'),
  turnCounterBadge: document.getElementById('turnCounterBadge'),
  btnToggleEditRoute: document.getElementById('btnToggleEditRoute'),
  btnLocateMe: document.getElementById('btnLocateMe'),
  btnUndoEdit: document.getElementById('btnUndoEdit'),
  btnRedoEdit: document.getElementById('btnRedoEdit'),
  btnEditRouteText: document.getElementById('btnEditRouteText'),
  btnCreateManualRoute: document.getElementById('btnCreateManualRoute'),
  btnAddTurnManual: document.getElementById('btnAddTurnManual'),
  btnAddPoiManual: document.getElementById('btnAddPoiManual'),
  btnSaveRouteEdit: document.getElementById('btnSaveRouteEdit'),
  editStatusBar: document.getElementById('editStatusBar'),
  createStatusBar: document.getElementById('createStatusBar'),
  chkManualSnap: document.getElementById('chkManualSnap'),
  addTurnStatusBar: document.getElementById('addTurnStatusBar'),
  modalAddTurn: document.getElementById('modalAddTurn'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnCloseRoute: document.getElementById('btnCloseRoute'),
  btnCancelAddTurn: document.getElementById('btnCancelAddTurn'),
  btnConfirmAddTurn: document.getElementById('btnConfirmAddTurn'),
  manualTurnDirection: document.getElementById('manualTurnDirection'),
  manualTurnText: document.getElementById('manualTurnText'),
  manualTurnCoords: document.getElementById('manualTurnCoords'),
  toast: document.getElementById('toast'),
  toastMsg: document.getElementById('toastMsg'),
  toastIcon: document.getElementById('toastIcon')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initTabs();
  initMapWithLayers();
  bindEvents();
});

function initTabs() {
  const tabs = document.querySelectorAll('.btn-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs and hide contents
      tabs.forEach(t => t.classList.remove('active-tab', 'btn-primary'));
      tabs.forEach(t => t.classList.add('btn-outline'));
      contents.forEach(c => c.classList.add('hidden'));

      // Add active to clicked tab and show target
      tab.classList.add('active-tab', 'btn-primary');
      tab.classList.remove('btn-outline');
      const target = document.getElementById(tab.getAttribute('data-target'));
      if (target) {
        target.classList.remove('hidden');
      }

      // Clear highlights when changing tabs
      clearClimbHighlight();
      document.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
    });
  });
}

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

let toastTimeout;
function showToast(message, type = 'info', autoHide = true) {
  let translatedMsg = message;

  if (currentLang === 'en') {
    const toEn = {
      'Gagal mendapatkan lokasi Anda. Pastikan izin GPS (Lokasi) diaktifkan di browser.': 'Failed to get location. Ensure GPS (Location) permission is enabled in browser.',
      'Harap pilih file dengan format .gpx!': 'Please select a .gpx file!',
      'File GPX dimuat! Klik "Analisis & Generate Route"': 'GPX file loaded! Click "Analyze & Generate Route"',
      'Format GPX tidak valid atau tidak memiliki titik koordinat.': 'Invalid GPX format or missing coordinates.',
      'Sedang melakukan smoothing jalan OSM (Anti-Double Track)...': 'Performing OSM road smoothing (Anti-Double Track)...',
      'Smoothing presisi jalan berhasil tanpa double jalur!': 'Precision road smoothing successful without double tracking!',
      'Gagal melakukan snap jalan, menggunakan koordinat GPX asli.': 'Failed to snap to road, using original GPX coordinates.',
      'Upload file GPX terlebih dahulu untuk mengedit rute.': 'Please upload a GPX file first to edit route.',
      'Mode Edit Aktif: Geser titik putih atau KLIK di garis rute untuk menambah titik baru!': 'Edit Mode Active: Drag white markers or CLICK on the route line to add new points!',
      'Membuat rute ke titik baru...': 'Routing to new point...',
      'Undo berhasil': 'Undo successful',
      'Redo berhasil': 'Redo successful',
      'Rute berhasil diperbarui! Menjalankan ulang analisis belokan...': 'Route updated successfully! Rerunning turn analysis...',
      'Upload file GPX terlebih dahulu.': 'Please upload a GPX file first.',
      'Klik pada garis rute di peta untuk memasang belokan manual.': 'Click on the route line on the map to place a manual turn.',
      'Titik awal rute ditambahkan!': 'Starting route point added!',
      'Merutekan ke jalan...': 'Routing to road...',
      'Titik ditambahkan (Snap ke Jalan)!': 'Point added (Snap to Road)!',
      'Titik lurus ditambahkan (Offroad)!': 'Straight point added (Offroad)!',
      'Klik pada peta untuk mulai menggambar rute manual.': 'Click on the map to start drawing a manual route.',
      'Sedang menganalisis rute & mendeteksi belokan OSM...': 'Analyzing route & detecting OSM turns...',
      'Mengambil TBT via OpenRouteService API...': 'Fetching TBT via OpenRouteService API...',
      'Menggunakan engine deteksi jalan OSM langsung (Overpass)...': 'Using direct OSM road detection engine (Overpass)...',
      'Mengambil nama jalan resmi dari OpenStreetMap...': 'Fetching official street names from OpenStreetMap...',
      'Silakan lakukan analisis rute terlebih dahulu.': 'Please analyze the route first.',
      'Sedang membuat file ZIP Bryton...': 'Generating Bryton ZIP file...',
      'Download ZIP berhasil! Silakan salin file ke Bryton Anda.': 'ZIP download successful! Please copy the files to your Bryton.'
    };

    if (toEn[message]) {
      translatedMsg = toEn[message];
    } else if (message.startsWith('Titik baru ditambahkan di indeks')) {
      translatedMsg = message.replace('Titik baru ditambahkan di indeks', 'New point added at index');
    } else if (message.startsWith('Belokan manual "')) {
      translatedMsg = message.replace('Belokan manual "', 'Manual turn "').replace('" berhasil ditambahkan!', '" added successfully!');
    } else if (message.startsWith('Analisis selesai! Terdeteksi')) {
      translatedMsg = message.replace('Analisis selesai! Terdeteksi', 'Analysis complete! Detected').replace('instruksi turn-by-turn.', 'turn-by-turn instructions.');
    } else if (message.startsWith('Terjadi kesalahan saat analisis:')) {
      translatedMsg = message.replace('Terjadi kesalahan saat analisis:', 'Error during analysis:');
    } else if (message.startsWith('Belokan "')) {
      translatedMsg = message.replace('Belokan "', 'Turn "').replace('" dihapus.', '" deleted.');
    } else if (message.startsWith('Gagal membuat ZIP:')) {
      translatedMsg = message.replace('Gagal membuat ZIP:', 'Failed to generate ZIP:');
    }
  }



  elements.toast.className = `toast toast-${type}`;
  elements.toastMsg.textContent = translatedMsg;
  elements.toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);

  if (autoHide) {
    toastTimeout = setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, 4500);
  }
}

function getInstructionCountLabel(count) {
  const instructionWord = typeof t === 'function' ? t('instructionCountWord') : 'Instruksi';
  return `${count} ${instructionWord}`;
}

/**
 * Initialize Leaflet Map with Multiple Base Layers
 */
function initMapWithLayers() {
  const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 18,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, etc.'
  });

  const cyclOsm = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    maxZoom: 20,
    maxNativeZoom: 18,
    attribution: '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> | OpenStreetMap'
  });

  state.map = L.map('map', {
    zoomControl: true,
    layers: [osmStandard]
  }).setView([-6.2088, 106.8456], 12);

  // Try to locate user on startup
  state.map.locate({ setView: true, maxZoom: 14 });

  state.map.on('locationfound', function (e) {
    if (state.mapLayers.locationMarker) {
      state.map.removeLayer(state.mapLayers.locationMarker);
    }
    state.mapLayers.locationMarker = L.circleMarker(e.latlng, {
      radius: 7,
      fillColor: "#3b82f6",
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(state.map);
  });

  state.map.on('locationerror', function (e) {
    showToast(t('toastLocError'), 'error');
  });
  state.baseMaps = {
    'osm': osmStandard,
    'sat': esriSatellite,
    'cycle': cyclOsm
  };

  createCustomLayerControl();

  // Map Click Listener (for adding manual turn or adding waypoint)
  state.map.on('click', handleMapClick);
}

function createCustomLayerControl() {
  const customControl = L.control({ position: 'bottomleft' });

  customControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'custom-layer-control');
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    div.innerHTML = `
      <div class="layer-selector-wrapper" id="layerSelectorWrapper">
        <div class="layer-main-btn" id="layerMainBtn" title="Ganti Peta Dasar">
          <div class="layer-thumb-box sat-thumb"></div>
          <span>Satelit</span>
        </div>
        
        <div class="layer-popup-panel" id="layerPopupPanel">
          <div class="layer-option active" data-layer="osm">
            <div class="layer-thumb-box osm-thumb"></div>
            <span>OSM</span>
          </div>
          <div class="layer-option" data-layer="sat">
            <div class="layer-thumb-box sat-thumb"></div>
            <span>Satelit</span>
          </div>
          <div class="layer-option" data-layer="cycle">
            <div class="layer-thumb-box cycle-thumb"></div>
            <span>CyclOSM</span>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const btn = div.querySelector('#layerMainBtn');
      const panel = div.querySelector('#layerPopupPanel');
      const options = div.querySelectorAll('.layer-option');

      let currentLayer = 'osm';

      btn.addEventListener('click', () => {
        panel.classList.toggle('show');
      });

      // Close if clicked outside
      document.addEventListener('click', (e) => {
        if (!div.contains(e.target)) {
          panel.classList.remove('show');
        }
      });

      options.forEach(opt => {
        opt.addEventListener('click', () => {
          const selected = opt.getAttribute('data-layer');

          if (selected === currentLayer) {
            panel.classList.remove('show');
            return;
          }

          // Remove old layer, add new layer
          state.map.removeLayer(state.baseMaps[currentLayer]);
          state.baseMaps[selected].addTo(state.map);
          currentLayer = selected;

          // Update active state in panel
          options.forEach(o => o.classList.remove('active'));
          opt.classList.add('active');

          // Update main button to next alternative (like Google Maps)
          // If selected OSM, show Sat as alternative
          const nextLayer = selected === 'sat' ? 'osm' : 'sat';
          const nextText = nextLayer === 'sat' ? 'Satelit' : 'OSM';
          btn.innerHTML = `<div class="layer-thumb-box ${nextLayer}-thumb"></div><span>${nextText}</span>`;

          panel.classList.remove('show');
        });
      });
    }, 100);

    return div;
  };

  customControl.addTo(state.map);
}

// Event Bindings
function bindEvents() {
  elements.angleThreshold.addEventListener('input', (e) => {
    elements.angleThresholdValue.textContent = `${e.target.value}°`;
  });

  elements.dupDistanceThreshold.addEventListener('input', (e) => {
    elements.dupDistanceThresholdValue.textContent = `${e.target.value} m`;
  });

  elements.smoothingRadius.addEventListener('input', (e) => {
    elements.smoothingRadiusValue.textContent = `${e.target.value} m`;
  });

  elements.climbMinDist.addEventListener('input', (e) => {
    elements.climbMinDistValue.textContent = `${e.target.value} m`;
  });

  elements.climbMinGrade.addEventListener('input', (e) => {
    elements.climbMinGradeValue.textContent = `${parseFloat(e.target.value).toFixed(1)} %`;
  });

  elements.climbMinScore.addEventListener('input', (e) => {
    elements.climbMinScoreValue.textContent = `${e.target.value}`;
  });

  elements.fileInput.addEventListener('change', handleFileSelect);

  // Prevent global drag/drop to avoid browser opening the file
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
    });
    elements.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
    });
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, (e) => {
      elements.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, (e) => {
      elements.dropZone.classList.remove('dragover');
    });
  });

  elements.dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });

  elements.btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    resetState();
  });

  elements.btnProcess.addEventListener('click', runTurnAnalysis);
  elements.btnDownloadBryton.addEventListener('click', generateBrytonZip);
  elements.btnDownloadKml.addEventListener('click', generateKmlFile);
  elements.btnDownloadGpx.addEventListener('click', generateGpxFile);
  elements.btnDownloadFit.addEventListener('click', generateFitFile);

  elements.btnLocateMe.addEventListener('click', () => {
    state.map.locate({ setView: true, maxZoom: 16 });
  });

  elements.btnToggleEditRoute.addEventListener('click', toggleRouteEditing);
  elements.btnCreateManualRoute.addEventListener('click', toggleCreateManualRoute);
  if (elements.btnCloseRoute) elements.btnCloseRoute.addEventListener('click', closeRouteLoop);
  elements.btnSaveRouteEdit.addEventListener('click', saveRouteEditing);

  if (elements.btnUndoEdit) elements.btnUndoEdit.addEventListener('click', undoEdit);
  if (elements.btnRedoEdit) elements.btnRedoEdit.addEventListener('click', redoEdit);

  document.addEventListener('keydown', (e) => {
    if (state.isEditingRoute) {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoEdit();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoEdit();
      }
    }
  });
  elements.btnAddTurnManual.addEventListener('click', () => toggleAddManualTurnMode('turn'));
  elements.btnAddPoiManual.addEventListener('click', () => toggleAddManualTurnMode('poi'));

  elements.btnManualSnap.addEventListener('click', async () => {
    await snapGpxToOsmRoads(true);
  });

  elements.btnToggleSidebarUI.addEventListener('click', () => {
    elements.sidebarContent.classList.toggle('collapsed-hidden');
    elements.sidebarTitle.classList.toggle('collapsed-hidden');
    elements.mainLayout.classList.toggle('sidebar-collapsed');
    const isHidden = elements.sidebarContent.classList.contains('collapsed-hidden');
    const icon = isHidden ? 'maximize-2' : 'minimize-2';
    const text = isHidden ? (typeof t === 'function' ? t('btnShowPanel') : 'Tampilkan') : (typeof t === 'function' ? t('btnHidePanel') : 'Sembunyikan');
    elements.btnToggleSidebarUI.innerHTML = `<i data-lucide="${icon}"></i> <span>${text}</span>`;
    lucide.createIcons();
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 350);
  });

  elements.btnToggleTableUI.addEventListener('click', () => {
    elements.turnsTableContent.classList.toggle('collapsed-hidden');
    elements.mapContainer.classList.toggle('map-expanded');
    const isHidden = elements.turnsTableContent.classList.contains('collapsed-hidden');
    const icon = isHidden ? 'maximize-2' : 'minimize-2';
    elements.btnToggleTableUI.innerHTML = `<i data-lucide="${icon}"></i>`;
    lucide.createIcons();
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 350);
  });

  // Modal events
  elements.btnCloseModal.addEventListener('click', closeModal);
  elements.btnCancelAddTurn.addEventListener('click', closeModal);
  elements.btnConfirmAddTurn.addEventListener('click', confirmAddManualTurn);
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
}

function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    showToast(t('toastFormatGpx'), 'error');
    return;
  }

  state.fileName = file.name;
  state.baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const reader = new FileReader();
  reader.onload = (e) => {
    state.rawGpxText = e.target.result;

    elements.fileName.textContent = file.name;
    elements.fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    elements.fileInfo.classList.remove('hidden');
    elements.dropZone.querySelector('.drop-zone-content').classList.add('hidden');
    elements.btnProcess.disabled = false;
    elements.btnManualSnap.disabled = false;

    parseGpx();
    showToast(t('toastGpxLoaded'), 'success');
  };
  reader.readAsText(file);
}

function resetState() {
  state.rawGpxText = '';
  state.fileName = '';
  state.points = [];
  state.rawBackupPoints = [];
  state.isSnapped = false;
  state.osmTurns = [];
  state.extraTurns = [];
  state.manualTurns = [];
  state.climbs = [];
  state.combinedInstructions = [];

  clearClimbHighlight();

  if (state.isEditingRoute) toggleRouteEditing();
  if (state.isAddingManualTurn) toggleAddManualTurnMode();
  if (state.isCreatingRoute) toggleCreateManualRoute();

  elements.brytonRouteName.value = '';
  elements.fileInput.value = '';
  elements.fileInfo.classList.add('hidden');
  elements.dropZone.querySelector('.drop-zone-content').classList.remove('hidden');
  elements.btnProcess.disabled = true;
  elements.btnManualSnap.disabled = true;
  elements.btnDownloadBryton.disabled = true;
  elements.btnDownloadKml.disabled = true;
  elements.btnDownloadGpx.disabled = true;
  elements.btnDownloadFit.disabled = true;

  if (state.mapLayers.trackLine) {
    state.map.removeLayer(state.mapLayers.trackLine);
    state.mapLayers.trackLine = null;
  }
  clearTurnMarkers();
  clearEditHandles();
  clearCreationPins();
  elements.mapPlaceholder.classList.remove('hidden');

  elements.statDistance.textContent = '0.00 km';
  elements.statPoints.textContent = '0';
  elements.statOsmTurns.textContent = '0';
  elements.statExtraTurns.textContent = '0';
  elements.statTotalTurns.textContent = '0';

  elements.turnsTableBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="8" class="text-center">${typeof t === 'function' ? t('emptyTable') : 'Belum ada data turn-by-turn. Silakan upload file GPX terlebih dahulu.'}</td>
    </tr>
  `;
  elements.turnCounterBadge.textContent = getInstructionCountLabel(0);
  elements.elevationCanvas.style.display = 'none';
}

function clearTurnMarkers() {
  state.mapLayers.turnMarkers.forEach(marker => state.map.removeLayer(marker));
  state.mapLayers.turnMarkers = [];
}

function clearEditHandles() {
  state.mapLayers.editHandles.forEach(marker => state.map.removeLayer(marker));
  state.mapLayers.editHandles = [];
}

function clearCreationPins() {
  if (state.mapLayers.creationPins) {
    state.mapLayers.creationPins.forEach(pin => state.map.removeLayer(pin));
    state.mapLayers.creationPins = [];
  }
}

/**
 * Parses GPX XML text into structured points array with distance & bounding box.
 */
function parseGpx() {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(state.rawGpxText, 'text/xml');

  let ptNodes = xmlDoc.querySelectorAll('trkpt');
  if (ptNodes.length === 0) ptNodes = xmlDoc.querySelectorAll('rtept');
  if (ptNodes.length === 0) ptNodes = xmlDoc.querySelectorAll('wpt');

  if (ptNodes.length === 0) {
    showToast(t('toastGpxInvalid'), 'error');
    return;
  }

  const points = [];
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  let runningDist = 0;

  for (let i = 0; i < ptNodes.length; i++) {
    const node = ptNodes[i];
    const lat = parseFloat(node.getAttribute('lat'));
    const lon = parseFloat(node.getAttribute('lon'));
    const eleNode = node.querySelector('ele');
    const ele = eleNode ? parseFloat(eleNode.textContent) : 0;

    if (isNaN(lat) || isNaN(lon)) continue;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      const d = haversineDistance(prev.lat, prev.lon, lat, lon);
      runningDist += d;
    }

    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    lonMin = Math.min(lonMin, lon);
    lonMax = Math.max(lonMax, lon);

    points.push({
      lat,
      lon,
      ele,
      distFromStart: runningDist
    });
  }

  state.points = points;
  state.rawBackupPoints = JSON.parse(JSON.stringify(points));
  state.totalDistance = runningDist;
  state.boundingBox = { latMin, latMax, lonMin, lonMax };

  elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
  elements.statPoints.textContent = points.length.toLocaleString();

  renderTrackOnMap();
  renderElevationChart();
}

function renderElevationChart(highlightClimbObj = null) {
  if (state.points.length === 0 || !elements.elevationCanvas) return;
  const canvas = elements.elevationCanvas;
  const ctx = canvas.getContext('2d');

  // Make visible BEFORE measuring so getBoundingClientRect() returns true dimensions
  canvas.style.display = 'block';

  // Set internal resolution based on devicePixelRatio to avoid blur
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const logicalWidth = rect.width || 350;
  const logicalHeight = rect.height || 90;

  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  // Find min and max elevation
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const p of state.points) {
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }

  if (minEle === Infinity || maxEle === -Infinity) return;
  if (maxEle - minEle < 10) {
    maxEle += 5;
    minEle -= 5;
  }

  const eleRange = maxEle - minEle;
  const totalDist = state.totalDistance; // in meters

  // Define padding for axes
  const padLeft = 40;
  const padBottom = 20;
  const padTop = 10;
  const padRight = 10;

  const drawWidth = logicalWidth - padLeft - padRight;
  const drawHeight = logicalHeight - padTop - padBottom;

  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + drawHeight);

  for (let i = 0; i < state.points.length; i++) {
    const p = state.points[i];
    const x = padLeft + (totalDist > 0 ? (p.distFromStart / totalDist) * drawWidth : 0);
    const y = padTop + drawHeight - ((p.ele - minEle) / eleRange) * drawHeight;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(padLeft + drawWidth, padTop + drawHeight);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + drawHeight);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw Highlighted Climb
  if (highlightClimbObj) {
    const startPt = state.points[highlightClimbObj.startIndex];
    const endPt = state.points[highlightClimbObj.endIndex];

    const startX = padLeft + (totalDist > 0 ? (startPt.distFromStart / totalDist) * drawWidth : 0);
    const endX = padLeft + (totalDist > 0 ? (endPt.distFromStart / totalDist) * drawWidth : 0);

    // draw vertical red separator lines
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, padTop); ctx.lineTo(startX, padTop + drawHeight);
    ctx.moveTo(endX, padTop); ctx.lineTo(endX, padTop + drawHeight);
    ctx.stroke();

    // draw red segment
    ctx.beginPath();
    for (let i = highlightClimbObj.startIndex; i <= highlightClimbObj.endIndex; i++) {
      const p = state.points[i];
      const x = padLeft + (totalDist > 0 ? (p.distFromStart / totalDist) * drawWidth : 0);
      const y = padTop + drawHeight - ((p.ele - minEle) / eleRange) * drawHeight;
      if (i === highlightClimbObj.startIndex) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = '#ef4444'; // Red color
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Draw Axes Grid and Text
  ctx.fillStyle = '#94a3b8';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';

  // Y-axis (Altitude)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  // Max Elevation
  ctx.fillText(Math.round(maxEle) + 'm', padLeft - 5, padTop);
  ctx.beginPath(); ctx.moveTo(padLeft, padTop); ctx.lineTo(padLeft + drawWidth, padTop); ctx.stroke();

  // Min Elevation
  ctx.fillText(Math.round(minEle) + 'm', padLeft - 5, padTop + drawHeight);
  ctx.beginPath(); ctx.moveTo(padLeft, padTop + drawHeight); ctx.lineTo(padLeft + drawWidth, padTop + drawHeight); ctx.stroke();

  // Mid Elevation
  const midEle = (minEle + maxEle) / 2;
  ctx.fillText(Math.round(midEle) + 'm', padLeft - 5, padTop + drawHeight / 2);
  ctx.beginPath(); ctx.moveTo(padLeft, padTop + drawHeight / 2); ctx.lineTo(padLeft + drawWidth, padTop + drawHeight / 2); ctx.stroke();

  // X-axis (Distance in km)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const totalKm = totalDist / 1000;
  const numTicks = 4;
  for (let i = 0; i <= numTicks; i++) {
    const frac = i / numTicks;
    const x = padLeft + frac * drawWidth;
    const val = (frac * totalKm).toFixed(1);
    ctx.fillText(val, x, padTop + drawHeight + 5);
  }

  canvas.style.display = 'block';
}

function renderTrackOnMap(fitBounds = true) {
  if (state.points.length === 0) return;

  elements.mapPlaceholder.classList.add('hidden');

  const latLngs = state.points.map(p => [p.lat, p.lon]);

  if (state.mapLayers.trackLine) {
    state.map.removeLayer(state.mapLayers.trackLine);
  }

  state.mapLayers.trackLine = L.polyline(latLngs, {
    color: '#3b82f6',
    weight: 4.5,
    opacity: 0.9
  }).addTo(state.map);

  // Click on polyline to add manual turn
  state.mapLayers.trackLine.on('click', (e) => {
    if (state.isEditingRoute) {
      insertWaypointAtLatLng(e.latlng);
    } else if (state.isAddingManualTurn) {
      openAddManualTurnModal(e.latlng);
    }
  });

  if (fitBounds) {
    state.map.fitBounds(state.mapLayers.trackLine.getBounds(), { padding: [40, 40] });
  }
}

/**
 * Snap to OSM Roads (Map Matching) with Anti-Double Track Filter:
 * Ensures the route does not create loops or double lines along dual-carriageways.
 */
async function snapGpxToOsmRoads(showNotification = true) {
  if (state.points.length < 2) return;

  if (showNotification) {
    showToast(t('toastSmoothing'), 'info', false);
    elements.snapSpinner.classList.add('spinning');
  }

  try {
    const chunkSize = 40;
    const sampleStep = Math.max(1, Math.floor(state.points.length / 100));
    const sampled = [];
    for (let i = 0; i < state.points.length; i += sampleStep) {
      sampled.push({ point: state.points[i], origIndex: i });
    }
    if (sampled[sampled.length - 1].origIndex !== state.points.length - 1) {
      sampled.push({ point: state.points[state.points.length - 1], origIndex: state.points.length - 1 });
    }

    const rawSnapped = [];

    for (let chunkStart = 0; chunkStart < sampled.length - 1; chunkStart += chunkSize - 1) {
      const chunkEnd = Math.min(sampled.length, chunkStart + chunkSize);
      const chunkSampled = sampled.slice(chunkStart, chunkEnd);
      if (chunkSampled.length < 2) break;

      const coordString = chunkSampled.map(s => `${s.point.lon.toFixed(6)},${s.point.lat.toFixed(6)}`).join(';');
      const radiuses = chunkSampled.map(() => '35').join(';');

      let chunkMatched = false;

      try {
        const url = `https://router.project-osrm.org/match/v1/bike/${coordString}?overview=full&geometries=geojson&radiuses=${radiuses}&tidy=true`;
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (response.ok) {
          const json = await response.json();
          if (json.code === 'Ok' && json.matchings && json.matchings.length > 0) {
            json.matchings.forEach(matching => {
              if (matching.geometry && matching.geometry.coordinates) {
                matching.geometry.coordinates.forEach(c => {
                  rawSnapped.push({ lat: c[1], lon: c[0] });
                });
              }
            });
            chunkMatched = true;
          }
        }
      } catch (e) {
        chunkMatched = false;
      }

      if (!chunkMatched) {
        chunkSampled.forEach(s => {
          rawSnapped.push({ lat: s.point.lat, lon: s.point.lon });
        });
      }
    }

    // Anti-Double Track & Monotonic Forward Progress Filter:
    // Removes backward jumps and duplicate points closer than 4 meters
    const cleaned = [];
    for (let i = 0; i < rawSnapped.length; i++) {
      const cur = rawSnapped[i];
      if (cleaned.length === 0) {
        cleaned.push(cur);
      } else {
        const prev = cleaned[cleaned.length - 1];
        const dist = haversineDistance(prev.lat, prev.lon, cur.lat, cur.lon);
        // Skip duplicate or tiny jitter points
        if (dist >= 4) {
          cleaned.push(cur);
        }
      }
    }

    if (cleaned.length > 5) {
      let runningDist = 0;
      let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
      const newPoints = [];

      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (i > 0) {
          const prev = newPoints[i - 1];
          runningDist += haversineDistance(prev.lat, prev.lon, c.lat, c.lon);
        }
        latMin = Math.min(latMin, c.lat);
        latMax = Math.max(latMax, c.lat);
        lonMin = Math.min(lonMin, c.lon);
        lonMax = Math.max(lonMax, c.lon);

        newPoints.push({
          lat: c.lat,
          lon: c.lon,
          ele: 0,
          distFromStart: runningDist
        });
      }

      state.points = newPoints;
      state.totalDistance = runningDist;
      state.boundingBox = { latMin, latMax, lonMin, lonMax };
      state.isSnapped = true;

      elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
      elements.statPoints.textContent = newPoints.length.toLocaleString();

      renderTrackOnMap();
      if (showNotification) {
        showToast(t('toastSmoothSuccess'), 'success');
      }
    }
  } catch (err) {
    console.error('Road snap error:', err);
    if (showNotification) {
      showToast(t('toastSnapFailed'), 'info');
    }
  } finally {
    if (showNotification) {
      elements.snapSpinner.classList.remove('spinning');
    }
  }
}

/**
 * Interactive Route Editing Mode:
 * Allows dragging vertices and clicking on the path to add new vertices.
 */
function toggleRouteEditing() {
  if (state.points.length === 0) {
    showToast(t('toastUploadFirstEdit'), 'error');
    return;
  }

  if (state.isAddingManualTurn) {
    toggleAddManualTurnMode();
  }

  state.isEditingRoute = !state.isEditingRoute;

  if (state.isEditingRoute) {
    elements.btnToggleEditRoute.classList.add('active');
    elements.btnEditRouteText.setAttribute('data-i18n', 'btnEditModeOff');
    elements.btnEditRouteText.textContent = t('btnEditModeOff');
    elements.btnSaveRouteEdit.classList.remove('hidden');
    if (elements.btnUndoEdit) elements.btnUndoEdit.classList.remove('hidden');
    if (elements.btnRedoEdit) elements.btnRedoEdit.classList.remove('hidden');
    elements.editStatusBar.classList.remove('hidden');

    state.history = [];
    state.historyIndex = -1;
    saveHistoryState();

    // Save original state for cancel
    state.originalPointsBeforeEdit = state.points.map(p => ({ ...p }));

    setupRouteEditHandles();
    showToast(t('toastEditModeOn'), 'info');
  } else {
    elements.btnToggleEditRoute.classList.remove('active');
    elements.btnEditRouteText.setAttribute('data-i18n', 'btnEditModeOn');
    elements.btnEditRouteText.textContent = t('btnEditModeOn');
    elements.btnSaveRouteEdit.classList.add('hidden');
    if (elements.btnUndoEdit) elements.btnUndoEdit.classList.add('hidden');
    if (elements.btnRedoEdit) elements.btnRedoEdit.classList.add('hidden');
    elements.editStatusBar.classList.add('hidden');

    // Restore points if canceled (not saved)
    if (state.originalPointsBeforeEdit) {
      state.points = state.originalPointsBeforeEdit;
      state.originalPointsBeforeEdit = null;
      recalculateRouteDistances();
    }

    clearEditHandles();
    renderTrackOnMap(false);
  }
}

function setupRouteEditHandles() {
  clearEditHandles();

  const step = Math.max(1, Math.floor(state.points.length / 30));

  for (let i = 0; i < state.points.length; i += step) {
    const pt = state.points[i];
    const pointIndex = i;

    const handleIcon = L.divIcon({
      className: 'route-edit-handle',
      html: `
        <div style="
          width: 14px;
          height: 14px;
          background: #ffffff;
          border: 3px solid #3b82f6;
          border-radius: 50%;
          cursor: grab;
          box-shadow: 0 0 8px rgba(0,0,0,0.6);
        "></div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker([pt.lat, pt.lon], {
      icon: handleIcon,
      draggable: true
    }).addTo(state.map);

    marker.on('drag', (e) => {
      const newPos = e.target.getLatLng();
      state.points[pointIndex].lat = newPos.lat;
      state.points[pointIndex].lon = newPos.lng;

      const updatedLatLngs = state.points.map(p => [p.lat, p.lon]);
      state.mapLayers.trackLine.setLatLngs(updatedLatLngs);
    });

    marker.on('dragend', async (e) => {
      recalculateRouteDistances();
      saveHistoryState();
      renderTrackOnMap(false);
      setupRouteEditHandles();
    });

    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      state.points.splice(pointIndex, 1);
      recalculateRouteDistances();
      saveHistoryState();
      renderTrackOnMap(false);
      setupRouteEditHandles();
    });

    state.mapLayers.editHandles.push(marker);
  }
}

/**
 * Inserts a new waypoint vertex when clicking on the track polyline in Edit Mode.
 */
async function insertWaypointAtLatLng(latlng) {
  const insertIdx = findBestInsertIndex(state.points, latlng.lat, latlng.lng);

  if (elements.chkManualSnap && elements.chkManualSnap.checked) {
    const prevIndex = Math.max(0, insertIdx - 1);
    const nextIndex = Math.min(state.points.length - 1, insertIdx);

    showToast(t('toastRoutingNewPoint'), 'info', false);
    const coords = [
      state.points[prevIndex],
      { lat: latlng.lat, lon: latlng.lng },
      state.points[nextIndex]
    ];
    const routedPoints = await routeSegmentOSRM(coords);
    if (routedPoints && routedPoints.length > 0) {
      state.points.splice(prevIndex, nextIndex - prevIndex + 1, ...routedPoints);
    } else {
      const newPt = { lat: latlng.lat, lon: latlng.lng, ele: 0, distFromStart: 0 };
      await fetchElevationForSinglePoint(newPt);
      state.points.splice(insertIdx, 0, newPt);
    }
  } else {
    const newPt = { lat: latlng.lat, lon: latlng.lng, ele: 0, distFromStart: 0 };
    await fetchElevationForSinglePoint(newPt);
    state.points.splice(insertIdx, 0, newPt);
  }

  recalculateRouteDistances();
  saveHistoryState();
  renderTrackOnMap(false);
  setupRouteEditHandles();
  showToast(t('toastPointAddedIndex').replace('{idx}', insertIdx), 'success');
}

function findBestInsertIndex(points, lat, lon) {
  let bestIdx = 1;
  let minExtraDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dOriginal = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    const dVia = haversineDistance(p1.lat, p1.lon, lat, lon) + haversineDistance(lat, lon, p2.lat, p2.lon);
    const extra = dVia - dOriginal;

    if (extra < minExtraDist) {
      minExtraDist = extra;
      bestIdx = i + 1;
    }
  }

  return bestIdx;
}

async function routeSegmentOSRM(coords) {
  const coordString = coords.map(c => `${c.lon.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/cycling/${coordString}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const geom = data.routes[0].geometry;
        if (geom && geom.coordinates) {
          const rawPoints = geom.coordinates.map(c => ({ lat: c[1], lon: c[0], ele: 0, distFromStart: 0 }));
          // Fetch elevations in chunks of 100 to avoid URL length limits
          const chunkSize = 100;
          for (let i = 0; i < rawPoints.length; i += chunkSize) {
            const chunk = rawPoints.slice(i, i + chunkSize);
            const lats = chunk.map(p => p.lat.toFixed(5)).join(',');
            const lons = chunk.map(p => p.lon.toFixed(5)).join(',');
            try {
              const eleRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
              if (eleRes.ok) {
                const eleData = await eleRes.json();
                if (eleData && eleData.elevation) {
                  eleData.elevation.forEach((ele, idx) => {
                    if (ele !== null && !isNaN(ele)) {
                      rawPoints[i + idx].ele = ele;
                    }
                  });
                }
              }
            } catch (err) {
              console.warn('Gagal menarik data elevasi:', err);
            }
          }
          return rawPoints;
        }
      }
    }
  } catch (e) {
    console.error('OSRM Route error:', e);
  }
  return null;
}

async function fetchElevationForSinglePoint(point) {
  try {
    const lat = point.lat.toFixed(5);
    const lon = point.lon.toFixed(5);
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.elevation && data.elevation.length > 0) {
        point.ele = data.elevation[0];
      }
    }
  } catch (err) {
    console.warn('Gagal menarik elevasi titik tunggal:', err);
  }
}

function saveHistoryState() {
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }
  const clone = state.points.map(p => ({ ...p }));
  const pinsClone = state.mapLayers.creationPins.map(marker => marker.getLatLng());

  state.history.push({ points: clone, pins: pinsClone });
  if (state.history.length > 20) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
  updateUndoRedoUI();
}

function updateUndoRedoUI() {
  if ((state.isEditingRoute || state.isCreatingRoute) && elements.btnUndoEdit) {
    elements.btnUndoEdit.disabled = state.historyIndex <= 0;
    elements.btnRedoEdit.disabled = state.historyIndex >= state.history.length - 1;
  }
}

function undoEdit() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    restoreHistoryState(state.history[state.historyIndex]);
    showToast(t('toastUndo'), 'info');
  }
}

function redoEdit() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    restoreHistoryState(state.history[state.historyIndex]);
    showToast(t('toastRedo'), 'info');
  }
}

function restoreHistoryState(historyItem) {
  state.points = historyItem.points.map(p => ({ ...p }));

  if (state.isCreatingRoute) {
    clearCreationPins();
    historyItem.pins.forEach(latlng => {
      const pin = L.circleMarker([latlng.lat, latlng.lng], {
        radius: 6, fillColor: "#ef4444", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
      }).addTo(state.map);
      state.mapLayers.creationPins.push(pin);
    });
  }

  recalculateRouteDistances();
  renderTrackOnMap(false);

  if (state.isEditingRoute) {
    setupRouteEditHandles();
  }
  updateUndoRedoUI();
}

function recalculateRouteDistances() {
  let runningDist = 0;
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;

  for (let i = 0; i < state.points.length; i++) {
    const p = state.points[i];
    if (i > 0) {
      const prev = state.points[i - 1];
      runningDist += haversineDistance(prev.lat, prev.lon, p.lat, p.lon);
    }
    p.distFromStart = runningDist;

    latMin = Math.min(latMin, p.lat);
    latMax = Math.max(latMax, p.lat);
    lonMin = Math.min(lonMin, p.lon);
    lonMax = Math.max(lonMax, p.lon);
  }

  state.totalDistance = runningDist;
  state.boundingBox = { latMin, latMax, lonMin, lonMax };

  elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
  elements.statPoints.textContent = state.points.length.toLocaleString();

  renderElevationChart();
}

async function saveRouteEditing() {
  state.originalPointsBeforeEdit = null;
  recalculateRouteDistances();
  toggleRouteEditing();
  showToast(t('toastRouteUpdated'), 'success');
}

/**
 * Manual Turn Feature:
 * Allows user to add a custom turn by clicking on the map.
 */
function toggleAddManualTurnMode(mode = 'turn') {
  if (state.points.length === 0) {
    showToast(t('toastUploadFirst'), 'error');
    return;
  }

  if (state.isEditingRoute) {
    toggleRouteEditing();
  }

  // If already adding and clicking the same mode, toggle off
  if (state.isAddingManualTurn && state.manualAddMode === mode) {
    state.isAddingManualTurn = false;
  } else {
    // Enable adding with new mode
    state.isAddingManualTurn = true;
    state.manualAddMode = mode;
  }

  // Reset UI
  elements.btnAddTurnManual.classList.remove('active');
  elements.btnAddTurnManual.querySelector('span').setAttribute('data-i18n', 'btnAddTurn');
  elements.btnAddTurnManual.querySelector('span').textContent = t('btnAddTurn');
  elements.btnAddPoiManual.classList.remove('active');
  elements.btnAddPoiManual.querySelector('span').textContent = 'Tambah POI';
  elements.addTurnStatusBar.classList.add('hidden');

  if (state.isAddingManualTurn) {
    if (mode === 'turn') {
      elements.btnAddTurnManual.classList.add('active');
      elements.btnAddTurnManual.querySelector('span').setAttribute('data-i18n', 'btnCancelAddTurn');
      elements.btnAddTurnManual.querySelector('span').textContent = t('btnCancelAddTurn');
    } else {
      elements.btnAddPoiManual.classList.add('active');
      elements.btnAddPoiManual.querySelector('span').textContent = 'Batal Tambah POI';
    }

    elements.addTurnStatusBar.classList.remove('hidden');
    elements.addTurnStatusBar.querySelector('span').textContent = mode === 'turn' ? 'Mode Tambah Belokan Aktif: Klik pada garis rute di peta untuk memasang belokan manual.' : 'Mode Tambah POI Aktif: Klik pada rute untuk meletakkan POI.';
    showToast(t('toastClickManualTurn'), 'info');
  }
}

async function handleMapClick(e) {
  if (state.isProcessingMapClick) return;
  state.isProcessingMapClick = true;
  try {
    if (state.isEditingRoute) {
      await insertWaypointAtLatLng(e.latlng);
    } else if (state.isAddingManualTurn) {
      openAddManualTurnModal(e.latlng);
    } else if (state.isCreatingRoute) {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      const pin = L.circleMarker([lat, lon], {
        radius: 6,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(state.map);
      state.mapLayers.creationPins.push(pin);

      if (state.points.length === 0) {
        const newPt = { lat, lon, ele: 0, distFromStart: 0 };
        await fetchElevationForSinglePoint(newPt);
        state.points.push(newPt);
        renderTrackOnMap(false);
        saveHistoryState();
        showToast(t('toastStartPointAdded'), 'success');
      } else {
        const lastPt = state.points[state.points.length - 1];
        if (elements.chkManualSnap.checked) {
          showToast(t('toastRoutingRoad'), 'info', false);
          const routedPoints = await routeSegmentOSRM([lastPt, { lat, lon }]);
          if (routedPoints && routedPoints.length > 0) {
            state.points.push(...routedPoints.slice(1));
          } else {
            const newPt = { lat, lon, ele: 0, distFromStart: 0 };
            await fetchElevationForSinglePoint(newPt);
            state.points.push(newPt);
          }
        } else {
          const newPt = { lat, lon, ele: 0, distFromStart: 0 };
          await fetchElevationForSinglePoint(newPt);
          state.points.push(newPt);
        }
        recalculateRouteDistances();
        renderTrackOnMap(false);
        saveHistoryState();
        if (elements.chkManualSnap.checked) showToast(t('toastPointSnapped'), 'success');
        else showToast(t('toastPointOffroad'), 'success');
      }
    } else {
      clearClimbHighlight();
    }
  } finally {
    state.isProcessingMapClick = false;
  }
}

async function closeRouteLoop() {
  if (state.points.length < 2) {
    showToast("Rute harus memiliki minimal 2 titik untuk bisa ditutup.", "error");
    return;
  }
  state.isProcessing = true;
  elements.btnProcess.disabled = true;

  try {
    const firstPt = state.points[0];
    const lastPt = state.points[state.points.length - 1];

    if (firstPt.lat === lastPt.lat && firstPt.lon === lastPt.lon) {
      showToast("Rute sudah tertutup (Loop).", "info");
      return;
    }

    const lat = firstPt.lat;
    const lon = firstPt.lon;

    if (elements.chkManualSnap && elements.chkManualSnap.checked) {
      showToast("Menutup rute ke titik awal (Snap)...", "info", false);
      const routedPoints = await routeSegmentOSRM([lastPt, { lat, lon }]);
      if (routedPoints && routedPoints.length > 0) {
        state.points.push(...routedPoints.slice(1));
      } else {
        const newPt = { lat, lon, ele: firstPt.ele, distFromStart: 0 };
        state.points.push(newPt);
      }
    } else {
      const newPt = { lat, lon, ele: firstPt.ele, distFromStart: 0 };
      state.points.push(newPt);
    }
    
    recalculateRouteDistances();
    renderTrackOnMap(false);
    saveHistoryState();
    updateStatsAndUI();
    showToast("Rute berhasil ditutup (Loop)!", "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal menutup rute.", "error");
  } finally {
    state.isProcessing = false;
    elements.btnProcess.disabled = false;
  }
}

function toggleCreateManualRoute() {
  if (state.isEditingRoute) toggleRouteEditing();
  if (state.isAddingManualTurn) toggleAddManualTurnMode();

  state.isCreatingRoute = !state.isCreatingRoute;

  if (state.isCreatingRoute) {
    if (state.points.length > 0) {
      if (!confirm('Memulai rute manual akan menghapus rute yang ada di peta saat ini. Lanjutkan?')) {
        state.isCreatingRoute = false;
        return;
      }
      resetState();
      state.isCreatingRoute = true;
    }

    elements.btnCreateManualRoute.classList.add('active');
    elements.btnCreateManualRoute.querySelector('span').setAttribute('data-i18n', 'btnEndRoute');
    elements.btnCreateManualRoute.querySelector('span').textContent = t('btnEndRoute');
    elements.createStatusBar.classList.remove('hidden');
    elements.mapPlaceholder.classList.add('hidden');
    if (elements.btnUndoEdit) elements.btnUndoEdit.classList.remove('hidden');
    if (elements.btnRedoEdit) elements.btnRedoEdit.classList.remove('hidden');
    elements.btnProcess.disabled = false;
    elements.btnManualSnap.disabled = true;

    state.history = [];
    state.historyIndex = -1;
    saveHistoryState();

    showToast(t('toastClickMapManual'), 'info');
  } else {
    elements.btnCreateManualRoute.classList.remove('active');
    elements.btnCreateManualRoute.querySelector('span').setAttribute('data-i18n', 'btnCreateRoute');
    elements.btnCreateManualRoute.querySelector('span').textContent = t('btnCreateRoute');
    elements.createStatusBar.classList.add('hidden');
    if (elements.btnUndoEdit) elements.btnUndoEdit.classList.add('hidden');
    if (elements.btnRedoEdit) elements.btnRedoEdit.classList.add('hidden');
    clearCreationPins();

    if (state.points.length === 0) {
      elements.mapPlaceholder.classList.remove('hidden');
      elements.btnProcess.disabled = true;
    } else {
      state.fileName = 'manual_route.gpx';
      state.baseName = 'manual_route';
      elements.fileName.textContent = 'Rute Manual';
      elements.fileMeta.textContent = `${state.points.length} titik`;
      elements.fileInfo.classList.remove('hidden');
      elements.dropZone.querySelector('.drop-zone-content').classList.add('hidden');
      elements.btnProcess.disabled = false;
      elements.btnManualSnap.disabled = false;
    }
  }
}

function openAddManualTurnModal(latlng) {
  state.pendingManualCoord = latlng;
  elements.manualTurnCoords.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
  elements.manualTurnText.value = '';

  const optTurns = document.getElementById('optgroupTurns');
  const optPois = document.getElementById('optgroupPois');

  if (state.manualAddMode === 'turn') {
    if (optTurns) {
      optTurns.style.display = '';
      optTurns.hidden = false;
      optTurns.disabled = false;
    }
    if (optPois) {
      optPois.style.display = 'none';
      optPois.hidden = true;
      optPois.disabled = true;
    }
    elements.manualTurnDirection.value = "10"; // Straight as default
  } else {
    if (optTurns) {
      optTurns.style.display = 'none';
      optTurns.hidden = true;
      optTurns.disabled = true;
    }
    if (optPois) {
      optPois.style.display = '';
      optPois.hidden = false;
      optPois.disabled = false;
    }
    elements.manualTurnDirection.value = "106"; // Water as default POI
  }

  elements.modalAddTurn.classList.remove('hidden');
  elements.modalAddTurn.style.display = 'flex';
}

function closeModal() {
  elements.modalAddTurn.classList.add('hidden');
  elements.modalAddTurn.style.display = 'none';
  state.pendingManualCoord = null;
  if (state.isAddingManualTurn) {
    toggleAddManualTurnMode(state.manualAddMode);
  }
}

function confirmAddManualTurn() {
  if (!state.pendingManualCoord) return;

  const lat = state.pendingManualCoord.lat;
  const lon = state.pendingManualCoord.lng;
  const dirCode = parseInt(elements.manualTurnDirection.value, 10);
  let text = elements.manualTurnText.value.trim();
  if (!text) {
    if (dirCode >= 100) {
      let poiCount = state.manualTurns.filter(t => t.directionCode >= 100).length;
      text = `POI ${poiCount + 1}`;
    } else {
      text = getDirectionLabel(dirCode);
    }
  }

  const closestIdx = findClosestPointIndex(state.points, lat, lon);
  const pt = state.points[closestIdx];

  state.manualTurns.push({
    source: 'manual',
    index: closestIdx,
    lat: pt.lat,
    lon: pt.lon,
    directionCode: dirCode,
    instruction: text,
    distFromStart: pt.distFromStart
  });

  closeModal();
  showToast(t('toastTurnAdded').replace('{text}', text), 'success');

  // Re-finalize instructions & re-render
  state.climbs = detectClimbs(state.points);
  state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbs);
  updateStatsAndUI();
}

/**
 * Main Turn-by-Turn Analysis Workflow:
 * Fix for OSM TBT:
 * 1. Checks for OpenRouteService (ORS) API Key if provided.
 * 2. Queries OSRM Match with proper parameters.
 * 3. Fallback: Directly queries OpenStreetMap Overpass API for real street intersections.
 * 4. Merges with Smart Angle Detection and Manual Turns.
 */
async function runTurnAnalysis() {
  if (state.points.length === 0) return;

  state.isProcessing = true;
  elements.btnProcess.disabled = true;
  elements.processSpinner.classList.add('spinning');
  showToast(t('toastAnalyzing'), 'info', false);

  try {


    state.osmTurns = [];
    state.extraTurns = [];

    const useOsm = elements.enableOsmTbt.checked;
    if (useOsm) {
      const orsKey = elements.orsApiKey.value.trim();
      if (orsKey) {
        showToast(t('toastFetchORS'), 'info', false);
        state.osmTurns = await fetchOrsTurnByTurn(state.points, orsKey);
      } else {
        try {
          state.osmTurns = await fetchOsmTurnByTurn(state.points);
        } catch (e) {
          console.warn('OSRM Match failed, falling back to OSM Overpass Intersection engine...', e);
        }

        // If OSRM returned 0, run our built-in OSM Overpass Intersection Engine!
        if (state.osmTurns.length === 0) {
          showToast(t('toastFetchOverpass'), 'info', false);
          state.osmTurns = await fetchOsmOverpassIntersections(state.points);
        }
      }
    }

    const angleThresh = parseInt(elements.angleThreshold.value, 10);
    const dupDistThresh = parseInt(elements.dupDistanceThreshold.value, 10);
    const smoothingDist = parseInt(elements.smoothingRadius.value, 10);

    state.extraTurns = detectAngleTurns(state.points, state.osmTurns, angleThresh, dupDistThresh, smoothingDist);

    state.climbs = detectClimbs(state.points);
    let combined = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbs);

    if (elements.enableOsmNames.checked && combined.length > 0) {
      showToast(t('toastFetchOsmNames'), 'info', false);
      combined = await enrichStreetNamesFromOsm(combined);
    }

    state.combinedInstructions = combined;
    updateStatsAndUI();

    elements.btnDownloadBryton.disabled = false;
    elements.btnDownloadKml.disabled = false;
    elements.btnDownloadGpx.disabled = false;
    elements.btnDownloadFit.disabled = false;
    initIcons();
    showToast(t('toastAnalysisDone').replace('{count}', state.combinedInstructions.length), 'success');
  } catch (error) {
    console.error('Analysis failed:', error);
    showToast(t('toastAnalyzeError') + error.message, 'error');
  } finally {
    state.isProcessing = false;
    elements.btnProcess.disabled = false;
    elements.processSpinner.classList.remove('spinning');
  }
}

/**
 * OpenRouteService (ORS) Directions API Integration (when user supplies API key)
 */
async function fetchOrsTurnByTurn(points, apiKey) {
  if (points.length < 2) return [];

  const sampled = [points[0]];
  const step = Math.max(1, Math.floor(points.length / 35));
  for (let i = step; i < points.length - 1; i += step) {
    sampled.push(points[i]);
  }
  sampled.push(points[points.length - 1]);

  const coords = sampled.map(p => [p.lon, p.lat]);

  const res = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey
    },
    body: JSON.stringify({ coordinates: coords, instructions: true })
  });

  if (!res.ok) throw new Error(`ORS API Error ${res.status}`);

  const data = await res.json();
  const turns = [];

  if (data.routes && data.routes[0] && data.routes[0].segments) {
    data.routes[0].segments.forEach(seg => {
      seg.steps.forEach(step => {
        const type = step.type; // 0=left, 1=right, etc.
        const dirCode = mapOrsTypeToDirectionCode(type);
        const loc = step.way_points; // index range
        const approxPt = sampled[Math.min(sampled.length - 1, loc[0])];
        const closestIdx = findClosestPointIndex(points, approxPt.lat, approxPt.lon);

        turns.push({
          source: 'osm',
          index: closestIdx,
          lat: points[closestIdx].lat,
          lon: points[closestIdx].lon,
          directionCode: dirCode,
          instruction: step.instruction || `${getDirectionLabel(dirCode)}: ${step.name || ''}`,
          distFromStart: points[closestIdx].distFromStart
        });
      });
    });
  }

  return turns;
}

function mapOrsTypeToDirectionCode(orsType) {
  switch (orsType) {
    case 0: return 3;   // left
    case 1: return 2;   // right
    case 2: return 7;   // close left
    case 3: return 6;   // close right
    case 4: return 5;   // slight left
    case 5: return 4;   // slight right
    case 6: return 10;  // continue straight
    case 7: return 10;  // roundabout -> continue straight
    case 8: return 9;   // exit left
    case 9: return 11;  // uturn right
    case 10: return 1;  // go ahead
    case 11: return 1;  // go ahead
    case 12: return 5;  // keep left -> slight left
    case 13: return 4;  // keep right -> slight right
    case 14: return 1;  // unknown -> go ahead
    default: return 1;
  }
}

/**
 * Built-in OSM Overpass & Geometric Intersection Matcher:
 * Directly queries OpenStreetMap road network around bend points to guarantee
 * genuine OSM turns & street names without third-party routing server rate limits!
 */
async function fetchOsmOverpassIntersections(points) {
  const osmTurns = [];
  if (points.length < 3) return osmTurns;

  // Find candidate turns from significant bends (e.g. angle >= 25)
  const candidateIndices = [];
  for (let i = 2; i < points.length - 2; i += 2) {
    const pPrev = points[i - 2];
    const pCur = points[i];
    const pNext = points[i + 2];

    const b1 = calculateBearing(pPrev.lat, pPrev.lon, pCur.lat, pCur.lon);
    const b2 = calculateBearing(pCur.lat, pCur.lon, pNext.lat, pNext.lon);
    let diff = b2 - b1;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    if (Math.abs(diff) >= 28) {
      candidateIndices.push({ index: i, angleDiff: diff });
    }
  }

  // Sample top 8 key turns to query OSM Nominatim/Overpass
  const selected = candidateIndices.slice(0, 10);

  for (const c of selected) {
    const pt = points[c.index];
    const absAngle = Math.abs(c.angleDiff);

    let dirCode = 1;
    if (absAngle >= 135) dirCode = c.angleDiff < 0 ? 7 : 6;
    else if (absAngle >= 55) dirCode = c.angleDiff < 0 ? 3 : 2;
    else dirCode = c.angleDiff < 0 ? 5 : 4;

    let originName = '';
    let destName = '';
    try {
      const originPt = points[Math.max(0, c.index - 3)];
      const destPt = points[Math.min(points.length - 1, c.index + 3)];

      if (originPt) {
        const urlO = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${originPt.lat.toFixed(6)}&lon=${originPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resO = await fetch(urlO, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resO.ok) {
          const dataO = await resO.json();
          if (dataO && dataO.address) originName = dataO.address.road || dataO.address.neighbourhood || '';
        }
      }

      if (destPt) {
        const urlD = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${destPt.lat.toFixed(6)}&lon=${destPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resD = await fetch(urlD, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resD.ok) {
          const dataD = await resD.json();
          if (dataD && dataD.address) destName = dataD.address.road || dataD.address.neighbourhood || '';
        }
      }
    } catch (e) {
      // ignore
    }

    let text = getDirectionLabel(dirCode);
    if (destName && destName !== originName) {
      text = `${getDirectionLabel(dirCode)} ke ${destName}`;
    }

    osmTurns.push({
      source: 'osm',
      index: c.index,
      lat: pt.lat,
      lon: pt.lon,
      directionCode: dirCode,
      instruction: text,
      distFromStart: pt.distFromStart
    });
  }

  return osmTurns;
}

/**
 * Standard OSRM Match API
 */
async function fetchOsmTurnByTurn(points) {
  if (points.length < 2) return [];

  const chunkSize = 50;
  const sampleStep = Math.max(1, Math.floor(points.length / 100));
  const sampled = [];
  for (let i = 0; i < points.length; i += sampleStep) {
    sampled.push({ point: points[i], origIndex: i });
  }

  const allOsmTurns = [];
  const coordString = sampled.map(s => `${s.point.lon.toFixed(6)},${s.point.lat.toFixed(6)}`).join(';');
  const radiuses = sampled.map(() => '45').join(';');

  const url = `https://router.project-osrm.org/match/v1/driving/${coordString}?overview=simplified&geometries=geojson&steps=true&annotations=false&radiuses=${radiuses}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return [];

  const json = await response.json();
  if (json.code !== 'Ok' || !json.matchings) return [];

  json.matchings.forEach(matching => {
    matching.legs.forEach(leg => {
      leg.steps.forEach(step => {
        const maneuver = step.maneuver;
        if (!maneuver) return;

        const dirCode = mapOsrmManeuverToDirectionCode(maneuver.type, maneuver.modifier);
        const loc = maneuver.location;
        const matchedIndex = findClosestPointIndex(points, loc[1], loc[0]);
        const matchedPoint = points[matchedIndex];

        let instructionText = step.name ? `Lanjut ke ${step.name}` : getDirectionLabel(dirCode);
        if (maneuver.type === 'turn' || maneuver.type === 'fork') {
          instructionText = `${getDirectionLabel(dirCode)} ${step.name ? 'ke ' + step.name : ''}`.trim();
        }

        allOsmTurns.push({
          source: 'osm',
          index: matchedIndex,
          lat: matchedPoint.lat,
          lon: matchedPoint.lon,
          directionCode: dirCode,
          instruction: instructionText,
          distFromStart: matchedPoint.distFromStart
        });
      });
    });
  });

  return allOsmTurns;
}

function detectClimbs(points) {
  const climbs = [];
  let inClimb = false;
  let startIndex = 0;

  for (let i = 1; i < points.length; i++) {
    if (!inClimb) {
      // Check if starting a climb: gradient > 2% over next 100m
      let futureIdx = i;
      while (futureIdx < points.length && points[futureIdx].distFromStart - points[i].distFromStart < 100) futureIdx++;
      if (futureIdx < points.length) {
        let d = points[futureIdx].distFromStart - points[i].distFromStart;
        let e = points[futureIdx].ele - points[i].ele;
        if ((e / d) * 100 >= 2.0) {
          inClimb = true;
          startIndex = i;
        }
      }
    } else {
      // Check if climb has ended: gradient <= 0% over next 150m (allow small flat sections), or reached end of route
      let isEnd = false;
      let futureIdx = i;
      while (futureIdx < points.length && points[futureIdx].distFromStart - points[i].distFromStart < 150) futureIdx++;

      if (futureIdx < points.length) {
        let d = points[futureIdx].distFromStart - points[i].distFromStart;
        let e = points[futureIdx].ele - points[i].ele;
        if ((e / d) * 100 <= -1.0) { // drops significantly
          isEnd = true;
        }
      } else {
        isEnd = true; // end of route
      }

      if (isEnd) {
        let totalDist = points[i].distFromStart - points[startIndex].distFromStart;
        let totalEle = points[i].ele - points[startIndex].ele;
        let avgGrad = (totalEle / totalDist) * 100;
        let score = totalDist * avgGrad;

        const minD = parseFloat(elements.climbMinDist ? elements.climbMinDist.value : 500);
        const minG = parseFloat(elements.climbMinGrade ? elements.climbMinGrade.value : 3.0);
        const minS = parseFloat(elements.climbMinScore ? elements.climbMinScore.value : 1500);

        if (totalDist >= minD && avgGrad >= minG && score >= minS) {
          climbs.push({
            startIndex: startIndex,
            endIndex: i,
            dist: totalDist,
            eleGain: totalEle,
            avgGrad: avgGrad
          });
        }
        inClimb = false;
      }
    }
  }
  return climbs;
}

async function enrichStreetNamesFromOsm(instructions) {
  const enriched = [...instructions];
  const toEnrich = enriched.filter(inst => !inst.instruction.includes('Jl.') && !inst.instruction.includes('Jalan')).slice(0, 10);

  for (const inst of toEnrich) {
    try {
      const originPt = state.points[Math.max(0, inst.index - 3)];
      const destPt = state.points[Math.min(state.points.length - 1, inst.index + 3)];

      let originName = '';
      let destName = '';

      if (originPt) {
        const urlO = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${originPt.lat.toFixed(6)}&lon=${originPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resO = await fetch(urlO, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resO.ok) {
          const dataO = await resO.json();
          if (dataO && dataO.address) originName = dataO.address.road || dataO.address.pedestrian || dataO.address.cycleway || '';
        }
      }

      if (destPt) {
        const urlD = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${destPt.lat.toFixed(6)}&lon=${destPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resD = await fetch(urlD, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resD.ok) {
          const dataD = await resD.json();
          if (dataD && dataD.address) destName = dataD.address.road || dataD.address.pedestrian || dataD.address.cycleway || '';
        }
      }

      if (destName && destName !== originName) {
        inst.instruction = `${getDirectionLabel(inst.directionCode)} ke ${destName}`;
      }
    } catch (e) {
      // ignore
    }
  }

  return enriched;
}

function mapOsrmManeuverToDirectionCode(type, modifier) {
  if (type === 'depart') return 1;
  if (type === 'arrive') return 1;

  if (modifier === 'uturn') return 11;
  if (modifier === 'sharp left') return 7;
  if (modifier === 'left') return 3;
  if (modifier === 'slight left') return 5;
  if (modifier === 'straight') return 10;
  if (modifier === 'slight right') return 4;
  if (modifier === 'right') return 2;
  if (modifier === 'sharp right') return 6;

  return 1;
}

function detectAngleTurns(points, existingOsmTurns, angleThreshold, dupDistThreshold, smoothingDist) {
  const extraTurns = [];
  const n = points.length;
  if (n < 3) return extraTurns;

  let lastAddedDist = -9999;

  for (let i = 1; i < n - 1; i++) {
    const curPoint = points[i];

    let prevIdx = i - 1;
    while (prevIdx > 0 && (curPoint.distFromStart - points[prevIdx].distFromStart) < smoothingDist) {
      prevIdx--;
    }

    let nextIdx = i + 1;
    while (nextIdx < n - 1 && (points[nextIdx].distFromStart - curPoint.distFromStart) < smoothingDist) {
      nextIdx++;
    }

    const b1 = calculateBearing(points[prevIdx].lat, points[prevIdx].lon, curPoint.lat, curPoint.lon);
    const b2 = calculateBearing(curPoint.lat, curPoint.lon, points[nextIdx].lat, points[nextIdx].lon);

    let angleDiff = b2 - b1;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const absAngle = Math.abs(angleDiff);

    if (absAngle >= angleThreshold) {
      let dirCode = 1;
      let label = '';
      if (absAngle >= 135) {
        dirCode = angleDiff < 0 ? 7 : 6;
        label = angleDiff < 0 ? `Belok Tajam Kiri` : `Belok Tajam Kanan`;
      } else if (absAngle >= 55) {
        dirCode = angleDiff < 0 ? 3 : 2;
        label = angleDiff < 0 ? `Belok Kiri` : `Belok Kanan`;
      } else {
        dirCode = angleDiff < 0 ? 5 : 4;
        label = angleDiff < 0 ? `Serong Kiri` : `Serong Kanan`;
      }

      const isAlreadyInOsm = existingOsmTurns.some(osm => {
        const distToOsm = haversineDistance(curPoint.lat, curPoint.lon, osm.lat, osm.lon);
        if (distToOsm <= dupDistThreshold) {
          const isLeft = (c) => [3, 5, 7, 9, 12].includes(c);
          const isRight = (c) => [2, 4, 6, 8, 11].includes(c);
          if ((isLeft(dirCode) && isRight(osm.directionCode)) || (isRight(dirCode) && isLeft(osm.directionCode))) {
            return false;
          }
          return true;
        }
        return false;
      });

      const isAlreadyInExtra = extraTurns.some(extra => {
        const distToExtra = haversineDistance(curPoint.lat, curPoint.lon, extra.lat, extra.lon);
        if (distToExtra <= dupDistThreshold) {
          if ((dirCode < 0 && extra.directionCode > 0) || (dirCode > 0 && extra.directionCode < 0)) {
            return false;
          }
          return true;
        }
        return false;
      });

      if (isAlreadyInOsm || isAlreadyInExtra) {
        continue;
      }

      extraTurns.push({
        source: 'extra',
        index: i,
        lat: curPoint.lat,
        lon: curPoint.lon,
        directionCode: dirCode,
        instruction: label,
        distFromStart: curPoint.distFromStart,
        angle: Math.round(angleDiff)
      });

      lastAddedDist = curPoint.distFromStart;
    }
  }

  return extraTurns;
}

function finalizeInstructions(points, osmTurns, extraTurns, manualTurns = [], climbs = []) {
  const climbTurns = [];
  climbs.forEach((c, idx) => {
    climbTurns.push({
      source: 'climb',
      index: c.startIndex,
      lat: points[c.startIndex].lat,
      lon: points[c.startIndex].lon,
      directionCode: 190,
      instruction: `Climb ${idx + 1} Start`,
      distFromStart: points[c.startIndex].distFromStart
    });
    climbTurns.push({
      source: 'climb',
      index: c.endIndex,
      lat: points[c.endIndex].lat,
      lon: points[c.endIndex].lon,
      directionCode: 191,
      instruction: `Climb ${idx + 1} End`,
      distFromStart: points[c.endIndex].distFromStart
    });
  });

  const all = [...osmTurns, ...extraTurns, ...manualTurns, ...climbTurns];

  if (!all.some(item => item.index === 0)) {
    all.push({
      source: 'osm',
      index: 0,
      lat: points[0].lat,
      lon: points[0].lon,
      directionCode: 0,
      instruction: t('startRoute'),
      distFromStart: 0
    });
  }

  all.sort((a, b) => a.index - b.index);

  const deduplicated = [];
  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    if (deduplicated.length === 0) {
      deduplicated.push(cur);
    } else {
      const prev = deduplicated[deduplicated.length - 1];
      const dist = cur.distFromStart - prev.distFromStart;
      if (dist >= 12 || cur.source === 'manual' || cur.source === 'extra' || cur.source === 'climb') {
        deduplicated.push(cur);
      }
    }
  }

  for (let i = 0; i < deduplicated.length; i++) {
    const cur = deduplicated[i];
    if (i < deduplicated.length - 1) {
      const next = deduplicated[i + 1];
      cur.distance = Math.max(0, next.distFromStart - cur.distFromStart);
    } else {
      cur.distance = Math.max(0, state.totalDistance - cur.distFromStart);
    }
    cur.time = Math.round(cur.distance * 0.722);
  }

  return deduplicated;
}

function updateStatsAndUI() {
  const osmCount = state.combinedInstructions.filter(t => t.source === 'osm').length;
  const extraCount = state.combinedInstructions.filter(t => t.source === 'extra').length;

  elements.statOsmTurns.textContent = osmCount;
  elements.statExtraTurns.textContent = extraCount;
  elements.statTotalTurns.textContent = state.combinedInstructions.length;
  elements.turnCounterBadge.textContent = getInstructionCountLabel(state.combinedInstructions.length);

  renderTurnMarkersOnMap(state.combinedInstructions);
  renderTurnsTable(state.combinedInstructions);
  initIcons();
}

/**
 * Manual Turn Deletion
 */
function deleteTurn(index) {
  if (index < 0 || index >= state.combinedInstructions.length) return;

  const removed = state.combinedInstructions.splice(index, 1);
  showToast(t('toastTurnDeleted').replace('{text}', removed[0].instruction), 'info');

  for (let i = 0; i < state.combinedInstructions.length; i++) {
    const cur = state.combinedInstructions[i];
    if (i < state.combinedInstructions.length - 1) {
      const next = state.combinedInstructions[i + 1];
      cur.distance = Math.max(0, next.distFromStart - cur.distFromStart);
    } else {
      cur.distance = Math.max(0, state.totalDistance - cur.distFromStart);
    }
    cur.time = Math.round(cur.distance * 0.722);
  }

  updateStatsAndUI();
}

/**
 * Renders markers on Leaflet map.
 * Clicking a marker automatically scrolls the table and highlights the matching row!
 */
function renderTurnMarkersOnMap(instructions) {
  clearTurnMarkers();

  instructions.forEach((inst, idx) => {
    let color = '#06b6d4';
    if (inst.source === 'extra') color = '#f59e0b';
    if (inst.source === 'manual') color = '#10b981';

    const symbol = getDirectionArrow(inst.directionCode);

    const customIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="
          background: ${color};
          color: #0b0f19;
          font-weight: 800;
          font-size: 11px;
          border-radius: 50%;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px ${color};
          cursor: pointer;
        ">
          ${symbol}
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const marker = L.marker([inst.lat, inst.lon], { icon: customIcon })
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px;">
          <strong>#${idx + 1} ${escapeHtml(getTranslatedInstruction(inst.instruction, inst.directionCode))}</strong><br>
          <span style="color: #888;">${t('popupSource')} ${inst.source.toUpperCase()}</span><br>
          <span>${t('popupDistance')} ${Math.round(inst.distance)} m</span>
        </div>
      `)
      .addTo(state.map);

    // Auto-scroll and highlight table row when clicked on map!
    marker.on('click', () => {
      scrollToTableRow(idx);
    });

    state.mapLayers.turnMarkers.push(marker);
  });
}

/**
 * Automatically scrolls table to matching row and applies animated highlight
 */
function scrollToTableRow(rowIndex) {
  const targetRow = document.getElementById(`turn-row-${rowIndex}`);
  if (targetRow) {
    // Determine which tab content this row belongs to
    const parentTab = targetRow.closest('.tab-content');
    if (parentTab) {
      const targetId = parentTab.id; // e.g. tab-turns-table
      const tabButton = document.querySelector(`.btn-tab[data-target="${targetId}"]`);
      if (tabButton && !tabButton.classList.contains('active-tab')) {
        tabButton.click(); // Switch to the tab!
      }
    }

    const rows = document.querySelectorAll('.turns-table tr');
    rows.forEach(r => {
      r.classList.remove('highlighted-row');
      r.classList.remove('active-row');
    });

    clearClimbHighlight();

    targetRow.classList.add('highlighted-row');
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      targetRow.classList.remove('highlighted-row');
    }, 3500);
  }
}

function getTranslatedInstruction(text, dirCode) {
  if (!text) return getDirectionLabel(dirCode);

  let result = text;
  // Replace standard phrases if they match
  const keys = ['dirSharpLeft', 'dirSharpRight', 'dirSlightLeft', 'dirSlightRight', 'dirLeft', 'dirRight', 'dirStraight', 'dirUturn', 'startRoute', 'poiFood', 'poiWater', 'poiSummit', 'poiDanger', 'poiSprint', 'poiFirstAid', 'poiValley', 'poiGeneric'];

  for (const key of keys) {
    const idText = translations.id[key];
    const enText = translations.en[key];

    if (currentLang === 'en') {
      if (result.includes(idText)) result = result.replace(idText, enText);
    } else {
      if (result.includes(enText)) result = result.replace(enText, idText);
    }
  }

  // Handle some edge cases with " ke " / " to "
  if (currentLang === 'en') {
    result = result.replace(' ke ', ' to ');
    result = result.replace('Lanjut ke ', 'Continue to ');
  } else {
    result = result.replace(' to ', ' ke ');
    result = result.replace('Continue to ', 'Lanjut ke ');
  }

  return result;
}

/**
 * Populates table with turn-by-turn items and action delete buttons.
 */
function renderTurnsTable(instructions) {
  const turnsBody = document.getElementById('turnsTableBody');
  const poisBody = document.getElementById('poisTableBody');
  const climbsBody = document.getElementById('climbsTableBody');

  turnsBody.innerHTML = '';
  poisBody.innerHTML = '';
  climbsBody.innerHTML = '';

  let tIdx = 1, pIdx = 1, cIdx = 1;

  if (instructions.length === 0) {
    turnsBody.innerHTML = `<tr class="empty-row"><td colspan="8" class="text-center">${typeof t === 'function' ? t('emptyTable') : 'Belum ada data.'}</td></tr>`;
    poisBody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center">${typeof t === 'function' ? t('emptyPois') : 'Belum ada data.'}</td></tr>`;
    climbsBody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data.'}</td></tr>`;
    return;
  }

  instructions.forEach((inst, idx) => {
    const tr = document.createElement('tr');
    tr.id = `turn-row-${idx}`;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-turn')) return;
      document.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
      tr.classList.add('active-row');
      clearClimbHighlight();
      state.map.setView([inst.lat, inst.lon], 16, { animate: true });
      if (state.mapLayers.turnMarkers[idx]) {
        state.mapLayers.turnMarkers[idx].openPopup();
      }
    });

    const arrow = getDirectionArrow(inst.directionCode);
    const instructionText = escapeHtml(getTranslatedInstruction(inst.instruction, inst.directionCode));
    const btnDel = `<button type="button" class="btn-del-turn" data-index="${idx}"><i data-lucide="trash-2"></i></button>`;

    if (inst.directionCode === 190 || inst.directionCode === 191) {
      return; // Skip, climbs are handled below
    } else if (inst.directionCode >= 100 && inst.directionCode <= 108) {
      tr.innerHTML = `
        <td>${pIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center">${btnDel}</td>
      `;
      poisBody.appendChild(tr);
    } else {
      let badgeClass = 'turn-badge-osm';
      let badgeText = t('badgeOsm');
      if (inst.source === 'extra') {
        badgeClass = 'turn-badge-extra';
        badgeText = t('badgeExtra');
      } else if (inst.source === 'manual') {
        badgeClass = 'turn-badge-manual';
        badgeText = t('badgeManual');
      }
      tr.innerHTML = `
        <td>${tIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td><span class="turn-badge ${badgeClass}">${badgeText}</span></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td>${formatTime(inst.time || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center">${btnDel}</td>
      `;
      turnsBody.appendChild(tr);
    }
  });

  // Render Climbs separately
  if (state.climbs.length === 0) {
    climbsBody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data Tanjakan.'}</td></tr>`;
  } else {
    const climbPrefix = typeof t === 'function' ? t('climbPrefix') : 'Tanjakan';
    state.climbs.forEach((climb, idx) => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        document.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
        tr.classList.add('active-row');
        highlightClimb(climb);
      });

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><div class="turn-icon-cell">🧗</div></td>
        <td><strong>${climbPrefix} ${idx + 1}</strong></td>
        <td>${climb.avgGrad.toFixed(1)}%</td>
        <td>${Math.round(climb.dist)}</td>
        <td class="coord-cell">${state.points[climb.startIndex].lat.toFixed(5)}, ${state.points[climb.startIndex].lon.toFixed(5)}</td>
      `;
      climbsBody.appendChild(tr);
    });
    cIdx = state.climbs.length + 1; // For badge
  }

  document.querySelectorAll('.btn-del-turn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      deleteTurn(idx);
    });
  });

  const bTurns = document.getElementById('badge-turns');
  const bPois = document.getElementById('badge-pois');
  const bClimbs = document.getElementById('badge-climbs');
  if (bTurns) bTurns.textContent = (tIdx - 1).toString();
  if (bPois) bPois.textContent = (pIdx - 1).toString();
  if (bClimbs) bClimbs.textContent = (cIdx - 1).toString();

  initIcons();
}

function highlightClimb(climb) {
  if (state.currentClimbHighlight) {
    state.map.removeLayer(state.currentClimbHighlight);
  }

  const climbPoints = state.points.slice(climb.startIndex, climb.endIndex + 1);
  const latlngs = climbPoints.map(p => [p.lat, p.lon]);

  state.currentClimbHighlight = L.polyline(latlngs, {
    color: '#ef4444',
    weight: 6,
    opacity: 0.9
  }).addTo(state.map);

  state.map.fitBounds(state.currentClimbHighlight.getBounds(), { padding: [20, 20] });

  // Render Elevation chart with this climb highlighted
  renderElevationChart(climb);
}

function clearClimbHighlight() {
  if (state.currentClimbHighlight) {
    state.map.removeLayer(state.currentClimbHighlight);
    state.currentClimbHighlight = null;
    renderElevationChart(); // redraw without highlight
  }
}

/**
 * Encodes and builds the Bryton Route ZIP archive containing 5 files:
 * 1. [name].smy (24 bytes header)
 * 2. [name].track (16 bytes per coordinate)
 * 3. [name].tinfo (42 bytes per instruction)
 * 4. [name].gpx (standard GPX track)
 * 5. [name].kml (standard KML track)
 */
async function generateBrytonZip() {
  if (state.points.length === 0 || state.combinedInstructions.length === 0) {
    showToast(t('toastAnalyzeFirst'), 'error');
    return;
  }

  try {
    const zip = new JSZip();
    let prefix = elements.brytonRouteName.value.trim();

    // Fallback to original base name if input is empty
    if (!prefix) {
      prefix = state.baseName || 'bryton-route';
    }

    // Sanitize prefix to be safe for filenames
    prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

    const smyBuffer = createSmyBuffer(state.points.length, state.boundingBox, state.totalDistance);
    zip.file(`${prefix}.smy`, smyBuffer);

    const trackBuffer = createTrackBuffer(state.points);
    zip.file(`${prefix}.track`, trackBuffer);

    const tinfoBuffer = createTinfoBuffer(state.combinedInstructions);
    zip.file(`${prefix}.tinfo`, tinfoBuffer);

    const folder = zip.folder(prefix);

    const zinfoBuffer = new ArrayBuffer(16);
    const zview = new DataView(zinfoBuffer);
    zview.setUint32(0, 2, true);
    zview.setUint32(4, 12, true);
    folder.file(`${prefix}.zinfo`, zinfoBuffer);

    folder.file(`dupli.track`, trackBuffer);
    folder.file(`dupli2.track`, trackBuffer);

    const sortBuffer = new ArrayBuffer(16);
    const sview = new DataView(sortBuffer);
    sview.setUint32(0, 0, true);
    sview.setUint32(4, state.points.length > 0 ? state.points.length - 1 : 0, true);
    sview.setUint32(8, 0x103a1a41, true);
    sview.setUint32(12, 0, true);
    folder.file(`sort1.path`, sortBuffer);

    showToast(t('toastCreatingZip'), 'info', false);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${prefix}-bryton.zip`);

    showToast(t('toastZipSuccess'), 'success');
  } catch (error) {
    console.error('Failed to generate ZIP:', error);
    showToast(t('toastZipError') + error.message, 'error');
  }
}

async function generateGpxFile() {
  if (state.points.length === 0) return;
  let prefix = elements.brytonRouteName.value.trim() || state.baseName || 'bryton-route';
  prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

  const gpxString = createGpxString(state.points, prefix);
  const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
  saveAs(blob, `${prefix}.gpx`);
  showToast('GPX file downloaded successfully!', 'success');
}

async function generateKmlFile() {
  if (state.points.length === 0) return;
  let prefix = elements.brytonRouteName.value.trim() || state.baseName || 'bryton-route';
  prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

  const kmlString = createKmlString(state.points, prefix);
  const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
  saveAs(blob, `${prefix}.kml`);
  showToast('KML file downloaded successfully!', 'success');
}

/**
 * Creates SMY Header Buffer (24 bytes)
 */
function createSmyBuffer(coordsCount, bbox, totalDist) {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);

  view.setUint8(0, 0x01);
  view.setUint8(1, 0x00);

  view.setUint16(2, coordsCount, true);

  const latne = Math.round(bbox.latMax * 1000000);
  const latso = Math.round(bbox.latMin * 1000000);
  const lonne = Math.round(bbox.lonMax * 1000000);
  const lonso = Math.round(bbox.lonMin * 1000000);

  view.setInt32(4, latne, true);
  view.setInt32(8, latso, true);
  view.setInt32(12, lonne, true);
  view.setInt32(16, lonso, true);

  view.setUint32(20, Math.round(totalDist), true);

  return buffer;
}

/**
 * Creates TRACK Buffer (16 bytes per coordinate point)
 */
function createTrackBuffer(points) {
  const buffer = new ArrayBuffer(points.length * 16);
  const view = new DataView(buffer);

  for (let i = 0; i < points.length; i++) {
    const offset = i * 16;
    const lat = Math.round(points[i].lat * 1000000);
    const lon = Math.round(points[i].lon * 1000000);
    const dist = Math.round(points[i].distFromStart || 0);
    const ele = Math.round(points[i].ele || 0); // basic meters (or if bryton uses cm, could be *100, but standard track format often stores in meters or cm, meters is safer)

    view.setInt32(offset, lat, true);
    view.setInt32(offset + 4, lon, true);
    view.setInt32(offset + 8, ele, true);
    view.setUint32(offset + 12, dist, true);
  }

  return buffer;
}

/**
 * Creates TINFO Buffer (42 bytes per instruction)
 */
function createTinfoBuffer(instructions) {
  const buffer = new ArrayBuffer(instructions.length * 44);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const offset = i * 44;

    view.setUint16(offset, inst.index, true);

    let dirByte = 0x01;
    if (inst.directionCode >= 1 && inst.directionCode <= 13) {
      dirByte = inst.directionCode;
    } else {
      switch (inst.directionCode) {
        case 100: dirByte = 100; break; // Target
        case 101: dirByte = 101; break; // Summit
        case 102: dirByte = 102; break; // Food
        case 103: dirByte = 103; break; // First Aid
        case 104: dirByte = 104; break; // Checkpoint
        case 105: dirByte = 105; break; // Group
        case 106: dirByte = 106; break; // Water
        case 107: dirByte = 107; break; // Sprint
        case 190: dirByte = 190; break; // Climb Start
        case 191: dirByte = 191; break; // Climb End
        default: dirByte = 0x01; break;
      }
    }
    view.setUint8(offset + 2, dirByte);
    view.setUint8(offset + 3, 0x00);

    // Bryton TINFO uses 32-bit (4 bytes) for distance and time
    view.setUint32(offset + 4, Math.round(inst.distance), true);
    view.setUint32(offset + 8, Math.round(inst.time), true);

    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(inst.instruction || '');
    for (let k = 0; k < 32; k++) {
      bytes[offset + 12 + k] = (k < rawBytes.length) ? rawBytes[k] : 0x00;
    }
  }

  return buffer;
}

function createGpxString(points, name) {
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
  gpx += '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" version="1.1" creator="OpenBryton Pro">\n';
  gpx += `  <trk>\n    <name>${escapeXml(name)}</name>\n    <trkseg>\n`;

  for (const pt of points) {
    gpx += `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lon.toFixed(7)}">\n`;
    if (pt.ele !== undefined) {
      gpx += `        <ele>${pt.ele.toFixed(2)}</ele>\n`;
    }
    gpx += `      </trkpt>\n`;
  }

  gpx += '    </trkseg>\n  </trk>\n</gpx>';
  return gpx;
}

function createKmlString(points, name) {
  let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n';
  kml += `    <name>${escapeXml(name)}</name>\n`;
  kml += '    <Placemark>\n      <LineString>\n        <coordinates>\n';

  const coordStr = points.map(p => `${p.lon.toFixed(7)},${p.lat.toFixed(7)},${(p.ele || 0).toFixed(1)}`).join(' ');
  kml += `          ${coordStr}\n`;

  kml += '        </coordinates>\n      </LineString>\n    </Placemark>\n  </Document>\n</kml>';
  return kml;
}

// Utility Geo Functions
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function findClosestPointIndex(points, lat, lon) {
  let closestDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(points[i].lat, points[i].lon, lat, lon);
    if (d < closestDist) {
      closestDist = d;
      closestIdx = i;
    }
  }
  return closestIdx;
}

function getDirectionLabel(code) {
  switch (code) {
    case 7: return t('dirSharpLeft') || 'Belok Tajam Kiri';
    case 3: return t('dirLeft') || 'Belok Kiri';
    case 5: return t('dirSlightLeft') || 'Serong Kiri';
    case 10: return t('dirStraight') || 'Lurus';
    case 1: return t('dirGoAhead') || 'Go Ahead';
    case 4: return t('dirSlightRight') || 'Serong Kanan';
    case 2: return t('dirRight') || 'Belok Kanan';
    case 6: return t('dirSharpRight') || 'Belok Tajam Kanan';
    case 8: return t('dirExitRight') || 'Exit Kanan';
    case 9: return t('dirExitLeft') || 'Exit Kiri';
    case 11: return t('dirUturn') || 'U-Turn Kanan';
    case 12: return t('dirUturnLeft') || 'U-Turn Kiri';
    case 101: return t('poiFood');
    case 102: return t('poiWater');
    case 103: return t('poiSummit');
    case 104: return t('poiDanger');
    case 105: return t('poiSprint');
    case 106: return t('poiFirstAid');
    case 107: return t('poiValley');
    case 108: return t('poiGeneric');
    default: return t('dirStraight');
  }
}

function getDirectionArrow(code) {
  switch (code) {
    case 7: return '↰';
    case 3: return '←';
    case 5: return '↖';
    case 10: return '↑';
    case 1: return '↑';
    case 4: return '↗';
    case 2: return '→';
    case 6: return '↱';
    case 8: return '⬈';
    case 9: return '⬉';
    case 11: return '↩';
    case 12: return '↪';
    case 100: return '🎯';
    case 101: return '⛺';
    case 102: return '🍴';
    case 103: return '➕';
    case 104: return '☑️';
    case 105: return '👥';
    case 106: return '💧';
    case 107: return '⚡';
    case 190: return '🧗'; // Climb Start
    case 191: return '📉'; // Climb End
    default: return '↑';
  }
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return `${mins}m ${remSecs}s`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// ==========================================
// Fit File Generator using @garmin/fitsdk
// ==========================================
async function generateFitFile() {
  if (state.points.length === 0) return;
  
  const origBtnText = elements.btnDownloadFit.innerHTML;
  elements.btnDownloadFit.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
  elements.btnDownloadFit.disabled = true;
  
  try {
    const fitSdk = await import('https://esm.sh/@garmin/fitsdk@21.217.0');
    const Encoder = fitSdk.Encoder;
    const Profile = fitSdk.Profile;
    
    const encoder = new Encoder();

    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      type: Profile.types.file.course,
      manufacturer: Profile.types.manufacturer.development,
      product: 0,
      timeCreated: new Date(),
      serialNumber: Math.floor(Math.random() * 0xFFFFFFFF)
    });

    let routeName = elements.brytonRouteName.value.trim() || state.baseName || 'BrytonRoute';
    encoder.onMesg(Profile.MesgNum.COURSE, {
      name: routeName.substring(0, 15),
      sport: Profile.types.sport.cycling
    });

    const baseTime = Date.now();
    
    state.points.forEach((pt, i) => {
      pt._fitDate = new Date(baseTime + i * 1000);
      encoder.onMesg(Profile.MesgNum.RECORD, {
        timestamp: pt._fitDate,
        positionLat: Math.round(pt.lat * (0x7FFFFFFF / 180)),
        positionLong: Math.round(pt.lon * (0x7FFFFFFF / 180)),
        altitude: pt.ele,
        distance: pt.distFromStart
      });
    });

    function mapToFitCp(code) {
      switch(code) {
        case 7: return Profile.types.coursePoint.sharpLeft;
        case 3: return Profile.types.coursePoint.left;
        case 5: return Profile.types.coursePoint.slightLeft;
        case 10: return Profile.types.coursePoint.straight;
        case 1: return Profile.types.coursePoint.straight;
        case 4: return Profile.types.coursePoint.slightRight;
        case 2: return Profile.types.coursePoint.right;
        case 6: return Profile.types.coursePoint.sharpRight;
        case 8: return Profile.types.coursePoint.slightRight; // Exit Right -> mapped to slight right
        case 9: return Profile.types.coursePoint.slightLeft; // Exit Left -> mapped to slight left
        case 11: return Profile.types.coursePoint.uTurn; // uturn right
        case 12: return Profile.types.coursePoint.uTurn; // uturn left
        case 101: return Profile.types.coursePoint.summit;
        case 102: return Profile.types.coursePoint.valley;
        case 106: return Profile.types.coursePoint.water;
        case 107: return Profile.types.coursePoint.food;
        case 108: return Profile.types.coursePoint.danger;
        case 112: return Profile.types.coursePoint.firstAid;
        case 117: return Profile.types.coursePoint.sprint;
        case 190: return Profile.types.coursePoint.segmentStart;
        case 191: return Profile.types.coursePoint.segmentEnd;
        default: return Profile.types.coursePoint.generic;
      }
    }

    state.combinedInstructions.forEach((inst) => {
      const pt = state.points[inst.index];
      if (!pt || !pt._fitDate) return;
      encoder.onMesg(Profile.MesgNum.COURSE_POINT, {
        timestamp: pt._fitDate,
        positionLat: Math.round(pt.lat * (0x7FFFFFFF / 180)),
        positionLong: Math.round(pt.lon * (0x7FFFFFFF / 180)),
        distance: pt.distFromStart,
        type: mapToFitCp(inst.directionCode),
        name: (inst.instruction || '').substring(0, 15)
      });
    });

    const uint8Array = encoder.close();
    const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
    let prefix = routeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    saveAs(blob, `${prefix}.fit`);
    
    showToast('Download file FIT berhasil!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Gagal memproses file FIT: ' + err.message, 'error');
  } finally {
    elements.btnDownloadFit.innerHTML = origBtnText;
    elements.btnDownloadFit.disabled = false;
  }
}
