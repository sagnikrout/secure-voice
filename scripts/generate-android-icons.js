import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function generateIcons() {
  console.log('🎨 Generating Valid PNG Icons for Android Mipmaps and Web Branding...');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Read Candidate 4A Knurled Receiver Core as source
  const sourcePath = path.join(rootDir, 'public/candidates/round4_candidate_4a_knurled_receiver_core.jpg');
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Candidate 4A source not found at ${sourcePath}`);
  }
  const sourceData = fs.readFileSync(sourcePath);
  const base64Data = `data:image/jpeg;base64,${sourceData.toString('base64')}`;

  // 1. Generate Web Assets: public/logo.png (512x512) and public/favicon.png (192x192)
  for (const [filename, targetSize] of [['logo.png', 512], ['favicon.png', 192]]) {
    const pngBase64 = await page.evaluate(async ({ src, size }) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = src;
      });
    }, { src: base64Data, size: targetSize });

    const targetPath = path.join(rootDir, 'public', filename);
    const buf = Buffer.from(pngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(targetPath, buf);
    console.log(`   ✅ Generated public/${filename} (${targetSize}x${targetSize} PNG)`);
  }

  // 2. Generate Android Mipmap Sets
  for (const [dir, size] of Object.entries(SIZES)) {
    const targetDir = path.join(rootDir, 'android/app/src/main/res', dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Square icon
    const squarePngBase64 = await page.evaluate(async ({ src, size }) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = src;
      });
    }, { src: base64Data, size });

    // Round icon
    const roundPngBase64 = await page.evaluate(async ({ src, size }) => {
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
    }, { src: base64Data, size });

    // Save ic_launcher.png
    const squareBuffer = Buffer.from(squarePngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), squareBuffer);

    // Save ic_launcher_round.png
    const roundBuffer = Buffer.from(roundPngBase64.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundBuffer);

    // Save ic_launcher_foreground.png
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), squareBuffer);

    console.log(`   ✅ Generated ${dir} (${size}x${size} PNG)`);
  }

  await browser.close();
  console.log('🎉 All Web and Android production icons generated successfully with valid PNG signatures!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
