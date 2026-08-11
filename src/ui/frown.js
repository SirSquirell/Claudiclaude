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
  'generational buying opportunity',
  'unrealised optimism',
  'the market owes you one',
  'aggressively undervalued',
  'playing the long game',
  'a rounding error, eventually',
  'paying it forward',
  'character building',
  'tuition',
  'a strategic retreat',
  'already priced in',
  'accumulating',
  'shaking out the weak hands',
  'exactly as planned',
  'the calm before the moon',
];

/** Stable per label, so a re-render does not reshuffle them mid-read. */
const euphemismFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return EUPHEMISMS[h % EUPHEMISMS.length];
};

/**
 * The ticker this whole feature is for.
 *
 * Optimism Mode is an inside joke aimed at one person, and it only appears for
 * people holding the thing the joke is about. Everyone else never sees the
 * button, which is not a limitation — it is the best property this feature has:
 *
 *  - a tester who would not get it cannot be confused by it,
 *  - it cannot be found by accident, which was the objection to making it a
 *    hidden easter egg in the first place,
 *  - and the audience for a screenshot of it is exactly the audience who
 *    already knows it is a bit.
 *
 * A list rather than a constant, because the next friend will hold something
 * else and this should be a one-line change rather than a refactor.
 */
const QUALIFYING = ['PROP'];

/**
 * Is the joke's subject held inside the window currently on screen?
 *
 * The *sliced* range, deliberately: filter the position out and the button goes
 * with it. A joke about a holding you are not looking at is just clutter.
 */
export function qualifies(r, from = 0, to = (r?.days?.length ?? 1) - 1) {
  const held = r?.byProduct ?? [];
  return held.some((p) => {
    const tag = String(p.symbol || p.name || '').toUpperCase();
    if (!QUALIFYING.some((q) => tag.includes(q))) return false;
    // Held at any point inside the window, not merely ever owned.
    const qty = p.qty ?? [];
    for (let i = Math.max(0, from); i <= Math.min(to, qty.length - 1); i++) {
      if (Math.abs(qty[i]) > 1e-9) return true;
    }
    return false;
  });
}

/** The name to build the jokes around, once `qualifies` has said yes. */
export function subjectOf(r) {
  const held = r?.byProduct ?? [];
  const hit = held.find((p) => QUALIFYING.some((q) => String(p.symbol || p.name || '').toUpperCase().includes(q)));
  return hit?.symbol || hit?.name || QUALIFYING[0];
}

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
 * Reflect a series about its own midpoint, so a falling line climbs.
 *
 * Not `scaleY(-1)` on the canvas: the axis labels are drawn *inside* it, so
 * they mirror into unreadable glyphs and the picture becomes noise. A joke has
 * to be legible to land.
 *
 * And not `-y` either, which would drop the line into negative territory and
 * read as a bug rather than a bit. Reflecting about the midpoint keeps the line
 * inside the same range the axis is already labelled for: real gridlines, real
 * euros, and a shape that is exactly upside down.
 */
export function flipSeries(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return values;

  /**
   * Only ever in the flattering direction.
   *
   * The first version reflected unconditionally, so a *winning* account came
   * out falling — the switch made the picture worse, which is the one thing
   * this feature must never do. A line that already ends above where it started
   * is left exactly as it is: there is nothing to cheer up.
   */
  if (nums.at(-1) >= nums[0]) return values;

  const mid = Math.min(...nums) + Math.max(...nums);
  return values.map((v) => (Number.isFinite(v) ? mid - v : v));
}

/**
 * The tiles, replaced outright rather than flipped.
 *
 * A flipped "Deepest fall" is a joke about a tile. A tile reading **847 DAYS OF
 * UNWAVERING BELIEF** is a joke about the person holding the position, which is
 * funnier and takes the same data to build.
 *
 * Everything here is computed from the real result. Nothing is invented — the
 * numbers are the reader's own and only the framing is ridiculous, which is
 * both funnier than fabrication and the reason this stays honest.
 *
 * Naming the instrument is the punchline: *"Still believing in PROP"* lands and
 * *"still believing in your worst position"* does not. It is safe for the same
 * reason the rest of this is: it renders on their own screen and nothing
 * downstream can read it.
 *
 * @param {object} r  a computePortfolio result, already combined
 * @param {(n:number)=>string} money  the page's own currency formatter
 */
export function optimismTiles(r, money, subject = null) {
  const held = (r.byProduct ?? []).filter((p) => Math.abs(p.current) > 0.005);
  const worst = [...(r.byProduct ?? [])].sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))[0];
  const loss = Math.min(0, worst?.pnl ?? 0);
  const total = r.totals?.totalPnl ?? 0;
  const days = r.days?.length ?? 0;

  // How long the worst position has been held: the first day it had a quantity.
  let believedSince = 0;
  if (worst?.qty) {
    const first = worst.qty.findIndex((q) => Math.abs(q) > 1e-9);
    if (first >= 0) believedSince = days - first;
  }

  // Distance back to break-even on the whole account, as a share.
  const paid = r.cumulativeDeposited?.at(-1) ?? 0;
  const value = r.value?.at(-1) ?? 0;
  const moon = paid > 0 ? Math.max(0, Math.min(100, (value / paid) * 100)) : 100;

  const winning = total >= 0;

  /**
   * A winning account gets a different set. A joke about losses on a portfolio
   * that is up is not a joke, it is a wrong page.
   */
  if (winning) {
    return [
      { label: 'Certified genius', value: money(total), note: 'no notes 🧠' },
      { label: 'Modesty', value: '0%', note: 'and rightly so 😎' },
      { label: 'Conviction', value: `${believedSince} days`, note: `${subject ? `never doubted ${subject}` : 'never once doubted'} 🪨` },
      { label: 'Moon progress', value: `${Math.round(moon)}%`, note: 'and climbing 🚀' },
      { label: 'Positions held', value: String(held.length), note: 'all of them excellent ✨' },
      { label: 'Regrets', value: 'none', note: 'this is not financial advice 🙃' },
      { label: 'Analyst consensus', value: 'STRONG BUY', note: 'the analyst is you 📈' },
      { label: 'Beating the market', value: 'OBVIOUSLY', note: 'every market 🌍' },
      { label: 'Lambo ETA', value: 'imminent', note: 'start reading reviews 🏎️' },
      { label: 'Portfolio rating', value: 'S TIER', note: 'S is for spectacular 🏆' },
    ];
  }

  // The joke's subject if it is here, otherwise the worst holding. `qualifies`
  // has already said one of them is on screen.
  const name = subject || worst?.symbol || worst?.name || 'it';
  const years = Math.max(1, believedSince / 365);

  /**
   * The notes are written *about* the holding rather than around it.
   *
   * "1325 days of unwavering belief" is a joke about a tile. "1325 days of
   * unwavering belief in PROP" is a joke about a person, and the name is the
   * only reason it lands. `qualifies` has already established the reader is
   * that person.
   */
  return [
    { label: 'Discount secured', value: money(Math.abs(total)), note: `${name} at a historic markdown 🏷️` },
    { label: 'Conviction', value: `${believedSince} days`, note: `of unwavering belief in ${name} 🪨` },
    { label: 'Moon progress', value: `${Math.round(moon)}%`, note: 'of the way back to where you started 🚀' },
    {
      label: 'Diamond hands',
      // Ten out of ten for anyone who has held a loser for two years.
      value: `${Math.min(10, Math.max(1, Math.round(believedSince / 73)))}/10 💎`,
      note: `${believedSince > 700 ? 'legendary' : 'promising'} grip strength`,
    },
    { label: 'Tuition', value: money(Math.abs(loss)), note: `a masterclass from ${name} 🎓` },
    { label: 'Still believing in', value: name, note: 'it is just resting 😴' },
    { label: 'Analyst consensus', value: 'STRONG BUY', note: `on ${name}, from the analyst that is you 📈` },
    {
      label: 'Lambo ETA',
      // Absurd on purpose and derived from something real, which is funnier
      // than a random number: how long back to break-even at the rate so far.
      value: `${Math.max(1, Math.round(years * (100 / Math.max(1, moon)) * 4))} years`,
      note: `once ${name} does its thing 🏎️`,
    },
    { label: 'Beating the market', value: 'YES', note: 'which market, though 🌍' },
    { label: 'Panic level', value: '0%', note: `${name} has never let you down 🧘` },
    { label: 'Exit strategy', value: 'NEVER', note: `${name} to the moon 🌕` },
    { label: 'Portfolio rating', value: 'S TIER', note: `S is for ${name} 🏆` },
  ];
}

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
  const bits = Array.from({ length: 320 }, (_, i) => ({
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
    if (frames < 420) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
