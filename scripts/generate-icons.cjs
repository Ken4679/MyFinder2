const fs = require('fs');
const path = require('path');
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const pngToIcoRaw = require('png-to-ico');
const pngToIco = pngToIcoRaw.default || pngToIcoRaw;

async function main() {
  const imagesDir = path.join(__dirname, '../src/assets/images');
  let sourceImgPath = null;
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    const found = files.find(f => f.startsWith('app_icon'));
    if (found) {
      sourceImgPath = path.join(imagesDir, found);
    }
  }

  const tauriIconsDir = path.join(__dirname, '../src-tauri/icons');
  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(tauriIconsDir)) fs.mkdirSync(tauriIconsDir, { recursive: true });
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  console.log('Reading source image:', sourceImgPath);
  const image = await Jimp.read(sourceImgPath || path.join(publicDir, 'icon.png'));

  // Generate PNG sizes
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
    { name: 'Square30x30Logo.png', size: 30 },
    { name: 'Square44x44Logo.png', size: 44 },
    { name: 'Square71x71Logo.png', size: 71 },
    { name: 'Square89x89Logo.png', size: 89 },
    { name: 'Square107x107Logo.png', size: 107 },
    { name: 'Square142x142Logo.png', size: 142 },
    { name: 'Square150x150Logo.png', size: 150 },
    { name: 'Square284x284Logo.png', size: 284 },
    { name: 'Square310x310Logo.png', size: 310 },
    { name: 'StoreLogo.png', size: 50 },
  ];

  for (const item of sizes) {
    const cloned = image.clone();
    cloned.resize({ w: item.size, h: item.size });
    const destPath = path.join(tauriIconsDir, item.name);
    await cloned.write(destPath);
    if (item.name === 'icon.png') {
      await cloned.write(path.join(publicDir, 'icon.png'));
      await cloned.write(path.join(publicDir, 'app-icon.png'));
    }
  }

  // Generate ICO
  const icoSourcePaths = [
    path.join(tauriIconsDir, '32x32.png'),
    path.join(tauriIconsDir, '128x128.png'),
    path.join(tauriIconsDir, '128x128@2x.png'),
  ];

  const icoBuf = await pngToIco(icoSourcePaths);
  fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), icoBuf);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);

  console.log('Successfully generated all Tauri and Windows desktop icons!');
}

main().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
