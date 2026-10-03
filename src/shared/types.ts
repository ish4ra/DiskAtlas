export type Category =
  | "Video"
  | "Images"
  | "Audio"
  | "Archives"
  | "Documents"
  | "Executables"
  | "Code"
  | "Disk images"
  | "Other";
export interface Entry {
  id: number;
  parent: number | null;
  name: string;
  path: string;
  extension: string;
  category: Category;
  size: number;
  modified: number;
  directory: boolean;
  children: number[];
  fileCount?: number;
  folderCount?: number;
}
export interface Progress {
  files: number;
  folders: number;
  bytes: number;
  elapsed: number;
  current: string;
  skipped: number;
}
export interface ScanResult extends Progress {
  nodes: Entry[];
  status: "complete" | "cancelled" | "limited" | "partial";
  warnings: string[];
  root: string;
}
export interface ScanOptions {
  ignoredFolders: string[];
  ignoredExtensions: string[];
  maxEntries: number;
}
export interface TypeStat {
  category: Category;
  extension: string;
  size: number;
  count: number;
}
export interface Summary extends Progress {
  cached?: boolean;
  backend?: "filesystem" | "ntfs";
  volumeGuid?: string;
  journalId?: string;
  nextUsn?: string;
  accelerationFallback?: string;
  rootIdentity?: string;
  unavailable?: boolean;
  scannedAt?: string;
  root: string;
  status: ScanResult["status"];
  warnings: string[];
  types: TypeStat[];
  extensionCount: number;
  categoryStats: TypeStat[];
  largestFile: Entry | null;
  largestFolder: Entry | null;
}
export interface FileQuery {
  search?: string;
  category?: string;
  extension?: string;
  min?: number;
  max?: number;
  scope?: number;
  sort?: "name" | "path" | "extension" | "size" | "modified";
  direction?: "asc" | "desc";
  offset?: number;
  limit?: number;
}
export interface FilePage {
  rows: Entry[];
  total: number;
}
export interface FolderPage {
  entry: Entry;
  children: Entry[];
  omitted: number;
  omittedSize: number;
  breadcrumbs: Entry[];
}
export interface Drive {
  path: string;
  total: number;
  free: number;
  label: string;
}
export interface Settings {
  storageView?: "details" | "treemap";
  theme: "dark" | "light" | "system";
  defaultTarget: string;
  ignoredFolders: string[];
  ignoredExtensions: string[];
  units: "binary" | "decimal";
  resultCount: number;
  confirmOpen: boolean;
}
export const defaults: Settings = {
  storageView: "details",
  theme: "dark",
  defaultTarget: "",
  ignoredFolders: [],
  ignoredExtensions: [],
  units: "binary",
  resultCount: 100,
  confirmOpen: true,
};
export interface Api {
  drives: () => Promise<Drive[]>;
  choose: () => Promise<string | null>;
  start: (target: string) => Promise<void>;
  cancel: () => Promise<void>;
  summary: () => Promise<Summary | null>;
  files: (q: FileQuery) => Promise<FilePage>;
  folder: (
    id: number,
    offset?: number,
    sort?: "name" | "size" | "modified",
    direction?: "asc" | "desc",
  ) => Promise<FolderPage>;
  clearCache: () => Promise<void>;
  snapshots: () => Promise<{ id: number; root: string; scannedAt?: string }[]>;
  restore: (id: number) => Promise<Summary>;
  copyPath: (id: number) => Promise<void>;
  action: (id: number, action: "reveal" | "open") => Promise<void>;
  export: (format: "json" | "csv", q: FileQuery) => Promise<string | null>;
  settings: () => Promise<Settings>;
  saveSettings: (s: Settings) => Promise<Settings>;
  onProgress: (fn: (p: Progress) => void) => () => void;
  onDone: (fn: () => void) => () => void;
  onError: (fn: (message: string) => void) => () => void;
}
declare global {
  interface Window {
    diskatlas: Api;
  }
}
