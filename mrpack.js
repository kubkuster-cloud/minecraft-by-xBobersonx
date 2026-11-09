// Gotowe modpacki z Modrinth (.mrpack): wyszukiwanie, instalacja do osobnego folderu, usuwanie.
// Obsługiwane są modpacki na Fabric (tylko taki loader ma launcher).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { pool } = require("./modpack");

const API = "https://api.modrinth.com/v2";
const HEADERS = { "User-Agent": "xBobersonx/minecraft-launcher/1.0.0" };
const INFO = ".xbobersonx-modpack.json";

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Modrinth: ${res.status}`);
  return res.json();
}

function modpackDir(gameDir, slug) {
  if (!/^[\w.-]+$/.test(slug) || slug.includes("..")) throw new Error(`Zła nazwa modpacka: ${slug}`);
  return path.join(gameDir, "instances", `mp-${slug}`);
}

function readInfo(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// Zainstalowane modpacki (z ich zapisanymi informacjami)
function listModpacks(gameDir) {
  const dir = path.join(gameDir, "instances");
  if (!fs.existsSync(dir)) return [];
  // uszkodzony plik jednego modpacka nie może zablokować całej listy wersji
  return fs.readdirSync(dir)
    .filter(n => n.startsWith("mp-"))
    .map(n => readInfo(path.join(dir, n, INFO)))
    .filter(info => info && info.slug && info.title)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function readModpack(gameDir, slug) {
  return JSON.parse(fs.readFileSync(path.join(modpackDir(gameDir, slug), INFO), "utf8"));
}

async function searchModpacks(gameDir, query) {
  const facets = JSON.stringify([["project_type:modpack"], ["categories:fabric"]]);
  const index = query ? "relevance" : "downloads";
  const data = await getJson(`${API}/search?limit=30&index=${index}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`);
  const installed = new Set(listModpacks(gameDir).map(m => m.id));
  return data.hits.map(h => ({
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    icon: h.icon_url,
    versions: h.versions,
    installed: installed.has(h.project_id),
  }));
}

// Ścieżka z modpacka nie może wyjść poza folder modpacka
function safeJoin(root, rel) {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Niebezpieczna ścieżka w modpacku: ${rel}`);
  return target;
}

async function downloadChecked(file, target) {
  const sha1 = file.hashes && file.hashes.sha1;
  if (fs.existsSync(target) && sha1 && crypto.createHash("sha1").update(fs.readFileSync(target)).digest("hex") === sha1) return;
  let lastError;
  for (const url of file.downloads) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (sha1 && crypto.createHash("sha1").update(data).digest("hex") !== sha1) throw new Error("zła suma kontrolna");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Nie udało się pobrać ${file.path} (${lastError && lastError.message})`);
}

// Zawartość archiwum .mrpack; launcher obsługuje tylko modpacki na Fabric
function readIndex(zip) {
  let index;
  try {
    index = JSON.parse(zip.readAsText("modrinth.index.json"));
  } catch {
    throw new Error("To nie jest poprawny modpack .mrpack");
  }
  const deps = index.dependencies || {};
  if (!deps["fabric-loader"]) {
    const loader = Object.keys(deps).find(k => k !== "minecraft") || "inny loader";
    throw new Error(`Ten modpack wymaga ${loader} — launcher obsługuje tylko Fabric`);
  }
  if (!deps.minecraft) throw new Error("Modpack nie podaje wersji Minecrafta");
  return index;
}

const clientFiles = index => (index.files || []).filter(f => !f.env || f.env.client !== "unsupported");

// identity = { id, slug, title, icon, version } — dane modpacka zapisywane obok jego plików
async function unpack(gameDir, zip, index, identity, { log, progress }) {
  const deps = index.dependencies;
  const dir = modpackDir(gameDir, identity.slug);
  fs.mkdirSync(dir, { recursive: true });
  const files = clientFiles(index);
  let done = 0;
  progress({ task: 0, total: files.length });
  await pool(files, 8, async f => {
    await downloadChecked(f, safeJoin(dir, f.path));
    progress({ task: ++done, total: files.length });
  });

  // pliki konfiguracyjne modpacka (overrides/ i client-overrides/)
  for (const prefix of ["overrides/", "client-overrides/"]) {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
      const target = safeJoin(dir, entry.entryName.slice(prefix.length));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }
  }

  const info = { ...identity, gameVersion: deps.minecraft, fabricLoader: deps["fabric-loader"] };
  fs.writeFileSync(path.join(dir, INFO), JSON.stringify(info, null, 2));
  log(`[modpack] Zainstalowano ${info.title} (Minecraft ${info.gameVersion}, ${files.length} plików)`);
  return info;
}

// Instaluje najnowszą wersję modpacka na Fabric. progress({ task, total }), log(tekst)
async function installModpack(gameDir, projectId, options) {
  const project = await getJson(`${API}/project/${projectId}`);
  const versions = await getJson(`${API}/project/${projectId}/version?loaders=${encodeURIComponent('["fabric"]')}`);
  const version = versions.find(v => v.version_type === "release") || versions[0];
  if (!version) throw new Error("Ten modpack nie ma wersji na Fabric");
  const packFile = version.files.find(f => f.primary) || version.files[0];

  options.log(`[modpack] Pobieranie ${project.title} ${version.version_number}...`);
  const res = await fetch(packFile.url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nie udało się pobrać modpacka (${res.status})`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const identity = { id: project.id, slug: project.slug, title: project.title, icon: project.icon_url, version: version.version_number };
  return unpack(gameDir, zip, readIndex(zip), identity, options);
}

// Tylko serwery dozwolone przez specyfikację .mrpack — plik z dysku może pochodzić skądkolwiek
const ALLOWED_HOSTS = new Set(["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"]);

function allowedDownloads(file) {
  return (file.downloads || []).filter(url => {
    try {
      const { protocol, hostname } = new URL(url);
      return protocol === "https:" && ALLOWED_HOSTS.has(hostname);
    } catch {
      return false;
    }
  });
}

function slugFromName(name) {
  const slug = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/[^\w.-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "").toLowerCase().slice(0, 60);
  return `file-${slug || "modpack"}`;
}

// Modpack z pliku na dysku
async function importModpack(gameDir, file, options) {
  if (path.extname(file).toLowerCase() === ".mcpack") {
    throw new Error("Pliki .mcpack są z Minecrafta Bedrock i nie działają w wersji Java — launcher importuje modpacki .mrpack");
  }
  let zip;
  try {
    zip = new AdmZip(file);
  } catch {
    throw new Error("To nie jest poprawny modpack .mrpack");
  }
  const index = readIndex(zip);
  for (const f of clientFiles(index)) {
    f.downloads = allowedDownloads(f);
    if (!f.downloads.length) throw new Error(`Modpack pobiera ${f.path} z niedozwolonego adresu`);
    if (!f.hashes || !f.hashes.sha1) throw new Error(`Modpack nie podaje sumy kontrolnej dla ${f.path}`);
  }

  const title = String(index.name || path.basename(file, path.extname(file)));
  const slug = slugFromName(title);
  if (fs.existsSync(path.join(modpackDir(gameDir, slug), INFO))) {
    throw new Error(`Modpack „${title}” jest już zainstalowany — usuń go najpierw, jeśli chcesz wgrać go od nowa`);
  }
  const identity = { id: `file:${slug}`, slug, title, icon: null, version: String(index.versionId || "") };
  return unpack(gameDir, zip, index, identity, options);
}

function deleteModpack(gameDir, slug) {
  fs.rmSync(modpackDir(gameDir, slug), { recursive: true, force: true });
}

module.exports = { listModpacks, readModpack, searchModpacks, installModpack, importModpack, deleteModpack, modpackDir };
