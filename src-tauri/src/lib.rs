use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub rocket_league_path: Option<String>,
    pub mod_comments: HashMap<String, String>,
}

pub struct AppState {
    pub cached_files: Mutex<Vec<String>>,
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    config_dir.push("settings.json");
    Ok(config_dir)
}

fn read_settings(app: &AppHandle) -> Settings {
    let path = match get_settings_path(app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to get settings path: {}", e);
            return Settings::default();
        }
    };
    if !path.exists() {
        return Settings::default();
    }
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Settings::default(),
    };
    serde_json::from_reader(file).unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = get_settings_path(app)?;
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, settings).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_cooked_path(base_path: &str) -> Option<PathBuf> {
    if base_path.is_empty() {
        return None;
    }
    let base = PathBuf::from(base_path);
    if base.ends_with("CookedPCConsole") && base.exists() {
        return Some(base);
    }
    let cooked = base.join("TAGame").join("CookedPCConsole");
    if cooked.exists() {
        return Some(cooked);
    }
    let cooked = base.join("CookedPCConsole");
    if cooked.exists() {
        return Some(cooked);
    }
    None
}

fn scan_cooked_files(cooked_path: &std::path::Path) -> Vec<String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(cooked_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "upk" || ext_lower == "udk" {
                    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                        if !name.to_lowercase().ends_with(".rlupk.bak") {
                            if let Ok(rel) = path.strip_prefix(cooked_path) {
                                if let Some(rel_str) = rel.to_str() {
                                    files.push(rel_str.replace('\\', "/"));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    files.sort();
    files
}

fn get_file_category(rel_path: &str) -> &'static str {
    let lower_path = rel_path.to_lowercase();
    let name = match std::path::Path::new(&lower_path).file_name().and_then(|f| f.to_str()) {
        Some(n) => n,
        None => return "misc",
    };

    if name.ends_with("_p.upk") || name.starts_with("labs_") || name.starts_with("neotokyo_") || name.starts_with("wasteland_") || lower_path.contains("/maps/") {
        "maps"
    } else if name.starts_with("body_") || name.contains("_body_") {
        "bodies"
    } else if name.starts_with("skin_") || name.contains("_skin_") || name.starts_with("decal_") || name.contains("_decal_") {
        "decals"
    } else if name.starts_with("wheel_") || name.contains("_wheel_") {
        "wheels"
    } else if name.starts_with("boost_") || name.contains("_boost_") {
        "boosts"
    } else if name.starts_with("hat_") || name.starts_with("topper_") || name.contains("_hat_") || name.contains("_topper_") {
        "toppers"
    } else if name.starts_with("antenna_") || name.starts_with("flag_") || name.starts_with("countryflag_") || name.starts_with("streamerflag_") || name.contains("_antenna_") || name.contains("_flag_") {
        "antennas"
    } else if name.starts_with("explosion_") || name.contains("_explosion_") {
        "explosions"
    } else if name.starts_with("playerbanner_") || name.contains("_playerbanner_") {
        "banners"
    } else if name.starts_with("engineaudio_") || name.contains("_engineaudio_") {
        "engineaudio"
    } else if name.starts_with("anthem_") || name.starts_with("album_") || name.starts_with("audio_") || name.ends_with("_sfx.upk") {
        "anthems"
    } else {
        "misc"
    }
}

const STEAM_DEFAULT: &str = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague";
const EPIC_DEFAULT: &str = "C:\\Program Files\\Epic Games\\rocketleague";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
    pub path_set: bool,
    pub rocket_league_path: Option<String>,
    pub cooked_path: Option<String>,
    pub steam_exists: bool,
    pub epic_exists: bool,
    pub default_steam_path: String,
    pub default_epic_path: String,
    pub indexed_files_count: usize,
}

#[tauri::command]
fn get_status(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<StatusInfo, String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path;
    let cooked = path.as_ref().and_then(|p| get_cooked_path(p));
    let total_files = state.cached_files.lock().unwrap().len();
    
    let steam_exists = get_cooked_path(STEAM_DEFAULT).is_some();
    let epic_exists = get_cooked_path(EPIC_DEFAULT).is_some();

    Ok(StatusInfo {
        path_set: path.is_some() && cooked.is_some(),
        rocket_league_path: path,
        cooked_path: cooked.map(|p| p.to_string_lossy().to_string().replace('\\', "/")),
        steam_exists,
        epic_exists,
        default_steam_path: STEAM_DEFAULT.to_string(),
        default_epic_path: EPIC_DEFAULT.to_string(),
        indexed_files_count: total_files,
    })
}

#[tauri::command]
fn save_settings(app: AppHandle, state: tauri::State<'_, AppState>, path: String) -> Result<StatusInfo, String> {
    let mut settings = read_settings(&app);
    
    if path.is_empty() {
        settings.rocket_league_path = None;
        write_settings(&app, &settings)?;
        {
            let mut cached = state.cached_files.lock().unwrap();
            cached.clear();
        }
        let steam_exists = get_cooked_path(STEAM_DEFAULT).is_some();
        let epic_exists = get_cooked_path(EPIC_DEFAULT).is_some();
        return Ok(StatusInfo {
            path_set: false,
            rocket_league_path: None,
            cooked_path: None,
            steam_exists,
            epic_exists,
            default_steam_path: STEAM_DEFAULT.to_string(),
            default_epic_path: EPIC_DEFAULT.to_string(),
            indexed_files_count: 0,
        });
    }
    
    let cooked = get_cooked_path(&path).ok_or_else(|| {
        "Invalid Rocket League directory. Make sure the folder contains TAGame\\CookedPCConsole.".to_string()
    })?;
    
    settings.rocket_league_path = Some(path.clone());
    write_settings(&app, &settings)?;
    
    let files = scan_cooked_files(&cooked);
    let total_files = files.len();
    {
        let mut cached = state.cached_files.lock().unwrap();
        *cached = files;
    }
    
    let steam_exists = get_cooked_path(STEAM_DEFAULT).is_some();
    let epic_exists = get_cooked_path(EPIC_DEFAULT).is_some();

    Ok(StatusInfo {
        path_set: true,
        rocket_league_path: Some(path),
        cooked_path: Some(cooked.to_string_lossy().to_string().replace('\\', "/")),
        steam_exists,
        epic_exists,
        default_steam_path: STEAM_DEFAULT.to_string(),
        default_epic_path: EPIC_DEFAULT.to_string(),
        indexed_files_count: total_files,
    })
}

#[tauri::command]
fn reindex_files(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path.ok_or_else(|| "No Rocket League path configured.".to_string())?;
    let cooked = get_cooked_path(&path).ok_or_else(|| "Invalid Rocket League path configured.".to_string())?;
    
    let files = scan_cooked_files(&cooked);
    let count = files.len();
    let mut cached = state.cached_files.lock().unwrap();
    *cached = files;
    
    Ok(count)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub relative_path: String,
    pub filename: String,
}

#[tauri::command]
fn search_files(state: tauri::State<'_, AppState>, query: String) -> Result<Vec<FileEntry>, String> {
    let query_lower = query.trim().to_lowercase();
    if query_lower.is_empty() {
        return Ok(Vec::new());
    }
    
    let tokens: Vec<&str> = query_lower.split_whitespace().collect();
    if tokens.is_empty() {
        return Ok(Vec::new());
    }
    
    let cached = state.cached_files.lock().unwrap();
    let mut results = Vec::new();
    
    for rel_path in cached.iter() {
        let lower_path = rel_path.to_lowercase();
        if tokens.iter().all(|token| lower_path.contains(token)) {
            let path_obj = std::path::Path::new(rel_path);
            let filename = path_obj.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            
            results.push(FileEntry {
                relative_path: rel_path.clone(),
                filename,
            });
            
            if results.len() >= 50 {
                break;
            }
        }
    }
    
    Ok(results)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
    pub id: String,
    pub name: String,
    pub count: usize,
}

#[tauri::command]
fn get_categories(state: tauri::State<'_, AppState>) -> Result<Vec<CategoryInfo>, String> {
    let mut counts = HashMap::new();
    let cat_ids = vec![
        "maps", "bodies", "decals", "wheels", "boosts",
        "toppers", "antennas", "explosions", "banners",
        "engineaudio", "anthems", "misc"
    ];
    
    for id in &cat_ids {
        counts.insert(id.to_string(), 0);
    }
    
    let cached = state.cached_files.lock().unwrap();
    for rel_path in cached.iter() {
        let cat = get_file_category(rel_path);
        *counts.entry(cat.to_string()).or_insert(0) += 1;
    }
    
    let categories = vec![
        CategoryInfo { id: "maps".to_string(), name: "Maps".to_string(), count: counts["maps"] },
        CategoryInfo { id: "bodies".to_string(), name: "Car Bodies".to_string(), count: counts["bodies"] },
        CategoryInfo { id: "decals".to_string(), name: "Decals & Skins".to_string(), count: counts["decals"] },
        CategoryInfo { id: "wheels".to_string(), name: "Wheels".to_string(), count: counts["wheels"] },
        CategoryInfo { id: "boosts".to_string(), name: "Boosts".to_string(), count: counts["boosts"] },
        CategoryInfo { id: "toppers".to_string(), name: "Toppers & Hats".to_string(), count: counts["toppers"] },
        CategoryInfo { id: "antennas".to_string(), name: "Antennas & Flags".to_string(), count: counts["antennas"] },
        CategoryInfo { id: "explosions".to_string(), name: "Goal Explosions".to_string(), count: counts["explosions"] },
        CategoryInfo { id: "banners".to_string(), name: "Player Banners".to_string(), count: counts["banners"] },
        CategoryInfo { id: "engineaudio".to_string(), name: "Engine Audios".to_string(), count: counts["engineaudio"] },
        CategoryInfo { id: "anthems".to_string(), name: "Player Anthems & Audio".to_string(), count: counts["anthems"] },
        CategoryInfo { id: "misc".to_string(), name: "Miscellaneous".to_string(), count: counts["misc"] },
    ];
    
    Ok(categories)
}

#[tauri::command]
fn get_files_by_category(state: tauri::State<'_, AppState>, category: String) -> Result<Vec<FileEntry>, String> {
    let cached = state.cached_files.lock().unwrap();
    let mut files = Vec::new();
    
    for rel_path in cached.iter() {
        if get_file_category(rel_path) == category {
            let path_obj = std::path::Path::new(rel_path);
            let filename = path_obj.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            
            files.push(FileEntry {
                relative_path: rel_path.clone(),
                filename,
            });
        }
    }
    
    files.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    
    Ok(files)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub relative_path: String,
    pub filename: String,
    pub backup_path: String,
    pub current_size: u64,
    pub backup_size: u64,
    pub modified_at: String,
    pub comment: String,
}

#[tauri::command]
fn get_mods(app: AppHandle) -> Result<Vec<ModEntry>, String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path.ok_or_else(|| "No path set.".to_string())?;
    let cooked = get_cooked_path(&path).ok_or_else(|| "Invalid path.".to_string())?;
    
    let mut mods = Vec::new();
    let mod_comments = settings.mod_comments;
    
    for entry in WalkDir::new(&cooked)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let file_path = entry.path();
            if let Some(name) = file_path.file_name().and_then(|s| s.to_str()) {
                if name.to_lowercase().ends_with(".rlupk.bak") {
                    if let Ok(rel_backup) = file_path.strip_prefix(&cooked) {
                        let rel_backup_str = rel_backup.to_string_lossy().replace('\\', "/");
                        
                        let rel_target_str = if rel_backup_str.to_lowercase().ends_with(".rlupk.bak") {
                            rel_backup_str[..rel_backup_str.len() - 10].to_string()
                        } else {
                            rel_backup_str.clone()
                        };
                        
                        let target_path = cooked.join(&rel_target_str);
                        let backup_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let current_size = std::fs::metadata(&target_path).map(|m| m.len()).unwrap_or(0);
                        
                        let modified_at = entry.metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .map(|time| {
                                let datetime: chrono::DateTime<chrono::Utc> = time.into();
                                datetime.to_rfc3339()
                            })
                            .unwrap_or_else(|| "".to_string());
                        
                        let comment = mod_comments.get(&rel_target_str).cloned().unwrap_or_default();
                        
                        let filename = std::path::Path::new(&rel_target_str)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string();
                        
                        mods.push(ModEntry {
                            relative_path: rel_target_str,
                            filename,
                            backup_path: rel_backup_str,
                            current_size,
                            backup_size,
                            modified_at,
                            comment,
                        });
                    }
                }
            }
        }
    }
    
    Ok(mods)
}

#[tauri::command]
fn update_mod_comment(app: AppHandle, relative_path: String, comment: String) -> Result<(), String> {
    let mut settings = read_settings(&app);
    let comment_trimmed = comment.trim();
    if comment_trimmed.is_empty() {
        settings.mod_comments.remove(&relative_path);
    } else {
        settings.mod_comments.insert(relative_path, comment_trimmed.to_string());
    }
    write_settings(&app, &settings)?;
    Ok(())
}

#[tauri::command]
fn replace_file(app: AppHandle, relative_path: String, custom_file_path: String) -> Result<(), String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path.ok_or_else(|| "No path set.".to_string())?;
    let cooked = get_cooked_path(&path).ok_or_else(|| "Invalid path.".to_string())?;
    
    let target_path = cooked.join(&relative_path);
    let target_path_abs = target_path.canonicalize().unwrap_or(target_path.clone());
    let cooked_abs = cooked.canonicalize().unwrap_or(cooked.clone());
    
    if !target_path_abs.starts_with(&cooked_abs) {
        return Err("Path traversal warning: target path is outside CookedPCConsole!".to_string());
    }
    
    let target_ext = target_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let custom_path = std::path::Path::new(&custom_file_path);
    let custom_ext = custom_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    
    if target_ext != "upk" && target_ext != "udk" {
        return Err("Invalid target file extension. Only .upk and .udk files are supported.".to_string());
    }
    if custom_ext != target_ext {
        return Err(format!("Extension mismatch. Custom file has .{} but target requires .{}", custom_ext, target_ext));
    }
    
    if !custom_path.exists() {
        return Err("Custom file does not exist.".to_string());
    }
    
    let backup_path = target_path.with_extension(format!("{}.rlupk.bak", target_ext));
    
    if !backup_path.exists() {
        if target_path.exists() {
            std::fs::rename(&target_path, &backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;
        } else {
            return Err("Target game file does not exist in game folder.".to_string());
        }
    }
    
    let temp_path = target_path.with_extension("tmp");
    std::fs::copy(custom_path, &temp_path).map_err(|e| format!("Failed to copy file to game folder: {}", e))?;
    std::fs::rename(temp_path, &target_path).map_err(|e| format!("Failed to replace game file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn restore_file(app: AppHandle, relative_path: String) -> Result<(), String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path.ok_or_else(|| "No path set.".to_string())?;
    let cooked = get_cooked_path(&path).ok_or_else(|| "Invalid path.".to_string())?;
    
    let target_path = cooked.join(&relative_path);
    let target_path_abs = target_path.canonicalize().unwrap_or(target_path.clone());
    let cooked_abs = cooked.canonicalize().unwrap_or(cooked.clone());
    
    if !target_path_abs.starts_with(&cooked_abs) {
        return Err("Path traversal warning: target path is outside CookedPCConsole!".to_string());
    }
    
    let target_ext = target_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let backup_path = target_path.with_extension(format!("{}.rlupk.bak", target_ext));
    
    if !backup_path.exists() {
        return Err("Backup file does not exist.".to_string());
    }
    
    std::fs::rename(&backup_path, &target_path).map_err(|e| format!("Failed to restore backup: {}", e))?;
    
    let mut settings = read_settings(&app);
    if settings.mod_comments.remove(&relative_path).is_some() {
        write_settings(&app, &settings)?;
    }
    
    Ok(())
}

#[tauri::command]
fn pick_target_file(app: AppHandle) -> Result<Option<String>, String> {
    let settings = read_settings(&app);
    let path = settings.rocket_league_path.as_ref().ok_or_else(|| "No path set.".to_string())?;
    let cooked = get_cooked_path(path).ok_or_else(|| "Invalid path.".to_string())?;
    
    let dialog = rfd::FileDialog::new()
        .set_directory(&cooked)
        .add_filter("UPK/UDK files", &["upk", "udk"]);
        
    let result = dialog.pick_file();
    
    if let Some(file_path) = result {
        let file_path_abs = file_path.canonicalize().unwrap_or(file_path.clone());
        let cooked_abs = cooked.canonicalize().unwrap_or(cooked.clone());
        
        if !file_path_abs.starts_with(&cooked_abs) {
            return Err("Selected file is outside the CookedPCConsole game directory!".to_string());
        }
        
        if let Ok(rel) = file_path.strip_prefix(&cooked) {
            if let Some(rel_str) = rel.to_str() {
                return Ok(Some(rel_str.replace('\\', "/")));
            }
        }
        return Err("Failed to resolve relative path of target.".to_string());
    }
    
    Ok(None)
}

#[tauri::command]
fn pick_rl_folder() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .set_title("Select Rocket League Installation Folder");
        
    let result = dialog.pick_folder();
    
    if let Some(folder_path) = result {
        return Ok(Some(folder_path.to_string_lossy().to_string().replace('\\', "/")));
    }
    
    Ok(None)
}

#[tauri::command]
fn pick_custom_file() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("UPK/UDK files", &["upk", "udk"]);
        
    let result = dialog.pick_file();
    
    if let Some(file_path) = result {
        return Ok(Some(file_path.to_string_lossy().to_string().replace('\\', "/")));
    }
    
    Ok(None)
}

#[tauri::command]
fn log_to_backend(message: String) {
    println!("[JS LOG] {}", message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
      cached_files: Mutex::new(Vec::new()),
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      let app_handle = app.handle();
      let settings = read_settings(app_handle);
      if let Some(path) = settings.rocket_league_path {
        if let Some(cooked) = get_cooked_path(&path) {
          let files = scan_cooked_files(&cooked);
          let state = app.state::<AppState>();
          let mut cached = state.cached_files.lock().unwrap();
          *cached = files;
        }
      }
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_status,
      save_settings,
      reindex_files,
      search_files,
      get_categories,
      get_files_by_category,
      get_mods,
      update_mod_comment,
      replace_file,
      restore_file,
      pick_target_file,
      pick_custom_file,
      pick_rl_folder,
      log_to_backend
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
