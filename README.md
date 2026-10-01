<p align="center"><img src="public/icon.svg" width="84" alt="DiskAtlas logo"></p>
<h1 align="center">DiskAtlas</h1>
<p align="center">Every byte, in perspective.<br>A local, open-source disk space explorer for Windows.</p>
<p align="center"><a href="https://github.com/ish4ra/DiskAtlas/actions/workflows/windows.yml"><img src="https://github.com/ish4ra/DiskAtlas/actions/workflows/windows.yml/badge.svg" alt="Windows build"></a> <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></p>

DiskAtlas maps real folders into a large interactive treemap, helps find large files, and explains storage by file type. It does not delete or modify the files it scans.

## Features

- Real background scans with live counts, cancellation and explicit partial-result states.
- Drive capacity, used/free space and custom folder selection.
- Proportional treemap with selection, tooltips, folder drill-down and breadcrumbs.
- Largest-files table with paging, column sorting, filename/path search, category, extension, size and folder filters.
- File categories and extension totals; expandable folder explorer.
- Copy paths, reveal items in Explorer, and explicitly confirmed file opening.
- Full JSON export and filtered CSV export with spreadsheet-formula escaping.
- Persisted dark, light and system themes, size units, exclusions, default folder and result counts.
- No accounts, telemetry, network scanning or delete feature.

## Screenshots

Real Electron screenshots from scans of actual test-directory files are captured by Windows integration tests and included in the `DiskAtlas-validation` Actions artifact. A committed screenshot will be added after visual validation.

## Install

Windows 10/11 x64. Download from [Releases](https://github.com/ish4ra/DiskAtlas/releases), when a release is published, or open the latest successful [Windows build](https://github.com/ish4ra/DiskAtlas/actions/workflows/windows.yml) and download `DiskAtlas-0.1.0-Windows-x64` under Artifacts (GitHub sign-in required).

- `DiskAtlas-Setup-0.1.0.exe`: install with a choice of location.
- `DiskAtlas-0.1.0-win-x64-portable.exe`: run without installing.

Builds are not code-signed. Windows may show an unknown-publisher/SmartScreen prompt. Verify that your download came from this repository. Administrator privileges are not required; inaccessible locations are skipped.

## Use

Choose a drive or folder and let the scan finish. Click a treemap block to inspect it; double-click a folder (or press Enter when focused) to drill down. Breadcrumbs navigate back. The same folder selection appears in Explorer. Use “Show files in this folder” to scope the file table. Export JSON includes all retained entries; CSV exports all files matching the current table filters, not just the displayed page.

Preferences apply exclusions to the next scan. Folder exclusions match a case-insensitive exact folder name or absolute path. Extensions accept `.tmp` or `tmp`. There is no glob syntax.

## Develop

Node.js 22 or newer and npm. On Windows:

```sh
npm ci
npm run dev
```

The development command starts Vite and Electron. Restart it after changing main/preload/worker code. Renderer edits reload through Vite.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run package:win
```

The Electron integration test launches a real application, creates and scans real temporary files, exercises views and search, exports JSON/CSV, verifies preferences and checks renderer errors. Linux desktop testing needs a graphical session or compatible headless Electron environment. Windows packaging is performed on `windows-latest` CI. No browser-only filesystem mock is shipped.

## Architecture

- `electron/scanner.ts`: iterative traversal, safe link handling, throttled progress and cancellation.
- `electron/worker.ts`, `analysis.ts`: worker-owned normalized results, queries, statistics and streaming exports.
- `electron/main.ts`, `preload.ts`, `validation.ts`: native dialogs and drive integration, validated IPC and the narrow renderer bridge.
- `src/shared/`: typed contracts and file categories.
- `src/renderer/`: React shell, views, custom treemap geometry and theme styles.
- `tests/`: real-filesystem unit tests and Electron end-to-end validation.

The renderer never receives the whole scan tree. Extension details are capped at the largest 1,000 extensions; category totals include all retained files. Child queries are capped at 1,500 entries and file-table pages at 1,000. A worker keeps scanning/query work off the UI thread. Electron uses a sandboxed preload, context isolation, disabled Node integration and a restrictive content policy.

## Privacy

File paths and metadata stay on your device. Scans are kept in memory until the next scan or exit. Preferences live in Electron's per-user app-data directory. Exported files include paths and metadata, so review them before sharing. DiskAtlas itself does not read file contents for analysis or make network requests.

## Current limitations

- v0.1.0 uses filesystem traversal, not NTFS MFT access. It will be slower than MFT-based tools on whole drives.
- Scans stop at 500,000 retained entries and label results as partial. For larger trees, scan individual folders. Memory usage scales with retained paths/entries.
- Sizes are logical file lengths, not allocated clusters. Hard links are counted by path. Compression, sparse files, inaccessible files and filesystem overhead mean totals can differ from drive usage.
- Symlinks and junctions are skipped; the root must be a real directory. Only the first 100 detailed errors are retained.
- Treemaps show immediate children of the current folder. Beyond 1,500 children, remaining nonzero bytes are grouped into a labeled block. The explorer has the same child cap; file queries and JSON export still include retained entries.
- Results are a snapshot, not a live filesystem monitor. Rescan after changes. No scan history, duplicate detection, automatic cleanup or window-state persistence.
- Cancellation is cooperative between filesystem operations. A slow/unresponsive device may delay cancellation.
- Installer is unsigned; Windows x64 is the supported release target.

## Roadmap: v0.2.0

Investigate NTFS MFT acceleration, disk-backed indexing for million-entry scans, scan history/diffs, hard-link awareness, and richer nested treemap levels. Improve accessibility and expand Windows hardware coverage.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports should include Windows version, DiskAtlas version, scan type and reproduction steps. Remove personal paths before sharing logs or exports.

## License

[MIT](LICENSE). Original DiskAtlas block-map branding; UI icons from Lucide (ISC).
