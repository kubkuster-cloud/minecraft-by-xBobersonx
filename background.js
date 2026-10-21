// Domyślne tło: pikselowy krajobraz w stylu Minecrafta, rysowany na canvasie.
// Jeśli istnieje assets/background.png, zostanie użyty zamiast niego.

(function () {
  const BLOCK = 16;
  const canvas = document.getElementById("bg");
  const img = document.getElementById("bg-img");
  const ctx = canvas.getContext("2d");

  // Prosty generator z ziarnem, żeby krajobraz był zawsze taki sam
  let seed = 1337;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, v + amount)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function block(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    // lekki „szum” tekstury bloku
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = shade(color.startsWith("#") ? color : "#808080", (rand() - 0.5) * 30);
      ctx.fillRect(x * BLOCK + Math.floor(rand() * 4) * 4, y * BLOCK + Math.floor(rand() * 4) * 4, 4, 4);
    }
  }

  function draw() {
    seed = 1337;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cols = Math.ceil(canvas.width / BLOCK);
    const rows = Math.ceil(canvas.height / BLOCK);

    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#5d9be8");
    sky.addColorStop(1, "#b9dbff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Chmury
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(rand() * cols), cy = 2 + Math.floor(rand() * 6);
      const w = 4 + Math.floor(rand() * 6);
      ctx.fillRect(cx * BLOCK, cy * BLOCK, w * BLOCK, BLOCK);
      ctx.fillRect((cx + 1) * BLOCK, (cy - 1) * BLOCK, (w - 2) * BLOCK, BLOCK);
    }

    // Teren: suma kilku sinusów daje łagodne wzgórza
    const sea = Math.floor(rows * 0.7);
    const p1 = rand() * 10, p2 = rand() * 10;
    const heights = [];
    for (let x = 0; x < cols; x++) {
      const h = rows * 0.55 + Math.sin(x / 7 + p1) * 3 + Math.sin(x / 3 + p2) * 1 + Math.sin(x / 15) * 5;
      heights.push(Math.floor(h));
    }

    for (let x = 0; x < cols; x++) {
      const top = heights[x];
      for (let y = Math.min(top, sea); y < rows; y++) {
        if (y < top) block(x, y, "#3b6fd6");                 // woda
        else if (y === top) block(x, y, top >= sea ? "#dccf8f" : "#5fa83a"); // piasek / trawa
        else if (y < top + 4) block(x, y, top >= sea ? "#dccf8f" : "#8a5a32");
        else block(x, y, "#7d7d7d");                          // kamień
      }
    }

    // Drzewa na trawie
    for (let x = 2; x < cols - 2; x++) {
      const top = heights[x];
      if (top >= sea || rand() > 0.12) continue;
      const h = 4 + Math.floor(rand() * 2);
      for (let lx = -2; lx <= 2; lx++) {
        for (let ly = -h - 1; ly <= -h + 1; ly++) {
          if (Math.abs(lx) === 2 && ly === -h - 1) continue;
          block(x + lx, top + ly, "#2f7d2a");
        }
      }
      for (let ty = 1; ty < h; ty++) block(x, top - ty, "#6b4a2a");
      x += 4;
    }
  }

  img.onload = () => {
    img.style.display = "block";
    canvas.style.display = "none";
  };
  img.onerror = () => {
    draw();
    window.addEventListener("resize", draw);
  };
  img.src = "assets/background.png";
})();
