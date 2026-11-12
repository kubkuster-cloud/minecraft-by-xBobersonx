const { app, BrowserWindow, ipcMain, shell, safeStorage, Tray, Menu, net, dialog, nativeImage } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { Client, Authenticator } = require("minecraft-launcher-core");
const { Auth } = require("msmc");
const { autoUpdater } = require("electron-updater");
const AdmZip = require("adm-zip");
const {
  installPack, packName, forgePack, packFor, packModsDir, listMods, setModEnabled, searchMods, installOwnMod, checkOwnUpdates, updateOwnMod,
} = require("./modpack");
const mrpack = require("./mrpack");
const { getJava, JVM_FLAGS } = require("./java");
const content = require("./content");
const { analyze, findCrashReport, stackSuspects } = require("./crash");
const disk = require("./disk");
const gameOptions = require("./options");
const sharedFiles = require("./shared");
const servers = require("./servers");
const I18N = require("./i18n");
const t = I18N.t;

const ICON = path.join(__dirname, "assets", "icon.png");

// Domyślne ustawienia graficzne dla nowej wersji (tylko gdy gra nie ma jeszcze options.txt)
// Ustawienia startowe nowych graczy (klawisze, grafika, język). Zawiera numer wersji — bez niego gra by ich nie wczytała.
const DEFAULT_OPTIONS = path.join(__dirname, "default-options.txt");

// Dane okna (w tym klucz szyfrujący zapisane konta) zostają w starym folderze mimo zmiany nazwy na BobrMC
app.setPath("userData", path.join(app.getPath("appData"), "minecraft-by-xbobersonx"));

const GAME_DIR = path.join(app.getPath("appData"), ".minecraft_by_xbobersonx");
const SETTINGS_FILE = path.join(GAME_DIR, "launcher_settings.json");
const ACCOUNTS_FILE = path.join(GAME_DIR, "accounts.dat");
const OLD_ACCOUNT_FILE = path.join(GAME_DIR, "account.dat");
const OLD_PROFILE_FILE = path.join(GAME_DIR, "account-profile.json");
const SHARED_OPTIONS = path.join(GAME_DIR, "shared-options.txt");
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META = "https://meta.fabricmc.net/v2/versions/loader";
const FORGE_MAVEN = "https://maven.minecraftforge.net/";

let win;
let tray = null;
let gameRunning = false;
let msMinecraft = null; // zalogowane konto Microsoft (obiekt Minecraft z msmc)

// Wiadomość do okna launchera (pomijana, jeśli okno jest już zamknięte)
const send = (channel, data) => win && !win.isDestroyed() && win.webContents.send(channel, data);

// Na czas gry launcher chowa się do zasobnika (obok zegara) i wraca po zamknięciu gry
function hideToTray() {
  if (!win || win.isDestroyed()) return;
  if (!tray) {
    tray = new Tray(ICON);
    tray.setToolTip(t("BobrMC — gra działa"));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t("Pokaż launcher"), click: showFromTray },
      { label: t("Zamknij launcher"), click: () => app.quit() },
    ]));
    tray.on("click", showFromTray);
  }
  win.hide();
}

function showFromTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

// Automatyczne aktualizacje z GitHub Releases (tylko w zainstalowanej wersji;
// wersja portable i uruchomienie przez npm start ich nie obsługują)
function setupAutoUpdate() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", info => send("update:available", info.version));
  autoUpdater.on("download-progress", p => send("update:progress", Math.round(p.percent)));
  autoUpdater.on("update-downloaded", info => send("update:ready", info.version));
  autoUpdater.on("error", err => console.error("Aktualizacja:", err.message));
  autoUpdater.checkForUpdates().catch(err => console.error("Aktualizacja:", err.message));
}

ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());

// Ręczne sprawdzenie aktualizacji z ustawień — zwraca tekst do pokazania
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) {
    return "Automatyczne aktualizacje działają tylko w wersji zainstalowanej z instalatora (Setup.exe).";
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result && result.updateInfo ? result.updateInfo.version : null;
    if (!latest || latest === app.getVersion()) return `Masz najnowszą wersję (${app.getVersion()}).`;
    return `Jest nowa wersja ${latest} — pobieranie w tle, pasek u góry pokaże, kiedy będzie gotowa.`;
  } catch (err) {
    return `Nie udało się sprawdzić aktualizacji: ${err.message}`;
  }
});

// Przyciski okna z własnego paska tytułu
ipcMain.on("window:minimize", () => win && win.minimize());
ipcMain.on("window:toggle-maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("window:close", () => win && win.close());
ipcMain.handle("window:is-maximized", () => Boolean(win && win.isMaximized()));
ipcMain.on("lang:set", (_e, lang) => I18N.setLang(lang));
ipcMain.handle("open:github", () => shell.openExternal("https://github.com/kubkuster-cloud/minecraft-by-xBobersonx"));

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 1100,
    minHeight: 680,
    title: "BobrMC",
    backgroundColor: "#0b0d12",
    // okno bez ramki: pasek tytułu i przyciski okna rysuje launcher (index.html)
    frame: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  win.setMenu(null);
  const sendMaximized = () => send("window:maximized", win.isMaximized());
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);
  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.once("did-finish-load", setupAutoUpdate);
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {}; // pierwsze uruchomienie — RAM ustawi się na „Zalecane”
  }
}

function saveSettings(settings) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

ipcMain.handle("settings:load", () => loadSettings());
ipcMain.handle("settings:save", (_e, s) => saveSettings(s));
ipcMain.handle("system:ram", () => Math.floor(os.totalmem() / 1024 ** 3));

// ---------- Tryb offline ----------

// Pobiera JSON i zapisuje kopię; bez internetu zwraca ostatnią zapisaną kopię
async function cachedJson(url, name) {
  const file = path.join(GAME_DIR, "cache", "launcher", `${name}.json`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return { data, offline: false };
  } catch (err) {
    if (!fs.existsSync(file)) throw err;
    return { data: JSON.parse(fs.readFileSync(file, "utf8")), offline: true };
  }
}

// ---------- Dane dla ekranu Home ----------
const HOME_UA = { "User-Agent": "BobrMC-launcher" };
const PLAYTIME_FILE = path.join(GAME_DIR, "playtime.json");
const NEWS_REPO = "kubkuster-cloud/minecraft-by-xBobersonx";

// Plik JSON z cache launchera; zły albo brak = fallback
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

// Skin jako data URL (okno nie łączy się z internetem samo). Konto Microsoft podaje adres skina,
// dla nicku pytamy Mojang, czy taki gracz istnieje. Wynik trzymamy 6 h, bez internetu — ostatni zapisany.
ipcMain.handle("skin:get", async (_e, { nick, url }) => {
  const key = (url ? "url-" + url.split("/").pop() : "nick-" + String(nick || "").toLowerCase()).replace(/[^\w.-]/g, "_");
  const cacheFile = path.join(GAME_DIR, "cache", "skins", key + ".json");
  const cached = readJson(cacheFile, null);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return cached.skin;
  try {
    let skinUrl = url, slim = false;
    if (!skinUrl) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick || "")) return null;
      const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${nick}`, { headers: HOME_UA });
      if (res.status === 404 || res.status === 204) {
        writeJson(cacheFile, { at: Date.now(), skin: null });
        return null;
      }
      const { id } = await res.json();
      const profile = await (await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { headers: HOME_UA })).json();
      const textures = JSON.parse(Buffer.from(profile.properties.find(p => p.name === "textures").value, "base64").toString());
      const skin = textures.textures && textures.textures.SKIN;
      if (!skin) return null;
      skinUrl = skin.url;
      slim = !!(skin.metadata && skin.metadata.model === "slim");
    }
    if (!/^https?:\/\/textures\.minecraft\.net\//.test(skinUrl)) return null;
    const png = Buffer.from(await (await fetch(skinUrl.replace(/^http:/, "https:"), { headers: HOME_UA })).arrayBuffer());
    const result = { data: "data:image/png;base64," + png.toString("base64"), slim };
    writeJson(cacheFile, { at: Date.now(), skin: result });
    return result;
  } catch {
    return cached ? cached.skin : null;
  }
});

// Ostatnie wydania launchera z GitHub Releases (Co nowego). Bez internetu — ostatnio pobrane.
ipcMain.handle("news:get", async () => {
  const cacheFile = path.join(GAME_DIR, "cache", "launcher", "news.json");
  try {
    const res = await fetch(`https://api.github.com/repos/${NEWS_REPO}/releases?per_page=5`, {
      headers: { ...HOME_UA, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const items = (await res.json())
      .filter(r => !r.draft)
      .slice(0, 5)
      .map(r => ({ tag: r.tag_name, title: r.name || r.tag_name, body: r.body || "", date: r.published_at, url: r.html_url }));
    writeJson(cacheFile, items);
    return { items, offline: false };
  } catch {
    return { items: readJson(cacheFile, []), offline: true };
  }
});

// Otwiera stronę wydania w przeglądarce — tylko adresy z repozytorium launchera
ipcMain.handle("open:release", (_e, url) => {
  if (typeof url === "string" && url.startsWith(`https://github.com/${NEWS_REPO}/`)) shell.openExternal(url);
});

// Czas gry na każdej wersji i ostatnie uruchomienia (szybki start)
ipcMain.handle("home:playtime", () => readJson(PLAYTIME_FILE, { versions: {}, history: [] }));

function recordPlay(entry, seconds) {
  const data = readJson(PLAYTIME_FILE, { versions: {}, history: [] });
  data.versions[entry.key] = (data.versions[entry.key] || 0) + Math.max(0, Math.round(seconds));
  const same = h => h.key === entry.key && (h.server || null) === (entry.server || null) && (h.world || null) === (entry.world || null);
  data.history = [entry, ...data.history.filter(h => !same(h))].slice(0, 12);
  writeJson(PLAYTIME_FILE, data);
}

// Światy wersji (do szybkiego startu): nazwa folderu, nazwa świata, czas ostatniej gry, ikona
ipcMain.handle("home:worlds", (_e, { version, instance }) => {
  const saves = path.join(instanceDir(version, instance), "saves");
  if (!fs.existsSync(saves)) return [];
  return fs.readdirSync(saves, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(saves, d.name, "level.dat")))
    .map(d => {
      const dir = path.join(saves, d.name);
      const icon = path.join(dir, "icon.png");
      return {
        folder: d.name,
        at: fs.statSync(path.join(dir, "level.dat")).mtimeMs,
        icon: fs.existsSync(icon) && fs.statSync(icon).size < 200000 ? "data:image/png;base64," + fs.readFileSync(icon).toString("base64") : null,
      };
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
});

// Wersje, które były już uruchomione (mają pobraną paczkę) — tylko na nich da się grać bez internetu
function installedVersions() {
  const dir = path.join(GAME_DIR, "instances");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => n.startsWith("pack-") && fs.existsSync(path.join(dir, n, ".xbobersonx-pack.json")))
    .map(n => n.slice("pack-".length));
}

ipcMain.handle("versions:list", async () => {
  const { data, offline } = await cachedJson(MANIFEST_URL, "version_manifest");
  return {
    latest: data.latest,
    versions: data.versions.map(v => ({ id: v.id, type: v.type })),
    offline,
    installed: installedVersions(),
    modpacks: mrpack.listModpacks(GAME_DIR),
  };
});

// Pobiera profil Fabric dla danej wersji gry i zapisuje go w versions/,
// zwraca jego id (np. "fabric-loader-0.16.10-1.21.1") do użycia jako version.custom.
// Bez internetu używa wcześniej zapisanego profilu.
// loaderVersion: konkretna wersja Fabric Loadera (modpacki jej wymagają); bez niej — najnowsza stabilna
async function installFabric(gameVersion, loaderVersion) {
  try {
    let loader = loaderVersion;
    if (!loader) {
      const res = await fetch(`${FABRIC_META}/${gameVersion}`);
      const loaders = await res.json();
      if (!Array.isArray(loaders) || loaders.length === 0) {
        throw new Error(`Fabric nie jest dostępny dla wersji ${gameVersion}`);
      }
      loader = (loaders.find(l => l.loader.stable) || loaders[0]).loader.version;
    }

    const profileRes = await fetch(`${FABRIC_META}/${gameVersion}/${loader}/profile/json`);
    if (!profileRes.ok) throw new Error(`Fabric: ${profileRes.status}`);
    const profile = await profileRes.json();
    const dir = path.join(GAME_DIR, "versions", profile.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
    return profile.id;
  } catch (err) {
    const versionsDir = path.join(GAME_DIR, "versions");
    const wanted = loaderVersion ? `fabric-loader-${loaderVersion}-${gameVersion}` : null;
    const saved = fs.existsSync(versionsDir)
      ? fs.readdirSync(versionsDir)
          .filter(n => n.startsWith("fabric-loader-") && n.endsWith(`-${gameVersion}`))
          .filter(n => !wanted || n === wanted)
          .filter(n => fs.existsSync(path.join(versionsDir, n, `${n}.json`)))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];
    if (saved.length === 0) throw new Error(`Brak internetu — wersję ${gameVersion} trzeba raz uruchomić z internetem`);
    return saved[saved.length - 1];
  }
}

// Stary Forge (1.8.9) uruchamiany przez minecraft-launcher-core z pliku „universal”.
// Plik leży w libraries/ jak każda biblioteka; bez internetu używamy już pobranego.
async function installForge(build) {
  const rel = `net/minecraftforge/forge/${build}/forge-${build}-universal.jar`;
  const file = path.join(GAME_DIR, "libraries", ...rel.split("/"));
  if (fs.existsSync(file)) return file;
  let res;
  try {
    res = await fetch(FORGE_MAVEN + rel);
  } catch {
    throw new Error("Brak internetu — Forge trzeba raz pobrać z internetem");
  }
  if (!res.ok) throw new Error(`Nie udało się pobrać Forge ${build} (${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  // urwane pobieranie dałoby uszkodzony plik, przez który gra się nie uruchomi
  let valid = false;
  try { valid = !!new AdmZip(data).getEntry("version.json"); } catch {}
  if (!valid) throw new Error("Uszkodzony plik Forge — spróbuj ponownie");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

// Wersje gry na Forge z własną paczką: { "1.8.9": "xBobersonx PvP" }
ipcMain.handle("forge:versions", () => {
  const result = {};
  for (const v of Object.keys(require("./modpack.json").forge || {})) result[v] = packFor(v).name;
  return result;
});

ipcMain.handle("fabric:versions", async () => {
  const { data } = await cachedJson("https://meta.fabricmc.net/v2/versions/game", "fabric_versions");
  return data.map(v => v.version);
});

ipcMain.handle("app:version", () => require("./package.json").version);

// Paczka modów ma osobny folder gry na każdą wersję, żeby mody się nie mieszały
function packDir(version) {
  return path.join(GAME_DIR, "instances", `pack-${version}`);
}

// Folder gry dla wpisu z listy wersji: paczka xBobersonx ("pack") albo modpack ("mp:<slug>")
function instanceDir(version, instance) {
  return instance && instance.startsWith("mp:") ? mrpack.modpackDir(GAME_DIR, instance.slice(3)) : packDir(version);
}

const logToConsole = msg => send("game:log", msg);

ipcMain.handle("pack:name", () => packName);

ipcMain.handle("mods:list", (_e, { version, instance }) => listMods(instanceDir(version, instance), version));
ipcMain.handle("mods:toggle", (_e, { version, instance, tab, key, enabled }) =>
  setModEnabled(instanceDir(version, instance), tab, key, enabled, version));
ipcMain.handle("mods:search", (_e, { version, instance, query }) =>
  searchMods(instanceDir(version, instance), version, query));
ipcMain.handle("mods:install", (_e, { version, instance, id }) =>
  installOwnMod(instanceDir(version, instance), version, id, logToConsole));
ipcMain.handle("mods:check-updates", (_e, { version, instance }) =>
  checkOwnUpdates(instanceDir(version, instance), version));
ipcMain.handle("mods:update", (_e, { version, instance, file }) => {
  if (gameRunning) throw new Error("Zamknij grę, zanim zaktualizujesz mody");
  return updateOwnMod(instanceDir(version, instance), version, file, logToConsole);
});

// Shadery i paczki tekstur (type: "shader" | "resourcepack")
ipcMain.handle("content:list", (_e, { version, instance, type }) => content.listContent(instanceDir(version, instance), version, type));
ipcMain.handle("content:search", (_e, { version, instance, type, query }) =>
  content.searchContent(instanceDir(version, instance), version, type, query));
ipcMain.handle("content:install", (_e, { version, instance, type, id }) =>
  content.installContent(instanceDir(version, instance), version, type, id));
ipcMain.handle("content:toggle", (_e, { version, instance, type, file, enabled }) =>
  content.setContentEnabled(instanceDir(version, instance), version, type, file, enabled));
ipcMain.handle("content:delete", (_e, { version, instance, type, file }) =>
  content.deleteContent(instanceDir(version, instance), version, type, file));

// Modpacki z Modrinth
ipcMain.handle("modpacks:list", () => mrpack.listModpacks(GAME_DIR));
ipcMain.handle("modpacks:search", (_e, { query }) => mrpack.searchModpacks(GAME_DIR, query));
ipcMain.handle("modpacks:install", (_e, { id }) =>
  mrpack.installModpack(GAME_DIR, id, {
    log: logToConsole,
    progress: p => send("modpacks:progress", p),
  }));
ipcMain.handle("modpacks:import", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: t("Importuj modpack"),
    filters: [{ name: "Modpack (.mrpack)", extensions: ["mrpack", "mcpack"] }],
    properties: ["openFile"],
  });
  if (canceled) return null;
  return mrpack.importModpack(GAME_DIR, filePaths[0], {
    log: logToConsole,
    progress: p => send("modpacks:progress", p),
  });
});
ipcMain.handle("modpacks:delete", async (_e, { slug, title }) => {
  if (gameRunning) throw new Error("Zamknij grę, zanim usuniesz modpack");
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: t("Usuń modpack"),
    message: t(`Usunąć modpack ${title}?`),
    detail: t("Razem z nim znikną jego światy, ustawienia i mody. Tego nie da się cofnąć."),
    buttons: [t("Usuń"), t("Anuluj")],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return false;
  mrpack.deleteModpack(GAME_DIR, slug);
  return true;
});

ipcMain.handle("folder:mods", (_e, { version, instance, preinstalled, content: type } = {}) => {
  const base = instanceDir(version, instance);
  const folders = { shader: "shaderpacks", resourcepack: "resourcepacks" };
  const dir = type ? path.join(base, folders[type]) : path.join(base, "mods", preinstalled ? "preinstalled" : "");
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// Zapisane konta Microsoft, zaszyfrowane przez system (DPAPI w Windows).
// Format: { active: id konta albo null (non-premium), list: [{ id, name, skin, token }] }
const NO_ACCOUNTS = () => ({ active: null, list: [] });
const LEGACY_ID = "legacy"; // konto ze starej wersji, której profil się nie zachował
let offlineProfile = null; // konto Microsoft bez internetu — nazwa i UUID bez tokenów
let loginSeq = 0; // przełączenie konta unieważnia logowanie, które jeszcze trwa

function encrypt(text) {
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text);
}

function decrypt(data) {
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString();
}

function saveAccounts(store) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, encrypt(JSON.stringify(store)));
}

// Starsze wersje trzymały jedno konto w account.dat i account-profile.json
function migrateOldAccount() {
  if (!fs.existsSync(OLD_ACCOUNT_FILE)) return null;
  let profile = {};
  try { profile = JSON.parse(fs.readFileSync(OLD_PROFILE_FILE, "utf8")); } catch {}
  const id = profile.id || LEGACY_ID;
  const account = { id, name: profile.name || "Konto Microsoft", skin: profile.skin || null, token: decrypt(fs.readFileSync(OLD_ACCOUNT_FILE)) };
  const store = { active: id, list: [account] };
  saveAccounts(store);
  fs.rmSync(OLD_ACCOUNT_FILE, { force: true });
  fs.rmSync(OLD_PROFILE_FILE, { force: true });
  return store;
}

function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) return JSON.parse(decrypt(fs.readFileSync(ACCOUNTS_FILE)));
    return migrateOldAccount() || NO_ACCOUNTS();
  } catch {
    console.error("Nie udało się odczytać zapisanych kont");
    return NO_ACCOUNTS();
  }
}

function clearActiveAccount() {
  loginSeq++;
  msMinecraft = null;
  offlineProfile = null;
}

// Zwraca null, jeśli w międzyczasie gracz wybrał inne konto
async function finishLogin(xbox, seq) {
  const mc = await xbox.getMinecraft();
  if (seq !== loginSeq) return null;
  if (!mc.profile) throw new Error("To konto Microsoft nie ma kupionego Minecrafta");
  msMinecraft = mc;
  offlineProfile = null;
  const skins = mc.profile.skins || [];
  const url = (skins.find(s => s.state === "ACTIVE") || skins[0] || {}).url;
  const skin = url ? url.replace(/^http:/, "https:") : null;
  const account = { id: mc.profile.id, name: mc.profile.name, skin, token: xbox.save() };
  const store = loadAccounts();
  const others = store.list.filter(a => a.id !== LEGACY_ID);
  const index = others.findIndex(a => a.id === account.id);
  if (index >= 0) others[index] = account; else others.push(account);
  saveAccounts({ active: account.id, list: others });
  return { name: account.name, skin };
}

// Logowanie z zapisanego tokenu (bez okna). Bez internetu gramy offline na tym samym profilu.
async function activateAccount(account) {
  const seq = ++loginSeq;
  try {
    const xbox = await new Auth("select_account").refresh(account.token);
    if (seq !== loginSeq) return null;
    return await finishLogin(xbox, seq);
  } catch (err) {
    if (net.isOnline() || account.id === LEGACY_ID || seq !== loginSeq) throw err;
    msMinecraft = null;
    offlineProfile = { id: account.id, name: account.name };
    const store = loadAccounts();
    saveAccounts({ ...store, active: account.id });
    return { name: account.name, skin: null, offline: true };
  }
}

function removeAccount(id) {
  const store = loadAccounts();
  if (store.active === id) {
    clearActiveAccount();
    store.active = null;
  }
  store.list = store.list.filter(a => a.id !== id);
  saveAccounts(store);
}

ipcMain.handle("auth:microsoft", async () => {
  const xbox = await new Auth("select_account").launch("electron");
  return finishLogin(xbox, ++loginSeq);
});

ipcMain.handle("auth:restore", async () => {
  const store = loadAccounts();
  const account = store.list.find(a => a.id === store.active);
  if (!account) return null;
  try {
    return await activateAccount(account);
  } catch (err) {
    console.error("Nie udało się przywrócić logowania:", err);
    return null;
  }
});

// Bez tokenów — do okna trafiają tylko nazwy
ipcMain.handle("auth:accounts", () => {
  const store = loadAccounts();
  return store.list.map(({ id, name }) => ({ id, name, active: id === store.active }));
});

ipcMain.handle("auth:switch", (_e, id) => {
  const account = loadAccounts().list.find(a => a.id === id);
  if (!account) throw new Error("Nie ma takiego konta");
  return activateAccount(account);
});

ipcMain.handle("auth:use-nick", () => {
  clearActiveAccount();
  saveAccounts({ ...loadAccounts(), active: null });
});

ipcMain.handle("auth:remove", (_e, id) => removeAccount(id));
ipcMain.handle("auth:logout", () => removeAccount(loadAccounts().active));

// Dane logowania dla gry: konto Microsoft (odświeżone, jeśli się da), zapisany profil bez internetu
// albo konto non-premium z samym nickiem
async function gameAuthorization(nick, log) {
  if (msMinecraft) {
    // token Minecrafta ważny jest ok. 24h — odśwież, jeśli wygasł
    if (!msMinecraft.validate()) {
      try {
        msMinecraft = await msMinecraft.refresh(true);
      } catch (err) {
        log(`[konto] Nie można odświeżyć logowania (${err.message || err}) — gram offline na tym koncie`);
      }
    }
    return msMinecraft.mclc();
  }
  if (offlineProfile) {
    log("[konto] Brak internetu — gram offline na zapisanym koncie Microsoft");
    return {
      access_token: "0",
      client_token: "0",
      uuid: offlineProfile.id,
      name: offlineProfile.name,
      user_properties: "{}",
      meta: { type: "msa", demo: false },
    };
  }
  return Authenticator.getAuth(nick);
}

// Analiza crasha + powiązanie podejrzanych modów z plikami, żeby można je było wyłączyć
function describeCrash(instanceDir, version, log, code, reportFile) {
  const report = reportFile ? fs.readFileSync(reportFile, "utf8") : "";
  let { reason, generic, suspects, details } = analyze(log, code, report);
  const { own, pre } = listMods(instanceDir, version);
  const all = [...own.map(m => ({ ...m, tab: "own" })), ...pre.map(m => ({ ...m, tab: "pre" }))];

  // stos wywołań: w kodzie którego moda gra się wysypała (tylko mody, które były włączone)
  const ownDir = path.join(instanceDir, "mods");
  const preDir = packModsDir(instanceDir, version);
  const running = all
    .filter(m => m.enabled && m.modId)
    .map(m => ({ modId: m.modId, path: path.join(m.tab === "own" ? ownDir : preDir, m.file) }));
  let fromStack = [];
  try {
    fromStack = stackSuspects(`${report}\n${log}`, running)
      .filter(id => !["minecraft", "java", "fabricloader", "fabric", "forge", "fml", "mcp", "mixinextras"].includes(id));
  } catch {}
  const explicit = suspects.length > 0;
  suspects = [...new Set([...suspects, ...fromStack])].slice(0, 4);
  if (generic && !explicit && fromStack.length) {
    const first = all.find(m => m.modId === fromStack[0]);
    reason = `Gra wysypała się w kodzie moda ${first ? first.title : fromStack[0]}. ` +
      "Wyłącz go poniżej i uruchom grę ponownie — jeśli to nie pomoże, spróbuj następnego z listy.";
  }

  const mods = [];
  const unknown = [];
  for (const id of suspects) {
    const mod = all.find(m => m.modId === id);
    if (mod) mods.push({ title: mod.title, tab: mod.tab, key: mod.key, enabled: mod.enabled, library: !!mod.library });
    else unknown.push(id);
  }
  return { version, reason, details, mods, unknown, report: reportFile };
}

ipcMain.handle("crash:open-report", (_e, file) => shell.openPath(file));

// ---------- Miejsce na dysku ----------

// 1 świat, 2 światy, 5 światów
function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
const UPDATER_CACHE = path.join(app.getPath("home"), "AppData", "Local", "minecraft-by-xbobersonx-updater");

function ensureGameClosed() {
  if (gameRunning) throw new Error("Zamknij grę, zanim zaczniesz sprzątać");
}

ipcMain.handle("disk:scan", () => disk.scan(GAME_DIR, UPDATER_CACHE));
ipcMain.handle("disk:clean", () => {
  ensureGameClosed();
  return disk.cleanJunk(GAME_DIR, UPDATER_CACHE);
});
ipcMain.handle("disk:delete-version", async (_e, { key, label, worlds }) => {
  ensureGameClosed();
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: t("Usuń wersję"),
    message: t(`Usunąć ${label}?`),
    detail: t(worlds > 0
      ? `Razem z wersją znikną ${worlds} ${plural(worlds, "świat", "światy", "światów")}, mody, shadery i ustawienia tej wersji. Tego nie da się cofnąć.`
      : "Znikną mody, shadery i ustawienia tej wersji. Przy następnym uruchomieniu wszystko pobierze się od nowa."),
    buttons: [t("Usuń"), t("Anuluj")],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return null;
  return disk.deleteVersion(GAME_DIR, key);
});
ipcMain.handle("disk:open", () => shell.openPath(GAME_DIR));

// ---------- Własne tło launchera ----------
const BG_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

function customBackground() {
  if (!fs.existsSync(GAME_DIR)) return null;
  const name = fs.readdirSync(GAME_DIR).find(n => n.startsWith("background.") && BG_TYPES[path.extname(n).toLowerCase()]);
  return name ? path.join(GAME_DIR, name) : null;
}

// Obraz jako data URL — strona launchera nie może czytać plików spoza swojego folderu
function asDataUrl(file) {
  return `data:${BG_TYPES[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString("base64")}`;
}

// Folder ze screenshotami z ostatnio używanej wersji — tam okno wyboru otwiera się na start
function screenshotsDir() {
  const instances = path.join(GAME_DIR, "instances");
  if (!fs.existsSync(instances)) return app.getPath("pictures");
  const dirs = fs.readdirSync(instances)
    .map(n => path.join(instances, n, "screenshots"))
    .filter(d => fs.existsSync(d))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || app.getPath("pictures");
}

ipcMain.handle("background:get", () => {
  const file = customBackground();
  return file ? asDataUrl(file) : null;
});

ipcMain.handle("background:choose", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: t("Wybierz tło launchera"),
    defaultPath: screenshotsDir(),
    filters: [{ name: t("Obrazy"), extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths[0]) return null;
  const old = customBackground();
  if (old) fs.rmSync(old, { force: true });
  const target = path.join(GAME_DIR, `background${path.extname(filePaths[0]).toLowerCase()}`);
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.copyFileSync(filePaths[0], target);
  return asDataUrl(target);
});

ipcMain.handle("background:reset", () => {
  const old = customBackground();
  if (old) fs.rmSync(old, { force: true });
});

// Tło menu w grze (mod Bobr Config): to samo co tło launchera, zapisane jako PNG
// w <wersja>/bobrmc/menu-background.png. Bez własnego tła plik jest usuwany i mod pokazuje domyślne tło BobrMC.
const MENU_BACKGROUND = path.join("bobrmc", "menu-background.png");
function syncMenuBackground(gameDir) {
  const target = path.join(gameDir, MENU_BACKGROUND);
  try {
    const source = customBackground();
    // gra czyta tylko PNG (1.8.9 też JPG) — dlatego przepisujemy obraz; webp/gif, których Electron nie odczyta, pomijamy
    let image = source ? nativeImage.createFromPath(source) : null;
    if (!image || image.isEmpty()) {
      fs.rmSync(target, { force: true });
      return;
    }
    if (image.getSize().width > 2560) image = image.resize({ width: 2560, quality: "best" });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, image.toPNG());
  } catch (err) {
    console.warn("Tło menu w grze:", err.message);
  }
}

// "-Da=1 -Xss2M" -> ["-Da=1", "-Xss2M"]; cudzysłowy grupują argumenty ze spacjami
function splitArgs(text) {
  return (text.match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ""));
}

// ---------- Serwery ----------

// wynik „premium / non-premium” zapamiętujemy na dobę, żeby nie logować się na serwer przy każdym otwarciu okna
const PREMIUM_CACHE = path.join(GAME_DIR, "cache", "launcher", "servers-premium.json");
const PREMIUM_TTL = 24 * 3600 * 1000;

// trzymany w pamięci: okno pinguje wszystkie serwery naraz, a osobne czytanie pliku gubiłoby wpisy
let premiumCache = null;

ipcMain.handle("servers:ping", async (_e, address) => {
  const info = await servers.ping(address);
  const key = `${info.host}:${info.port}`;
  if (!premiumCache) {
    try { premiumCache = JSON.parse(fs.readFileSync(PREMIUM_CACHE, "utf8")); } catch { premiumCache = {}; }
  }
  const cache = premiumCache;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < PREMIUM_TTL) {
    info.premium = hit.premium;
  } else {
    info.premium = await servers.checkPremium(info.host, info.port, info.protocol);
    if (info.premium) {
      cache[key] = { premium: info.premium, at: Date.now() };
      fs.mkdirSync(path.dirname(PREMIUM_CACHE), { recursive: true });
      fs.writeFileSync(PREMIUM_CACHE, JSON.stringify(cache));
    }
  }
  return info;
});

// Minecraft 1.20+ ma --quickPlayMultiplayer, starsze wersje --server/--port
function quickPlay(version, address) {
  const [major, minor] = version.split(".").map(Number);
  const legacy = major === 1 && minor < 20;
  return { type: legacy ? "legacy" : "multiplayer", identifier: address };
}

ipcMain.handle("game:launch", async (_e, { nick, version, ram, loader, window: gameWindow, afterLaunch, javaArgs, syncOptions, server, world }) => {
  const launcher = new Client();

  // type trafia do --versionType; Minecraft pokazuje go na dole ekranu tytułowego
  // („Minecraft 1.21.11/xBobersonx”) i w F3
  const gameVersion = { number: version, type: "xBobersonx" };
  // loader: "pack" = paczka xBobersonx Mods, "mp:<slug>" = modpack z Modrinth
  const modpack = loader.startsWith("mp:") ? mrpack.readModpack(GAME_DIR, loader.slice(3)) : null;
  const gameDir = instanceDir(version, loader);
  // 1.8.9 (i inne wersje z sekcji „forge” w modpack.json) działa na Forge, reszta na Fabric
  const forge = !modpack && forgePack(version);
  let forgeJar = null;
  if (forge) {
    send("game:log", `Instalowanie Forge ${forge.build}...`);
    forgeJar = await installForge(forge.build);
    send("game:log", `Forge: ${forge.build}`);
  } else {
    send("game:log", "Instalowanie Fabric...");
    gameVersion.custom = await installFabric(version, modpack && modpack.fabricLoader);
    send("game:log", `Fabric: ${gameVersion.custom}`);
  }
  const javaPath = await getJava(version, {
    runtimeRoot: path.join(GAME_DIR, "runtime"),
    manifestUrl: MANIFEST_URL,
    localJson: path.join(GAME_DIR, "versions", version, `${version}.json`),
    log: msg => send("game:log", msg),
    progress: p => send("game:progress", p),
  });

  const jvmArgs = [...JVM_FLAGS, ...splitArgs(javaArgs || "")];
  if (loader === "pack") {
    const preinstalled = await installPack(packDir(version), version, {
      log: msg => send("game:log", msg),
      progress: p => send("game:progress", p),
    });
    // Fabric nie czyta podfolderów mods/, więc wskazujemy mu preinstalled/ wprost;
    // Forge sam wczytuje mods/<wersja gry>/
    if (!forge) jvmArgs.push(`-Dfabric.addMods=${preinstalled}`);
  }

  // wspólne ustawienia dla wszystkich wersji: options.txt (1.8.9 w przeliczonym formacie),
  // lista serwerów, a w paczce xBobersonx też ustawienia modów, paczki tekstur i shadery
  const shareOptions = syncOptions;
  const shareScope = { loader: forge ? "forge" : "fabric", full: loader === "pack" };
  if (shareOptions) {
    const seededFrom = gameOptions.seed(GAME_DIR, SHARED_OPTIONS);
    if (seededFrom) send("game:log", `[ustawienia] Wspólne ustawienia utworzone z ${seededFrom}`);
    if (gameOptions.push(gameDir, SHARED_OPTIONS, { legacy: !!forge })) send("game:log", "[ustawienia] Wgrano wspólne ustawienia");
    try {
      const done = sharedFiles.push(GAME_DIR, gameDir, shareScope);
      if (done.length) send("game:log", `[ustawienia] Wspólne: ${done.join(", ")}`);
    } catch (err) {
      send("game:log", `[ustawienia] Nie udało się wgrać wspólnych plików: ${err.message}`);
    }
  }
  syncMenuBackground(gameDir);

  if (loader === "pack" && !forge) {
    // domyślne ustawienia tylko dla wersji, w której gra jeszcze ich nie zapisała
    // (options.txt mógł powstać wcześniej z samą listą paczek tekstur)
    const options = path.join(packDir(version), "options.txt");
    const current = fs.existsSync(options) ? fs.readFileSync(options, "utf8") : "";
    if (!current.includes("renderDistance:")) fs.writeFileSync(options, `${fs.readFileSync(DEFAULT_OPTIONS, "utf8")}${current}`);
  }

  // ostatnie linie logu gry — do analizy, jeśli gra się wysypie
  const logTail = [];
  const remember = text => {
    logTail.push(...text.split(/\r?\n/));
    if (logTail.length > 800) logTail.splice(0, logTail.length - 800);
  };
  const startedAt = Date.now();
  let optionsLoadFailed = false; // gra zapisała wtedy domyślne — nie mogą trafić do wspólnej kopii

  launcher.on("progress", p => send("game:progress", p));
  launcher.on("download-status", p => send("game:download", p));
  launcher.on("data", d => {
    send("game:log", d.toString());
    remember(d.toString());
    if (d.toString().includes("Failed to load options")) optionsLoadFailed = true;
  });
  launcher.on("debug", d => send("game:log", d.toString()));
  let playStartedAt = null;
  launcher.on("arguments", () => {
    playStartedAt = Date.now();
    gameRunning = true;
    send("game:started");
    if (afterLaunch === "close") setTimeout(() => app.quit(), 3000); // gra działa dalej jako osobny proces
    else if (afterLaunch !== "keep") hideToTray();
  });
  launcher.on("close", code => {
    gameRunning = false;
    // czas gry i „ostatnio grane” dla ekranu Home
    try {
      if (playStartedAt) recordPlay({ key: `${version}|${loader}`, version, server: server || null, world: world || null, at: Date.now() }, (Date.now() - playStartedAt) / 1000);
    } catch {}
    showFromTray();
    send("game:closed", code);
    // błąd przy sprzątaniu po grze nie może wywalić całego launchera
    try {
      if (shareOptions && !optionsLoadFailed) gameOptions.pull(gameDir, SHARED_OPTIONS, { legacy: !!forge });
      if (shareOptions) sharedFiles.pull(GAME_DIR, gameDir, shareScope);
      const report = findCrashReport(gameDir, startedAt);
      if (code !== 0 || report) {
        send("game:crash", { ...describeCrash(gameDir, version, logTail.join("\n"), code, report), instance: loader });
      }
    } catch (err) {
      send("game:log", `[launcher] Błąd po zamknięciu gry: ${err.message}`);
    }
  });

  const authorization = await gameAuthorization(nick, msg => send("game:log", msg));

  const proc = await launcher.launch({
    root: GAME_DIR,
    authorization,
    version: gameVersion,
    memory: { max: `${ram}G`, min: `${Math.min(2, ram)}G` },
    javaPath,
    forge: forgeJar || undefined,
    overrides: {
      gameDirectory: gameDir,
      url: { mavenForge: FORGE_MAVEN }, // domyślny adres files.minecraftforge.net tylko przekierowuje
    },
    customArgs: jvmArgs,
    quickPlay: server ? quickPlay(version, server) : world ? { type: "singleplayer", identifier: world } : undefined,
    window: gameWindow && gameWindow.fullscreen
      ? { fullscreen: true }
      : { width: (gameWindow && gameWindow.width) || 1280, height: (gameWindow && gameWindow.height) || 720 },
  });
  if (!proc) throw new Error("Nie udało się uruchomić gry (sprawdź logi).");
  return true;
});


// Tylko jedno okno launchera — drugie uruchomienie pokazuje to, które już działa
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showFromTray);
  app.whenReady().then(createWindow);
}
app.on("window-all-closed", () => app.quit());
