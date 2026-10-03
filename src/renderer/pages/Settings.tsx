import { useEffect, useState } from "react";
import { ShieldCheck, Save } from "lucide-react";
import type { Settings as Preferences } from "../../shared/types";
export function Settings({
  value,
  onSave,
  onError,
}: {
  value: Preferences;
  onSave: (s: Preferences) => void;
  onError: (s: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [snapshots, setSnapshots] = useState<
    { id: number; root: string; scannedAt?: string }[]
  >([]);
  useEffect(() => {
    void window.diskatlas
      .snapshots()
      .then(setSnapshots)
      .catch((e) => onError(e.message));
  }, [onError]);
  const [saved, setSaved] = useState(false);
  const update = (v: Partial<Preferences>) => {
    setDraft({ ...draft, ...v });
    setSaved(false);
  };
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h2>Preferences</h2>
        </div>
        <span className="badge">Stored on this device</span>
      </div>
      <div className="settings-grid">
        <label>
          <b>Appearance</b>
          <small>Match your workspace.</small>
          <select
            value={draft.theme}
            onChange={(e) =>
              update({ theme: e.target.value as Preferences["theme"] })
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </label>
        <label>
          <b>Size units</b>
          <small>Binary uses 1,024 bytes per KiB.</small>
          <select
            value={draft.units}
            onChange={(e) =>
              update({ units: e.target.value as Preferences["units"] })
            }
          >
            <option value="binary">Binary (KiB, MiB, GiB)</option>
            <option value="decimal">Decimal (kB, MB, GB)</option>
          </select>
        </label>
        <label>
          <b>Default scan target</b>
          <small>Absolute folder path. Scanning always starts manually.</small>
          <input
            value={draft.defaultTarget}
            placeholder="C:\\Users"
            onChange={(e) => update({ defaultTarget: e.target.value })}
          />
        </label>
        <label>
          <b>Files per page</b>
          <small>Keep large result sets manageable.</small>
          <select
            value={draft.resultCount}
            onChange={(e) => update({ resultCount: Number(e.target.value) })}
          >
            {[25, 50, 100, 250, 500, 1000].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <b>Ignored folders</b>
          <small>
            One folder name or absolute path per line. Applies to the next scan.
          </small>
          <textarea
            rows={4}
            value={draft.ignoredFolders.join("\n")}
            onChange={(e) =>
              update({ ignoredFolders: e.target.value.split("\n") })
            }
          />
        </label>
        <label>
          <b>Ignored extensions</b>
          <small>One extension per line, e.g. .tmp or .log.</small>
          <textarea
            rows={4}
            value={draft.ignoredExtensions.join("\n")}
            onChange={(e) =>
              update({ ignoredExtensions: e.target.value.split("\n") })
            }
          />
        </label>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.confirmOpen}
          onChange={(e) => update({ confirmOpen: e.target.checked })}
        />{" "}
        Confirm before opening folders. Files always require confirmation.
      </label>
      <h3>Saved scans</h3>
      {snapshots.map((s) => (
        <button
          key={s.id}
          onClick={() =>
            void window.diskatlas
              .restore(s.id)
              .then(() => location.reload())
              .catch((e) => onError(e.message))
          }
        >
          {s.root} ·{" "}
          {s.scannedAt ? new Date(s.scannedAt).toLocaleString() : "Cached"}
        </button>
      ))}
      <p className="notice">
        Cached scans are local snapshots, not live filesystem data. Sizes are
        logical bytes; hard links are counted per path.
      </p>
      <button
        onClick={() =>
          void window.diskatlas
            .clearCache()
            .then(() => location.reload())
            .catch((e) => onError(e.message))
        }
      >
        Clear cached scans
      </button>
      <div className="settings-footer">
        <p>
          <ShieldCheck size={18} /> Your files stay on your computer. No
          accounts. No telemetry.
        </p>
        <button
          className="primary"
          onClick={() => {
            const next = {
              ...draft,
              ignoredFolders: draft.ignoredFolders
                .map((s) => s.trim())
                .filter(Boolean),
              ignoredExtensions: draft.ignoredExtensions
                .map((s) => s.trim())
                .filter(Boolean),
            };
            void window.diskatlas
              .saveSettings(next)
              .then((s) => {
                onSave(s);
                setDraft(s);
                setSaved(true);
              })
              .catch((e) => onError(e.message));
          }}
        >
          <Save size={15} />
          {saved ? "Saved" : "Save preferences"}
        </button>
      </div>
    </section>
  );
}
