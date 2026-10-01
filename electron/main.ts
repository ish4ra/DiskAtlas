import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile, writeFile, rename, mkdir, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ScannerClient } from "./rpc";
import { drives } from "./drives";
import {
  entryId,
  validateQuery,
  validateSettings,
  validateTarget,
} from "./validation";
import { defaults, type Entry, type Settings } from "../src/shared/types";
let win: BrowserWindow;
let scanner: ScannerClient;
let settings: Settings = { ...defaults };
let busy = false;
let generation = 0;
if (process.env.DISKATLAS_USER_DATA)
  app.setPath("userData", process.env.DISKATLAS_USER_DATA);
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
app.whenReady().then(async () => {
  try {
    settings = validateSettings(
      JSON.parse(await readFile(settingsPath(), "utf8")),
    );
  } catch {
    /* First launch or corrupt preferences use safe defaults. */
  }
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 680,
    title: "DiskAtlas",
    backgroundColor: "#11151d",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w, _p, callback) =>
    callback(false),
  );
  const url =
    process.env.VITE_DEV_SERVER_URL ||
    pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
  const send = (event: string, data?: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(event, data);
  };
  scanner = new ScannerClient(
    (p) => send("scan:progress", p),
    (e) => {
      busy = false;
      send("scan:error", e);
    },
  );
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        event.senderFrame.url !== url
      )
        throw new Error("Untrusted sender.");
      return fn(...args);
    });
  handle("drives", () => drives());
  handle("choose", async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Choose a folder to analyze",
    });
    return r.canceled ? null : r.filePaths[0];
  });
  handle("start", (target) => {
    if (busy) throw new Error("A scan is already running.");
    const root = validateTarget(target);
    generation++;
    busy = true;
    void scanner
      .call("scan", root, {
        ignoredFolders: settings.ignoredFolders,
        ignoredExtensions: settings.ignoredExtensions,
        maxEntries: 500000,
      })
      .then(() => send("scan:done"))
      .catch((e) => send("scan:error", e.message))
      .finally(() => {
        busy = false;
      });
  });
  handle("cancel", () => scanner.call("cancel"));
  handle("summary", () => scanner.call("summary"));
  handle("files", (q) => scanner.call("files", validateQuery(q)));
  handle("folder", (id) => scanner.call("folder", entryId(id)));
  handle("action", async (id, action) => {
    if (action !== "reveal" && action !== "open")
      throw new Error("Invalid action.");
    const node = await scanner.call<Entry | undefined>("entry", entryId(id));
    if (!node) throw new Error("Entry no longer exists.");
    const s = await lstat(node.path);
    if (s.isDirectory() !== node.directory)
      throw new Error("This entry changed type. Rescan before opening.");
    if (s.isSymbolicLink())
      throw new Error(
        "This entry has become a symbolic link. Rescan before opening.",
      );
    if (action === "reveal") {
      shell.showItemInFolder(node.path);
      return;
    }
    if (settings.confirmOpen || !node.directory) {
      const r = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Cancel", "Open"],
        defaultId: 0,
        cancelId: 0,
        message: `Open ${node.name}?`,
        detail:
          "This launches the file or folder in its associated application. Only open files you trust.",
      });
      if (r.response !== 1) return;
    }
    const error = await shell.openPath(node.path);
    if (error) throw new Error(error);
  });
  handle("export", async (format, q) => {
    if (format !== "json" && format !== "csv")
      throw new Error("Invalid export format.");
    const query = validateQuery(q);
    const exportGeneration = generation;
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `DiskAtlas-scan.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (exportGeneration !== generation)
      throw new Error(
        "The scan changed while choosing an export location. Export again.",
      );
    return scanner.call("export", r.filePath, format, query);
  });
  handle("settings", () => settings);
  handle("settings:save", async (input) => {
    const next = validateSettings(input);
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(settingsPath() + ".tmp", JSON.stringify(next, null, 2));
    await rename(settingsPath() + ".tmp", settingsPath());
    settings = next;
    return settings;
  });
  await win.loadURL(url);
});
app.on("window-all-closed", () => {
  scanner?.close();
  app.quit();
});
