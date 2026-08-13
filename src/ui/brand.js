/**
 * The Asteria mark.
 *
 * One geometry, two renderers: an inline `<svg>` for the DOM and `Path2D` for a
 * canvas. Both take their colours from tokens, so there is no second palette and
 * **no file path chosen in JavaScript** — the brand rule that a
 * `theme === 'dark' ? a : b` in a render function would quietly break.
 *
 * ## Why the geometry is code and the two SVG files are not loaded
 *
 * `assets/logo/asteria-logo-{light,dark}.svg` are in the repo and differ only in
 * their five colour values. They exist for the media CSS cannot reach — favicon,
 * README, an OG image — where the choice is made on the medium's own background.
 * The app renders the inline mark instead, and for a canvas that is forced
 * rather than merely preferred:
 *
 *  - An SVG loaded through `<img>` or `drawImage` **does not inherit
 *    `currentColor`** and is unreachable by the page's CSS. It paints whatever
 *    fill is baked into the file, so a file-based watermark would have to pick
 *    one of the two variants in JS — the thing the rule forbids — or load both
 *    and swap, which is the same thing wearing a hat.
 *  - The wordmark in those files is still a live `<text>` on an `Inter Tight`
 *    fallback. Rasterising it depends on a font that may not be installed,
 *    which is the cross-machine drift the brand note already flags.
 *
 * Both problems vanish at watermark size: **the lockup has a 24 px floor, and
 * below it the brand note prescribes the mark alone, without the wordmark.** So
 * the watermark is the mark, no text is rasterised, and nothing here needs a
 * font to be installed.
 *
 * ## Kept honest
 *
 * Every path below is copied from `asteria-logo-light.svg`, in the coordinate
 * space of its `translate(6,8)` group. `test/brand.test.js` re-parses that file
 * and fails if the two disagree, so a new logo drop cannot leave a stale
 * hand-typed copy behind — which is exactly how a mark ends up subtly wrong in
 * one place for a year with nobody comparing them side by side.
 */

/**
 * The mark's box, in the source file's group coordinates.
 *
 * Tight to the ink: the stroke's half-width and the dots' radius at the
 * bottom-left, the spark's extent at the top-right. Not the lockup's 240×64,
 * which is mostly wordmark and would place the mark where the text used to be.
 */
export const VIEWBOX = Object.freeze({ x: 2, y: 2, w: 44, h: 40 });

/** The rising line. Stroked, never filled. */
export const LINE = 'M5 37 L15 27 L24 31 L33 19';
export const STROKE_W = 3.2;

/**
 * A vertex of the line.
 *
 * **Three, not four.** The line has four points and the fourth — its head at
 * (33,19) — carries no dot, because the spark sits there. Adding one is the
 * mistake a redraw from a screenshot makes, and it looks right until you
 * overlay the two.
 */
export const DOTS = Object.freeze([
  Object.freeze([5, 37]),
  Object.freeze([15, 27]),
  Object.freeze([24, 31]),
]);
export const DOT_R = 2.8;

/** The four-point spark. **Accent only** — the brand allows it two values. */
export const STAR = 'M35 4 C35.7 9.2 38.2 12.3 44 13 C38.2 13.7 35.7 16.8 35 22 '
  + 'C34.3 16.8 31.8 13.7 26 13 C31.8 12.3 34.3 9.2 35 4 Z';

/** The wordmark, for the one place it is built from code rather than a file. */
export const WORDMARK = Object.freeze({
  text: 'ASTERIA',
  font: 'Inter Tight, Inter, system-ui, sans-serif',
  weight: 500,
  size: 30,
  tracking: 2.6,
});

/**
 * The lockup's floor, from the brand note. Below this the wordmark comes off and
 * the mark stands alone. It is a rule rather than a rendering hint, so
 * `lockupSvg` enforces it instead of trusting the caller.
 */
export const MIN_LOCKUP_HEIGHT = 24;

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** The mark's paths, appended to whatever node is passed. Shared by both builders. */
function appendMark(parent) {
  parent.append(el('path', {
    d: LINE,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': STROKE_W,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));
  for (const [cx, cy] of DOTS) parent.append(el('circle', { cx, cy, r: DOT_R, fill: 'currentColor' }));
  parent.append(el('path', { d: STAR, fill: 'var(--brand-accent)' }));
}

/**
 * The mark alone, as an inline `<svg>`.
 *
 * Ink rides on `currentColor` so it inherits whatever it is placed in and
 * follows light, dark and auto with nothing read in JavaScript. The spark takes
 * `--brand-accent`, defined for all three states in styles.css.
 *
 * `title` is null by default: a watermark is decoration, not content, and naming
 * it makes a screen reader announce the brand on every card. Pass a string only
 * where the mark genuinely *is* the label.
 */
export function markSvg({ height = 24, title = null, className = 'asteria-mark' } = {}) {
  const { x, y, w, h } = VIEWBOX;
  const svg = el('svg', {
    viewBox: `${x} ${y} ${w} ${h}`,
    height,
    width: Math.round((height * w) / h),
    class: className,
    fill: 'none',
  });
  if (title) {
    const t = document.createElementNS(NS, 'title');
    t.textContent = title;
    svg.append(t);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  appendMark(svg);
  return svg;
}

/**
 * The full lockup — mark plus wordmark.
 *
 * **Below `MIN_LOCKUP_HEIGHT` this returns the mark alone** rather than a lockup
 * with unreadable text. The aspect ratio is fixed for the same reason: the
 * spacing between mark and wordmark cannot be adjusted by passing a width.
 */
export function lockupSvg({ height = 32, title = 'Asteria', className = 'asteria-lockup' } = {}) {
  if (height < MIN_LOCKUP_HEIGHT) return markSvg({ height, title, className });

  const svg = el('svg', {
    viewBox: '0 0 240 64',
    height,
    width: Math.round((height * 240) / 64),
    class: className,
    fill: 'none',
  });
  const t = document.createElementNS(NS, 'title');
  t.textContent = title;
  svg.append(t);

  const g = el('g', { transform: 'translate(6,8)' });
  appendMark(g);
  svg.append(g);

  const word = el('text', {
    x: 66,
    y: 40,
    'font-family': WORDMARK.font,
    'font-size': WORDMARK.size,
    'font-weight': WORDMARK.weight,
    'letter-spacing': WORDMARK.tracking,
    fill: 'currentColor',
  });
  word.textContent = WORDMARK.text;
  svg.append(word);
  return svg;
}

/**
 * The mark, painted into a canvas context.
 *
 * Colours are passed in rather than read here: `theme.js` owns reading tokens,
 * and a second reader is a second source of truth.
 *
 * `opacity` multiplies both parts. Drawing the spark faintly is not recolouring
 * it — it is the same value composited over a surface, which is what any logo on
 * any background already is.
 */
export function drawMark(ctx, { x = 0, y = 0, height = 24, ink, accent, opacity = 1 } = {}) {
  const s = height / VIEWBOX.h;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-VIEWBOX.x, -VIEWBOX.y);

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = STROKE_W;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(LINE));

  for (const [cx, cy] of DOTS) {
    ctx.beginPath();
    ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = accent;
  ctx.fill(new Path2D(STAR));

  ctx.restore();
}

/** The drawn width for a given drawn height. Never chosen independently. */
export const markWidth = (height) => (height * VIEWBOX.w) / VIEWBOX.h;
