# DiskAtlas implementation plan
Execution: autonomous inline, as explicitly requested. Main branch is authorized.
Spec: docs/design.md and the supplied product brief.

1. Scanner and query engine: shared types; iterative cancellable traversal; worker RPC; grouped statistics, bounded table queries and exports. Write tests first using actual temporary files, then implement and verify.
2. Desktop integration: validate IPC and settings; detect drives; isolate preload; native dialogs and reveal/open with confirmation; packaging. Verify through typecheck and Electron integration tests.
3. Renderer: responsive shell, drive overview, treemap, sortable/filterable file table, categories, expandable explorer and settings. Test geometry, launch actual app and inspect screenshot.
4. Release: lint, tests, build, Windows Actions packaging and artifacts; inspect/fix runs, document real limitations and capture screenshots.

Review focus: cancelled/partial totals; symlink loops and permission failures; stale RPC replies; untrusted IPC paths; large directory/table payload limits.
