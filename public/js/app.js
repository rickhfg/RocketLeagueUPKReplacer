// STATE MANAGEMENT
const state = {
  activePath: null,
  cookedPath: null,
  selectedFile: null,
  selectedTarget: null,
  mods: []
};

// API TOKEN RETRIEVAL
const apiToken = document.querySelector('meta[name="api-token"]')?.getAttribute('content') || '';

// API FETCH WRAPPER
async function apiFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    'X-RLUPK-Token': apiToken
  };
  return fetch(url, options);
}

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

// Dashboard path displays
const activePathText = document.getElementById('active-path-text');
const btnChangePath = document.getElementById('btn-change-path');

// Drag and drop custom file elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileDetailsCard = document.getElementById('file-details-card');
const fileNameText = document.getElementById('file-name-text');
const fileSizeText = document.getElementById('file-size-text');
const btnClearFile = document.getElementById('btn-clear-file');

// Autocomplete target search elements
const targetSearchInput = document.getElementById('target-search-input');
const btnBrowseTarget = document.getElementById('btn-browse-target');
const searchResultsList = document.getElementById('search-results-list');
const quickTargetChips = document.getElementById('quick-target-chips');

// Categorized selector DOM elements
const tabSearch = document.getElementById('tab-search');
const tabCategory = document.getElementById('tab-category');
const methodSearchContainer = document.getElementById('method-search-container');
const methodCategoryContainer = document.getElementById('method-category-container');
const categorySelect = document.getElementById('category-select');
const fileSelect = document.getElementById('file-select');

// Selected target card details
const selectedTargetCard = document.getElementById('selected-target-card');
const targetFilenameDisplay = document.getElementById('target-filename-display');
const targetPathDisplay = document.getElementById('target-path-display');
const btnClearTarget = document.getElementById('btn-clear-target');

// Replace button action
const btnReplace = document.getElementById('btn-replace');

// Active Replacements Sidebar
const modsCountBadge = document.getElementById('mods-count-badge');
const btnRefreshMods = document.getElementById('btn-refresh-mods');
const modsStatusList = document.getElementById('mods-status-list');

// Confirmation modal elements
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
  const icon = type === 'error' ? '⚠️' : '✅';
  setupStatusMessage.innerHTML = `<span class="msg-icon">${icon}</span><span class="msg-text">${message}</span>`;
  setupStatusMessage.className = `status-msg ${type}`;
  setupStatusMessage.classList.remove('hide');
}

// CLEAR SETUP MESSAGE
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
    const response = await apiFetch('/api/status');
    const data = await response.json();

    // Check Steam location status
    if (data.steamExists) {
      btnSelectSteam.classList.remove('disabled');
      steamPathStatus.textContent = 'Default Steam path detected';
      steamPathStatus.style.color = 'var(--accent-green)';
    } else {
      steamPathStatus.textContent = 'Default path not found';
    }

    // Check Epic games location status
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
  loadQuickTargets();
  loadMods();
  loadCategories();
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
    const response = await apiFetch('/api/select-path', {
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
    const response = await apiFetch('/api/reset-path', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      state.activePath = null;
      state.cookedPath = null;
      resetTargetSelection();
      showSetup();
      checkStatus();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to reset path configuration.', 'error');
  }
});

// LOAD QUICK TARGETS CHIPS
async function loadQuickTargets() {
  try {
    const response = await apiFetch('/api/quick-targets');
    const data = await response.json();

    quickTargetChips.innerHTML = '';
    if (data.targets && data.targets.length > 0) {
      data.targets.forEach(target => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-btn';
        btn.textContent = target.name;
        btn.addEventListener('click', () => {
          selectTarget({
            relativePath: target.filename,
            filename: target.filename
          });
        });
        quickTargetChips.appendChild(btn);
      });
    } else {
      quickTargetChips.innerHTML = '<span class="text-muted">No quick targets available</span>';
    }
  } catch (e) {
    console.error('Error fetching quick targets:', e);
  }
}

// TARGET AUTOCOMPLETE SEARCH WITH DEBOUNCE
let searchTimeout = null;
let searchResults = [];
let activeSearchIndex = -1;

targetSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = targetSearchInput.value.trim();
  if (!query) {
    hideSuggestions();
    return;
  }
  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 250);
});

async function performSearch(query) {
  try {
    const response = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    searchResults = data.results || [];
    activeSearchIndex = -1;
    renderSuggestions();
  } catch (e) {
    console.error('Error fetching search autocomplete:', e);
  }
}

function renderSuggestions() {
  searchResultsList.innerHTML = '';
  if (searchResults.length === 0) {
    searchResultsList.innerHTML = '<div class="suggestion-no-results">No indexed package files match</div>';
    searchResultsList.classList.remove('hide');
    return;
  }

  searchResults.forEach((result, idx) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    if (idx === activeSearchIndex) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <span class="suggestion-filename">${result.filename}</span>
      <span class="suggestion-path">${result.relativePath}</span>
    `;

    item.addEventListener('click', () => {
      selectTarget(result);
    });

    searchResultsList.appendChild(item);
  });

  searchResultsList.classList.remove('hide');
}

function hideSuggestions() {
  searchResultsList.classList.add('hide');
  searchResults = [];
  activeSearchIndex = -1;
}

// Keyboard Navigation for Autocomplete Dropdown
targetSearchInput.addEventListener('keydown', (e) => {
  if (searchResultsList.classList.contains('hide')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSearchIndex = (activeSearchIndex + 1) % searchResults.length;
    renderSuggestions();
    scrollActiveSuggestionIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSearchIndex = (activeSearchIndex - 1 + searchResults.length) % searchResults.length;
    renderSuggestions();
    scrollActiveSuggestionIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSearchIndex >= 0 && activeSearchIndex < searchResults.length) {
      selectTarget(searchResults[activeSearchIndex]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideSuggestions();
  }
});

function scrollActiveSuggestionIntoView() {
  const activeItem = searchResultsList.querySelector('.suggestion-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

// Close suggestions on outside clicks
document.addEventListener('click', (e) => {
  if (!targetSearchInput.contains(e.target) && !searchResultsList.contains(e.target)) {
    hideSuggestions();
  }
});

// SELECT TARGET HANDLER
function selectTarget(target, fromDropdown = false) {
  state.selectedTarget = target;

  targetFilenameDisplay.textContent = target.filename;
  targetPathDisplay.textContent = `TAGame/CookedPCConsole/${target.relativePath}`;
  
  selectedTargetCard.classList.remove('hide');
  targetSearchInput.value = ''; // Reset input text
  hideSuggestions();

  // If selection came from search or quick select, reset the categorized dropdowns to default state
  if (!fromDropdown) {
    categorySelect.value = '';
    fileSelect.innerHTML = '<option value="" disabled selected>Select File...</option>';
    fileSelect.disabled = true;
  }

  checkFormValidity();
}

function resetTargetSelection() {
  state.selectedTarget = null;
  selectedTargetCard.classList.add('hide');
  targetSearchInput.value = '';
  categorySelect.value = '';
  fileSelect.innerHTML = '<option value="" disabled selected>Select File...</option>';
  fileSelect.disabled = true;
  checkFormValidity();
}

// Clear target handler
btnClearTarget.addEventListener('click', resetTargetSelection);

// BROWSE TARGET NATIVELY (Windows Dialog)
btnBrowseTarget.addEventListener('click', async () => {
  try {
    btnBrowseTarget.classList.add('disabled');
    btnBrowseTarget.setAttribute('disabled', 'true');
    
    const response = await apiFetch('/api/pick-target-file', { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      selectTarget({
        relativePath: data.relativePath,
        filename: data.filename
      });
      showToast('Selected file target successfully!', 'success');
    } else if (data.error && data.error !== 'File selection cancelled.') {
      showToast(data.error, 'error');
    }
  } catch (e) {
    console.error('Error during native target picker:', e);
    showToast('Failed to execute file picker dialog.', 'error');
  } finally {
    btnBrowseTarget.classList.remove('disabled');
    btnBrowseTarget.removeAttribute('disabled');
  }
});

// LOAD ACTIVE MODS LIST
async function loadMods() {
  modsStatusList.innerHTML = '<div class="loading-placeholder">Loading active replacements...</div>';
  try {
    const response = await apiFetch('/api/mods');
    const data = await response.json();

    if (response.ok && data.mods !== undefined) {
      state.mods = data.mods;
      modsCountBadge.textContent = data.count;
      renderMods();
    } else {
      showToast(data.error || 'Failed to retrieve active replacements.', 'error');
    }
  } catch (error) {
    console.error('Error loading mods:', error);
    showToast('Failed to check mod directory status.', 'error');
  }
}

// HTML escape utility
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// RENDER ACTIVE MODS IN SIDEBAR
function renderMods() {
  modsStatusList.innerHTML = '';

  if (state.mods.length === 0) {
    modsStatusList.innerHTML = '<div class="loading-placeholder">No active replacements.</div>';
    return;
  }

  state.mods.forEach(mod => {
    const item = document.createElement('div');
    item.className = 'map-item-card';

    const hasComment = !!mod.comment;

    item.innerHTML = `
      <div class="map-item-details">
        <span class="map-name">${mod.filename}</span>
        <span class="map-file" title="${mod.relativePath}">${mod.relativePath}</span>
        <div class="mod-comment-wrapper" data-rel-path="${mod.relativePath}">
          ${hasComment 
            ? `<span class="mod-comment-text" title="Click to edit comment">${escapeHtml(mod.comment)}</span>` 
            : `<button type="button" class="add-comment-btn">+ Add note</button>`
          }
        </div>
      </div>
      <div class="map-item-actions">
        <span class="status-badge modded">Modded</span>
        <button type="button" class="restore-btn-small" data-rel-path="${mod.relativePath}">Restore</button>
      </div>
    `;

    modsStatusList.appendChild(item);

    // Bind inline note editors
    const commentWrapper = item.querySelector('.mod-comment-wrapper');
    const commentTextEl = commentWrapper.querySelector('.mod-comment-text');
    const addCommentBtn = commentWrapper.querySelector('.add-comment-btn');

    const startEditing = () => {
      const currentVal = mod.comment || '';
      commentWrapper.innerHTML = `
        <div class="mod-comment-edit-group">
          <input type="text" class="mod-comment-input" value="${escapeHtml(currentVal)}" placeholder="Describe this mod..." maxlength="100" />
          <button type="button" class="save-comment-btn" title="Save note">✓</button>
          <button type="button" class="cancel-comment-btn" title="Cancel">✗</button>
        </div>
      `;

      const input = commentWrapper.querySelector('.mod-comment-input');
      const saveBtn = commentWrapper.querySelector('.save-comment-btn');
      const cancelBtn = commentWrapper.querySelector('.cancel-comment-btn');

      input.focus();
      input.select();

      const save = async () => {
        const newVal = input.value.trim();
        if (newVal === currentVal) {
          renderMods();
          return;
        }
        try {
          const res = await apiFetch('/api/mod-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relativePath: mod.relativePath, comment: newVal })
          });
          if (res.ok) {
            mod.comment = newVal;
            showToast('Note updated!', 'success');
          } else {
            showToast('Failed to update note.', 'error');
          }
        } catch (e) {
          console.error(e);
          showToast('Failed to update note.', 'error');
        }
        loadMods();
      };

      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
      });

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderMods();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          renderMods();
        }
      });
    };

    if (commentTextEl) {
      commentTextEl.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditing();
      });
    }

    if (addCommentBtn) {
      addCommentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditing();
      });
    }
  });

  // Attach restore action listeners
  const restoreBtns = modsStatusList.querySelectorAll('.restore-btn-small');
  restoreBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const relPath = e.target.getAttribute('data-rel-path');
      const mod = state.mods.find(m => m.relativePath === relPath);

      showConfirmModal(
        'Restore Original Package',
        `Are you sure you want to restore the original game file for "${mod.filename}"? This will delete your custom mod.`,
        () => restoreMod(relPath)
      );
    });
  });
}

// RESTORE ORIGINAL FILE HANDLER
async function restoreMod(relativePath) {
  try {
    const response = await apiFetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath })
    });
    const data = await response.json();

    if (data.success) {
      showToast('Original package file restored!', 'success');
      loadMods();
    } else {
      showToast(data.error || 'Failed to restore file.', 'error');
    }
  } catch (err) {
    console.error('Error during restore call:', err);
    showToast('Network error restoring package.', 'error');
  }
}

btnRefreshMods.addEventListener('click', loadMods);

// DRAG AND DROP FILE HANDLERS
dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

// Drag enter/over animations
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  }, false);
});

// Drag leave/drop cleanup
['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  }, false);
});

// Handle dropped files
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

// FORM VALIDATION
function checkFormValidity() {
  if (state.selectedFile && state.selectedTarget) {
    btnReplace.classList.remove('disabled');
    btnReplace.removeAttribute('disabled');
  } else {
    btnReplace.classList.add('disabled');
    btnReplace.setAttribute('disabled', 'true');
  }
}

// REPLACE ACTION
btnReplace.addEventListener('click', () => {
  if (!state.selectedFile || !state.selectedTarget) return;

  showConfirmModal(
    'Replace Game File',
    `You are replacing target file "${state.selectedTarget.filename}" with custom mod file "${state.selectedFile.name}". If this is your first replacement, an original game file backup (.bak) will be created automatically. Proceed?`,
    performReplacement
  );
});

async function performReplacement() {
  // Update button loading state
  btnReplace.classList.add('disabled');
  btnReplace.setAttribute('disabled', 'true');
  const originalText = btnReplace.innerHTML;
  btnReplace.innerHTML = '<span>Uploading & Replacing...</span>';

  const formData = new FormData();
  formData.append('relativePath', state.selectedTarget.relativePath);
  formData.append('customUpk', state.selectedFile);

  try {
    const response = await apiFetch('/api/replace', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      showToast('Custom mod file applied successfully!', 'success');
      clearSelectedFile();
      resetTargetSelection();
      loadMods();
    } else {
      showToast(data.error || 'Failed to replace file.', 'error');
    }
  } catch (err) {
    console.error('Error during replacement POST:', err);
    showToast('Network error during file replacement.', 'error');
  } finally {
    // Restore button state
    btnReplace.classList.remove('disabled');
    btnReplace.removeAttribute('disabled');
    btnReplace.innerHTML = originalText;
    checkFormValidity();
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

// CATEGORIZED SELECTION LOGIC
async function loadCategories() {
  try {
    const response = await apiFetch('/api/categories');
    const data = await response.json();

    categorySelect.innerHTML = '<option value="" disabled selected>Select Category...</option>';
    if (data.categories) {
      data.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.name} (${cat.count})`;
        categorySelect.appendChild(option);
      });
    }
  } catch (e) {
    console.error('Error loading categories:', e);
    showToast('Failed to load target categories.', 'error');
  }
}

// Category Change Listener
categorySelect.addEventListener('change', async () => {
  const selectedCat = categorySelect.value;
  if (!selectedCat) return;

  fileSelect.disabled = true;
  fileSelect.innerHTML = '<option value="" disabled selected>Loading files...</option>';

  try {
    const response = await apiFetch(`/api/files-by-category?category=${selectedCat}`);
    const data = await response.json();

    fileSelect.innerHTML = '<option value="" disabled selected>Select File...</option>';
    if (data.files && data.files.length > 0) {
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ relativePath: file.relativePath, filename: file.filename });
        option.textContent = file.filename;
        fileSelect.appendChild(option);
      });
      fileSelect.disabled = false;
    } else {
      fileSelect.innerHTML = '<option value="" disabled selected>No files in this category</option>';
      fileSelect.disabled = true;
    }
  } catch (e) {
    console.error('Error loading files by category:', e);
    showToast('Failed to load category files.', 'error');
    fileSelect.innerHTML = '<option value="" disabled selected>Error loading files</option>';
    fileSelect.disabled = true;
  }
});

// File Change Listener
fileSelect.addEventListener('change', () => {
  const val = fileSelect.value;
  if (!val) return;

  try {
    const fileData = JSON.parse(val);
    selectTarget(fileData, true);
  } catch (e) {
    console.error('Error parsing selected file value:', e);
  }
});

// TAB SWAP EVENT LISTENERS
tabSearch.addEventListener('click', () => {
  tabSearch.classList.add('active');
  tabCategory.classList.remove('active');
  methodSearchContainer.classList.remove('hide');
  methodCategoryContainer.classList.add('hide');
});

tabCategory.addEventListener('click', () => {
  tabCategory.classList.add('active');
  tabSearch.classList.remove('active');
  methodCategoryContainer.classList.remove('hide');
  methodSearchContainer.classList.add('hide');
});

// START STATUS CHECK
checkStatus();
