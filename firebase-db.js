// ==========================================
// Firebase Configuration & Initialization
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAHDXQI4dkdsZBEpTqoeeSRIUTlur8NMRI",
  authDomain: "openbryton.firebaseapp.com",
  projectId: "openbryton",
  storageBucket: "openbryton.firebasestorage.app",
  messagingSenderId: "25813021475",
  appId: "1:25813021475:web:707cdc739ee58afb605296"
};


let app, auth, db;
const isMockMode = (firebaseConfig.projectId === "your-app");

try {
  if (!isMockMode) {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  } else {
    console.warn("MOCK MODE: Firebase config is placeholder. Using LocalStorage for database.");
  }
} catch (e) {
  console.error("Firebase init error", e);
}

// ==========================================
// State & User Management
// ==========================================
let currentUser = null;

// Fake User for Mock Mode
const mockUser = {
  uid: "mock-user-123",
  displayName: "Goweser Lokal",
  photoURL: "https://api.dicebear.com/7.x/avataaars/svg?seed=Goweser"
};

if (auth) {
  auth.onAuthStateChanged((user) => {
    updateAuthUI(user);
  });
} else if (isMockMode) {
  // In mock mode, we just start logged out or let them "login"
  setTimeout(() => updateAuthUI(null), 100);
}

function updateAuthUI(user) {
  const btnLogin = document.getElementById('btnLogin');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const btnSaveRoute = document.getElementById('btnSaveRoute');
  const mainNav = document.getElementById('mainNav');

  if (user) {
    currentUser = user;
    if (btnLogin) btnLogin.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (userAvatar) userAvatar.src = user.photoURL || '';
    if (btnSaveRoute) btnSaveRoute.disabled = false;
    if (mainNav) mainNav.style.display = 'flex';

    // Auto redirect to My Routes on login if on login page
    if (document.getElementById('page-login')?.classList.contains('active') || !document.querySelector('.page-view.active') || document.querySelector('.page-view.active').id === 'page-login') {
      switchPage('myroutes');
    }
  } else {
    currentUser = null;
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (userProfile) userProfile.style.display = 'none';
    if (btnSaveRoute) btnSaveRoute.disabled = true;
    if (mainNav) mainNav.style.display = 'none';

    // Redirect to login page
    switchPage('login');
  }
}

function loginWithGoogle() {
  if (isMockMode) {
    alert("Mode Demo aktif (Firebase belum di-setup). Login berhasil sebagai 'Goweser Lokal'.");
    updateAuthUI(mockUser);
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    console.error("Login failed", err);
    alert("Login gagal: " + err.message);
  });
}

function logout() {
  if (isMockMode) {
    updateAuthUI(null);
    return;
  }
  if (auth) auth.signOut();
}

// ==========================================
// SPA Router
// ==========================================
function switchPage(pageId) {
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${pageId}`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.page-view').forEach(page => {
    page.classList.remove('active');
    page.classList.add('hidden');
    page.style.display = 'none';
  });

  const activePage = document.getElementById(`page-${pageId}`);
  if (activePage) {
    activePage.classList.remove('hidden');
    activePage.classList.add('active');
    if (pageId === 'create') {
      activePage.style.display = 'grid'; // .main-layout uses grid
      // Fix map rendering issue when unhidden
      const fixMap = () => {
        if (window.state && window.state.map) {
          window.state.map.invalidateSize();
          if (window.state.mapLayers && window.state.mapLayers.trackLine) {
            window.state.map.fitBounds(window.state.mapLayers.trackLine.getBounds(), { padding: [40, 40] });
          }
        }
      };
      setTimeout(fixMap, 50);
      setTimeout(fixMap, 300);
      setTimeout(fixMap, 800);
    } else if (pageId === 'login') {
      activePage.style.display = 'flex'; // maintain flex centering
    } else {
      activePage.style.display = 'block';
    }
  }

  if (pageId === 'explore') loadExploreRoutes();
  if (pageId === 'myroutes') loadMyRoutes();

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==========================================
// Database Operations (Mock/Real)
// ==========================================
async function saveRouteToDb() {
  if (!currentUser) return alert("Silakan login terlebih dahulu.");
  if (!window.state || window.state.points.length === 0) return alert("Tidak ada rute untuk disimpan.");

  const btnSave = document.getElementById('btnSaveRoute');
  const origHtml = btnSave.innerHTML;
  btnSave.innerHTML = '<i class="lucide lucide-loader spinner"></i> <span>Menyimpan...</span>';
  btnSave.disabled = true;

  try {
    const routeName = document.getElementById('brytonRouteName').value.trim() || window.state.baseName || 'My Route';

    const payload = {
      uid: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL,
      title: routeName,
      distance: window.state.points[window.state.points.length - 1].distFromStart,
      elevation: calculateTotalElevation(window.state.points),
      createdAt: isMockMode ? Date.now() : firebase.firestore.FieldValue.serverTimestamp(),
      points: JSON.stringify(window.state.points.map(p => [parseFloat(p.lat.toFixed(5)), parseFloat(p.lon.toFixed(5)), parseFloat((p.ele||0).toFixed(1))])),
      instructions: JSON.stringify(window.state.combinedInstructions)
    };

    if (isMockMode) {
      const dbMock = JSON.parse(localStorage.getItem('openbryton_mock_db') || '[]');
      payload.id = 'route_' + Date.now();
      dbMock.push(payload);
      localStorage.setItem('openbryton_mock_db', JSON.stringify(dbMock));
      await new Promise(r => setTimeout(r, 500)); // simulate delay
    } else {
      await db.collection('routes').add(payload);
    }

    alert("Rute berhasil disimpan!");
    switchPage('myroutes');
  } catch (error) {
    console.error("Save error", error);
    alert("Gagal menyimpan rute: " + error.message);
  } finally {
    btnSave.innerHTML = origHtml;
    btnSave.disabled = false;
  }
}

function calculateTotalElevation(points) {
  let ele = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) ele += diff;
  }
  return ele;
}

document.addEventListener('DOMContentLoaded', () => {
  const btnSave = document.getElementById('btnSaveRoute');
  if (btnSave) btnSave.addEventListener('click', saveRouteToDb);
});

// Render logic for cards
function renderRouteCards(containerId, routes, isMyRoutes) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (routes.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af;">Tidak ada rute ditemukan.</p>';
    return;
  }

  container.innerHTML = routes.map(r => {
    const dist = (r.distance / 1000).toFixed(2);
    const ele = r.elevation.toFixed(1);
    let dateStr = 'Baru saja';
    if (isMockMode && r.createdAt) {
      dateStr = new Date(r.createdAt).toLocaleDateString();
    } else if (r.createdAt && r.createdAt.seconds) {
      dateStr = new Date(r.createdAt.seconds * 1000).toLocaleDateString();
    }

    let actionButtons = '';
    const isOwner = currentUser && r.uid === currentUser.uid;
    
    if (isMyRoutes || isOwner) {
      actionButtons = `
        <div class="card-actions">
          <button class="btn btn-outline btn-sm" onclick="editRoute('${r.id}')">Edit</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="deleteRoute('${r.id}')">Hapus</button>
        </div>
      `;
    } else {
      actionButtons = `
        <div class="card-actions">
          <button class="btn btn-outline btn-sm" onclick="editRoute('${r.id}')">Lihat & Unduh</button>
        </div>
      `;
    }

    return `
      <div class="route-card">
        <div class="route-map-thumbnail" id="map-thumb-${r.id}" style="height:150px; background:#1e293b; border-radius:8px 8px 0 0;">
          <!-- Map thumbnail will be initialized here -->
        </div>
        <div class="route-card-body" style="padding:15px; border:1px solid var(--bg-card-border); border-top:none; border-radius:0 0 8px 8px; background:var(--bg-card);">
          <h3 class="route-title" style="margin:0 0 10px 0; font-size:16px;">${r.title}</h3>
          <div class="route-stats" style="font-size:13px; color:#9ca3af; margin-bottom:10px; display:flex; flex-direction:column; gap:4px;">
            <span>Distance: ${dist}km</span>
            <span>Elevation: ${ele}m</span>
          </div>
          <p class="route-meta" style="font-size:11px; color:#6b7280; margin-bottom:15px;">Uploaded on ${dateStr} by ${r.authorName || 'Unknown'}</p>
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');

  setTimeout(() => {
    routes.forEach(r => {
      try {
        const pts = JSON.parse(r.points).map(p => [parseFloat(p[0]), parseFloat(p[1])]);
        const mapEl = document.getElementById(`map-thumb-${r.id}`);
        if (mapEl && pts.length > 0) {
          const map = L.map(mapEl, { zoomControl: false, attributionControl: false, interactive: false });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          const poly = L.polyline(pts, { color: 'red', weight: 2 }).addTo(map);
          map.fitBounds(poly.getBounds());
        }
      } catch (e) { }
    });
  }, 100);
}

async function loadMyRoutes() {
  if (!currentUser) return;
  const container = document.getElementById('myroutesGrid');
  container.innerHTML = '<p>Memuat rute...</p>';
  try {
    let routes = [];
    if (isMockMode) {
      const dbMock = JSON.parse(localStorage.getItem('openbryton_mock_db') || '[]');
      routes = dbMock.filter(r => r.uid === currentUser.uid).sort((a, b) => b.createdAt - a.createdAt);
    } else {
      const snap = await db.collection('routes').where('uid', '==', currentUser.uid).get();
      routes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in JavaScript instead of Firestore to avoid requiring a Composite Index
      routes.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds || a.createdAt) : 0;
        const timeB = b.createdAt ? (b.createdAt.seconds || b.createdAt) : 0;
        return timeB - timeA;
      });
    }
    renderRouteCards('myroutesGrid', routes, true);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Gagal memuat: ' + err.message + '</p>';
  }
}

async function loadExploreRoutes() {
  const container = document.getElementById('exploreGrid');
  container.innerHTML = '<p>Memuat rute...</p>';
  try {
    let routes = [];
    if (isMockMode) {
      routes = JSON.parse(localStorage.getItem('openbryton_mock_db') || '[]').sort((a, b) => b.createdAt - a.createdAt);
    } else {
      const snap = await db.collection('routes').orderBy('createdAt', 'desc').limit(20).get();
      routes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    renderRouteCards('exploreGrid', routes, false);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Gagal memuat: ' + err.message + '</p>';
  }
}

async function deleteRoute(id) {
  if (!confirm("Hapus rute ini?")) return;
  try {
    if (isMockMode) {
      let dbMock = JSON.parse(localStorage.getItem('openbryton_mock_db') || '[]');
      dbMock = dbMock.filter(r => r.id !== id);
      localStorage.setItem('openbryton_mock_db', JSON.stringify(dbMock));
    } else {
      await db.collection('routes').doc(id).delete();
    }
    loadMyRoutes();
  } catch (err) {
    alert("Gagal menghapus: " + err.message);
  }
}

async function editRoute(id) {
  try {
    let data = null;
    if (isMockMode) {
      const dbMock = JSON.parse(localStorage.getItem('openbryton_mock_db') || '[]');
      data = dbMock.find(r => r.id === id);
    } else {
      const doc = await db.collection('routes').doc(id).get();
      if (doc.exists) data = doc.data();
    }

    if (!data) return alert("Rute tidak ditemukan");
    
    if (window.loadRouteFromFirebase) {
      const isOwner = currentUser && data.uid === currentUser.uid;
      window.loadRouteFromFirebase(data, isOwner);
      switchPage('create');
    } else {
      alert("Fungsi editor belum siap. Silakan muat ulang halaman.");
    }
  } catch (e) {
    alert("Gagal memuat rute: " + e.message);
  }
}
