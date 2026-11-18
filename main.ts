// THE WORLD TODAY — Wednesday 18 November 2026.
// A Node 22 program (standard library only) that draws a newspaper
// front page summing up the world's news of 18 November 2026 and writes
// it to <MAKEFUN_OUTPUT_DIR>/entry.png as a deterministic 1024x1024 PNG.
// No network. Two runs write byte-identical output.
// Everything is drawn by hand here: a small PNG encoder, a 5x7 bitmap
// font designed for this page, and procedural vector-style pictures.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG ---

const W = 1024;
const H = 1024;

// CRC-32 (IEEE) table, built once at load.
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(rgb: Buffer, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // One scanline per row, filter byte 0 (none), then RGB triples.
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- Canvas ---

type RGB = [number, number, number];

const PAPER: RGB = [247, 243, 232];
const INK: RGB = [20, 24, 34];
const NAVY: RGB = [20, 33, 61];
const GOLD: RGB = [176, 141, 58];
const RED: RGB = [178, 34, 34];
const BLUE: RGB = [31, 93, 158];
const TEAL: RGB = [15, 118, 110];
const GREY: RGB = [90, 90, 84];
const LIGHT: RGB = [232, 226, 210];
const WHITE: RGB = [255, 255, 255];

class Canvas {
  buf = Buffer.alloc(W * H * 3);
  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = PAPER[0];
      this.buf[i * 3 + 1] = PAPER[1];
      this.buf[i * 3 + 2] = PAPER[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  // Bresenham line.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
    for (let d = -Math.floor(t / 2); d <= Math.floor(t / 2); d++) {
      this.line(x0 + d, y0, x1 + d, y1, c);
      this.line(x0, y0 + d, x1, y1 + d, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      this.px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++)
        if (xx * xx + yy * yy <= r * r) this.px(cx + xx, cy + yy, c);
  }
  // Horizontal rule with a small diamond in the middle.
  rule(x: number, y: number, w: number, c: RGB): void {
    this.rect(x, y, w, 2, c);
    const mx = x + Math.floor(w / 2);
    this.disc(mx, y + 1, 4, c);
  }
}

// ------------------------------------------------------- 5x7 bitmap font ---
// Each glyph is 7 rows of 5 bits, '#' = ink. Designed by hand for this page.

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

Object.assign(FONT, {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  '•': ['.....', '.....', '.##..', '.##..', '.##..', '.....', '.....'],
});

// ------------------------------------------------------------ Text -------

const CHAR_W = 6; // 5 pixels + 1 gap, before scaling.

function textWidth(s: string, scale: number): number {
  return s.length * CHAR_W * scale - scale; // no trailing gap
}

function drawChar(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch];
  if (!g) return;
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row[col] === '#') {
        cv.rect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

// Draw one line of text, upper-cased (the font is capitals only).
function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    drawChar(cv, up[i], x + i * CHAR_W * scale, y, scale, c);
  }
}

function drawTextCentred(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s.toUpperCase(), scale) / 2), y, scale, c);
}

// Greedy word wrap into lines no wider than maxW pixels.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(cv: Canvas, s: string, x: number, y: number, maxW: number, scale: number, c: RGB, leading: number): number {
  const lines = wrap(s, maxW, scale);
  for (let i = 0; i < lines.length; i++) {
    drawText(cv, lines[i], x, y + i * leading, scale, c);
  }
  return y + lines.length * leading;
}

// A small filled tag, e.g. "LEAD STORY", white text on a colour band.
function tag(cv: Canvas, s: string, x: number, y: number, scale: number, bg: RGB): number {
  const w = textWidth(s, scale) + 16;
  const h = 7 * scale + 10;
  cv.rect(x, y, w, h, bg);
  drawText(cv, s, x + 8, y + 5, scale, WHITE);
  return w;
}

// ------------------------------------------------------------- Icons -----

// Four flags behind a summit table (Quad leaders in Manila).
function drawSummit(cv: Canvas, x: number, y: number): void {
  // Backdrop: pale sky panel with a gold frame.
  cv.rect(x, y, 252, 196, LIGHT);
  cv.rect(x, y, 252, 4, GOLD);
  cv.rect(x, y + 192, 252, 4, GOLD);
  // Four flag poles with simple flags.
  const flags: { c1: RGB; c2: RGB; c3: RGB }[] = [
    { c1: RED, c2: WHITE, c3: BLUE }, // US stripes
    { c1: [255, 153, 51], c2: WHITE, c3: [19, 136, 8] }, // India
    { c1: WHITE, c2: RED, c3: WHITE }, // Japan
    { c1: BLUE, c2: BLUE, c3: BLUE }, // Australia
  ];
  for (let i = 0; i < 4; i++) {
    const fx = x + 22 + i * 58;
    cv.rect(fx, y + 18, 4, 62, INK); // pole
    const f = flags[i];
    if (i === 0) {
      for (let s = 0; s < 5; s++) cv.rect(fx + 4, y + 18 + s * 7, 44, 7, s % 2 ? WHITE : RED);
      cv.rect(fx + 4, y + 18, 20, 18, BLUE);
    } else if (i === 1) {
      cv.rect(fx + 4, y + 18, 44, 12, f.c1);
      cv.rect(fx + 4, y + 30, 44, 11, WHITE);
      cv.rect(fx + 4, y + 41, 44, 12, f.c3);
      cv.disc(fx + 26, y + 35, 5, NAVY);
    } else if (i === 2) {
      cv.rect(fx + 4, y + 18, 44, 35, WHITE);
      cv.disc(fx + 26, y + 35, 10, RED);
    } else {
      cv.rect(fx + 4, y + 18, 44, 35, BLUE);
      cv.disc(fx + 14, y + 27, 3, WHITE);
      cv.disc(fx + 34, y + 27, 3, WHITE);
      cv.disc(fx + 24, y + 43, 3, WHITE);
    }
  }
  // Four leaders: heads above the table.
  const skin: RGB[] = [[222, 184, 150], [198, 152, 110], [235, 200, 170], [222, 184, 150]];
  for (let i = 0; i < 4; i++) {
    const hx = x + 48 + i * 58;
    cv.disc(hx, y + 112, 16, skin[i]);
    cv.disc(hx, y + 104, 17, [60, 60, 60]); // hair cap
    cv.rect(hx - 17, y + 100, 34, 8, [60, 60, 60]);
  }
  // Table.
  cv.rect(x + 8, y + 132, 236, 10, [120, 72, 20]);
  cv.rect(x + 8, y + 142, 236, 34, [146, 94, 32]);
  cv.rect(x + 20, y + 150, 212, 3, GOLD);
  drawText(cv, 'MANILA', x + 96, y + 160, 2, WHITE);
}

// A bridge with its middle span collapsed into the strait.
function drawBridge(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [214, 230, 240]); // sky
  // Sea.
  cv.rect(x, y + h - 34, w, 34, [38, 110, 160]);
  for (let i = 0; i < 5; i++) {
    cv.thickLine(x + 8 + i * 40, y + h - 22 + (i % 2) * 8, x + 34 + i * 40, y + h - 22 + (i % 2) * 8, 2, WHITE);
  }
  // Deck, with a gap in the middle where the arch fell.
  const gap = 46;
  const mid = x + Math.floor(w / 2);
  cv.thickLine(x + 6, y + 62, mid - gap, y + 62, 5, INK);
  cv.thickLine(mid + gap, y + 62, x + w - 6, y + 62, 5, INK);
  // Arch halves leaning into the gap.
  cv.thickLine(x + 30, y + 62, mid - gap + 8, y + 30, 4, RED);
  cv.thickLine(x + w - 30, y + 62, mid + gap - 8, y + 30, 4, RED);
  // Fallen arch in the water.
  cv.thickLine(mid - 34, y + h - 30, mid + 30, y + h - 8, 4, RED);
  cv.thickLine(mid - 30, y + h - 8, mid + 36, y + h - 28, 4, RED);
  // Support pillars.
  cv.rect(x + 26, y + 62, 8, h - 96, INK);
  cv.rect(x + w - 34, y + 62, 8, h - 96, INK);
  // Smoke puffs above the gap.
  cv.disc(mid - 12, y + 18, 9, GREY);
  cv.disc(mid + 10, y + 12, 11, GREY);
  cv.disc(mid + 2, y + 26, 7, [160, 160, 150]);
}

// A spiky virus ball (measles) over a shield with a cross.
function drawVirus(cv: Canvas, x: number, y: number): void {
  const cx = x + 100;
  const cy = y + 62;
  for (let a = 0; a < 12; a++) {
    const rad = (a * 30 * Math.PI) / 180;
    const x1 = Math.round(cx + 30 * Math.cos(rad));
    const y1 = Math.round(cy + 30 * Math.sin(rad));
    const x2 = Math.round(cx + 46 * Math.cos(rad));
    const y2 = Math.round(cy + 46 * Math.sin(rad));
    cv.thickLine(x1, y1, x2, y2, 3, RED);
    cv.disc(x2, y2, 5, RED);
  }
  cv.disc(cx, cy, 30, RED);
  cv.disc(cx - 9, cy - 9, 8, [214, 60, 60]);
  cv.disc(cx + 10, cy + 8, 6, [214, 60, 60]);
  // Small shield with a cross, bottom right.
  cv.rect(x + 150, y + 84, 52, 44, WHITE);
  cv.rect(x + 150, y + 84, 52, 4, TEAL);
  cv.rect(x + 171, y + 94, 10, 26, TEAL);
  cv.rect(x + 163, y + 102, 26, 10, TEAL);
}

// Radar sweep, a drone, and a burst (Gulf strikes).
function drawRadar(cv: Canvas, x: number, y: number): void {
  const cx = x + 62;
  const cy = y + 58;
  cv.circle(cx, cy, 46, TEAL);
  cv.circle(cx, cy, 30, TEAL);
  cv.disc(cx, cy, 4, TEAL);
  cv.thickLine(cx, cy, cx + 40, cy - 24, 3, TEAL); // sweep
  cv.thickLine(cx, cy, cx - 34, cy + 12, 2, [120, 180, 175]);
  cv.thickLine(cx, cy, cx + 10, cy + 40, 2, [120, 180, 175]);
  // Drone top right.
  const dx = x + 168;
  const dy = y + 34;
  cv.rect(dx - 16, dy - 6, 32, 12, INK);
  cv.thickLine(dx - 26, dy - 12, dx + 26, dy - 12, 2, INK);
  cv.thickLine(dx - 26, dy + 12, dx + 26, dy + 12, 2, INK);
  cv.disc(dx - 26, dy - 12, 4, INK);
  cv.disc(dx + 26, dy - 12, 4, INK);
  cv.disc(dx - 26, dy + 12, 4, INK);
  cv.disc(dx + 26, dy + 12, 4, INK);
  // Burst below the drone.
  const bx = x + 176;
  const by = y + 92;
  for (let a = 0; a < 8; a++) {
    const rad = (a * 45 * Math.PI) / 180;
    cv.thickLine(bx, by, Math.round(bx + 22 * Math.cos(rad)), Math.round(by + 22 * Math.sin(rad)), 3, GOLD);
  }
  cv.disc(bx, by, 9, RED);
}

// -------------------------------------------------------------- Page -----

function main(): void {
  const cv = new Canvas();
  const MX = 32; // side margin
  const RW = W - 2 * MX; // 960

  // Masthead.
  cv.rect(0, 0, W, 112, NAVY);
  drawTextCentred(cv, 'THE WORLD TODAY', W / 2, 26, 7, WHITE);
  cv.rect(0, 100, W, 3, GOLD);
  drawTextCentred(cv, 'ONE DAY  •  ONE PAGE  •  THE WORLD', W / 2, 82, 2, [200, 190, 160]);

  // Date line.
  drawTextCentred(cv, 'WEDNESDAY, 18 NOVEMBER 2026', W / 2, 126, 3, INK);
  cv.rule(MX, 158, RW, INK);

  // ---- Lead story: Quad summit, Manila.
  let y = 176;
  tag(cv, 'LEAD STORY', MX, y, 2, RED);
  drawText(cv, 'MANILA  •  INDO-PACIFIC', MX + 150, y + 5, 2, GREY);
  y += 34;
  drawSummit(cv, MX, y);
  const tx = MX + 276;
  drawPara(cv, 'FOUR LEADERS, ONE TABLE', tx, y + 2, RW - 276, 4, INK, 34);
  drawPara(
    cv,
    "Trump, Modi, Takaichi and Albanese meet in Manila — the Quad's first leaders' summit in two years.",
    tx, y + 44, RW - 276, 2, INK, 20,
  );
  drawPara(
    cv,
    "Five outcomes agreed: a business leaders' forum in Mumbai in 2027, maritime surveillance, cable links, cyber cooperation and counterterrorism.",
    tx, y + 108, RW - 276, 2, GREY, 20,
  );
  drawPara(cv, 'Trump now heads to China; the summit was held on the sidelines of the ASEAN meetings.', tx, y + 168, RW - 276, 2, GREY, 20);
  y += 212;

  // ---- Row two: two stories side by side.
  const colW = Math.floor((RW - 24) / 2); // 468
  const rowY = y + 6;
  // Left: bridges.
  tag(cv, 'WAR IN UKRAINE', MX, rowY, 2, NAVY);
  drawBridge(cv, MX, rowY + 34, colW, 118);
  drawPara(cv, 'KERCH BRIDGE ARCH FALLS', MX, rowY + 162, colW, 3, INK, 26);
  drawPara(
    cv,
    "Ukraine hit the Crimean Bridge a second day running; its road arch fell into the Kerch Strait. Russia hit Kyiv's two Dnipro bridges in reply.",
    MX, rowY + 196, colW, 2, INK, 20,
  );
  // Right: measles.
  const rx = MX + colW + 24;
  tag(cv, 'HEALTH', rx, rowY, 2, RED);
  drawVirus(cv, rx, rowY + 30);
  drawPara(cv, 'MEASLES-FREE STATUS LOST', rx, rowY + 162, colW, 3, INK, 26);
  drawPara(
    cv,
    'After 26 years, health chiefs say measles is spreading again in the US: 5,412 cases in 2026, the worst outbreak in over three decades.',
    rx, rowY + 196, colW, 2, INK, 20,
  );
  y = rowY + 292;

  // ---- Story four: Gulf strikes, full-width band.
  cv.rect(MX, y, RW, 132, LIGHT);
  cv.rect(MX, y, RW, 3, GOLD);
  drawRadar(cv, MX + 8, y + 12);
  const gx = MX + 232;
  tag(cv, 'MIDDLE EAST', gx, y + 10, 2, NAVY);
  drawPara(cv, 'GULF ON EDGE: IRAN HITS US RADAR', gx, y + 40, RW - 232 - 16, 3, INK, 26);
  drawPara(
    cv,
    "Iran's Guard says its drones hit a US radar at Sheikh Isa base in Bahrain, the third attack in five days. Bahrain says it stopped them; US jets then hit Iran's Qeshm Island.",
    gx, y + 70, RW - 232 - 16, 2, INK, 18,
  );
  y += 146;

  // ---- Briefs strip.
  tag(cv, 'ALSO TODAY', MX, y, 2, TEAL);
  const briefs = [
    'MONGOLIA: PRESIDENT RESIGNS AMID GRAFT CHARGES',
    'NVIDIA: BOARD RULES OUT HUANG RETURN; SALES $115.8BN',
    'JAPAN PROTESTS RUSSIAN JETS IN ITS AIRSPACE',
    'DHONI RETIRES FROM THE IPL, BECOMES CSK MENTOR',
    'CYCLONE AKVAN NEARS ANDHRA COAST; LANDFALL DUE 20 NOV',
  ];
  let by = y + 32;
  for (const b of briefs) {
    drawText(cv, '•  ' + b, MX, by, 2, INK);
    by += 19;
  }
  y = by + 4;

  // Footer.
  cv.rule(MX, y, RW, GREY);
  drawTextCentred(
    cv,
    'ALL STORIES REPORTED ON WEDNESDAY 18 NOVEMBER 2026  •  THE WORLD TODAY',
    W / 2, y + 10, 2, GREY,
  );

  const png = encodePng(cv.buf, W, H);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  const hash = createHash('sha256').update(png).digest('hex');
  console.log(`wrote ${png.length} bytes sha256=${hash}`);
}

main();
