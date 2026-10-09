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
  isPickingRtStart: false,
  roundTripStart: null,
  roundTripSeed: 0,
  manualAddMode: 'turn',
  pendingManualCoord: null,
  history: [],
  historyIndex: -1,
  map: null,
  mapLayers: {
    trackLine: null,
    turnMarkers: [],
    editHandles: [],
    creationPins: [],
    hoverMarker: null,
    rtStartMarker: null
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

  state.climbs = [];
  if (state.climbTurns && state.climbTurns.length > 0) {
    const climbStarts = state.climbTurns.filter(t => t.directionCode === 190).sort((a, b) => a.index - b.index);
    const climbEnds = state.climbTurns.filter(t => t.directionCode === 191).sort((a, b) => a.index - b.index);

    for (let i = 0; i < Math.min(climbStarts.length, climbEnds.length); i++) {
      const startIdx = climbStarts[i].index;
      const endIdx = climbEnds[i].index;

      if (startIdx >= 0 && endIdx < state.points.length && startIdx < endIdx) {
        const totalDist = state.points[endIdx].distFromStart - state.points[startIdx].distFromStart;
        const totalEle = state.points[endIdx].ele - state.points[startIdx].ele;
        const avgGrad = totalDist > 0 ? (totalEle / totalDist) * 100 : 0;

        state.climbs.push({
          startIndex: startIdx,
          endIndex: endIdx,
          dist: totalDist,
          eleGain: totalEle,
          avgGrad: avgGrad
        });
      }
    }
  }

  state.totalDistance = state.points.length > 0 ? state.points[state.points.length - 1].distFromStart : 0;
  let totalEleGain = 0;
  for (let i = 1; i < state.points.length; i++) {
    const diff = (state.points[i].ele || 0) - (state.points[i - 1].ele || 0);
    if (diff > 0) totalEleGain += diff;
  }
  state.totalElevationGain = totalEleGain;
  if (elements.statDistance) elements.statDistance.textContent = `${(state.totalDistance / 1000).toFixed(2)} km`;
  if (elements.statElevationGain) elements.statElevationGain.textContent = `${Math.round(totalEleGain)} m`;
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
    showToast(isOwner ? t('toastRouteLoadedEditor') : t('toastViewOnlyMode'), 'success');
  }
};

// DOM Elements
const elements = {
  fileInput: document.getElementById('fileInput'),
  btnUploadGpxToolbar: document.getElementById('btnUploadGpxToolbar'),

  enableOsmTbt: document.getElementById('enableOsmTbt'),
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
  btnToggleFullscreen: document.getElementById('btnToggleFullscreen'),
  sidebarContent: document.getElementById('sidebarContent'),
  sidebarTitle: document.getElementById('sidebarTitle'),
  turnsTableContent: document.getElementById('turnsTableContent'),
  sidebarPanel: document.querySelector('.sidebar-panel'),
  mainLayout: document.querySelector('.main-layout'),
  turnsCard: document.querySelector('.turns-card'),
  mapCard: document.querySelector('.map-card'),
  mapContainer: document.querySelector('.map-container'),
  statDistance: document.getElementById('statDistance'),
  statElevationGain: document.getElementById('statElevationGain'),
  floatStatDist: document.getElementById('floatStatDist'),
  floatStatElev: document.getElementById('floatStatElev'),
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
  btnRoundTrip: document.getElementById('btnRoundTrip'),
  modalRoundTrip: document.getElementById('modalRoundTrip'),
  roundTripStatusBar: document.getElementById('roundTripStatusBar'),
  btnCancelPickRtStart: document.getElementById('btnCancelPickRtStart'),
  rtStartCoordInput: document.getElementById('rtStartCoordInput'),
  btnRtPickOnMap: document.getElementById('btnRtPickOnMap'),
  btnRtMyLoc: document.getElementById('btnRtMyLoc'),
  rtDistanceSlider: document.getElementById('rtDistanceSlider'),
  rtDistanceValue: document.getElementById('rtDistanceValue'),
  rtHeadingSlider: document.getElementById('rtHeadingSlider'),
  rtHeadingValue: document.getElementById('rtHeadingValue'),
  rtCompassDisc: document.getElementById('rtCompassDisc'),
  rtCompassNeedle: document.getElementById('rtCompassNeedle'),
  rtProfileSelect: document.getElementById('rtProfileSelect'),
  btnRtRandomize: document.getElementById('btnRtRandomize'),
  btnSubmitRoundTrip: document.getElementById('btnSubmitRoundTrip'),
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
  const customControl = L.control({ position: 'bottomright' });

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
  initBrytonActivePanel();

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



  if (elements.btnToggleSidebarUI) {
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
  }

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

  function updateFullscreenBtnUI(isFullscreen) {
    if (!elements.btnToggleFullscreen) return;
    const icon = isFullscreen ? 'minimize-2' : 'maximize-2';
    const titleKey = isFullscreen ? 'btnExitFullscreen' : 'btnFullscreen';
    const fallbackTitle = isFullscreen ? 'Keluar Layar Penuh (Normal)' : 'Layar Penuh (Fullscreen)';
    const titleText = typeof t === 'function' ? t(titleKey) : fallbackTitle;

    elements.btnToggleFullscreen.setAttribute('title', titleText);
    elements.btnToggleFullscreen.setAttribute('data-i18n-title', titleKey);
    elements.btnToggleFullscreen.innerHTML = `<i data-lucide="${icon}"></i>`;
    lucide.createIcons();
  }

  function toggleMapFullscreen(forceState) {
    if (!elements.mainLayout || !elements.mapContainer) return;
    const isCurrentlyExpanded = elements.mainLayout.classList.contains('sidebar-collapsed') && elements.mapContainer.classList.contains('map-tall-mode');
    const willBeExpanded = typeof forceState === 'boolean' ? forceState : !isCurrentlyExpanded;

    if (willBeExpanded) {
      elements.mainLayout.classList.add('sidebar-collapsed');
      elements.mapContainer.classList.add('map-tall-mode');
    } else {
      elements.mainLayout.classList.remove('sidebar-collapsed');
      elements.mapContainer.classList.remove('map-tall-mode');
    }

    updateFullscreenBtnUI(willBeExpanded);

    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
      if (typeof drawElevationChart === 'function' && state.points && state.points.length > 0) {
        drawElevationChart();
      }
    }, 200);
  }

  if (elements.btnToggleFullscreen) {
    elements.btnToggleFullscreen.addEventListener('click', () => {
      toggleMapFullscreen();
    });
  }

  // Allow ESC key to exit expanded fullscreen mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.mainLayout && elements.mainLayout.classList.contains('sidebar-collapsed') && elements.mapContainer && elements.mapContainer.classList.contains('map-tall-mode')) {
      toggleMapFullscreen(false);
    }
  });

  // Modal events
  if (elements.btnCloseModal) elements.btnCloseModal.addEventListener('click', closeModal);
  if (elements.btnCancelAddTurn) elements.btnCancelAddTurn.addEventListener('click', closeModal);
  if (elements.btnConfirmAddTurn) elements.btnConfirmAddTurn.addEventListener('click', confirmAddManualTurn);
  const btnConfirmAddPoi = document.getElementById('btnConfirmAddPoi');
  if (btnConfirmAddPoi) btnConfirmAddPoi.addEventListener('click', confirmAddPoi);

  const addTurnDirEl = document.getElementById('addTurnDirection');
  if (addTurnDirEl) {
    addTurnDirEl.addEventListener('change', (e) => {
      document.getElementById('addTurnText').placeholder = getDirectionLabel(parseInt(e.target.value, 10));
    });
  }

  const editTurnDirEl = document.getElementById('editTurnDirectionOnly');
  if (editTurnDirEl) {
    editTurnDirEl.addEventListener('change', (e) => {
      document.getElementById('editTurnTextOnly').placeholder = getDirectionLabel(parseInt(e.target.value, 10));
    });
  }

  bindRoundTripEvents();

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

  // Add Chart Hover Event Listeners
  if (elements.elevationCanvas) {
    const handleChartHover = (clientX) => {
      if (state.points.length === 0) return;

      const rect = elements.elevationCanvas.getBoundingClientRect();
      const padLeft = 6;
      const padRight = 6;
      const padTop = 6;
      const padBottom = 6;
      const drawWidth = rect.width - padLeft - padRight;
      const drawHeight = rect.height - padTop - padBottom;

      let x = clientX - rect.left - padLeft;
      if (x < 0) x = 0;
      if (x > drawWidth) x = drawWidth;

      const fraction = x / drawWidth;
      const targetDist = fraction * state.totalDistance;

      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < state.points.length; i++) {
        const d = Math.abs(state.points[i].distFromStart - targetDist);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }

      const pt = state.points[closestIdx];

      // Calculate grade (slope in %) around this point
      let grade = 0;
      const prevIdx = Math.max(0, closestIdx - 2);
      const nextIdx = Math.min(state.points.length - 1, closestIdx + 2);
      if (prevIdx !== nextIdx) {
        const dDist = state.points[nextIdx].distFromStart - state.points[prevIdx].distFromStart;
        const dEle = state.points[nextIdx].ele - state.points[prevIdx].ele;
        if (dDist > 0) {
          grade = (dEle / dDist) * 100;
        }
      }

      // Min & max elevation for Y positioning on canvas
      let minEle = Infinity;
      let maxEle = -Infinity;
      for (const p of state.points) {
        if (p.ele < minEle) minEle = p.ele;
        if (p.ele > maxEle) maxEle = p.ele;
      }
      if (maxEle - minEle < 10) {
        maxEle += 5;
        minEle -= 5;
      }
      const eleRange = maxEle - minEle;
      const normY = eleRange > 0 ? (pt.ele - minEle) / eleRange : 0.5;

      const ptDistFrac = state.totalDistance > 0 ? (pt.distFromStart / state.totalDistance) : 0;
      const pxX = padLeft + ptDistFrac * drawWidth;
      const pxY = padTop + drawHeight - (normY * drawHeight);

      // Hide hover line if any (user requested dot instead of line)
      const hoverLine = document.getElementById('chartHoverLine');
      if (hoverLine) hoverLine.style.display = 'none';

      // 1. Position and show Hover Dot on Canvas
      const hoverDot = document.getElementById('elevationHoverDot');
      if (hoverDot) {
        hoverDot.style.display = 'block';
        hoverDot.style.left = pxX + 'px';
        hoverDot.style.top = pxY + 'px';
      }

      // 2. Position and update Hover Floating Badge (DIST, ELEV, GRADE)
      const hoverBadge = document.getElementById('elevationHoverBadge');
      if (hoverBadge) {
        hoverBadge.style.display = 'inline-flex';
        // Keep badge within bounds of container
        const badgeLeft = Math.max(70, Math.min(rect.width - 70, pxX));
        hoverBadge.style.left = badgeLeft + 'px';

        const badgeDist = document.getElementById('hoverBadgeDist');
        const badgeElev = document.getElementById('hoverBadgeElev');
        const badgeGrade = document.getElementById('hoverBadgeGrade');

        if (badgeDist) badgeDist.textContent = (pt.distFromStart / 1000).toFixed(1) + ' km';
        if (badgeElev) badgeElev.textContent = Math.round(pt.ele) + ' m';
        if (badgeGrade) {
          const sign = grade > 0 ? '+' : '';
          badgeGrade.textContent = sign + grade.toFixed(1) + '%';
          badgeGrade.style.color = grade > 4 ? '#f87171' : (grade < -2 ? '#34d399' : '#38bdf8');
        }
      }

      // 3. Update Map Marker
      if (!state.mapLayers.hoverMarker) {
        state.mapLayers.hoverMarker = L.circleMarker([pt.lat, pt.lon], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#ea580c',
          fillOpacity: 1,
          pane: 'markerPane'
        }).addTo(state.map);
      } else {
        state.mapLayers.hoverMarker.setLatLng([pt.lat, pt.lon]);
        if (!state.map.hasLayer(state.mapLayers.hoverMarker)) {
          state.mapLayers.hoverMarker.addTo(state.map);
        }
      }
    };

    const handleChartLeave = () => {
      const hoverLine = document.getElementById('chartHoverLine');
      if (hoverLine) hoverLine.style.display = 'none';

      const hoverDot = document.getElementById('elevationHoverDot');
      if (hoverDot) hoverDot.style.display = 'none';

      const hoverBadge = document.getElementById('elevationHoverBadge');
      if (hoverBadge) hoverBadge.style.display = 'none';

      if (state.mapLayers.hoverMarker && state.map) {
        state.map.removeLayer(state.mapLayers.hoverMarker);
      }
    };

    elements.elevationCanvas.addEventListener('mousemove', (e) => handleChartHover(e.clientX));

    elements.elevationCanvas.addEventListener('mouseleave', handleChartLeave);

    elements.elevationCanvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        e.preventDefault(); // Prevent scrolling while interacting with the chart
        handleChartHover(e.touches[0].clientX);
      }
    }, { passive: false });

    elements.elevationCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        handleChartHover(e.touches[0].clientX);
      }
    }, { passive: true });

    elements.elevationCanvas.addEventListener('touchend', handleChartLeave);
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
  if (state.mapLayers.rtStartMarker) {
    state.map.removeLayer(state.mapLayers.rtStartMarker);
    state.mapLayers.rtStartMarker = null;
  }
  stopPickRtStartMode();
  clearTurnMarkers();
  clearEditHandles();
  clearCreationPins();
  elements.mapPlaceholder.classList.remove('hidden');

  elements.statDistance.textContent = '0.00 km';
  if (elements.statElevationGain) elements.statElevationGain.textContent = '0 m';
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
  if (climbsBody) climbsBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data.'}</td></tr>`;

  const bTurns = document.getElementById('badge-turns');
  const bPois = document.getElementById('badge-pois');
  const bClimbs = document.getElementById('badge-climbs');
  if (bTurns) bTurns.textContent = "0";
  if (bPois) bPois.textContent = "0";
  if (bClimbs) bClimbs.textContent = "0";

  elements.turnCounterBadge.textContent = getInstructionCountLabel(0);
  elements.elevationCanvas.style.display = 'none';
  const floatCard = document.getElementById('mapFloatingElevationCard');
  if (floatCard) floatCard.style.display = 'none';
  if (elements.floatStatDist) elements.floatStatDist.textContent = '0.0';
  if (elements.floatStatElev) elements.floatStatElev.textContent = '0';
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

  let totalEleGain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = (points[i].ele || 0) - (points[i - 1].ele || 0);
    if (diff > 0) totalEleGain += diff;
  }
  state.totalElevationGain = totalEleGain;

  elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
  if (elements.statElevationGain) elements.statElevationGain.textContent = `${Math.round(totalEleGain)} m`;
  if (elements.floatStatDist) elements.floatStatDist.textContent = `${(runningDist / 1000).toFixed(1)}`;
  if (elements.floatStatElev) elements.floatStatElev.textContent = `${Math.round(totalEleGain)}`;
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
  const floatCard = document.getElementById('mapFloatingElevationCard');
  if (floatCard) floatCard.style.display = 'flex';
  if (elements.floatStatDist && state.totalDistance) elements.floatStatDist.textContent = `${(state.totalDistance / 1000).toFixed(1)}`;
  if (elements.floatStatElev && typeof state.totalElevationGain === 'number') elements.floatStatElev.textContent = `${Math.round(state.totalElevationGain)}`;
  const eleTitle = document.getElementById('elevationTitleContainer');
  if (eleTitle) eleTitle.style.display = 'block';

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

  // Define padding for minimalist chart (matching screenshot)
  const padLeft = 6;
  const padBottom = 6;
  const padTop = 6;
  const padRight = 6;

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
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
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
    ctx.lineWidth = 2.8;
    ctx.stroke();
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
  if (state.climbs) {
    state.climbs.forEach(c => {
      keepIndices.add(c.startIndex);
      keepIndices.add(c.endIndex);
    });
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

  if (state.climbs) {
    state.climbs.forEach(c => {
      if (oldToNewMap.has(c.startIndex)) c.startIndex = oldToNewMap.get(c.startIndex);
      if (oldToNewMap.has(c.endIndex)) c.endIndex = oldToNewMap.get(c.endIndex);
    });
  }

  state.points = simplifiedPoints;
  recalculateRouteDistances();

  if (state.climbs) {
    state.climbs.forEach(c => {
      const startPt = state.points[c.startIndex];
      const endPt = state.points[c.endIndex];
      if (startPt && endPt) {
        c.dist = endPt.distFromStart - startPt.distFromStart;
        c.eleGain = endPt.ele - startPt.ele;
        c.avgGrad = c.dist > 0 ? (c.eleGain / c.dist) * 100 : 0;
      }
    });
  }

  state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);
  updateStatsAndUI();
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
    state.originalStateBeforeEdit = {
      points: state.points.map(p => ({ ...p })),
      osmTurns: state.osmTurns.map(t => ({ ...t })),
      extraTurns: state.extraTurns.map(t => ({ ...t })),
      manualTurns: state.manualTurns.map(t => ({ ...t })),
      climbTurns: state.climbTurns.map(t => ({ ...t })),
      climbs: state.climbs ? state.climbs.map(c => ({ ...c })) : []
    };

    // Jadikan SEMUA titik di rute sebagai handle, tanpa batasan!
    state.points.forEach((p, i) => {
      p.isManualHandle = true;
    });

    // Pasang listener pergerakan peta agar handle dirender ulang sesuai area yang terlihat
    state.map.on('moveend', setupRouteEditHandles);

    setupRouteEditHandles();
    updateCreateManualVisibility();
    showToast(t('toastEditModeOn'), 'info');
  } else {
    elements.btnToggleEditRoute.classList.remove('active');
    elements.btnEditRouteText.setAttribute('data-i18n', 'btnEditModeOn');
    elements.btnEditRouteText.textContent = t('btnEditModeOn');
    elements.btnSaveRouteEdit.classList.add('hidden');
    if (elements.btnUndoEdit) elements.btnUndoEdit.classList.add('hidden');
    if (elements.btnRedoEdit) elements.btnRedoEdit.classList.add('hidden');
    elements.editStatusBar.classList.add('hidden');

    // Restore state if canceled (not saved)
    if (state.originalStateBeforeEdit) {
      state.points = state.originalStateBeforeEdit.points;
      state.osmTurns = state.originalStateBeforeEdit.osmTurns;
      state.extraTurns = state.originalStateBeforeEdit.extraTurns;
      state.manualTurns = state.originalStateBeforeEdit.manualTurns;
      state.climbTurns = state.originalStateBeforeEdit.climbTurns;
      state.climbs = state.originalStateBeforeEdit.climbs;
      state.originalStateBeforeEdit = null;
      recalculateRouteDistances();
      state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);
      updateStatsAndUI();
    }

    state.map.off('moveend', setupRouteEditHandles);
    clearEditHandles();
    renderTrackOnMap(false);
    updateCreateManualVisibility();
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
        <div class="edit-handle-marker"></div>
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

    const deletePoint = (e) => {
      if (e && e.originalEvent) e.originalEvent.preventDefault();
      // 1. Hapus semua turn / POI / climbTurn yang berada tepat di titik ini
      const removeAtIdx = (arr) => {
        if (!arr) return arr;
        return arr.filter(item => item.index !== pointIndex);
      };
      state.osmTurns = removeAtIdx(state.osmTurns);
      state.extraTurns = removeAtIdx(state.extraTurns);
      state.manualTurns = removeAtIdx(state.manualTurns);
      state.climbTurns = removeAtIdx(state.climbTurns);

      // 2. Geser indeks yang berada di atas pointIndex ke kiri sebanyak 1 (-1)
      shiftTurnIndices(pointIndex + 1, -1);

      // 3. Hapus titik fisik dari points
      state.points.splice(pointIndex, 1);

      // 4. Validasi climbs agar startIndex < endIndex
      if (state.climbs) {
        state.climbs = state.climbs.filter(c => c.startIndex < c.endIndex && c.endIndex < state.points.length);
      }

      recalculateRouteDistances();
      saveHistoryState();
      renderTrackOnMap(false);
      setupRouteEditHandles();
    };

    marker.on('contextmenu', deletePoint);
    marker.on('dblclick', deletePoint);

    state.mapLayers.editHandles.push(marker);
  }
}

function shiftTurnIndices(startIndex, amount) {
  const shiftArr = (arr) => {
    if (!arr) return;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].index >= startIndex) {
        arr[i].index += amount;
        if (arr[i].index < 0) arr[i].index = 0;
      }
    }
  };
  shiftArr(state.osmTurns);
  shiftArr(state.extraTurns);
  shiftArr(state.manualTurns);
  shiftArr(state.climbTurns);

  if (state.climbs) {
    for (let i = state.climbs.length - 1; i >= 0; i--) {
      if (state.climbs[i].startIndex >= startIndex) state.climbs[i].startIndex += amount;
      if (state.climbs[i].endIndex >= startIndex) state.climbs[i].endIndex += amount;
      // Filter out invalid climb intervals
      if (state.climbs[i].startIndex >= state.climbs[i].endIndex) {
        state.climbs.splice(i, 1);
      }
    }
  }
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

/**
 * Route a segment using GraphHopper (elevation=true) with fallback to OSRM + open-meteo.
 * GraphHopper returns [lon, lat, ele] natively — no separate elevation API needed.
 * Fallback to OSRM if GraphHopper fails or returns no results.
 *
 * @param {Array<{lat, lon}>} coords - Array of waypoints (usually [startPt, endPt])
 * @param {string} [vehicle='bike'] - GraphHopper vehicle profile
 * @returns {Promise<Array<{lat, lon, ele, distFromStart}> | null>}
 */
async function routeSegmentOSRM(coords, vehicle = 'bike') {
  // ── 1. Try GraphHopper first (elevation included natively) ──────────────────
  try {
    const apiKey = await getGraphHopperApiKey();
    const pointParams = coords.map(c => `point=${c.lat.toFixed(6)},${c.lon.toFixed(6)}`).join('&');
    const ghUrl =
      `https://graphhopper.com/api/1/route?${pointParams}` +
      `&elevation=true` +
      `&vehicle=${vehicle}` +
      `&calc_points=true` +
      `&points_encoded=false` +
      `&instructions=false` +
      `&key=${apiKey.trim()}`;

    const ghRes = await fetch(ghUrl, { signal: AbortSignal.timeout(8000) });
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      if (ghData.paths && ghData.paths.length > 0) {
        const ghCoords = ghData.paths[0].points.coordinates; // [lon, lat, ele]
        if (ghCoords && ghCoords.length > 1) {
          const routedPoints = ghCoords.map(c => ({
            lat: c[1],
            lon: c[0],
            ele: c.length > 2 ? (c[2] || 0) : 0,
            distFromStart: 0
          }));
          console.log(`GraphHopper snap: ${routedPoints.length} titik dengan elevasi.`);
          return routedPoints;
        }
      }
    } else {
      console.warn(`GraphHopper snap gagal (${ghRes.status}), fallback ke OSRM.`);
    }
  } catch (ghErr) {
    console.warn('GraphHopper snap error, fallback ke OSRM:', ghErr);
  }

  // ── 2. Fallback: OSRM + open-meteo untuk elevasi ────────────────────────────
  console.log('Fallback OSRM untuk snap-to-road...');
  const coordString = coords.map(c => `${c.lon.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/route/v1/cycling/${coordString}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(osrmUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const geom = data.routes[0].geometry;
        if (geom && geom.coordinates) {
          const rawPoints = geom.coordinates.map(c => ({ lat: c[1], lon: c[0], ele: 0, distFromStart: 0 }));

          // Fetch elevasi dari open-meteo dalam chunk kecil dengan delay antar chunk
          const chunkSize = 50;
          for (let i = 0; i < rawPoints.length; i += chunkSize) {
            const chunk = rawPoints.slice(i, i + chunkSize);
            const lats = chunk.map(p => p.lat.toFixed(5)).join(',');
            const lons = chunk.map(p => p.lon.toFixed(5)).join(',');

            if (i > 0) await new Promise(r => setTimeout(r, 150));

            const tryFetchEle = async () => fetch(
              `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
              { signal: AbortSignal.timeout(8000) }
            );

            try {
              let eleRes = await tryFetchEle();
              if (eleRes.status === 429) {
                await new Promise(r => setTimeout(r, 1500));
                eleRes = await tryFetchEle();
              }
              if (eleRes.ok) {
                const eleData = await eleRes.json();
                if (eleData && eleData.elevation) {
                  eleData.elevation.forEach((ele, idx) => {
                    if (ele !== null && !isNaN(ele)) rawPoints[i + idx].ele = ele;
                  });
                }
              } else {
                console.warn(`OSRM fallback elevasi chunk ${i}: HTTP ${eleRes.status}`);
              }
            } catch (err) {
              console.warn(`OSRM fallback elevasi chunk ${i} error:`, err);
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
  const climbsClone = state.climbs ? state.climbs.map(c => ({ ...c })) : [];
  const combinedClone = state.combinedInstructions.map(t => ({ ...t }));

  state.history.push({
    points: clone,
    pins: pinsClone,
    osmTurns: osmClone,
    extraTurns: extraClone,
    manualTurns: manualClone,
    climbTurns: climbClone,
    climbs: climbsClone,
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
  if (historyItem.climbs) state.climbs = historyItem.climbs.map(c => ({ ...c }));
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

  let totalEleGain = 0;
  for (let i = 1; i < state.points.length; i++) {
    const diff = (state.points[i].ele || 0) - (state.points[i - 1].ele || 0);
    if (diff > 0) totalEleGain += diff;
  }
  state.totalElevationGain = totalEleGain;

  elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
  if (elements.statElevationGain) elements.statElevationGain.textContent = `${Math.round(totalEleGain)} m`;
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

  // Sync climb metadata (distance, elevation gain, average gradient)
  if (state.climbs) {
    state.climbs.forEach(c => {
      if (c.startIndex >= 0 && c.endIndex < state.points.length) {
        const startPt = state.points[c.startIndex];
        const endPt = state.points[c.endIndex];
        if (startPt && endPt) {
          c.dist = Math.max(0, endPt.distFromStart - startPt.distFromStart);
          c.eleGain = endPt.ele - startPt.ele;
          c.avgGrad = c.dist > 0 ? (c.eleGain / c.dist) * 100 : 0;
        }
      }
    });
  }

  renderElevationChart();
}

async function saveRouteEditing() {
  state.originalStateBeforeEdit = null;
  recalculateRouteDistances();
  state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);
  updateStatsAndUI();
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
  elements.btnAddPoiManual.querySelector('span').setAttribute('data-i18n', 'btnAddPoiToolbar');
  elements.btnAddPoiManual.querySelector('span').textContent = t('btnAddPoiToolbar');
  elements.addTurnStatusBar.classList.add('hidden');

  if (state.isAddingManualTurn) {
    if (mode === 'turn') {
      elements.btnAddTurnManual.classList.add('active');
      elements.btnAddTurnManual.querySelector('span').setAttribute('data-i18n', 'btnCancelAddTurn');
      elements.btnAddTurnManual.querySelector('span').textContent = t('btnCancelAddTurn');
    } else {
      elements.btnAddPoiManual.classList.add('active');
      elements.btnAddPoiManual.querySelector('span').setAttribute('data-i18n', 'btnCancelAddPoiToolbar');
      elements.btnAddPoiManual.querySelector('span').textContent = t('btnCancelAddPoiToolbar');
    }

    elements.addTurnStatusBar.classList.remove('hidden');
    elements.addTurnStatusBar.querySelector('span').textContent = mode === 'turn' ? t('modeAddTurnActive') : t('modeAddPoiActive');
    showToast(t('toastClickManualTurn'), 'info');
  }
}

async function handleMapClick(e) {
  if (state.isProcessingMapClick) return;
  state.isProcessingMapClick = true;
  try {
    if (state.isPickingRtStart) {
      setRoundTripStartPoint(e.latlng.lat, e.latlng.lng);
      stopPickRtStartMode();
      openRoundTripModal();
      return;
    } else if (state.isAddingManualTurn) {
      await openAddManualTurnModal(e.latlng);
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
    showToast(t('toastNeed2PointsToClose'), "error");
    return;
  }
  state.isProcessing = true;
  elements.btnProcess.disabled = true;

  try {
    const firstPt = state.points[0];
    const lastPt = state.points[state.points.length - 1];

    if (firstPt.lat === lastPt.lat && firstPt.lon === lastPt.lon) {
      showToast(t('toastRouteAlreadyClosed'), "info");
      return;
    }

    const lat = firstPt.lat;
    const lon = firstPt.lon;

    if (elements.chkManualSnap && elements.chkManualSnap.checked) {
      showToast(t('toastClosingRouteSnap'), "info", false);
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
    showToast(t('toastRouteClosedSuccess'), "success");
  } catch (err) {
    console.error(err);
    showToast(t('toastRouteCloseFailed'), "error");
  } finally {
    state.isProcessing = false;
    elements.btnProcess.disabled = false;
  }
}

function updateCreateManualVisibility() {
  if (state.isCreatingRoute || state.isEditingRoute) {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.toggle('hidden', state.isEditingRoute);
    if (elements.btnRoundTrip) elements.btnRoundTrip.classList.add('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.add('hidden');
  } else if (state.points.length > 0) {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.add('hidden');
    if (elements.btnRoundTrip) elements.btnRoundTrip.classList.add('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.add('hidden');
  } else {
    if (elements.btnCreateManualRoute) elements.btnCreateManualRoute.classList.remove('hidden');
    if (elements.btnRoundTrip) elements.btnRoundTrip.classList.remove('hidden');
    if (elements.btnUploadGpxToolbar) elements.btnUploadGpxToolbar.classList.remove('hidden');
  }
}

function toggleCreateManualRoute() {
  if (state.isEditingRoute) toggleRouteEditing();
  if (state.isAddingManualTurn) toggleAddManualTurnMode();

  state.isCreatingRoute = !state.isCreatingRoute;

  if (state.isCreatingRoute) {
    if (state.points.length > 0) {
      if (!confirm(t('confirmManualRouteStart'))) {
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

async function openAddManualTurnModal(latlng) {
  state.pendingManualCoord = latlng;
  if (state.manualAddMode === 'turn') {
    document.getElementById('addTurnCoords').textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    document.getElementById('addTurnText').value = '';
    document.getElementById('addTurnDirection').value = '1';
    document.getElementById('addTurnText').placeholder = getDirectionLabel(1);

    const chk = document.getElementById('chkGraphHopperTbt');
    if (chk && chk.checked && state.points.length > 0) {
      try {
        showToast(t('toastGhFetching'), 'info', false);
        const apiKey = await getGraphHopperApiKey();
        const targetIdx = findClosestPointIndex(state.points, latlng.lat, latlng.lng);
        const locale = typeof currentLang !== 'undefined' && currentLang === 'en' ? 'en' : 'id';
        const ghData = await fetchGraphHopperInstruction(state.points, targetIdx, apiKey, locale);

        if (ghData && ghData.text) {
          document.getElementById('addTurnDirection').value = ghData.directionCode;
          document.getElementById('addTurnText').value = ghData.text;
          await confirmAddManualTurn();
          return;
        } else {
          showToast(t('toastGhNoTurn'), 'warning');
        }
      } catch (e) {
        console.error(e);
        showToast(t('toastGhFailed'), 'error');
      }
    }

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
  const modals = ['modalAddTurn', 'modalAddPoi', 'modalEditTurn', 'modalEditPoi', 'modalEditClimb', 'modalRoundTrip'];
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

/**
 * ============================================================================
 * ROUND TRIP GENERATOR (GRAPHHOPPER)
 * ============================================================================
 */
function openRoundTripModal() {
  if (state.isEditingRoute) toggleRouteEditing();
  if (state.isCreatingRoute) toggleCreateManualRoute();
  if (state.isAddingManualTurn) toggleAddManualTurnMode();

  // If no start coordinate chosen yet, try to default to existing route first point or map center
  if (!state.roundTripStart) {
    if (state.points.length > 0) {
      setRoundTripStartPoint(state.points[0].lat, state.points[0].lon);
    } else if (state.mapLayers.locationMarker) {
      const loc = state.mapLayers.locationMarker.getLatLng();
      setRoundTripStartPoint(loc.lat, loc.lng);
    } else if (state.map) {
      const center = state.map.getCenter();
      setRoundTripStartPoint(center.lat, center.lng);
    }
  }

  updateRoundTripUI();

  if (elements.modalRoundTrip) {
    elements.modalRoundTrip.classList.remove('hidden');
    elements.modalRoundTrip.style.display = 'flex';
  }
}
window.openRoundTripModal = openRoundTripModal;

function setRoundTripStartPoint(lat, lon) {
  state.roundTripStart = { lat: parseFloat(lat), lon: parseFloat(lon) };
  if (elements.rtStartCoordInput) {
    elements.rtStartCoordInput.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  // Draw or update start marker on map
  if (state.map) {
    if (state.mapLayers.rtStartMarker) {
      state.map.removeLayer(state.mapLayers.rtStartMarker);
    }
    const icon = L.divIcon({
      className: 'rt-start-pin',
      html: '<div style="background:#10b981; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid #fff; box-shadow:0 0 10px rgba(16,185,129,0.7); font-weight:bold; font-size:12px;">★</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    state.mapLayers.rtStartMarker = L.marker([lat, lon], { icon, draggable: true }).addTo(state.map);
    state.mapLayers.rtStartMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      setRoundTripStartPoint(pos.lat, pos.lng);
    });
  }
}

function startPickRtStartMode() {
  closeAllModals();
  state.isPickingRtStart = true;
  if (elements.roundTripStatusBar) {
    elements.roundTripStatusBar.classList.remove('hidden');
  }
  showToast(typeof t === 'function' ? t('rtModeActive') : 'Silakan klik di peta untuk memilih titik awal round trip.', 'info');
}

function stopPickRtStartMode() {
  state.isPickingRtStart = false;
  if (elements.roundTripStatusBar) {
    elements.roundTripStatusBar.classList.add('hidden');
  }
}

function updateRoundTripUI() {
  if (elements.rtDistanceSlider && elements.rtDistanceValue) {
    elements.rtDistanceValue.textContent = `${elements.rtDistanceSlider.value} km`;
  }
  if (elements.rtHeadingSlider && elements.rtHeadingValue) {
    const deg = parseInt(elements.rtHeadingSlider.value, 10);
    elements.rtHeadingValue.textContent = `${deg}° (${getHeadingCardinal(deg)})`;
    if (elements.rtCompassNeedle) {
      elements.rtCompassNeedle.style.transform = `rotate(${deg}deg)`;
    }
    // Update active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => {
      const bDeg = parseInt(btn.getAttribute('data-deg'), 10);
      btn.classList.toggle('active', Math.abs(bDeg - deg) < 15);
    });
  }
}

function getHeadingCardinal(deg) {
  deg = ((deg % 360) + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return t('headingNorth');
  if (deg >= 22.5 && deg < 67.5) return t('headingNorthEast');
  if (deg >= 67.5 && deg < 112.5) return t('headingEast');
  if (deg >= 112.5 && deg < 157.5) return t('headingSouthEast');
  if (deg >= 157.5 && deg < 202.5) return t('headingSouth');
  if (deg >= 202.5 && deg < 247.5) return t('headingSouthWest');
  if (deg >= 247.5 && deg < 292.5) return t('headingWest');
  return t('headingNorthWest');
}

function bindRoundTripEvents() {
  if (elements.btnRoundTrip) {
    elements.btnRoundTrip.addEventListener('click', openRoundTripModal);
  }

  if (elements.btnCancelPickRtStart) {
    elements.btnCancelPickRtStart.addEventListener('click', () => {
      stopPickRtStartMode();
      openRoundTripModal();
    });
  }

  if (elements.btnRtPickOnMap) {
    elements.btnRtPickOnMap.addEventListener('click', startPickRtStartMode);
  }

  if (elements.btnRtMyLoc) {
    elements.btnRtMyLoc.addEventListener('click', () => {
      if (state.mapLayers.locationMarker) {
        const pos = state.mapLayers.locationMarker.getLatLng();
        setRoundTripStartPoint(pos.lat, pos.lng);
        if (state.map) state.map.setView(pos, 14);
        showToast(t('toastStartSetGps'), 'success');
      } else {
        if (state.map) {
          state.map.locate({ setView: true, maxZoom: 15 });
          showToast(t('toastSearchingGps'), 'info');
        }
      }
    });
  }

  if (elements.rtDistanceSlider) {
    elements.rtDistanceSlider.addEventListener('input', updateRoundTripUI);
  }

  if (elements.rtHeadingSlider) {
    elements.rtHeadingSlider.addEventListener('input', updateRoundTripUI);
  }

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const deg = parseInt(btn.getAttribute('data-deg'), 10);
      if (elements.rtHeadingSlider) {
        elements.rtHeadingSlider.value = deg;
        updateRoundTripUI();
      }
    });
  });

  // Compass disc interactive dragging/clicking
  if (elements.rtCompassDisc) {
    let isDraggingCompass = false;
    const calculateAngleFromEvent = (e) => {
      const rect = elements.rtCompassDisc.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let angle = Math.atan2(dx, -dy) * (180 / Math.PI); // 0 is North, clockwise
      if (angle < 0) angle += 360;
      angle = Math.round(angle / 5) * 5;
      if (angle >= 360) angle = 0;
      if (elements.rtHeadingSlider) {
        elements.rtHeadingSlider.value = angle;
        updateRoundTripUI();
      }
    };

    elements.rtCompassDisc.addEventListener('pointerdown', (e) => {
      isDraggingCompass = true;
      elements.rtCompassDisc.setPointerCapture(e.pointerId);
      calculateAngleFromEvent(e);
    });
    elements.rtCompassDisc.addEventListener('pointermove', (e) => {
      if (isDraggingCompass) calculateAngleFromEvent(e);
    });
    const finishDrag = (e) => {
      if (isDraggingCompass) {
        isDraggingCompass = false;
        try { elements.rtCompassDisc.releasePointerCapture(e.pointerId); } catch (err) { }
      }
    };
    elements.rtCompassDisc.addEventListener('pointerup', finishDrag);
    elements.rtCompassDisc.addEventListener('pointercancel', finishDrag);
  }

  if (elements.btnRtRandomize) {
    elements.btnRtRandomize.addEventListener('click', () => {
      state.roundTripSeed = Math.floor(Math.random() * 100000);
      showToast(t('toastSeedUpdated').replace('{seed}', state.roundTripSeed), 'info');
    });
  }

  if (elements.btnSubmitRoundTrip) {
    elements.btnSubmitRoundTrip.addEventListener('click', generateRoundTripRoute);
  }
}

async function getGraphHopperApiKey() {
  // Strategy: Try Bryton document direct key first, fallback to known working brytonsport active key
  const fallbackKey = '917f326f-93f8-4e9f-97a0-679b508012b9';
  try {
    const keyRes = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.brytonsport.com/download/Docs/graphhopperKey'), {
      signal: AbortSignal.timeout(3000)
    });
    if (keyRes.ok) {
      const text = (await keyRes.text()).trim();
      if (text && text.length > 10) return text;
    }
  } catch (err) {
    console.warn('Fallback ke default GraphHopper Key:', err);
  }
  return fallbackKey;
}

async function generateRoundTripRoute() {
  if (!state.roundTripStart) {
    showToast(typeof t === 'function' ? t('toastRtNoPoint') : 'Silakan tentukan titik awal terlebih dahulu.', 'error');
    return;
  }

  if (state.points.length > 0) {
    if (!confirm(t('confirmRoundTripStart'))) {
      return;
    }
  }

  const startPt = state.roundTripStart;
  const targetKm = parseInt(elements.rtDistanceSlider ? elements.rtDistanceSlider.value : 25, 10);
  const targetMeters = targetKm * 1000;
  const heading = parseInt(elements.rtHeadingSlider ? elements.rtHeadingSlider.value : 0, 10);
  const vehicle = elements.rtProfileSelect ? elements.rtProfileSelect.value : 'bike';
  const seed = state.roundTripSeed || Math.floor(Math.random() * 10000);

  closeAllModals();
  showToast(typeof t === 'function' ? t('toastRtGenerating') : 'Menghitung rute round trip dari GraphHopper...', 'info', false);

  state.isProcessing = true;
  if (elements.btnProcess) elements.btnProcess.disabled = true;

  try {
    const apiKey = await getGraphHopperApiKey();
    const locale = typeof currentLang !== 'undefined' && currentLang === 'en' ? 'en' : 'id';

    const url = `https://graphhopper.com/api/1/route?point=${startPt.lat.toFixed(6)},${startPt.lon.toFixed(6)}` +
      `&algorithm=round_trip` +
      `&round_trip.distance=${targetMeters}` +
      `&round_trip.seed=${seed}` +
      `&heading=${heading}` +
      `&ch.disable=true` +
      `&elevation=true` +
      `&vehicle=${vehicle}` +
      `&calc_points=true` +
      `&instructions=true` +
      `&points_encoded=false` +
      `&locale=${locale}` +
      `&key=${apiKey.trim()}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GraphHopper Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.paths || data.paths.length === 0) {
      throw new Error('GraphHopper tidak menemukan rute loop untuk titik & parameter yang dipilih.');
    }

    const path = data.paths[0];
    const coords = path.points.coordinates; // Array of [lon, lat, ele]

    if (!coords || coords.length < 2) {
      throw new Error('Titik koordinat dari GraphHopper tidak cukup.');
    }

    resetState();

    // Map GraphHopper Coordinates to internal Points
    let runningDist = 0;
    const newPoints = [];
    for (let i = 0; i < coords.length; i++) {
      const lon = coords[i][0];
      const lat = coords[i][1];
      const ele = coords[i].length > 2 ? coords[i][2] : 0;

      if (i > 0) {
        const prev = newPoints[i - 1];
        runningDist += haversineDistance(prev.lat, prev.lon, lat, lon);
      }

      newPoints.push({
        lat,
        lon,
        ele: ele || 0,
        distFromStart: runningDist
      });
    }

    state.points = newPoints;
    state.rawBackupPoints = JSON.parse(JSON.stringify(newPoints));
    state.totalDistance = runningDist;

    const rName = `Round Trip ${Math.round(runningDist / 1000)}km`;
    state.fileName = `${rName.toLowerCase().replace(/\s+/g, '_')}.gpx`;
    state.baseName = rName.toLowerCase().replace(/\s+/g, '_');
    if (elements.brytonRouteName) elements.brytonRouteName.value = rName;

    // Parse Turn-by-Turn instructions returned directly by GraphHopper
    const ghToBrytonMap = {
      "-8": 12, "-7": 14, "-6": 32, "-3": 7, "-2": 3, "-1": 5,
      "0": 1, "1": 4, "2": 2, "3": 6, "4": 33, "5": 30, "6": 31, "7": 13, "8": 11
    };

    const insts = path.instructions || [];
    state.osmTurns = [];
    insts.forEach((inst, idx) => {
      // Find point index for instruction interval
      const ptIdx = (inst.interval && inst.interval.length > 0) ? inst.interval[0] : 0;
      if (ptIdx >= 0 && ptIdx < newPoints.length) {
        const pt = newPoints[ptIdx];
        const dirCode = ghToBrytonMap[inst.sign] || 1;
        state.osmTurns.push({
          id: Math.random().toString(36).substr(2, 9),
          source: 'osm',
          index: ptIdx,
          lat: pt.lat,
          lon: pt.lon,
          directionCode: dirCode,
          instruction: inst.text || getDirectionLabel(dirCode),
          distFromStart: pt.distFromStart
        });
      }
    });

    // ------------------------------------------------
    // SMART CLIMB DENSIFICATION & DETECTION FOR ROUND TRIP
    // ------------------------------------------------
    const densePoints = densifyRoute(state.points, 50);
    const denseClimbs = detectClimbs(densePoints);

    const finalPoints = [];
    const indexMap = new Map();
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

    state.points = finalPoints;
    state.osmTurns.forEach(t => {
      if (indexMap.has(t.index)) t.index = indexMap.get(t.index);
    });

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

    state.combinedInstructions = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);

    // Update UI & Render
    let totalEleGain = 0;
    for (let i = 1; i < state.points.length; i++) {
      const diff = (state.points[i].ele || 0) - (state.points[i - 1].ele || 0);
      if (diff > 0) totalEleGain += diff;
    }
    state.totalElevationGain = totalEleGain;

    elements.statDistance.textContent = `${(runningDist / 1000).toFixed(2)} km`;
    if (elements.statElevationGain) elements.statElevationGain.textContent = `${Math.round(totalEleGain)} m`;
    elements.statPoints.textContent = state.points.length.toLocaleString();

    renderTrackOnMap(true);
    renderElevationChart();
    updateStatsAndUI();
    saveHistoryState();
    updateCreateManualVisibility();

    // Biarkan tombol Generate TBT aktif jika pengguna ingin menganalisis ulang
    if (elements.btnProcess) elements.btnProcess.disabled = false;
    elements.btnDownloadBryton.disabled = false;
    elements.btnDownloadKml.disabled = false;
    elements.btnDownloadGpx.disabled = false;
    elements.btnDownloadFit.disabled = false;
    if (elements.btnToggleDownload) elements.btnToggleDownload.disabled = false;

    showToast(typeof t === 'function' ? t('toastRtSuccess') : 'Rute round trip berhasil dibuat!', 'success');
  } catch (err) {
    console.error('RoundTrip Error:', err);
    alert(t('toastRoundTripFailed') + err.message);
    showToast(t('toastRoundTripFailed') + err.message, 'error');
    if (elements.btnProcess) elements.btnProcess.disabled = false;
  } finally {
    state.isProcessing = false;
  }
}
window.generateRoundTripRoute = generateRoundTripRoute;

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

    const angleThresh = parseInt(elements.angleThreshold.value, 10);
    const dupDistThresh = parseInt(elements.dupDistanceThreshold.value, 10);
    const smoothingDist = parseInt(elements.smoothingRadius.value, 10);

    const useGhTbt = elements.enableOsmTbt.checked;

    if (useGhTbt) {
      showToast(typeof t === 'function' && t('toastFetchGH') ? t('toastFetchGH') : 'Mengambil data dari GraphHopper API...', 'info', false);
      const candidateTurns = detectAngleTurns(state.points, [], angleThresh, dupDistThresh, smoothingDist);
      state.osmTurns = await enrichCandidateTurnsWithGraphHopper(state.points, candidateTurns);
      state.extraTurns = [];
    } else {
      state.extraTurns = detectAngleTurns(state.points, state.osmTurns, angleThresh, dupDistThresh, smoothingDist);
    }

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

function getPointAlongRoute(points, startIdx, distance, direction) {
  let currIdx = startIdx;
  let distRemaining = distance;
  while (true) {
    let nextIdx = currIdx + direction;
    if (nextIdx < 0 || nextIdx >= points.length) return points[currIdx];
    let d = haversineDistance(points[currIdx].lat, points[currIdx].lon, points[nextIdx].lat, points[nextIdx].lon);
    if (distRemaining <= d && d > 0) {
      const fraction = distRemaining / d;
      return {
        lat: points[currIdx].lat + (points[nextIdx].lat - points[currIdx].lat) * fraction,
        lon: points[currIdx].lon + (points[nextIdx].lon - points[currIdx].lon) * fraction
      };
    }
    distRemaining -= d;
    currIdx = nextIdx;
  }
}

const GH_TO_BRYTON_MAP = {
  "-8": 12, "-7": 14, "-6": 32, "-3": 7, "-2": 3, "-1": 5,
  "0": 1, "1": 4, "2": 2, "3": 6, "4": 33, "5": 30, "6": 31, "7": 13, "8": 11
};

async function fetchGraphHopperInstruction(points, targetIdx, apiKey, locale) {
  try {
    const optimalDist = 30; // 30m sampling around turn point
    const p1 = getPointAlongRoute(points, targetIdx, optimalDist, -1);
    const p2 = getPointAlongRoute(points, targetIdx, optimalDist, 1);

    const url = `https://graphhopper.com/api/1/route?point=${p1.lat},${p1.lon}&point=${p2.lat},${p2.lon}&elevation=true&vehicle=mtb&calc_points=true&instructions=true&locale=${locale}&key=${apiKey.trim()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.paths || data.paths.length === 0) return null;

    const insts = data.paths[0].instructions;
    if (!insts || insts.length === 0) return null;

    let foundIdx = -1;
    for (let i = 0; i < insts.length; i++) {
      if (insts[i].sign !== 0 && insts[i].sign !== 4) {
        foundIdx = i;
        break;
      }
    }

    // Jika GraphHopper tidak mendeteksi manuver belokan (hanya jalan lurus / sign 0),
    // jangan kembalikan arah lurus agar tidak menimpa belokan sudut asli!
    if (foundIdx === -1) {
      // Ambil street_name murni jika ada (bukan text "Lanjut")
      const streetName = (insts[0] && insts[0].street_name && insts[0].street_name.trim()) || '';
      return {
        directionCode: null, // tandai tidak ada belokan dari GH
        text: '',
        streetName: streetName
      };
    }

    const inst = insts[foundIdx];
    const bCode = GH_TO_BRYTON_MAP[inst.sign] || null;
    return {
      directionCode: bCode,
      text: inst.text || '',
      streetName: (inst.street_name && inst.street_name.trim()) || ''
    };
  } catch (err) {
    return null;
  }
}

async function enrichCandidateTurnsWithGraphHopper(points, candidateTurns) {
  if (!candidateTurns || candidateTurns.length === 0) return [];

  const apiKey = await getGraphHopperApiKey();
  const locale = typeof currentLang !== 'undefined' && currentLang === 'en' ? 'en' : 'id';
  const turns = [];

  // Concurrency limit to prevent throttling
  const CONCURRENCY = 4;
  for (let i = 0; i < candidateTurns.length; i += CONCURRENCY) {
    const chunk = candidateTurns.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (turn) => {
        const ghData = await fetchGraphHopperInstruction(points, turn.index, apiKey, locale);
        let finalDirCode = turn.directionCode;
        let finalInstruction = turn.instruction;

        // Hanya gunakan arah & teks dari GraphHopper jika memang belokan nyata (bukan lurus/lanjut)
        if (ghData && ghData.directionCode && ghData.directionCode !== 1 && ghData.text) {
          finalDirCode = ghData.directionCode;
          finalInstruction = ghData.text;
        } else if (ghData && ghData.streetName) {
          // Jika GH hanya lurus tapi memiliki nama jalan murni (bukan kata "Lanjut"), tambahkan nama jalannya
          finalInstruction = `${turn.instruction} ke ${ghData.streetName}`;
        } else {
          // Tetap gunakan belokan manual/sudut asli tanpa tambahan apa-apa
          finalInstruction = turn.instruction;
        }

        return {
          id: Math.random().toString(36).substr(2, 9),
          source: (ghData && ghData.directionCode && ghData.directionCode !== 1) ? 'osm' : 'extra',
          index: turn.index,
          lat: turn.lat,
          lon: turn.lon,
          directionCode: finalDirCode,
          instruction: finalInstruction,
          distFromStart: turn.distFromStart,
          angle: turn.angle
        };
      })
    );
    turns.push(...results);
  }

  return turns;
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
      if (absAngle >= 165) {
        // Jika sudut mendekati 180 derajat, itu adalah putar balik (U-Turn)
        dirCode = angleDiff < 0 ? 12 : 11;
        label = angleDiff < 0 ? `Putar Balik Kiri` : `Putar Balik Kanan`;
      } else if (absAngle >= 135) {
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
        <div class="map-turn-marker" style="background: ${color}; box-shadow: 0 0 10px ${color};">
          ${symbol}
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const marker = L.marker([inst.lat, inst.lon], { icon: customIcon })
      .bindPopup(`
        <div class="popup-source-text">
          <strong>#${idx + 1} ${escapeHtml(getTranslatedInstruction(inst.instruction, inst.directionCode))}</strong><br>
          <span class="popup-source-label">${t('popupSource')} ${inst.source.toUpperCase()}</span><br>
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

  // Handle Climb translations
  if (dirCode === 190 || dirCode === 191) {
    const isStart = dirCode === 190;
    const climbMatch = result.match(/Climb\s+(\d+)|Tanjakan\s+(\d+)/i);
    const climbNum = climbMatch ? (climbMatch[1] || climbMatch[2]) : '';
    const prefix = t('climbPrefix');
    const suffix = isStart ? t('climbStartSuffix') : t('climbEndSuffix');
    return `${prefix} ${climbNum} ${suffix}`.trim();
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
    climbsBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data.'}</td></tr>`;
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
      const btnEdit = `<button type="button" class="btn-edit-item btn-edit-item-margin" data-type="turn" data-index="${idx}"><i data-lucide="edit-2"></i></button>`;
      tr.innerHTML = `
        <td>${pIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center"><div class="flex-center-gap">${btnEdit}${btnDel}</div></td>
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
      const btnEdit = `<button type="button" class="btn-edit-item btn-edit-item-margin" data-type="turn" data-index="${idx}"><i data-lucide="edit-2"></i></button>`;
      tr.innerHTML = `
        <td>${tIdx++}</td>
        <td><div class="turn-icon-cell">${arrow}</div></td>
        <td><strong>${instructionText}</strong></td>
        <td><span class="turn-badge ${badgeClass}">${badgeText}</span></td>
        <td>${Math.round(inst.distance || 0)}</td>
        <td>${formatTime(inst.time || 0)}</td>
        <td class="coord-cell">${inst.lat.toFixed(5)}, ${inst.lon.toFixed(5)}</td>
        <td class="text-center"><div class="flex-center-gap">${btnEdit}${btnDel}</div></td>
      `;
      turnsBody.appendChild(tr);
    }
  });

  // Render Climbs separately
  if (state.climbs.length === 0) {
    climbsBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="text-center">${typeof t === 'function' ? t('emptyClimbs') : 'Belum ada data Tanjakan.'}</td></tr>`;
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
  showToast(t('toastGpxDownloaded'), 'success');
}

async function generateKmlFile() {
  if (state.points.length === 0) return;
  let prefix = elements.brytonRouteName.value.trim() || state.baseName || 'bryton-route';
  prefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');

  const kmlString = createKmlString(state.points, prefix);
  const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
  saveAs(blob, `${prefix}.kml`);
  showToast(t('toastKmlDownloaded'), 'success');
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
    case 1: return t('optStraight') || 'Go Ahead / Lurus';
    case 2: return t('optRight') || 'Belok Kanan';
    case 3: return t('optLeft') || 'Belok Kiri';
    case 4: return t('optSlightRight') || 'Serong Kanan';
    case 5: return t('optSlightLeft') || 'Serong Kiri';
    case 6: return t('optSharpRight') || 'Belok Tajam Kanan';
    case 7: return t('optSharpLeft') || 'Belok Tajam Kiri';
    case 8: return t('optExitRight') || 'Cabang Kanan (Fork)';
    case 9: return t('optExitLeft') || 'Cabang Kiri (Fork)';
    case 11: return t('optUturnRight') || 'U-Turn Kanan';
    case 12: return t('optUturnLeft') || 'U-Turn Kiri';
    case 13: return t('optKeepRight') || 'Tetap di Kanan';
    case 14: return t('optKeepLeft') || 'Tetap di Kiri';
    case 15: return t('optRampRight') || 'Ramp Kanan';
    case 16: return t('optRampLeft') || 'Ramp Kiri';
    case 21: return t('optMerge') || 'Bergabung (Merge)';
    case 24: return t('optRoundaboutRight') || 'Bundaran Kanan';
    case 25: return t('optRoundaboutLeft') || 'Bundaran Kiri';
    case 28: return t('optFerry') || 'Feri';
    case 29: return t('optFerryTrain') || 'Feri/Kereta';
    case 30: return t('optVia') || 'Titik Singgah (Via)';
    case 31: return t('optEnterRoundabout') || 'Masuk Bundaran';
    case 32: return t('optLeaveRoundabout') || 'Keluar Bundaran';
    case 33: return t('optFinish') || 'Tujuan (Finish)';

    // Waypoints & Custom
    case 101: return t('poiFood');
    case 102: return t('poiWater');
    case 103: return t('poiSummit');
    case 104: return t('poiDanger');
    case 105: return t('poiSprint');
    case 106: return t('poiFirstAid');
    case 107: return t('poiValley');
    case 108: return t('poiGeneric');
    default: return t('dirStraight') || 'Lurus';
  }
}

function getDirectionArrow(code) {
  switch (code) {
    case 1: return '↑';
    case 2: return '→';
    case 3: return '←';
    case 4: return '↗';
    case 5: return '↖';
    case 6: return '↱';
    case 7: return '↰';
    case 8: return '⬈';
    case 9: return '⬉';
    case 11: return '↩';
    case 12: return '↪';
    case 13: return '↗'; // Keep right
    case 14: return '↖'; // Keep left
    case 15: return '⬈'; // Ramp right
    case 16: return '⬉'; // Ramp left
    case 21: return '⤡'; // Merge
    case 24: return '↻'; // Roundabout right
    case 25: return '↺'; // Roundabout left
    case 28: return '⛴'; // Ferry
    case 29: return '⛴'; // Ferry train
    case 30: return '📍'; // Reached via
    case 31: return '↻'; // Enter roundabout
    case 32: return '⤤'; // Leave roundabout
    case 33: return '🏁'; // Finish

    // Waypoints & Climbs
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

    showToast(t('toastFitSuccess'), 'success');
  } catch (err) {
    console.error(err);
    showToast(t('toastFitFailed') + err.message, 'error');
  } finally {
    elements.btnDownloadFit.innerHTML = origBtnText;
    elements.btnDownloadFit.disabled = false;
  }
}

// ============================================================
// BRYTON ACTIVE — Get ID & Share
// ============================================================

/** Load saved Bryton userId dari Firestore (dan LocalStorage per-user) untuk current user */
async function loadBrytonUserIdFromFirestore() {
  const input = document.getElementById('brytonUserId');
  if (!input) return;

  // Jika belum login, kosongkan input agar tidak membocorkan ID pengguna sebelumnya
  if (!currentUser) {
    input.value = '';
    return;
  }

  const userKey = 'openbryton_userid_' + currentUser.uid;

  // 1. Prioritaskan load dari localStorage spesifik user ini agar langsung muncul tanpa delay
  const cachedId = localStorage.getItem(userKey);
  if (cachedId) {
    input.value = cachedId;
  } else {
    input.value = ''; // Reset nilai jika user baru ini belum punya cache
  }

  // 2. Fetch dari Firestore jika db tersedia, dan timpa/update jika ada
  if (!db) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data() && doc.data().brytonUserId) {
      const idFromDb = doc.data().brytonUserId;
      input.value = idFromDb;
      // Perbarui juga cache localStorage untuk user ini
      localStorage.setItem(userKey, idFromDb);
    } else if (!cachedId) {
      input.value = '';
    }
  } catch (e) {
    console.warn('Could not load brytonUserId from Firestore:', e);
  }
}
window.loadBrytonUserIdFromFirestore = loadBrytonUserIdFromFirestore;

/** Simpan Bryton userId ke Firestore dan LocalStorage untuk current user */
async function saveBrytonUserIdToFirestore(userId) {
  if (!currentUser) return;
  const userKey = 'openbryton_userid_' + currentUser.uid;

  // Selalu simpan ke localStorage spesifik user
  if (userId) {
    localStorage.setItem(userKey, userId);
  } else {
    localStorage.removeItem(userKey);
  }

  if (!db) return;
  try {
    await db.collection('users').doc(currentUser.uid).set(
      { brytonUserId: userId },
      { merge: true }
    );
  } catch (e) {
    console.warn('Could not save brytonUserId to Firestore:', e);
  }
}
window.saveBrytonUserIdToFirestore = saveBrytonUserIdToFirestore;

/** Inisialisasi logika panel Bryton Active */
function initBrytonActivePanel() {
  // Selalu coba fetch ID dari localStorage dan Firestore saat inisialisasi
  loadBrytonUserIdFromFirestore();

  const idInput = document.getElementById('brytonUserId');
  if (idInput) {
    // Simpan otomatis ke localStorage/Firestore jika user mengubah atau mem-paste ID manual
    idInput.addEventListener('change', () => {
      saveBrytonUserIdToFirestore(idInput.value.trim());
    });
  }

  const btnGetId = document.getElementById('btnGetBrytonId');
  const btnShare = document.getElementById('btnShareBrytonActive');
  const btnConfirm = document.getElementById('btnConfirmGetId');
  const btnTogglePw = document.getElementById('btnTogglePassword');
  const modal = document.getElementById('modalGetBrytonId');
  const pwInput = document.getElementById('brytonLoginPassword');
  const eyeIcon = document.getElementById('eyeIcon');

  // Toggle password visibility
  if (btnTogglePw && pwInput) {
    btnTogglePw.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      if (eyeIcon) eyeIcon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }

  // Buka modal Get ID — bisa dibuka tanpa login Google
  if (btnGetId) {
    btnGetId.addEventListener('click', () => {
      const errEl = document.getElementById('brytonLoginError');
      if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
      if (modal) modal.classList.remove('hidden');
      const emailEl = document.getElementById('brytonLoginEmail');
      // Auto-fill email dari Google jika sudah login
      if (emailEl && currentUser && currentUser.email && !emailEl.value) {
        emailEl.value = currentUser.email;
      }
      // Focus ke password jika email sudah terisi
      const pwEl = document.getElementById('brytonLoginPassword');
      if (emailEl && emailEl.value && pwEl) {
        setTimeout(() => pwEl.focus(), 100);
      } else if (emailEl) {
        setTimeout(() => emailEl.focus(), 100);
      }
    });
  }

  // Confirm Get ID — panggil API bryton-login
  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      const emailEl = document.getElementById('brytonLoginEmail');
      const pwEl = document.getElementById('brytonLoginPassword');
      const errEl = document.getElementById('brytonLoginError');
      const email = emailEl?.value?.trim();
      const password = pwEl?.value;

      if (!email || !password) {
        if (errEl) { errEl.textContent = 'Email dan password wajib diisi.'; errEl.classList.remove('hidden'); }
        return;
      }

      const origHtml = btnConfirm.innerHTML;
      btnConfirm.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
      btnConfirm.disabled = true;
      if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

      try {
        showToast(t('toastFetchingBrytonId'), 'info', false);
        const resp = await fetch('/api/bryton-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || resp.statusText);

        const brytonId = data.id;
        // Isi input
        const idInput = document.getElementById('brytonUserId');
        if (idInput) idInput.value = brytonId;
        // Simpan ke Firestore
        await saveBrytonUserIdToFirestore(brytonId);
        // Tutup modal, bersihkan password
        if (modal) modal.classList.add('hidden');
        if (pwEl) pwEl.value = '';
        showToast(t('toastBrytonIdSaved'), 'success');
      } catch (err) {
        console.error('Get Bryton ID error:', err);
        if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
        showToast(t('toastBrytonIdFailed') + err.message, 'error');
      } finally {
        btnConfirm.innerHTML = origHtml;
        btnConfirm.disabled = false;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // Share to Bryton Active
  if (btnShare) {
    btnShare.addEventListener('click', shareToBrytonActive);
  }
}

/** Share rute ke Bryton Active via proxy API */
async function shareToBrytonActive() {
  if (state.points.length === 0) return;

  const idInput = document.getElementById('brytonUserId');
  const brytonUserId = idInput?.value?.trim();
  if (!brytonUserId) {
    showToast(t('toastNoBrytonId'), 'error');
    return;
  }

  const btnShare = document.getElementById('btnShareBrytonActive');
  const origHtml = btnShare?.innerHTML;
  if (btnShare) {
    btnShare.innerHTML = '<i class="lucide lucide-loader spinner"></i>';
    btnShare.disabled = true;
  }

  try {
    const fitBlob = buildFitBlob();
    const routeName = elements.brytonRouteName?.value?.trim() || state.baseName || 'BrytonRoute';

    showToast(t('toastSharingToBryton'), 'info', false);

    const url = `/api/bryton-share?userId=${encodeURIComponent(brytonUserId)}&name=${encodeURIComponent(routeName)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fitBlob
    });

    const result = await resp.json();

    if (!resp.ok || result.success === false) {
      throw new Error(result.body || result.error || `HTTP ${resp.status}`);
    }

    showToast(t('toastShareBrytonSuccess'), 'success');
    console.log('Bryton share result:', result);
  } catch (err) {
    console.error('Share to Bryton Active error:', err);
    showToast(t('toastShareBrytonFailed') + err.message, 'error');
  } finally {
    if (btnShare) {
      btnShare.innerHTML = origHtml;
      btnShare.disabled = false;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

