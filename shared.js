// Wspólne pliki dla wszystkich wersji gry (poza options.txt, który obsługuje options.js):
// - ustawienia modów (config/) — osobna wspólna kopia dla Fabric i dla Forge, bo to inne mody,
// - lista serwerów z menu Multiplayer (servers.dat) — ten sam format od 1.8.9 do dziś,
// - paczki tekstur i shadery — jeden wspólny folder podpięty do każdej wersji (bez kopiowania GB plików).
// Przy plikach kopiowanych wygrywa nowszy: przed grą wspólne → wersja, po grze wersja → wspólne.

const fs = require("fs");
const path = require("path");

const MAX_CONFIG_FILE = 2 * 1024 * 1024; // większe pliki w config/ to zwykle cache, nie ustawienia
const LINKED_DIRS = ["resourcepacks", "shaderpacks"];

function sharedRoot(gameDir) {
  return path.join(gameDir, "shared");
}

// Kopiuje plik z zachowaniem daty zmiany, żeby porównanie „nowszy wygrywa” działało w obie strony
function copyIfNewer(from, to) {
  let src;
  try { src = fs.statSync(from); } catch { return false; }
  if (!src.isFile() || src.size > MAX_CONFIG_FILE) return false;
  try {
    const dst = fs.statSync(to);
    if (dst.mtimeMs >= src.mtimeMs - 1000) return false; // 1 s zapasu na dokładność dat w systemie plików
  } catch {}
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  fs.utimesSync(to, src.atime, src.mtime);
  return true;
}

// Wszystkie pliki w folderze (rekurencyjnie), ścieżki względne
function listFiles(dir, base = dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function syncDir(fromDir, toDir) {
  let copied = 0;
  for (const rel of listFiles(fromDir)) {
    if (copyIfNewer(path.join(fromDir, rel), path.join(toDir, rel))) copied++;
  }
  return copied;
}

// Folder wersji → wspólny folder przez połączenie katalogów (junction: bez uprawnień administratora).
// Pliki, które wersja miała wcześniej u siebie, przenosimy do wspólnego (duplikaty zostają we wspólnym).
function linkDir(instanceDir, sharedDir, name) {
  const local = path.join(instanceDir, name);
  const target = path.join(sharedDir, name);
  fs.mkdirSync(target, { recursive: true });
  let stat = null;
  try { stat = fs.lstatSync(local); } catch {}
  if (stat && stat.isSymbolicLink()) {
    let current = null;
    try { current = fs.realpathSync(local); } catch {}
    if (current && path.resolve(current) === path.resolve(fs.realpathSync(target))) return false;
    fs.unlinkSync(local); // stare albo zepsute połączenie
  } else if (stat && stat.isDirectory()) {
    for (const entry of fs.readdirSync(local)) {
      const from = path.join(local, entry), to = path.join(target, entry);
      if (fs.existsSync(to)) continue;
      fs.renameSync(from, to);
    }
    fs.rmSync(local, { recursive: true, force: true });
  } else if (stat) {
    return false; // zwykły plik o tej nazwie — nie ruszamy
  }
  fs.symlinkSync(target, local, "junction");
  return true;
}

// Przed uruchomieniem gry. full = paczka xBobersonx (dla modpacków tylko lista serwerów).
function push(gameDir, instanceDir, { loader, full }) {
  const root = sharedRoot(gameDir);
  const done = [];
  fs.mkdirSync(instanceDir, { recursive: true });
  if (copyIfNewer(path.join(root, "servers.dat"), path.join(instanceDir, "servers.dat"))) done.push("serwery");
  if (full) {
    if (syncDir(path.join(root, loader, "config"), path.join(instanceDir, "config"))) done.push("ustawienia modów");
    for (const name of LINKED_DIRS) {
      try { if (linkDir(instanceDir, root, name)) done.push(name); } catch {}
    }
  }
  return done;
}

// Po zamknięciu gry
function pull(gameDir, instanceDir, { loader, full }) {
  const root = sharedRoot(gameDir);
  copyIfNewer(path.join(instanceDir, "servers.dat"), path.join(root, "servers.dat"));
  if (full) syncDir(path.join(instanceDir, "config"), path.join(root, loader, "config"));
}

module.exports = { push, pull, LINKED_DIRS };
