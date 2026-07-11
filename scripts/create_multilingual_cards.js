const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..', '..');
const out = path.join(root, 'output', 'pdf');
const logoPath = path.join(root, 'pocketfriend-website', 'assets', 'logo-wide.png');

const locales = [
  {
    id: 'english', code: 'en', lang: 'en', dir: 'ltr', font: 'Segoe UI', accentFont: 'Georgia',
    title: 'Founder & Digital Solutions Partner', titleSize: 30, sloganSize: 38,
    slogan: ['Turn online attention', 'into real revenue.'],
    call: 'CALL / WHATSAPP', email: 'EMAIL',
    cta: ['SCAN FOR A', 'FREE PROPOSAL'], ctaSize: 24,
    benefit: ['WEBSITES THAT', 'WORK FOR YOU.'], benefitSize: 24,
  },
  {
    id: 'spanish', code: 'es', lang: 'es', dir: 'ltr', font: 'Segoe UI', accentFont: 'Georgia',
    title: 'Fundador y socio de soluciones digitales', titleSize: 27, sloganSize: 35,
    slogan: ['Convierte la atención digital', 'en ingresos reales.'],
    call: 'LLAMADA / WHATSAPP', email: 'CORREO',
    cta: ['ESCANEA PARA UNA', 'PROPUESTA GRATUITA'], ctaSize: 20,
    benefit: ['SITIOS WEB QUE', 'TRABAJAN PARA TI.'], benefitSize: 22,
  },
  {
    id: 'arabic', code: 'ar', lang: 'ar', dir: 'rtl', font: 'Arial', accentFont: 'Arial',
    title: 'مؤسس وشريك الحلول الرقمية', titleSize: 30, sloganSize: 37,
    slogan: ['حوّل الاهتمام الرقمي', 'إلى إيرادات حقيقية.'],
    call: 'اتصال / واتساب', email: 'البريد الإلكتروني',
    cta: ['امسح الرمز للحصول', 'على عرض مجاني'], ctaSize: 22,
    benefit: ['مواقع إلكترونية', 'تعمل من أجلك.'], benefitSize: 24,
  },
  {
    id: 'chinese', code: 'zh', lang: 'zh-CN', dir: 'ltr', font: 'SimSun', accentFont: 'SimSun',
    title: '创始人兼数字解决方案合作伙伴', titleSize: 29, sloganSize: 39,
    slogan: ['将线上关注', '转化为实际收益。'],
    call: '电话 / WHATSAPP', email: '电子邮箱',
    cta: ['扫码获取', '免费方案'], ctaSize: 28,
    benefit: ['真正为您服务的', '专业网站'], benefitSize: 25,
  },
  {
    id: 'thai', code: 'th', lang: 'th', dir: 'ltr', font: 'Leelawadee UI', accentFont: 'Leelawadee UI',
    title: 'ผู้ก่อตั้งและพันธมิตรโซลูชันดิจิทัล', titleSize: 28, sloganSize: 35,
    slogan: ['เปลี่ยนความสนใจออนไลน์', 'ให้เป็นรายได้จริง'],
    call: 'โทร / WHATSAPP', email: 'อีเมล',
    cta: ['สแกนเพื่อรับ', 'ข้อเสนอฟรี'], ctaSize: 25,
    benefit: ['เว็บไซต์ที่', 'ทำงานเพื่อคุณ'], benefitSize: 25,
  },
  {
    id: 'vietnamese', code: 'vi', lang: 'vi', dir: 'ltr', font: 'Segoe UI', accentFont: 'Segoe UI',
    title: 'Nhà sáng lập & Đối tác Giải pháp Số', titleSize: 27, sloganSize: 34,
    slogan: ['Biến sự chú ý trực tuyến', 'thành doanh thu thực tế.'],
    call: 'GỌI / WHATSAPP', email: 'EMAIL',
    cta: ['QUÉT ĐỂ NHẬN', 'ĐỀ XUẤT MIỄN PHÍ'], ctaSize: 21,
    benefit: ['WEBSITE HOẠT ĐỘNG', 'VÌ BẠN.'], benefitSize: 21,
  },
];

function asDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function cardHtml(locale, logoData, qrData) {
  const rtl = locale.dir === 'rtl';
  const align = rtl ? 'right' : 'left';
  return `<!doctype html>
  <html lang="${locale.lang}" dir="${locale.dir}">
  <head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1125px; height: 675px; overflow: hidden; }
    body { background: #f9faf7; color: #0c1830; font-family: "${locale.font}", Arial, sans-serif; }
    .card { position: relative; width: 1125px; height: 675px; overflow: hidden; background: #f9faf7; }
    .right { position: absolute; left: 740px; top: 0; width: 385px; height: 675px; background: #07183f; }
    .stripe-orange { position: absolute; left: 710px; top: 0; width: 14px; height: 675px; background: #ff4d00; }
    .stripe-teal { position: absolute; left: 724px; top: 0; width: 16px; height: 675px; background: #04aea3; }
    .logo { position: absolute; left: 76px; top: 55px; width: 510px; height: 118px; object-fit: contain; object-position: left center; }
    .content { position: absolute; left: 76px; top: 194px; width: 581px; text-align: ${align}; direction: ${locale.dir}; }
    .name { direction: ltr; text-align: left; font-family: "Segoe UI", Arial, sans-serif; font-weight: 700; font-size: 60px; line-height: 1.06; }
    .title { margin-top: 7px; color: #04aea3; font-weight: 700; font-size: ${locale.titleSize}px; line-height: 1.18; }
    .slogan { margin-top: 23px; color: #07183f; font-family: "${locale.accentFont}", serif; font-style: italic; font-size: ${locale.sloganSize}px; line-height: 1.02; }
    .rule { margin-top: 25px; height: 9px; width: 100%; border-radius: 6px; background: #ff4d00; }
    .contacts { margin-top: 27px; direction: ltr; text-align: left; }
    .contact + .contact { margin-top: 18px; }
    .label { color: #ff4d00; font-family: "${locale.font}", Arial, sans-serif; font-size: 20px; line-height: 1.1; font-weight: 700; direction: ${locale.dir}; text-align: ${align}; }
    .value { margin-top: 4px; color: #0c1830; font-family: "Segoe UI", Arial, sans-serif; font-size: 34px; line-height: 1.08; direction: ltr; text-align: left; }
    .qrbox { position: absolute; left: 775px; top: 75px; width: 275px; height: 405px; border-radius: 25px; background: white; overflow: hidden; text-align: center; }
    .qrline { height: 10px; background: #ff4d00; }
    .qr { display: block; width: 259px; height: 259px; margin: 15px auto 0; image-rendering: pixelated; }
    .cta { margin-top: 18px; padding: 0 12px; color: #0c1830; font-family: "${locale.font}", Arial, sans-serif; font-weight: 700; font-size: ${locale.ctaSize}px; line-height: 1.08; direction: ${locale.dir}; }
    .url { margin-top: 10px; color: #536075; font-family: "Segoe UI", Arial, sans-serif; font-size: 22px; direction: ltr; }
    .benefit { position: absolute; left: 790px; top: 525px; width: 275px; font-family: "${locale.font}", Arial, sans-serif; font-size: ${locale.benefitSize}px; line-height: 1.55; font-weight: 700; direction: ${locale.dir}; text-align: ${rtl ? 'right' : 'left'}; }
    .benefit .first { color: #ff4d00; }
    .benefit .second { color: white; }
  </style></head>
  <body><div class="card">
    <div class="right"></div><div class="stripe-orange"></div><div class="stripe-teal"></div>
    <img class="logo" src="${logoData}">
    <div class="content">
      <div class="name">Abd Ul Khader</div>
      <div class="title">${locale.title}</div>
      <div class="slogan">${locale.slogan[0]}<br>${locale.slogan[1]}</div>
      <div class="rule"></div>
      <div class="contacts">
        <div class="contact"><div class="label">${locale.call}</div><div class="value">(786) 860-9286</div></div>
        <div class="contact"><div class="label">${locale.email}</div><div class="value">contact@pocketfriend.io</div></div>
      </div>
    </div>
    <div class="qrbox"><div class="qrline"></div><img class="qr" src="${qrData}"><div class="cta">${locale.cta[0]}<br>${locale.cta[1]}</div><div class="url">pocketfriend.io</div></div>
    <div class="benefit"><div class="first">${locale.benefit[0]}</div><div class="second">${locale.benefit[1]}</div></div>
  </div></body></html>`;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const logoBuffer = await sharp(logoPath).trim({ background: '#ffffff', threshold: 8 }).png().toBuffer();
  const logoData = asDataUri(logoBuffer);

  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--disable-gpu', '--force-color-profile=srgb'],
  });
  for (const locale of locales) {
    const qrBuffer = await sharp(path.join(out, `pocketfriend_qr_${locale.id}.png`)).png().toBuffer();
    const qrData = asDataUri(qrBuffer);
    const page = await browser.newPage({ viewport: { width: 1125, height: 675 }, deviceScaleFactor: 1 });
    await page.setContent(cardHtml(locale, logoData, qrData), { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1125, height: 675 },
      omitBackground: false,
    });
    await sharp(shot)
      .flatten({ background: '#f9faf7' })
      .png()
      .toFile(path.join(out, `pocketfriend_card_${locale.id}.png`));
    await page.close();
  }
  await browser.close();
  console.log(`Created ${locales.length} localized cards in ${out}`);
})();
