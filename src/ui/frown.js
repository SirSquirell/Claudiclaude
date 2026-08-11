/**
 * "Put that frown upside down" — Optimism Mode.
 *
 * A switch on the Overview that takes a losing account and, with as little
 * dignity as possible, insists everything is fine.
 *
 * ## The joke is also the safety mechanism
 *
 * Everything else in this project exists so a number cannot look better than it
 * is. This feature's entire function is to make a loss look like a gain, which
 * read literally is the opposite. That is not a reason to refuse it — it is a
 * reason to build it so it **cannot be mistaken for the product**.
 *
 * The resolution is that plausibility is the danger, not absurdity. A tastefully
 * inverted chart is a chart someone screenshots and sends to their accountant.
 * A page that has visibly lost its mind is not. So the comedy is turned all the
 * way up on purpose: the sillier this is, the safer it is, and every element
 * below earns its place twice — once for the laugh and once because it makes
 * the still frame unmistakable.
 *
 * Concretely:
 *
 *  - **A stamp across the whole section**, rotated and unmissable, saying these
 *    are not the real numbers. It is the single most important element here and
 *    it is also the funniest, which is the whole thesis.
 *  - **The signs flip and the colours go with them**, because that is the ask.
 *  - **Every flipped tile gets a euphemism** — a rotating supply of them, so it
 *    is obviously a bit rather than a label.
 *  - **The charts flip vertically, axis and all.** A line going up with a scale
 *    still counting down is not a joke, it is a wrong chart. Both invert, so
 *    the picture is self-consistently ridiculous instead of quietly false.
 *  - **Confetti**, on a canvas, obeying `prefers-reduced-motion`.
 *  - **It does not persist**, it never leaves the Overview, and nothing
 *    downstream may read it: not the export, not the bug report, not a figure.
 *    Same quarantine Outlook has, for the same reason.
 */

const EUPHEMISMS = [
  'a temporary discount',
  'buying opportunity',
  'unrealised optimism',
  'the market owes you one',
  'aggressively undervalued',
  'long-term thinking',
  'a rounding error, eventually',
  'paying it forward',
  'character building',
  'tuition',
  'a strategic retreat',
  'priced in',
];

/** Stable per label, so a re-render does not reshuffle them mid-read. */
const euphemismFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return EUPHEMISMS[h % EUPHEMISMS.length];
};

let on = false;

/** Never persisted, never exported. A joke you turned on in March must not
 *  still be on in June when you are trying to read the thing. */
export const isOn = () => on;
export const setFrown = (v) => {
  on = v === true;
  document.documentElement.classList.toggle('frown', on);
  if (on) confetti();
  return on;
};

/**
 * Turn a signed figure into its cheerful counterpart.
 *
 * Only the *sign* is touched, and only for display. The magnitude is left
 * alone, so the number on screen is still recognisably the reader's own — which
 * is funnier than a fabricated one, and keeps the gag anchored to reality.
 */
export function cheerUp(text) {
  if (typeof text !== 'string') return text;
  if (!/[−-]/.test(text)) return text;
  return text.replace(/^([^\d−-]*)[−-]/, '$1+');
}

/** The label under a tile that has been turned upside down. */
export const spin = (label) => euphemismFor(String(label));

/**
 * Confetti, briefly.
 *
 * Canvas rather than a few hundred DOM nodes, and it removes itself. Skipped
 * entirely under `prefers-reduced-motion` — the joke is not worth making
 * somebody ill.
 */
function confetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'frown-confetti';
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  document.body.append(c);
  const ctx = c.getContext('2d');
  const colours = ['#557cd4', '#7b52ab', '#00868b', '#b0461a', '#a5851b', '#577f43', '#a03a6f'];
  const bits = Array.from({ length: 140 }, (_, i) => ({
    x: Math.random() * c.width,
    y: -20 - Math.random() * c.height * 0.5,
    r: 4 + Math.random() * 6,
    vy: 2 + Math.random() * 4,
    vx: -1 + Math.random() * 2,
    spin: -0.2 + Math.random() * 0.4,
    a: Math.random() * Math.PI,
    colour: colours[i % colours.length],
  }));

  let frames = 0;
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.y += b.vy;
      b.x += b.vx;
      b.a += b.spin;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2);
      ctx.restore();
    }
    frames++;
    if (frames < 260) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
