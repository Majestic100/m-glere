// Henter Finans Danmarks Boligmarkedsstatistik fra rkr.statistikbank.dk og opdaterer
//   data/m2-priser.json  (kvadratmeterpriser, handler, salgstid og udvikling pr. postnummer og kommune)
//   data/kommuner.json   (kun talfelterne, navne, naboer og lokale tekster bevares)
//   data/marked.json     (nøgletal for hele landet)
//
// Kør hvert kvartal, når Finans Danmark har offentliggjort nye tal:  npm run hent-boligdata
//
// Metode: kvadratmeterprisen er gennemsnittet af de seneste to kvartaler, vægtet med antal solgte
// boliger. Er der færre end 20 handler i de to kvartaler, bruges de seneste fire, så et enkelt kvartal
// med få handler ikke slår igennem. To kvartaler følger markedet tættere end et helt år, når priserne
// stiger. Antal handler og salgstid gælder de seneste fire kvartaler. Udviklingen sammenligner de
// seneste fire kvartaler med de samme fire kvartaler 1, 5 og 10 år tidligere. Statistikbanken giver gæster højst 20.000 tal pr. udtræk,
// så postnumrene hentes i bidder.
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://rkr.statistikbank.dk/statbank5a/SelectVarVal/';
const KILDE = 'Finans Danmark, Boligmarkedsstatistikken';
const TYPER = { 1: 'hus', 2: 'lejlighed', 3: 'fritidshus' };
const MIN_HANDLER_HALVAAR = 20;

const latin1 = (buf) => new TextDecoder('latin1').decode(buf);
const afkod = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

async function side(url, cookie, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body,
  });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const saet = r.headers.getSetCookie?.() || [];
  return { html: latin1(await r.arrayBuffer()), cookie: saet.map((c) => c.split(';')[0]).join('; ') || cookie };
}

/** Variablerne i en tabel: { var1: [{kode, tekst}], ... } */
async function variabler(tabel) {
  const { html, cookie } = await side(`${BASE}Define.asp?MainTable=${tabel}&PLanguage=0&PXSId=0&wsid=cftree`);
  const vars = {};
  for (const m of html.matchAll(/<SELECT[^>]*NAME="(var\d)"[^>]*>([\s\S]*?)<\/SELECT>/gi)) {
    vars[m[1]] = [...m[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/gi)].map((o) => ({ kode: o[1], tekst: afkod(o[2]) }));
  }
  return { vars, html, cookie };
}

/** Henter én udtrækning og returnerer celler som { [stub-labels...], periode, vaerdi }. */
async function udtraek(tabel, valg) {
  const { html, cookie } = await variabler(tabel);
  const form = /<FORM name="main"[\s\S]*?<\/FORM>/i.exec(html)[0];
  const felter = new URLSearchParams();
  for (const m of form.matchAll(/<input([^>]*)>/gi)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1].toLowerCase(), x[2]]));
    if (['hidden', 'text'].includes((a.type || '').toLowerCase()) && a.name) felter.append(a.name, a.name === 'TS' ? 'ShowTable' : a.value || '');
  }
  for (const [v, liste] of Object.entries(valg)) for (const x of liste) felter.append(v, x);
  // Statistikbanken forventer latin1 i formularen
  const krop = felter.toString();
  const res = await side(`${BASE}saveselections.asp`, cookie, krop);
  const tabeller = [...res.html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  const data = tabeller.find((t) => /\d{4}K\d/.test(t) && /<td/i.test(t));
  if (!data) throw new Error(`${tabel}: ingen datatabel i svaret`);
  const raekker = [...data.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => afkod(c[1])));
  const hoved = raekker.find((r) => r.filter((c) => /^\d{4}K\d$/.test(c)).length);
  const perioder = hoved.filter((c) => /^\d{4}K\d$/.test(c));
  const ud = [];
  const sti = [];
  for (const r of raekker) {
    if (r === hoved) continue;
    const tal = r.slice(-perioder.length);
    const label = r.slice(0, r.length - perioder.length).filter(Boolean).pop() ?? r[0];
    const tom = tal.every((x) => x === '');
    if (tom || r.length <= perioder.length) {
      sti.push(r.find(Boolean));
      continue;
    }
    perioder.forEach((p, i) => ud.push({ sti: [...sti], label, periode: p, vaerdi: tal_(tal[i]) }));
  }
  return ud;
}
function tal_(s) {
  if (!s || /^[.\-–]+$/.test(s)) return null;
  const n = Number(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Kvartaler: de seneste fire og de samme fire 1, 5 og 10 år tidligere
function kvartaler(alle) {
  const sidste = alle[0];
  const [aar, k] = sidste.split('K').map(Number);
  const vindue = (forskydning) =>
    [0, 1, 2, 3].map((i) => {
      let q = k - i;
      let a = aar - forskydning;
      while (q < 1) {
        q += 4;
        a -= 1;
      }
      return `${a}K${q}`;
    });
  return { sidste, nu: vindue(0), aar1: vindue(1), aar5: vindue(5), aar10: vindue(10) };
}

function vaegtet(pris, salg, perioder) {
  let sum = 0;
  let vaegt = 0;
  for (const p of perioder) {
    const v = pris.get(p);
    if (v === null || v === undefined) continue;
    const w = salg?.get(p) ?? 0;
    sum += v * (w || 0);
    vaegt += w || 0;
  }
  if (vaegt > 0) return sum / vaegt;
  const v = perioder.map((p) => pris.get(p)).filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const sumAf = (m, perioder) => {
  const v = perioder.map((p) => m?.get(p)).filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const pct = (a, b) => (a && b ? Math.round((a / b - 1) * 1000) / 10 : null);
const rund = (n, trin = 1) => (n === null || n === undefined ? null : Math.round(n / trin) * trin);

/** Bygger opslag: noegle -> type -> Map(periode -> værdi) */
function indeks(celler, kodeFraTekst, typeFraTekst) {
  const ud = new Map();
  for (const c of celler) {
    // Rækkefølgen af område og boligtype i tabellens forspalte varierer, så begge findes i hele stien.
    // Den seneste overskrift er den gældende.
    const sti = [...c.sti, c.label];
    const type = sti.map(typeFraTekst).filter(Boolean).pop();
    const kode = sti.map(kodeFraTekst).filter(Boolean).pop();
    if (!type || !kode) continue;
    if (!ud.has(kode)) ud.set(kode, {});
    const m = (ud.get(kode)[type] ||= new Map());
    m.set(c.periode, c.vaerdi);
  }
  return ud;
}

async function hentOmraade(prisTabel, salgTabel, tidTabel, koder, perioderPris, perioderTid) {
  const { vars } = await variabler(prisTabel);
  const tekstTilKode = new Map(vars.var1.map((o) => [o.tekst, o.kode]));
  const typeTekst = new Map(vars.var2.map((o) => [o.tekst.replace(/e$/, ''), TYPER[o.kode]]));
  const typeFraTekst = (t) => typeTekst.get(String(t).replace(/e$/, '')) || null;
  const kodeFraTekst = (t) => tekstTilKode.get(t) || null;

  // Tabellerne har ikke altid præcis de samme områder, og en ukendt kode afviser hele udtrækket
  const [vs, vt] = await Promise.all([variabler(salgTabel), variabler(tidTabel)]);
  const findes = (v) => new Set(v.vars.var1.map((o) => o.kode));
  const iSalg = findes(vs);
  const iTid = findes(vt);
  const pris = new Map();
  const salg = new Map();
  const tid = new Map();
  const bid = Math.max(1, Math.floor(19000 / (3 * perioderPris.length)));
  for (let i = 0; i < koder.length; i += bid) {
    const del = koder.slice(i, i + bid);
    process.stdout.write(`  ${prisTabel}/${salgTabel}/${tidTabel}: ${Math.min(i + bid, koder.length)} af ${koder.length}\r`);
    const [p, s, t] = await Promise.all([
      udtraek(prisTabel, { var1: del, var2: ['1', '2', '3'], var3: ['REAL'], var4: perioderPris }),
      udtraek(salgTabel, { var1: del.filter((k) => iSalg.has(k)), var2: ['1', '2', '3'], var3: ['SALG'], var4: perioderPris }),
      udtraek(tidTabel, { var1: del.filter((k) => iTid.has(k)), var2: ['1', '2', '3'], var3: perioderTid }),
    ]);
    for (const [kilde, maal] of [[p, pris], [s, salg], [t, tid]]) for (const [k, v] of indeks(kilde, kodeFraTekst, typeFraTekst)) maal.set(k, v);
  }
  process.stdout.write('\n');
  return { pris, salg, tid, navne: new Map(vars.var1.map((o) => [o.kode, o.tekst])) };
}

function noegletal(d, kode, type, q, { lang = false } = {}) {
  const pris = d.pris.get(kode)?.[type];
  const salg = d.salg.get(kode)?.[type];
  const tid = d.tid.get(kode)?.[type];
  if (!pris) return null;
  const nu = vaegtet(pris, salg, q.nu);
  if (!nu) return null;
  const halvaar = q.nu.slice(0, 2);
  const nyeste = (sumAf(salg, halvaar) ?? 0) >= MIN_HANDLER_HALVAAR ? vaegtet(pris, salg, halvaar) : null;
  const r = {
    m2pris: rund(nyeste ?? nu, 100),
    antal_handler_12m: rund(sumAf(salg, q.nu)),
    liggetid_dage: rund(tid ? vaegtet(tid, salg, q.nu) : null),
    udvikling_1aar_pct: pct(nu, vaegtet(pris, salg, q.aar1)),
  };
  if (lang) {
    r.udvikling_5aar_pct = pct(nu, vaegtet(pris, salg, q.aar5));
    r.udvikling_10aar_pct = pct(nu, vaegtet(pris, salg, q.aar10));
  }
  return r;
}

const kvartalNavn = (p) => {
  const [a, k] = p.split('K');
  return `${k}. kvartal ${a}`;
};

// ---------- Kør ----------
const bm010 = await variabler('BM010');
const q = kvartaler(bm010.vars.var4.map((o) => o.kode));
const periode = `${kvartalNavn(q.nu[3])} til ${kvartalNavn(q.nu[0])}`;
const seneste = kvartalNavn(q.nu[0]);
console.log(`Seneste kvartal: ${q.sidste}. Tallene dækker ${periode}.`);

// Kommuner og hele landet
const kommuneKoder = bm010.vars.var1.map((o) => o.kode).filter((k) => k === '00' || /^\d{3}$/.test(k) && !/^08\d$/.test(k));
const kom = await hentOmraade('BM010', 'BM020', 'BM030', kommuneKoder, [...q.nu, ...q.aar1, ...q.aar5, ...q.aar10], q.nu);

// Postnumre
const bm011 = await variabler('BM011');
const postKoder = bm011.vars.var1.map((o) => o.kode);
const pn = await hentOmraade('BM011', 'BM021', 'BM031', postKoder, [...q.nu, ...q.aar1], q.nu);

const pad = (k) => k.padStart(4, '0');
const m2 = {
  _note:
    'Kvadratmeterpriser og nøgletal pr. postnummer og kommune pr. boligtype. Kvadratmeterprisen er gennemsnittet af de seneste to kvartaler vægtet med antal handler, eller fire kvartaler ved færre end 20 handler. Antal handler, salgstid og udvikling gælder de seneste fire kvartaler. Finans Danmark slår parcel- og rækkehuse sammen, så rækkehuse bruger tallene for hus. Postnumre i København K, V og Frederiksberg C er samlet i intervaller (1000, 1500, 1800). Opdateres med npm run hent-boligdata.',
  kilde: KILDE,
  dato: seneste,
  testdata: false,
  postnumre: [],
  kommuner: [],
};
for (const kode of postKoder) {
  for (const type of Object.values(TYPER)) {
    const n = noegletal(pn, kode, type, q);
    if (n) m2.postnumre.push({ postnr: kode, boligtype: type, ...n });
  }
}
for (const kode of kommuneKoder.filter((k) => k !== '00')) {
  for (const type of Object.values(TYPER)) {
    const n = noegletal(kom, kode, type, q);
    if (n) m2.kommuner.push({ kommunekode: pad(kode), boligtype: type, ...n });
  }
}
writeFileSync('data/m2-priser.json', `${JSON.stringify(m2, null, 2)}\n`);
console.log(`data/m2-priser.json: ${m2.postnumre.length} postnummer-rækker, ${m2.kommuner.length} kommune-rækker`);

// Kommunesider: kun talfelterne opdateres
const kommuner = JSON.parse(readFileSync('data/kommuner.json', 'utf8'));
const mangler = [];
for (const k of kommuner.kommuner) {
  const kode = String(Number(k.kode));
  if (!kom.navne.has(kode)) {
    mangler.push(`${k.navn} (${k.kode})`);
    continue;
  }
  const hus = noegletal(kom, kode, 'hus', q, { lang: true });
  const lejl = noegletal(kom, kode, 'lejlighed', q);
  k.m2pris_hus = hus?.m2pris ?? 'TODO_DATA';
  k.m2pris_lejlighed = lejl?.m2pris ?? 'TODO_DATA';
  k.udvikling_1aar_pct = hus?.udvikling_1aar_pct ?? 'TODO_DATA';
  k.udvikling_5aar_pct = hus?.udvikling_5aar_pct ?? 'TODO_DATA';
  k.udvikling_10aar_pct = hus?.udvikling_10aar_pct ?? 'TODO_DATA';
  k.liggetid_dage = hus?.liggetid_dage ?? lejl?.liggetid_dage ?? 'TODO_DATA';
  k.dato = seneste;
}
kommuner.kilde = KILDE;
kommuner._note =
  'Kommunesider. Tallene opdateres med npm run hent-boligdata. Kvadratmeterpriser er gennemsnit af de seneste to kvartaler, vægtet med antal handler. Udvikling og salgstid gælder parcel- og rækkehuse. Navne, naboer og lokale tekster redigeres i CMS.';
writeFileSync('data/kommuner.json', `${JSON.stringify(kommuner, null, 2)}\n`);
if (mangler.length) console.warn(`Ukendte kommunekoder: ${mangler.join(', ')}`);

// Hele landet
const land = noegletal(kom, '00', 'hus', q);
const alleHandler = Object.values(TYPER)
  .map((t) => sumAf(kom.salg.get('00')?.[t], q.nu))
  .reduce((a, b) => a + (b || 0), 0);
const marked = {
  _note: 'Boligmarkedet lige nu for hele landet. Opdateres med npm run hent-boligdata.',
  kilde: KILDE,
  dato: seneste,
  m2pris: land?.m2pris ?? 'TODO_DATA',
  liggetid_dage: land?.liggetid_dage ?? 'TODO_DATA',
  handler_12m: rund(alleHandler, 100) || 'TODO_DATA',
  udvikling_1aar_pct: land?.udvikling_1aar_pct ?? 'TODO_DATA',
};
writeFileSync('data/marked.json', `${JSON.stringify(marked, null, 2)}\n`);
console.log('data/marked.json:', JSON.stringify(marked));
