// Renders scene.html frame-by-frame to JPEGs with headless Chromium.
// usage: node render.mjs <outDir> [fps] [--scene file.html] [--stills t1,t2,...] [--workers N]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const PW = process.env.PW_CORE || '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const CHROME = process.env.CHROME_SHELL || '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const { chromium } = require(PW);

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args[0] || 'frames';
const fps = Number(args[1] || 60);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
const scene = args.includes('--scene') ? args[args.indexOf('--scene') + 1] : 'scene.html';
const workers = args.includes('--workers') ? Number(args[args.indexOf('--workers') + 1]) : 6;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-crash-reporter', '--force-color-profile=srgb'] });
async function newScene() {
  const page = await browser.newPage({ viewport: { width: 443, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(here, scene));
  await page.evaluate(() => window.ready);
  return page;
}

if (stillsArg) {
  const page = await newScene();
  for (const s of stillsArg.split(',')) {
    await page.evaluate((t) => window.render(t), Number(s));
    await page.screenshot({ path: path.join(outDir, `still_${s}.png`) });
  }
  console.log('stills done');
} else {
  const probe = await newScene();
  const duration = await probe.evaluate(() => window.DURATION);
  const sounds = await probe.evaluate(() => window.SOUNDS || []);
  await probe.close();
  const total = Math.ceil(duration * fps);
  console.log(`duration ${duration.toFixed(2)}s -> ${total} frames @ ${fps}fps`);
  const t0 = Date.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await newScene();
    for (let i = w; i < total; i += workers) {
      await page.evaluate((t) => window.render(t), i / fps);
      await page.screenshot({ path: path.join(outDir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
      if (++done % 300 === 0) console.log(`${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ fps, total, duration, sounds }, null, 1));
  console.log('frames done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await browser.close();
