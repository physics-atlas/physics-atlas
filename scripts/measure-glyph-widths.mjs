#!/usr/bin/env node
// Measures the advance width of every character the map's names may use and
// writes src/graph/glyphWidths.json — the table the concept layout sizes
// names with, so it can run at build time without a browser
// (src/graph/conceptLayout.ts). Each width is the larger of the system font
// here (Segoe UI on Windows) and Arial (close to Helvetica / San Francisco),
// so a name measured from the table is never shorter than it's drawn.
// Run by hand when the map's font changes: `node scripts/measure-glyph-widths.mjs`
// (needs Chrome, like the smoke test).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/graph/glyphWidths.json');
// Chrome, found as the smoke test finds it (CHROME_BIN overrides).
const CHROME =
  process.env.CHROME_BIN ??
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  }[process.platform] ??
  '/usr/bin/google-chrome';
// Basic Latin, Latin-1, Latin Extended-A, Greek, general punctuation, arrows, maths.
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0x17f],
  [0x391, 0x3c9],
  [0x2010, 0x2027],
  [0x2190, 0x2199],
  [0x2200, 0x22ff],
];
const chars = RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const table = await page.evaluate((chars) => {
  const ctx = document.createElement('canvas').getContext('2d');
  const STACKS = ['system-ui, -apple-system, "Segoe UI", sans-serif', 'Arial, sans-serif'];
  const widths = (style) =>
    Object.fromEntries(
      chars.map((c) => {
        const w = Math.max(
          ...STACKS.map((stack) => {
            ctx.font = `${style} 1000px ${stack}`;
            return ctx.measureText(c).width;
          }),
        );
        return [c, Math.ceil(w)];
      }),
    );
  return { em: 1000, normal: widths('normal'), italic: widths('italic') };
}, chars);
await browser.close();
writeFileSync(OUT, JSON.stringify(table) + '\n');
console.log(`✓ ${chars.length} characters → src/graph/glyphWidths.json`);
