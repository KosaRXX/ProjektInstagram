#!/usr/bin/env node
// Renderuje post lub rolkę z pliku JSON.
//
//   node src/render/render.js content/queue/przyklad-rolka.json            -> output/<id>.mp4 + okładka .jpg
//   node src/render/render.js content/queue/przyklad-post.json             -> output/<id>.jpg
//   node src/render/render.js <spec> --still 2.5                           -> pojedyncza klatka (podgląd)
//   node src/render/render.js <spec> --fps 15                              -> szybki, roboczy render
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FORMATS = {
  reel: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 }, // 4:5 – największa powierzchnia w feedzie
  square: { width: 1080, height: 1080 },
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

function ffmpeg(args) {
  const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg zakończył się kodem ${code}`)))));
  return { stdin: proc.stdin, done };
}

const write = (stream, buf) => new Promise((resolve, reject) => (stream.write(buf, (e) => (e ? reject(e) : resolve()))));

export async function render(specPath, opts = {}) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const id = spec.id ?? path.basename(specPath, '.json');
  const format = FORMATS[spec.format ?? (spec.type === 'reel' ? 'reel' : 'post')];
  const outDir = path.resolve(ROOT, opts.out ?? 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer(ROOT);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: format, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('[szablon]', e.message));
    await page.addInitScript((s) => { window.__SPEC__ = s; }, spec);
    await page.goto(`${server.url}/templates/${spec.template}/index.html`);
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 30000 });
    const duration = await page.evaluate(() => window.__DURATION__ ?? 0);

    const shot = async (t, type = 'jpeg') => {
      await page.evaluate((tt) => window.__renderFrame(tt), t);
      return page.screenshot({ type, quality: type === 'jpeg' ? 95 : undefined });
    };

    // --- pojedyncza klatka / post ---
    if (opts.still !== undefined || spec.type !== 'reel') {
      const t = Number(opts.still ?? spec.stillAt ?? duration);
      const file = path.join(outDir, opts.still !== undefined ? `${id}_t${t}.jpg` : `${id}.jpg`);
      fs.writeFileSync(file, await shot(t));
      console.log(`✔ ${path.relative(ROOT, file)}`);
      return { image: file };
    }

    // --- rolka ---
    const fps = Number(opts.fps ?? spec.fps ?? 30);
    const frames = Math.round(duration * fps);
    const video = path.join(outDir, `${id}.mp4`);
    const music = spec.music ? path.resolve(ROOT, spec.music) : null;
    const audioIn = music && fs.existsSync(music)
      ? ['-i', music]
      : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']; // cisza – IG woli mieć ścieżkę audio
    if (music && !fs.existsSync(music)) console.warn(`! brak pliku muzyki ${spec.music} – renderuję z ciszą`);
    const fadeOut = Math.max(0, duration - 1.5);

    const ff = ffmpeg([
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      ...audioIn,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-r', String(fps), '-g', String(fps * 2),
      '-af', `afade=t=in:d=0.5,afade=t=out:st=${fadeOut}:d=1.5`,
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-t', String(duration), '-movflags', '+faststart',
      video,
    ]);

    const started = Date.now();
    let cover;
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      const buf = await shot(t);
      await write(ff.stdin, buf);
      if (!cover && t >= (spec.coverAt ?? 1.2)) cover = buf;
      if (f % fps === 0 || f === frames - 1) {
        const pct = Math.round(((f + 1) / frames) * 100);
        process.stdout.write(`\r  klatka ${f + 1}/${frames} (${pct}%)  ${((Date.now() - started) / 1000).toFixed(0)}s   `);
      }
    }
    ff.stdin.end();
    await ff.done;
    const coverFile = path.join(outDir, `${id}_cover.jpg`);
    fs.writeFileSync(coverFile, cover ?? (await shot(0)));
    console.log(`\n✔ ${path.relative(ROOT, video)} (${duration}s, ${fps} fps)  + okładka ${path.relative(ROOT, coverFile)}`);
    return { video, cover: coverFile };
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._.length) {
    console.error('Użycie: node src/render/render.js <plik.json> [--still <sekunda>] [--fps <n>] [--out <katalog>]');
    process.exit(1);
  }
  for (const spec of args._) {
    await render(spec, args).catch((e) => { console.error(`✘ ${spec}: ${e.message}`); process.exitCode = 1; });
  }
}
