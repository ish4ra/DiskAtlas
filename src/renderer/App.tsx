import { useDiskAtlas } from "./hooks/useDiskAtlas";
import { Sidebar } from "./components/Sidebar";
import { DriveOverview } from "./components/DriveOverview";
import {
  ChartNoAxesCombined,
  Search,
  FolderOpen,
  RefreshCw,
  Download,
  HardDrive,
  ArrowUpRight,
  Square,
  X,
  ShieldCheck,
  Clock,
  Files as FilesIcon,
  Folder,
  ChevronRight,
} from "lucide-react";
import { colors } from "../shared/categories";
import { bytes, count, duration } from "./format";
import { Treemap } from "./components/Treemap";
import { Files } from "./pages/Files";
import { Types } from "./pages/Types";
import { Details } from "./components/Details";
import { Explorer } from "./pages/Explorer";
import { Settings } from "./pages/Settings";
export function App() {
  const {
    view,
    setView,
    drives,
    settings,
    setSettings,
    target,
    summary,
    folder,
    progress,
    scanning,
    error,
    setError,
    notice,
    setNotice,
    query,
    setQuery,
    onError,
    start,
    choose,
    navigate,
    exportData,
    activeDrive,
    current,
    units,
  } = useDiskAtlas();
  return (
    <div className="app">
      <Sidebar view={view} setView={setView} />
      <div className="workspace">
        <header className="topbar">
          <div className="location">
            <HardDrive size={17} />
            <span title={target}>{target || "Your storage"}</span>
            <ChevronRight size={13} />
            <b>{view}</b>
          </div>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Search files"
              placeholder="Search files, paths, extensions…"
              value={query.search ?? ""}
              onChange={(e) => {
                setQuery({ ...query, search: e.target.value, offset: 0 });
                if (summary) setView("Largest Files");
              }}
            />
            <kbd>LOCAL</kbd>
          </div>
          <button
            className="icon-button"
            title="Rescan"
            disabled={!target || scanning}
            onClick={() => void start(target)}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="primary"
            disabled={scanning}
            onClick={() => void choose()}
          >
            <FolderOpen size={16} /> Choose folder
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">A CLEAR VIEW OF YOUR STORAGE</span>
              <h1>
                {view === "Overview" ? "Every byte, in perspective." : view}
              </h1>
              <p>
                {scanning
                  ? "Analyzing your files. Keep exploring when the scan finishes."
                  : summary
                    ? `${summary.root} · ${summary.status === "complete" ? "Scan complete" : summary.status === "cancelled" ? "Cancelled · partial results" : "Partial results"}`
                    : "Find the big files. Understand the folders. Take back your space."}
              </p>
            </div>
            {summary && (
              <div className="export-actions">
                <button onClick={() => void exportData("csv")}>
                  <Download size={14} /> CSV
                </button>
                <button onClick={() => void exportData("json")}>
                  <Download size={14} /> Export JSON
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {scanning && (
            <section className="scan-progress panel">
              <div>
                <span className="spinner" />
                <strong>Mapping your storage</strong>
                <span className="spacer" />
                <b>{bytes(progress?.bytes ?? 0, units)}</b>
                <button
                  onClick={() =>
                    void window.diskatlas
                      .cancel()
                      .catch((e) => onError(e.message))
                  }
                >
                  <Square size={12} /> Cancel scan
                </button>
              </div>
              <div className="indeterminate" />
              <p title={progress?.current}>{progress?.current ?? target}</p>
              <small>
                {count(progress?.files ?? 0)} files discovered ·{" "}
                {count(progress?.folders ?? 0)} folders ·{" "}
                {duration(progress?.elapsed ?? 0)}
              </small>
            </section>
          )}
          {view === "Settings" ? (
            <Settings
              value={settings}
              onSave={(s) => {
                setSettings(s);
                setQuery((q) => ({ ...q, limit: s.resultCount, offset: 0 }));
              }}
              onError={onError}
            />
          ) : (
            <>
              {view === "Overview" && (
                <DriveOverview
                  drives={drives}
                  activeDrive={activeDrive}
                  hasScan={!!summary}
                  scanning={scanning}
                  units={units}
                  start={start}
                  choose={choose}
                />
              )}
              {summary && folder ? (
                <>
                  {view === "Overview" && (
                    <div className="stats">
                      <div>
                        <span>SCANNED SIZE</span>
                        <strong>{bytes(summary.bytes, units)}</strong>
                        <small>Logical file size</small>
                      </div>
                      <div>
                        <span>FILES</span>
                        <strong>{count(summary.files)}</strong>
                        <small>
                          {count(summary.extensionCount)} extensions
                        </small>
                      </div>
                      <div>
                        <span>FOLDERS</span>
                        <strong>{count(summary.folders)}</strong>
                        <small>{count(summary.skipped)} skipped entries</small>
                      </div>
                      <div>
                        <span>SCAN TIME</span>
                        <strong>{duration(summary.elapsed)}</strong>
                        <small>
                          {summary.status === "complete"
                            ? "Analysis complete"
                            : "Partial scan"}
                        </small>
                      </div>
                    </div>
                  )}
                  {(view === "Overview" || view === "Treemap") && (
                    <>
                      <div
                        className="storage-switch"
                        role="group"
                        aria-label="Storage visualization"
                      >
                        {(["details", "treemap"] as const).map((mode) => (
                          <button
                            key={mode}
                            aria-pressed={
                              (view === "Treemap"
                                ? "treemap"
                                : (settings.storageView ?? "details")) === mode
                            }
                            onClick={() => {
                              setView("Overview");
                              void window.diskatlas
                                .saveSettings({
                                  ...settings,
                                  storageView: mode,
                                })
                                .then(setSettings)
                                .catch((e) => onError(e.message));
                            }}
                          >
                            {mode === "details" ? "Details" : "Treemap"}
                          </button>
                        ))}
                      </div>
                      <p className="subtle">
                        {summary.unavailable
                          ? "Root unavailable or changed — cached data only"
                          : summary.cached
                            ? "Cached snapshot — may be stale"
                            : "Scan snapshot"}{" "}
                        ·{" "}
                        {summary.scannedAt
                          ? new Date(summary.scannedAt).toLocaleString()
                          : ""}{" "}
                        ·{" "}
                        {summary.backend === "ntfs"
                          ? "NTFS metadata"
                          : "Filesystem"}{" "}
                        · Logical sizes · Refresh to check for changes
                      </p>
                      {view !== "Treemap" &&
                      settings.storageView !== "treemap" ? (
                        <Details
                          page={folder}
                          units={units}
                          onNavigate={(id) => void navigate(id)}
                          onError={onError}
                        />
                      ) : (
                        <Treemap
                          page={folder}
                          onNavigate={(id) => void navigate(id)}
                          units={units}
                          onError={onError}
                        />
                      )}
                      {view === "Overview" && (
                        <div className="insights">
                          <div className="panel insight">
                            <span className="eyebrow">LARGEST FILE</span>
                            <b title={summary.largestFile?.path}>
                              {summary.largestFile?.name ?? "No files"}
                            </b>
                            <strong>
                              {bytes(summary.largestFile?.size ?? 0, units)}
                            </strong>
                            <button onClick={() => setView("Largest Files")}>
                              Inspect files <ArrowUpRight size={14} />
                            </button>
                          </div>
                          <div className="panel insight">
                            <span className="eyebrow">LARGEST FOLDER</span>
                            <b title={summary.largestFolder?.path}>
                              {summary.largestFolder?.name ?? "No subfolders"}
                            </b>
                            <strong>
                              {bytes(summary.largestFolder?.size ?? 0, units)}
                            </strong>
                            <button
                              disabled={!summary.largestFolder}
                              onClick={() => {
                                void navigate(summary.largestFolder!.id);
                                setView("Explorer");
                              }}
                            >
                              Explore folder <ArrowUpRight size={14} />
                            </button>
                          </div>
                          <div className="panel insight">
                            <span className="eyebrow">TOP FILE TYPE</span>
                            <b>
                              {summary.types[0]?.extension || "No extension"}
                            </b>
                            <strong
                              style={{
                                color: summary.types[0]
                                  ? colors[summary.types[0].category]
                                  : undefined,
                              }}
                            >
                              {bytes(summary.types[0]?.size ?? 0, units)}
                            </strong>
                            <button onClick={() => setView("File Types")}>
                              See breakdown <ArrowUpRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {view === "Largest Files" && (
                    <Files
                      query={query}
                      setQuery={setQuery}
                      totalSize={summary.bytes}
                      units={units}
                      onError={onError}
                    />
                  )}
                  {view === "File Types" && (
                    <Types
                      types={summary.types}
                      categoryStats={summary.categoryStats}
                      total={summary.bytes}
                      units={units}
                      onFilter={(category, extension) => {
                        setQuery({
                          limit: settings.resultCount,
                          category,
                          extension,
                          sort: "size",
                          direction: "desc",
                        });
                        setView("Largest Files");
                      }}
                    />
                  )}
                  {view === "Explorer" && (
                    <>
                      <div className="explorer-toolbar">
                        <button
                          onClick={() => {
                            setQuery({
                              ...query,
                              scope: folder.entry.id,
                              offset: 0,
                            });
                            setView("Largest Files");
                          }}
                        >
                          Show files in this folder
                        </button>
                        <button onClick={() => setView("Treemap")}>
                          View as treemap
                        </button>
                      </div>
                      <Explorer
                        page={folder}
                        units={units}
                        onNavigate={(id) => void navigate(id)}
                        onError={onError}
                      />
                    </>
                  )}
                  {summary.skipped > 0 && (
                    <details className="warnings">
                      <summary>
                        {count(summary.skipped)} entries skipped · permissions,
                        links, or unavailable files
                      </summary>
                      <p>
                        Symbolic links and junctions are not followed. Up to 100
                        error details are retained.
                      </p>
                      {summary.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </details>
                  )}
                  {summary.status !== "complete" && (
                    <div className="notice">
                      These are partial results.{" "}
                      {summary.status === "limited"
                        ? "This older scan was limited. Refresh to rebuild its index."
                        : summary.status === "partial"
                          ? "Some paths could not be read. See skipped-entry details."
                          : "The scan was cancelled before it finished."}
                    </div>
                  )}
                </>
              ) : (
                !scanning && (
                  <section className="welcome panel">
                    <div className="welcome-art">
                      <div />
                      <div />
                      <div />
                      <div />
                      <div />
                    </div>
                    <span className="eyebrow">LESS GUESSWORK. MORE SPACE.</span>
                    <h2>Your storage has a story.</h2>
                    <p>
                      Select a drive or folder to see what’s taking up space.
                      <br />
                      DiskAtlas turns real files into a map you can explore.
                    </p>
                    <button
                      className="primary"
                      onClick={() => void (target ? start(target) : choose())}
                    >
                      <FolderOpen size={16} />
                      {target
                        ? "Scan default location"
                        : "Choose your first folder"}
                    </button>
                    <div className="welcome-features">
                      <span>
                        <ChartNoAxesCombined size={16} /> Interactive storage
                        maps
                      </span>
                      <span>
                        <Search size={16} /> Find large files
                      </span>
                      <span>
                        <ShieldCheck size={16} /> Private & read-only analysis
                      </span>
                    </div>
                  </section>
                )
              )}
            </>
          )}
        </main>
        <footer className="statusbar">
          <span className={`status-dot ${scanning ? "pulse" : ""}`} />
          <span>
            {scanning
              ? "Scanning"
              : summary
                ? summary.status === "complete"
                  ? "Scan complete"
                  : "Partial results"
                : "Ready to explore"}
          </span>
          <span className="status-divider" />
          <span>
            <FilesIcon size={12} />
            {count(current?.files ?? 0)} files
          </span>
          <span>
            <Folder size={12} />
            {count(current?.folders ?? 0)} folders
          </span>
          <span className="spacer" />
          <span>{bytes(current?.bytes ?? 0, units)}</span>
          <span>
            <Clock size={12} />
            {duration(current?.elapsed ?? 0)}
          </span>
          <span className="local-label">ALL LOCAL</span>
        </footer>
      </div>
    </div>
  );
}
