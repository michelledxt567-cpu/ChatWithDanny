// Plays the MP4 back in Chrome, reports duration/size and saves frames at given times.
// usage: node verify.mjs <video.mp4> <outDir> t1,t2,...
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright-core');
const [video, outDir, times] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const work = path.dirname(path.resolve(video));
fs.writeFileSync(path.join(work, 'play.html'), `<!doctype html><video id="v" muted playsinline src="${path.basename(video)}"></video>`);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_FULL || '/inner_container/opt/playwright/chromium-1232/chrome-linux64/chrome', timeout: 60000,
  args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad-for-testing', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process', '--allow-file-access-from-files'],
  env: { ...process.env, HOME: work },
});
const page = await browser.newPage();
await page.goto('file://' + path.join(work, 'play.html'));
const info = await page.evaluate(() => new Promise((res) => {
  const v = document.getElementById('v');
  const done = () => res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error && v.error.message });
  if (v.readyState >= 1) done(); else { v.onloadedmetadata = done; v.onerror = done; }
}));
console.log(info);
for (const t of times.split(',').map(Number)) {
  const b64 = await page.evaluate((t) => new Promise((res) => {
    const v = document.getElementById('v');
    v.onseeked = () => {
      const c = document.createElement('canvas'); c.width = v.videoWidth / 2; c.height = v.videoHeight / 2;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      res(c.toDataURL('image/png').split(',')[1]);
    };
    v.currentTime = t;
  }), t);
  fs.writeFileSync(path.join(outDir, `v_${t}.png`), Buffer.from(b64, 'base64'));
}
await browser.close();
