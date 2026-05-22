# Rocket League UPK Replacer (RLUPKR)

A desktop tool to replace and manage custom `.upk` and `.udk` files in Rocket League (for custom maps, decals, car bodies, wheels, boosts, etc.).

## Downloads

Download the latest version from the [Releases](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/tag/v0.1.0) page:
* [rlupkr.exe](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/rlupkr.exe) (Standalone executable, no install required)
* [RLUPKR_0.1.0_x64-setup.exe](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/RLUPKR_0.1.0_x64-setup.exe) (Standard installer)
* [RLUPKR_0.1.0_x64_en-US.msi](https://github.com/rickhfg/RocketLeagueUPKReplacer/releases/download/v0.1.0/RLUPKR_0.1.0_x64_en-US.msi) (MSI installer)

## Features

* **Auto-detects game paths**: Automatically finds default Steam and Epic Games install folders.
* **Search & Categories**: Filter target files by name or select a category (Wheels, Decals, Maps, etc.).
* **Drag and Drop**: Drag a custom `.upk`/`.udk` file and swap it with the target game file.
* **Backups & Restores**: Keeps original backups (`.rlupk.bak`) and lets you revert changes in one click.
* **Mod tracker**: Lists active replacements and lets you save notes on them.

## Building from source

You need [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/) installed.

```bash
# install dependencies
npm install

# run in development mode
npm run tauri dev

# build release binaries
npm run tauri build
```

The output executables will be built under `src-tauri/target/release/`.
