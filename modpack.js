// Wbudowana paczka modów: pobiera mody z modpack.json z Modrinth,
// w wersji pasującej do wybranego Minecrafta (Fabric), razem z wymaganymi zależnościami.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const API = "https://api.modrinth.com/v2";
const HEADERS = { "User-Agent": "xBobersonx/minecraft-launcher/1.0.0" };
const PACK = require("./modpack.json");

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Modrinth: ${res.status} dla ${url}`);
  return res.json();
}

// Wszystkie wersje moda dla danej wersji gry, od najnowszej
async function listVersions(project, gameVersion) {
  const query = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${gameVersion}"]`)}`;
  return (await getJson(`${API}/project/${project}/version?${query}`)) || [];
}

const PARALLEL = 8;

function toFile(version, project, versions) {
  const file = version.files.find(f => f.primary) || version.files[0];
  return { name: file.filename, url: file.url, sha1: file.hashes.sha1, project, id: version.project_id, versions };
}

function sha1(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

// Wykonuje fn dla każdego elementu, najwyżej `limit` naraz; wyniki w tej samej kolejności
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Zwraca listę plików do pobrania: podane projekty + ich wymagane zależności.
// Sprawdza Modrinth falami: najpierw wszystkie projekty naraz, potem ich zależności itd.
// `skip` to id projektów, które już są zainstalowane (nie pobieramy ich drugi raz).
async function resolve(projects, gameVersion, log, skip = new Set()) {
  const files = new Map(); // project_id -> plik
  const seen = new Set();
  let wave = projects;

  while (wave.length) {
    const todo = [...new Set(wave)].filter(p => !seen.has(p));
    todo.forEach(p => seen.add(p));
    const found = await pool(todo, PARALLEL, p => listVersions(p, gameVersion));
    wave = [];

    todo.forEach((project, i) => {
      const versions = found[i];
      // preferuje wydania „release”; dokładne wymagania innych modów poprawia fixExactDeps
      const version = versions.find(v => v.version_type === "release") || versions[0];
      if (!version) {
        log(`[paczka] ${project}: brak wersji dla ${gameVersion}, pomijam`);
        return;
      }
      seen.add(version.project_id);
      if (files.has(version.project_id) || skip.has(version.project_id)) return;
      files.set(version.project_id, toFile(version, project, versions));

      for (const dep of version.dependencies || []) {
        if (dep.dependency_type === "required" && dep.project_id) wave.push(dep.project_id);
      }
    });
  }
  return [...files.values()];
}

function readModInfo(jarPath) {
  try {
    const info = JSON.parse(new AdmZip(jarPath).readAsText("fabric.mod.json"));
    return { id: info.id, version: info.version, depends: info.depends || {} };
  } catch {
    return null;
  }
}

async function download(f, modsDir, log) {
  const target = path.join(modsDir, f.name);
  if (fs.existsSync(target) && sha1(target) === f.sha1) return;
  log(`[paczka] Pobieranie ${f.name}`);
  const res = await fetch(f.url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nie udało się pobrać ${f.name} (${res.status})`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

// Niektóre mody wymagają dokładnej wersji innego moda (np. nuit_interop -> nuit 1.0.0-beta.5).
// Sprawdza fabric.mod.json każdego moda i podmienia zależność na wymaganą wersję z Modrinth.
async function fixExactDeps(files, modsDir, log) {
  const infos = files.map(f => ({ file: f, info: readModInfo(path.join(modsDir, f.name)) }));
  const byId = new Map(infos.filter(x => x.info).map(x => [x.info.id, x]));

  for (const { info } of infos) {
    if (!info) continue;
    for (const [depId, req] of Object.entries(info.depends)) {
      if (typeof req !== "string" || /[<>=~^*x ]/.test(req)) continue;
      const dep = byId.get(depId);
      if (!dep || dep.info.version === req) continue;

      const core = req.split("+")[0];
      const match = dep.file.versions.find(v => v.version_number.includes(core));
      if (!match) {
        log(`[paczka] ${info.id} wymaga ${depId} ${req}, ale nie ma jej na Modrinth`);
        continue;
      }
      log(`[paczka] ${info.id} wymaga ${depId} ${req} — podmieniam ${dep.info.version}`);
      fs.rmSync(path.join(modsDir, dep.file.name), { force: true });
      Object.assign(dep.file, toFile(match, dep.file.project, dep.file.versions));
      await download(dep.file, modsDir, log);
      dep.info.version = req;
    }
  }
}

// Starsze wersje launchera trzymały mody paczki luzem w mods/ — przenosimy je do preinstalled/
function removeLegacyPack(instanceDir) {
  const legacyList = path.join(instanceDir, "mods", ".xbobersonx-pack.json");
  if (!fs.existsSync(legacyList)) return;
  try {
    for (const name of JSON.parse(fs.readFileSync(legacyList, "utf8"))) {
      fs.rmSync(path.join(instanceDir, "mods", name), { force: true });
    }
  } catch {}
  fs.rmSync(legacyList, { force: true });
}

// Instaluje paczkę do <instanceDir>/mods/preinstalled i zwraca ten folder
// (gra dostaje go przez -Dfabric.addMods). W samym mods/ zostają tylko mody gracza.
// Stare wersje modów z paczki są usuwane (lista w .xbobersonx-pack.json).
async function installPack(instanceDir, gameVersion, { log, progress }) {
  removeLegacyPack(instanceDir);
  const modsDir = path.join(instanceDir, "mods", "preinstalled");
  // lista poza preinstalled/, bo Fabric ostrzega o plikach innych niż .jar w tym folderze
  const listFile = path.join(instanceDir, ".xbobersonx-pack.json");
  fs.mkdirSync(modsDir, { recursive: true });
  const oldListFile = path.join(modsDir, ".xbobersonx-pack.json");
  if (fs.existsSync(oldListFile)) fs.renameSync(oldListFile, listFile);

  // Paczka sprawdzana niedawno (i lista modów się nie zmieniła) — nie pytamy Modrinth znowu
  const checkFile = path.join(instanceDir, ".xbobersonx-pack-check.json");
  const packHash = crypto.createHash("sha1").update(JSON.stringify(PACK)).digest("hex");
  const complete = packComplete(instanceDir, modsDir);
  let check = {};
  try { check = JSON.parse(fs.readFileSync(checkFile, "utf8")); } catch {}
  if (complete && check.packHash === packHash && Date.now() - check.time < RECHECK_MS) {
    log("[paczka] Mody sprawdzane niedawno — pomijam sprawdzanie");
    return modsDir;
  }

  log(`[paczka] Sprawdzanie modów dla ${gameVersion}...`);
  let files;
  try {
    files = await resolve([...PACK.libraries, ...PACK.mods], gameVersion, log);
  } catch (err) {
    // brak internetu albo Modrinth nie działa — gramy na tym, co już jest pobrane
    if (!complete) throw new Error("Brak połączenia z Modrinth — tę wersję trzeba raz uruchomić z internetem");
    log(`[paczka] Brak połączenia z Modrinth (${err.message}) — używam pobranych modów`);
    return modsDir;
  }

  // wyłączone mody wracają na czas aktualizacji, potem są wyłączane ponownie
  for (const name of fs.readdirSync(modsDir)) {
    if (name.endsWith(DISABLED)) {
      fs.renameSync(path.join(modsDir, name), path.join(modsDir, name.slice(0, -DISABLED.length)));
    }
  }

  let done = 0;
  progress({ type: "mods", task: 0, total: files.length });
  await pool(files, PARALLEL, async f => {
    await download(f, modsDir, log);
    progress({ type: "mods", task: ++done, total: files.length });
  });

  await fixExactDeps(files, modsDir, log);

  // sprzątanie dopiero po fixExactDeps, żeby nie kasować podmienionych wersji
  const wanted = new Set(files.map(f => f.name));
  for (const old of readPackList(instanceDir)) {
    if (!wanted.has(old.name)) fs.rmSync(path.join(modsDir, old.name), { force: true });
  }

  // biblioteka = wpisana w „libraries” albo dobrana automatycznie jako zależność
  const list = files.map(f => ({ name: f.name, project: f.project, id: f.id, library: !PACK.mods.includes(f.project) }));
  fs.writeFileSync(listFile, JSON.stringify(list, null, 2));

  const disabled = readDisabled(instanceDir);
  for (const f of list) {
    if (disabled.has(f.project)) renameMod(modsDir, f.name, false);
  }
  fs.writeFileSync(checkFile, JSON.stringify({ time: Date.now(), packHash }));
  log(`[paczka] Gotowe: ${files.length} modów${disabled.size ? `, wyłączone: ${disabled.size}` : ""}`);
  return modsDir;
}

const RECHECK_MS = 6 * 60 * 60 * 1000; // paczkę sprawdzamy w Modrinth najwyżej co 6 godzin

// Czy paczka jest kompletnie pobrana (każdy plik z listy istnieje, włączony albo wyłączony)
function packComplete(instanceDir, modsDir) {
  const list = readPackList(instanceDir);
  return list.length > 0 && list.every(f =>
    fs.existsSync(path.join(modsDir, f.name)) || fs.existsSync(path.join(modsDir, f.name + DISABLED)));
}

// ---------- Zarządzanie modami (okno „Własne mody”) ----------

const DISABLED = ".disabled";
const infoCache = new Map(); // ścieżka+mtime -> { name, version }

// Lista paczki; starsze wersje zapisywały same nazwy plików
function readPackList(instanceDir) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(instanceDir, ".xbobersonx-pack.json"), "utf8"));
    return list.map(x => (typeof x === "string" ? { name: x, project: x, library: false } : x));
  } catch {
    return [];
  }
}

function disabledFile(instanceDir) {
  return path.join(instanceDir, ".xbobersonx-disabled.json");
}

// Projekty z paczki wyłączone przez gracza (przetrwają aktualizacje paczki)
function readDisabled(instanceDir) {
  try { return new Set(JSON.parse(fs.readFileSync(disabledFile(instanceDir), "utf8"))); } catch { return new Set(); }
}

function renameMod(dir, jarName, enabled) {
  const on = path.join(dir, jarName);
  const off = on + DISABLED;
  if (enabled && fs.existsSync(off)) fs.renameSync(off, on);
  if (!enabled && fs.existsSync(on)) fs.renameSync(on, off);
}

function describe(file) {
  const stat = fs.statSync(file);
  const key = `${file}|${stat.mtimeMs}`;
  if (!infoCache.has(key)) {
    let info = null;
    try {
      const meta = JSON.parse(new AdmZip(file).readAsText("fabric.mod.json"));
      info = { title: meta.name || meta.id, version: meta.version, modId: meta.id };
    } catch {}
    infoCache.set(key, info);
  }
  return infoCache.get(key);
}

function entry(dir, jarName, extra) {
  const enabled = fs.existsSync(path.join(dir, jarName));
  const file = path.join(dir, enabled ? jarName : jarName + DISABLED);
  if (!fs.existsSync(file)) return null;
  const info = describe(file) || { title: jarName.replace(/\.jar$/, ""), version: "" };
  return { file: jarName, enabled, ...info, ...extra };
}

// Mody gracza (mods/) i mody z paczki (mods/preinstalled) danej wersji
function listMods(instanceDir) {
  const ownDir = path.join(instanceDir, "mods");
  const preDir = path.join(ownDir, "preinstalled");
  const own = fs.existsSync(ownDir)
    ? fs.readdirSync(ownDir)
        .filter(n => n.endsWith(".jar") || n.endsWith(".jar" + DISABLED))
        .map(n => entry(ownDir, n.endsWith(DISABLED) ? n.slice(0, -DISABLED.length) : n, { key: n.replace(DISABLED, "") }))
    : [];
  const pre = readPackList(instanceDir).map(f => entry(preDir, f.name, { key: f.project, library: f.library }));
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  return { own: own.filter(Boolean).sort(byTitle), pre: pre.filter(Boolean).sort(byTitle) };
}

// Włącza/wyłącza mod. Wyłączony mod dostaje końcówkę .disabled — Fabric go pomija, plik zostaje.
function setModEnabled(instanceDir, tab, key, enabled) {
  const ownDir = path.join(instanceDir, "mods");
  try {
    if (tab === "own") {
      renameMod(ownDir, key, enabled);
      return;
    }
    const mod = readPackList(instanceDir).find(f => f.project === key);
    if (!mod) return;
    const disabled = readDisabled(instanceDir);
    if (enabled) disabled.delete(key);
    else disabled.add(key);
    renameMod(path.join(ownDir, "preinstalled"), mod.name, enabled);
    fs.writeFileSync(disabledFile(instanceDir), JSON.stringify([...disabled], null, 2));
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") throw new Error("Zamknij grę, zanim zmienisz mody");
    throw err;
  }
}

// ---------- Wyszukiwarka modów (zakładka „Szukaj modów”) ----------

// Własne mody zainstalowane z wyszukiwarki: { nazwa pliku: id projektu na Modrinth }
function ownFile(instanceDir) {
  return path.join(instanceDir, ".xbobersonx-own.json");
}

function readOwn(instanceDir) {
  try { return JSON.parse(fs.readFileSync(ownFile(instanceDir), "utf8")); } catch { return {}; }
}

// Id projektów, które już są w paczce albo we własnych modach (te, których pliki wciąż istnieją)
function installedIds(instanceDir) {
  const modsDir = path.join(instanceDir, "mods");
  const exists = (dir, name) => fs.existsSync(path.join(dir, name)) || fs.existsSync(path.join(dir, name + DISABLED));
  const ids = new Set(readPackList(instanceDir).filter(f => f.id).map(f => f.id));
  for (const [name, id] of Object.entries(readOwn(instanceDir))) {
    if (exists(modsDir, name)) ids.add(id);
  }
  return ids;
}

async function searchMods(instanceDir, gameVersion, query) {
  const facets = JSON.stringify([["categories:fabric"], [`versions:${gameVersion}`], ["project_type:mod"]]);
  const index = query ? "relevance" : "downloads";
  const data = await getJson(`${API}/search?limit=30&index=${index}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`);
  const installed = installedIds(instanceDir);
  return data.hits.map(h => ({
    id: h.project_id,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    icon: h.icon_url,
    installed: installed.has(h.project_id),
  }));
}

// Instaluje mod do mods/ razem z wymaganymi bibliotekami, których jeszcze nie ma
async function installOwnMod(instanceDir, gameVersion, projectId, log) {
  const modsDir = path.join(instanceDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  const skip = installedIds(instanceDir);
  if (skip.has(projectId)) throw new Error("Ten mod jest już zainstalowany");

  const files = await resolve([projectId], gameVersion, log, skip);
  if (!files.some(f => f.id === projectId)) throw new Error(`Ten mod nie ma wersji dla ${gameVersion}`);

  await pool(files, PARALLEL, f => download(f, modsDir, log));
  const own = readOwn(instanceDir);
  for (const f of files) own[f.name] = f.id;
  fs.writeFileSync(ownFile(instanceDir), JSON.stringify(own, null, 2));
  return files.map(f => f.name);
}

module.exports = { installPack, packName: PACK.name, listMods, setModEnabled, searchMods, installOwnMod };
