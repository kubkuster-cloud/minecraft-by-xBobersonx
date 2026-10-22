// Wykrywanie crashy: analizuje log gry i raport crasha, zwraca wyjaśnienie po polsku
// oraz id podejrzanych modów (żeby launcher mógł zaproponować ich wyłączenie).

const fs = require("fs");
const path = require("path");

const ACCESS_VIOLATION = -1073741819; // 0xC0000005 — zwykle sterownik karty graficznej

// Najnowszy raport crasha utworzony po starcie gry
function findCrashReport(instanceDir, since) {
  const dir = path.join(instanceDir, "crash-reports");
  if (!fs.existsSync(dir)) return null;
  const reports = fs.readdirSync(dir)
    .filter(n => n.endsWith(".txt"))
    .map(n => ({ file: path.join(dir, n), time: fs.statSync(path.join(dir, n)).mtimeMs }))
    .filter(r => r.time >= since)
    .sort((a, b) => b.time - a.time);
  return reports[0] ? reports[0].file : null;
}

function idsInParens(lines) {
  const ids = [];
  for (const line of lines) {
    for (const m of line.matchAll(/Mod '[^']+' \(([a-z0-9_\-]+)\)/gi)) ids.push(m[1]);
  }
  return ids;
}

// log = ostatnie linie wyjścia gry, code = kod wyjścia, report = treść raportu crasha (albo "")
function analyze(log, code, report) {
  const text = `${log}\n${report}`;
  const suspects = new Set();
  let reason = null;
  const details = [];

  // 1. Fabric: niekompatybilne mody / brakujące zależności (gra nawet nie wystartowała)
  if (/Incompatible mods found|Some of your mods are incompatible|FormattedException/.test(text)) {
    const lines = text.split(/\r?\n/).filter(l => /^\s*- (Mod|Replace|Remove|Install)/.test(l));
    if (/which is missing/.test(text)) {
      reason = "Brakuje moda, którego wymaga inny mod.";
    } else if (/duplicate|duplicated/i.test(text)) {
      reason = "Ten sam mod jest zainstalowany dwa razy (np. we własnych modach i w paczce).";
    } else {
      reason = "Niektóre mody są ze sobą niekompatybilne albo nie pasują do tej wersji gry.";
    }
    idsInParens(lines).forEach(id => suspects.add(id));
    details.push(...lines.slice(0, 8).map(l => l.trim()));
  } else if (/Mod ID .* is (duplicated|present multiple times)|Found duplicate mods/i.test(text)) {
    reason = "Ten sam mod jest zainstalowany dwa razy (np. we własnych modach i w paczce).";
    for (const m of text.matchAll(/Mod ID:? ['`]?([a-z0-9_\-]+)/gi)) suspects.add(m[1]);
  }

  // 2. Błędy mixinów — konkretny mod nie pasuje do gry albo do innego moda
  if (!reason && /Mixin (apply|transformation)|MixinApplyError|MixinTransformerError|InvalidMixinException/.test(text)) {
    reason = "Jeden z modów nie działa z tą wersją gry albo z innym modem (błąd „mixin”).";
    for (const m of text.matchAll(/Mixin apply for mod ([a-z0-9_\-]+) failed/gi)) suspects.add(m[1]);
    for (const m of text.matchAll(/from mod ([a-z0-9_\-]+)\]/gi)) suspects.add(m[1]);
    const line = text.split(/\r?\n/).find(l => /Mixin apply|MixinApplyError|MixinTransformerError|InvalidMixinException/.test(l));
    if (line) details.push(line.trim().slice(0, 300));
  }

  // 3. Brak pamięci
  if (!reason && /OutOfMemoryError/.test(text)) {
    reason = "Grze zabrakło pamięci RAM. Zwiększ ilość RAM-u w ustawieniach (⚙) albo wyłącz część modów.";
  }

  // 4. Zła wersja Javy
  if (!reason && /UnsupportedClassVersionError|has been compiled by a more recent version of the Java/.test(text)) {
    reason = "Któryś mod wymaga nowszej Javy. Usuń folder runtime w plikach launchera, żeby pobrał Javę ponownie.";
  }

  // 5. Sterownik karty graficznej / shader
  if (!reason && (code === ACCESS_VIOLATION || /EXCEPTION_ACCESS_VIOLATION|atio6axx|nvoglv|ig\d+icd/i.test(text))) {
    reason = "Gra wysypała się w sterowniku karty graficznej. Zaktualizuj sterowniki albo wyłącz shader (zakładka Shadery → Bez shaderów).";
  }

  // Raport crasha: opis i mody wskazane jako podejrzane (Fabric / Not Enough Crashes)
  if (report) {
    const description = (report.match(/^Description: (.+)$/m) || [])[1];
    if (description) details.unshift(`Opis: ${description}`);
    for (const m of report.matchAll(/Suspected Mods?:\s*(.+)/gi)) {
      for (const id of m[1].matchAll(/\(([a-z0-9_\-]+)\)/gi)) suspects.add(id[1]);
    }
    for (const m of report.matchAll(/^\s*([a-z0-9_\-]+): .+? \(Suspected\)/gim)) suspects.add(m[1]);
  }

  if (!reason) {
    reason = report
      ? "Gra się wysypała. Poniżej szczegóły z raportu crasha."
      : `Gra zamknęła się z błędem (kod ${code}).`;
    const last = log.split(/\r?\n/).reverse().find(l => /Exception|Error:/.test(l));
    if (last && !details.length) details.push(last.trim().slice(0, 300));
  }

  // tych nie proponujemy do wyłączenia — to sama gra / loader
  for (const id of ["minecraft", "java", "fabricloader", "fabric", "mixinextras"]) suspects.delete(id);
  return { reason, suspects: [...suspects], details: details.slice(0, 8) };
}

module.exports = { analyze, findCrashReport };
