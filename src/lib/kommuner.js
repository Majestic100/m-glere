// Kommunesider. En side bygges kun, når den har rigtige tal. Ingen tynde sider, hvor kun bynavnet er skiftet ud.
import { harTal, erTodo } from './faelles.js';

/** Sandt i demoen, hvor kommunesider og guides bygges uden rigtige tal (altid med noindex). */
export const KLADDER = typeof process !== 'undefined' && process.env.KOMMUNE_KLADDER === '1';

/** @param {any} k */
export function harRigtigeTal(k) {
  return (
    (harTal(k.m2pris_hus) || harTal(k.m2pris_lejlighed)) &&
    harTal(k.udvikling_1aar_pct) &&
    harTal(k.udvikling_5aar_pct) &&
    harTal(k.udvikling_10aar_pct) &&
    harTal(k.liggetid_dage) &&
    !erTodo(k.dato)
  );
}

/**
 * Kommuner der bygges. Med kladder=true bygges alle (kun demoen), og sider uden tal får noindex.
 * @template T
 * @param {T[]} liste
 * @param {boolean} [kladder]
 * @returns {T[]}
 */
export function kommunerTilBygning(liste, kladder = false) {
  return (liste || []).filter((k) => kladder || harRigtigeTal(k));
}

/** @param {unknown} n */
export function procent(n) {
  if (!harTal(n)) return null;
  return `${Number(n) > 0 ? '+' : ''}${String(n).replace('.', ',')} %`;
}
