use std::fs;
use std::path::Path;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

struct CurrentNote(Mutex<Option<String>>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub notes_root: Option<String>,
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            notes_root: None,
            theme: "system".to_string(),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified: u64,
}

fn config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to get app data dir: {e}"))?;
    Ok(data.join("easynote"))
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(config_dir(app)?.join("config.json"))
}

fn load_config(app: &AppHandle) -> AppConfig {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let dir = config_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(config_path(app)?, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    Ok(load_config(&app))
}

#[tauri::command]
fn set_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    save_config(&app, &config)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_as_base64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut buf = String::new();
    buf.push_str("data:");
    // Determine mime type from extension
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };
    buf.push_str(mime);
    buf.push_str(";base64,");
    // Use base64 crate via manual encoding
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i];
        let b1 = if i + 1 < data.len() { data[i + 1] } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] } else { 0 };

        buf.push(CHARS[(b0 >> 2) as usize] as char);
        buf.push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < data.len() {
            buf.push(CHARS[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            buf.push('=');
        }
        if i + 2 < data.len() {
            buf.push(CHARS[(b2 & 0x3f) as usize] as char);
        } else {
            buf.push('=');
        }
        i += 3;
    }
    Ok(buf)
}

#[tauri::command]
fn create_dir_all(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            modified,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn generate_timestamp_name() -> String {
    chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string()
}

#[tauri::command]
fn set_current_note(state: State<CurrentNote>, path: Option<String>) {
    *state.0.lock().unwrap() = path;
}

#[tauri::command]
fn get_current_note(state: State<CurrentNote>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_floating_window(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("floating") {
        let visible = window.is_visible().map_err(|e| e.to_string())?;
        if visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("floating window not found".into())
    }
}

#[tauri::command]
fn hide_floating_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        window.hide().map_err(|e| e.to_string())
    } else {
        Err("floating window not found".into())
    }
}

#[tauri::command]
fn debug_write(msg: String) {
    // Write to Desktop for easy access
    if let Some(home) = std::env::var_os("USERPROFILE") {
        let path = std::path::Path::new(&home).join("Desktop").join("easynote_diag.txt");
        let _ = std::fs::write(&path, msg);
    }
}

fn ensure_quick_notes_folder(app: &AppHandle) -> Result<(), String> {
    let cfg = load_config(app);
    if let Some(root) = cfg.notes_root {
        let quick = Path::new(&root).join("快速笔记");
        if !quick.exists() {
            fs::create_dir_all(&quick).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);

    tauri::Builder::default()
        .manage(CurrentNote(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("floating") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.global_shortcut().register(shortcut)?;
            if let Some(floating) = app.get_webview_window("floating") {
                let _ = floating.hide();
            }
            let _ = ensure_quick_notes_folder(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            read_text_file,
            write_text_file,
            create_dir_all,
            remove_path,
            rename_path,
            list_dir,
            path_exists,
            generate_timestamp_name,
            set_current_note,
            get_current_note,
            toggle_floating_window,
            hide_floating_window,
            write_binary_file,
            read_file_as_base64,
            debug_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
