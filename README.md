# Rocket League UPK Replacer (RLUPKR)

An ultra-snappy, modern, dark-themed local GUI tool designed to replace Rocket League map files (`.upk`) with custom maps (such as workshop or custom training maps).

## Features

- **Dark Vibe Styling**: A sleek dark mode UI with glassmorphism and neon glows (electric blue and rocket orange).
- **Auto-Detection**: Scans default Steam and Epic Games installation locations on startup.
- **Native Folder Browser**: Click "Custom Location" to open a native Windows folder browser (powered by PowerShell) for complex or symlinked installations.
- **Persistent Path**: Saves your validated folder selection to a local `settings.json` file so you only have to configure it once.
- **Safety Backups**: Automatically backs up original game map files (`.upk` to `.upk.bak`) on the first replacement and preserves them securely without overwriting on subsequent updates.
- **Atomic Replacement**: Custom maps are written atomically via temporary copies to ensure that game files are never corrupted if an upload or write is interrupted.
- **Directory Traversal Guard**: Backend validators check target paths to ensure writes remain strictly inside the `CookedPCConsole` subdirectory.
- **Local Security**: Express server binds strictly to the localhost address (`127.0.0.1`) on port `3000` to prevent access from external devices.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed (recommended version 18+).

1. Clone or download this project.
2. In the project root directory, install dependencies:
   ```bash
   npm install
   ```

## Running the Application

To start the local server and automatically open the application in your default web browser:

```bash
npm start
```

If the browser does not open automatically, navigate to [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Tech Stack

- **Backend**: Node.js, Express, Multer, Open
- **Frontend**: Vanilla HTML5, CSS3 Grid/Flexbox, ES6+ Javascript (async/await, drag-and-drop, fetch API)
- **Native Dialogs**: Integrated Windows shell via PowerShell
