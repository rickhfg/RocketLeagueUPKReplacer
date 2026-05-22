# Rocket League UPK Replacer (RLUPKR)

A local GUI tool designed to replace Rocket League game files (`.upk` / `.udk`). It allows you to customize maps, car bodies, decals, wheels, boosts, and other game assets.

## Features

- **Search & Categories**: Browse indexed files by categories or search with smart tokenized autocomplete.
- **Auto-Detection**: Scans default Steam and Epic Games installation locations on startup.
- **Safety Backups & Restores**: Automatically creates `.rlupk.bak` backups and restores files in one click.
- **Local Security**: Uses a secure API session token and binds strictly to `127.0.0.1`.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed, then run:

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) if it does not launch automatically.
