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
    ...subdirs(path.join(gameDir, "instances")).filter(n => n.startsWith("pack-")).map(n => n.slice("pack-".length)),
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

async function scan(gameDir, updaterCache) {
  const versions = [];
  for (const name of subdirs(path.join(gameDir, "instances")).filter(n => n.startsWith("pack-"))) {
    const dir = path.join(gameDir, "instances", name);
    const [total, saves, mods, shaders, packs] = await Promise.all([
      sizeOf(dir),
      sizeOf(path.join(dir, "saves")),
      sizeOf(path.join(dir, "mods")),
      sizeOf(path.join(dir, "shaderpacks")),
      sizeOf(path.join(dir, "resourcepacks")),
    ]);
    const version = name.slice("pack-".length);
    const jar = await sizeOf(path.join(gameDir, "versions", version));
    const worlds = subdirs(path.join(dir, "saves")).length;
    versions.push({
      version,
      size: total + jar,
      worlds,
      parts: { saves, mods, content: shaders + packs, other: total - saves - mods - shaders - packs + jar },
    });
  }
  versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

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

// Usuwa wersję razem ze światami, modami i plikami gry tej wersji
async function deleteVersion(gameDir, version) {
  const targets = [
    path.join(gameDir, "instances", `pack-${version}`),
    path.join(gameDir, "versions", version),
    path.join(gameDir, "natives", version),
    ...subdirs(path.join(gameDir, "versions"))
      .filter(n => n.startsWith("fabric-loader-") && n.endsWith(`-${version}`))
      .map(n => path.join(gameDir, "versions", n)),
  ];
  let freed = 0;
  for (const t of targets) {
    freed += await sizeOf(t);
    fs.rmSync(t, { recursive: true, force: true });
  }
  return freed;
}

module.exports = { scan, cleanJunk, deleteVersion };
