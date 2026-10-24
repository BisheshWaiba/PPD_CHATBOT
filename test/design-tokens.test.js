// Colour contrast of the design tokens, and the rules that keep keyboard focus visible.
// Run with: npm test
//
// Text needs 4.5:1 (WCAG AA) and focus rings and button outlines need 3:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'site.css'), 'utf8');

const tokens = Object.fromEntries(
  [...css.slice(0, css.indexOf('}', css.indexOf(':root'))).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)]
    .map(match => [match[1], match[2]])
);

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const color = name => (name === 'white' ? '#FFFFFF' : tokens[name]);

const atLeast = (minimum, pairs) => {
  for (const [foreground, background, what] of pairs) {
    const ratio = contrast(color(foreground), color(background));
    assert.ok(ratio >= minimum, `${what}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
  }
};

test('the tokens are readable from the stylesheet', () => {
  for (const name of ['ink', 'berry', 'berry-dark', 'ground', 'surface', 'blush', 'plum-card', 'on-dark-soft', 'apricot-light']) {
    assert.ok(tokens[name], `missing --${name}`);
  }
});

test('text on the light surfaces is readable (4.5:1)', () => {
  atLeast(4.5, [
    ['ink', 'ground', 'body text'], ['ink', 'surface', 'body text on cards'],
    ['ink-soft', 'ground', 'secondary text'], ['ink-soft', 'surface', 'secondary text on cards'],
    ['muted', 'ground', 'muted text'], ['muted', 'surface', 'muted text on cards'],
    ['berry-dark', 'surface', 'answer and Try again buttons'], ['berry-dark', 'blush', 'those buttons on hover'],
    ['berry', 'surface', 'links in chat messages'], ['white', 'berry', 'text on berry buttons']
  ]);
});

test('text on the dark surfaces is readable (4.5:1), including the newsletter placeholder', () => {
  atLeast(4.5, [
    ['on-dark', 'ink', 'footer and brand panel text'], ['on-dark-soft', 'ink', 'softer footer text'],
    ['on-dark', 'plum-card', 'text in the newsletter box'], ['on-dark-soft', 'plum-card', 'newsletter placeholder'],
    ['white', 'berry', 'call-to-action card text']
  ]);
});

test('the berry focus ring is visible on the light surfaces (3:1)', () => {
  atLeast(3, [['berry', 'ground', 'ring on the page'], ['berry', 'surface', 'ring on cards'], ['berry', 'blush', 'ring on tinted cards']]);
});

test('the light focus ring is visible on the dark and berry surfaces (3:1)', () => {
  atLeast(3, [
    ['apricot-light', 'ink', 'ring on the footer and brand panel'],
    ['apricot-light', 'plum-card', 'ring on the newsletter box'],
    ['apricot-light', 'berry', 'ring on the call-to-action card']
  ]);
});

test('the rules that use those colours are in the stylesheet', () => {
  const rule = (selector) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `missing rule: ${selector}`);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.match(rule('.newsletter-form input::placeholder'), /color:\s*var\(--on-dark-soft\)/);
  for (const selector of ['.site-footer :is(a, button, input):focus-visible', '.auth-brand a:focus-visible', '.cta-card a:focus-visible']) {
    assert.ok(css.includes(selector), `missing focus rule for ${selector}`);
  }
  assert.match(rule('.site-footer :is(a, button, input):focus-visible'), /outline-color:\s*var\(--apricot-light\)/);
  // The base rule that every page gets
  assert.match(rule('a:focus-visible, button:focus-visible, input:focus-visible'), /outline:\s*3px solid var\(--berry\)/);
});
