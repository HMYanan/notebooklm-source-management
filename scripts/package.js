const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const pkg = require('../package.json');
const releaseDir = path.resolve(__dirname, '..', 'release');
const zipName = `notebooklm-source-management-${pkg.version}.zip`;
const zipPath = path.join(releaseDir, zipName);

async function ensureReleaseDir() {
  await fs.promises.rm(releaseDir, { recursive: true, force: true });
  await fs.promises.mkdir(releaseDir, { recursive: true });
}

function archiveFiles(archive) {
  const baseDir = path.resolve(__dirname, '..');
  archive.file(path.join(baseDir, 'manifest.json'), { name: 'manifest.json' });
  appendDirectory(archive, path.join(baseDir, 'src'), 'src');
  appendDirectory(archive, path.join(baseDir, '_locales'), '_locales');

  const privacyPath = path.join(baseDir, 'PRIVACY.md');
  if (fs.existsSync(privacyPath)) {
    archive.file(privacyPath, { name: 'PRIVACY.md' });
  }
}

function appendDirectory(archive, absoluteDir, zipDir) {
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;

    const sourcePath = path.join(absoluteDir, entry.name);
    const targetPath = path.posix.join(zipDir, entry.name);

    if (entry.isDirectory()) {
      appendDirectory(archive, sourcePath, targetPath);
      continue;
    }

    archive.file(sourcePath, { name: targetPath });
  }
}

async function buildZip() {
  await ensureReleaseDir();
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archiveFiles(archive);
  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });
  console.log(`Packaged extension at ${zipPath}`);
}

buildZip().catch((error) => {
  console.error('Packaging failed:', error);
  process.exit(1);
});
