import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import type { Entry, FolderPage, Settings } from "../../shared/types";
import { bytes } from "../format";
type Props = {
  page: FolderPage;
  units: Settings["units"];
  onNavigate: (id: number) => void;
  onError: (s: string) => void;
};
function Rows({
  page,
  units,
  onNavigate,
  onError,
  depth = 0,
  sort,
  direction,
}: Props & {
  depth?: number;
  sort: "name" | "size" | "modified";
  direction: "asc" | "desc";
}) {
  const [current, setCurrent] = useState(page);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Record<number, FolderPage>>({});
  useEffect(() => {
    let live = true;
    setExpanded({});
    setOffset(0);
    void window.diskatlas
      .folder(page.entry.id, 0, sort, direction)
      .then((p) => {
        if (live) setCurrent(p);
      })
      .catch((e) => onError(e.message));
    return () => {
      live = false;
    };
  }, [page, sort, direction, onError]);
  const move = async (next: number) => {
    try {
      const p = await window.diskatlas.folder(
        page.entry.id,
        next,
        sort,
        direction,
      );
      setCurrent(p);
      setOffset(next);
      setExpanded({});
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const toggle = async (n: Entry) => {
    if (expanded[n.id]) {
      setExpanded((old) => {
        const next = { ...old };
        delete next[n.id];
        return next;
      });
      return;
    }
    try {
      const p = await window.diskatlas.folder(n.id, 0, sort, direction);
      setExpanded((old) => ({ ...old, [n.id]: p }));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <>
      {current.children.map((n) => {
        const pct = page.entry.size ? (n.size / page.entry.size) * 100 : 0;
        return (
          <div key={n.id}>
            <div
              className="details-row"
              style={{ paddingLeft: 12 + depth * 18 }}
            >
              <button
                aria-label={`${expanded[n.id] ? "Collapse" : "Expand"} ${n.name}`}
                disabled={!n.directory}
                onClick={() => void toggle(n)}
              >
                {n.directory ? (
                  expanded[n.id] ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )
                ) : (
                  <File size={14} />
                )}
              </button>
              <button
                className="details-name"
                title={n.path}
                onClick={() => n.directory && onNavigate(n.id)}
              >
                {n.directory && <Folder size={14} />} {n.name}
              </button>
              <b>{bytes(n.size, units)}</b>
              <span className="usage-bar">
                <i style={{ width: `${pct}%` }} />
                {pct.toFixed(1)}%
              </span>
              <span>{n.fileCount ?? (n.directory ? "—" : 1)}</span>
              <span>{n.folderCount ?? "—"}</span>
              <button
                title={`Copy path: ${n.name}`}
                onClick={() =>
                  void window.diskatlas
                    .copyPath(n.id)
                    .catch((e) => onError(e.message))
                }
              >
                Copy
              </button>
              <button
                title={`Reveal: ${n.name}`}
                onClick={() =>
                  void window.diskatlas
                    .action(n.id, "reveal")
                    .catch((e) => onError(e.message))
                }
              >
                Reveal
              </button>
            </div>
            {expanded[n.id] && (
              <Rows
                page={expanded[n.id]}
                units={units}
                onNavigate={onNavigate}
                onError={onError}
                depth={depth + 1}
                sort={sort}
                direction={direction}
              />
            )}
          </div>
        );
      })}
      {(offset > 0 || current.omitted > 0) && (
        <div className="details-paging">
          <button
            disabled={!offset}
            onClick={() => void move(Math.max(0, offset - 200))}
          >
            Previous children
          </button>
          <span>
            {offset + 1}–{offset + current.children.length} · {current.omitted}{" "}
            more
          </span>
          <button
            disabled={!current.omitted}
            onClick={() => void move(offset + 200)}
          >
            Next children
          </button>
        </div>
      )}
    </>
  );
}
export function Details(props: Props) {
  const [sort, setSort] = useState<"name" | "size" | "modified">("size");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  return (
    <section className="panel details">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WHAT USES YOUR SPACE</span>
          <h2>Storage details</h2>
        </div>
        <label>
          Sort{" "}
          <select
            aria-label="Details sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="size">Size</option>
            <option value="name">Name</option>
            <option value="modified">Modified</option>
          </select>
        </label>
        <button
          onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
        >
          {direction === "desc" ? "Descending" : "Ascending"}
        </button>
      </div>
      <div className="breadcrumbs">
        {props.page.breadcrumbs.map((n) => (
          <button key={n.id} onClick={() => props.onNavigate(n.id)}>
            {n.name}
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
      <div className="details-row details-header">
        <span />
        <span>Name</span>
        <span>Logical size</span>
        <span>% of parent</span>
        <span>Files</span>
        <span>Folders</span>
        <span />
        <span />
      </div>
      <Rows
        key={props.page.entry.id}
        {...props}
        sort={sort}
        direction={direction}
      />
    </section>
  );
}
