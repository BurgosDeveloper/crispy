const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const publicDir = path.join(rootDir, 'public');
const srcAssetsImgDir = path.join(rootDir, 'src', 'assets', 'img');
const exportDir = path.join(rootDir, 'export');
const buildDir = path.join(rootDir, 'build');

function convertPngToIco(pngBuffer) {
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Image type 1 (ICO)
  icoHeader.writeUInt16LE(1, 4); // Number of images (1)
  icoHeader.writeUInt8(0, 6); // Width (0 = 256px)
  icoHeader.writeUInt8(0, 7); // Height (0 = 256px)
  icoHeader.writeUInt8(0, 8); // Color count (0)
  icoHeader.writeUInt8(0, 9); // Reserved
  icoHeader.writeUInt16LE(1, 10); // Color planes (1)
  icoHeader.writeUInt16LE(32, 12); // Bits per pixel (32)
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Image size
  icoHeader.writeUInt32LE(22, 18); // Image offset (22)
  return Buffer.concat([icoHeader, pngBuffer]);
}

const iconSrc = path.join(assetsDir, 'icon.png');
const logoSrc = path.join(assetsDir, 'logo_default.png');

if (!fs.existsSync(iconSrc)) {
  console.error('No se encontró assets/icon.png');
  process.exit(1);
}

const iconBuffer = fs.readFileSync(iconSrc);
const logoBuffer = fs.existsSync(logoSrc) ? fs.readFileSync(logoSrc) : iconBuffer;
const icoBuffer = convertPngToIco(iconBuffer);

// 1. Ensure directories exist
[publicDir, srcAssetsImgDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 2. Write to public/
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
fs.writeFileSync(path.join(publicDir, 'icon.png'), iconBuffer);
fs.writeFileSync(path.join(publicDir, 'logo_default.png'), logoBuffer);
fs.writeFileSync(path.join(publicDir, 'logo192.png'), iconBuffer);
fs.writeFileSync(path.join(publicDir, 'logo512.png'), iconBuffer);
console.log('✅ Assets sincronizados en public/');

// 3. Write to src/assets/
fs.writeFileSync(path.join(rootDir, 'src', 'assets', 'logo.png'), logoBuffer);
fs.writeFileSync(path.join(rootDir, 'src', 'assets', 'icon.png'), iconBuffer);
fs.writeFileSync(path.join(srcAssetsImgDir, 'logo.png'), logoBuffer);
console.log('✅ Assets sincronizados en src/assets/');

// 4. Write to export/
fs.writeFileSync(path.join(exportDir, 'crispy_icon.ico'), icoBuffer);
fs.writeFileSync(path.join(exportDir, 'crispy_icon.png'), iconBuffer);
fs.writeFileSync(path.join(exportDir, 'pizza_icon.ico'), icoBuffer);
fs.writeFileSync(path.join(exportDir, 'pizza_icon.png'), iconBuffer);
console.log('✅ Assets sincronizados en export/');

// 5. If build exists, copy directly to build/ so running server catches it immediately
if (fs.existsSync(buildDir)) {
  fs.writeFileSync(path.join(buildDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), iconBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo_default.png'), logoBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo192.png'), iconBuffer);
  fs.writeFileSync(path.join(buildDir, 'logo512.png'), iconBuffer);
  console.log('✅ Assets sincronizados en build/');
}

console.log('🎉 Sincronización de assets completada con éxito.');
