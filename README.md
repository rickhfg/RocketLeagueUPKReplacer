# Rocket League UPK Replacer (RLUPKR)

A local GUI tool designed to replace Rocket League game files (`.upk` / `.udk`). It allows you to customize maps, car bodies, decals, wheels, boosts, and other game assets.

## Features

- **Search & Categories**: Browse indexed files by categories or search with smart tokenized autocomplete.
- **Auto-Detection**: Scans default Steam and Epic Games installation locations on startup.
- **Safety Backups & Restores**: Automatically creates `.rlupk.bak` backups and restores files in one click.
- **Local Security**: Uses a secure API session token and binds strictly to `127.0.0.1`.

## Installation & Usage (Desktop App)

The application has been migrated to a native standalone desktop app using Tauri (v2) and Rust. It runs in a native window, loads instantly, and does not require Node.js or an external browser at runtime.

### Prerequisites

To build or run the application from source, you will need:
1. **Rust / Cargo**: Install from [rustup.rs](https://rustup.rs/)
2. **Node.js**: Install from [nodejs.org](https://nodejs.org/) (needed only for dev tooling and packaging)

### Run Development Version

To start the desktop application in developer mode:

```bash
npm install
npx tauri dev
```

### Build Standalone Executable

To compile the application into a single standalone `.exe` file:

```bash
npx tauri build
```

Once built, the standalone executable will be located at:
`src-tauri/target/release/RLUPKR.exe` (or inside `src-tauri/target/release/bundle/nsis/` as an installer).

