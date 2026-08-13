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

import { provenanceLine } from '../lib/snapshot.js';
import { drawMark, markWidth } from './brand.js';
import { fmtPct, fmtSigned, tokens } from './theme.js';

const W = 720;
const H = 380;
const PAD = 40;
const FONT = 'Inter Tight, Inter, system-ui, sans-serif';

/** Drawn at 2×, so the card is sharp when pasted somewhere that scales it. */
function makeCanvas(scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
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
export function drawSnapshot(model, t = tokens()) {
  const { canvas, ctx } = makeCanvas();
  const up = (model.pct ?? 0) >= 0;

  ctx.fillStyle = t.surface;
  ctx.fillRect(0, 0, W, H);

  // --- the brand ------------------------------------------------------------
  const markH = 26;
  drawMark(ctx, { x: PAD, y: PAD - 6, height: markH, ink: t.brandInk, accent: t.brandAccent });
  ctx.fillStyle = t.textSecondary;
  ctx.font = `500 15px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ASTERIA', PAD + markWidth(markH) + 12, PAD + markH / 2 - 6);
  ctx.textBaseline = 'alphabetic';

  // --- what this is ---------------------------------------------------------
  ctx.fillStyle = t.text;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(clip(ctx, model.name, W / 2 - PAD), PAD, 132);

  if (model.symbol) {
    ctx.fillStyle = t.muted;
    ctx.font = '400 18px Inter, system-ui, sans-serif';
    ctx.fillText(model.symbol, PAD, 160);
  }

  // --- the number -----------------------------------------------------------
  ctx.fillStyle = up ? t.pos : t.neg;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(model.pct == null ? 'all gain' : fmtPct(model.pct), PAD, 236);

  ctx.fillStyle = t.textSecondary;
  ctx.font = '400 17px Inter, system-ui, sans-serif';
  ctx.fillText(
    model.pct == null ? 'more has come out than went in' : 'on the money put in',
    PAD,
    262,
  );

  // The amount, only when US-46 is off. `model.amount` is already null when it
  // is on — this branch is a second lock on the same door, not the only one.
  if (model.amount != null) {
    ctx.fillStyle = up ? t.pos : t.neg;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(fmtSigned(model.amount), PAD, 298);
  }

  drawSpark(ctx, model.spark, { x: W / 2 + 20, y: 120, w: W / 2 - PAD - 20, h: 150, up, t });

  // --- provenance, and it is allowed to be bad news -------------------------
  const failed = model.provenance?.reconciled === false;
  ctx.fillStyle = failed ? t.neg : t.muted;
  ctx.font = `${failed ? '600' : '400'} 14px Inter, system-ui, sans-serif`;
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
export async function copySnapshot(model) {
  let blob;
  try {
    const canvas = drawSnapshot(model);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return { ok: false, error: 'the image could not be encoded' };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}
