import {
  HardDrive,
  ArrowUpRight,
  FolderOpen,
  ChevronRight,
} from "lucide-react";
import type { Drive, Settings } from "../../shared/types";
import { bytes } from "../format";
export function DriveOverview({
  drives,
  activeDrive,
  hasScan,
  scanning,
  units,
  start,
  choose,
}: {
  drives: Drive[];
  activeDrive: Drive | undefined;
  hasScan: boolean;
  scanning: boolean;
  units: Settings["units"];
  start: (p: string) => Promise<void>;
  choose: () => Promise<void>;
}) {
  return (
    <>
      <div className="section-label">
        <span>AVAILABLE STORAGE</span>
        <span>
          {drives.length} {drives.length === 1 ? "volume" : "volumes"} detected
        </span>
      </div>
      <div className="drive-grid">
        {drives.map((d) => (
          <button
            className={`drive-card ${activeDrive?.path === d.path && hasScan ? "drive-active" : ""}`}
            key={d.path}
            disabled={scanning}
            onClick={() => void start(d.path)}
          >
            <div>
              <HardDrive size={23} />
              <span>
                <b>{d.label}</b>
                <small>
                  {d.path} · {bytes(d.total, units)} capacity
                </small>
              </span>
              <ArrowUpRight size={17} />
            </div>
            <div className="drive-bar">
              <span
                style={{
                  width: `${d.total ? (1 - d.free / d.total) * 100 : 0}%`,
                }}
              />
            </div>
            <footer>
              <span>
                {bytes(d.total - d.free, units)} used ·{" "}
                {d.total ? ((1 - d.free / d.total) * 100).toFixed(0) : 0}%
              </span>
              <b>{bytes(d.free, units)} free</b>
            </footer>
          </button>
        ))}
        <button
          className="folder-card"
          disabled={scanning}
          onClick={() => void choose()}
        >
          <FolderOpen size={23} />
          <span>
            <b>Focus on a folder</b>
            <small>Choose any location to analyze</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
    </>
  );
}
