import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const distDir = path.resolve('dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.error('dist/index.html not found. Run build first.');
  process.exit(1);
}

let html = fs.readFileSync(indexHtmlPath, 'utf-8');

// Find all script and link tags with href/src
const assetRegex = /<(script|link)[^>]+(src|href)="([^"]+)"[^>]*>/g;

let match;
while ((match = assetRegex.exec(html)) !== null) {
  const fullTag = match[0];
  const tagType = match[1];
  const attr = match[2];
  const relativePath = match[3];

  // Ignore external links or non-JS/CSS
  if (relativePath.startsWith('http') || relativePath.startsWith('data:')) continue;
  if (!relativePath.endsWith('.js') && !relativePath.endsWith('.css')) continue;

  const absoluteAssetPath = path.join(distDir, relativePath.startsWith('/') ? relativePath.substring(1) : relativePath);
  
  if (fs.existsSync(absoluteAssetPath)) {
    const fileBuffer = fs.readFileSync(absoluteAssetPath);
    const hash = crypto.createHash('sha384').update(fileBuffer).digest('base64');
    const integrityStr = `integrity="sha384-${hash}" crossorigin="anonymous"`;
    
    // Inject integrity attribute before the closing bracket
    const newTag = fullTag.replace('>', ` ${integrityStr}>`);
    html = html.replace(fullTag, newTag);
    console.log(`✅ Generated SRI for ${relativePath}`);
  }
}

fs.writeFileSync(indexHtmlPath, html);
console.log('✅ Subresource Integrity (SRI) successfully injected into index.html');