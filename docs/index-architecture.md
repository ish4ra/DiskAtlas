# Persistent indexing and large-drive validation

DiskAtlas now uses a worker-owned SQLite database in the application's user-data directory. Node's built-in SQLite API is provided by Electron's Node runtime; no native addon or administrator service is installed. Scanned entries, parent relationships, pending directories and visited directory identities live in the database. The renderer receives bounded pages (200 folder entries, at most 1,000 file entries). The original in-memory scanner remains a small-fixture regression reference; production calls `scanIndexed` and does not apply its entry ceiling.

Writes commit in batches of 512. Each refresh creates a separate generation. Only after aggregation and summary construction is the generation published. Failed or interrupted generations cannot replace a previous published snapshot. Startup marks incomplete generations interrupted and restores the newest published snapshot. Previously scanned roots can be reopened from Settings. Retention keeps the latest two published generations per root, the last complete generation if older, and the active snapshot. Cleanup is deferred while exports hold snapshots. Failed/interrupted unpublished generations are reclaimed on the next successful scan. Freed SQLite pages are reused; WAL is checkpointed. Clear cached scans additionally vacuums the database. Schema version 2 preserves version-1 snapshots.

Database indexes serve parent, size, extension and pending-directory lookups. Filters, counts, ordering and type aggregation run in SQLite. Substring and subtree filters may scan database rows; they are not full-text indexed. Directory totals aggregate bottom-up in bounded batches. SQL temporary storage is file-backed and the SQLite page-cache target is 16 MiB. JSON and CSV exports iterate database rows with stream backpressure and retain the selected generation during concurrent refresh.

Startup restoration labels snapshots cached and potentially stale. A saved device/inode identity is checked before opening entries; unavailable/replaced roots block filesystem actions. Filesystem fallback uses this device/inode guard; native snapshots additionally re-probe their stored Windows volume GUID before filesystem actions. A filesystem scan is not an atomic filesystem snapshot. Disappearance and permission failures yield partial results; cancellation yields a cancelled snapshot. Symlinks/junctions are skipped and visited directory identities prevent repeated traversal. Paths are statted again before opening directories. Fully adversarial reparse-point races and all cloud-provider reparse tags require a native Windows backend to guarantee stronger handling.

Logical bytes are counted per path. Physical allocation, sparse/compressed accounting, alternate streams and hard-link deduplication are not implemented. The interface labels sizes accordingly. Metadata traversal does not deliberately read file content or hydrate cloud content.

## Read-only NTFS helper

`native/ntfs.cpp` uses Microsoft's supported [FSCTL_ENUM_USN_DATA](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_enum_usn_data), [OpenFileById](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-openfilebyid), and [GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex). It does not parse raw disk sectors. MSVC builds the helper in Windows CI and packaging includes it outside the application archive.

Eligibility is deliberately narrow: a whole local fixed NTFS drive, no configured exclusions, available read-only volume access and an active USN journal. Directory scans, network/removable/non-NTFS volumes and unavailable privilege/API support use the existing indexed traversal. The app never requests elevation or installs a privileged service. Many ordinary non-elevated sessions will therefore use traversal.

The helper bounds and version-checks USN records, skips reparse points and obtains each file's logical size/timestamp through a metadata handle opened by ID. Normalized paths are staged on disk before parent-first insertion into the existing SQLite index. Internal reserved metadata records are excluded. Inaccessible records produce an explicit partial snapshot. Any hard-linked file triggers complete traversal fallback because enumerating one MFT record does not enumerate all its directory names. An unchanged journal ID and NextUsn are required across enumeration; concurrent filesystem changes also trigger fallback. Partial staging never replaces a previous valid snapshot. Cancellation kills the helper and follows the ordinary cancellation path.

This is a genuine MFT enumeration path, but **not a claim of WizTree-class speed**. It still opens individual metadata handles for sizes and paths, and conservative fallback is common on active/system volumes. Reference research also covered the official [WizTree description](https://www.diskanalyzer.com/about), [Everything FAQ](https://www.voidtools.com/faq/), and [TreeSize NTFS notes](https://manuals.jam-software.com/treesize/EN/notesonntfs.html).

## USN status and exact remaining blocker

Volume GUID and journal ID are persisted with a successful native snapshot. The helper observes NextUsn to reject obvious concurrent changes, but it is deliberately **not persisted as a reusable replay checkpoint**. An unchanged cursor alone cannot reconcile coalesced journal records from files still open for writing. **No incremental replay is implemented or enabled.** Every refresh builds a new generation.

The blocker is a fully validated identity/name model for hard links and rename pairs, plus baseline reconciliation and transactional replay under concurrent/open-handle writes. A stored cursor alone does not solve those problems. Before enabling replay, persist file-reference identities and all link names, validate volume GUID, journal ID, FirstUsn/LowestValidUsn and supported record versions, then atomically apply creates/deletes/rename pairs/metadata changes and ancestor totals. Reset, wrap, gaps or unsupported records must force a full baseline. See Microsoft's [USN_JOURNAL_DATA_V0](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-usn_journal_data_v0) and [FSCTL_READ_USN_JOURNAL](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_read_usn_journal).

## Size-on-disk feasibility

[FILE_STANDARD_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_standard_info) exposes allocation and link counts. [GetCompressedFileSizeW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getcompressedfilesizew) handles compressed/sparse data but follows symbolic links. These APIs do not by themselves define trustworthy aggregate physical usage across hard links, alternate streams, reparse providers and filesystem overhead. This build intentionally continues to label and report logical bytes per path; it does not expose approximate physical totals.

## Real Windows validation

CI creates and later detaches its own disposable 1 GiB NTFS VHDX. It creates 50,000 files in a flat directory plus a 35-level Unicode tree exceeding MAX_PATH, then requires the actual native backend to populate the index. The same test validates application-worker restart, cache restoration, hard-link fallback, directory junction loops, file symlinks, permission denial, refresh, cancellation and cache clearing. Ordinary tests additionally terminate a worker during writes and verify recovery of the prior published snapshot. This is real Windows filesystem/API validation, not a multi-million-file physical-drive benchmark.

## Measured synthetic index scale (Linux, Node 24)

Run `node --import tsx scripts/benchmark-index.ts`. Flat generated metadata, warm local filesystem; these are not physical-drive scan timings or Windows guarantees.

| Entries | Cumulative insert seconds | Largest-files page + count ms | RSS MiB | JS heap MiB |
| ---: | ---: | ---: | ---: | ---: |
| 100,000 | 0.40 | 3.57 | 85.5 | 10.3 |
| 500,000 | 2.01 | 16.18 | 94.1 | 10.1 |
| 1,000,000 | 4.18 | 32.50 | 110.3 | 21.2 |
| 3,000,000 | 12.52 | 90.90 | 110.5 | 9.4 |

At three million entries the main database file was about 528 MiB. Exact total and bounded page assertions passed. A separate production-scanner test traverses 500,005 synthetic files using injected metadata and verifies no early stop. Real multi-million-file Windows drive testing remains necessary before broad production-performance claims.

Measured Windows run [37141021707](https://github.com/ish4ra/DiskAtlas/actions/runs/37141021707): creating 50,001 test files took 15.90 seconds; native enumeration/import took 7.24 seconds. The native result was explicitly partial with two skipped system records. The real fixture and fallback/restart/ACL/link assertions passed. The separate three-million-row synthetic Windows benchmark took 122.87 seconds to insert, returned the largest-files page plus count in 163.32 ms, and used 101.27 MiB RSS. These measurements do not establish speed on a user's system drive.
