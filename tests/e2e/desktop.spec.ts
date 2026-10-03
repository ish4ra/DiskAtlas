import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("real scan, all analysis views, export, settings and cancellation", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "DiskAtlas-validation-"));
  const root = path.join(base, "Workspace");
  const userData = path.join(base, "preferences");
  await mkdir(root);
  const folders: Record<string, [string, number][]> = {
    Media: [
      ["Landscape-film.mp4", 8500000],
      ["Studio-session.wav", 3200000],
      ["City-at-night.jpg", 1700000],
    ],
    Projects: [
      ["DiskAtlas-source.zip", 2400000],
      ["Application.tsx", 150000],
      ["Architecture.pdf", 480000],
    ],
    Downloads: [
      ["Archive-backup.zip", 5100000],
      ["Installer.exe", 2800000],
      ["Reference-guide.pdf", 950000],
    ],
    Documents: [
      ["Annual-report.pdf", 1100000],
      ["Notes.md", 65000],
    ],
    Images: [
      ["Mountain-panorama.png", 2900000],
      ["Portrait.jpg", 1400000],
    ],
  };
  for (const [folder, files] of Object.entries(folders)) {
    await mkdir(path.join(root, folder));
    for (const [name, size] of files)
      await writeFile(path.join(root, folder, name), Buffer.alloc(size, 1));
  }
  const application = await electron.launch({
    executablePath: process.env.DISKATLAS_EXECUTABLE,
    args: [
      ...(process.env.DISKATLAS_EXECUTABLE ? [] : ["."]),
      ...(process.platform === "linux"
        ? [
            "--no-sandbox",
            "--headless",
            "--ozone-platform=headless",
            "--disable-gpu",
          ]
        : []),
    ],
    env: { ...process.env, DISKATLAS_USER_DATA: userData },
  });
  try {
    const page = await application.firstWindow();
    await page.setViewportSize({ width: 1440, height: 1040 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.getByText("Your storage has a story.")).toBeVisible();
    await application.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [target],
      });
    }, root);
    await page
      .getByRole("button", { name: "Choose your first folder" })
      .click();
    await expect(page.locator(".statusbar")).toContainText("Scan complete", {
      timeout: 30000,
    });
    await expect(page.locator(".stats")).toContainText("13");
    await expect(
      page.getByRole("heading", { name: "Storage details" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Expand Media", exact: true })
      .click();
    await expect(page.locator(".details")).toContainText("Landscape-film.mp4");
    await page.screenshot({ path: "test-results/details.png", fullPage: true });
    await page
      .getByRole("group", { name: "Storage visualization" })
      .getByRole("button", { name: "Treemap", exact: true })
      .click();
    await expect(page.locator(".treemap .tile")).toHaveCount(5);
    await page.screenshot({
      path: "test-results/overview.png",
      fullPage: true,
    });
    await page.locator(".tile").filter({ hasText: "Media" }).dblclick();
    await expect(page.locator(".breadcrumbs")).toContainText("Media");
    await expect(page.locator(".treemap .tile")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Largest Files", exact: true })
      .click();
    await expect(page.locator("tbody tr")).toHaveCount(13);
    await page.getByRole("textbox", { name: "Search files" }).fill("Landscape");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("Landscape-film.mp4");
    await page.getByRole("textbox", { name: "Search files" }).fill("");
    await expect(page.locator("tbody tr")).toHaveCount(13);
    await page.getByTitle("Copy path", { exact: true }).first().click();
    await expect
      .poll(() => application.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(path.join(root, "Media", "Landscape-film.mp4"));
    await page.screenshot({
      path: "test-results/largest-files.png",
      fullPage: true,
    });
    await page.getByLabel("Minimum size in MiB").fill("2");
    await expect(page.locator("tbody tr")).toHaveCount(6);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByRole("button", { name: "Largest Files", exact: true })
      .click();
    await expect(page.getByLabel("Minimum size in MiB")).toHaveValue("2");
    await expect(page.locator("tbody tr")).toHaveCount(6);
    await page.getByLabel("Minimum size in MiB").fill("");
    await expect(page.locator("tbody tr")).toHaveCount(13);
    await page.getByRole("button", { name: "File Types", exact: true }).click();
    await expect(page.locator(".category-list")).toContainText("Video");
    await page.screenshot({
      path: "test-results/file-types.png",
      fullPage: true,
    });
    await page.locator(".category-row").filter({ hasText: "Video" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await expect(page.locator(".explorer")).toContainText("Landscape-film.mp4");
    const json = path.join(base, "scan.json");
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, json);
    await page.evaluate(() => window.diskatlas.export("json", {}));
    const data = JSON.parse(await readFile(json, "utf8"));
    expect(data.summary.files).toBe(13);
    expect(data.entries.length).toBe(19);
    const csv = path.join(base, "files.csv");
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, csv);
    await page.evaluate(() =>
      window.diskatlas.export("csv", { category: "Video" }),
    );
    expect(await readFile(csv, "utf8")).toContain("Landscape-film.mp4");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance").selectOption("light");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      JSON.parse(await readFile(path.join(userData, "settings.json"), "utf8"))
        .theme,
    ).toBe("light");
    await page.getByLabel("Appearance").selectOption("dark");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // A directory replaced with a file must not bypass confirmation using stale metadata.
    const media = data.entries.find(
      (n: { name: string }) => n.name === "Media",
    );
    await page.evaluate(async () => {
      const s = await window.diskatlas.settings();
      await window.diskatlas.saveSettings({ ...s, confirmOpen: false });
    });
    await rm(path.join(root, "Media"), { recursive: true });
    await writeFile(path.join(root, "Media"), "changed type");
    const actionError = await page.evaluate(async (id) => {
      try {
        await window.diskatlas.action(id, "open");
        return "";
      } catch (e) {
        return String(e);
      }
    }, media.id);
    expect(actionError).toContain("changed type");
    // Worker handles cancellation through actual IPC while a scan is active.
    const status = await page.evaluate(async (target) => {
      const done = new Promise<string>((resolve) => {
        const off = window.diskatlas.onDone(() => {
          off();
          void window.diskatlas.summary().then((s) => resolve(s!.status));
        });
      });
      await window.diskatlas.start(target);
      await window.diskatlas.cancel();
      return done;
    }, root);
    expect(["cancelled", "complete"]).toContain(status);
    // Export must not silently change snapshots while its native dialog is open.
    await application.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return { canceled: false, filePath: file };
        };
      },
      path.join(base, "stale.json"),
    );
    const staleExport = await page.evaluate(async (target) => {
      const saving = window.diskatlas.export("json", {}).then(
        () => "saved",
        (e) => String(e),
      );
      await window.diskatlas.start(target);
      return saving;
    }, root);
    expect(staleExport).toContain("scan changed");
    await page.evaluate(async () => {
      const s = await window.diskatlas.settings();
      await Promise.all([
        window.diskatlas.saveSettings({ ...s, resultCount: 50 }),
        window.diskatlas.saveSettings({ ...s, resultCount: 250 }),
      ]);
    });
    expect(
      JSON.parse(await readFile(path.join(userData, "settings.json"), "utf8"))
        .resultCount,
    ).toBe(250);
    expect(errors).toEqual([]);
  } finally {
    await application.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("persistent cache and visualization survive a real application restart", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "DiskAtlas-restart-"));
  const root = path.join(base, "root");
  await mkdir(root);
  await writeFile(path.join(root, "cached.txt"), "persisted");
  const launch = () =>
    electron.launch({
      executablePath: process.env.DISKATLAS_EXECUTABLE,
      args: [
        ...(process.env.DISKATLAS_EXECUTABLE ? [] : ["."]),
        ...(process.platform === "linux"
          ? [
              "--no-sandbox",
              "--headless",
              "--ozone-platform=headless",
              "--disable-gpu",
            ]
          : []),
      ],
      env: { ...process.env, DISKATLAS_USER_DATA: path.join(base, "profile") },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.waitForFunction(() => !!window.diskatlas);
    await page.evaluate(async (root) => {
      await new Promise<void>((resolve, reject) => {
        const off = window.diskatlas.onDone(() => {
          off();
          resolve();
        });
        void window.diskatlas.start(root).catch(reject);
      });
      const s = await window.diskatlas.settings();
      await window.diskatlas.saveSettings({ ...s, storageView: "treemap" });
    }, root);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => !!window.diskatlas);
    await expect(
      page.getByText("Cached snapshot — may be stale", { exact: false }),
    ).toBeVisible();
    const state = await page.evaluate(async () => ({
      summary: await window.diskatlas.summary(),
      settings: await window.diskatlas.settings(),
      files: await window.diskatlas.files({}),
    }));
    expect(state.summary?.cached).toBe(true);
    expect(state.files.total).toBe(1);
    expect(state.settings.storageView).toBe("treemap");
    await expect(page.locator(".treemap .tile")).toHaveCount(1);
    await rm(root, { recursive: true });
    expect(
      await page.evaluate(
        async () => (await window.diskatlas.summary())?.unavailable,
      ),
    ).toBe(true);
    await page.evaluate(() => window.diskatlas.clearCache());
    expect(await page.evaluate(() => window.diskatlas.summary())).toBeNull();
  } finally {
    await app.close();
    await rm(base, { recursive: true, force: true });
  }
});
