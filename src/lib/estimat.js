// Estimat-motoren. Et separat modul med et fast interface, så datakilden kan skiftes ud senere.
//
// Input:  { adresseId, postnr, kommunekode, bbr: { boligtype, areal, vaerelser, byggeaar }, stand: { indvendig, udvendig }, tilvalg: [] }
// Output: { lav, middel, hoej, praecision, praecisionTekst, noegletal, kilde, dato, testdata } eller null
//
// Version 1: kvadratmeterpris for postnummer og boligtype (fra data/m2-priser.json) gange areal,
// justeret med faktorer for stand og tilvalg (fra config/estimat.json). Intervallets bredde afhænger af præcisionen.
// Ingen scraping af portaler.
import { harTal, rundTil } from './faelles.js';

export const PRAECISION_TEKST = {
  hoej: 'Der er mange handler med boliger som din i området, så intervallet er forholdsvis smalt.',
  middel: 'Der er en del handler i området, men boliger som din varierer, så intervallet er bredere.',
  lav: 'Der er få handler med boliger som din i området, så intervallet er bredt og mere usikkert.',
};

/** Laver opslagstabeller ud fra datafilen. Kald én gang. */
export function indeksM2(data) {
  const postnr = new Map();
  const kommune = new Map();
  for (const r of data?.postnumre || []) postnr.set(`${r.postnr}:${r.boligtype}`, r);
  for (const r of data?.kommuner || []) kommune.set(`${r.kommunekode}:${r.boligtype}`, r);
  return { postnr, kommune, kilde: data?.kilde || '', dato: data?.dato || '', testdata: Boolean(data?.testdata) };
}

// Finans Danmark slår parcel- og rækkehuse sammen. Mangler der egne tal for rækkehuse, bruges tallene for hus.
const ALIAS = { raekkehus: 'hus' };

/** Finans Danmark samler postnumrene i København K, København V og Frederiksberg C i intervaller. */
export function statistikPostnr(postnr) {
  const n = Number(postnr);
  if (n >= 1000 && n < 1500) return '1000';
  if (n >= 1500 && n < 1800) return '1500';
  if (n >= 1800 && n < 2000) return '1800';
  return String(postnr ?? '');
}

function slaaOp(tabel, noegle, type) {
  const r = tabel.get(`${noegle}:${type}`);
  if (harTal(r?.m2pris) || !ALIAS[type]) return r;
  return tabel.get(`${noegle}:${ALIAS[type]}`) || r;
}

function faktor(config, stand = {}, tilvalg = []) {
  const f = config?.faktorer || {};
  let x = 1;
  const v = (n) => (harTal(n) ? n : 1);
  if (stand.indvendig) x *= v(f.indvendig?.[stand.indvendig]);
  if (stand.udvendig) x *= v(f.udvendig?.[stand.udvendig]);
  for (const t of tilvalg || []) x *= v(f.tilvalg?.[t]);
  return x;
}

export function beregnEstimat(input, indeks, config) {
  const { postnr, kommunekode, bbr = {}, stand, tilvalg } = input || {};
  const { boligtype } = bbr;
  const areal = Number(bbr.areal);
  if (!indeks || !boligtype || boligtype === 'andel') return null;
  if (!Number.isFinite(areal) || areal < 10 || areal > 2000) return null;

  const pn = slaaOp(indeks.postnr, statistikPostnr(postnr), boligtype);
  const km = kommunekode ? slaaOp(indeks.kommune, String(kommunekode).padStart(4, '0'), boligtype) : null;
  const kilde = harTal(pn?.m2pris) ? pn : harTal(km?.m2pris) ? km : null;
  if (!kilde) return null;

  const p = config?.praecision || {};
  let praecision = 'lav';
  if (kilde === pn && harTal(pn.antal_handler_12m)) {
    if (pn.antal_handler_12m >= (p.hoej_min_handler ?? Infinity)) praecision = 'hoej';
    else if (pn.antal_handler_12m >= (p.middel_min_handler ?? Infinity)) praecision = 'middel';
  }
  const spaend = p.spaend?.[praecision] ?? 0.15;
  const afrund = config?.afrund || 25000;
  const middelRaa = kilde.m2pris * areal * faktor(config, stand, tilvalg);

  return {
    lav: rundTil(middelRaa * (1 - spaend), afrund),
    middel: rundTil(middelRaa, afrund),
    hoej: rundTil(middelRaa * (1 + spaend), afrund),
    praecision,
    praecisionTekst: kilde === pn ? PRAECISION_TEKST[praecision] : 'Vi har kun tal for hele kommunen, så intervallet er bredt og mere usikkert.',
    grundlag: kilde === pn ? 'postnummer' : 'kommune',
    noegletal: {
      m2_postnr: harTal(pn?.m2pris) ? pn.m2pris : null,
      m2_kommune: harTal(km?.m2pris) ? km.m2pris : null,
      liggetid_dage: harTal(kilde.liggetid_dage) ? kilde.liggetid_dage : null,
      udvikling_1aar_pct: harTal(kilde.udvikling_1aar_pct) ? kilde.udvikling_1aar_pct : null,
      antal_handler_12m: harTal(kilde.antal_handler_12m) ? kilde.antal_handler_12m : null,
    },
    kilde: indeks.kilde,
    dato: indeks.dato,
    testdata: indeks.testdata,
    version: config?.version || null,
  };
}

/** Groft skøn over provenu: middel minus restgæld minus salær. Salær er et interval, så resultatet er det også. */
export function beregnProvenu({ middel, restgaeld, salaer }) {
  const g = harTal(restgaeld) ? restgaeld : 0;
  if (!harTal(middel)) return null;
  if (harTal(salaer?.min) && harTal(salaer?.max)) {
    return { fra: middel - g - salaer.max, til: middel - g - salaer.min, medSalaer: true };
  }
  return { fra: middel - g, til: middel - g, medSalaer: false };
}
