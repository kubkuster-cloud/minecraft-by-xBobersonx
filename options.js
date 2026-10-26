// Wspólne ustawienia gry dla wszystkich wersji: synchronizacja options.txt
// (sterowanie, myszka, dźwięk, grafika) przez jedną wspólną kopię.

const fs = require("fs");
const path = require("path");

// Tych nie przenosimy między wersjami — są przypisane do konkretnej wersji albo instancji
const SKIP = new Set([
  "version",                      // numer formatu danych danej wersji gry
  "resourcePacks",                // paczki tekstur są osobne w każdej wersji
  "incompatibleResourcePacks",
  "lastServer",
  "tutorialStep",
  "joinedFirstServer",
  "skipMultiplayerWarning",
  "skipRealms32bitWarning",
  "onboardAccessibility",
]);

function read(file) {
  const map = new Map();
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) map.set(line.slice(0, i), line.slice(i + 1));
    }
  } catch {}
  return map;
}

function write(file, map) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [...map].map(([k, v]) => `${k}:${v}`).join("\n") + "\n");
}

// Ustawienia z wersji -> wspólna kopia (klucze, których ta wersja nie zna, zostają we wspólnej)
function pull(instanceDir, sharedFile) {
  const options = read(path.join(instanceDir, "options.txt"));
  if (options.size === 0) return false;
  const shared = read(sharedFile);
  for (const [k, v] of options) if (!SKIP.has(k)) shared.set(k, v);
  write(sharedFile, shared);
  return true;
}

// Wspólna kopia -> wersja przed uruchomieniem gry
function push(instanceDir, sharedFile) {
  if (!fs.existsSync(sharedFile)) return false;
  const file = path.join(instanceDir, "options.txt");
  const options = read(file);
  for (const [k, v] of read(sharedFile)) if (!SKIP.has(k)) options.set(k, v);
  write(file, options);
  return true;
}

// Pierwsze użycie: wspólna kopia powstaje z najnowszych ustawień spośród pobranych wersji
function seed(gameDir, sharedFile) {
  if (fs.existsSync(sharedFile)) return null;
  const instances = path.join(gameDir, "instances");
  if (!fs.existsSync(instances)) return null;
  const newest = fs.readdirSync(instances)
    .map(n => path.join(instances, n))
    .filter(d => fs.existsSync(path.join(d, "options.txt")))
    .sort((a, b) => fs.statSync(path.join(b, "options.txt")).mtimeMs - fs.statSync(path.join(a, "options.txt")).mtimeMs)[0];
  if (!newest || !pull(newest, sharedFile)) return null;
  return path.basename(newest);
}

module.exports = { pull, push, seed };
