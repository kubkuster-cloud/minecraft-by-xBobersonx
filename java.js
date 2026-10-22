// Automatyczna Java: pobiera z serwerów Mojang tę samą wersję Javy, której używa
// oficjalny launcher (np. Java 21 dla nowych wersji, Java 8 dla starych).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RUNTIME_INDEX =
  "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
const PLATFORM = { x64: "windows-x64", arm64: "windows-arm64", ia32: "windows-x86" }[process.arch] || "windows-x64";
const PARALLEL = 16;

// Ustawienia JVM (G1GC) zmniejszające przycięcia przy dużej liczbie modów
const JVM_FLAGS = [
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=50",
  "-XX:+DisableExplicitGC",
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=15",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:MaxTenuringThreshold=1",
  "-XX:+PerfDisableSharedMem",
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} dla ${url}`);
  return res.json();
}

// Którą Javę wymaga dana wersja gry (pole javaVersion w jej pliku wersji).
// Bez internetu czyta plik wersji zapisany wcześniej na dysku (localJson).
async function javaComponentFor(gameVersion, manifestUrl, localJson) {
  let json;
  try {
    const manifest = await getJson(manifestUrl);
    const entry = manifest.versions.find(v => v.id === gameVersion);
    if (!entry) throw new Error(`Nieznana wersja ${gameVersion}`);
    json = await getJson(entry.url);
  } catch (err) {
    if (!localJson || !fs.existsSync(localJson)) throw err;
    json = JSON.parse(fs.readFileSync(localJson, "utf8"));
  }
  return json.javaVersion ? json.javaVersion.component : "jre-legacy";
}

async function downloadFile(file, target) {
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`Nie udało się pobrać ${file.url} (${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (crypto.createHash("sha1").update(data).digest("hex") !== file.sha1) {
    throw new Error(`Uszkodzony plik Javy: ${path.basename(target)}`);
  }
  fs.writeFileSync(target, data);
}

// Instaluje runtime do <runtimeRoot>/<component> i zwraca ścieżkę do javaw.exe
async function installRuntime(runtimeRoot, component, { log, progress }) {
  const dir = path.join(runtimeRoot, component);
  const javaw = path.join(dir, "bin", "javaw.exe");
  const marker = path.join(dir, ".installed");

  const builds = (await getJson(RUNTIME_INDEX))[PLATFORM][component];
  if (!builds || builds.length === 0) throw new Error(`Brak Javy ${component} dla ${PLATFORM}`);
  const build = builds[0];

  if (fs.existsSync(javaw) && fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === build.version.name) {
    return javaw;
  }

  log(`[java] Pobieranie Javy ${build.version.name} (${component})...`);
  fs.rmSync(dir, { recursive: true, force: true });
  const { files } = await getJson(build.manifest.url);
  const entries = Object.entries(files);
  for (const [name, f] of entries) {
    if (f.type === "directory") fs.mkdirSync(path.join(dir, name), { recursive: true });
  }

  const toDownload = entries.filter(([, f]) => f.type === "file");
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < toDownload.length) {
      const [name, f] = toDownload[next++];
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await downloadFile(f.downloads.raw, target);
      progress({ type: "java", task: ++done, total: toDownload.length });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  fs.writeFileSync(marker, build.version.name);
  log(`[java] Zainstalowano Javę ${build.version.name}`);
  return javaw;
}

// Zwraca ścieżkę do Javy dla danej wersji gry. Gdy pobranie się nie uda,
// używa wcześniej pobranej Javy albo tej z systemu.
async function getJava(gameVersion, { runtimeRoot, manifestUrl, localJson, log, progress }) {
  let component = null;
  try {
    component = await javaComponentFor(gameVersion, manifestUrl, localJson);
    return await installRuntime(runtimeRoot, component, { log, progress });
  } catch (err) {
    const cached = component && path.join(runtimeRoot, component, "bin", "javaw.exe");
    if (cached && fs.existsSync(cached)) {
      log(`[java] Nie można sprawdzić aktualizacji Javy (${err.message}), używam pobranej`);
      return cached;
    }
    log(`[java] Nie udało się pobrać Javy (${err.message}), używam Javy z systemu`);
    return "java";
  }
}

module.exports = { getJava, JVM_FLAGS };
