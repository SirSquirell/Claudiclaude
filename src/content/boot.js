/**
 * US-91 — de opstap. MV3 content scripts kunnen zelf geen module zijn, dus
 * dit klassieke script doet één ding: de echte module dynamisch importeren,
 * die dat wél is en `bannermodel.js` kan meenemen. Faalt de import (pagina
 * sluit, extensie net geüpdatet), dan blijft het stil — dit is andermans
 * pagina, en een foutmelding van ons hoort daar niet.
 */
(() => {
  import(chrome.runtime.getURL('src/content/banner.js')).catch(() => {});
})();
