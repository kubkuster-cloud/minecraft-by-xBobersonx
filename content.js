// Shadery i paczki tekstur: wyszukiwanie i instalacja z Modrinth oraz włączanie ich
// w grze (shader przez config/iris.properties, paczki tekstur przez options.txt).

const fs = require("fs");
const path = require("path");

const API = "https://api.modrinth.com/v2";
const HEADERS = { "User-Agent": "xBobersonx/minecraft-launcher/1.0.0" };

const TYPES = {
  shader: { folder: "shaderpacks", loaders: ["iris"], facets: [["project_type:shader"], ["categories:iris"]] },
  resourcepack: { folder: "resourcepacks", loaders: ["minecraft"], facets: [["project_type:resourcepack"]] },
};

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Modrinth: ${res.status}`);
  return res.json();
}

// Pobrane z wyszukiwarki: { shader: { plik: id projektu }, resourcepack: { ... } }
function registryFile(instanceDir) {
  return path.join(instanceDir, ".xbobersonx-content.json");
}

function readRegistry(instanceDir) {
  try { return JSON.parse(fs.readFileSync(registryFile(instanceDir), "utf8")); } catch { return {}; }
}

function writeRegistry(instanceDir, registry) {
  fs.writeFileSync(registryFile(instanceDir), JSON.stringify(registry, null, 2));
}

function folderOf(instanceDir, type) {
  return path.join(instanceDir, TYPES[type].folder);
}

// ---------- Shader (Iris) ----------

function irisFile(instanceDir) {
  return path.join(instanceDir, "config", "iris.properties");
}

function readIris(instanceDir) {
  const props = new Map();
  try {
    for (const line of fs.readFileSync(irisFile(instanceDir), "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.startsWith("#")) props.set(line.slice(0, i), line.slice(i + 1));
    }
  } catch {}
  return props;
}

function activeShader(instanceDir) {
  const props = readIris(instanceDir);
  return props.get("enableShaders") === "true" ? props.get("shaderPack") || null : null;
}

// name = nazwa pliku z shaderpacks/ albo null, żeby wyłączyć shadery
function setShader(instanceDir, name) {
  const props = readIris(instanceDir);
  props.set("enableShaders", name ? "true" : "false");
  if (name) props.set("shaderPack", name);
  fs.mkdirSync(path.dirname(irisFile(instanceDir)), { recursive: true });
  fs.writeFileSync(irisFile(instanceDir), [...props].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

// ---------- Paczki tekstur (options.txt) ----------

function optionsFile(instanceDir) {
  return path.join(instanceDir, "options.txt");
}

function readResourcePacks(instanceDir) {
  try {
    const line = fs.readFileSync(optionsFile(instanceDir), "utf8").split(/\r?\n/).find(l => l.startsWith("resourcePacks:"));
    return line ? JSON.parse(line.slice("resourcePacks:".length)) : ["vanilla"];
  } catch {
    return ["vanilla"];
  }
}

// Włączona paczka trafia na koniec listy, czyli ma najwyższy priorytet
function setResourcePack(instanceDir, name, enabled) {
  const id = `file/${name}`;
  const packs = readResourcePacks(instanceDir).filter(p => p !== id);
  if (enabled) packs.push(id);
  const line = `resourcePacks:${JSON.stringify(packs)}`;

  let lines = [];
  try { lines = fs.readFileSync(optionsFile(instanceDir), "utf8").split(/\r?\n/).filter(Boolean); } catch {}
  const i = lines.findIndex(l => l.startsWith("resourcePacks:"));
  if (i >= 0) lines[i] = line;
  else lines.push(line);
  fs.writeFileSync(optionsFile(instanceDir), lines.join("\n") + "\n");
}

// ---------- Wspólne ----------

function listContent(instanceDir, type) {
  const dir = folderOf(instanceDir, type);
  if (!fs.existsSync(dir)) return [];
  const active = type === "shader" ? activeShader(instanceDir) : null;
  const packs = type === "resourcepack" ? new Set(readResourcePacks(instanceDir)) : null;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() || e.name.endsWith(".zip"))
    .map(e => ({
      file: e.name,
      title: e.name.replace(/\.zip$/, ""),
      enabled: type === "shader" ? e.name === active : packs.has(`file/${e.name}`),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function setContentEnabled(instanceDir, type, file, enabled) {
  if (type === "shader") setShader(instanceDir, enabled ? file : null);
  else setResourcePack(instanceDir, file, enabled);
}

function deleteContent(instanceDir, type, file) {
  setContentEnabled(instanceDir, type, file, false);
  fs.rmSync(path.join(folderOf(instanceDir, type), file), { recursive: true, force: true });
  const registry = readRegistry(instanceDir);
  if (registry[type]) delete registry[type][file];
  writeRegistry(instanceDir, registry);
}

async function searchContent(instanceDir, gameVersion, type, query) {
  const facets = JSON.stringify([...TYPES[type].facets, [`versions:${gameVersion}`]]);
  const index = query ? "relevance" : "downloads";
  const data = await getJson(`${API}/search?limit=30&index=${index}&query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`);
  const dir = folderOf(instanceDir, type);
  const installed = new Set(
    Object.entries(readRegistry(instanceDir)[type] || {})
      .filter(([file]) => fs.existsSync(path.join(dir, file)))
      .map(([, id]) => id),
  );
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

// Pobiera najnowszą wersję shadera/paczki dla danej wersji gry; shader od razu staje się aktywny,
// paczka tekstur zostaje włączona
async function installContent(instanceDir, gameVersion, type, id) {
  const query = `loaders=${encodeURIComponent(JSON.stringify(TYPES[type].loaders))}&game_versions=${encodeURIComponent(`["${gameVersion}"]`)}`;
  const versions = await getJson(`${API}/project/${id}/version?${query}`);
  const version = versions.find(v => v.version_type === "release") || versions[0];
  if (!version) throw new Error(`Brak wersji dla ${gameVersion}`);
  const file = version.files.find(f => f.primary) || version.files[0];

  const dir = folderOf(instanceDir, type);
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(file.url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nie udało się pobrać ${file.filename} (${res.status})`);
  fs.writeFileSync(path.join(dir, file.filename), Buffer.from(await res.arrayBuffer()));

  const registry = readRegistry(instanceDir);
  registry[type] = { ...(registry[type] || {}), [file.filename]: id };
  writeRegistry(instanceDir, registry);
  setContentEnabled(instanceDir, type, file.filename, true);
  return file.filename;
}

module.exports = { listContent, setContentEnabled, deleteContent, searchContent, installContent };
