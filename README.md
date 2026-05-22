# Rocket League UPK Replacer (RLUPKR)

A premium, high-performance local desktop GUI tool designed to replace Rocket League game files (`.upk` / `.udk`). It allows you to customize maps, car bodies, decals, wheels, boosts, and other game assets with ease. 

Built using **Tauri v2**, **Rust**, and **Vanilla HTML/CSS/JS** for an instantaneous, lightweight, and completely local user experience.

---

## 🚀 Download Stable Releases

You can download the compiled standalone binaries and installers directly from the latest GitHub Release:

👉 **[Latest Release (v0.1.0)](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/tag/v0.1.0)**

* **[Raw Standalone Executable (rlupkr.exe)](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/rlupkr.exe)** - No installation required, simply download and double-click to run.
* **[Windows Setup Installer (NSIS)](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/RLUPKR_0.1.0_x64-setup.exe)** - Lightweight setup wizard installer.
* **[Windows WiX Installer (MSI)](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/RLUPKR_0.1.0_x64_en-US.msi)** - MSI installer package.

---

## ✨ Features

- **Tauri Standalone Desktop App**: Native OS webview integration. Zero Node.js runtime required at runtime, minimal memory footprint, and launch times under 1 second.
- **Auto-Detection**: Scans default Steam and Epic Games installation locations on startup.
- **Search & Categories**: Easily find targeted files by name, or browse through grouped categories (Maps, Decals, Antennas, Wheels, Boosts, etc.) with custom tags.
- **Drag-and-Drop Swapping**: Drop custom `.upk` or `.udk` mod files directly onto the target zone to queue them for replacement.
- **Notes & Comment Tracker**: Save custom notes on active mods to easily track what has been replaced.
- **Safety Backups & Restores**: Automatically creates `.rlupk.bak` backups before modifying any game files, letting you revert changes in one click.

---

## 🛠️ Installation & Build from Source

If you prefer to compile RLUPKR yourself or make modifications:

### Prerequisites
1. **Rust / Cargo**: Install from [rustup.rs](https://rustup.rs/)
2. **Node.js**: Install from [nodejs.org](https://nodejs.org/) (needed only for dev tooling and compiling)

### 1. Run Developer Server
Start the application in local development mode with hot-reloading:
```bash
npm install
npm run tauri dev
```

### 2. Build Standalone Executables
Compile the Rust code with release-level optimizations and package into standalone binaries:
```bash
npm run tauri build
```

The compiled binaries will be output to:
- **Standalone EXE**: `src-tauri/target/release/rlupkr.exe`
- **WiX MSI Installer**: `src-tauri/target/release/bundle/msi/RLUPKR_0.1.0_x64_en-US.msi`
- **NSIS Installer**: `src-tauri/target/release/bundle/nsis/RLUPKR_0.1.0_x64-setup.exe`

---

## 🔒 Security & Local Execution

- **Zero External Network Dependencies**: The app operates completely offline and client-side on your local machine.
- **Path Traversal Protection**: The Rust backend enforces strict directory validation. Mod replacements can only touch files located under the configured `CookedPCConsole` root directory.
