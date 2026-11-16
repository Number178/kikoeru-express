const { randomBytes } = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const KIKOETA_LYRIC_SUFFIX = '.kikoeta.lrc';

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function trackPathParts(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || /[:\0]/.test(part))) return null;
  return parts;
}

async function writeTrackLyric(root, workDir, parts, content) {
  const library = await fs.realpath(root);
  const work = await fs.realpath(path.join(library, workDir));
  if (!containsPath(library, work)) return false;

  const title = parts[parts.length - 1];
  const directory = await fs.realpath(path.join(work, ...parts.slice(0, -1)));
  if (!containsPath(work, directory)) return false;

  const audio = path.join(directory, title);
  const info = await fs.lstat(audio);
  if (!info.isFile()) return false;

  const destination = audio + KIKOETA_LYRIC_SUFFIX;
  const temporary = path.join(directory, `.kikoeta-${randomBytes(16).toString('hex')}.tmp`);
  const file = await fs.open(temporary, 'wx');
  try {
    try {
      await file.writeFile(content, 'utf8');
    } finally {
      await file.close();
    }
    // Publish only a complete lyric, with exclusive creation even on retries.
    try {
      await fs.link(temporary, destination);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const existing = await fs.lstat(destination);
      const contentBytes = Buffer.from(content, 'utf8');
      if (!existing.isFile() || existing.size !== contentBytes.length
          || !contentBytes.equals(await fs.readFile(destination))) throw err;
    }
  } finally {
    await fs.unlink(temporary).catch(err => console.error('Kikoeta lyric temporary file cleanup failed:', err.code));
  }
  return true;
}

module.exports = { KIKOETA_LYRIC_SUFFIX, trackPathParts, writeTrackLyric };
