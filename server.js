import express from 'express';
import multer from 'multer';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
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

const TARGET_MAPS = [
  { id: 'underpass', name: 'Labs Underpass', filename: 'Labs_Underpass_P.upk' },
  { id: 'cosmic', name: 'Labs Cosmic', filename: 'Labs_Cosmic_P.upk' },
  { id: 'doublegoal', name: 'Labs Double Goal', filename: 'Labs_DoubleGoal_P.upk' },
  { id: 'octagon', name: 'Labs Octagon', filename: 'Labs_Octagon_P.upk' },
  { id: 'pillars', name: 'Labs Pillars', filename: 'Labs_Pillars_P.upk' },
  { id: 'utopia', name: 'Labs Utopia Retro', filename: 'Labs_Utopia_P.upk' },
  { id: 'badlands', name: 'Wasteland (Badlands)', filename: 'Wasteland_P.upk' },
  { id: 'tokyounderpass', name: 'Tokyo Underpass', filename: 'NeoTokyo_Underpass_P.upk' }
];

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
function getSafeTargetMapPath(cookedPath, filename) {
  const resolvedTarget = path.resolve(path.join(cookedPath, filename));
  const resolvedCooked = path.resolve(cookedPath);
  
  if (!resolvedTarget.startsWith(resolvedCooked)) {
    throw new Error('Directory traversal attempt detected.');
  }
  return resolvedTarget;
}

// Route: Get Status
app.get('/api/status', (req, res) => {
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
    defaultEpicPath: EPIC_DEFAULT
  });
});

// Route: Select Path
app.post('/api/select-path', async (req, res) => {
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

    res.json({ success: true, path: targetPath, cookedPath: cooked });
  } catch (error) {
    console.error('Error selecting path:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Reset Path
app.post('/api/reset-path', (req, res) => {
  writeSettings({ rocketLeaguePath: null });
  console.log('[Path Reset] Installation path cleared.');
  res.json({ success: true });
});

// Route: List Maps
app.get('/api/maps', (req, res) => {
  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);

  if (!cookedPath) {
    return res.status(400).json({ error: 'Rocket League path is not configured.' });
  }

  const results = TARGET_MAPS.map(map => {
    try {
      const mainPath = getSafeTargetMapPath(cookedPath, map.filename);
      const backupPath = getSafeTargetMapPath(cookedPath, `${map.filename}.bak`);

      const mainExists = fs.existsSync(mainPath);
      const backupExists = fs.existsSync(backupPath);

      let status = 'Original';
      if (backupExists) {
        status = 'Modded';
      } else if (!mainExists) {
        status = 'Missing';
      }

      return {
        ...map,
        exists: mainExists,
        backupExists,
        status
      };
    } catch (e) {
      return {
        ...map,
        exists: false,
        backupExists: false,
        status: 'Error'
      };
    }
  });

  res.json({ maps: results });
});

// Route: Replace Map
app.post('/api/replace', (req, res) => {
  upload.single('customUpk')(req, res, async (err) => {
    if (err) {
      console.error('[Upload Error]', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }

    const { mapId } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'No custom map file uploaded.' });
    }

    const settings = readSettings();
    const cookedPath = getCookedPath(settings.rocketLeaguePath);

    if (!cookedPath) {
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      return res.status(400).json({ success: false, error: 'Rocket League path not configured.' });
    }

    const mapInfo = TARGET_MAPS.find(m => m.id === mapId);
    if (!mapInfo) {
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      return res.status(400).json({ success: false, error: 'Invalid target map ID.' });
    }

    try {
      const targetPath = getSafeTargetMapPath(cookedPath, mapInfo.filename);
      const backupPath = getSafeTargetMapPath(cookedPath, `${mapInfo.filename}.bak`);

      // 1. Backup if backup does NOT exist
      if (!fs.existsSync(backupPath)) {
        if (fs.existsSync(targetPath)) {
          fs.copyFileSync(targetPath, backupPath);
          console.log(`[Backup Created] Backed up original ${mapInfo.filename} to ${mapInfo.filename}.bak`);
        } else {
          console.warn(`[Backup Warning] Original file ${mapInfo.filename} was missing, skipping backup.`);
        }
      } else {
        console.log(`[Backup Intact] Backup already exists for ${mapInfo.filename}. Preserving it.`);
      }

      // 2. Atomic copy using .tmp rename
      const tempDestPath = getSafeTargetMapPath(cookedPath, `${mapInfo.filename}.tmp`);
      fs.copyFileSync(uploadedFile.path, tempDestPath);
      
      // Rename temp to final
      fs.renameSync(tempDestPath, targetPath);
      console.log(`[Replacement Successful] Atomic write complete for ${mapInfo.filename}`);

      // 3. Cleanup temp uploaded file
      fs.unlinkSync(uploadedFile.path);

      res.json({ success: true });
    } catch (error) {
      console.error('[Replacement Failed]', error);
      if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Route: Restore Map
app.post('/api/restore', (req, res) => {
  const { mapId } = req.body;

  const settings = readSettings();
  const cookedPath = getCookedPath(settings.rocketLeaguePath);

  if (!cookedPath) {
    return res.status(400).json({ success: false, error: 'Rocket League path not configured.' });
  }

  const mapInfo = TARGET_MAPS.find(m => m.id === mapId);
  if (!mapInfo) {
    return res.status(400).json({ success: false, error: 'Invalid target map ID.' });
  }

  try {
    const targetPath = getSafeTargetMapPath(cookedPath, mapInfo.filename);
    const backupPath = getSafeTargetMapPath(cookedPath, `${mapInfo.filename}.bak`);

    if (!fs.existsSync(backupPath)) {
      return res.status(400).json({ success: false, error: 'No backup file (.bak) found for this map.' });
    }

    // Delete modded map if exists
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    // Rename backup to original filename
    fs.renameSync(backupPath, targetPath);
    console.log(`[Restore Successful] Restored original ${mapInfo.filename} from backup.`);

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
