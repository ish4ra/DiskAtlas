# Persistent indexing and large-drive validation

DiskAtlas now uses a worker-owned SQLite database in the application's user-data directory. Node's built-in SQLite API is provided by Electron's Node runtime; no native addon or administrator service is installed. Scanned entries, parent relationships, pending directories and visited directory identities live in the database. The renderer receives bounded pages (200 folder entries, at most 1,000 file entries). The original in-memory scanner remains a small-fixture regression reference; production calls `scanIndexed` and does not apply its entry ceiling.

Writes commit in batches of 512. Each refresh creates a separate generation. Only after aggregation and summary construction is the generation published. Failed or interrupted generations cannot replace a previous published snapshot. Startup marks incomplete generations interrupted and restores the newest published snapshot. Previously scanned roots can be reopened from Settings. All generations currently remain until Clear cached scans is used; automatic retention/compaction is not implemented.

Database indexes serve parent, size, extension and pending-directory lookups. Filters, counts, ordering and type aggregation run in SQLite. Substring and subtree filters may scan database rows; they are not full-text indexed. Directory totals aggregate bottom-up in bounded batches. SQL temporary storage is file-backed and the SQLite page-cache target is 16 MiB. JSON and CSV exports iterate database rows with stream backpressure and retain the selected generation during concurrent refresh.

Startup restoration labels snapshots cached and potentially stale. A saved device/inode identity is checked before opening entries; unavailable/replaced roots block filesystem actions. This is a useful guard, not a durable Windows volume GUID. A filesystem scan is not an atomic filesystem snapshot. Disappearance and permission failures yield partial results; cancellation yields a cancelled snapshot. Symlinks/junctions are skipped and visited directory identities prevent repeated traversal. Paths are statted again before opening directories. Fully adversarial reparse-point races and all cloud-provider reparse tags require a native Windows backend to guarantee stronger handling.

Logical bytes are counted per path. Physical allocation, sparse/compressed accounting, alternate streams and hard-link deduplication are not implemented. The interface labels sizes accordingly. Metadata traversal does not deliberately read file content or hydrate cloud content.

## NTFS and USN research / deliberate deferral

Reviewed Microsoft's [FSCTL_ENUM_USN_DATA](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_enum_usn_data), [USN_RECORD_V2](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-usn_record_v2), and [FSCTL_READ_USN_JOURNAL](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_read_usn_journal), plus the official [WizTree description](https://www.diskanalyzer.com/about) [Everything FAQ](https://www.voidtools.com/faq/), and [TreeSize NTFS notes](https://manuals.jam-software.com/treesize/EN/notesonntfs.html).

MFT enumeration can supply file and parent references efficiently. Its USN records do **not** supply file sizes. Correct storage analysis additionally needs validated metadata retrieval, version-aware record parsing, all relevant hard-link paths, reparse handling, privilege fallback and a coherent scan/journal boundary. No untested raw-volume parser or elevation path is shipped. This release uses normal filesystem traversal on every filesystem. **MFT acceleration and incremental USN replay are not implemented.**

Concrete next step: a separately tested read-only native Windows helper, capability-probed per volume, that returns bounded records into this database. Persist volume GUID, journal ID, supported record version and next USN only after an atomic baseline/replay commit. Validate journal ID and earliest available USN before every replay; any reset/wrap/gap/unsupported record causes full traversal fallback. Process rename pairs, deletions, hard-link changes and ancestor total changes transactionally. Test on real NTFS volumes under concurrent edits and restricted privileges before enabling it. Do not claim a journal cursor alone constitutes incremental scanning.

## Measured synthetic index scale (Linux, Node 24)

Run `node --import tsx scripts/benchmark-index.ts`. Flat generated metadata, warm local filesystem; these are not physical-drive scan timings or Windows guarantees.

| Entries | Cumulative insert seconds | Largest-files page + count ms | RSS MiB | JS heap MiB |
| ---: | ---: | ---: | ---: | ---: |
| 100,000 | 0.40 | 3.57 | 85.5 | 10.3 |
| 500,000 | 2.01 | 16.18 | 94.1 | 10.1 |
| 1,000,000 | 4.18 | 32.50 | 110.3 | 21.2 |
| 3,000,000 | 12.52 | 90.90 | 110.5 | 9.4 |

At three million entries the main database file was about 528 MiB. Exact total and bounded page assertions passed. A separate production-scanner test traverses 500,005 synthetic files using injected metadata and verifies no early stop. Real multi-million-file Windows drive testing remains necessary before broad production-performance claims.
