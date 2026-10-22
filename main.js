const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { Client, Authenticator } = require("minecraft-launcher-core");
const { Auth } = require("msmc");
const { installPack, packName, listMods, setModEnabled } = require("./modpack");
const { getJava, JVM_FLAGS } = require("./java");

const GAME_DIR = path.join(app.getPath("appData"), ".minecraft_by_xbobersonx");
const SETTINGS_FILE = path.join(GAME_DIR, "launcher_settings.json");
const ACCOUNT_FILE = path.join(GAME_DIR, "account.dat");
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META = "https://meta.fabricmc.net/v2/versions/loader";

let win;
let msMinecraft = null; // zalogowane konto Microsoft (obiekt Minecraft z msmc)

function createWindow() {
  win = new BrowserWindow({
    width: 860,
    height: 520,
    resizable: false,
    maximizable: false,
    title: "Minecraft Launcher by xBobersonx",
    backgroundColor: "#6fa8e8",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { nick: "", version: "", ram: 4, showSnapshots: false };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

ipcMain.handle("settings:load", () => loadSettings());
ipcMain.handle("settings:save", (_e, s) => saveSettings(s));
ipcMain.handle("system:ram", () => Math.floor(os.totalmem() / 1024 ** 3));

ipcMain.handle("versions:list", async () => {
  const res = await fetch(MANIFEST_URL);
  const data = await res.json();
  return { latest: data.latest, versions: data.versions.map(v => ({ id: v.id, type: v.type })) };
});

// Pobiera profil Fabric dla danej wersji gry i zapisuje go w versions/,
// zwraca jego id (np. "fabric-loader-0.16.10-1.21.1") do użycia jako version.custom
async function installFabric(gameVersion) {
  const res = await fetch(`${FABRIC_META}/${gameVersion}`);
  const loaders = await res.json();
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`Fabric nie jest dostępny dla wersji ${gameVersion}`);
  }
  const loader = (loaders.find(l => l.loader.stable) || loaders[0]).loader.version;

  const profileRes = await fetch(`${FABRIC_META}/${gameVersion}/${loader}/profile/json`);
  const profile = await profileRes.json();
  const dir = path.join(GAME_DIR, "versions", profile.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
  return profile.id;
}

ipcMain.handle("fabric:versions", async () => {
  const res = await fetch("https://meta.fabricmc.net/v2/versions/game");
  const data = await res.json();
  return data.map(v => v.version);
});

ipcMain.handle("app:version", () => require("./package.json").version);

// Paczka modów ma osobny folder gry na każdą wersję, żeby mody się nie mieszały
function packDir(version) {
  return path.join(GAME_DIR, "instances", `pack-${version}`);
}

ipcMain.handle("pack:name", () => packName);

ipcMain.handle("mods:list", (_e, { version }) => listMods(packDir(version)));
ipcMain.handle("mods:toggle", (_e, { version, tab, key, enabled }) =>
  setModEnabled(packDir(version), tab, key, enabled));

ipcMain.handle("folder:mods", (_e, { version, loader, preinstalled } = {}) => {
  const base = loader === "pack" ? packDir(version) : GAME_DIR;
  const dir = path.join(base, "mods", preinstalled ? "preinstalled" : "");
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// Token odświeżania Microsoft zapisany na dysku, zaszyfrowany przez system (DPAPI w Windows)
function saveRefreshToken(xbox) {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  const token = xbox.save();
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token);
  fs.writeFileSync(ACCOUNT_FILE, data);
}

function readRefreshToken() {
  const data = fs.readFileSync(ACCOUNT_FILE);
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString();
}

async function finishLogin(xbox) {
  const mc = await xbox.getMinecraft();
  if (!mc.profile) throw new Error("To konto Microsoft nie ma kupionego Minecrafta");
  msMinecraft = mc;
  saveRefreshToken(xbox);
  return { name: msMinecraft.profile.name };
}

ipcMain.handle("auth:microsoft", async () => {
  const xbox = await new Auth("select_account").launch("electron");
  return finishLogin(xbox);
});

// Przy starcie: zaloguj ponownie z zapisanego tokenu (bez okna logowania)
ipcMain.handle("auth:restore", async () => {
  if (!fs.existsSync(ACCOUNT_FILE)) return null;
  try {
    const xbox = await new Auth("select_account").refresh(readRefreshToken());
    return await finishLogin(xbox);
  } catch (err) {
    console.error("Nie udało się przywrócić logowania:", err);
    return null;
  }
});

ipcMain.handle("auth:logout", () => {
  msMinecraft = null;
  fs.rmSync(ACCOUNT_FILE, { force: true });
});

ipcMain.handle("game:launch", async (_e, { nick, version, type, ram, loader }) => {
  const launcher = new Client();
  const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

  // type trafia do --versionType; Minecraft pokazuje go na dole ekranu tytułowego
  // („Minecraft 1.21.11/xBobersonx”) i w F3
  const gameVersion = { number: version, type: "xBobersonx" };
  if (loader === "fabric" || loader === "pack") {
    send("game:log", "Instalowanie Fabric...");
    gameVersion.custom = await installFabric(version);
    send("game:log", `Fabric: ${gameVersion.custom}`);
  }
  const javaPath = await getJava(version, {
    runtimeRoot: path.join(GAME_DIR, "runtime"),
    manifestUrl: MANIFEST_URL,
    log: msg => send("game:log", msg),
    progress: p => send("game:progress", p),
  });

  const jvmArgs = [...JVM_FLAGS];
  if (loader === "pack") {
    const preinstalled = await installPack(packDir(version), version, {
      log: msg => send("game:log", msg),
      progress: p => send("game:progress", p),
    });
    // Fabric nie czyta podfolderów mods/, więc wskazujemy mu preinstalled/ wprost
    jvmArgs.push(`-Dfabric.addMods=${preinstalled}`);
  }

  launcher.on("progress", p => send("game:progress", p));
  launcher.on("download-status", p => send("game:download", p));
  launcher.on("data", d => send("game:log", d.toString()));
  launcher.on("debug", d => send("game:log", d.toString()));
  launcher.on("arguments", () => send("game:started"));
  launcher.on("close", code => send("game:closed", code));

  let authorization;
  if (msMinecraft) {
    // token Minecrafta ważny jest ok. 24h — odśwież, jeśli wygasł
    if (!msMinecraft.validate()) msMinecraft = await msMinecraft.refresh(true);
    authorization = msMinecraft.mclc();
  } else {
    authorization = Authenticator.getAuth(nick);
  }

  const proc = await launcher.launch({
    root: GAME_DIR,
    authorization,
    version: gameVersion,
    memory: { max: `${ram}G`, min: `${Math.min(2, ram)}G` },
    javaPath,
    overrides: loader === "pack" ? { gameDirectory: packDir(version) } : {},
    customArgs: jvmArgs,
  });
  if (!proc) throw new Error("Nie udało się uruchomić gry (sprawdź logi).");
  return true;
});


app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
