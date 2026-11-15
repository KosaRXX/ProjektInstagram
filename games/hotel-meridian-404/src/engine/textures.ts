import * as THREE from 'three';

/**
 * Proceduralne tekstury canvas – zero zewnętrznych plików, zero problemów z licencją.
 * Wszystkie kolory pochodzą z palety projektu.
 */

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function makeCanvas(w: number, h: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Tapeta: granat z geometrycznym wzorem art deco (wachlarze i złote linie). */
export function wallpaperTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#101923';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(183,154,97,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const r = 40 + i * 22;
    ctx.beginPath();
    ctx.arc(256, 256, r, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // Wachlarze w rogach kafelka
  for (const [cx, cy] of [[0, 0], [512, 0], [0, 512], [512, 512]]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
      ctx.strokeStyle = `rgba(183,154,97,${0.08 + (i % 2) * 0.06})`;
      ctx.stroke();
    }
  }
  // delikatny szum – fakturowanie tapety
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, [3, 2]);
}

/** Parkiet: deski o różnych odcieniach i słojach. */
export function woodFloorTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 1024);
  const planks = 8;
  const ph = 1024 / planks;
  const tones = ['#3b2a1c', '#44301f', '#35261a', '#4a3524', '#3e2d1e', '#2f2217', '#46331f', '#3a2919'];
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(0, i * ph, 1024, ph);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(20,12,6,${0.12 + Math.random() * 0.18})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const y0 = i * ph + Math.random() * ph;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y0 + Math.sin(x * 0.01 + g) * 3 + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, i * ph, 1024, 3);
  }
  for (let x = 0; x < 1024; x += 128) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, 0, 2, 1024);
  }
  return toTexture(canvas, [2, 2]);
}

/** Dywan: grafit z złotą obwódką i geometrycznym motywem. */
export function rugTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 896);
  ctx.fillStyle = '#17191d';
  ctx.fillRect(0, 0, 1024, 896);
  ctx.strokeStyle = 'rgba(183,154,97,0.75)';
  ctx.lineWidth = 14;
  ctx.strokeRect(40, 40, 944, 816);
  ctx.lineWidth = 3;
  ctx.strokeRect(70, 70, 884, 756);
  for (let y = 120; y < 800; y += 80) {
    for (let x = 120; x < 920; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, y - 22);
      ctx.lineTo(x + 22, y);
      ctx.lineTo(x, y + 22);
      ctx.lineTo(x - 22, y);
      ctx.closePath();
      ctx.fillStyle = ((x + y) / 80) % 2 ? 'rgba(82,122,145,0.35)' : 'rgba(183,154,97,0.28)';
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

/** Obraz z ukrytym mechanizmem: abstrakcyjny pejzaż deco z tarczą księżyca, która reaguje na godzinę. */
export function paintingTexture(moonPhase: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(768, 960);
  const g = ctx.createLinearGradient(0, 0, 0, 960);
  g.addColorStop(0, '#0c1520');
  g.addColorStop(0.55, '#527a91');
  g.addColorStop(1, '#17191d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 960);
  // tarcza księżyca (faza zależy od godziny)
  ctx.beginPath();
  ctx.arc(384, 300, 150, 0, Math.PI * 2);
  ctx.fillStyle = '#e9e4d9';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(384 + (moonPhase - 0.5) * 300, 300, 150, 150, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16,25,35,0.92)';
  ctx.fill();
  // horyzont deco
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(183,154,97,${0.25 + i * 0.08})`;
    ctx.fillRect(60 + i * 20, 620 + i * 26, 648 - i * 40, 10);
  }
  ctx.fillStyle = 'rgba(231,183,106,0.9)';
  ctx.font = '28px serif';
  ctx.textAlign = 'center';
  ctx.fillText('MERIDIAN · 1931', 384, 900);
  return toTexture(canvas);
}

/** Grzbiet książki z wytłoczonym symbolem. */
export function bookSpineTexture(label: string, bg: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 512);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 512);
  ctx.strokeStyle = 'rgba(183,154,97,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, 100, 484);
  ctx.fillStyle = '#b79a61';
  ctx.font = 'bold 34px serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(64, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(label, 0, 12);
  ctx.restore();
  // symbol u góry
  ctx.beginPath();
  ctx.arc(64, 70, 24, 0, Math.PI * 2);
  ctx.strokeStyle = '#e7b76a';
  ctx.stroke();
  return toTexture(canvas);
}

/** Tarcza zegara: rzymskie cyfry i okienko AM/PM. */
export function clockFaceTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#e9e4d9';
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b79a61';
  ctx.lineWidth = 10;
  ctx.stroke();
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#17191d';
  ctx.font = 'bold 40px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  roman.forEach((r, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(r, 256 + Math.cos(a) * 190, 256 + Math.sin(a) * 190);
  });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * 225, 256 + Math.sin(a) * 225);
    ctx.lineTo(256 + Math.cos(a) * (i % 5 === 0 ? 205 : 215), 256 + Math.sin(a) * (i % 5 === 0 ? 205 : 215));
    ctx.strokeStyle = '#17191d';
    ctx.lineWidth = i % 5 === 0 ? 4 : 2;
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Szybka tekstura z napisem (tabliczki, znaki na drzwiach, teksty UV). */
export function labelTexture(lines: string[], opts: { bg?: string; fg?: string; size?: number; w?: number; h?: number; font?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = opts.bg ?? '#101923';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#b79a61';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = opts.fg ?? '#e7b76a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = opts.size ?? 44;
  ctx.font = `${size}px ${opts.font ?? 'Georgia, serif'}`;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.25));
  return toTexture(canvas);
}

/** Miękki okrągły sprite (cząsteczki kurzu, blob cienia). */
export function softDotTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/** Okno: ciemne miasto z rozmytymi światłami (widok na zewnątrz). */
export function cityTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0a1119');
  g.addColorStop(1, '#1b2b38');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 1024;
    const w = 30 + Math.random() * 80;
    const h = 120 + Math.random() * 260;
    ctx.fillStyle = '#0c141c';
    ctx.fillRect(x, 512 - h, w, h);
    for (let k = 0; k < 6; k++) {
      if (Math.random() < 0.35) {
        ctx.fillStyle = Math.random() < 0.7 ? 'rgba(231,183,106,0.8)' : 'rgba(82,122,145,0.8)';
        ctx.fillRect(x + 6 + Math.random() * (w - 12), 512 - h + 10 + Math.random() * (h - 20), 4, 6);
      }
    }
  }
  return toTexture(canvas);
}

/** Lustro: lekko ciemniejsza tafla z delikatnym gradientem (do połączenia z odbiciem PBR). */
export function mirrorSheenTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 256, 512);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  return toTexture(canvas);
}
