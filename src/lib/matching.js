// Matching-motoren. Finder ÉN partnermægler til boligejeren. Leadet sendes aldrig til mere end én.
//
// Input:  { postnr, boligtype, estimat (middel i kr.), horisont }
// Output: { maegler, score, faktorer, begrundelser, version, kandidater } eller null (ingen dækning)
//
// Trin 1, filter: dækker postnummeret, handler med boligtypen, har ledig kapacitet, er aktiv.
// Trin 2, score: vægtene står i config/matching.json, så de kan justeres uden kodeændring.
// Trin 3, fallback: null. Den slags henvendelser må ikke sendes til nogen mægler.
//
// Kun rigtige tal fra datafilen bruges som begrundelse. Mangler et tal, tæller faktoren som neutral.
import { harTal, flertalFor } from './faelles.js';

const klem = (x) => Math.max(0, Math.min(1, x));

/** Deterministisk tal mellem 0 og 1 ud fra en tekst (FNV-1a). Bruges til rotation, så serveren kan genskabe resultatet. */
export function seedTal(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export function filtrer(maeglere, { postnr, boligtype }, kapacitet = {}) {
  return (maeglere || []).filter((m) => {
    if (m.aktiv === false) return false;
    if (!(m.postnumre || []).includes(String(postnr))) return false;
    if (!(m.boligtyper || []).includes(boligtype)) return false;
    const brugt = kapacitet[m.id] || {};
    if (harTal(m.kapacitet_dag) && (brugt.dag || 0) >= m.kapacitet_dag) return false;
    if (harTal(m.kapacitet_maaned) && (brugt.maaned || 0) >= m.kapacitet_maaned) return false;
    return true;
  });
}

function faktorer(m, { boligtype, estimat }, cfg) {
  const n = cfg.normering || {};
  const neutral = cfg.neutral ?? 0.5;
  const salg = m.salg_12m?.[boligtype];
  const ligg = m.liggetid_dage;
  const svar = m.responstid_timer;
  const pmin = m.prisinterval?.min;
  const pmax = m.prisinterval?.max;

  let prisniveau = { v: neutral, data: false };
  if (harTal(pmin) && harTal(pmax) && harTal(estimat)) {
    const afstand = estimat < pmin ? pmin - estimat : estimat > pmax ? estimat - pmax : 0;
    prisniveau = { v: klem(1 - afstand / estimat), data: true, inden: afstand === 0 };
  }

  return {
    lokale_salg: harTal(salg) ? { v: klem(salg / (n.lokale_salg_max || 40)), data: true, raa: salg } : { v: neutral, data: false },
    liggetid: harTal(ligg)
      ? { v: klem(((n.liggetid_vaerst_dage || 180) - ligg) / ((n.liggetid_vaerst_dage || 180) - (n.liggetid_bedst_dage || 30))), data: true, raa: ligg }
      : { v: neutral, data: false },
    prisniveau,
    feedback: harTal(m.feedback_score) ? { v: klem(m.feedback_score), data: true, raa: m.feedback_score } : { v: neutral, data: false },
    responstid: harTal(svar)
      ? { v: klem(((n.responstid_vaerst_timer || 48) - svar) / ((n.responstid_vaerst_timer || 48) - (n.responstid_bedst_timer || 1))), data: true, raa: svar }
      : { v: neutral, data: false },
  };
}

function begrundelser(m, f, { postnr, boligtype }, vaegte) {
  const kandidater = [];
  if (f.lokale_salg.data && f.lokale_salg.raa > 0) {
    kandidater.push({ vaegt: vaegte.lokale_salg * f.lokale_salg.v, tekst: `Har solgt ${f.lokale_salg.raa} ${flertalFor(boligtype)} i området det seneste år` });
  }
  if (f.liggetid.data) {
    kandidater.push({ vaegt: vaegte.liggetid * f.liggetid.v, tekst: `Sælger typisk på ${f.liggetid.raa} dage i området` });
  }
  if (f.prisniveau.data && f.prisniveau.inden) {
    kandidater.push({ vaegt: vaegte.prisniveau * f.prisniveau.v, tekst: 'Har erfaring med boliger i samme prisklasse som din' });
  }
  kandidater.sort((a, b) => b.vaegt - a.vaegt);
  const ud = kandidater.slice(0, 3).map((k) => k.tekst);
  // Altid sande begrundelser fra dækningen, hvis der mangler tal.
  if (ud.length < 2) ud.push(`Arbejder i ${postnr} og handler med ${flertalFor(boligtype)}`);
  if (ud.length < 2 && m.by) ud.push(`Har kontor i ${m.by}`);
  return ud.slice(0, 3);
}

export function matchMaegler({ maeglere, config, postnr, boligtype, estimat, horisont, kapacitet = {}, seed = '' }) {
  const cfg = config || {};
  const vaegte = cfg.vaegte || {};
  const kandidater = filtrer(maeglere, { postnr, boligtype }, kapacitet);
  if (!kandidater.length) return null;

  const scoret = kandidater.map((m) => {
    const f = faktorer(m, { boligtype, estimat }, cfg);
    const basis = Object.keys(vaegte).reduce((sum, k) => sum + (vaegte[k] || 0) * (f[k]?.v ?? 0), 0);
    const rotation = (cfg.rotation || 0) * seedTal(`${seed}:${m.id}`);
    return { m, f, score: Math.round((basis + rotation) * 10000) / 10000 };
  });
  scoret.sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
  const vinder = scoret[0];

  return {
    maegler: vinder.m,
    score: vinder.score,
    faktorer: Object.fromEntries(Object.entries(vinder.f).map(([k, x]) => [k, { score: Math.round(x.v * 1000) / 1000, data: x.data }])),
    begrundelser: begrundelser(vinder.m, vinder.f, { postnr, boligtype }, vaegte),
    version: cfg.version || null,
    kandidater: kandidater.length,
    horisont: horisont || null,
  };
}
