// Vurderings-flowet i browseren. Ren JavaScript uden framework for at holde siden let på mobil.
//
// Trin: adresse, bolig (BBR), stand, horisont, resultat (geo-tjek, estimat og matchet mægler), kontakt, tak.
// Svarene gemmes løbende i sessionStorage. Estimatet vises uden krav om e-mail eller telefon.
import {
  FORM_VERSION,
  postnrFraTitel,
  normaliserTelefon,
  gyldigEmail,
  samtykkeTekst,
  FOELG_TEKST,
  VENTELISTE_TEKST,
  erTodo,
  harTal,
  kr,
  mio,
  tal,
  parseBeloeb,
} from '../lib/faelles.js';
import { indeksM2, beregnEstimat, beregnProvenu } from '../lib/estimat.js';
import { matchMaegler } from '../lib/matching.js';
import { spor, nytEventId, metaCookies } from './tracking.js';
import { hentAttribution } from './attribution.js';
import { harMarketing } from './samtykke.js';

const TRIN = ['adresse', 'bolig', 'stand', 'horisont', 'resultat', 'kontakt'];
const GEM = 'nv-flow';

const rod = document.getElementById('vurdering');
if (rod) start(rod);

function start(rod) {
  const data = JSON.parse(document.getElementById('vf-data').textContent);
  const indeks = indeksM2(data.m2);
  const form = rod.querySelector('#vf-form');
  const $ = (id) => rod.querySelector(`#${id}`);
  const skaerme = [...rod.querySelectorAll('.vf-skaerm')];
  const startTid = Date.now();
  // Browserens tilbage-knap går et trin tilbage, undtagen når siden vises i en iframe (fx preview).
  let brugHistorik = window.self === window.top;

  // ---------- Tilstand, der gemmes løbende ----------
  const tom = () => ({
    trin: 'adresse',
    historik: ['adresse'],
    adresse: null,
    bbr: null,
    bolig: {},
    stand: {},
    tilvalg: [],
    horisont: null,
    estimat: null,
    match: null,
    daekning: null,
    restgaeld: null,
    kontakt: {},
    event_ids: {},
    lead_id: nytEventId('lead'),
    sendt: false,
  });
  let s = tom();
  try {
    const gemt = JSON.parse(sessionStorage.getItem(GEM) || 'null');
    if (gemt && !gemt.sendt) s = { ...s, ...gemt };
  } catch {}
  const gem = () => {
    try {
      sessionStorage.setItem(GEM, JSON.stringify(s));
    } catch {}
  };

  // ---------- Navigation ----------
  function vis(navn, { push = true } = {}) {
    for (const el of skaerme) el.hidden = el.dataset.skaerm !== navn;
    if (push && s.historik[s.historik.length - 1] !== navn) {
      s.historik.push(navn);
      if (brugHistorik) {
        try {
          history.pushState({ nv: navn }, '');
        } catch {
          brugHistorik = false;
        }
      }
    }
    s.trin = navn;
    gem();
    document.body.classList.toggle('flow-aktiv', navn !== 'adresse');
    opdaterStatus(navn);
    if (navn === 'bolig') forberedBolig();
    if (navn === 'resultat') visResultat();
    if (navn === 'kontakt') forberedKontakt();
    if (navn !== 'adresse') {
      const h = rod.querySelector(`[data-skaerm="${navn}"] .vf-h`);
      h?.focus({ preventScroll: true });
      const top = rod.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.3) rod.closest('.vf-hus')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function opdaterStatus(navn) {
    const i = TRIN.indexOf(navn);
    const iGang = navn !== 'adresse' && navn !== 'tak';
    $('vf-top').hidden = !iGang;
    $('vf-status').hidden = navn === 'adresse';
    const pct = navn === 'tak' ? 100 : Math.round(((Math.max(i, 0) + 1) / (TRIN.length + 1)) * 100);
    $('vf-status-fyld').style.width = `${pct}%`;
    $('vf-status').setAttribute('aria-valuenow', String(pct));
    $('vf-trin').textContent = i >= 0 ? `Trin ${i + 1} af ${TRIN.length}` : '';
  }

  function tilbage() {
    if (s.historik.length <= 1) return;
    s.historik.pop();
    vis(s.historik[s.historik.length - 1], { push: false });
  }
  $('vf-tilbage').addEventListener('click', () => (brugHistorik ? history.back() : tilbage()));
  window.addEventListener('popstate', () => {
    if (!brugHistorik || s.sendt) return;
    if (s.historik.length > 1) tilbage();
  });

  function naeste(fra) {
    const r = { adresse: 'bolig', bolig: 'stand', stand: 'horisont', horisont: 'resultat', resultat: 'kontakt' }[fra];
    if (r) vis(r);
  }

  form.addEventListener('click', (e) => {
    const knap = e.target.closest('button');
    if (!knap || !rod.contains(knap)) return;
    if (knap.hasAttribute('data-naeste')) {
      e.preventDefault();
      const navn = knap.closest('.vf-skaerm').dataset.skaerm;
      if (valider(navn)) naeste(navn);
    }
  });

  // Enter i et felt går videre i stedet for at sende formularen.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.id === 'vf-adresse' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    const skaerm = e.target.closest('.vf-skaerm');
    if (!skaerm || skaerm.dataset.skaerm === 'kontakt') return;
    e.preventDefault();
    skaerm.querySelector('[data-naeste]')?.click();
  });

  // Enkeltvalg går automatisk videre efter et kort øjeblik.
  form.addEventListener('change', (e) => {
    laesFelter();
    if (e.target.matches('input[data-auto]')) {
      const navn = e.target.closest('.vf-skaerm').dataset.skaerm;
      setTimeout(() => {
        if (s.trin === navn && valider(navn)) naeste(navn);
      }, 250);
    }
  });
  form.addEventListener('input', laesFelter);

  /** Læser felterne ind i tilstanden, så de overlever et genindlæs. */
  function laesFelter() {
    s.bolig = {
      ...s.bolig,
      type: form.boligtype.value || s.bolig.type,
      areal: $('vf-areal').value,
      vaerelser: $('vf-vaerelser').value,
      byggeaar: $('vf-byggeaar').value,
    };
    s.stand = { indvendig: form.indvendig.value || null, udvendig: form.udvendig.value || null };
    s.tilvalg = [...form.querySelectorAll('input[name="tilvalg"]:checked')].map((x) => x.value);
    s.horisont = form.horisont.value || s.horisont;
    s.kontakt = { fornavn: $('vf-fornavn').value, efternavn: $('vf-efternavn').value, telefon: $('vf-tlf').value, email: $('vf-email').value };
    gem();
  }

  function skrivFelter() {
    const saet = (navn, v) => {
      if (!v) return;
      const el = form.querySelector(`input[name="${navn}"][value="${v}"]`);
      if (el) el.checked = true;
    };
    saet('boligtype', s.bolig.type);
    $('vf-areal').value = s.bolig.areal || '';
    $('vf-vaerelser').value = s.bolig.vaerelser || '';
    $('vf-byggeaar').value = s.bolig.byggeaar || '';
    saet('indvendig', s.stand.indvendig);
    saet('udvendig', s.stand.udvendig);
    for (const t of s.tilvalg || []) saet('tilvalg', t);
    saet('horisont', s.horisont);
    $('vf-fornavn').value = s.kontakt.fornavn || '';
    $('vf-efternavn').value = s.kontakt.efternavn || '';
    $('vf-tlf').value = s.kontakt.telefon || '';
    $('vf-email').value = s.kontakt.email || '';
    if (s.adresse) $('vf-adresse').value = s.adresse.tekst;
  }

  // ---------- Validering ----------
  function fejl(id, tekst) {
    const el = $(id);
    el.textContent = tekst || '';
    el.hidden = !tekst;
    return !tekst;
  }
  function marker(id, ok) {
    $(id).setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  function valider(navn) {
    if (navn === 'adresse') return validerAdresse();
    if (navn === 'bolig') {
      laesFelter();
      const areal = parseInt(s.bolig.areal, 10);
      if (!s.bolig.type) return fejl('vf-bolig-fejl', 'Vælg din boligtype.');
      if (!marker('vf-areal', areal >= 10 && areal <= 2000)) return fejl('vf-bolig-fejl', 'Skriv boligens areal i hele kvadratmeter, fx 120.');
      const v = s.bolig.vaerelser ? parseInt(s.bolig.vaerelser, 10) : null;
      if (!marker('vf-vaerelser', v === null || (v >= 1 && v <= 30))) return fejl('vf-bolig-fejl', 'Antal værelser skal være et tal mellem 1 og 30.');
      const aar = s.bolig.byggeaar ? parseInt(s.bolig.byggeaar, 10) : null;
      if (!marker('vf-byggeaar', aar === null || (aar >= 1500 && aar <= new Date().getFullYear() + 1))) return fejl('vf-bolig-fejl', 'Skriv byggeåret med fire cifre, fx 1974.');
      return fejl('vf-bolig-fejl', '');
    }
    if (navn === 'horisont') {
      laesFelter();
      return Boolean(s.horisont) || fejl('vf-horisont-fejl', 'Vælg det, der passer bedst.');
    }
    return true;
  }

  function validerAdresse() {
    if (!$('vf-manuel').hidden) {
      const vej = $('vf-vej').value.trim();
      const postnr = $('vf-postnr').value.trim();
      if (!marker('vf-vej', vej.length >= 3)) return fejl('vf-adresse-fejl', 'Skriv vejnavn og husnummer.');
      if (!marker('vf-postnr', /^\d{4}$/.test(postnr))) return fejl('vf-adresse-fejl', 'Skriv et postnummer med fire cifre.');
      s.adresse = { tekst: `${vej}, ${postnr}`, adresseId: null, husnummerId: null, postnr, by: '', kommunekode: null, manuel: true };
      adresseValgt();
      return fejl('vf-adresse-fejl', '');
    }
    if (!s.adresse) return fejl('vf-adresse-fejl', 'Vælg din adresse på listen. Kan du ikke finde den, så tryk på linket herunder.');
    if (!$('vf-enhed-felt').hidden && !$('vf-enhed').value) return fejl('vf-adresse-fejl', 'Vælg etage og dør.');
    return fejl('vf-adresse-fejl', '');
  }

  // ---------- Trin 1: adresse (Adressevælger, Danmarks officielle adresseregister) ----------
  const input = $('vf-adresse');
  const liste = $('vf-forslag');
  let forslag = [];
  let aktiv = -1;
  let timer = null;
  let sidste = 0;
  const token = encodeURIComponent(data.adressevaelgerToken);

  async function hent(sti) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`https://adressevaelger.dk${sti}${sti.includes('?') ? '&' : '?'}token=${token}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  const soeg = async (tekst) => {
    const j = await hent(`/adresser/soeg?tekst=${encodeURIComponent(tekst.slice(0, 73))}`);
    return Array.isArray(j) ? j : j.fund || [];
  };

  input.addEventListener('input', () => {
    s.adresse = null;
    $('vf-enhed-felt').hidden = true;
    clearTimeout(timer);
    const tekst = input.value.trim();
    if (tekst.length < 3) return lukListe();
    timer = setTimeout(async () => {
      const nr = ++sidste;
      try {
        const fund = await soeg(tekst);
        if (nr !== sidste) return;
        forslag = fund.filter((f) => f.type === 'adresse' || f.type === 'husnummer').slice(0, 6);
        visListe();
      } catch {
        aabnManuel('Adressesøgningen svarer ikke lige nu. Skriv din adresse her i stedet.');
      }
    }, 180);
  });

  function visListe() {
    aktiv = -1;
    liste.innerHTML = forslag.map((f, i) => `<li role="option" id="vf-f-${i}" aria-selected="false" data-i="${i}">${esc(f.titel)}</li>`).join('');
    liste.hidden = forslag.length === 0;
    input.setAttribute('aria-expanded', String(!liste.hidden));
  }
  function lukListe() {
    liste.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  input.addEventListener('keydown', (e) => {
    if (liste.hidden) {
      if (e.key === 'Enter') {
        e.preventDefault();
        rod.querySelector('[data-skaerm="adresse"] [data-naeste]').click();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      aktiv = (aktiv + (e.key === 'ArrowDown' ? 1 : -1) + forslag.length) % forslag.length;
      liste.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === aktiv)));
      input.setAttribute('aria-activedescendant', `vf-f-${aktiv}`);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      vaelgForslag(aktiv >= 0 ? aktiv : 0);
    } else if (e.key === 'Escape') {
      lukListe();
    }
  });
  liste.addEventListener('mousedown', (e) => e.preventDefault());
  liste.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) vaelgForslag(Number(li.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(lukListe, 100));

  async function vaelgForslag(i) {
    const f = forslag[i];
    if (!f) return;
    input.value = f.titel;
    lukListe();
    fejl('vf-adresse-fejl', '');
    const pn = postnrFraTitel(f.titel) || {};
    if (f.type === 'adresse') {
      s.adresse = { tekst: f.titel, adresseId: f.id, husnummerId: f.husnummerId || null, ...pn, kommunekode: null, manuel: false };
      adresseValgt();
      return;
    }
    // Husnummer: find de enkelte boliger (etage og dør) på adressen.
    s.adresse = { tekst: f.titel, adresseId: null, husnummerId: f.id, ...pn, kommunekode: null, manuel: false };
    try {
      const enheder = (await soeg(f.titel)).filter((x) => x.type === 'adresse' && x.husnummerId === f.id);
      if (enheder.length === 1) {
        s.adresse.adresseId = enheder[0].id;
        s.adresse.tekst = enheder[0].titel;
      } else if (enheder.length > 1) {
        const sel = $('vf-enhed');
        sel.innerHTML =
          '<option value="">Vælg</option>' + enheder.map((x) => `<option value="${esc(x.id)}">${esc(x.titel.replace(/,\s*\d{4}\s.*$/, ''))}</option>`).join('');
        sel.dataset.titler = JSON.stringify(Object.fromEntries(enheder.map((x) => [x.id, x.titel])));
        $('vf-enhed-felt').hidden = false;
        sel.focus();
        return;
      }
    } catch {}
    adresseValgt();
  }

  $('vf-enhed').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id || !s.adresse) return;
    const titler = JSON.parse(e.target.dataset.titler || '{}');
    s.adresse.adresseId = id;
    s.adresse.tekst = titler[id] || s.adresse.tekst;
    adresseValgt();
  });

  function aabnManuel(note) {
    $('vf-manuel').hidden = false;
    $('vf-manuel-knap').hidden = true;
    if (note) $('vf-manuel-note').textContent = note;
    lukListe();
    if (input.value && !$('vf-vej').value) $('vf-vej').value = input.value;
    input.closest('.felt').hidden = true;
    $('vf-vej').focus();
  }
  $('vf-manuel-knap').addEventListener('click', () => aabnManuel());

  let bbrPromise = Promise.resolve(null);
  function adresseValgt() {
    s.bbr = null;
    s.match = null;
    s.daekning = null;
    gem();
    s.event_ids.address_entered = spor('address_entered', { postnr: s.adresse.postnr });
    hentKommune();
    hentBbr();
  }

  async function hentKommune() {
    const id = s.adresse?.husnummerId;
    if (!id) return;
    try {
      const j = await hent(`/husnumre/${encodeURIComponent(id)}`);
      s.adresse.kommunekode = j?.husnummer?.navngivenvejkommunedel?.kommune || null;
      gem();
    } catch {}
  }

  // ---------- Trin 2: BBR ----------
  function hentBbr() {
    const a = s.adresse;
    if (!a || (!a.adresseId && !a.husnummerId)) {
      bbrPromise = Promise.resolve(null);
      return;
    }
    const q = new URLSearchParams();
    if (a.adresseId) q.set('adresseId', a.adresseId);
    if (a.husnummerId) q.set('husnummerId', a.husnummerId);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    bbrPromise = fetch(`/api/bbr?${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (s.bbr = j && (j.boligtype || j.areal) ? j : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
  }

  async function forberedBolig() {
    const bbr = await bbrPromise;
    if (!bbr) return;
    if (bbr.boligtype && !s.bolig.type) s.bolig.type = bbr.boligtype;
    if (bbr.areal && !s.bolig.areal) s.bolig.areal = String(bbr.areal);
    if (bbr.vaerelser && !s.bolig.vaerelser) s.bolig.vaerelser = String(bbr.vaerelser);
    if (bbr.byggeaar && !s.bolig.byggeaar) s.bolig.byggeaar = String(bbr.byggeaar);
    skrivFelter();
    gem();
  }

  // ---------- Trin 5 og 6: geo-tjek, estimat og matching ----------
  async function visResultat() {
    laesFelter();
    const a = s.adresse;
    s.estimat = beregnEstimat(
      {
        adresseId: a.adresseId,
        postnr: a.postnr,
        kommunekode: a.kommunekode,
        bbr: { boligtype: s.bolig.type, areal: parseInt(s.bolig.areal, 10), vaerelser: s.bolig.vaerelser, byggeaar: s.bolig.byggeaar },
        stand: s.stand,
        tilvalg: s.tilvalg,
      },
      indeks,
      data.estimatConfig,
    );
    tegnEstimat();
    tegnDetaljer();
    if (s.estimat && !s.event_ids.estimate_viewed) {
      s.event_ids.estimate_viewed = spor('estimate_viewed', { postnr: a.postnr, boligtype: s.bolig.type, praecision: s.estimat.praecision });
    }
    $('vf-res-maegler').innerHTML = '<p class="vf-note">Finder den mægler, der passer bedst til din bolig.</p>';
    await hentMatch();
    tegnMaegler();
    tegnFoelg();
    gem();
  }

  async function hentMatch() {
    const krop = { postnr: s.adresse.postnr, boligtype: s.bolig.type, estimat: s.estimat?.middel || null, horisont: s.horisont };
    // Matchet genbruges, hvis boligen ikke er ændret, så boligejeren ikke får en ny mægler ved at gå frem og tilbage.
    const noegle = JSON.stringify(krop);
    if (s.match && s.matchNoegle === noegle) return;
    s.matchNoegle = noegle;
    s.match = null;
    s.daekning = null;
    try {
      if (data.demo) throw new Error('demo');
      const r = await fetch('/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(krop) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      s.daekning = Boolean(j.daekning);
      if (j.daekning) s.match = { ...j, lokal: false };
    } catch {
      // Uden server (demoen) kører samme motor lokalt. I produktion er mæglerdata ikke indbygget.
      if (!data.maeglere) {
        s.daekning = null;
        return;
      }
      const r = matchMaegler({ maeglere: data.maeglere, config: data.matchConfig, ...krop, estimat: krop.estimat, seed: s.lead_id });
      s.daekning = Boolean(r);
      if (r) s.match = { maegler: r.maegler, begrundelser: r.begrundelser, score: r.score, version: r.version, faktorer: r.faktorer, token: null, lokal: true };
    }
    if (s.match && !s.event_ids.broker_matched) {
      s.event_ids.broker_matched = spor('broker_matched', { postnr: s.adresse.postnr, maegler_id: s.match.maegler.id });
    }
  }

  function tegnEstimat() {
    const e = s.estimat;
    $('vf-res-adresse').textContent = s.adresse.tekst;
    if (e) {
      $('vf-res-titel').textContent = `Din bolig vurderes til mellem ${mio(e.lav)} og ${mio(e.hoej)} mio. kr.`;
      $('vf-res-middel').textContent = `Midt i intervallet: ${kr(e.middel)}`;
      $('vf-testdata').hidden = !e.testdata;
      const n = { hoej: 3, middel: 2, lav: 1 }[e.praecision];
      const navn = { hoej: 'Høj', middel: 'Middel', lav: 'Lav' }[e.praecision];
      $('vf-praecision').innerHTML = `<span class="praecision-chip"><i aria-hidden="true">${[1, 2, 3].map((x) => `<b class="${x <= n ? 'til' : ''}"></b>`).join('')}</i>Præcision: ${navn}</span><span>${esc(e.praecisionTekst)}</span>`;
    } else {
      $('vf-res-titel').textContent = 'Vi kan ikke give et estimat på din bolig lige nu';
      $('vf-res-middel').textContent =
        s.bolig.type === 'andel'
          ? 'Prisen på en andelsbolig fastsættes efter foreningens regler. En mægler eller din bestyrelse kan hjælpe dig.'
          : 'Vi mangler tal for boliger som din i området. En lokal mægler kan give dig en præcis vurdering, gratis.';
      $('vf-testdata').hidden = true;
      $('vf-praecision').innerHTML = '';
    }
  }

  // ---------- Resultatdetaljer: nøgletal, sammenlignelige handler og provenu ----------
  function tegnDetaljer() {
    const e = s.estimat;
    const boks = $('vf-res-detaljer');
    if (!e) {
      boks.innerHTML = '';
      return;
    }
    const n = e.noegletal;
    const pn = s.adresse.postnr;
    const fliser = [
      harTal(n.m2_postnr) && ['Pris pr. m² i ' + pn, kr(n.m2_postnr)],
      harTal(n.m2_kommune) && ['Pris pr. m² i kommunen', kr(n.m2_kommune)],
      harTal(n.liggetid_dage) && ['Gennemsnitlig liggetid', `${n.liggetid_dage} dage`],
      harTal(n.udvikling_1aar_pct) && ['Prisudvikling 1 år', `${n.udvikling_1aar_pct > 0 ? '+' : ''}${String(n.udvikling_1aar_pct).replace('.', ',')} %`],
    ].filter(Boolean);
    const kilde = e.testdata ? 'Testtal' : `Kilde: ${esc(e.kilde)}${e.dato && !erTodo(e.dato) ? `, ${esc(e.dato)}` : ''}`;

    // Sammenlignelige handler vises kun, når der er mindst 3. Ellers skjules sektionen helt.
    const handler = (data.handler || []).filter((h) => h.postnr === pn && h.boligtype === s.bolig.type).slice(0, 5);

    const salaer = data.estimatConfig?.salaer || {};
    const medSalaer = harTal(salaer.min) && harTal(salaer.max);

    boks.innerHTML = `
      ${fliser.length ? `<div class="stak"><h3>Nøgletal for området</h3><dl class="noegletal">${fliser.map(([dt, dd]) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl><p class="kildelinje">${kilde}</p></div>` : ''}
      ${
        handler.length >= 3
          ? `<div class="stak"><h3>Handler i nærheden</h3><div style="overflow-x:auto"><table class="handler"><thead><tr><th scope="col">Vej</th><th scope="col">m²</th><th scope="col">Pris</th><th scope="col">Solgt</th></tr></thead><tbody>${handler
              .map((h) => `<tr><td>${esc(h.vej)}</td><td class="tal-h">${esc(h.m2)}</td><td class="tal-h">${kr(h.pris)}</td><td>${esc(h.dato)}</td></tr>`)
              .join('')}</tbody></table></div><p class="kildelinje">Kilde: ${esc(data.handlerKilde)}</p></div>`
          : ''
      }
      <div class="stak">
        <h3>Hvad har du til dig selv efter salg?</h3>
        <div class="felt">
          <label for="vf-restgaeld">Restgæld på dine lån</label>
          <div class="enhed-input"><input id="vf-restgaeld" type="text" inputmode="numeric" placeholder="0" aria-describedby="vf-provenu-forbehold" /><span>kr.</span></div>
        </div>
        <div class="provenu-resultat" aria-live="polite"><span id="vf-provenu-label"></span><strong id="vf-provenu"></strong></div>
        <p class="hjaelp" id="vf-provenu-forbehold">Et groft skøn ud fra midten af intervallet. ${
          medSalaer ? `Mæglersalær og salgsomkostninger er sat til ${kr(salaer.min)} til ${kr(salaer.max)}.` : 'Salær og salgsomkostninger er ikke trukket fra, fordi de varierer fra mægler til mægler.'
        } Det tager ikke højde for kurstab ved indfrielse af lån, skat eller flytning.</p>
      </div>`;

    const felt = $('vf-restgaeld');
    if (harTal(s.restgaeld)) felt.value = tal(s.restgaeld);
    const opdater = () => {
      s.restgaeld = parseBeloeb(felt.value);
      const p = beregnProvenu({ middel: e.middel, restgaeld: s.restgaeld, salaer });
      s.provenu = p ? { ...p, restgaeld: s.restgaeld } : null;
      $('vf-provenu-label').textContent = p.medSalaer ? 'Du har cirka mellem' : 'Før salær og salgsomkostninger har du cirka';
      $('vf-provenu').textContent = p.medSalaer ? `${kr(p.fra).replace(' kr.', '')} og ${kr(p.til)}` : kr(p.fra);
      gem();
    };
    felt.addEventListener('input', opdater);
    felt.addEventListener('blur', () => {
      if (harTal(s.restgaeld)) felt.value = tal(s.restgaeld);
    });
    opdater();
  }

  // ---------- Få estimatet tilsendt og Følg din boligværdi ----------
  function tegnFoelg() {
    const boks = $('vf-res-foelg');
    const nysgerrig = s.horisont === 'nysgerrig';
    if (s.daekning === false) {
      boks.innerHTML = '';
      return;
    }
    boks.innerHTML = `
      <div class="boks" id="vf-foelg-boks">
        <h3>${nysgerrig ? 'Følg din boligværdi' : 'Få estimatet på mail'}</h3>
        <p>${nysgerrig ? 'Vi sender dig estimatet nu og et opdateret estimat hver 3. måned, hvis du vil. Det er gratis, og ingen mægler kontakter dig.' : 'Vi sender estimatet til dig, så du kan finde det igen.'}</p>
        <div class="felt"><label for="vf-fg-email">E-mail</label><input id="vf-fg-email" type="email" inputmode="email" autocomplete="email" aria-describedby="vf-fg-fejl" /></div>
        <div class="samtykke-raekke">
          <label class="samtykke samtykke--frivillig"><input type="checkbox" id="vf-fg-samtykke" /><span>${esc(FOELG_TEKST)}</span></label>
          <a class="samtykke-link" href="/persondatapolitik" target="_blank" rel="noopener">Persondatapolitik</a>
        </div>
        <p class="fejltekst" id="vf-fg-fejl" role="alert" hidden></p>
        <button type="button" class="knap ${nysgerrig ? '' : 'knap--sekundaer'} knap--fuld" id="vf-fg-send">Send mig estimatet</button>
      </div>`;
    if (nysgerrig) $('vf-res-maegler').before(boks);
    else $('vf-res-maegler').after(boks);
    $('vf-fg-send').addEventListener('click', sendFoelg);
  }

  async function sendFoelg() {
    const email = $('vf-fg-email').value.trim();
    if (!marker('vf-fg-email', gyldigEmail(email))) return fejl('vf-fg-fejl', 'Skriv en gyldig e-mailadresse, fx navn@mail.dk.');
    fejl('vf-fg-fejl', '');
    const foelg = $('vf-fg-samtykke').checked;
    const knap = $('vf-fg-send');
    knap.disabled = true;
    const ok = await send(
      byggePayload('nurture', {
        kontakt: { email },
        send_estimat: true,
        samtykker: [{ formaal: 'foelg_boligvaerdi', givet: foelg, tekst: FOELG_TEKST }],
      }),
    );
    knap.disabled = false;
    if (!ok) return fejl('vf-fg-fejl', 'Vi kunne ikke sende estimatet. Prøv igen om lidt.');
    $('vf-foelg-boks').innerHTML = `<h3>Estimatet er på vej</h3><p>Vi sender det til ${esc(email)}.${foelg ? ' Du får også et opdateret estimat hver 3. måned. Du kan afmelde dig i hver e-mail.' : ''}</p>${data.demo ? '<p class="vf-preview">Demo. Intet er sendt.</p>' : ''}`;
  }

  function tegnMaegler() {
    const boks = $('vf-res-maegler');
    if (s.match) {
      const m = s.match.maegler;
      const fn = fornavn(m.navn);
      boks.innerHTML = `
        <div class="stak">
          <h3>Din anbefalede mægler</h3>
          <article class="anbefalet">
            <div class="anbefalet-hoved">${foto(m, 72)}<div><p class="mk-navn">${ph(m.navn, '[Mæglerens navn]')}</p><p class="mk-firma">${ph(m.firma, '[Firma]')}${m.by ? `, ${esc(m.by)}` : ''}</p></div></div>
            <ul>${(s.match.begrundelser || []).map((b) => `<li>${flueben()}<span>${esc(b)}</span></li>`).join('')}</ul>
            <p class="vf-note">Vi har fundet den mægler, der passer bedst til din bolig ud fra lokale salg, liggetid og erfaring med boliger som din. Mægleren samarbejder med Nem Vurdering og betaler os for henvisningen. Det koster ikke dig noget. <a href="/ofte-stillede-spoergsmaal#hvordan-finder-i-min-maegler">Sådan finder vi din mægler</a></p>
            <button type="button" class="knap knap--fuld" id="vf-til-kontakt">Få en præcis vurdering fra ${esc(fn)}</button>
          </article>
        </div>`;
      boks.querySelector('#vf-til-kontakt').addEventListener('click', () => naeste('resultat'));
    } else if (s.daekning === false) {
      boks.innerHTML = `
        <div class="boks" id="vf-venteliste">
          <h3>Vi har endnu ikke en partnermægler i dit område</h3>
          <p>Skriv dig op, så giver vi besked, når vi har.</p>
          <div class="felt"><label for="vf-vl-email">E-mail</label><input id="vf-vl-email" type="email" inputmode="email" autocomplete="email" aria-describedby="vf-vl-fejl" /></div>
          <div class="samtykke-raekke">
            <label class="samtykke"><input type="checkbox" id="vf-vl-samtykke" aria-describedby="vf-vl-fejl" /><span>${esc(VENTELISTE_TEKST)}</span></label>
            <a class="samtykke-link" href="/persondatapolitik" target="_blank" rel="noopener">Persondatapolitik</a>
          </div>
          <p class="fejltekst" id="vf-vl-fejl" role="alert" hidden></p>
          <button type="button" class="knap knap--fuld" id="vf-vl-send">Giv mig besked</button>
        </div>`;
      boks.querySelector('#vf-vl-send').addEventListener('click', sendVenteliste);
    } else {
      boks.innerHTML = '<p class="vf-note">Vi kunne ikke finde en mægler lige nu. Prøv igen om lidt.</p>';
    }
  }

  // ---------- Trin 7: kontakt og samtykke ----------
  function forberedKontakt() {
    const m = s.match?.maegler;
    if (!m) return vis('resultat', { push: false });
    $('vf-kontakt-titel').textContent = `Få en præcis vurdering fra ${fornavn(m.navn)}`;
    $('vf-valgt').innerHTML = `${foto(m, 56)}<div><p class="mk-navn">${ph(m.navn, '[Mæglerens navn]')}</p><p class="mk-firma">${ph(m.firma, '[Firma]')}</p></div>`;
    $('vf-samtykke').checked = false;
    $('vf-samtykke-tekst').textContent = samtykkeTekst(m);
    $('vf-foelg-tekst').textContent = FOELG_TEKST;
    $('vf-send').textContent = `Send til ${fornavn(m.navn)}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (s.trin !== 'kontakt' || s.sendt) return;
    laesFelter();
    const k = s.kontakt;
    if (!marker('vf-fornavn', k.fornavn.trim().length >= 1)) return fejl('vf-kontakt-fejl', 'Skriv dit fornavn.');
    if (!marker('vf-efternavn', k.efternavn.trim().length >= 1)) return fejl('vf-kontakt-fejl', 'Skriv dit efternavn.');
    if (!marker('vf-tlf', Boolean(normaliserTelefon(k.telefon)))) return fejl('vf-kontakt-fejl', 'Skriv et dansk telefonnummer med 8 cifre, fx 22 33 44 55.');
    if (!marker('vf-email', gyldigEmail(k.email))) return fejl('vf-kontakt-fejl', 'Skriv en gyldig e-mailadresse, fx navn@mail.dk.');
    if (!$('vf-samtykke').checked) return fejl('vf-kontakt-fejl', `Sæt flueben, så ${fornavn(s.match.maegler.navn)} må kontakte dig om vurderingen.`);
    fejl('vf-kontakt-fejl', '');

    const knap = $('vf-send');
    const knapTekst = knap.textContent;
    knap.disabled = true;
    knap.textContent = 'Sender...';
    const leadEvent = nytEventId('lead_submitted');
    const payload = byggePayload('maeglerlead', {
      kontakt: { fornavn: k.fornavn.trim(), efternavn: k.efternavn.trim(), telefon: k.telefon.trim(), email: k.email.trim() },
      samtykker: [
        { formaal: 'kontakt_maegler_og_bekraeftelse', givet: true, tekst: $('vf-samtykke-tekst').textContent },
        { formaal: 'foelg_boligvaerdi', givet: $('vf-foelg').checked, tekst: FOELG_TEKST },
      ],
      event_ids: { ...s.event_ids, lead_submitted: leadEvent },
    });
    const ok = await send(payload);
    if (!ok) {
      knap.disabled = false;
      knap.textContent = knapTekst;
      return fejl('vf-kontakt-fejl', ok === null ? 'Matchet er udløbet. Gå tilbage og se resultatet igen.' : 'Vi kunne ikke sende dine oplysninger. Tjek din forbindelse, og prøv igen.');
    }
    spor('lead_submitted', { postnr: s.adresse.postnr, maegler_id: s.match.maegler.id }, leadEvent);
    s.sendt = true;
    gem();
    visTak('maeglerlead');
  });

  async function sendVenteliste() {
    const email = $('vf-vl-email').value.trim();
    if (!marker('vf-vl-email', gyldigEmail(email))) return fejl('vf-vl-fejl', 'Skriv en gyldig e-mailadresse, fx navn@mail.dk.');
    if (!$('vf-vl-samtykke').checked) return fejl('vf-vl-fejl', 'Sæt flueben, så vi må skrive til dig.');
    fejl('vf-vl-fejl', '');
    const ok = await send(
      byggePayload('venteliste', {
        kontakt: { email },
        samtykker: [{ formaal: 'venteliste', givet: true, tekst: VENTELISTE_TEKST }],
      }),
    );
    if (!ok) return fejl('vf-vl-fejl', 'Vi kunne ikke sende din tilmelding. Prøv igen.');
    visTak('venteliste');
  }

  function byggePayload(type, ekstra) {
    const nu = new Date().toISOString();
    const e = s.estimat;
    return {
      lead_id: s.lead_id,
      lead_type: type,
      form_version: FORM_VERSION,
      samtykke_version: data.samtykkeVersion,
      klient_tidspunkt: nu,
      adresse: { ...s.adresse },
      bolig: {
        type: s.bolig.type,
        areal: parseInt(s.bolig.areal, 10) || null,
        vaerelser: parseInt(s.bolig.vaerelser, 10) || null,
        byggeaar: parseInt(s.bolig.byggeaar, 10) || null,
        bbr: s.bbr,
        rettet_af_bruger: Boolean(
          s.bbr &&
            (s.bbr.boligtype !== s.bolig.type ||
              Number(s.bbr.areal) !== parseInt(s.bolig.areal, 10) ||
              (s.bbr.vaerelser && Number(s.bbr.vaerelser) !== parseInt(s.bolig.vaerelser, 10)) ||
              (s.bbr.byggeaar && Number(s.bbr.byggeaar) !== parseInt(s.bolig.byggeaar, 10))),
        ),
      },
      stand: s.stand,
      tilvalg: s.tilvalg,
      horisont: s.horisont,
      estimat: e ? { lav: e.lav, middel: e.middel, hoej: e.hoej, praecision: e.praecision, grundlag: e.grundlag, testdata: e.testdata, version: e.version } : null,
      // Restgæld og provenu bliver i browseren. Mægleren skal ikke bruge dem, og de er følsomme.
      match_token: s.match?.token || null,
      event_ids: s.event_ids,
      attribution: hentAttribution(),
      ...metaCookies(),
      side: { url: location.href.split('#')[0], referrer: document.referrer || null },
      cookie_marketing: harMarketing(),
      honning: $('vf-firma').value,
      udfyldningstid_sek: Math.round((Date.now() - startTid) / 1000),
      ...ekstra,
      samtykker: (ekstra.samtykker || []).map((x) => ({ ...x, klient_tidspunkt: nu })),
    };
  }

  /** Sender til /api/lead. Returnerer true, false (fejl) eller null (matchet er udløbet). */
  async function send(payload) {
    if (data.demo) {
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }
    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.status === 422) {
        const j = await r.json().catch(() => ({}));
        if (/udløbet/.test(j.fejl || '')) {
          s.match = null;
          s.matchNoegle = null;
          return null;
        }
      }
      return r.ok;
    } catch {
      return false;
    }
  }

  // ---------- Trin 8: tak ----------
  function visTak(type) {
    let html;
    if (type === 'maeglerlead') {
      const m = s.match.maegler;
      const navn = erTodo(m.navn) ? 'mægleren' : m.navn;
      html = `
        <h2 class="vf-h" tabindex="-1">Tak, ${esc(s.kontakt.fornavn.trim())}.</h2>
        <p class="lead">Tak. Vi ringer eller skriver til dig inden for kort tid for at bekræfte, og derefter kontakter ${esc(navn)} dig.</p>
        <div class="vf-valgt">${foto(m, 72)}<div><p class="mk-navn">${ph(m.navn, '[Mæglerens navn]')}</p><p class="mk-firma">${ph(m.firma, '[Firma]')}</p></div></div>
        <p class="hjaelp">Mægleren får intet, før du har bekræftet. Passer mægleren dig ikke, så sig det, når vi ringer.</p>`;
    } else if (type === 'venteliste') {
      html = `
        <h2 class="vf-h" tabindex="-1">Tak. Du er skrevet op.</h2>
        <p class="lead">Vi giver besked på e-mail, når vi har en partnermægler i dit område. Din adresse er ikke sendt til nogen mægler.</p>`;
    } else {
      html = `
        <h2 class="vf-h" tabindex="-1">Tak. Du er tilmeldt.</h2>
        <p class="lead">Vi sender dig et opdateret estimat af din bolig hver 3. måned. Du kan afmelde dig i hver e-mail.</p>`;
    }
    if (data.demo) html = `<p class="vf-preview">Demo. Intet er sendt. På den rigtige side går henvendelsen til GoHighLevel.</p>${html}`;
    $('vf-tak').innerHTML = html;
    vis('tak');
    $('vf-tak').querySelector('.vf-h').focus({ preventScroll: true });
    try {
      sessionStorage.removeItem(GEM);
    } catch {}
  }

  // ---------- Hjælpere ----------
  function foto(m, str) {
    return m.foto
      ? `<img class="mk-foto" src="${esc(m.foto)}" alt="Portræt af ${esc(m.navn)}" width="${str}" height="${str}" style="width:${str}px;height:${str}px" loading="lazy" decoding="async">`
      : `<div class="mk-foto mk-foto--ph" style="width:${str}px;height:${str}px" role="img" aria-label="Foto mangler">Foto af mægler</div>`;
  }
  function ph(v, erstat) {
    return erTodo(v) ? `<mark class="ph">${esc(erstat)}</mark>` : esc(v);
  }
  function fornavn(navn) {
    if (erTodo(navn)) return 'mægleren';
    return String(navn).trim().split(/\s+/)[0];
  }
  function flueben() {
    return '<svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true"><rect width="22" height="22" rx="6" fill="#1f3d33"></rect><path d="m6.5 11.4 3 3 6-6.6" fill="none" stroke="#e3a54a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }


  // ---------- Opstart ----------
  skrivFelter();
  if (brugHistorik) {
    try {
      history.replaceState({ nv: s.trin }, '');
    } catch {
      brugHistorik = false;
    }
  }
  if (s.trin && s.trin !== 'adresse' && s.adresse) {
    hentBbr();
    vis(s.trin, { push: false });
  }
}
