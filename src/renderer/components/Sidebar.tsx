import {
  LayoutDashboard,
  ChartNoAxesCombined,
  ListOrdered,
  Shapes,
  FolderTree,
  Settings2,
  ShieldCheck,
} from "lucide-react";
const nav = [
  ["Overview", LayoutDashboard],
  ["Treemap", ChartNoAxesCombined],
  ["Largest Files", ListOrdered],
  ["File Types", Shapes],
  ["Explorer", FolderTree],
  ["Settings", Settings2],
] as const;
export function Sidebar({
  view,
  setView,
}: {
  view: string;
  setView: (v: string) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="./icon.svg" alt="" />
        <span>
          DiskAtlas<small>STORAGE EXPLORER</small>
        </span>
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {nav.map(([name, Icon]) => (
          <button
            key={name}
            className={view === name ? "active" : ""}
            onClick={() => setView(name)}
          >
            <Icon size={18} />
            {name}
            {name === "Overview" && <span className="nav-indicator" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy">
          <ShieldCheck size={17} />
          <span>
            Local by design<small>Your files never leave this device.</small>
          </span>
        </div>
        <div className="version">
          DiskAtlas <span>v0.2.0</span>
        </div>
      </div>
    </aside>
  );
}
