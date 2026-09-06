/**
 * US-151 — the table model, the half that needs a DOM.
 *
 * Every `.table-scroll` on the page gets the same three things, once:
 *
 *  1. It becomes a landmark a keyboard can reach: `role="region"`, `tabindex=0`
 *     and an `aria-labelledby` pointing at its card's title. An overflow box
 *     with no tabindex cannot be scrolled from the keyboard at all, and one
 *     with no name is announced as nothing (Roselli, *Under-Engineered
 *     Responsive Tables*).
 *  2. It is wrapped in `.scroll-hold`, which paints an edge shadow on the side
 *     that has more table behind it — and only then. `data-x` on the wrapper is
 *     the state: `start`, `middle`, `end`, or `none` when nothing overflows.
 *  3. `--frozen` on the wrapper is the width of the anchor column, so the left
 *     shadow starts where the frozen cells end rather than under them.
 *
 * The sticky header and anchor column themselves are CSS (styles.css, "the
 * table model"); this file only measures. It is idempotent per element, so
 * `render()` can call it after every pass and a table rebuilt in place keeps
 * its wrapper.
 */

let seq = 0;
let observer = null;

function measure(box) {
  const hold = box.parentElement;
  if (!hold || !hold.classList.contains('scroll-hold')) return;
  const max = box.scrollWidth - box.clientWidth;
  hold.dataset.x = max <= 1 ? 'none' : box.scrollLeft <= 1 ? 'start' : box.scrollLeft >= max - 1 ? 'end' : 'middle';
  const first = box.querySelector('thead th:first-child, tbody td:first-child');
  hold.style.setProperty('--frozen', `${first ? first.offsetWidth : 0}px`);
}

export function enhanceTables(root = document) {
  if (!observer && typeof ResizeObserver === 'function') {
    observer = new ResizeObserver((entries) => {
      for (const e of entries) measure(e.target);
    });
  }
  for (const box of root.querySelectorAll('.table-scroll')) {
    if (box.dataset.tableModel) {
      measure(box);
      continue;
    }
    box.dataset.tableModel = '1';
    box.setAttribute('role', 'region');
    box.tabIndex = 0;
    const title = box.closest('.card')?.querySelector('h2');
    if (title) {
      if (!title.id) title.id = `table-title-${++seq}`;
      box.setAttribute('aria-labelledby', title.id);
    }
    const hold = document.createElement('div');
    hold.className = 'scroll-hold';
    box.replaceWith(hold);
    hold.append(box);
    box.addEventListener('scroll', () => measure(box), { passive: true });
    observer?.observe(box);
    measure(box);
  }
}
