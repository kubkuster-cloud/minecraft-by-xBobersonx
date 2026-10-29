// Miejsce na dysku: rozmiary wersji i plików wspólnych, sprzątanie śmieci, usuwanie wersji.

const fs = require("fs");
const path = require("path");

async function sizeOf(target) {
  let stat;
  try { stat = await fs.promises.lstat(target); } catch { return 0; }
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of await fs.promises.readdir(target)) total += await sizeOf(path.join(target, entry));
  return total;
}

function subdirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; }
}

// Java potrzebna dla wszystkich pobranych wersji (z versions/ i z instances/).
// Zwraca null, jeśli dla którejś wersji nie da się tego ustalić — wtedy żadnej Javy nie ruszamy.
function neededJava(gameDir) {
  const ids = new Set([
    ...subdirs(path.join(gameDir, "versions")).filter(n => !n.startsWith("fabric-loader-")),
    ...subdirs(path.join(gameDir, "instances")).map(n => instanceInfo(gameDir, n).gameVersion).filter(Boolean),
  ]);
  const needed = new Set();
  for (const id of ids) {
    const candidates = [path.join(gameDir, "versions", id, `${id}.json`), path.join(gameDir, "cache", "json", `${id}.json`)];
    const file = candidates.find(f => fs.existsSync(f));
    if (!file) return null;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      needed.add(json.javaVersion ? json.javaVersion.component : "jre-legacy");
    } catch {
      return null;
    }
  }
  return needed;
}

// Profile Fabric starsze niż najnowszy dla danej wersji gry
function oldFabricProfiles(gameDir) {
  const byGame = new Map();
  for (const name of subdirs(path.join(gameDir, "versions")).filter(n => n.startsWith("fabric-loader-"))) {
    const game = name.split("-").slice(3).join("-");
    if (!byGame.has(game)) byGame.set(game, []);
    byGame.get(game).push(name);
  }
  const old = [];
  for (const names of byGame.values()) {
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    old.push(...names.slice(0, -1));
  }
  return old.map(n => path.join(gameDir, "versions", n));
}

// Rzeczy, które można bezpiecznie usunąć — launcher albo gra odtworzą je w razie potrzeby.
// (natives/ zostają: dla wersji < 1.19 odtworzenie wymaga internetu)
function junkPaths(gameDir, updaterCache) {
  const instances = subdirs(path.join(gameDir, "instances")).map(n => path.join(gameDir, "instances", n));
  const needed = neededJava(gameDir);
  const unusedJava = needed
    ? subdirs(path.join(gameDir, "runtime")).filter(c => !needed.has(c)).map(c => path.join(gameDir, "runtime", c))
    : [];

  return [
    { label: "Logi gry", paths: [path.join(gameDir, "logs"), ...instances.map(i => path.join(i, "logs"))] },
    { label: "Raporty crashy", paths: [path.join(gameDir, "crash-reports"), ...instances.map(i => path.join(i, "crash-reports"))] },
    { label: "Stare wersje Fabric", paths: oldFabricProfiles(gameDir) },
    { label: "Nieużywana Java", paths: unusedJava },
    { label: "Pliki tymczasowe", paths: [updaterCache].filter(Boolean) },
  ];
}

// Folder w instances/: paczka xBobersonx (pack-<wersja>) albo modpack (mp-<slug>)
function instanceInfo(gameDir, name) {
  if (name.startsWith("pack-")) {
    const version = name.slice("pack-".length);
    return { gameVersion: version, label: `Minecraft ${version}`, modpack: false };
  }
  try {
    const info = JSON.parse(fs.readFileSync(path.join(gameDir, "instances", name, ".xbobersonx-modpack.json"), "utf8"));
    return { gameVersion: info.gameVersion, label: `📦 ${info.title} (${info.gameVersion})`, modpack: true };
  } catch {
    return { gameVersion: null, label: name, modpack: true };
  }
}

async function scan(gameDir, updaterCache) {
  const versions = [];
  for (const name of subdirs(path.join(gameDir, "instances")).filter(n => n.startsWith("pack-") || n.startsWith("mp-"))) {
    const dir = path.join(gameDir, "instances", name);
    const meta = instanceInfo(gameDir, name);
    const [total, saves, mods, shaders, packs] = await Promise.all([
      sizeOf(dir),
      sizeOf(path.join(dir, "saves")),
      sizeOf(path.join(dir, "mods")),
      sizeOf(path.join(dir, "shaderpacks")),
      sizeOf(path.join(dir, "resourcepacks")),
    ]);
    // plik gry liczymy przy paczce xBobersonx (modpack tej samej wersji korzysta z tego samego)
    const jar = meta.modpack || !meta.gameVersion ? 0 : await sizeOf(path.join(gameDir, "versions", meta.gameVersion));
    const worlds = subdirs(path.join(dir, "saves")).length;
    versions.push({
      key: name,
      label: meta.label,
      version: meta.gameVersion || "",
      modpack: meta.modpack,
      size: total + jar,
      worlds,
      parts: { saves, mods, content: shaders + packs, other: total - saves - mods - shaders - packs + jar },
    });
  }
  versions.sort((a, b) => (a.modpack - b.modpack) || b.version.localeCompare(a.version, undefined, { numeric: true }));

  const [assets, libraries, java, versionFiles] = await Promise.all([
    sizeOf(path.join(gameDir, "assets")),
    sizeOf(path.join(gameDir, "libraries")),
    sizeOf(path.join(gameDir, "runtime")),
    sizeOf(path.join(gameDir, "versions")),
  ]);

  const junk = [];
  for (const group of junkPaths(gameDir, updaterCache)) {
    let size = 0;
    for (const p of group.paths) size += await sizeOf(p);
    if (size > 0) junk.push({ label: group.label, size });
  }

  const total = await sizeOf(gameDir);
  return {
    total,
    versions,
    shared: [
      { label: "Zasoby gry (dźwięki, tekstury) — wspólne dla wszystkich wersji", size: assets },
      { label: "Biblioteki", size: libraries },
      { label: "Java", size: java },
      { label: "Pliki wersji gry i Fabric", size: versionFiles },
    ],
    junk,
    junkSize: junk.reduce((s, j) => s + j.size, 0),
  };
}

async function cleanJunk(gameDir, updaterCache) {
  let freed = 0;
  for (const group of junkPaths(gameDir, updaterCache)) {
    for (const p of group.paths) {
      freed += await sizeOf(p);
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
  return freed;
}

// Usuwa folder z instances/ (wersję paczki albo modpack) razem ze światami i modami.
// Pliki gry tej wersji usuwamy tylko, jeśli nie korzysta z nich żaden inny folder.
async function deleteVersion(gameDir, key) {
  const meta = instanceInfo(gameDir, key);
  const targets = [path.join(gameDir, "instances", key)];
  const version = meta.gameVersion;
  const stillUsed = subdirs(path.join(gameDir, "instances"))
    .some(n => n !== key && instanceInfo(gameDir, n).gameVersion === version);
  if (version && !stillUsed) {
    targets.push(
      path.join(gameDir, "versions", version),
      path.join(gameDir, "natives", version),
      ...subdirs(path.join(gameDir, "versions"))
        .filter(n => n.startsWith("fabric-loader-") && n.endsWith(`-${version}`))
        .map(n => path.join(gameDir, "versions", n)),
    );
  }
  let freed = 0;
  for (const t of targets) {
    freed += await sizeOf(t);
    fs.rmSync(t, { recursive: true, force: true });
  }
  return freed;
}

module.exports = { scan, cleanJunk, deleteVersion };
