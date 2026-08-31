const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function buildExtensionZip() {
  try {
    const extDir = path.join(__dirname, '..', 'extension');
    const publicDir = path.join(__dirname, '..', 'public');
    const rootZipPath = path.join(__dirname, '..', 'whatshire-extension.zip');
    const publicZipPath = path.join(publicDir, 'whatshire-extension.zip');
    const publicShortZipPath = path.join(publicDir, 'extension.zip');

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    if (!fs.existsSync(extDir)) {
      console.warn('[ZIP BUILDER] extension directory not found.');
      return;
    }

    const zip = new AdmZip();
    zip.addLocalFolder(extDir);

    zip.writeZip(rootZipPath);
    zip.writeZip(publicZipPath);
    zip.writeZip(publicShortZipPath);

    console.log('✅ Generated whatshire-extension.zip in public/ and root directory.');
  } catch (err) {
    console.error('[ZIP BUILDER ERROR]:', err.message);
  }
}

module.exports = {
  buildExtensionZip,
};
