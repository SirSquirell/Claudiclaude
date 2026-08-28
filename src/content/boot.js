/**
 * US-91 — de opstap. MV3 content scripts kunnen zelf geen module zijn, dus
 * dit klassieke script doet één ding: de echte modules dynamisch importeren,
 * die dat wél zijn en de bijbehorende `src/lib/*.js` kunnen meenemen. Faalt
 * een import (pagina sluit, extensie net geüpdatet), dan blijft het stil —
 * dit is andermans pagina, en een foutmelding van ons hoort daar niet.
 *
 * `readywatch.js` (US-113) staat los van `banner.js`: de sync-trigger moet
 * lopen ongeacht of de strip of de toast getoond of weggeklikt is.
 */
(() => {
  import(chrome.runtime.getURL('src/content/banner.js')).catch(() => {});
  import(chrome.runtime.getURL('src/content/readywatch.js')).catch(() => {});
})();
