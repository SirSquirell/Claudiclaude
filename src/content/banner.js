/**
 * US-91 — de strip bovenaan trader.degiro.nl. De keuze van de eigenaar:
 * permanent, de volle breedte, en de pagina wordt omlaag gedúwd (marge op
 * `<html>`) in plaats van bedekt — een orderknop verstoppen is de enige echte
 * schade die dit feature kan doen.
 *
 * Dit script leest niets van de pagina en raakt er niets van aan behalve die
 * ene marge. Alles wat het toont komt uit het `status`-bericht aan de eigen
 * service worker; alles wat te beslissen valt is al beslist in
 * `bannermodel.js`, waar de test bij kan. Wegklikken leeft in
 * `chrome.storage.session`: per browsersessie, weg bij de volgende start —
 * precies de gekozen semantiek, zonder eigen klokwerk.
 */

import { bannerModel, bannerText, pickLang } from '../lib/bannermodel.js';

const HEIGHT = 34; // px — de duw en de strip zijn per definitie even hoog

async function main() {
  if (window !== window.top) return; // nooit in een iframe van de broker

  const dismissed = await chrome.storage.session.get('bannerDismissed').catch(() => ({}));
  if (dismissed?.bannerDismissed) return;

  const res = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
  if (!res?.ok) return; // worker onbereikbaar: stil blijven op andermans pagina

  const lang = pickLang(navigator.language);
  const t = bannerText(lang);
  const model = bannerModel({ ...statusFields(res.data), now: Date.now(), lang });
  if (!model.show) return; // losgekoppeld (US-79): geen strip

  mount(model, t, lang);
}

const statusFields = (s) => ({
  lastSyncAt: s?.lastSyncAt ?? 0,
  lastError: s?.lastError ?? null,
  syncing: s?.syncing === true,
  disconnected: s?.disconnected === true,
});

function mount(model, t, lang) {
  const host = document.createElement('div');
  host.id = 'asteria-strip';
  // Aan <html>, niet <body>: de SPA vervangt zijn eigen wortel, niet de onze.
  document.documentElement.appendChild(host);
  // 'open', bewust: de isolatie komt van de shadow-grens zelf (stijlen lekken
  // geen van beide kanten door), en open laat de headless verificatie — en een
  // nieuwsgierige eigenaar in devtools — naar binnen kijken. 'closed' zou hier
  // alleen de eigen test buitensluiten.
  const root = host.attachShadow({ mode: 'open' });

  // De duw. Alleen deze ene stijl op de pagina zelf, en hij gaat netjes terug.
  const previousMargin = document.documentElement.style.marginTop;
  document.documentElement.style.marginTop = `${HEIGHT}px`;

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .strip {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
        height: ${HEIGHT}px; box-sizing: border-box;
        background: #1d2129; color: #e8edf3;
        display: flex; align-items: center; gap: 10px; padding: 0 12px;
        font: 12.5px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
      }
      .mark { width: 15px; height: 15px; flex: none; }
      b { font-size: 12.5px; letter-spacing: 0.01em; }
      .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
      .dot.ok { background: #3f9d63; } .dot.warn { background: #c98a2b; } .dot.err { background: #c04545; }
      .line { color: #9aa4b1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sp { flex: 1; }
      button { font: inherit; cursor: pointer; flex: none; }
      .open {
        background: #b8532f; color: #fff; border: 0; border-radius: 6px;
        padding: 5px 11px; font-size: 12px; font-weight: 600;
      }
      .sync {
        background: none; color: #e8edf3; border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px; padding: 5px 11px; font-size: 12px;
      }
      .sync[disabled] { opacity: 0.55; cursor: default; }
      .close {
        background: none; border: 0; color: #9aa4b1; font-size: 14px; line-height: 1;
        padding: 4px 6px; border-radius: 5px;
      }
      .close:hover { color: #e8edf3; background: rgba(255, 255, 255, 0.08); }
      [hidden] { display: none; }
    </style>
    <div class="strip" role="region" aria-label="Asteria">
      <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.6 6.9L22 12l-7.4 3.1L12 22l-2.6-6.9L2 12l7.4-3.1z" fill="#b8532f"/></svg>
      <b>${t.name}</b>
      <span class="dot"></span>
      <span class="line"></span>
      <span class="sp"></span>
      <button type="button" class="open"></button>
      <button type="button" class="sync" hidden></button>
      <button type="button" class="close" aria-label="${t.close}" title="${t.close}">✕</button>
    </div>`;

  const dot = root.querySelector('.dot');
  const line = root.querySelector('.line');
  const openBtn = root.querySelector('.open');
  const syncBtn = root.querySelector('.sync');
  openBtn.textContent = t.open;

  const apply = (m) => {
    dot.className = `dot ${m.tone}`;
    line.textContent = m.line;
    syncBtn.hidden = !m.showSync;
    syncBtn.disabled = false;
    syncBtn.textContent = t.sync;
  };
  apply(model);

  openBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openApp' }).catch(() => {});
  });

  syncBtn.addEventListener('click', async () => {
    // Dezelfde boodschap als de sync-knop in de popup, met de uitkomst in de
    // regel — geen verzonnen getal, alleen wat de worker terugmeldt.
    syncBtn.disabled = true;
    line.textContent = t.syncing;
    dot.className = 'dot ok';
    await chrome.runtime.sendMessage({ type: 'sync', force: true }).catch(() => null);
    const after = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
    if (!after?.ok) return; // worker weg: de regel blijft op "bezig", de tab is toch stervende
    apply(bannerModel({ ...statusFields(after.data), now: Date.now(), lang }));
  });

  root.querySelector('.close').addEventListener('click', () => {
    host.remove();
    document.documentElement.style.marginTop = previousMargin;
    chrome.storage.session.set({ bannerDismissed: true }).catch(() => {});
  });
}

main();
