// STATE MANAGEMENT
const state = {
  activePath: null,
  cookedPath: null,
  selectedFile: null,
  targetMapId: '',
  maps: []
};

// DOM ELEMENTS
const setupScreen = document.getElementById('setup-screen');
const dashboardScreen = document.getElementById('dashboard-screen');

// Setup screen elements
const btnSelectSteam = document.getElementById('btn-select-steam');
const btnSelectEpic = document.getElementById('btn-select-epic');
const btnSelectCustom = document.getElementById('btn-select-custom');
const steamPathStatus = document.getElementById('steam-path-status');
const epicPathStatus = document.getElementById('epic-path-status');
const manualPathForm = document.getElementById('manual-path-form');
const manualPathInput = document.getElementById('manual-path-input');
const setupStatusMessage = document.getElementById('setup-status-message');

// Dashboard elements
const activePathText = document.getElementById('active-path-text');
const btnChangePath = document.getElementById('btn-change-path');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileDetailsCard = document.getElementById('file-details-card');
const fileNameText = document.getElementById('file-name-text');
const fileSizeText = document.getElementById('file-size-text');
const btnClearFile = document.getElementById('btn-clear-file');
const mapTargetSelect = document.getElementById('map-target-select');
const btnReplace = document.getElementById('btn-replace');
const btnRefreshMaps = document.getElementById('btn-refresh-maps');
const mapStatusList = document.getElementById('map-status-list');

// Modal elements
const confirmModal = document.getElementById('confirm-modal');
const modalTitle = document.getElementById('modal-title');
const modalBodyText = document.getElementById('modal-body-text');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const btnModalClose = document.getElementById('btn-modal-close');

// TOAST NOTIFICATIONS
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✅' : '⚠️';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Slide out and remove
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// SETUP STATUS MESSAGE (inline)
function showSetupMsg(message, type = 'error') {
  setupStatusMessage.textContent = message;
  setupStatusMessage.className = `status-msg ${type}`;
  setupStatusMessage.classList.remove('hide');
}

function clearSetupMsg() {
  setupStatusMessage.textContent = '';
  setupStatusMessage.className = 'status-msg hide';
}

// CONFIRMATION MODAL HELPER
let modalCallback = null;

function showConfirmModal(title, text, onConfirm) {
  modalTitle.textContent = title;
  modalBodyText.textContent = text;
  modalCallback = onConfirm;
  confirmModal.classList.remove('hide');
}

function hideConfirmModal() {
  confirmModal.classList.add('hide');
  modalCallback = null;
}

btnModalCancel.addEventListener('click', hideConfirmModal);
btnModalClose.addEventListener('click', hideConfirmModal);
btnModalConfirm.addEventListener('click', () => {
  if (modalCallback) {
    modalCallback();
  }
  hideConfirmModal();
});

// INITIALIZE APP AND CHECK STATUS
async function checkStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();

    // Set Steam path text helper
    if (data.steamExists) {
      btnSelectSteam.classList.remove('disabled');
      steamPathStatus.textContent = 'Default Steam path detected';
      steamPathStatus.style.color = 'var(--accent-green)';
    } else {
      steamPathStatus.textContent = 'Default path not found';
    }

    // Set Epic path text helper
    if (data.epicExists) {
      btnSelectEpic.classList.remove('disabled');
      epicPathStatus.textContent = 'Default Epic path detected';
      epicPathStatus.style.color = 'var(--accent-green)';
    } else {
      epicPathStatus.textContent = 'Default path not found';
    }

    if (data.pathSet) {
      state.activePath = data.rocketLeaguePath;
      state.cookedPath = data.cookedPath;
      showDashboard();
    } else {
      showSetup();
    }
  } catch (error) {
    console.error('Error fetching server status:', error);
    showToast('Failed to connect to the backend server.', 'error');
  }
}

// TOGGLE SCREENS
function showDashboard() {
  setupScreen.classList.add('hide');
  dashboardScreen.classList.remove('hide');
  activePathText.textContent = state.activePath;
  loadMaps();
}

function showSetup() {
  dashboardScreen.classList.add('hide');
  setupScreen.classList.remove('hide');
  clearSetupMsg();
}

// PATH SELECTORS
async function selectPath(type, manualPath = '') {
  clearSetupMsg();
  try {
    const response = await fetch('/api/select-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, manualPath })
    });
    const data = await response.json();

    if (data.success) {
      state.activePath = data.path;
      state.cookedPath = data.cookedPath;
      showToast('Rocket League directory configured successfully!', 'success');
      showDashboard();
    } else {
      showSetupMsg(data.error, 'error');
    }
  } catch (err) {
    console.error(err);
    showSetupMsg('An error occurred during path selection.', 'error');
  }
}

btnSelectSteam.addEventListener('click', () => selectPath('steam'));
btnSelectEpic.addEventListener('click', () => selectPath('epic'));
btnSelectCustom.addEventListener('click', () => selectPath('custom'));

manualPathForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pathVal = manualPathInput.value.trim();
  if (!pathVal) {
    showSetupMsg('Please enter or paste a valid directory path.', 'error');
    return;
  }
  selectPath('custom-manual', pathVal);
});

btnChangePath.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/reset-path', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      state.activePath = null;
      state.cookedPath = null;
      showSetup();
      checkStatus();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to reset path configuration.', 'error');
  }
});

// LOAD MAPS LIST
async function loadMaps() {
  mapStatusList.innerHTML = '<div class="loading-placeholder">Loading map statuses...</div>';
  try {
    const response = await fetch('/api/maps');
    const data = await response.json();

    if (data.maps) {
      state.maps = data.maps;
      renderMaps();
      populateTargetDropdown();
    }
  } catch (error) {
    console.error('Error fetching maps:', error);
    showToast('Failed to retrieve Rocket League maps.', 'error');
  }
}

btnRefreshMaps.addEventListener('click', loadMaps);

// RENDER MAPS SIDEBAR LIST
function renderMaps() {
  mapStatusList.innerHTML = '';
  
  if (state.maps.length === 0) {
    mapStatusList.innerHTML = '<div class="loading-placeholder">No targets available.</div>';
    return;
  }

  state.maps.forEach(map => {
    const item = document.createElement('div');
    item.className = 'map-item-card';

    // Status classes
    const statusClass = map.status.toLowerCase();
    
    // Action content (Restore button only if modded)
    let actionHTML = `<span class="status-badge ${statusClass}">${map.status}</span>`;
    if (map.status === 'Modded') {
      actionHTML = `
        <span class="status-badge ${statusClass}">${map.status}</span>
        <button type="button" class="restore-btn-small" data-map-id="${map.id}">Restore</button>
      `;
    }

    item.innerHTML = `
      <div class="map-item-details">
        <span class="map-name">${map.name}</span>
        <span class="map-file">${map.filename}</span>
      </div>
      <div class="map-item-actions">
        ${actionHTML}
      </div>
    `;

    mapStatusList.appendChild(item);
  });

  // Attach restore button listeners
  const restoreBtns = mapStatusList.querySelectorAll('.restore-btn-small');
  restoreBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mapId = e.target.getAttribute('data-map-id');
      const map = state.maps.find(m => m.id === mapId);
      
      showConfirmModal(
        'Restore Original Map',
        `Are you sure you want to restore the original map for "${map.name}"? This will delete the active custom mod.`,
        () => restoreMap(mapId)
      );
    });
  });
}

// POPULATE DROPDOWN SELECTOR
function populateTargetDropdown() {
  const currentValue = mapTargetSelect.value;
  mapTargetSelect.innerHTML = '<option value="" disabled selected>Select a target map...</option>';

  state.maps.forEach(map => {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = `${map.name} (${map.filename}) [${map.status}]`;
    mapTargetSelect.appendChild(option);
  });

  if (currentValue && state.maps.some(m => m.id === currentValue)) {
    mapTargetSelect.value = currentValue;
    state.targetMapId = currentValue;
  } else {
    state.targetMapId = '';
  }
  checkFormValidity();
}

// RESTORE MAP
async function restoreMap(mapId) {
  try {
    const response = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId })
    });
    const data = await response.json();

    if (data.success) {
      showToast('Original map file restored successfully!', 'success');
      loadMaps();
    } else {
      showToast(data.error || 'Failed to restore map.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while restoring map.', 'error');
  }
}

// DRAG AND DROP FILE HANDLERS
dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

// Drag enter/over transitions
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  }, false);
});

// Drag leave/drop transitions
['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  }, false);
});

// Drop file handler
dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    handleFileSelected(files[0]);
  }
});

function handleFileSelected(file) {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  
  if (ext !== '.upk' && ext !== '.udk') {
    showToast('Invalid file extension. Only .upk or .udk files are supported.', 'error');
    clearSelectedFile();
    return;
  }

  if (file.size === 0) {
    showToast('The uploaded file is empty.', 'error');
    clearSelectedFile();
    return;
  }

  state.selectedFile = file;
  fileNameText.textContent = file.name;
  fileSizeText.textContent = formatBytes(file.size);
  
  fileDetailsCard.classList.remove('hide');
  dropZone.classList.add('hide');
  
  checkFormValidity();
}

function clearSelectedFile() {
  state.selectedFile = null;
  fileInput.value = '';
  fileDetailsCard.classList.add('hide');
  dropZone.classList.remove('hide');
  checkFormValidity();
}

btnClearFile.addEventListener('click', (e) => {
  e.stopPropagation();
  clearSelectedFile();
});

// MAP SELECT EVENT
mapTargetSelect.addEventListener('change', (e) => {
  state.targetMapId = e.target.value;
  checkFormValidity();
});

// FORM VALIDATION
function checkFormValidity() {
  if (state.selectedFile && state.targetMapId) {
    btnReplace.classList.remove('disabled');
    btnReplace.removeAttribute('disabled');
  } else {
    btnReplace.classList.add('disabled');
    btnReplace.setAttribute('disabled', 'true');
  }
}

// REPLACE MAP ACTION
btnReplace.addEventListener('click', () => {
  if (!state.selectedFile || !state.targetMapId) return;

  const targetMap = state.maps.find(m => m.id === state.targetMapId);
  showConfirmModal(
    'Replace Map File',
    `You are replacing "${targetMap.name}" with your custom file "${state.selectedFile.name}". If this is your first replacement, an original game map backup (.bak) will be created automatically. Proceed?`,
    performReplacement
  );
});

async function performReplacement() {
  // Update button state to loading
  btnReplace.classList.add('disabled');
  btnReplace.setAttribute('disabled', 'true');
  const originalText = btnReplace.innerHTML;
  btnReplace.innerHTML = '<span>Uploading & Replacing...</span>';

  const formData = new FormData();
  formData.append('mapId', state.targetMapId);
  formData.append('customUpk', state.selectedFile);

  try {
    const response = await fetch('/api/replace', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      showToast('Custom map replaced successfully!', 'success');
      clearSelectedFile();
      loadMaps();
    } else {
      showToast(data.error || 'Failed to replace map.', 'error');
      // Restore button state
      btnReplace.classList.remove('disabled');
      btnReplace.removeAttribute('disabled');
      btnReplace.innerHTML = originalText;
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during replacement.', 'error');
    // Restore button state
    btnReplace.classList.remove('disabled');
    btnReplace.removeAttribute('disabled');
    btnReplace.innerHTML = originalText;
  }
}

// UTILITIES
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// START STATUS CHECK
checkStatus();
