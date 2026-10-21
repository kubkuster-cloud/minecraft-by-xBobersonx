// Rysuje napis „MINECRAFT” w stylu kamiennych bloków: tekstura kamienia,
// czarna obwódka i ciemny „głęboki” cień pod spodem.

(async function () {
  const canvas = document.getElementById("logo-mc");
  const ctx = canvas.getContext("2d");
  const TEXT = "MINECRAFT";
  const SIZE = 34;
  const DEPTH = 6;
  const PAD = 6;
  const font = `${SIZE}px Pixel`;

  await document.fonts.load(font);

  ctx.font = font;
  const width = Math.ceil(ctx.measureText(TEXT).width);
  canvas.width = width + PAD * 2 + DEPTH;
  canvas.height = SIZE + PAD * 2 + DEPTH;

  // Tekstura kamienia: losowe szare „piksele” 3x3
  const tex = document.createElement("canvas");
  tex.width = tex.height = 24;
  const t = tex.getContext("2d");
  const grays = ["#9a9a9a", "#8a8a8a", "#a8a8a8", "#7a7a7a", "#b4b4b4"];
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 24; y += 3) {
    for (let x = 0; x < 24; x += 3) {
      t.fillStyle = grays[Math.floor(rand() * grays.length)];
      t.fillRect(x, y, 3, 3);
    }
  }

  // Napis wypełniony teksturą, na osobnym canvasie
  const face = document.createElement("canvas");
  face.width = canvas.width;
  face.height = canvas.height;
  const f = face.getContext("2d");
  f.font = font;
  f.textBaseline = "top";
  f.fillText(TEXT, PAD, PAD);
  f.globalCompositeOperation = "source-in";
  f.fillStyle = f.createPattern(tex, "repeat");
  f.fillRect(0, 0, face.width, face.height);
  // jaśniejsza góra, ciemniejszy dół liter
  const light = f.createLinearGradient(0, PAD, 0, PAD + SIZE);
  light.addColorStop(0, "rgba(255,255,255,0.25)");
  light.addColorStop(1, "rgba(0,0,0,0.25)");
  f.globalCompositeOperation = "source-atop";
  f.fillStyle = light;
  f.fillRect(0, 0, face.width, face.height);

  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.lineJoin = "miter";

  // Cień 3D: ten sam napis przesuwany w dół w prawo
  for (let i = DEPTH; i > 0; i--) {
    ctx.fillStyle = i === DEPTH ? "#111" : "#3a3a3a";
    ctx.fillText(TEXT, PAD + i * 0.5, PAD + i);
  }
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 4;
  ctx.strokeText(TEXT, PAD, PAD);
  ctx.drawImage(face, 0, 0);
})();
