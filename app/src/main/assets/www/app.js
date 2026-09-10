/* ==========================================================================
   VKU FIELD SURVEY PWA - APPLICATION ENGINE
   Offline-First Architecture powered by IndexedDB & Service Worker
   ========================================================================== */

// --- GLOBAL APP STATE & INDEXEDDB DEFINITION ---
const DB_NAME = 'VKUSurveyDB';
const DB_VERSION = 1;
const STORE_NAME = 'surveys';
const DRAFT_KEY = 'vku_survey_draft';
const DEFAULT_API_ENDPOINT = typeof window !== 'undefined' && window.location.origin ? window.location.origin + '/api/surveys' : '/api/surveys';

let db = null;
let deferredInstallPrompt = null;
let isSimulatedServerActive = false;
let itemCounter = 0;
let draftSaveTimeout = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] Initializing VKU Field Survey PWA...');

  // 1. Initialize IndexedDB
  await initDatabase();

  // 2. Register Service Worker
  registerServiceWorker();

  // 3. Setup Event Listeners
  setupEventListeners();

  // 4. Check & Update Network Status
  updateNetworkStatus();

  // 5. Initial Render
  await renderDashboard();
  updateStorageEstimate();

  // 6. Load Draft or Initialize First Inspection Item Entry in Form
  loadDraftFromStorage();

  // 7. ALWAYS Trigger Cloud Sync on app startup (Pull cloud surveys into new tab / device)
  if (navigator.onLine) {
    syncData(true);
  }
});

// ==========================================================================
// 1. INDEXEDDB STORAGE ENGINE
// ==========================================================================
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('building', 'building', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] Object store created successfully.');
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('[IndexedDB] Database connected.');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Connection error:', event.target.error);
      reject(event.target.error);
    };
  });
}

function saveSurveyToDB(survey) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(survey);

    request.onsuccess = () => resolve(survey);
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllSurveysFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve([]);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function deleteSurveyFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function clearDatabase() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// ==========================================================================
// 2. SERVICE WORKER & PWA INSTALLATION
// ==========================================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
          const el = document.getElementById('sw-status');
          if (el) {
            el.innerText = '✅ Đã kích hoạt (Active)';
            el.style.color = '#059669';
          }
        })
        .catch((err) => {
          console.error('[PWA] ServiceWorker registration failed:', err);
          const el = document.getElementById('sw-status');
          if (el) el.innerText = '❌ Không khả dụng';
        });
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TRIGGER_SYNC') {
        console.log('[Background Sync] Trigger received from ServiceWorker.');
        autoSyncOfflineQueue();
      }
    });
  } else {
    const el = document.getElementById('sw-status');
    if (el) el.innerText = '❌ Trình duyệt không hỗ trợ SW';
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btnInstall = document.getElementById('btn-install');
    if (btnInstall) {
      btnInstall.classList.remove('hidden');
    }
  });
}

// ==========================================================================
// 3. NETWORK DETECTOR & AUTOMATIC SYNC ENGINE
// ==========================================================================
function updateNetworkStatus() {
  const isOnline = navigator.onLine;
  const statusEl = document.getElementById('network-status');
  const statusText = document.getElementById('status-text');
  const syncConnStatus = document.getElementById('sync-connection-status');

  if (isOnline) {
    if (statusEl) statusEl.className = 'status-badge online';
    if (statusText) statusText.innerText = 'ONLINE';
    if (syncConnStatus) {
      syncConnStatus.innerText = 'Đang có kết nối Mạng';
      syncConnStatus.className = 'text-online';
      syncConnStatus.style.color = '#059669';
    }
    logSync('Hệ thống chuyển sang trạng thái ONLINE. Sẵn sàng đồng bộ.');
    autoSyncOfflineQueue();
  } else {
    if (statusEl) statusEl.className = 'status-badge offline';
    if (statusText) statusText.innerText = 'OFFLINE';
    if (syncConnStatus) {
      syncConnStatus.innerText = 'Đang Offline (Hoàn toàn không có mạng)';
      syncConnStatus.className = 'text-offline';
      syncConnStatus.style.color = '#DC2626';
    }
    logSync('Hệ thống chuyển sang trạng thái OFFLINE. Dữ liệu sẽ lưu tại bộ nhớ tạm IndexedDB.');
  }
}

async function autoSyncOfflineQueue() {
  const surveys = await getAllSurveysFromDB();
  const unsynced = surveys.filter(s => !s.synced);
  if (unsynced.length > 0 && (navigator.onLine || isSimulatedServerActive)) {
    showToast(`Phát hiện ${unsynced.length} bản ghi chưa đồng bộ. Đang tự động đẩy dữ liệu...`, 'info');
    await syncData();
  }
}

// ==========================================================================
// 3.1 FORM DRAFT AUTO-SAVE ENGINE & API CONFIG
// ==========================================================================
function getApiEndpoint() {
  const saved = localStorage.getItem('vku_api_endpoint');
  if (saved && (saved.includes('jsonplaceholder') || saved.includes('mockapi'))) {
    localStorage.removeItem('vku_api_endpoint');
  }

  const inputEl = document.getElementById('api-endpoint-input');
  let url = inputEl ? inputEl.value.trim() : '';
  if (!url || url.includes('jsonplaceholder')) {
    url = localStorage.getItem('vku_api_endpoint') || DEFAULT_API_ENDPOINT;
  }
  return url;
}

function saveDraftToStorage() {
  clearTimeout(draftSaveTimeout);
  draftSaveTimeout = setTimeout(() => {
    const surveyorName = document.getElementById('surveyor-name')?.value.trim() || '';
    const surveyorId = document.getElementById('surveyor-id')?.value.trim() || '';
    const building = document.getElementById('building')?.value || '';
    const roomDetails = document.getElementById('room-details')?.value.trim() || '';
    const gpsLat = document.getElementById('gps-lat')?.value || '';
    const gpsLng = document.getElementById('gps-lng')?.value || '';

    const itemCards = document.querySelectorAll('.inspection-item-entry');
    const items = [];
    itemCards.forEach(card => {
      const cardIdStr = card.id.replace('item-entry-', '');
      const category = card.querySelector('.item-category')?.value || '';
      const condition = card.querySelector(`input[name="item-condition-${cardIdStr}"]:checked`)?.value || 'good';
      const description = card.querySelector('.item-desc')?.value.trim() || '';
      const photoBase64 = itemPhotoBase64Map[cardIdStr] || null;

      if (category || description || photoBase64) {
        items.push({ category, condition, description, photoBase64 });
      }
    });

    if (surveyorName || surveyorId || building || roomDetails || items.length > 0) {
      const draftData = {
        surveyorName,
        surveyorId,
        building,
        roomDetails,
        gpsLat,
        gpsLng,
        items,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
      console.log('[Draft] Auto-saved form draft to localStorage.');
    }
  }, 400);
}

function loadDraftFromStorage() {
  const container = document.getElementById('inspection-items-container');
  const rawDraft = localStorage.getItem(DRAFT_KEY);

  if (!rawDraft) {
    if (container && container.children.length === 0) {
      addInspectionItemCard();
    }
    return;
  }

  try {
    const draft = JSON.parse(rawDraft);
    if (draft.surveyorName && document.getElementById('surveyor-name')) document.getElementById('surveyor-name').value = draft.surveyorName;
    if (draft.surveyorId && document.getElementById('surveyor-id')) document.getElementById('surveyor-id').value = draft.surveyorId;
    if (draft.building && document.getElementById('building')) document.getElementById('building').value = draft.building;
    if (draft.roomDetails && document.getElementById('room-details')) document.getElementById('room-details').value = draft.roomDetails;
    if (draft.gpsLat && document.getElementById('gps-lat')) document.getElementById('gps-lat').value = draft.gpsLat;
    if (draft.gpsLng && document.getElementById('gps-lng')) document.getElementById('gps-lng').value = draft.gpsLng;
    
    if (draft.gpsLat && draft.gpsLng) {
      const gpsDisplay = document.getElementById('gps-display');
      if (gpsDisplay) gpsDisplay.innerText = `📍 Lat: ${draft.gpsLat}, Lng: ${draft.gpsLng} (Khôi phục từ nháp)`;
    }

    if (container) {
      container.innerHTML = '';
      itemCounter = 0;
    }

    if (draft.items && Array.isArray(draft.items) && draft.items.length > 0) {
      draft.items.forEach(it => {
        addInspectionItemCard();
        const currentId = itemCounter;
        const card = document.getElementById(`item-entry-${currentId}`);
        if (card) {
          if (it.category) card.querySelector('.item-category').value = it.category;
          if (it.description) card.querySelector('.item-desc').value = it.description;
          if (it.condition) {
            const radio = card.querySelector(`input[name="item-condition-${currentId}"][value="${it.condition}"]`);
            if (radio) radio.checked = true;
          }
          if (it.photoBase64) {
            itemPhotoBase64Map[currentId] = it.photoBase64;
            const previewImg = document.getElementById(`photo-preview-${currentId}`);
            const previewContainer = document.getElementById(`photo-preview-container-${currentId}`);
            if (previewImg && previewContainer) {
              previewImg.src = it.photoBase64;
              previewContainer.classList.remove('hidden');
            }
          }
        }
      });
    } else if (container) {
      addInspectionItemCard();
    }

    const draftAlert = document.getElementById('draft-alert');
    const draftTime = document.getElementById('draft-time');
    if (draftAlert && draftTime) {
      const formattedTime = new Date(draft.savedAt).toLocaleTimeString('vi-VN');
      draftTime.innerText = formattedTime;
      draftAlert.classList.remove('hidden');
    }
  } catch (err) {
    console.error('[Draft] Parse error:', err);
    if (container && container.children.length === 0) {
      addInspectionItemCard();
    }
  }
}

function clearDraftStorage() {
  localStorage.removeItem(DRAFT_KEY);
  const draftAlert = document.getElementById('draft-alert');
  if (draftAlert) draftAlert.classList.add('hidden');
  console.log('[Draft] Cleared draft from localStorage.');
}

// ==========================================================================
// 4. EVENT LISTENERS & NAVIGATION
// ==========================================================================
function setupEventListeners() {
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  // Auto-polling Cloud every 5 seconds when online for real-time cross-device sync
  setInterval(() => {
    if (navigator.onLine) {
      syncData(true);
    }
  }, 5000);

  // Auto-sync when switching back to this browser tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) {
      syncData(true);
    }
  });

  document.querySelectorAll('.nav-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const targetTab = tabBtn.dataset.tab;
      switchTab(targetTab);
    });
  });

  const btnInstall = document.getElementById('btn-install');
  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted installation.');
        }
        deferredInstallPrompt = null;
        btnInstall.classList.add('hidden');
      }
    });
  }

  // API Endpoint Config listener
  const apiInput = document.getElementById('api-endpoint-input');
  if (apiInput) {
    const savedEndpoint = localStorage.getItem('vku_api_endpoint') || DEFAULT_API_ENDPOINT;
    apiInput.value = savedEndpoint;
    apiInput.addEventListener('change', () => {
      const val = apiInput.value.trim() || DEFAULT_API_ENDPOINT;
      localStorage.setItem('vku_api_endpoint', val);
      showToast('Đã lưu Cấu hình Endpoint Server API', 'info');
    });
  }

  // Add Item Button
  const btnAddItem = document.getElementById('btn-add-item');
  if (btnAddItem) {
    btnAddItem.addEventListener('click', () => {
      addInspectionItemCard();
      saveDraftToStorage();
    });
  }

  const btnGetGps = document.getElementById('btn-get-gps');
  if (btnGetGps) {
    btnGetGps.addEventListener('click', fetchGpsLocation);
  }

  const form = document.getElementById('inspection-form');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
    form.addEventListener('input', saveDraftToStorage);
    form.addEventListener('change', saveDraftToStorage);
  }

  document.getElementById('btn-clear-draft')?.addEventListener('click', () => {
    clearDraftStorage();
    if (form) form.reset();
    const container = document.getElementById('inspection-items-container');
    if (container) container.innerHTML = '';
    itemCounter = 0;
    addInspectionItemCard();
    document.getElementById('gps-display').innerText = 'Chưa lấy tọa độ GPS';
    showToast('Đã xóa bản nháp dở dang!', 'info');
  });

  document.getElementById('search-input')?.addEventListener('input', renderDashboard);
  document.getElementById('filter-building')?.addEventListener('change', renderDashboard);
  document.getElementById('filter-status')?.addEventListener('change', renderDashboard);
  document.getElementById('btn-quick-sync')?.addEventListener('click', syncData);

  document.getElementById('btn-force-sync')?.addEventListener('click', syncData);
  document.getElementById('btn-toggle-simulated-server')?.addEventListener('click', () => {
    isSimulatedServerActive = !isSimulatedServerActive;
    const btn = document.getElementById('btn-toggle-simulated-server');
    btn.innerText = isSimulatedServerActive ? '✅ Server Giả lập: ĐANG BẬT' : '🛠️ Bật Server Giả lập (Demo Sync)';
    showToast(`Máy chủ giả lập đã ${isSimulatedServerActive ? 'BẬT' : 'TẮT'}`, 'info');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);
  document.getElementById('btn-export-json')?.addEventListener('click', exportToJSON);
  document.getElementById('btn-load-sample')?.addEventListener('click', loadSampleData);
  document.getElementById('btn-clear-db')?.addEventListener('click', async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu khảo sát offline? Hành động này không thể hoàn tác!')) {
      await clearDatabase();
      await renderDashboard();
      showToast('Đã xóa sạch bộ nhớ tạm IndexedDB', 'success');
    }
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-page').forEach(page => {
    page.classList.toggle('active', page.id === tabId);
  });
  if (tabId === 'tab-dashboard') {
    renderDashboard();
  }
}

// ==========================================================================
// 5. DYNAMIC INSPECTION ITEM BUILDER
// ==========================================================================
function addInspectionItemCard() {
  itemCounter++;
  const id = itemCounter;
  const container = document.getElementById('inspection-items-container');

  const card = document.createElement('div');
  card.className = 'inspection-item-entry';
  card.id = `item-entry-${id}`;

  card.innerHTML = `
    <div class="item-entry-header">
      <span class="item-entry-title">📌 Hạng mục kiểm tra #${id}</span>
      <button type="button" class="btn-remove-item" onclick="removeInspectionItemCard(${id})">🗑️ Xóa hạng mục này</button>
    </div>

    <!-- Category Select -->
    <div class="form-group">
      <label>Tên Hạng mục / Thiết bị <span class="req">*</span></label>
      <select class="item-category" required>
        <option value="">-- Chọn Hạng mục --</option>
        <option value="Máy tính / Lab">💻 Máy tính / Thiết bị Lab</option>
        <option value="Điều hòa / HVAC">❄️ Máy điều hòa / Thông gió</option>
        <option value="Điện & Đèn">💡 Đèn chiếu sáng / Ổ cắm điện</option>
        <option value="Bàn ghế / Nội thất">🪑 Bàn ghế / Bảng / Nội thất</option>
        <option value="Mạng & Wi-Fi">🌐 Thiết bị Mạng / Router Wi-Fi</option>
        <option value="Vệ sinh & Nước">🧹 Vệ sinh / Hệ thống Nước</option>
        <option value="PCCC & An toàn">🧯 Bình PCCC / Cửa thoát hiểm</option>
        <option value="Khác">📦 Hạng mục Khác</option>
      </select>
    </div>

    <!-- Individual Condition Rating -->
    <div class="form-group">
      <label>Tình trạng riêng hạng mục này <span class="req">*</span></label>
      <div class="condition-grid">
        <label class="condition-option good">
          <input type="radio" name="item-condition-${id}" value="good" checked>
          <div class="condition-content">
            <span class="icon">🟢</span>
            <span class="title">Tốt</span>
            <span class="sub">Không có sự cố</span>
          </div>
        </label>

        <label class="condition-option warning">
          <input type="radio" name="item-condition-${id}" value="warning">
          <div class="condition-content">
            <span class="icon">🟡</span>
            <span class="title">Bảo trì</span>
            <span class="sub">Lỗi nhẹ / Xuống cấp</span>
          </div>
        </label>

        <label class="condition-option danger">
          <input type="radio" name="item-condition-${id}" value="danger">
          <div class="condition-content">
            <span class="icon">🔴</span>
            <span class="title">Hỏng hóc</span>
            <span class="sub">Cần thay thế/sửa chữa</span>
          </div>
        </label>

        <label class="condition-option emergency">
          <input type="radio" name="item-condition-${id}" value="emergency">
          <div class="condition-content">
            <span class="icon">🚨</span>
            <span class="title">Nguy hiểm</span>
            <span class="sub">Cần xử lý khẩn cấp</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Individual Description -->
    <div class="form-group">
      <label>Mô tả chi tiết sự cố cho riêng hạng mục này <span class="req">*</span></label>
      <textarea class="item-desc" rows="2" placeholder="Nhập ghi chú / mô tả sự cố cụ thể của hạng mục này..." required></textarea>
    </div>

    <!-- Individual Photo Upload -->
    <div class="form-group">
      <label>Hình ảnh minh chứng riêng hạng mục này</label>
      <div class="camera-uploader">
        <input type="file" accept="image/*" capture="environment" class="item-photo-input hidden" id="photo-input-${id}">
        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('photo-input-${id}').click()">
          📷 Chụp ảnh / Chọn tệp ảnh
        </button>
        <div id="photo-preview-container-${id}" class="photo-preview-container hidden">
          <img id="photo-preview-${id}" src="" alt="Ảnh minh chứng">
          <button type="button" class="btn-remove-photo" onclick="removePhotoForItem(${id})">✕</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(card);

  // Setup photo listener for this item card
  const photoInput = card.querySelector(`#photo-input-${id}`);
  photoInput.addEventListener('change', (e) => handlePhotoForItem(e, id));

  updateRemoveButtonsState();
}

window.removeInspectionItemCard = function(id) {
  const card = document.getElementById(`item-entry-${id}`);
  if (card) {
    card.remove();
    updateRemoveButtonsState();
  }
};

function updateRemoveButtonsState() {
  const container = document.getElementById('inspection-items-container');
  const removeBtns = container.querySelectorAll('.btn-remove-item');
  if (removeBtns.length === 1) {
    removeBtns[0].style.display = 'none';
  } else {
    removeBtns.forEach(btn => btn.style.display = 'inline-block');
  }
}

const itemPhotoBase64Map = {};

function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.6) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handlePhotoForItem(e, id) {
  const file = e.target.files[0];
  if (!file) return;

  const previewImg = document.getElementById(`photo-preview-${id}`);
  const previewContainer = document.getElementById(`photo-preview-container-${id}`);

  if (previewImg) previewImg.alt = 'Đang nén ảnh...';
  showToast('📷 Đang nén ảnh tối ưu dung lượng...', 'info');

  const compressedBase64 = await compressImage(file);
  if (compressedBase64) {
    itemPhotoBase64Map[id] = compressedBase64;
    if (previewImg) {
      previewImg.src = compressedBase64;
      previewImg.alt = 'Ảnh minh chứng';
    }
    if (previewContainer) previewContainer.classList.remove('hidden');
    saveDraftToStorage();
    showToast('✅ Đã nén ảnh thành công (~30KB), truyền mạng siêu tốc!', 'success');
  }
}

window.removePhotoForItem = function(id) {
  delete itemPhotoBase64Map[id];
  const input = document.getElementById(`photo-input-${id}`);
  if (input) input.value = '';
  const previewContainer = document.getElementById(`photo-preview-container-${id}`);
  if (previewContainer) previewContainer.classList.add('hidden');
};

// ==========================================================================
// 6. GPS LOCATION
// ==========================================================================
function fetchGpsLocation() {
  const gpsDisplay = document.getElementById('gps-display');
  gpsDisplay.innerText = '📡 Đang lấy vị trí vệ tinh GPS...';

  if (!navigator.geolocation) {
    gpsDisplay.innerText = '❌ Trình duyệt không hỗ trợ Geolocation';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      const accuracy = position.coords.accuracy.toFixed(1);

      document.getElementById('gps-lat').value = lat;
      document.getElementById('gps-lng').value = lng;
      gpsDisplay.innerText = `📍 Lat: ${lat}, Lng: ${lng} (Độ chính xác: ±${accuracy}m)`;
      showToast('Đã lấy tọa độ GPS thành công!', 'success');
    },
    (error) => {
      console.warn('[GPS] Error:', error.message);
      const fallbackLat = '15.975300';
      const fallbackLng = '108.253200';
      document.getElementById('gps-lat').value = fallbackLat;
      document.getElementById('gps-lng').value = fallbackLng;
      gpsDisplay.innerText = `📍 Lat: ${fallbackLat}, Lng: ${fallbackLng} (VKU Campus Preset)`;
      showToast('Đã dùng tọa độ VKU Campus mặc định', 'info');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ==========================================================================
// 7. FORM SUBMISSION
// ==========================================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const surveyorName = document.getElementById('surveyor-name').value.trim();
  const surveyorId = document.getElementById('surveyor-id').value.trim();
  const building = document.getElementById('building').value;
  const roomDetails = document.getElementById('room-details').value.trim();
  const gpsLat = document.getElementById('gps-lat').value || '15.975300';
  const gpsLng = document.getElementById('gps-lng').value || '108.253200';

  if (!surveyorName || !surveyorId || !building || !roomDetails) {
    showToast('Vui lòng điền đầy đủ thông tin người kiểm tra và vị trí (*)', 'error');
    return;
  }

  // Collect all dynamic item entries
  const itemCards = document.querySelectorAll('.inspection-item-entry');
  if (itemCards.length === 0) {
    showToast('Vui lòng thêm ít nhất một hạng mục kiểm tra!', 'error');
    return;
  }

  const items = [];
  let hasError = false;

  itemCards.forEach(card => {
    const cardIdStr = card.id.replace('item-entry-', '');
    const cardId = parseInt(cardIdStr, 10);

    const categorySelect = card.querySelector('.item-category');
    const category = categorySelect ? categorySelect.value : '';
    const conditionRadio = card.querySelector(`input[name="item-condition-${cardId}"]:checked`);
    const condition = conditionRadio ? conditionRadio.value : 'good';
    const descTextarea = card.querySelector('.item-desc');
    const description = descTextarea ? descTextarea.value.trim() : '';
    const photoBase64 = itemPhotoBase64Map[cardId] || null;

    if (!category || !description) {
      hasError = true;
    }

    items.push({
      category,
      condition,
      description,
      photoBase64
    });
  });

  if (hasError) {
    showToast('Vui lòng điền tên hạng mục và mô tả cho tất cả các hạng mục!', 'error');
    return;
  }

  // Determine overall worst condition
  const conditionPriority = { emergency: 4, danger: 3, warning: 2, good: 1 };
  let worstCondition = 'good';
  items.forEach(it => {
    if (conditionPriority[it.condition] > conditionPriority[worstCondition]) {
      worstCondition = it.condition;
    }
  });

  const newSurvey = {
    id: 'VKU-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    surveyorName,
    surveyorId,
    building,
    roomDetails,
    overallCondition: worstCondition,
    items,
    gpsLocation: { lat: gpsLat, lng: gpsLng },
    timestamp: new Date().toISOString(),
    synced: false
  };

  try {
    await saveSurveyToDB(newSurvey);
    showToast(`✅ Đã lưu phiếu khảo sát (${items.length} hạng mục) vào IndexedDB!`, 'success');
    logSync(`Đã lưu phiếu khảo sát [${newSurvey.id}] (${items.length} hạng mục) tại ${newSurvey.building} - ${newSurvey.roomDetails}`);

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync.register('sync-vku-surveys').catch(err => console.log('Sync reg error', err));
      });
    }

    // Clear draft storage & Reset Form
    clearDraftStorage();
    document.getElementById('inspection-form').reset();
    document.getElementById('inspection-items-container').innerHTML = '';
    itemCounter = 0;
    addInspectionItemCard();
    document.getElementById('gps-display').innerText = 'Chưa lấy tọa độ GPS';

    switchTab('tab-dashboard');

    // Trigger auto-sync if network is online
    if (navigator.onLine || isSimulatedServerActive) {
      setTimeout(() => autoSyncOfflineQueue(), 800);
    }
  } catch (err) {
    console.error('[Form] Save error:', err);
    showToast('Lỗi khi lưu phiếu khảo sát!', 'error');
  }
}

// ==========================================================================
// 8. DASHBOARD RENDERING & METRICS
// ==========================================================================
async function renderDashboard() {
  const surveys = await getAllSurveysFromDB();

  let totalItemsCount = 0;
  let goodCount = 0;
  let warningCount = 0;
  let dangerCount = 0;
  const unsyncedCount = surveys.filter(s => !s.synced).length;

  surveys.forEach(s => {
    if (s.items && Array.isArray(s.items)) {
      s.items.forEach(it => {
        totalItemsCount++;
        if (it.condition === 'good') goodCount++;
        else if (it.condition === 'warning') warningCount++;
        else if (it.condition === 'danger' || it.condition === 'emergency') dangerCount++;
      });
    }
  });

  document.getElementById('count-total').innerText = surveys.length;
  document.getElementById('count-good').innerText = goodCount;
  document.getElementById('count-warning').innerText = warningCount;
  document.getElementById('count-danger').innerText = dangerCount;
  document.getElementById('count-unsynced').innerText = unsyncedCount;
  document.getElementById('unsynced-badge').innerText = unsyncedCount;
  document.getElementById('sync-queue-count').innerText = unsyncedCount;
  document.getElementById('list-count-badge').innerText = `${surveys.length} phiếu (${totalItemsCount} hạng mục)`;

  const searchQuery = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
  const buildingFilter = document.getElementById('filter-building')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';

  const filteredSurveys = surveys.filter(s => {
    const matchesBuilding = !buildingFilter || s.building === buildingFilter;
    
    let matchesStatus = true;
    if (statusFilter) {
      matchesStatus = s.items?.some(it => it.condition === statusFilter);
    }

    let matchesSearch = true;
    if (searchQuery) {
      const inHeader = s.surveyorName.toLowerCase().includes(searchQuery) ||
                       s.building.toLowerCase().includes(searchQuery) ||
                       s.roomDetails.toLowerCase().includes(searchQuery);
      const inItems = s.items?.some(it => it.category.toLowerCase().includes(searchQuery) || it.description.toLowerCase().includes(searchQuery));
      matchesSearch = inHeader || inItems;
    }

    return matchesSearch && matchesBuilding && matchesStatus;
  });

  filteredSurveys.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const container = document.getElementById('survey-list');
  if (!container) return;

  if (filteredSurveys.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>Không tìm thấy bản ghi khảo sát nào phù hợp.</p>
        <button class="btn btn-primary" onclick="switchTab('tab-new')">➕ Tạo bài khảo sát mới</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredSurveys.map(s => {
    const formattedDate = new Date(s.timestamp).toLocaleString('vi-VN');
    const syncStatusText = s.synced ? '✅ Đã đồng bộ' : '⏳ Chưa đồng bộ';
    const syncClass = s.synced ? 'synced' : 'pending';

    const itemsCount = s.items ? s.items.length : 0;
    
    // Generate items mini tags
    const conditionLabels = {
      good: { text: '🟢 Tốt', class: 'good' },
      warning: { text: '🟡 Bảo trì', class: 'warning' },
      danger: { text: '🔴 Hỏng', class: 'danger' },
      emergency: { text: '🚨 Nguy hiểm', class: 'emergency' }
    };

    const itemsSummaryHtml = (s.items || []).map(it => {
      const tag = conditionLabels[it.condition] || { text: it.condition, class: 'good' };
      return `
        <div class="sub-item-badge-row">
          <span class="sub-item-name">${escapeHtml(it.category)}</span>
          <span class="condition-tag ${tag.class}">${tag.text}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="survey-item-card">
        <div class="card-top-bar">
          <span class="badge">📋 ${itemsCount} Hạng mục</span>
          <span class="sync-status-tag ${syncClass}">${syncStatusText}</span>
        </div>
        <div class="card-main-body">
          <div class="survey-info">
            <h4>${escapeHtml(s.building)} - ${escapeHtml(s.roomDetails)}</h4>
            <p><strong>Người kiểm tra:</strong> ${escapeHtml(s.surveyorName)} (${escapeHtml(s.surveyorId)})</p>
            <p style="font-size:11px; color:#64748b;">🕒 ${formattedDate}</p>
          </div>
          <div class="items-sub-list">
            ${itemsSummaryHtml}
          </div>
        </div>
        <div class="card-actions-bar">
          <button class="btn btn-outline btn-sm" onclick="openDetailModal('${s.id}')">👁️ Xem chi tiết (${itemsCount})</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteSurveyItem('${s.id}')">🗑️ Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openDetailModal = async function(id) {
  const surveys = await getAllSurveysFromDB();
  const item = surveys.find(s => s.id === id);
  if (!item) return;

  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modal = document.getElementById('detail-modal');

  modalTitle.innerText = `Phiếu Khảo sát: ${item.building} - ${item.roomDetails}`;

  const itemsHtml = (item.items || []).map((it, idx) => `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:8px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:bold; margin-bottom:6px;">
        <span>#${idx+1}. ${escapeHtml(it.category)}</span>
        <span style="font-size:11px; padding:2px 6px; border-radius:4px; text-transform:uppercase; font-weight:bold; background:${it.condition==='good'?'#D1FAE5':it.condition==='warning'?'#FEF3C7':'#FEE2E2'}; color:${it.condition==='good'?'#065F46':it.condition==='warning'?'#92400E':'#991B1B'};">${it.condition}</span>
      </div>
      <p style="font-size:13px; margin-bottom:8px; white-space:pre-wrap;">${escapeHtml(it.description)}</p>
      ${it.photoBase64 ? `<img src="${it.photoBase64}" style="max-width:100%; max-height:180px; border-radius:6px; border:1px solid #cbd5e1;">` : ''}
    </div>
  `).join('');

  modalBody.innerHTML = `
    <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:15px;">
      <tr><td style="padding:6px; font-weight:bold; width:35%;">Tòa nhà/Vị trí:</td><td>${escapeHtml(item.building)} - ${escapeHtml(item.roomDetails)}</td></tr>
      <tr><td style="padding:6px; font-weight:bold;">Người kiểm tra:</td><td>${escapeHtml(item.surveyorName)} (${escapeHtml(item.surveyorId)})</td></tr>
      <tr><td style="padding:6px; font-weight:bold;">Thời gian:</td><td>${new Date(item.timestamp).toLocaleString('vi-VN')}</td></tr>
      <tr><td style="padding:6px; font-weight:bold;">Tọa độ GPS:</td><td>Lat: ${item.gpsLocation?.lat || 'N/A'}, Lng: ${item.gpsLocation?.lng || 'N/A'}</td></tr>
      <tr><td style="padding:6px; font-weight:bold;">Đồng bộ Cloud:</td><td>${item.synced ? '✅ Đã đồng bộ' : '⏳ Chưa đồng bộ'}</td></tr>
    </table>
    <h4 style="font-size:14px; color:#1E3A8A; margin-bottom:8px;">Chi tiết các hạng mục kiểm tra:</h4>
    ${itemsHtml}
  `;

  modal.classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('detail-modal').classList.add('hidden');
};

const DELETED_IDS_KEY = 'vku_deleted_survey_ids';

function getDeletedSurveyIds() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function addDeletedSurveyId(id) {
  const ids = getDeletedSurveyIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(ids));
  }
}

window.deleteSurveyItem = async function(id) {
  if (confirm('Bạn có chắc muốn xóa phiếu khảo sát này? Hành động này sẽ xóa đồng bộ vĩnh viễn trên toàn bộ các thiết bị!')) {
    // 1. Delete locally from IndexedDB & record tombstone
    await deleteSurveyFromDB(id);
    addDeletedSurveyId(id);
    await renderDashboard();
    showToast('Đã xóa phiếu khảo sát nội bộ.', 'info');

    // 2. Send DELETE request to Cloud Server & Master Cloud Database
    if (navigator.onLine) {
      try {
        const endpoint = getApiEndpoint();
        logSync(`🗑️ Đang gửi lệnh xóa phiếu [${id}] lên Cloud API...`);
        await deleteCloudSurvey(endpoint, id);
        showToast('✅ Đã xóa vĩnh viễn phiếu khảo sát trên Cloud Server!', 'success');
        logSync(`✅ [Cloud Delete] Đã xóa vĩnh viễn phiếu [${id}] trên Cloud Server.`);
      } catch (err) {
        console.warn('[Delete Sync] Error deleting from Cloud API:', err.message);
        logSync(`⚠️ Lỗi mạng khi xóa phiếu [${id}] trên Cloud: ${err.message}`);
      }
    }
  }
};

// ==========================================================================
// 9. DATA EXPORT & SYNC OPERATIONS
// ==========================================================================
async function exportToCSV() {
  const surveys = await getAllSurveysFromDB();
  if (surveys.length === 0) {
    showToast('Không có dữ liệu để xuất!', 'error');
    return;
  }

  const headers = ['Mã Phiếu', 'Người Kiểm Tra', 'MSSV/ID', 'Tòa Nhà', 'Phòng', 'Hạng Mục', 'Tình Trạng Hạng Mục', 'Mô Tả Hạng Mục', 'Lat GPS', 'Lng GPS', 'Thời Gian', 'Đồng Bộ'];
  const rows = [];

  surveys.forEach(s => {
    (s.items || []).forEach(it => {
      rows.push([
        `"${s.id}"`,
        `"${s.surveyorName.replace(/"/g, '""')}"`,
        `"${s.surveyorId.replace(/"/g, '""')}"`,
        `"${s.building.replace(/"/g, '""')}"`,
        `"${s.roomDetails.replace(/"/g, '""')}"`,
        `"${it.category.replace(/"/g, '""')}"`,
        `"${it.condition}"`,
        `"${it.description.replace(/"/g, '""')}"`,
        `"${s.gpsLocation?.lat || ''}"`,
        `"${s.gpsLocation?.lng || ''}"`,
        `"${s.timestamp}"`,
        `"${s.synced ? 'Co' : 'Khong'}"`
      ]);
    });
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csvContent, `VKU_Field_Survey_Report_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;');
  showToast('Đã xuất file CSV (Excel) chi tiết thành công!', 'success');
}

async function exportToJSON() {
  const surveys = await getAllSurveysFromDB();
  if (surveys.length === 0) {
    showToast('Không có dữ liệu để xuất!', 'error');
    return;
  }

  const jsonContent = JSON.stringify(surveys, null, 2);
  downloadBlob(jsonContent, `VKU_Field_Survey_Backup_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
  showToast('Đã xuất file JSON sao lưu thành công!', 'success');
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DIRECT_CLOUD_FALLBACK_URL = 'https://api.restful-api.dev/objects/ff808181a067127101a067f04e6e039a';

async function fetchCloudSurveys(endpoint) {
  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (data && data.data && Array.isArray(data.data.surveys)) return data.data.surveys;
      }
    }
  } catch (e) {
    console.warn('[Sync Engine] Primary endpoint fetch error:', e.message);
  }

  // Direct Cloud Fallback
  try {
    const fallbackRes = await fetch(DIRECT_CLOUD_FALLBACK_URL, { headers: { 'Accept': 'application/json' } });
    if (fallbackRes.ok) {
      const obj = await fallbackRes.json();
      if (obj && obj.data && Array.isArray(obj.data.surveys)) {
        return obj.data.surveys;
      }
    }
  } catch (err) {
    console.warn('[Sync Engine] Direct cloud fallback error:', err.message);
  }
  return [];
}

async function pushCloudSurvey(endpoint, surveyItem) {
  let isSuccess = false;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(surveyItem)
    });
    if (res.ok || res.status === 200 || res.status === 201) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        isSuccess = true;
      }
    }
  } catch (e) {
    console.warn('[Sync Engine] Primary POST failed:', e.message);
  }

  // Always sync to Direct Master Cloud Database
  try {
    const getRes = await fetch(DIRECT_CLOUD_FALLBACK_URL);
    let currentSurveys = [];
    if (getRes.ok) {
      const obj = await getRes.json();
      currentSurveys = (obj && obj.data && Array.isArray(obj.data.surveys)) ? obj.data.surveys : [];
    }
    const idx = currentSurveys.findIndex(s => s.id === surveyItem.id);
    if (idx >= 0) currentSurveys[idx] = surveyItem;
    else currentSurveys.unshift(surveyItem);

    const putRes = await fetch(DIRECT_CLOUD_FALLBACK_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'VKU_PWA_SURVEYS_DATABASE_V1',
        data: { surveys: currentSurveys }
      })
    });
    if (putRes.ok) isSuccess = true;
  } catch (err) {
    console.warn('[Sync Engine] Master DB push error:', err.message);
  }
  return isSuccess;
}

async function deleteCloudSurvey(endpoint, surveyId) {
  try {
    await fetch(`${endpoint}?id=${encodeURIComponent(surveyId)}`, { method: 'DELETE' });
  } catch (e) {
    /* Ignore */
  }

  try {
    const getRes = await fetch(DIRECT_CLOUD_FALLBACK_URL);
    if (getRes.ok) {
      const obj = await getRes.json();
      let currentSurveys = (obj && obj.data && Array.isArray(obj.data.surveys)) ? obj.data.surveys : [];
      const updated = currentSurveys.filter(s => s.id !== surveyId);
      await fetch(DIRECT_CLOUD_FALLBACK_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'VKU_PWA_SURVEYS_DATABASE_V1',
          data: { surveys: updated }
        })
      });
    }
  } catch (err) {
    console.warn('[Sync Engine] Master DB delete error:', err.message);
  }
}

async function syncData(isSilent = false) {
  const isOnline = navigator.onLine;
  if (!isOnline && !isSimulatedServerActive) {
    if (!isSilent) showToast('Thiết bị đang OFFLINE! Dữ liệu được lưu an toàn tại Hàng chờ Offline (IndexedDB).', 'error');
    if (!isSilent) logSync('Đồng bộ thất bại: Thiết bị chưa có kết nối mạng Internet.');
    return;
  }

  const endpoint = getApiEndpoint();
  if (!isSilent) logSync(`🌐 Bắt đầu đồng bộ 2 chiều (Push & Pull) với Cloud Server API...`);

  let pushedCount = 0;
  let pulledCount = 0;
  const deletedIds = getDeletedSurveyIds();

  // STEP 1: PUSH UNSYNCED LOCAL SURVEYS TO CLOUD
  const localSurveys = await getAllSurveysFromDB();
  const unsynced = localSurveys.filter(s => !s.synced && !deletedIds.includes(s.id));

  if (unsynced.length > 0) {
    if (!isSilent) logSync(`📤 Đang đẩy ${unsynced.length} phiếu từ Hàng chờ Offline lên Cloud...`);
    for (const item of unsynced) {
      const isSuccess = await pushCloudSurvey(endpoint, item);
      if (isSuccess || isSimulatedServerActive) {
        item.synced = true;
        item.syncedAt = new Date().toISOString();
        await saveSurveyToDB(item);
        pushedCount++;
        if (!isSilent) logSync(`✅ [Cloud Push]: Đã đẩy thành công phiếu [${item.id}] lên Cloud API.`);
      }
    }
  }

  // STEP 2: PULL ALL SURVEYS FROM CLOUD API & SYNCHRONIZE DELETIONS
  if (isOnline) {
    if (!isSilent) logSync(`📥 Đang tải danh sách toàn bộ phiếu khảo sát từ Cloud API về thiết bị...`);
    const cloudSurveys = await fetchCloudSurveys(endpoint);
    if (Array.isArray(cloudSurveys)) {
      const cloudSurveyIds = new Set(cloudSurveys.map(s => s.id));

      // A. Remove local synced surveys that were deleted on Cloud by another device
      const currentLocalSurveys = await getAllSurveysFromDB();
      for (const localItem of currentLocalSurveys) {
        if (localItem.synced && !cloudSurveyIds.has(localItem.id)) {
          await deleteSurveyFromDB(localItem.id);
        }
      }

      // B. Merge valid cloud surveys into local IndexedDB (skip locally deleted)
      for (const cloudItem of cloudSurveys) {
        if (cloudItem && cloudItem.id && !deletedIds.includes(cloudItem.id)) {
          cloudItem.synced = true;
          await saveSurveyToDB(cloudItem);
          pulledCount++;
        }
      }
      if (!isSilent) logSync(`✅ [Cloud Pull] Đã tải về và hợp nhất thành công ${cloudSurveys.length} phiếu từ Cloud.`);
    }
  }

  await renderDashboard();

  if (!isSilent) {
    if (pushedCount > 0 || pulledCount > 0) {
      showToast(`✅ Hoàn tất đồng bộ: Đã đẩy ${pushedCount} phiếu mới, hợp nhất ${pulledCount} phiếu từ Cloud!`, 'success');
    } else {
      showToast(`✅ Tất cả dữ liệu khảo sát đã được đồng bộ với Cloud.`, 'info');
    }
  }
}

async function loadSampleData() {
  const sampleItems = [
    {
      id: 'VKU-DEMO-001',
      surveyorName: 'Trần Văn Nam',
      surveyorId: '22IT045',
      building: 'Khu C',
      roomDetails: 'Phòng Lab C204',
      overallCondition: 'danger',
      items: [
        { category: 'Máy tính / Lab', condition: 'danger', description: '3 máy tính bàn số 12, 13, 14 bị hỏng RAM.', photoBase64: null },
        { category: 'Điện & Đèn', condition: 'warning', description: 'Ổ cắm điện góc tường bị lỏng dây.', photoBase64: null }
      ],
      gpsLocation: { lat: '15.975450', lng: '108.253120' },
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
      synced: false
    },
    {
      id: 'VKU-DEMO-002',
      surveyorName: 'Lê Thị Thu',
      surveyorId: '21CB012',
      building: 'Khu B',
      roomDetails: 'Giảng đường B102',
      overallCondition: 'warning',
      items: [
        { category: 'Điều hòa / HVAC', condition: 'warning', description: 'Máy điều hòa chảy nước nhẹ ở góc trái.', photoBase64: null },
        { category: 'Bàn ghế / Nội thất', condition: 'warning', description: '2 bộ bàn ghế bị gãy chân.', photoBase64: null }
      ],
      gpsLocation: { lat: '15.975210', lng: '108.253450' },
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      synced: true
    }
  ];

  for (const item of sampleItems) {
    await saveSurveyToDB(item);
  }

  await renderDashboard();
  showToast('Đã nạp 2 phiếu khảo sát mẫu với nhiều hạng mục!', 'success');
}

function logSync(msg) {
  const logEl = document.getElementById('sync-log');
  if (logEl) {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    logEl.innerHTML += `<div class="log-entry">[${timeStr}] ${escapeHtml(msg)}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function updateStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(estimate => {
      const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
      const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
      const el = document.getElementById('db-usage-estimate');
      if (el) {
        el.innerText = `${usageMB} MB / ${quotaMB} MB khả dụng`;
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
