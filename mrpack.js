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
  return path.join(gameDir, "instances", `mp-${slug}`);
}

// Zainstalowane modpacki (z ich zapisanymi informacjami)
function listModpacks(gameDir) {
  const dir = path.join(gameDir, "instances");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => n.startsWith("mp-") && fs.existsSync(path.join(dir, n, INFO)))
    .map(n => JSON.parse(fs.readFileSync(path.join(dir, n, INFO), "utf8")))
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

// Instaluje najnowszą wersję modpacka na Fabric. progress({ task, total }), log(tekst)
async function installModpack(gameDir, projectId, { log, progress }) {
  const project = await getJson(`${API}/project/${projectId}`);
  const versions = await getJson(`${API}/project/${projectId}/version?loaders=${encodeURIComponent('["fabric"]')}`);
  const version = versions.find(v => v.version_type === "release") || versions[0];
  if (!version) throw new Error("Ten modpack nie ma wersji na Fabric");
  const packFile = version.files.find(f => f.primary) || version.files[0];

  log(`[modpack] Pobieranie ${project.title} ${version.version_number}...`);
  const res = await fetch(packFile.url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nie udało się pobrać modpacka (${res.status})`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const index = JSON.parse(zip.readAsText("modrinth.index.json"));

  const deps = index.dependencies || {};
  if (!deps["fabric-loader"]) {
    const loader = Object.keys(deps).find(k => k !== "minecraft") || "inny loader";
    throw new Error(`Ten modpack wymaga ${loader} — launcher obsługuje tylko Fabric`);
  }

  const dir = modpackDir(gameDir, project.slug);
  fs.mkdirSync(dir, { recursive: true });
  const files = (index.files || []).filter(f => !f.env || f.env.client !== "unsupported");
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

  const info = {
    id: project.id,
    slug: project.slug,
    title: project.title,
    icon: project.icon_url,
    version: version.version_number,
    gameVersion: deps.minecraft,
    fabricLoader: deps["fabric-loader"],
  };
  fs.writeFileSync(path.join(dir, INFO), JSON.stringify(info, null, 2));
  log(`[modpack] Zainstalowano ${info.title} (Minecraft ${info.gameVersion}, ${files.length} plików)`);
  return info;
}

function deleteModpack(gameDir, slug) {
  fs.rmSync(modpackDir(gameDir, slug), { recursive: true, force: true });
}

module.exports = { listModpacks, readModpack, searchModpacks, installModpack, deleteModpack, modpackDir };
