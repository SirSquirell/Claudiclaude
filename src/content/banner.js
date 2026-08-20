/**
 * US-91 + US-92 — Asteria op trader.degiro.nl: de strip én de toast.
 *
 * Twee oppervlakken, één brein. De strip (US-91, de keuze van de eigenaar) is
 * de blijvende aanwezigheid: permanent bovenaan, en hij dúwt de pagina omlaag
 * (marge op `<html>`) in plaats van iets te bedekken — een orderknop
 * verstoppen is de enige echte schade die dit feature kan doen. De toast
 * (US-92, "vind beide goed") is de binnenkomst-nudge: schuift rechtsonder
 * binnen bij het laden en ruimt zichzelf na een paar seconden op, want twee
 * permanente meldingen naast elkaar is dubbelop. Raak je hem aan, dan blijft
 * hij staan tot jij beslist.
 *
 * Beide tonen exact dezelfde regel uit `bannermodel.js` — daar is alles al
 * beslist en getest; hier wordt alleen getekend. Dit script leest niets van
 * de pagina en raakt er niets van aan behalve die ene marge. Elk oppervlak
 * heeft zijn eigen kruisje met dezelfde semantiek: weg tot de volgende
 * browserstart (`chrome.storage.session` — per browsersessie, zonder eigen
 * klokwerk), en onafhankelijk van elkaar.
 */

import { bannerModel, bannerText, pickLang } from '../lib/bannermodel.js';

const HEIGHT = 34; // px — de duw en de strip zijn per definitie even hoog
const TOAST_AUTO_HIDE_MS = 12000;

async function main() {
  if (window !== window.top) return; // nooit in een iframe van de broker

  const flags = await chrome.storage.session
    .get(['bannerDismissed', 'toastDismissed'])
    .catch(() => ({}));
  const wantStrip = !flags?.bannerDismissed;
  const wantToast = !flags?.toastDismissed;
  if (!wantStrip && !wantToast) return;

  const res = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
  if (!res?.ok) return; // worker onbereikbaar: stil blijven op andermans pagina

  const lang = pickLang(navigator.language);
  const model = bannerModel({ ...statusFields(res.data), now: Date.now(), lang });
  if (!model.show) return; // losgekoppeld (US-79): geen van beide

  mount(model, bannerText(lang), lang, { strip: wantStrip, toast: wantToast });
}

const statusFields = (s) => ({
  lastSyncAt: s?.lastSyncAt ?? 0,
  lastError: s?.lastError ?? null,
  syncing: s?.syncing === true,
  disconnected: s?.disconnected === true,
});

function mount(model, t, lang, want) {
  const host = document.createElement('div');
  host.id = 'asteria-strip';
  // Aan <html>, niet <body>: de SPA vervangt zijn eigen wortel, niet de onze.
  document.documentElement.appendChild(host);
  // 'open', bewust: de isolatie komt van de shadow-grens zelf (stijlen lekken
  // geen van beide kanten door), en open laat de headless verificatie — en een
  // nieuwsgierige eigenaar in devtools — naar binnen kijken. 'closed' zou hier
  // alleen de eigen test buitensluiten.
  const root = host.attachShadow({ mode: 'open' });

  const mark = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.6 6.9L22 12l-7.4 3.1L12 22l-2.6-6.9L2 12l7.4-3.1z" fill="#b8532f"/></svg>';
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .surface {
        background: #1d2129; color: #e8edf3; box-sizing: border-box;
        font: 12.5px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .mark { flex: none; }
      b { font-size: 12.5px; letter-spacing: 0.01em; }
      .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
      .dot.ok { background: #3f9d63; } .dot.warn { background: #c98a2b; } .dot.err { background: #c04545; }
      .line { color: #9aa4b1; overflow: hidden; text-overflow: ellipsis; }
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

      .strip {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
        height: ${HEIGHT}px; display: flex; align-items: center; gap: 10px; padding: 0 12px;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
      }
      .strip .line { white-space: nowrap; }
      .sp { flex: 1; }

      .toast {
        position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
        width: 300px; border-radius: 12px; padding: 13px 15px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        animation: asteria-slide-in 260ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      @keyframes asteria-slide-in { from { transform: translateY(12px); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
      .toast .row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
      .toast .row1 .close { margin-left: auto; }
      .toast .status { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; }
      .toast .acts { display: flex; gap: 8px; }
      .toast .foot { color: #9aa4b1; font-size: 10.5px; margin-top: 9px; }
    </style>
    ${want.strip ? `
    <div class="surface strip" role="region" aria-label="Asteria">
      ${mark.replace('class="mark"', 'class="mark" width="15" height="15"')}
      <b>${t.name}</b>
      <span class="dot"></span>
      <span class="line"></span>
      <span class="sp"></span>
      <button type="button" class="open"></button>
      <button type="button" class="sync" hidden></button>
      <button type="button" class="close" aria-label="${t.close}" title="${t.close}">✕</button>
    </div>` : ''}
    ${want.toast ? `
    <div class="surface toast" role="region" aria-label="Asteria">
      <div class="row1">
        ${mark.replace('class="mark"', 'class="mark" width="18" height="18"')}
        <b>${t.name}</b>
        <button type="button" class="close" aria-label="${t.close}" title="${t.close}">✕</button>
      </div>
      <div class="status"><span class="dot"></span><span class="line"></span></div>
      <div class="acts">
        <button type="button" class="open"></button>
        <button type="button" class="sync" hidden></button>
      </div>
      <div class="foot">${t.foot}</div>
    </div>` : ''}`;

  // De duw hoort bij de strip, niet bij de host: alleen wanneer er werkelijk
  // een strip staat schuift de pagina omlaag.
  const previousMargin = document.documentElement.style.marginTop;
  if (want.strip) document.documentElement.style.marginTop = `${HEIGHT}px`;

  const apply = (m) => {
    for (const dot of root.querySelectorAll('.dot')) dot.className = `dot ${m.tone}`;
    for (const line of root.querySelectorAll('.line')) line.textContent = m.line;
    for (const btn of root.querySelectorAll('.sync')) {
      btn.hidden = !m.showSync;
      btn.disabled = false;
      btn.textContent = t.sync;
    }
    for (const btn of root.querySelectorAll('.open')) btn.textContent = t.open;
  };
  apply(model);

  for (const btn of root.querySelectorAll('.open')) {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openApp' }).catch(() => {});
    });
  }

  for (const btn of root.querySelectorAll('.sync')) {
    btn.addEventListener('click', async () => {
      // Dezelfde boodschap als de sync-knop in de popup, met de uitkomst in
      // de regel — geen verzonnen getal, alleen wat de worker terugmeldt.
      for (const b of root.querySelectorAll('.sync')) b.disabled = true;
      for (const line of root.querySelectorAll('.line')) line.textContent = t.syncing;
      for (const dot of root.querySelectorAll('.dot')) dot.className = 'dot ok';
      await chrome.runtime.sendMessage({ type: 'sync', force: true }).catch(() => null);
      const after = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
      if (!after?.ok) return; // worker weg: de regel blijft op "bezig", de tab is toch stervende
      apply(bannerModel({ ...statusFields(after.data), now: Date.now(), lang }));
    });
  }

  const strip = root.querySelector('.strip');
  const toast = root.querySelector('.toast');
  const gone = () => {
    if (!root.querySelector('.strip') && !root.querySelector('.toast')) host.remove();
  };

  if (strip) {
    strip.querySelector('.close').addEventListener('click', () => {
      strip.remove();
      document.documentElement.style.marginTop = previousMargin;
      chrome.storage.session.set({ bannerDismissed: true }).catch(() => {});
      gone();
    });
  }

  if (toast) {
    // De toast ruimt zichzelf op — dat is wat hem naast een permanente strip
    // verdraagbaar maakt. Zonder vlag: bij de volgende paginalading is hij er
    // gewoon weer. Aanraken annuleert de timer; het kruisje is de echte keuze.
    let autoHide = setTimeout(() => { toast.remove(); gone(); }, TOAST_AUTO_HIDE_MS);
    const keep = () => { clearTimeout(autoHide); autoHide = null; };
    toast.addEventListener('pointerenter', keep);
    toast.addEventListener('pointerdown', keep);
    toast.querySelector('.close').addEventListener('click', () => {
      keep();
      toast.remove();
      chrome.storage.session.set({ toastDismissed: true }).catch(() => {});
      gone();
    });
  }
}

main();
