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
  climbTurns: [],
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

window.loadRouteFromFirebase = function (data, isOwner = true) {
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
    state.combinedInstructions.forEach(t => { if (!t.id) t.id = Math.random().toString(36).substr(2, 9); });
    state.osmTurns = state.combinedInstructions.filter(i => i.source === 'osm');
    state.extraTurns = state.combinedInstructions.filter(i => i.source === 'extra');
    state.manualTurns = state.combinedInstructions.filter(i => i.source === 'manual');
    state.climbTurns = state.combinedInstructions.filter(i => i.source === 'climb');
  } else {
    state.combinedInstructions = [];
    state.osmTurns = [];
    state.extraTurns = [];
    state.manualTurns = [];
    state.climbTurns = [];
  }

  recalculateRouteDistances();

  state.totalDistance = state.points.length > 0 ? state.points[state.points.length - 1].distFromStart : 0;
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
  updateCreateManualVisibility();

  // Render the elevation chart now that points are loaded
  setTimeout(() => renderElevationChart(), 500);

  // Toggle editing controls based on ownership
  const btnSave = document.getElementById('btnSaveRoute');
  if (btnSave) btnSave.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleEdit) elements.btnToggleEdit.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleAddTurn) elements.btnToggleAddTurn.style.display = isOwner ? 'flex' : 'none';
  if (elements.btnToggleAddPoi) elements.btnToggleAddPoi.style.display = isOwner ? 'flex' : 'none';


  // Enable download buttons since the user wants to download
  elements.btnDownloadBryton.disabled = false;
  elements.btnDownloadKml.disabled = false;
  elements.btnDownloadGpx.disabled = false;
  elements.btnDownloadFit.disabled = false;
  if (elements.btnShareBrytonActive) elements.btnShareBrytonActive.disabled = false;
  if (elements.btnToggleDownload) elements.btnToggleDownload.disabled = false;

  if (typeof showToast === 'function') {
    showToast(isOwner ? 'Rute dimuat ke Editor!' : 'Mode Lihat: Hanya bisa mengunduh', 'success');
  }
};

// DOM Elements
const elements = {
  fileInput: document.getElementById('fileInput'),
  btnUploadGpxToolbar: document.getElementById('btnUploadGpxToolbar'),

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
  settingsCardToggle: document.getElementById('settingsCardToggle'),
  settingsCardContent: document.getElementById('settingsCardContent'),
  settingsCardIcon: document.getElementById('settingsCardIcon'),
  btnProcess: document.getElementById('btnProcess'),
  processSpinner: document.getElementById('processSpinner'),
  btnDownloadBryton: document.getElementById('btnDownloadBryton'),
  btnDownloadKml: document.getElementById('btnDownloadKml'),
  btnDownloadGpx: document.getElementById('btnDownloadGpx'),
  btnDownloadFit: document.getElementById('btnDownloadFit'),
  btnShareBrytonActive: document.getElementById('btnShareBrytonActive'),
  btnToggleDownload: document.getElementById('btnToggleDownload'),
  downloadDropdownContainer: document.getElementById('downloadDropdownContainer'),
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
  btnSimplifyRdp: document.getElementById('btnSimplifyRdp'),
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

  if (elements.btnUploadGpxToolbar) {
    elements.btnUploadGpxToolbar.addEventListener('click', () => {
      if (elements.fileInput) elements.fileInput.click();
    });
  }



  elements.btnProcess.addEventListener('click', runTurnAnalysis);
  elements.btnDownloadBryton.addEventListener('click', generateBrytonZip);
  elements.btnDownloadKml.addEventListener('click', generateKmlFile);
  elements.btnDownloadGpx.addEventListener('click', generateGpxFile);
  elements.btnDownloadFit.addEventListener('click', generateFitFile);
  if (elements.btnShareBrytonActive) elements.btnShareBrytonActive.addEventListener('click', shareToBrytonActive);

  if (elements.btnToggleDownload && elements.downloadDropdownContainer) {
    elements.btnToggleDownload.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.downloadDropdownContainer.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!elements.downloadDropdownContainer.contains(e.target)) {
        elements.downloadDropdownContainer.classList.remove('open');
      }
    });
  }

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



  elements.btnToggleSidebarUI.addEventListener('click', () => {
    elements.sidebarContent.classList.toggle('collapsed-hidden');
    elements.sidebarTitle.classList.toggle('collapsed-hidden');
    elements.mainLayout.classList.toggle('sidebar-collapsed');
    const isHidden = elements.sidebarContent.classList.contains('collapsed-hidden');
    const icon = isHidden ? 'maximize-2' : 'minimize-2';
    const text = isHidden ? (typeof t === 'function' ? t('btnShowPanel') : 'Tampilkan') : (typeof t === 'function' ? t('btnHidePanel') : 'Sembunyikan');
    const dataI18n = isHidden ? 'btnShowPanel' : 'btnHidePanel';
    elements.btnToggleSidebarUI.innerHTML = `<i data-lucide="${icon}"></i> <span data-i18n="${dataI18n}">${text}</span>`;
    lucide.createIcons();
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 350);
  });

  if (elements.settingsCardToggle && elements.settingsCardContent && elements.settingsCardIcon) {
    elements.settingsCardToggle.addEventListener('click', () => {
      const isHidden = elements.settingsCardContent.style.display === 'none';
      elements.settingsCardContent.style.display = isHidden ? 'block' : 'none';
      elements.settingsCardIcon.setAttribute('data-lucide', isHidden ? 'chevron-up' : 'chevron-down');
      lucide.createIcons();
    });
  }

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
  if (elements.btnCloseModal) elements.btnCloseModal.addEventListener('click', closeModal);
  if (elements.btnCancelAddTurn) elements.btnCancelAddTurn.addEventListener('click', closeModal);
  if (elements.btnConfirmAddTurn) elements.btnConfirmAddTurn.addEventListener('click', confirmAddManualTurn);
  const btnConfirmAddPoi = document.getElementById('btnConfirmAddPoi');
  if (btnConfirmAddPoi) btnConfirmAddPoi.addEventListener('click', confirmAddPoi);

  const btnRdp = document.getElementById('btnSimplifyRdp');
  if (btnRdp) {
    btnRdp.addEventListener('click', () => {
      if (state.points.length === 0) {
        showToast(t('toastRdpNoRoute'), "error");
        return;
      }
      if (confirm(t('toastRdpConfirm'))) {
        const oldPointCount = state.points.length;
        simplifyRoute(1.5);
        if (state.points.length < oldPointCount) {
          const removed = oldPointCount - state.points.length;
          showToast(t('toastRdpSuccess').replace('{0}', removed), 'success');
          elements.statPoints.textContent = state.points.length.toLocaleString();
          renderTrackOnMap(false);
        } else {
          showToast(t('toastRdpNoOp'), 'info');
        }
      }
    });
  }
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
}

function processFile(file) {
  if (state.points.length > 0) {
    if (!confirm(t('confirmOverwriteRoute') || 'Rute sudah ada di peta. Mengupload GPX baru akan menghapus rute saat ini. Lanjutkan?')) {
      if (elements.fileInput) elements.fileInput.value = '';
      return;
    }
  }

  if (!file.name.toLowerCase().endsWith('.gpx')) {
    showToast(t('toastFormatGpx'), 'error');
    return;
  }

  resetState();

  state.fileName = file.name;
  state.baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const reader = new FileReader();
  reader.onload = (e) => {
    state.rawGpxText = e.target.result;

    elements.btnProcess.disabled = false;


    parseGpx();
    showToast(t('toastGpxLoaded'), 'success');
  };
  reader.readAsText(file);
}

function resetState() {
  state.currentRouteId = null;
  state.currentRouteOwner = null;
  state.rawGpxText = '';
  state.fileName = '';
  state.points = [];
  state.rawBackupPoints = [];

  updateCreateManualVisibility();
  state.isSnapped = false;
  state.osmTurns = [];
  state.extraTurns = [];
  state.manualTurns = [];
  state.climbTurns = [];
  state.climbs = [];
  state.combinedInstructions = [];

  clearClimbHighlight();

  if (state.isEditingRoute) toggleRouteEditing();
  if (state.isAddingManualTurn) toggleAddManualTurnMode();
  if (state.isCreatingRoute) toggleCreateManualRoute();

  elements.brytonRouteName.value = '';
  if (elements.fileInput) elements.fileInput.value = '';
  elements.btnProcess.disabled = true;

  elements.btnDownloadBryton.disabled = true;
  elements.btnDownloadKml.disabled = true;
  elements.btnDownloadGpx.disabled = true;
  elements.btnDownloadFit.disabled = true;
  if (elements.btnShareBrytonActive) elements.btnShareBrytonActive.disabled = true;
  if (elements.btnToggleDownload) elements.btnToggleDownload.disabled = true;

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
  const poisBody = document.getElementById('poisTableBody');
  const climbsBody = document.getElementById('climbsTableBody');
  if (poisBody) poisBody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center">${typeof t === 'function' ? t('emptyPois') : 'Belum ada data.'}</td></tr>`;
  if (climbsBody) climbsBody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data.'}</td></tr>`;

  const bTurns = document.getElementById('badge-turns');
  const bPois = document.getElementById('badge-pois');
  const bClimbs = document.getElementById('badge-climbs');
  if (bTurns) bTurns.textContent = "0";
  if (bPois) bPois.textContent = "0";
  if (bClimbs) bClimbs.textContent = "0";

  elements.turnCounterBadge.textContent = getInstructionCountLabel(0);
  elements.elevationCanvas.style.display = 'none';
  const eleTitle = document.getElementById('elevationTitleContainer');
  if (eleTitle) eleTitle.style.display = 'none';
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

  updateCreateManualVisibility();

  renderTrackOnMap();
  renderElevationChart();
}

function renderElevationChart(highlightClimbObj = null) {
  if (state.points.length === 0 || !elements.elevationCanvas) return;
  const canvas = elements.elevationCanvas;
  const ctx = canvas.getContext('2d');

  // Make visible BEFORE measuring so getBoundingClientRect() returns true dimensions
  canvas.style.display = 'block';
  const eleTitle = document.getElementById('elevationTitleContainer');
  if (eleTitle) eleTitle.style.display = 'flex';

  // Set internal resolution based on devicePixelRatio to avoid blur
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const logicalWidth = rect.width || 350;
  const logicalHeight = rect.height || 140;

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
 * Menyederhanakan titik-titik rute (Ramer-Douglas-Peucker)
 * Berguna membuang titik berlebih di garis lurus, namun tetap mempertahankan bentuk.
 */
function simplifyRoute(epsilonMeters = 1.5) {
  if (state.points.length <= 2) return;

  const keepIndices = new Set();
  keepIndices.add(0);
  keepIndices.add(state.points.length - 1);

  const markTurns = (turns) => {
    if (turns) turns.forEach(t => keepIndices.add(t.index));
  };
  markTurns(state.osmTurns);
  markTurns(state.extraTurns);
  markTurns(state.manualTurns);
  markTurns(state.climbTurns);
  if (state.combinedInstructions) {
    state.combinedInstructions.forEach(t => keepIndices.add(t.index));
  }

  const keepArr = Array.from(keepIndices).sort((a, b) => a - b);
  const simplifiedPoints = [];
  const oldToNewMap = new Map();

  for (let i = 0; i < keepArr.length - 1; i++) {
    const startIdx = keepArr[i];
    const endIdx = keepArr[i + 1];
    const slice = state.points.slice(startIdx, endIdx + 1);

    const simplifyRDP = (pts, offset) => {
      if (pts.length <= 2) {
        return pts.map((p, idx) => ({ point: p, origIdx: offset + idx }));
      }

      let dmax = 0;
      let idx = 0;
      const end = pts.length - 1;

      const x1 = pts[0].lon, y1 = pts[0].lat;
      const x2 = pts[end].lon, y2 = pts[end].lat;
      const den = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));

      for (let j = 1; j < end; j++) {
        const x0 = pts[j].lon, y0 = pts[j].lat;
        let d = 0;
        if (den === 0) {
          d = haversineDistance(y1, x1, y0, x0);
        } else {
          const num = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
          d = (num / den) * 111320;
        }

        if (d > dmax) {
          idx = j;
          dmax = d;
        }
      }

      if (dmax > epsilonMeters) {
        const res1 = simplifyRDP(pts.slice(0, idx + 1), offset);
        const res2 = simplifyRDP(pts.slice(idx, end + 1), offset + idx);
        return res1.slice(0, res1.length - 1).concat(res2);
      } else {
        return [
          { point: pts[0], origIdx: offset },
          { point: pts[end], origIdx: offset + end }
        ];
      }
    };

    const rdpRes = simplifyRDP(slice, startIdx);

    for (let k = 0; k < rdpRes.length; k++) {
      if (k === rdpRes.length - 1 && i < keepArr.length - 2) {
        continue;
      }
      simplifiedPoints.push(rdpRes[k].point);
      oldToNewMap.set(rdpRes[k].origIdx, simplifiedPoints.length - 1);
    }
  }

  const updateTurns = (turns) => {
    if (turns) {
      turns.forEach(t => {
        if (oldToNewMap.has(t.index)) {
          t.index = oldToNewMap.get(t.index);
        }
      });
    }
  };
  updateTurns(state.osmTurns);
  updateTurns(state.extraTurns);
  updateTurns(state.manualTurns);
  updateTurns(state.climbTurns);
  if (state.combinedInstructions) {
    updateTurns(state.combinedInstructions);
  }

  state.points = simplifiedPoints;
  recalculateRouteDistances();
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

    // Jadikan SEMUA titik di rute sebagai handle, tanpa batasan!
    state.points.forEach((p, i) => {
      p.isManualHandle = true;
    });

    // Pasang listener pergerakan peta agar handle dirender ulang sesuai area yang terlihat
    state.map.on('moveend', setupRouteEditHandles);

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

    state.map.off('moveend', setupRouteEditHandles);
    clearEditHandles();
    renderTrackOnMap(false);
  }
}

function setupRouteEditHandles() {
  clearEditHandles();
  if (!state.isEditingRoute) return;

  // 1. Dapatkan kotak layar (viewport) saat ini + 10% padding agar transisi mulus
  const bounds = state.map.getBounds().pad(0.1);

  // 2. Kumpulkan titik mana saja yang sedang masuk di dalam layar
  const visibleIndices = [];
  for (let i = 0; i < state.points.length; i++) {
    if (state.points[i].isManualHandle) {
      if (bounds.contains([state.points[i].lat, state.points[i].lon])) {
        visibleIndices.push(i);
      }
    }
  }

  // 3. Batasi jumlah marker di DOM agar browser tidak hang (maksimal 300 di layar)
  const MAX_MARKERS = 300;
  const step = Math.max(1, Math.ceil(visibleIndices.length / MAX_MARKERS));

  for (let j = 0; j < visibleIndices.length; j += step) {
    const pointIndex = visibleIndices[j];
    const pt = state.points[pointIndex];

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
      // Drag murni hanya memindah titik (offroad), tidak menggunakan OSRM sama sekali
      recalculateRouteDistances();
      saveHistoryState();
      renderTrackOnMap(false);
      setupRouteEditHandles();
    });

    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      shiftTurnIndices(pointIndex + 1, -1);
      state.points.splice(pointIndex, 1);
      recalculateRouteDistances();
      saveHistoryState();
      renderTrackOnMap(false);
      setupRouteEditHandles();
    });

    state.mapLayers.editHandles.push(marker);
  }
}

function shiftTurnIndices(startIndex, amount) {
  const shiftArr = (arr) => {
    if (!arr) return;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].index >= startIndex) arr[i].index += amount;
    }
  };
  shiftArr(state.osmTurns);
  shiftArr(state.extraTurns);
  shiftArr(state.manualTurns);
  shiftArr(state.climbTurns);
  // Do not shift combinedInstructions to prevent double-shifting of the same object references
}

/**
 * Inserts a new waypoint vertex when clicking on the track polyline in Edit Mode.
 */
async function insertWaypointAtLatLng(latlng) {
  const insertIdx = findBestInsertIndex(state.points, latlng.lat, latlng.lng);

  shiftTurnIndices(insertIdx, 1);
  const newPt = { lat: latlng.lat, lon: latlng.lng, ele: 0, distFromStart: 0, isManualHandle: true };
  await fetchElevationForSinglePoint(newPt);
  state.points.splice(insertIdx, 0, newPt);

  recalculateRouteDistances();
  saveHistoryState();
  renderTrackOnMap(false);
  setupRouteEditHandles();
  showToast(t('toastPointAddedIndex').replace('{idx}', insertIdx), 'success');
}

function findBestInsertIndex(points, lat, lon) {
  let bestIdx = 1;
  let minDistSq = Infinity;

  // Menggunakan pendekatan jarak titik ke segmen garis (Point-to-Segment Distance)
  // Ini sangat presisi dan mencegah titik tersambung ke segmen yang salah (yang menyebabkan rute zig-zag)
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const x = lon;
    const y = lat;
    const x1 = p1.lon;
    const y1 = p1.lat;
    const x2 = p2.lon;
    const y2 = p2.lat;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;

    if (len_sq !== 0) {
      param = dot / len_sq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistSq) {
      minDistSq = distSq;
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

  const osmClone = state.osmTurns.map(t => ({ ...t }));
  const extraClone = state.extraTurns.map(t => ({ ...t }));
  const manualClone = state.manualTurns.map(t => ({ ...t }));
  const climbClone = state.climbTurns.map(t => ({ ...t }));
  const combinedClone = state.combinedInstructions.map(t => ({ ...t }));

  state.history.push({
    points: clone,
    pins: pinsClone,
    osmTurns: osmClone,
    extraTurns: extraClone,
    manualTurns: manualClone,
    climbTurns: climbClone,
    combinedInstructions: combinedClone
  });
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
  if (historyItem.osmTurns) state.osmTurns = historyItem.osmTurns.map(t => ({ ...t }));
  if (historyItem.extraTurns) state.extraTurns = historyItem.extraTurns.map(t => ({ ...t }));
  if (historyItem.manualTurns) state.manualTurns = historyItem.manualTurns.map(t => ({ ...t }));
  if (historyItem.climbTurns) state.climbTurns = historyItem.climbTurns.map(t => ({ ...t }));
  if (historyItem.combinedInstructions) state.combinedInstructions = historyItem.combinedInstructions.map(t => ({ ...t }));

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
  updateStatsAndUI();
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

  // Sync turn positions and distances!
  const syncTurns = (arr) => {
    if (!arr) return;
    arr.forEach(t => {
      if (t.index >= 0 && t.index < state.points.length) {
        const pt = state.points[t.index];
        t.distFromStart = pt.distFromStart;
        t.lat = pt.lat;
        t.lon = pt.lon;
      }
    });
  };

  syncTurns(state.osmTurns);
  syncTurns(state.extraTurns);
  syncTurns(state.manualTurns);
  syncTurns(state.climbTurns);

  if (state.combinedInstructions && state.combinedInstructions.length > 0) {
    state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);
  }

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
    if (state.isAddingManualTurn) {
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

function updateCreateManualVisibility() {
  if (state.isCreatingRoute) {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.remove('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.add('hidden');
  } else if (state.points.length > 0) {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.add('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.add('hidden');
  } else {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.remove('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.remove('hidden');
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
      elements.btnProcess.disabled = false;
      elements.btnManualSnap.disabled = false;
    }
  }
  updateCreateManualVisibility();
}

function openAddManualTurnModal(latlng) {
  state.pendingManualCoord = latlng;
  if (state.manualAddMode === 'turn') {
    document.getElementById('addTurnCoords').textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    document.getElementById('addTurnText').value = '';
    document.getElementById('addTurnDirection').value = '10';
    document.getElementById('modalAddTurn').classList.remove('hidden');
    document.getElementById('modalAddTurn').style.display = 'flex';
  } else {
    document.getElementById('addPoiCoords').textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    document.getElementById('addPoiText').value = '';
    document.getElementById('addPoiDirection').value = '106';
    document.getElementById('modalAddPoi').classList.remove('hidden');
    document.getElementById('modalAddPoi').style.display = 'flex';
  }
}

function closeAllModals() {
  const modals = ['modalAddTurn', 'modalAddPoi', 'modalEditTurn', 'modalEditPoi', 'modalEditClimb'];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });
  state.pendingManualCoord = null;
  state.editingItem = null;
  if (state.isAddingManualTurn) {
    toggleAddManualTurnMode(state.manualAddMode);
  }
}
window.closeAllModals = closeAllModals;

function closeModal() {
  closeAllModals();
}

async function confirmAddManualTurn() {
  if (!state.pendingManualCoord) return;
  const lat = state.pendingManualCoord.lat;
  const lon = state.pendingManualCoord.lng;
  const dirCode = parseInt(document.getElementById('addTurnDirection').value, 10);
  let text = document.getElementById('addTurnText').value.trim() || getDirectionLabel(dirCode);
  await _addManualItem(lat, lon, dirCode, text);
}

async function confirmAddPoi() {
  if (!state.pendingManualCoord) return;
  const lat = state.pendingManualCoord.lat;
  const lon = state.pendingManualCoord.lng;
  const dirCode = parseInt(document.getElementById('addPoiDirection').value, 10);
  let text = document.getElementById('addPoiText').value.trim();
  if (!text) {
    let poiCount = state.manualTurns.filter(t => t.directionCode >= 100).length;
    text = `POI ${poiCount + 1}`;
  }
  await _addManualItem(lat, lon, dirCode, text);
}
window.confirmAddPoi = confirmAddPoi;

async function _addManualItem(lat, lon, dirCode, text) {
  const targetIdx = await ensurePointForManualItem(lat, lon);
  const pt = state.points[targetIdx];

  state.manualTurns.push({
    id: Math.random().toString(36).substr(2, 9),
    source: 'manual',
    index: targetIdx,
    lat: pt.lat,
    lon: pt.lon,
    directionCode: dirCode,
    instruction: text,
    distFromStart: pt.distFromStart
  });

  closeAllModals();
  showToast(t('toastTurnAdded').replace('{text}', text), 'success');

  // Re-finalize instructions & re-render
  state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);
  renderTrackOnMap(false);
  updateStatsAndUI();
}

async function ensurePointForManualItem(lat, lon) {
  if (state.points.length === 0) return 0;

  const closestIdx = findClosestPointIndex(state.points, lat, lon);
  const closestPt = state.points[closestIdx];
  const snapThresholdMeters = 5;
  const distToClosest = haversineDistance(closestPt.lat, closestPt.lon, lat, lon);

  if (state.points.length < 2 || distToClosest <= snapThresholdMeters) {
    return closestIdx;
  }

  const insertIdx = findBestInsertIndex(state.points, lat, lon);
  shiftTurnIndices(insertIdx, 1);

  const newPt = { lat, lon, ele: closestPt.ele ?? 0, distFromStart: 0 };
  await fetchElevationForSinglePoint(newPt);
  state.points.splice(insertIdx, 0, newPt);
  recalculateRouteDistances();

  return insertIdx;
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

    // ------------------------------------------------
    // SMART CLIMB DENSIFICATION & CLEANUP LOGIC
    // ------------------------------------------------
    // 1. Densify route so that max distance between points is 50 m
    const densePoints = densifyRoute(state.points, 50);

    // 2. Detect climbs on the dense route
    const denseClimbs = detectClimbs(densePoints);

    // 3. Build a final points array that keeps original points
    //    and also retains every point that lies inside a climb segment.
    const finalPoints = [];
    const indexMap = new Map(); // original index → new index after cleanup
    let originalIdx = 0;
    densePoints.forEach((p, denseIdx) => {
      const inClimb = denseClimbs.some(c => denseIdx >= c.startIndex && denseIdx <= c.endIndex);
      if (p.isOriginal || inClimb) {
        finalPoints.push(p);
        if (p.isOriginal) {
          indexMap.set(originalIdx, finalPoints.length - 1);
          originalIdx++;
        }
      }
    });

    // 4. Replace the global points with the cleaned‑up version
    state.points = finalPoints;

    // 5. Adjust indexes of pre‑existing turn objects (OSM, extra, manual)
    state.osmTurns.forEach(t => t.index = indexMap.get(t.index));
    state.extraTurns.forEach(t => t.index = indexMap.get(t.index));
    if (state.manualTurns) {
      state.manualTurns.forEach(t => t.index = indexMap.get(t.index));
    }

    // 6. Build climbTurns from denseClimbs using the new indexes
    state.climbs = [];
    state.climbTurns = [];
    denseClimbs.forEach((c, idx) => {
      const startPt = densePoints[c.startIndex];
      const endPt = densePoints[c.endIndex];
      const newStartIdx = finalPoints.indexOf(startPt);
      const newEndIdx = finalPoints.indexOf(endPt);
      state.climbs.push({ ...c, startIndex: newStartIdx, endIndex: newEndIdx });

      state.climbTurns.push({
        id: Math.random().toString(36).substr(2, 9),
        source: 'climb',
        index: newStartIdx,
        lat: startPt.lat,
        lon: startPt.lon,
        directionCode: 190,
        instruction: `Climb ${idx + 1} Start`,
        distFromStart: startPt.distFromStart
      });
      state.climbTurns.push({
        id: Math.random().toString(36).substr(2, 9),
        source: 'climb',
        index: newEndIdx,
        lat: endPt.lat,
        lon: endPt.lon,
        directionCode: 191,
        instruction: `Climb ${idx + 1} End`,
        distFromStart: endPt.distFromStart
      });
    });


    let combined = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);

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
    if (elements.btnShareBrytonActive) elements.btnShareBrytonActive.disabled = false;
    if (elements.btnToggleDownload) elements.btnToggleDownload.disabled = false;
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

  // Query OSM Nominatim/Overpass for turns
  const selected = candidateIndices;

  for (const c of selected) {
    // Tambahkan delay 1 detik agar tidak diblokir server Nominatim
    await new Promise(r => setTimeout(r, 1000));

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

// ------------------------------------------------
// Helper: Densify route (max distance per segment)
function densifyRoute(originalPoints, maxDistanceMeters) {
  const densePoints = [];

  for (let i = 0; i < originalPoints.length - 1; i++) {
    const ptA = originalPoints[i];
    const ptB = originalPoints[i + 1];

    // Preserve original point and mark it
    densePoints.push({ ...ptA, isOriginal: true });

    const segmentDist = ptB.distFromStart - ptA.distFromStart;
    if (segmentDist > maxDistanceMeters) {
      const segments = Math.ceil(segmentDist / maxDistanceMeters);
      const latStep = (ptB.lat - ptA.lat) / segments;
      const lonStep = (ptB.lon - ptA.lon) / segments;
      const eleStep = (ptB.ele - ptA.ele) / segments;
      const distStep = segmentDist / segments;

      for (let s = 1; s < segments; s++) {
        densePoints.push({
          lat: ptA.lat + latStep * s,
          lon: ptA.lon + lonStep * s,
          ele: ptA.ele + eleStep * s,
          distFromStart: ptA.distFromStart + distStep * s,
          isOriginal: false // synthetic point
        });
      }
    }
  }

  // Add the final original point
  densePoints.push({ ...originalPoints[originalPoints.length - 1], isOriginal: true });
  return densePoints;
}

// ------------------------------------------------

async function enrichStreetNamesFromOsm(instructions) {
  const enriched = [...instructions];
  const toEnrich = enriched.filter(inst => !inst.instruction.includes('Jl.') && !inst.instruction.includes('Jalan'));

  for (const inst of toEnrich) {
    // Tambahkan delay 1 detik agar tidak diblokir server Nominatim
    await new Promise(r => setTimeout(r, 1000));

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

  // Enrich Climbs
  for (let i = 0; i < state.climbs.length; i++) {
    const climb = state.climbs[i];
    if (!climb.name) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const pt = state.points[climb.startIndex];
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pt.lat.toFixed(6)}&lon=${pt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          let roadName = '';
          if (data && data.address) roadName = data.address.road || data.address.pedestrian || data.address.cycleway || '';

          if (roadName) {
            const climbPrefix = typeof t === 'function' ? t('climbPrefix') : 'Tanjakan';
            climb.name = `${climbPrefix} ${roadName}`;
          }
        }
      } catch (e) { }
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

function finalizeInstructions(points, osmTurns, extraTurns, manualTurns = [], climbTurns = []) {
  const all = [...osmTurns, ...extraTurns, ...manualTurns, ...climbTurns];

  all.sort((a, b) => a.index - b.index);

  const deduplicated = [];
  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    if (!cur.id) cur.id = Math.random().toString(36).substr(2, 9);

    // Sync coordinates and distance with actual point to prevent stale data when points are inserted/deleted
    if (cur.index >= 0 && cur.index < points.length) {
      cur.lat = points[cur.index].lat;
      cur.lon = points[cur.index].lon;
      cur.distFromStart = points[cur.index].distFromStart;
    }

    if (deduplicated.length === 0) {
      deduplicated.push(cur);
    } else {
      const prev = deduplicated[deduplicated.length - 1];
      const dist = cur.distFromStart - prev.distFromStart;
      if (dist >= 12 || cur.source !== 'osm' || cur.instruction !== prev.instruction) {
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

  const removed = state.combinedInstructions.splice(index, 1)[0];

  const filterFn = t => t.id !== removed.id;
  if (removed.source === 'osm') {
    state.osmTurns = state.osmTurns.filter(filterFn);
  } else if (removed.source === 'extra') {
    state.extraTurns = state.extraTurns.filter(filterFn);
  } else if (removed.source === 'manual') {
    state.manualTurns = state.manualTurns.filter(filterFn);
  } else if (removed.source === 'climb') {
    state.climbTurns = state.climbTurns.filter(filterFn);
  }

  showToast(t('toastTurnDeleted').replace('{text}', removed.instruction), 'info');

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
  let targetRow = document.getElementById(`turn-row-${rowIndex}`);
  const turn = state.combinedInstructions[rowIndex];
  if (turn && (turn.directionCode === 190 || turn.directionCode === 191)) {
    const climbIdx = state.climbs.findIndex(c => c.startIndex === turn.index || c.endIndex === turn.index);
    if (climbIdx !== -1) {
      targetRow = document.getElementById(`climb-row-${climbIdx}`);
    }
  }

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
      const btnEdit = `<button type="button" class="btn-edit-item" data-type="turn" data-index="${idx}" style="margin-right: 5px;"><i data-lucide="edit-2"></i></button>`;
      tr.innerHTML = `
        <td>${pIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center"><div style="display:flex; justify-content:center; align-items:center; gap:4px;">${btnEdit}${btnDel}</div></td>
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
      const btnEdit = `<button type="button" class="btn-edit-item" data-type="turn" data-index="${idx}" style="margin-right: 5px;"><i data-lucide="edit-2"></i></button>`;
      tr.innerHTML = `
        <td>${tIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td><span class="turn-badge ${badgeClass}">${badgeText}</span></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td>${formatTime(inst.time || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center"><div style="display:flex; justify-content:center; align-items:center; gap:4px;">${btnEdit}${btnDel}</div></td>
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
      tr.id = `climb-row-${idx}`;
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        document.querySelectorAll('.active-row').forEach(row => row.classList.remove('active-row'));
        tr.classList.add('active-row');
        highlightClimb(climb);
      });

      const climbName = climb.name || `${climbPrefix} ${idx + 1}`;
      const btnEdit = `<button type="button" class="btn-edit-item" data-type="climb" data-index="${idx}"><i data-lucide="edit-2"></i></button>`;
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><div class="turn-icon-cell">🧗</div></td>
        <td><strong>${climbName}</strong></td>
        <td>${climb.avgGrad.toFixed(1)}%</td>
        <td>${Math.round(climb.dist)}</td>
        <td class="coord-cell">${state.points[climb.startIndex].lat.toFixed(5)}, ${state.points[climb.startIndex].lon.toFixed(5)}</td>
        <td class="text-center"><div style="display:flex; justify-content:center; align-items:center; gap:4px;">${btnEdit}</div></td>
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

  document.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.getAttribute('data-type');
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (type === 'climb') {
        state.editingItem = { type, idx };
        const climb = state.climbs[idx];
        const currentName = climb.name || 'Tanjakan ' + (idx + 1);
        document.getElementById('editClimbTextOnly').value = currentName;
        document.getElementById('modalEditClimb').classList.remove('hidden');
        document.getElementById('modalEditClimb').style.display = 'flex';
      } else if (type === 'turn') {
        state.editingItem = { type, idx };
        const inst = state.combinedInstructions[idx];
        if (inst.directionCode >= 100) {
          document.getElementById('editPoiDirectionOnly').value = inst.directionCode;
          document.getElementById('editPoiTextOnly').value = getTranslatedInstruction(inst.instruction, inst.directionCode);
          document.getElementById('modalEditPoi').classList.remove('hidden');
          document.getElementById('modalEditPoi').style.display = 'flex';
        } else {
          document.getElementById('editTurnDirectionOnly').value = inst.directionCode;
          document.getElementById('editTurnTextOnly').value = getTranslatedInstruction(inst.instruction, inst.directionCode);
          document.getElementById('modalEditTurn').classList.remove('hidden');
          document.getElementById('modalEditTurn').style.display = 'flex';
        }
      }
    });
  });

  initIcons();
}

function confirmEditTurn() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'turn') {
    const inst = state.combinedInstructions[idx];
    const newDirCode = parseInt(document.getElementById('editTurnDirectionOnly').value, 10);
    const newText = document.getElementById('editTurnTextOnly').value.trim();
    _applyTurnEdit(inst, newDirCode, newText);
  }
  closeAllModals();
}
window.confirmEditTurn = confirmEditTurn;

function confirmEditPoi() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'turn') {
    const inst = state.combinedInstructions[idx];
    const newDirCode = parseInt(document.getElementById('editPoiDirectionOnly').value, 10);
    const newText = document.getElementById('editPoiTextOnly').value.trim();
    _applyTurnEdit(inst, newDirCode, newText);
  }
  closeAllModals();
}
window.confirmEditPoi = confirmEditPoi;

function confirmEditClimb() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'climb') {
    const climb = state.climbs[idx];
    const newText = document.getElementById('editClimbTextOnly').value.trim();
    if (newText) {
      climb.name = newText;
      renderTurnsTable(state.combinedInstructions);
    }
  }
  closeAllModals();
}
window.confirmEditClimb = confirmEditClimb;

function _applyTurnEdit(inst, newDirCode, newText) {
  inst.directionCode = newDirCode;
  inst.instruction = newText;
  if (inst.source === 'osm') {
    const match = state.osmTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  } else if (inst.source === 'extra') {
    const match = state.extraTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  } else if (inst.source === 'manual') {
    const match = state.manualTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  }
  renderTurnsTable(state.combinedInstructions);
  renderTurnMarkersOnMap(state.combinedInstructions);
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
class BrytonFitBuilder {
  constructor() {
    this.records = [];
    this.localMesgNum = 0;
  }

  addMessage(globalMesgNum, fields, values) {
    this.localMesgNum = (this.localMesgNum + 1) % 16;
    const defBuf = new Uint8Array(6 + fields.length * 3);
    const defView = new DataView(defBuf.buffer);
    defBuf[0] = 0x40 | this.localMesgNum;
    defBuf[1] = 0;
    defBuf[2] = 0;
    defView.setUint16(3, globalMesgNum, true);
    defBuf[5] = fields.length;

    let offset = 6;
    for (const f of fields) {
      defBuf[offset++] = f.defNum;
      defBuf[offset++] = f.size;
      defBuf[offset++] = f.typeId;
    }

    let dataSize = 0;
    for (const f of fields) dataSize += f.size;

    const dataBuf = new Uint8Array(1 + dataSize);
    const dataView = new DataView(dataBuf.buffer);
    dataBuf[0] = this.localMesgNum;

    offset = 1;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const val = values[i] || 0;
      switch (f.typeId) {
        case 0x00: // enum
        case 0x01: // sint8
        case 0x02: // uint8
          dataView.setInt8(offset, val);
          break;
        case 0x83: // sint16
        case 0x84: // uint16
          dataView.setInt16(offset, val, true);
          break;
        case 0x85: // sint32
        case 0x86: // uint32
          dataView.setInt32(offset, val, true);
          break;
        case 0x07: // string
          const str = typeof values[i] === 'string' ? values[i] : '';
          for (let j = 0; j < f.size; j++) {
            dataBuf[offset + j] = j < str.length ? str.charCodeAt(j) : 0;
          }
          break;
      }
      offset += f.size;
    }

    this.records.push(defBuf);
    this.records.push(dataBuf);
  }

  build() {
    let dataLength = 0;
    for (const r of this.records) dataLength += r.length;

    const fileBuf = new Uint8Array(14 + dataLength + 2);
    const view = new DataView(fileBuf.buffer);

    fileBuf[0] = 14;
    fileBuf[1] = 0x10;
    view.setUint16(2, 21217, true);
    view.setUint32(4, dataLength, true);
    fileBuf[8] = 0x2E; fileBuf[9] = 0x46; fileBuf[10] = 0x49; fileBuf[11] = 0x54;
    view.setUint16(12, 0, true);

    let offset = 14;
    for (const r of this.records) {
      fileBuf.set(r, offset);
      offset += r.length;
    }

    let crc = 0;
    const crcTable = [
      0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
      0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400
    ];
    for (let i = 0; i < offset; i++) {
      let tmp = crcTable[crc & 0xF];
      crc = (crc >> 4) & 0x0FFF;
      crc = crc ^ tmp ^ crcTable[fileBuf[i] & 0xF];
      tmp = crcTable[crc & 0xF];
      crc = (crc >> 4) & 0x0FFF;
      crc = crc ^ tmp ^ crcTable[(fileBuf[i] >> 4) & 0xF];
    }
    view.setUint16(offset, crc, true);

    return fileBuf;
  }
}

function buildFitBlob() {
  const builder = new BrytonFitBuilder();

  // 1. Header 248
  builder.addMessage(248, [
    { defNum: 1, size: 2, typeId: 0x84 },
    { defNum: 2, size: 2, typeId: 0x84 }
  ], [0, 1]);

  let maxLat = -90, minLat = 90, maxLon = -180, minLon = 180;
  let maxEle = -9999, minEle = 9999;
  state.points.forEach(pt => {
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lon > maxLon) maxLon = pt.lon;
    if (pt.lon < minLon) minLon = pt.lon;
    if (pt.ele > maxEle) maxEle = pt.ele;
    if (pt.ele < minEle) minEle = pt.ele;
  });

  const totalDistMeters = Math.round(state.points[state.points.length - 1].distFromStart);

  // Elevation encoding: FIT standard = (ele + 500) * 5
  // Bryton device perfectly follows this standard for .fit files (unlike native .track which uses meters/cm)
  const encodeEle = (ele) => Math.max(0, Math.round((ele + 500) * 5));

  // 2. Summary 254
  builder.addMessage(254, [
    { defNum: 1, size: 2, typeId: 0x84 },
    { defNum: 2, size: 4, typeId: 0x85 },
    { defNum: 3, size: 4, typeId: 0x85 },
    { defNum: 4, size: 4, typeId: 0x85 },
    { defNum: 5, size: 4, typeId: 0x85 },
    { defNum: 6, size: 4, typeId: 0x86 },
    { defNum: 7, size: 2, typeId: 0x84 },
    { defNum: 8, size: 2, typeId: 0x84 },
    { defNum: 9, size: 2, typeId: 0x84 },
    { defNum: 10, size: 2, typeId: 0x84 }
  ], [
    state.points.length,
    Math.round(maxLat * 1000000),
    Math.round(minLat * 1000000),
    Math.round(maxLon * 1000000),
    Math.round(minLon * 1000000),
    totalDistMeters,
    encodeEle(maxEle),
    encodeEle(minEle),
    2, 6
  ]);

  // 3. Track indices 251
  const idxFields = [{ defNum: 1, size: 2, typeId: 0x84 }];
  for (let i = 0; i < state.points.length; i++) {
    builder.addMessage(251, idxFields, [i]);
  }

  // 4. Course point count 253
  const validCPs = state.combinedInstructions.filter(inst => inst.index < state.points.length);
  builder.addMessage(253, [{ defNum: 1, size: 2, typeId: 0x84 }], [validCPs.length]);

  // 5. Course points 250
  // Encoding from Bryton native .tinfo:
  // For both POI and Turn: unknown_3 = distance to next instruction (in meters)
  // unknown_4 = estimated time to next instruction
  const cpFields = [
    { defNum: 1, size: 2, typeId: 0x84 },
    { defNum: 2, size: 1, typeId: 0x00 },
    { defNum: 3, size: 4, typeId: 0x86 },
    { defNum: 4, size: 4, typeId: 0x86 },
    { defNum: 5, size: 32, typeId: 0x07 }
  ];
  validCPs.forEach((inst) => {
    // Use pre-calculated distance and time to next instruction (matches .tinfo behavior)
    const unknown_3 = Math.round(inst.distance || 0);
    const unknown_4 = Math.round(inst.time || 0);

    builder.addMessage(250, cpFields, [
      inst.index,
      inst.directionCode,
      unknown_3,
      unknown_4,
      (inst.instruction || '').substring(0, 31)
    ]);
  });

  // 6. Track count 2 252
  builder.addMessage(252, [{ defNum: 1, size: 2, typeId: 0x84 }], [state.points.length]);

  // Elevation is stored using FIT standard (ele + 500) * 5
  const ptFields = [
    { defNum: 1, size: 4, typeId: 0x85 },
    { defNum: 2, size: 4, typeId: 0x85 },
    { defNum: 3, size: 2, typeId: 0x84 }
  ];
  state.points.forEach(pt => {
    builder.addMessage(249, ptFields, [
      Math.round(pt.lat * 1000000),
      Math.round(pt.lon * 1000000),
      encodeEle(pt.ele)
    ]);
  });

  const uint8Array = builder.build();
  return new Blob([uint8Array], { type: 'application/octet-stream' });
}

async function generateFitFile() {
  if (state.points.length === 0) return;

  const origBtnText = elements.btnDownloadFit.innerHTML;
  elements.btnDownloadFit.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
  elements.btnDownloadFit.disabled = true;

  try {
    const blob = buildFitBlob();
    let routeName = elements.brytonRouteName.value.trim() || state.baseName || 'BrytonRoute';
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

async function shareToBrytonActive() {
  if (state.points.length === 0) return;

  const origBtnText = elements.btnShareBrytonActive.innerHTML;
  elements.btnShareBrytonActive.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
  elements.btnShareBrytonActive.disabled = true;

  try {
    const blob = buildFitBlob();
    let routeName = elements.brytonRouteName.value.trim() || state.baseName || 'BrytonRoute';
    let prefix = routeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${prefix}.fit`;
    
    showToast(window.currentLang === 'id' ? 'Mengunggah ke server sementara...' : 'Uploading to temporary server...', 'info', false);

    const formData = new FormData();
    formData.append('file', blob, fileName);

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Failed to upload file.');
    
    const result = await response.json();
    if (result.status !== 'success') throw new Error('API Error');

    // Convert to direct download URL (add /dl/)
    const fileUrl = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    
    const brytonUrl = `https://www.brytonsport.com/applinkpt/#/?type=pt&fit=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(routeName)}`;
    
    window.open(brytonUrl, '_blank');
    showToast(window.currentLang === 'id' ? 'Membuka Bryton Active...' : 'Opening Bryton Active...', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    elements.btnShareBrytonActive.innerHTML = origBtnText;
    elements.btnShareBrytonActive.disabled = false;
  }
}
