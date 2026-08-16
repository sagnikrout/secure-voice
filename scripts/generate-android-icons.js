import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function generateIcons() {
  console.log('🎨 Generating Valid PNG Icons for Android Mipmaps...');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Read logo.png as base64
  const logoData = fs.readFileSync(path.resolve('public/logo.png'));
  const base64Data = `data:image/jpeg;base64,${logoData.toString('base64')}`;

  for (const [dir, size] of Object.entries(SIZES)) {
    const targetDir = path.resolve(`android/app/src/main/res/${dir}`);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Square icon
    const pngBase64 = await page.evaluate(async ({ src, size, isRound }) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          if (isRound) {
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
          }

          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = src;
      });
    }, { src: base64Data, size, isRound: false });

    // Round icon
    const roundPngBase64 = await page.evaluate(async ({ src, size, isRound }) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = src;
      });
    }, { src: base64Data, size, isRound: true });

    // Save ic_launcher.png
    const squareBuffer = Buffer.from(pngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), squareBuffer);

    // Save ic_launcher_round.png
    const roundBuffer = Buffer.from(roundPngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundBuffer);

    // Save ic_launcher_foreground.png
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), squareBuffer);

    console.log(`   ✅ Generated ${dir} (${size}x${size} PNG)`);
  }

  // Also convert public/logo.png and public/favicon.png to true PNG
  const trueLogoBase64 = await page.evaluate(async ({ src }) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    });
  }, { src: base64Data });

  const trueLogoBuffer = Buffer.from(trueLogoBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.resolve('public/logo.png'), trueLogoBuffer);
  fs.writeFileSync(path.resolve('public/favicon.png'), trueLogoBuffer);
  console.log('   ✅ Converted public/logo.png & public/favicon.png to true PNG format');

  await browser.close();
  console.log('🎉 All Android icons generated successfully with valid PNG signatures!');
}

generateIcons().catch(console.error);
