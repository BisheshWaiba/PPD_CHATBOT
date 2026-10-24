// Keeps public/ free of dead files, broken references and unhelpful names. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const files = walk(publicDir).map(file => path.relative(publicDir, file).split(path.sep).join('/'));
const text = file => fs.readFileSync(path.join(publicDir, file), 'utf8');
const textFiles = files.filter(file => /\.(html|css|js)$/.test(file));

// Pages the server hands out itself, so nothing needs to link to them
const SERVED_BY_THE_APP = new Set(['404.html', 'home.html']);

test('every file in public/ is used by a page, a stylesheet or a script', () => {
  const unused = files.filter(file => {
    if (SERVED_BY_THE_APP.has(file)) return false;
    const name = path.posix.basename(file);
    return !textFiles.some(other => other !== file && text(other).includes(name));
  });
  assert.deepEqual(unused, [], `nothing refers to: ${unused.join(', ')}`);
});

test('every local file a page, stylesheet or script points to exists', () => {
  const missing = [];
  for (const file of textFiles) {
    const source = text(file);
    const refs = [
      ...source.matchAll(/(?:href|src)="(\/[^"#?]+\.[a-z0-9]+)"/gi),
      ...source.matchAll(/url\(['"]?(\/[^'")#?]+\.[a-z0-9]+)['"]?\)/gi)
    ].map(match => match[1]);
    for (const ref of refs) {
      if (!fs.existsSync(path.join(publicDir, ref))) missing.push(`${file} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('there are no empty files', () => {
  const empty = files.filter(file => fs.statSync(path.join(publicDir, file)).size === 0);
  assert.deepEqual(empty, []);
});

test('images are named for what they show, not for where they came from', () => {
  const images = files.filter(file => /\.(png|jpe?g|gif|webp|svg)$/i.test(file));
  assert.ok(images.length > 0);
  const badNames = images.filter(file => /whatsapp|^img[_-]?\d|screenshot|untitled|copy of|\(\d+\)/i.test(path.posix.basename(file)));
  assert.deepEqual(badNames, []);
});

test('only the current design is shipped: two stylesheets, loaded by the live pages', () => {
  const stylesheets = files.filter(file => file.endsWith('.css')).sort();
  assert.deepEqual(stylesheets, ['css/auth.css', 'css/site.css']);
  for (const page of files.filter(file => file.endsWith('.html'))) {
    assert.match(text(page), /href="\/css\/site\.css"/, `${page} must use site.css`);
  }
});
