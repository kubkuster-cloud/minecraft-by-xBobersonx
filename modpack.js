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

function toFile(version, project, versions) {
  const file = version.files.find(f => f.primary) || version.files[0];
  return { name: file.filename, url: file.url, sha1: file.hashes.sha1, project, versions };
}

function sha1(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

// Zwraca listę plików do pobrania: mody z paczki + ich wymagane zależności
async function resolve(gameVersion, log) {
  const files = new Map(); // project_id -> plik
  const queue = [...PACK.mods];
  const seen = new Set();

  while (queue.length) {
    const project = queue.shift();
    if (seen.has(project)) continue;
    seen.add(project);

    const versions = await listVersions(project, gameVersion);
    // preferuje wydania „release”; dokładne wymagania innych modów poprawia fixExactDeps
    const version = versions.find(v => v.version_type === "release") || versions[0];
    if (!version) {
      log(`[paczka] ${project}: brak wersji dla ${gameVersion}, pomijam`);
      continue;
    }
    if (files.has(version.project_id)) continue;
    seen.add(version.project_id);
    files.set(version.project_id, toFile(version, project, versions));

    for (const dep of version.dependencies || []) {
      if (dep.dependency_type === "required" && dep.project_id) queue.push(dep.project_id);
    }
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

// Instaluje paczkę do <instanceDir>/mods. Pliki dodane ręcznie przez gracza zostają,
// a stare wersje modów z paczki są usuwane (lista w .xbobersonx-pack.json).
async function installPack(instanceDir, gameVersion, { log, progress }) {
  const modsDir = path.join(instanceDir, "mods");
  const listFile = path.join(modsDir, ".xbobersonx-pack.json");
  fs.mkdirSync(modsDir, { recursive: true });

  log(`[paczka] Sprawdzanie modów dla ${gameVersion}...`);
  const files = await resolve(gameVersion, log);

  for (let i = 0; i < files.length; i++) {
    progress({ type: "mods", task: i, total: files.length });
    await download(files[i], modsDir, log);
  }
  progress({ type: "mods", task: files.length, total: files.length });

  await fixExactDeps(files, modsDir, log);

  // sprzątanie dopiero po fixExactDeps, żeby nie kasować podmienionych wersji
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(listFile, "utf8")); } catch {}
  const wanted = new Set(files.map(f => f.name));
  for (const old of previous) {
    if (!wanted.has(old)) fs.rmSync(path.join(modsDir, old), { force: true });
  }

  fs.writeFileSync(listFile, JSON.stringify(files.map(f => f.name), null, 2));
  log(`[paczka] Gotowe: ${files.length} modów`);
}

module.exports = { installPack, packName: PACK.name };
