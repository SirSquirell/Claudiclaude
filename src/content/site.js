// src/content/site.js
//
// Draait op https://asteria.prulwerk.nl/* bij document_start.
// Doet twee dingen en niets meer:
//   1. laat de pagina weten dat deze extensie bestaat, en welke versie
//   2. relayt één verzoek van de pagina naar de service worker: open de demo
//
// Geen rekeninggegevens, geen synchronisatiestatus, geen aantallen in de marker.
// Alleen het versienummer, zodat de footer de echte versie kan tonen.

(() => {
  const VERSION = chrome.runtime.getManifest().version;

  // 1. Marker. documentElement bestaat op document_start al, body nog niet.
  document.documentElement.dataset.asteria = VERSION;

  // Voor het geval het paginascript al gedraaid heeft voordat wij er waren.
  window.dispatchEvent(
    new CustomEvent('asteria:ready', { detail: { version: VERSION } })
  );

  // 2. Eén verzoek, van deze pagina, zonder payload. Er is niets door te geven.
  window.addEventListener('asteria:open-demo', () => {
    chrome.runtime.sendMessage({ type: 'open-demo', from: 'site' }, (res) => {
      // chrome.runtime.lastError treedt op als de service worker niet reageert.
      // De pagina heeft zijn eigen timeout, dus stilte is hier een geldig antwoord:
      // dan valt de knop daar terug op de handleiding.
      if (chrome.runtime.lastError || !res || !res.ok) return;
      window.dispatchEvent(new CustomEvent('asteria:demo-open'));
    });
  });
})();
