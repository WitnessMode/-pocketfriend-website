const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SITES = [
  { name: 'turmasaya', url: 'https://turmasaya.vercel.app' },
  { name: 'orobrick', url: 'https://orobrick.com' },
  { name: 'pocketfriend-connect', url: 'https://pocketfriend-connect.vercel.app' },
  { name: 'pocketfriend-io', url: 'https://pocketfriend.io' },
  { name: 'cakeuwish', url: 'https://cakeuwish.vercel.app' },
  { name: 'wayrest', url: 'https://wayrest-fawn.vercel.app' },
];

const OUT = path.resolve(__dirname, 'out');
const W = 960, H = 600;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const site of SITES) {
    process.stdout.write('Capturing ' + site.name + ' ... ');
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      recordVideo: { dir: OUT, size: { width: W, height: H } },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const video = page.video();
    try {
      await page.goto(site.url, { waitUntil: 'load', timeout: 35000 }).catch(() => {});
      await page.waitForTimeout(6000); // let intro / loaders / hero settle
      const sh = await page.evaluate(() => document.body.scrollHeight).catch(() => 2000);
      const maxScroll = Math.max(0, Math.min(sh - H, H * 4)); // glimpse: up to ~4 screens
      const steps = 84;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const tri = t < 0.5 ? t * 2 : 2 - t * 2; // 0 -> 1 -> 0, seamless loop
        const y = Math.round(maxScroll * tri);
        await page.evaluate(yy => window.scrollTo(0, yy), y);
        if (i === 14) await page.screenshot({ path: path.join(OUT, site.name + '-a.png') }).catch(() => {});
        if (i === 42) await page.screenshot({ path: path.join(OUT, site.name + '-b.png') }).catch(() => {});
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(400);
    } catch (e) { process.stdout.write('ERR ' + e.message + ' '); }
    await page.close();
    await ctx.close();
    try {
      const vp = await video.path();
      const dest = path.join(OUT, site.name + '.webm');
      fs.renameSync(vp, dest);
      console.log('-> ' + (fs.statSync(dest).size / 1024).toFixed(0) + ' KB');
    } catch (e) { console.log('video-fail', e.message); }
  }
  await browser.close();
  console.log('DONE');
})();
