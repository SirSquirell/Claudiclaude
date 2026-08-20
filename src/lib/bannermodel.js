/**
 * US-91 — de strip op de brokerpagina, de pure helft.
 *
 * Het content script is UI op andermans pagina, dus alles wat te beslissen
 * valt — wat de strip zegt, in welke toon, en of "Sync nu" iets toevoegt —
 * wordt hier beslist, zonder DOM en zonder chrome.*, zodat de test het kan
 * vastpinnen. Het script zelf tekent alleen wat dit teruggeeft.
 *
 * De sync-knop is er niet altijd, met opzet: de extensie synct al vanzelf
 * (het uur-alarm, plus de opportunistische run zodra een DEGIRO-tab laadt),
 * dus "druk op sync" tonen terwijl dat al gebeurd is, is theater. De knop
 * verschijnt alleen wanneer hij een echte handeling is: de laatste poging is
 * mislukt, of de data is ouder dan `STALE_AFTER_DAYS`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ouder dan dit is "verouderd" en verdient de knop. Het alarm loopt per uur,
 *  dus drie dagen achterstand betekent: de browser is dagen dicht geweest of
 *  de sessie is stilletjes weg — precies de gevallen waarin een mens moet
 *  handelen. */
export const STALE_AFTER_DAYS = 3;

/** nl wanneer de browser Nederlands spreekt, anders en — de taalvoorkeur van
 *  de app-pagina leeft in diens eigen localStorage en is hier onbereikbaar. */
export function pickLang(navLang) {
  return /^nl(-|$)/i.test(String(navLang ?? '')) ? 'nl' : 'en';
}

const TEXT = {
  nl: {
    name: 'Asteria',
    syncing: 'Bezig met syncen…',
    error: 'Sync mislukt — log in en probeer opnieuw.',
    first: 'Aan het werk — je eerste analyse komt eraan.',
    stale: (d) => `Laatste sync: ${d} dagen geleden.`,
    fresh: 'Je portefeuillegeschiedenis is bij.',
    open: 'Open je analyse',
    sync: 'Sync nu',
    busy: 'Bezig…',
    close: 'Sluiten tot de volgende browserstart',
    foot: 'Leest alleen je eigen sessie mee; niets verlaat je browser.',
  },
  en: {
    name: 'Asteria',
    syncing: 'Syncing…',
    error: 'Sync failed — log in and try again.',
    first: 'At work — your first analysis is on its way.',
    stale: (d) => `Last sync: ${d} days ago.`,
    fresh: 'Your portfolio history is up to date.',
    open: 'Open your analysis',
    sync: 'Sync now',
    busy: 'Working…',
    close: 'Hide until the next browser start',
    foot: 'Reads only your own session; nothing leaves your browser.',
  },
};

export function bannerText(lang) {
  return TEXT[lang] ?? TEXT.en;
}

/**
 * Van het status-bericht naar wat de strip toont.
 *
 * `lastError` is hier het hele verhaal over mislukken: een geslaagde sync zet
 * hem op `null` (sync.js), dus niet-null betekent "de laatste poging is
 * mislukt" zonder tijdstippen te hoeven vergelijken. `disconnected` wint van
 * alles: wie zijn account bevroor (US-79), vroeg om niet gevolgd te worden —
 * dan ook geen strip.
 */
export function bannerModel({ lastSyncAt = 0, lastError = null, syncing = false, disconnected = false, now, lang = 'en' }) {
  if (disconnected) return { show: false };
  const t = bannerText(lang);
  if (syncing) return { show: true, tone: 'ok', line: t.syncing, showSync: false };
  if (lastError != null) return { show: true, tone: 'err', line: t.error, showSync: true };
  if (!lastSyncAt) return { show: true, tone: 'ok', line: t.first, showSync: false };
  const days = Math.floor((now - lastSyncAt) / DAY_MS);
  if (days >= STALE_AFTER_DAYS) return { show: true, tone: 'warn', line: t.stale(days), showSync: true };
  return { show: true, tone: 'ok', line: t.fresh, showSync: false };
}
