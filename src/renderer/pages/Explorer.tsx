import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import type { Entry, FolderPage, Settings } from "../../shared/types";
import { bytes } from "../format";
function Row({
  node,
  depth,
  total,
  units,
  onNavigate,
  onError,
}: {
  node: Entry;
  depth: number;
  total: number;
  units: Settings["units"];
  onNavigate: (id: number) => void;
  onError: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<FolderPage | null>(null);
  const toggle = async () => {
    if (!node.directory) return;
    try {
      if (!page) setPage(await window.diskatlas.folder(node.id));
      setOpen(!open);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <>
      <div className="explorer-row" style={{ paddingLeft: 16 + depth * 22 }}>
        <button
          className="tree-toggle"
          onClick={() => void toggle()}
          aria-label={`Expand ${node.name}`}
          disabled={!node.directory}
        >
          {node.directory ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </button>
        {node.directory ? (
          <Folder size={16} className="folder-icon" />
        ) : (
          <File size={15} />
        )}
        <button
          className="tree-name"
          onClick={() => node.directory && onNavigate(node.id)}
          title={node.path}
        >
          {node.name}
        </button>
        <span>
          {node.directory
            ? `${node.fileCount ?? 0} files · ${node.folderCount ?? 0} folders`
            : node.extension || "File"}
        </span>
        <b>{bytes(node.size, units)}</b>
        <span>{total ? ((node.size / total) * 100).toFixed(1) : 0}%</span>
      </div>
      {open && page && (
        <>
          {page.children.map((n) => (
            <Row
              key={n.id}
              node={n}
              depth={depth + 1}
              total={total}
              units={units}
              onNavigate={onNavigate}
              onError={onError}
            />
          ))}
          {page.omitted > 0 && (
            <p className="subtle">
              {page.omitted} further entries grouped. Use file search to inspect
              them.
            </p>
          )}
        </>
      )}
    </>
  );
}
export function Explorer({
  page,
  units,
  onNavigate,
  onError,
}: {
  page: FolderPage;
  units: Settings["units"];
  onNavigate: (id: number) => void;
  onError: (s: string) => void;
}) {
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [page]);
  return (
    <section className="panel explorer">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">FOLLOW THE FOLDER TRAIL</span>
          <h2>Folder explorer</h2>
        </div>
        <span className="subtle">Size · % of current folder</span>
      </div>
      <div className="breadcrumbs">
        {page.breadcrumbs.map((n) => (
          <button key={n.id} onClick={() => onNavigate(n.id)}>
            {n.name}
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
      <div key={key}>
        {page.children.map((n) => (
          <Row
            key={n.id}
            node={n}
            depth={0}
            total={page.entry.size}
            units={units}
            onNavigate={onNavigate}
            onError={onError}
          />
        ))}
      </div>
      {page.omitted > 0 && (
        <p className="notice">
          Showing the 200 largest immediate children. {page.omitted} more are
          available through file search/export.
        </p>
      )}
    </section>
  );
}
