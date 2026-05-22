import express from 'express';
import multer from 'multer';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Generate secure random API session token
const API_TOKEN = crypto.randomBytes(32).toString('hex');

// Token verification middleware
function verifyToken(req, res, next) {
  const token = req.headers['x-rlupk-token'] || req.query.token;
  if (token !== API_TOKEN) {
    return res.status(403).json({ success: false, error: 'Unauthorized API request.' });
  }
  next();
}

app.use(express.json());

// Serve index.html dynamically to inject the API token
app.get('/', (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    html = html.replace('__API_TOKEN__', API_TOKEN);
    res.send(html);
  } catch (e) {
    console.error('Error loading index.html:', e);
    res.status(500).send('Error loading page');
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer config for handling .upk files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.upk' || ext === '.udk') {
      cb(null, true);
    } else {
      cb(new Error('Only .upk or .udk files are allowed.'));
    }
  }
});

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
let activePickerProcess = null;

// Default paths to check
const STEAM_DEFAULT = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague';
const EPIC_DEFAULT = 'C:\\Program Files\\Epic Games\\rocketleague';

// Quick select options for common maps
const QUICK_TARGETS = [
  { id: 'underpass', name: 'Labs Underpass', filename: 'Labs_Underpass_P.upk' },
  { id: 'cosmic', name: 'Labs Cosmic', filename: 'Labs_Cosmic_P.upk' },
  { id: 'doublegoal', name: 'Labs Double Goal', filename: 'Labs_DoubleGoal_P.upk' },
  { id: 'octagon', name: 'Labs Octagon', filename: 'Labs_Octagon_P.upk' },
  { id: 'pillars', name: 'Labs Pillars', filename: 'Labs_Pillars_P.upk' },
  { id: 'utopia', name: 'Labs Utopia Retro', filename: 'Labs_Utopia_P.upk' },
  { id: 'badlands', name: 'Wasteland (Badlands)', filename: 'Wasteland_P.upk' },
  { id: 'tokyounderpass', name: 'Tokyo Underpass', filename: 'NeoTokyo_Underpass_P.upk' }
];

// Memory cache for all game packages (.upk / .udk) inside CookedPCConsole
let cachedCookedFiles = [];

// Recursive directory walk
function walkDir(dir, fileList = [], extensionFilter = ['.upk', '.udk']) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);
      
      // Skip symbolic links & junctions to prevent loops and permission failures
      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        walkDir(filePath, fileList, extensionFilter);
      } else {
        const ext = path.extname(file).toLowerCase();
        // Index only matching extensions, exclude backup files (*.rlupk.bak)
        if (extensionFilter.includes(ext) && !file.toLowerCase().endsWith('.rlupk.bak')) {
          fileList.push(filePath);
        }
      }
    }
  } catch (e) {
    // Gracefully ignore directory read or permission issues
  }
  return fileList;
}

// Function to refresh the memory index of game files
function refreshCachedFiles(cookedPath) {
  if (!cookedPath) {
    cachedCookedFiles = [];
    return;
  }
  try {
    console.log(`[Cache] Indexing game files under: ${cookedPath}`);
    const start = Date.now();
    const absolutePaths = walkDir(cookedPath, [], ['.upk', '.udk']);
    // Store relative paths with consistent forward slashes for matching ease
    cachedCookedFiles = absolutePaths.map(p => {
      const rel = path.relative(cookedPath, p);
      return rel.replace(/\\/g, '/');
    });
    console.log(`[Cache] Found ${cachedCookedFiles.length} files in ${Date.now() - start}ms`);
  } catch (e) {
    console.error('[Cache] Error walking CookedPCConsole:', e);
    cachedCookedFiles = [];
  }
}

// Helper to check if a path is a valid Rocket League or CookedPCConsole path
function getCookedPath(basePath) {
  if (!basePath) return null;
  
  // Normalize and resolve path
  const resolved = path.resolve(basePath);
  
  if (resolved.toLowerCase().endsWith(path.join('tagame', 'cookedpcconsole').toLowerCase())) {
    if (fs.existsSync(resolved)) return resolved;
  }
  
  const subPath = path.join(resolved, 'TAGame', 'CookedPCConsole');
  if (fs.existsSync(subPath)) {
    return subPath;
  }
  
  return null;
}

// Read settings
function readSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading settings.json:', e);
    }
  }
  return { rocketLeaguePath: null };
}

// Write settings
function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing settings.json:', e);
  }
}

// Helper: safe resolve path inside CookedPCConsole (prevents directory traversal)
function getSafeTargetPath(cookedPath, relativePath) {
  if (!relativePath) {
    throw new Error('Relative path is required.');
  }
  const normalized = relativePath.replace(/\\/g, '/');
  const resolvedTarget = path.resolve(path.join(cookedPath, normalized));
  const resolvedCooked = path.resolve(cookedPath);
  
  if (!resolvedTarget.startsWith(resolvedCooked)) {
    throw new Error('Directory traversal attempt detected.');
  }
  return resolvedTarget;
}

// Initialize file cache on server startup if path is already set
const initialSettings = readSettings();
const initialCooked = getCookedPath(initialSettings.rocketLeaguePath);
if (initialCooked) {
  refreshCachedFiles(initialCooked);
}

// Route: Get Status
app.get('/api/status', verifyToken, (req, res) => {
  const settings = readSettings();
  const activePath = settings.rocketLeaguePath;
  const cookedPath = getCookedPath(activePath);

  const steamExists = !!getCookedPath(STEAM_DEFAULT);
  const epicExists = !!getCookedPath(EPIC_DEFAULT);

  res.json({
    pathSet: !!cookedPath,
    rocketLeaguePath: activePath || null,
    cookedPath: cookedPath || null,
    steamExists,
    epicExists,
    defaultSteamPath: STEAM_DEFAULT,
    defaultEpicPath: EPIC_DEFAULT,
    indexedFilesCount: cachedCookedFiles.length
  });
});

// Route: Select Path
app.post('/api/select-path', verifyToken, async (req, res) => {
  const { type, manualPath } = req.body;
  let targetPath = null;

  try {
    if (type === 'steam') {
      targetPath = STEAM_DEFAULT;
    } else if (type === 'epic') {
      targetPath = EPIC_DEFAULT;
    } else if (type === 'custom-manual') {
      targetPath = manualPath;
    } else if (type === 'custom') {
      // If there is an active folder picker running, terminate it first to prevent hangs
      if (activePickerProcess) {
        try {
          activePickerProcess.kill();
          activePickerProcess = null;
        } catch (e) {
          console.error('Error killing active picker process:', e);
        }
      }

      // Trigger PowerShell folder selector via temporary file
      const tempScriptPath = path.join(TEMP_DIR, `picker_${Date.now()}.ps1`);
      const psScript = `
        $sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();';
        $type = Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "Win32" -PassThru;
        $hwnd = $type::GetForegroundWindow();

        $shell = New-Object -ComObject Shell.Application;
        $folder = $shell.BrowseForFolder($hwnd.ToInt32(), "Select Rocket League Installation Folder (containing TAGame)", 64, 0);
        if ($folder) {
            Write-Output $folder.Self.Path;
        }
      `;
      
      try {
        fs.writeFileSync(tempScriptPath, psScript, 'utf8');

        const runPs = () => new Promise((resolve, reject) => {
          const child = exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err, stdout, stderr) => {
            activePickerProcess = null;
            if (err) {
              if (err.killed) resolve(''); // Resolve empty if killed by a new picker request
              else reject(err);
            } else if (stderr.trim()) {
              reject(new Error(stderr.trim()));
            } else {
              resolve(stdout.trim());
            }
          });
          activePickerProcess = child;
        });

        targetPath = await runPs();
      } finally {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      }

      if (!targetPath) {
        return res.json({ success: false, error: 'Folder selection cancelled.' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid path type.' });
    }

    const cooked = getCookedPath(targetPath);
    if (!cooked) {
      return res.json({ 
        success: false, 
        error: 'Invalid Rocket League directory. Make sure the folder contains TAGame\\CookedPCConsole.' 
      });
    }

    writeSettings({ rocketLeaguePath: targetPath });
    console.log(`[Path Configured] Path set to: ${targetPath}`);
    
    // Build file index
    refreshCachedFiles(cooked);

    res.json({ success: true, path: targetPath, cookedPath: cooked });
  } catch (error) {
    console.error('Error selecting path:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Reset Path
app.post('/api/reset-path', verifyToken, (req, res) => {
  writeSettings({ rocketLeaguePath: null });
  console.log('[Path Reset] Installation path cleared.');
  
  // Clear the cache
  cachedCookedFiles = [];

  res.json({ success: true });
});

// Route: List Quick Targets
app.get('/api/quick-targets', verifyToken, (req, res) => {
  res.json({ targets: QUICK_TARGETS });
});

// Category classification rules
const CATEGORY_RULES = [
  {
    id: 'maps',
    name: 'Maps',
    match: (name, relPath) => name.endsWith('_p.upk') || name.startsWith('labs_') || name.startsWith('neotokyo_') || name.startsWith('wasteland_') || relPath.toLowerCase().includes('/maps/')
  },
  {
    id: 'bodies',
    name: 'Car Bodies',
    match: (name) => name.startsWith('body_') || name.includes('_body_')
  },
  {
    id: 'decals',
    name: 'Decals & Skins',
    match: (name) => name.startsWith('skin_') || name.includes('_skin_') || name.startsWith('decal_') || name.includes('_decal_')
  },
  {
    id: 'wheels',
    name: 'Wheels',
    match: (name) => name.startsWith('wheel_') || name.includes('_wheel_')
  },
  {
    id: 'boosts',
    name: 'Boosts',
    match: (name) => name.startsWith('boost_') || name.includes('_boost_')
  },
  {
    id: 'toppers',
    name: 'Toppers & Hats',
    match: (name) => name.startsWith('hat_') || name.startsWith('topper_') || name.includes('_hat_') || name.includes('_topper_')
  },
  {
    id: 'antennas',
    name: 'Antennas & Flags',
    match: (name) => name.startsWith('antenna_') || name.startsWith('flag_') || name.startsWith('countryflag_') || name.startsWith('streamerflag_') || name.includes('_antenna_') || name.includes('_flag_')
  },
  {
    id: 'explosions',
    name: 'Goal Explosions',
    match: (name) => name.startsWith('explosion_') || name.includes('_explosion_')
  },
  {
    id: 'banners',
    name: 'Player Banners',
    match: (name) => name.startsWith('playerbanner_') || name.includes('_playerbanner_')
  },
  {
    id: 'engineaudio',
    name: 'Engine Audios',
    match: (name) => name.startsWith('engineaudio_') || name.includes('_engineaudio_')
  },
  {
    id: 'anthems',
    name: 'Player Anthems & Audio',
    match: (name) => name.startsWith('anthem_') || name.startsWith('album_') || name.startsWith('audio_') || name.endsWith('_sfx.upk')
  }
];

function getFileCategory(relPath) {
  const name = path.basename(relPath).toLowerCase();
  const rule = CATEGORY_RULES.find(r => r.match(name, relPath));
  return rule ? rule.id : 'misc';
}

// Route: Get Categories List with counts
app.get('/api/categories', verifyToken, (req, res) => {
  const counts = {
    maps: 0,
    bodies: 0,
    decals: 0,
    wheels: 0,
    boosts: 0,
    toppers: 0,
    antennas: 0,
    explosions: 0,
    banners: 0,
    engineaudio: 0,
    anthems: 0,
    misc: 0
  };

  cachedCookedFiles.forEach(relPath => {
    const cat = getFileCategory(relPath);
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const categories = [
    { id: 'maps', name: 'Maps', count: counts.maps },
    { id: 'bodies', name: 'Car Bodies', count: counts.bodies },
    { id: 'decals', name: 'Decals & Skins', count: counts.decals },
    { id: 'wheels', name: 'Wheels', count: counts.wheels },
    { id: 'boosts', name: 'Boosts', count: counts.boosts },
    { id: 'toppers', name: 'Toppers & Hats', count: counts.toppers },
    { id: 'antennas', name: 'Antennas & Flags', count: counts.antennas },
    { id: 'explosions', name: 'Goal Explosions', count: counts.explosions },
    { id: 'banners', name: 'Player Banners', count: counts.banners },
    { id: 'engineaudio', name: 'Engine Audios', count: counts.engineaudio },
    { id: 'anthems', name: 'Player Anthems & Audio', count: counts.anthems },
    { id: 'misc', name: 'Miscellaneous', count: counts.misc }
  ];

  res.json({ categories });
});

// Route: Get Files for a Category
app.get('/api/files-by-category', verifyToken, (req, res) => {
  const categoryId = req.query.category;
  if (!categoryId) {
    return res.status(400).json({ error: 'Category parameter is required.' });
  }

  const files = cachedCookedFiles
    .filter(relPath => getFileCategory(relPath) === categoryId)
    .map(relPath => ({
      relativePath: relPath,
      filename: path.basename(relPath)
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  res.json({ category: categoryId, count: files.length, files });
});


// Route: Search Files Autocomplete
app.get('/api/search', verifyToken, (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  
  if (!query) {
    return res.json({ query, count: 0, results: [] });
  }

  // Tokenize the query by whitespace
  const tokens = query.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) {
    return res.json({ query, count: 0, results: [] });
  }

  const results = cachedCookedFiles
    .filter(relPath => {
      const lowerPath = relPath.toLowerCase();
      // Ensure every token is present in the path
      return tokens.every(token => lowerPath.includes(token));
    })
    .slice(0, 50)
    .map(relPath => ({
      relativePath: relPath,
      filename: path.basename(relPath),
      extension: path.extname(relPath).toLowerCase()
    }));

  res.json({
    query,
    count: results.length,
    results
  });
});

// Route: Reindex Files
app.post('/api/reindex', verifyToken, (req, res) => {
  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);
  
  if (!cookedPath) {
    return res.status(400).json({ success: false, error: 'Rocket League path is not configured.' });
  }

  refreshCachedFiles(cookedPath);
  res.json({ success: true, indexedFilesCount: cachedCookedFiles.length });
});

// Route: Native Target File Picker
app.post('/api/pick-target-file', verifyToken, async (req, res) => {
  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);

  if (!cookedPath) {
    return res.status(400).json({ success: false, error: 'Rocket League path not configured.' });
  }

  if (activePickerProcess) {
    try {
      activePickerProcess.kill();
      activePickerProcess = null;
    } catch (e) {
      console.error('Error killing active picker process:', e);
    }
  }

  const tempScriptPath = path.join(TEMP_DIR, `file_picker_${Date.now()}.ps1`);
  
  // PowerShell OpenFileDialog using NativeWindow owner HWND to force foreground focus
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();';
    $type = Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "Win32" -PassThru;
    $hwnd = $type::GetForegroundWindow();

    $owner = New-Object -TypeName System.Windows.Forms.NativeWindow;
    $owner.AssignHandle($hwnd);

    $dialog = New-Object System.Windows.Forms.OpenFileDialog;
    $dialog.InitialDirectory = "${cookedPath.replace(/\\/g, '\\\\')}";
    $dialog.Filter = "Rocket League Package Files (*.upk;*.udk)|*.upk;*.udk";
    $dialog.Title = "Select Rocket League Target File to Replace";

    $result = $dialog.ShowDialog($owner);
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $dialog.FileName;
    }
  `;

  try {
    fs.writeFileSync(tempScriptPath, psScript, 'utf8');

    const runPs = () => new Promise((resolve, reject) => {
      const child = exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err, stdout, stderr) => {
        activePickerProcess = null;
        if (err) {
          if (err.killed) resolve('');
          else reject(err);
        } else if (stderr.trim()) {
          reject(new Error(stderr.trim()));
        } else {
          resolve(stdout.trim());
        }
      });
      activePickerProcess = child;
    });

    const selectedFile = await runPs();
    if (!selectedFile) {
      return res.json({ success: false, error: 'File selection cancelled.' });
    }

    const resolvedTarget = path.resolve(selectedFile);
    const resolvedCooked = path.resolve(cookedPath);

    // Safety checks
    if (!resolvedTarget.startsWith(resolvedCooked)) {
      return res.status(400).json({ success: false, error: 'Selected file is outside of CookedPCConsole.' });
    }

    const ext = path.extname(selectedFile).toLowerCase();
    if (ext !== '.upk' && ext !== '.udk') {
      return res.status(400).json({ success: false, error: 'Only .upk or .udk target files can be selected.' });
    }

    if (selectedFile.toLowerCase().endsWith('.rlupk.bak')) {
      return res.status(400).json({ success: false, error: 'You cannot select a backup file as a target.' });
    }

    const relPath = path.relative(cookedPath, selectedFile).replace(/\\/g, '/');
    res.json({
      success: true,
      relativePath: relPath,
      filename: path.basename(selectedFile)
    });
  } catch (error) {
    console.error('Error in file picker:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
});

// Route: Get Active Mods
app.get('/api/mods', verifyToken, (req, res) => {
  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);
  
  if (!cookedPath) {
    return res.status(400).json({ error: 'Rocket League path is not configured.' });
  }

  try {
    const backupPaths = walkDir(cookedPath, [], ['.bak']);
    const rlupkBackups = backupPaths.filter(p => p.toLowerCase().endsWith('.rlupk.bak'));

    const mods = rlupkBackups.map(backupPath => {
      const relativeBackup = path.relative(cookedPath, backupPath).replace(/\\/g, '/');
      const relativeTarget = relativeBackup.substring(0, relativeBackup.length - '.rlupk.bak'.length);
      const targetAbs = path.join(cookedPath, relativeTarget);

      let currentSize = 0;
      let backupSize = 0;
      let modifiedAt = null;

      try {
        const targetStat = fs.statSync(targetAbs);
        currentSize = targetStat.size;
        modifiedAt = targetStat.mtime;
      } catch (e) {}

      try {
        const backupStat = fs.statSync(backupPath);
        backupSize = backupStat.size;
      } catch (e) {}

      return {
        relativePath: relativeTarget,
        filename: path.basename(relativeTarget),
        backupPath: relativeBackup,
        currentSize,
        backupSize,
        modifiedAt
      };
    });

    res.json({ count: mods.length, mods });
  } catch (error) {
    console.error('Error listing active mods:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Replace Target File
app.post('/api/replace', verifyToken, (req, res) => {
  upload.single('customUpk')(req, res, async (err) => {
    if (err) {
      console.error('[Upload Error]', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }

    const { relativePath } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'No custom mod file uploaded.' });
    }

    if (!relativePath) {
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      return res.status(400).json({ success: false, error: 'No target relative path specified.' });
    }

    const settings = readSettings();
    const cookedPath = getCookedPath(settings.rocketLeaguePath);

    if (!cookedPath) {
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      return res.status(400).json({ success: false, error: 'Rocket League path not configured.' });
    }

    try {
      const targetPath = getSafeTargetPath(cookedPath, relativePath);
      const backupPath = getSafeTargetPath(cookedPath, `${relativePath}.rlupk.bak`);

      // Verify original target has valid extension
      const targetExt = path.extname(targetPath).toLowerCase();
      if (targetExt !== '.upk' && targetExt !== '.udk') {
        if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        return res.status(400).json({ success: false, error: 'Target file must be a .upk or .udk package.' });
      }

      // Verify upload has matching extension to target
      const uploadedExt = path.extname(uploadedFile.originalname).toLowerCase();
      if (targetExt !== uploadedExt) {
        if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        return res.status(400).json({ 
          success: false, 
          error: `Extension mismatch. Custom file (${uploadedExt}) must match the target file extension (${targetExt}).` 
        });
      }

      // 1. Create backup if it does NOT exist already
      if (!fs.existsSync(backupPath)) {
        if (fs.existsSync(targetPath)) {
          fs.copyFileSync(targetPath, backupPath);
          console.log(`[Backup Created] Backed up ${relativePath} to ${relativePath}.rlupk.bak`);
        } else {
          // If original doesn't exist, we can't restore it, but let's allow replacing it if indexing cached it
          console.warn(`[Backup Warning] Target file ${relativePath} was missing, skipping backup.`);
        }
      } else {
        console.log(`[Backup Intact] Backup already exists for ${relativePath}. Preserving original.`);
      }

      // 2. Atomic copy using .tmp rename
      const tempDestPath = getSafeTargetPath(cookedPath, `${relativePath}.tmp`);
      fs.copyFileSync(uploadedFile.path, tempDestPath);
      
      // Rename temp to target
      fs.renameSync(tempDestPath, targetPath);
      console.log(`[Replacement Successful] Atomic write complete for ${relativePath}`);

      // 3. Cleanup temp upload
      fs.unlinkSync(uploadedFile.path);

      res.json({ success: true });
    } catch (error) {
      console.error('[Replacement Failed]', error);
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Route: Restore Original File
app.post('/api/restore', verifyToken, (req, res) => {
  const { relativePath } = req.body;

  if (!relativePath) {
    return res.status(400).json({ success: false, error: 'No target relative path specified.' });
  }

  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);

  if (!cookedPath) {
    return res.status(400).json({ success: false, error: 'Rocket League path not configured.' });
  }

  try {
    const targetPath = getSafeTargetPath(cookedPath, relativePath);
    const backupPath = getSafeTargetPath(cookedPath, `${relativePath}.rlupk.bak`);

    if (!fs.existsSync(backupPath)) {
      return res.status(400).json({ success: false, error: `No backup file (.rlupk.bak) found for ${relativePath}.` });
    }

    // Delete active modded file
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    // Restore backup back to original name (which also deletes the backup file since we rename it)
    fs.renameSync(backupPath, targetPath);
    console.log(`[Restore Successful] Restored original ${relativePath} from backup.`);

    res.json({ success: true });
  } catch (error) {
    console.error('[Restore Failed]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listen strictly on localhost
app.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`[Server Started] Rocket League UPK Replacer is running at ${url}`);
  
  // Auto-launch the web browser
  open(url).catch(err => {
    console.error('Could not launch browser automatically:', err);
  });
});
