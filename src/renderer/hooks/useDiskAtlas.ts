import { useCallback, useEffect, useState, useRef } from "react";
import type {
  Drive,
  FileQuery,
  FolderPage,
  Progress,
  Settings as Preferences,
  Summary,
} from "../../shared/types";
import { defaults } from "../../shared/types";
export function useDiskAtlas() {
  const [view, setView] = useState<string>("Overview");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [settings, setSettings] = useState<Preferences>(defaults);
  const [target, setTarget] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [folder, setFolder] = useState<FolderPage | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState<FileQuery>({
    limit: 100,
    sort: "size",
    direction: "desc",
  });
  const navigationRequest = useRef(0);
  const onError = useCallback((s: string) => setError(s), []);
  useEffect(() => {
    if (!window.diskatlas) {
      setError(
        "Launch DiskAtlas as a desktop application to access your files.",
      );
      return;
    }
    void window.diskatlas
      .drives()
      .then(setDrives)
      .catch((e) => onError(e.message));
    void window.diskatlas
      .settings()
      .then((s) => {
        setSettings(s);
        setTarget(s.defaultTarget);
        setQuery((q) => ({ ...q, limit: s.resultCount }));
      })
      .catch((e) => onError(e.message));
    void window.diskatlas
      .summary()
      .then(async (s) => {
        if (s && navigationRequest.current === 0) {
          const f = await window.diskatlas.folder(0);
          if (navigationRequest.current === 0) {
            setSummary(s);
            setFolder(f);
            setTarget(s.root);
          }
        }
      })
      .catch((e) => onError(e.message));
    const offP = window.diskatlas.onProgress(setProgress);
    const offD = window.diskatlas.onDone(() => {
      const request = navigationRequest.current;
      void Promise.all([window.diskatlas.summary(), window.diskatlas.folder(0)])
        .then(([s, f]) => {
          if (request !== navigationRequest.current) return;
          setScanning(false);
          setSummary(s);
          setFolder(f);
          setProgress(null);
        })
        .catch((e) => onError(e.message));
    });
    const offE = window.diskatlas.onError((s) => {
      setScanning(false);
      setProgress(null);
      onError(s);
    });
    return () => {
      offP();
      offD();
      offE();
    };
  }, [onError]);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        settings.theme === "system"
          ? mq.matches
            ? "light"
            : "dark"
          : settings.theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);
  const start = async (p: string) => {
    if (!p || scanning) return;
    navigationRequest.current++;
    setError("");
    setNotice("");

    setProgress(null);
    setScanning(true);
    setTarget(p);
    setQuery({ limit: settings.resultCount, sort: "size", direction: "desc" });
    setView("Overview");
    try {
      await window.diskatlas.start(p);
    } catch (e) {
      setScanning(false);
      onError((e as Error).message);
    }
  };
  const choose = async () => {
    try {
      const p = await window.diskatlas.choose();
      if (p) await start(p);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const navigate = async (id: number) => {
    const request = ++navigationRequest.current;
    try {
      const next = await window.diskatlas.folder(id);
      if (request === navigationRequest.current) setFolder(next);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const exportData = async (format: "json" | "csv") => {
    try {
      const p = await window.diskatlas.export(format, query);
      if (p) setNotice(`Export saved to ${p}`);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const activeDrive = drives
    .filter((d) => target.toLowerCase().startsWith(d.path.toLowerCase()))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const current = progress ?? summary;
  const units = settings.units;
  return {
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
  };
}
