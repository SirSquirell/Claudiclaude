/**
 * US-47 — the card, drawn and copied. The impure half.
 *
 * Every decision about *what* may appear lives in `src/lib/snapshot.js`. This
 * turns that model into pixels and puts them on the clipboard, and holds no
 * opinions of its own about content.
 *
 * ## Why it is drawn rather than captured
 *
 * `html2canvas` is a remote script and MV3's CSP forbids it; vendoring a DOM
 * rasteriser for one card is a great deal of surface for the benefit. But the
 * real reason is rule 7: **a DOM capture ships whatever happens to be on
 * screen** — an open tooltip, the row above, the reconciliation banner — where a
 * hand-drawn card ships a declared field list and nothing else. The constraint
 * turned out to be the better design.
 */

import { cardMetrics, formatById, provenanceLine } from '../lib/snapshot.js';
import { drawMark, markWidth } from './brand.js';
import { fmtPct, fmtSigned, tokens } from './theme.js';

/**
 * Two families, one ramp. The display face carries the figures and the name; the
 * text face carries the lines that are read as sentences. Sizes never appear
 * here — they come from `cardMetrics`, for the reason US-59 gives.
 */
const FONT = 'Inter Tight, Inter, system-ui, sans-serif';
const FONT_TEXT = 'Inter, system-ui, sans-serif';

/**
 * Drawn at 2× the declared size, so the card is sharp when pasted somewhere that
 * scales it. `w`/`h` come from `FORMATS`; the 2× is the device-pixel factor and
 * the drawing code never sees it.
 */
function makeCanvas(w, h, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

/** Trim to fit, so a long instrument name cannot run off the card. */
function clip(ctx, text, max) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * The sparkline: a shape with no axis and no scale.
 *
 * Normalised to its own extent, so it discloses the path the position took and
 * never a level. That is why it survives US-46 being on — there is nothing in it
 * to read off. The zero line is drawn when zero falls inside the range, because
 * without it a series that only ever fell still looks like a rise.
 */
function drawSpark(ctx, spark, { x, y, w, h, up, t, u = 1 }) {
  if (!spark || spark.length < 2) return;
  const lo = Math.min(...spark);
  const hi = Math.max(...spark);
  const span = hi - lo || 1;
  const px = (i) => x + (i / (spark.length - 1)) * w;
  const py = (v) => y + h - ((v - lo) / span) * h;

  if (lo < 0 && hi > 0) {
    ctx.save();
    ctx.strokeStyle = t.axis;
    // Scaled with the card for the same reason the type is (US-59): a hairline
    // that survives at 1280 wide is gone at the 500 a chat renders.
    ctx.lineWidth = 1.2 * u;
    ctx.setLineDash([3.5 * u, 3.5 * u]);
    ctx.beginPath();
    ctx.moveTo(x, py(0));
    ctx.lineTo(x + w, py(0));
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = up ? t.pos : t.neg;
  ctx.lineWidth = 3 * u;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  spark.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a model onto a fresh canvas and hand it back.
 *
 * Exported separately from the copy so a failure to *draw* is distinguishable
 * from a failure to *reach the clipboard* — they need different messages.
 */
export function drawSnapshot(model, t = tokens(), { format = '16:9' } = {}) {
  const { w: W, h: H } = formatById(format);
  const { canvas, ctx } = makeCanvas(W, H);
  const up = (model.pct ?? 0) >= 0;
  /**
   * Every size below is a multiple of the card's own width — US-59. There is no
   * bare pixel value in this function, and the test suite measures that the
   * smallest of them survives the scale a chat applies.
   */
  const m = cardMetrics(W);
  const PAD = m.pad;
  /**
   * Two layouts, not four.
   *
   * A landscape card has room beside the number and a portrait one does not, and
   * that is the only difference the four formats make — so the branch is on the
   * shape rather than on the id, and a fifth format needs no code here. The
   * threshold is where a half-width column stops being wide enough for a shape
   * to read as a shape.
   */
  const wide = W / H >= 1.3;
  const colW = wide ? W / 2 - PAD - m.markGap * 2 : W - PAD * 2;

  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, W, H);

  // --- the brand ------------------------------------------------------------
  const markH = m.markH;
  drawMark(ctx, { x: PAD, y: PAD, height: markH, ink: t.brandInk, accent: t.brandAccent });
  ctx.fillStyle = t.textSecondary;
  ctx.font = `500 ${m.type.brand}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ASTERIA', PAD + markWidth(markH) + m.markGap, PAD + markH / 2);
  ctx.textBaseline = 'alphabetic';

  // --- what this is ---------------------------------------------------------
  let y = PAD + markH + m.gapName;
  ctx.fillStyle = t.text;
  ctx.font = `600 ${m.type.name}px ${FONT}`;
  ctx.fillText(clip(ctx, model.name, colW), PAD, y);

  if (model.symbol) {
    y += m.gapSymbol;
    ctx.fillStyle = t.muted;
    ctx.font = `400 ${m.type.symbol}px ${FONT_TEXT}`;
    ctx.fillText(model.symbol, PAD, y);
  }

  // --- the number -----------------------------------------------------------
  y += m.gapHero;
  ctx.fillStyle = up ? t.pos : t.neg;
  ctx.font = `700 ${m.type.hero}px ${FONT}`;
  ctx.fillText(model.pct == null ? 'all gain' : fmtPct(model.pct), PAD, y);

  y += m.gapCaption;
  ctx.fillStyle = t.textSecondary;
  ctx.font = `400 ${m.type.caption}px ${FONT_TEXT}`;
  ctx.fillText(model.pct == null ? 'more has come out than went in' : 'on the money put in', PAD, y);

  // The amount, only when US-46 is off. `model.amount` is already null when it
  // is on — this branch is a second lock on the same door, not the only one.
  if (model.amount != null) {
    y += m.gapAmount;
    ctx.fillStyle = up ? t.pos : t.neg;
    ctx.font = `600 ${m.type.amount}px ${FONT}`;
    ctx.fillText(fmtSigned(model.amount), PAD, y);
  }

  // --- the footer, from the bottom up --------------------------------------
  /**
   * Three lines at most, stacked rather than concatenated, and this is US-59's
   * second correction.
   *
   * They used to be two: the sharer on one line, and the period *joined to* the
   * provenance on the other. At 500 px that joined line ran past the card and
   * `clip()` did what it is there to do — it truncated the tail, which is where
   * the reconciliation verdict is. So the worst case of the whole feature, a
   * card from an account that does **not** reconcile, printed `DOES NOT rec…`.
   * The one line that must never be the one that gets cut was the one being cut.
   *
   * Giving the period its own baseline leaves the verdict the full width. Two
   * short lines rather than one long one is also simply how a card footer reads.
   */
  const failed = model.provenance?.reconciled === false;
  const period = model.period?.from ? `${model.period.from} → ${model.period.to}` : '';
  const footer = [];
  if (model.owner) {
    /**
     * Two different sentences for two different claims, and the wording is the
     * whole point of the `derived` flag. A name read out of the account may say
     * the account is that person's; a name somebody typed may only say who is
     * posting it. Rendering the typed one as the first would be the card
     * asserting something no code here checked.
     */
    footer.push({
      text: model.owner.derived ? `${model.owner.text}'s position` : `shared by ${model.owner.text}`,
      size: m.type.owner,
      weight: '500',
      font: FONT,
      fill: t.textSecondary,
    });
  }
  if (period) footer.push({ text: period, size: m.type.provenance, weight: '400', font: FONT_TEXT, fill: t.muted });
  // Allowed to be bad news, and now allowed the room to say it in full.
  footer.push({
    text: provenanceLine(model.provenance),
    size: m.type.provenance,
    weight: failed ? '600' : '400',
    font: FONT_TEXT,
    fill: failed ? t.neg : t.muted,
  });

  const footTop = H - PAD - (footer.length - 1) * m.footLine - m.footHead;

  // --- the shape ------------------------------------------------------------
  /**
   * The spark takes whatever vertical room is left between the block above and
   * the footer, which is what makes one layout serve a 16:9 and a 9:16: the
   * story format has 700 more pixels of height and they all go here, where more
   * room means a bigger shape rather than more whitespace.
   */
  if (wide) {
    drawSpark(ctx, model.spark, {
      x: W / 2 + m.markGap * 2,
      y: PAD + markH + m.sparkTopWide,
      w: colW,
      h: footTop - PAD - markH - m.sparkTopWide * 2,
      up,
      t,
      u: m.u,
    });
  } else {
    /**
     * Capped, and this is the correction a 9:16 preview forced.
     *
     * Giving the story format all 1000 spare pixels of height stretched the
     * shape until every wiggle read as a crash — the sparkline is normalised to
     * its own extent, so its *aspect ratio* is the only thing controlling how
     * dramatic it looks, and a chart whose drama depends on the crop is the
     * thing this project does not ship. So the box keeps a fixed proportion and
     * the leftover height becomes whitespace, centred between the block above
     * and the footer.
     */
    const top = y + m.gapSpark;
    const room = Math.max(m.sparkFloor, footTop - top - m.sparkTopWide);
    const h = Math.min(room, colW * 0.52);
    drawSpark(ctx, model.spark, { x: PAD, y: top + (room - h) / 2, w: colW, h, up, t, u: m.u });
  }

  footer.forEach((line, i) => {
    ctx.fillStyle = line.fill;
    ctx.font = `${line.weight} ${line.size}px ${line.font}`;
    ctx.fillText(
      clip(ctx, line.text, W - PAD * 2),
      PAD,
      H - PAD - (footer.length - 1 - i) * m.footLine,
    );
  });

  return canvas;
}

/**
 * Put the card on the clipboard as a PNG.
 *
 * Resolves `{ok}` rather than throwing: the caller is a click handler, and a
 * clipboard refusal is an ordinary outcome that has to be *reported*.
 * `navigator.clipboard.write` rejects when the document is not focused, which is
 * the same failure `app.js`'s text copy already explains to the reader.
 */
export async function copySnapshot(model, opts) {
  const made = await snapshotBlob(model, opts);
  if (!made.ok) return made;

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': made.blob })]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * The palette of a theme that is not the one on screen.
 *
 * The sheet lets you post a dark card from a light app, and `tokens()` reads the
 * live document — so the document is what has to change. Flipping the attribute
 * and flipping it back inside one synchronous block is enough: the read forces a
 * style recalculation, but the browser cannot paint until the block returns, so
 * nothing flashes.
 *
 * The alternative was a fourth copy of thirty colour values in `styles.css`
 * under `[data-theme='light']`, which is a second palette to keep in step with
 * the first three and the thing the token setup exists to avoid.
 */
export function tokensForTheme(theme) {
  // Anything other than the two named themes means "whatever the page is", which
  // is also what a caller that does not care should get.
  if (theme !== 'light' && theme !== 'dark') return tokens();
  const root = document.documentElement;
  const before = root.dataset.theme;
  root.dataset.theme = theme;
  const t = tokens();
  if (before) root.dataset.theme = before;
  else delete root.dataset.theme;
  return t;
}

/** Draw and encode. Split out because the download path needs the same bytes. */
async function snapshotBlob(model, opts) {
  try {
    const canvas = drawSnapshot(model, tokensForTheme(opts?.theme), opts);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? { ok: true, blob } : { ok: false, error: 'the image could not be encoded' };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Save the card as a file.
 *
 * The second half of "download plus clipboard", and it is not redundant: the
 * clipboard path needs a focused document and a browser that accepts an image
 * item, and it fails often enough to have its own error message. A file always
 * works, and it is the only route on a phone.
 *
 * An object URL rather than a data URL, and revoked on the next frame — a
 * megabyte-and-a-half PNG as a string in an `href` is held for the life of the
 * page.
 */
export async function downloadSnapshot(model, opts) {
  const made = await snapshotBlob(model, opts);
  if (!made.ok) return made;

  const url = URL.createObjectURL(made.blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = String(model.symbol || model.name || 'position').replace(/[^\w-]+/g, '-').slice(0, 40);
  a.download = `asteria-${slug}-${opts?.format?.replace(':', 'x') ?? 'card'}.png`;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
  return { ok: true };
}
