const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

function buildExtensionZip() {
  try {
    const extDir = path.join(__dirname, '..', 'extension');
    const chromeExtDir = path.join(__dirname, '..', 'chrome-extension');
    const publicDir = path.join(__dirname, '..', 'public');
    const publicExtDir = path.join(publicDir, 'extension');
    const rootZipPath = path.join(__dirname, '..', 'whatshire-extension.zip');
    const publicZipPath = path.join(publicDir, 'whatshire-extension.zip');
    const publicShortZipPath = path.join(publicDir, 'extension.zip');

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    if (fs.existsSync(extDir)) {
      // Sync into public/extension and chrome-extension
      copyFolderSync(extDir, publicExtDir);
      copyFolderSync(extDir, chromeExtDir);

      const zip = new AdmZip();
      zip.addLocalFolder(extDir);

      zip.writeZip(rootZipPath);
      zip.writeZip(publicZipPath);
      zip.writeZip(publicShortZipPath);

      console.log('✅ Generated whatshire-extension.zip and synced chrome-extension/ directory.');
    } else {
      console.warn('[ZIP BUILDER] extension directory not found.');
    }
  } catch (err) {
    console.error('[ZIP BUILDER ERROR]:', err.message);
  }
}

module.exports = {
  buildExtensionZip,
};
