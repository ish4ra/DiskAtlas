# 0.2.0 validation and release scope

Baseline: `ba86294` already contained persistent SQLite indexing, startup restore, uncapped production scans, bounded queries, Details/Treemap switching and three-million-row validation. Those subsystems were preserved.

Additional changes:

- Read-only native MFT enumeration with metadata handles, strict protocol/record validation, journal-change rejection and automatic indexed-traversal fallback.
- Bounded retention: two recent snapshots per root, last complete snapshot, and active snapshot. Export readers defer cleanup. SQLite pages are reused and WAL is checkpointed.
- Fixed Unicode case folding and UTF-16/code-point mismatch in scoped filters; Windows scope matching is case-insensitive.
- A scan summary is published only after its generation is stored. Cleanup failures cannot invalidate a successfully published scan/export.
- Failed scan initialization no longer leaves the worker stuck busy. Transaction insertion failures roll back; interrupted-worker recovery retains the prior snapshot.
- Corrupt JSON snapshot metadata is bypassed, corrupt database sidecars are quarantined together, and schema migration preserves existing snapshots.
- Root identity checks include native volume GUIDs. Open/reveal actions reject a scan-generation change while a confirmation dialog is open.
- Details filenames align with the hierarchy; filenames can invoke the existing confirmed Open action. Added paging/sorting and restart/view-persistence integration checks.
- Installer and portable validation each launch the packaged native helper self-test. Installed-app integration tests also verify startup and application behavior.

The Windows workflow compiles and self-tests the helper, runs lint/types/unit tests, mounts a disposable NTFS VHDX with 50,001 actual files and long Unicode paths, checks native scanning and safe fallbacks, runs the unchanged three-million-entry synthetic benchmark, builds the UI, runs desktop tests, packages NSIS/portable, installs and tests the installed app, and verifies portable launch.

All official validation evidence is attached to the corresponding [Windows Actions run](https://github.com/ish4ra/DiskAtlas/actions/workflows/windows.yml). Local Linux GUI testing cannot launch reliably in the execution sandbox; Windows is the release-validation platform. Synthetic results and real filesystem timings are reported separately in [index architecture](index-architecture.md).

## Release decision

Version **0.2.0** is the stable release scope. Publication requires the Windows validation and tag-triggered release jobs to pass, with both installer and portable executables uploaded as release assets. Broader testing on user system drives and additional NTFS/removable/cloud-provider configurations, including repeated stop/start and low-disk-space conditions, remains valuable. The Windows CI VHD is meaningful integration coverage but is not a substitute for heterogeneous hardware and multi-million-file physical drives.

Remaining limitations: USN incremental replay is not implemented; native eligibility is conservative and frequently falls back on active/system volumes or ordinary non-elevated sessions; hard links force traversal and logical bytes remain counted per path; physical allocation/alternate streams are not reported; files changing during a scan do not form an atomic filesystem snapshot; substring filters can require database scans; cancellation may wait for a filesystem call or aggregation; binaries are unsigned. These limits must remain explicit in release notes.
