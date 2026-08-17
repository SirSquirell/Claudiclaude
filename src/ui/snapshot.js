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

import { formatById, provenanceLine } from '../lib/snapshot.js';
import { drawMark, markWidth } from './brand.js';
import { fmtPct, fmtSigned, tokens } from './theme.js';

const PAD = 48;
const FONT = 'Inter Tight, Inter, system-ui, sans-serif';

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
function drawSpark(ctx, spark, { x, y, w, h, up, t }) {
  if (!spark || spark.length < 2) return;
  const lo = Math.min(...spark);
  const hi = Math.max(...spark);
  const span = hi - lo || 1;
  const px = (i) => x + (i / (spark.length - 1)) * w;
  const py = (v) => y + h - ((v - lo) / span) * h;

  if (lo < 0 && hi > 0) {
    ctx.save();
    ctx.strokeStyle = t.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, py(0));
    ctx.lineTo(x + w, py(0));
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = up ? t.pos : t.neg;
  ctx.lineWidth = 2.5;
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
   * Two layouts, not four.
   *
   * A landscape card has room beside the number and a portrait one does not, and
   * that is the only difference the four formats make — so the branch is on the
   * shape rather than on the id, and a fifth format needs no code here. The
   * threshold is where a half-width column stops being wide enough for a shape
   * to read as a shape.
   */
  const wide = W / H >= 1.3;
  const colW = wide ? W / 2 - PAD - 20 : W - PAD * 2;

  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, W, H);

  // --- the brand ------------------------------------------------------------
  const markH = 30;
  drawMark(ctx, { x: PAD, y: PAD, height: markH, ink: t.brandInk, accent: t.brandAccent });
  ctx.fillStyle = t.textSecondary;
  ctx.font = `500 16px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ASTERIA', PAD + markWidth(markH) + 14, PAD + markH / 2);
  ctx.textBaseline = 'alphabetic';

  // --- what this is ---------------------------------------------------------
  let y = PAD + markH + 60;
  ctx.fillStyle = t.text;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(clip(ctx, model.name, colW), PAD, y);

  if (model.symbol) {
    y += 30;
    ctx.fillStyle = t.muted;
    ctx.font = '400 19px Inter, system-ui, sans-serif';
    ctx.fillText(model.symbol, PAD, y);
  }

  // --- the number -----------------------------------------------------------
  y += 80;
  ctx.fillStyle = up ? t.pos : t.neg;
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText(model.pct == null ? 'all gain' : fmtPct(model.pct), PAD, y);

  y += 30;
  ctx.fillStyle = t.textSecondary;
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText(model.pct == null ? 'more has come out than went in' : 'on the money put in', PAD, y);

  // The amount, only when US-46 is off. `model.amount` is already null when it
  // is on — this branch is a second lock on the same door, not the only one.
  if (model.amount != null) {
    y += 44;
    ctx.fillStyle = up ? t.pos : t.neg;
    ctx.font = `600 27px ${FONT}`;
    ctx.fillText(fmtSigned(model.amount), PAD, y);
  }

  // --- the shape ------------------------------------------------------------
  /**
   * The spark takes whatever vertical room is left between the block above and
   * the footer, which is what makes one layout serve a 16:9 and a 9:16: the
   * story format has 700 more pixels of height and they all go here, where more
   * room means a bigger shape rather than more whitespace.
   */
  const footTop = H - PAD - (model.owner ? 52 : 24);
  if (wide) {
    drawSpark(ctx, model.spark, { x: W / 2 + 20, y: PAD + markH + 40, w: colW, h: footTop - PAD - markH - 80, up, t });
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
    const top = y + 48;
    const room = Math.max(80, footTop - top - 40);
    const h = Math.min(room, colW * 0.52);
    drawSpark(ctx, model.spark, { x: PAD, y: top + (room - h) / 2, w: colW, h, up, t });
  }

  // --- who is sharing it ----------------------------------------------------
  /**
   * Two different sentences for two different claims, and the wording is the
   * whole point of the `derived` flag. A name read out of the account may say the
   * account is that person's; a name somebody typed may only say who is posting
   * it. Rendering the typed one as the first would be the card asserting
   * something no code here checked.
   */
  if (model.owner) {
    ctx.fillStyle = t.textSecondary;
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText(
      clip(ctx, model.owner.derived ? `${model.owner.text}'s position` : `shared by ${model.owner.text}`, W - PAD * 2),
      PAD,
      H - PAD - 26,
    );
  }

  // --- provenance, and it is allowed to be bad news -------------------------
  const failed = model.provenance?.reconciled === false;
  ctx.fillStyle = failed ? t.neg : t.muted;
  ctx.font = `${failed ? '600' : '400'} 15px Inter, system-ui, sans-serif`;
  const period = model.period?.from ? `${model.period.from} → ${model.period.to}` : '';
  ctx.fillText(
    clip(ctx, [period, provenanceLine(model.provenance)].filter(Boolean).join('  ·  '), W - PAD * 2),
    PAD,
    H - PAD,
  );

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
