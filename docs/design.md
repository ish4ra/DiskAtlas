# DiskAtlas v0.1.0 design
The supplied product brief is authoritative. Build a Windows Electron desktop utility with React and TypeScript, six sidebar destinations, a large custom treemap, real disk scanning, filtering, export and persisted preferences. Use muted blue, teal and amber on graphite surfaces, compact typography, and no destructive actions.

A worker owns the normalized scan tree and all derived queries. Only progress summaries and bounded page/child results cross IPC. Iterative filesystem traversal avoids stack overflow, skips links and errors, and supports cooperative cancellation. A 500,000-entry ceiling produces an explicitly partial result rather than exhausting memory. All paths are logical sizes, not allocated bytes. Queries and exports operate on the worker-owned snapshot.

Main owns native dialogs, drive enumeration, preferences and shell integration. Renderer uses a small context-isolated preload API. Native actions accept scanned entry IDs rather than arbitrary shell commands. Exports use user-selected destinations. No telemetry or network requests are needed by the installed app.

Validation includes real temporary trees, cancellation, inaccessible/disappearing entries, ignore rules, size aggregation, sorting/filtering, treemap geometry, Electron end-to-end tests and Windows packaging in Actions. Screenshots must show real scan results.
