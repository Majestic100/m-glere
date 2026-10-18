// Formularen i trin. Ren JavaScript uden framework for at holde siden let på mobil.
import {
  FORM_VERSION,
  BOLIGTYPER,
  TIDSHORISONTER,
  PRIORITETER,
  TIDSPUNKTER,
  beregnEstimat,
  beregnProvenu,
  parseBeloeb,
  maeglereForPostnr,
  postnrFraTitel,
  samtykkeTekst,
  KVARTAL_TEKST,
  KVARTAL_TEKST_NYSGERRIG,
  normaliserTelefon,
  gyldigEmail,
  opkaldsTekst,
  navnFor,
  kr,
} from '../lib/vurdo.js';
import { spor, nytEventId } from './tracking.js';
import { hentAttribution } from './attribution.js';
import { harMarketing } from './samtykke.js';
import { initVideoer } from './video.js';

const rod = document.getElementById('vurdering');
if (rod) start(rod);

function start(rod) {
  const data = JSON.parse(document.getElementById('vf-data').textContent);
  const form = rod.querySelector('#vf-form');
  const $ = (id) => rod.querySelector(`#${id}`);
  const skaerme = [...rod.querySelectorAll('.vf-skaerm')];
  const PREVIEW = Boolean(window.VURDO_PREVIEW);
  const startTid = Date.now();
  // Browserens tilbage-knap går et trin tilbage i formularen. Slås fra i preview, der kører i en iframe.
  let brugHistorik = !PREVIEW;

  const tilstand = {
    adresse: null, // { tekst, adresseId, husnummerId, postnr, by, manuel }
    bbr: null, // { boligtype, areal, kilde }
    bbrPromise: null,
    estimat: null,
    maeglere: [],
    maegler: null,
    flow: 'maegler', // 'maegler' | 'vurdering'
    flowGrund: null, // 'nysgerrig' | 'ingen-maegler'
    historik: ['adresse'],
    viewContentSendt: false,
    sendt: false,
  };

  // ---------- Navigation ----------

  function trinListe() {
    // Provenu tælles altid med, så trinantallet ikke skifter undervejs. Springes det over, hopper tælleren et trin.
    const t = ['adresse', 'bolig', 'estimat', 'provenu', 'tid'];
    if (tilstand.flow === 'vurdering') t.push('tilbud', 'kontakt', 'samtykke');
    else t.push('prio', 'maegler', 'kontakt', 'samtykke');
    return t;
  }

  function nuvaerende() {
    return tilstand.historik[tilstand.historik.length - 1];
  }

  function vis(navn, { push = true } = {}) {
    for (const s of skaerme) s.hidden = s.dataset.skaerm !== navn;
    if (push && nuvaerende() !== navn) {
      tilstand.historik.push(navn);
      if (brugHistorik) {
        try {
          history.pushState({ vurdo: navn }, '');
        } catch {
          brugHistorik = false;
        }
      }
    }
    opdaterStatus(navn);
    const skaerm = rod.querySelector(`[data-skaerm="${navn}"]`);
    const h = skaerm.querySelector('.vf-h');
    if (navn !== 'adresse' && h) {
      h.focus({ preventScroll: true });
      const top = rod.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.4) rod.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (navn === 'bolig') forberedBolig();
    if (navn === 'estimat') visEstimat();
    if (navn === 'provenu') opdaterProvenu();
    if (navn === 'maegler') visMaeglere();
    if (navn === 'kontakt') forberedKontakt();
    if (navn === 'samtykke') forberedSamtykke();
  }

  function opdaterStatus(navn) {
    const top = $('vf-top');
    const status = $('vf-status');
    const trin = trinListe();
    const i = trin.indexOf(navn);
    const iGang = navn !== 'adresse' && navn !== 'tak';
    top.hidden = !iGang;
    status.hidden = navn === 'adresse';
    const pct = navn === 'tak' ? 100 : Math.round(((Math.max(i, 0) + 1) / (trin.length + 1)) * 100);
    $('vf-status-fyld').style.width = `${pct}%`;
    status.setAttribute('aria-valuenow', String(pct));
    $('vf-trin').textContent = i >= 0 ? `Trin ${i + 1} af ${trin.length}` : '';
  }

  function tilbage() {
    if (tilstand.historik.length <= 1) return;
    tilstand.historik.pop();
    vis(nuvaerende(), { push: false });
  }

  $('vf-tilbage').addEventListener('click', () => (brugHistorik ? history.back() : tilbage()));
  window.addEventListener('popstate', () => {
    if (!brugHistorik || tilstand.sendt) return;
    if (tilstand.historik.length > 1) tilbage();
  });

  function naeste(fra) {
    const trin = trinListe();
    let ud = trin[trin.indexOf(fra) + 1];
    if (ud === 'provenu' && !tilstand.visProvenu) ud = 'tid';
    if (ud) vis(ud);
  }

  form.addEventListener('click', (e) => {
    const knap = e.target.closest('button');
    if (!knap || !rod.contains(knap)) return;
    if (knap.hasAttribute('data-naeste')) {
      e.preventDefault();
      const navn = knap.closest('.vf-skaerm').dataset.skaerm;
      if (navn === 'estimat') tilstand.visProvenu = true;
      if (valider(navn)) naeste(navn);
    } else if (knap.dataset.spring) {
      e.preventDefault();
      tilstand.visProvenu = false;
      vis(knap.dataset.spring);
    } else if (knap.hasAttribute('data-afslut')) {
      e.preventDefault();
      visAfslutUdenData();
    }
  });

  // Enter i et felt går videre i stedet for at sende formularen.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.id === 'vf-adresse' || e.target.tagName === 'TEXTAREA') return;
    const skaerm = e.target.closest('.vf-skaerm');
    if (!skaerm || skaerm.dataset.skaerm === 'samtykke') return;
    e.preventDefault();
    skaerm.querySelector('[data-naeste]')?.click();
  });

  // Enkeltvalg går automatisk videre efter et kort øjeblik.
  form.addEventListener('change', (e) => {
    if (e.target.matches('input[data-auto]')) {
      const navn = e.target.closest('.vf-skaerm').dataset.skaerm;
      setTimeout(() => {
        if (nuvaerende() === navn && valider(navn)) naeste(navn);
      }, 250);
    }
  });

  // ---------- Validering ----------

  function fejl(id, tekst) {
    const el = $(id);
    el.textContent = tekst || '';
    el.hidden = !tekst;
    return !tekst;
  }

  function valider(navn) {
    if (navn === 'adresse') return validerAdresse();
    if (navn === 'bolig') {
      const type = form.boligtype.value;
      const areal = parseInt($('vf-areal').value, 10);
      if (!type) return fejl('vf-bolig-fejl', 'Vælg din boligtype.');
      if (!areal || areal < 10 || areal > 2000) return fejl('vf-bolig-fejl', 'Skriv boligens areal i hele kvadratmeter, fx 120.');
      return fejl('vf-bolig-fejl', '');
    }
    if (navn === 'tid') {
      const v = form.tidshorisont.value;
      if (!v) return false;
      saetFlow();
      return true;
    }
    if (navn === 'maegler') return Boolean(tilstand.maegler) || fejl('vf-maegler-fejl', 'Vælg den mægler, du gerne vil kontaktes af.');
    if (navn === 'kontakt') return validerKontakt();
    return true;
  }

  function validerAdresse() {
    const manuel = !$('vf-manuel').hidden;
    if (manuel) {
      const vej = $('vf-vej').value.trim();
      const postnr = $('vf-postnr').value.trim();
      if (vej.length < 3) return fejl('vf-adresse-fejl', 'Skriv vejnavn og husnummer.');
      if (!/^\d{4}$/.test(postnr)) return fejl('vf-adresse-fejl', 'Skriv et postnummer med fire cifre.');
      tilstand.adresse = { tekst: `${vej}, ${postnr}`, adresseId: null, husnummerId: null, postnr, by: '', manuel: true };
      hentBbr();
      return fejl('vf-adresse-fejl', '');
    }
    if (!tilstand.adresse) return fejl('vf-adresse-fejl', 'Vælg din adresse på listen. Kan du ikke finde den, så tryk på linket herunder.');
    if (!$('vf-enhed-felt').hidden && !$('vf-enhed').value) return fejl('vf-adresse-fejl', 'Vælg etage og dør.');
    return fejl('vf-adresse-fejl', '');
  }

  function validerKontakt() {
    const navn = $('vf-navn').value.trim();
    const tlf = $('vf-tlf').value.trim();
    const email = $('vf-email').value.trim();
    const tlfKraeves = tilstand.flow === 'maegler';
    markerFelt('vf-navn', navn.length >= 2);
    markerFelt('vf-tlf', tlfKraeves ? Boolean(normaliserTelefon(tlf)) : !tlf || Boolean(normaliserTelefon(tlf)));
    markerFelt('vf-email', gyldigEmail(email));
    if (navn.length < 2) return fejl('vf-kontakt-fejl', 'Skriv dit navn.');
    if (tlfKraeves && !normaliserTelefon(tlf)) return fejl('vf-kontakt-fejl', 'Skriv et dansk telefonnummer med 8 cifre.');
    if (!tlfKraeves && tlf && !normaliserTelefon(tlf)) return fejl('vf-kontakt-fejl', 'Telefonnummeret skal have 8 cifre. Du kan også lade feltet stå tomt.');
    if (!gyldigEmail(email)) return fejl('vf-kontakt-fejl', 'Skriv en gyldig e-mailadresse, fx navn@mail.dk.');
    return fejl('vf-kontakt-fejl', '');
  }

  function markerFelt(id, ok) {
    $(id).setAttribute('aria-invalid', ok ? 'false' : 'true');
  }

  // ---------- Trin 1: adresse ----------

  const input = $('vf-adresse');
  const liste = $('vf-forslag');
  let forslag = [];
  let aktiv = -1;
  let timer = null;
  let sidsteSoegning = 0;

  async function soeg(tekst) {
    const url = `https://adressevaelger.dk/adresser/soeg?tekst=${encodeURIComponent(tekst.slice(0, 73))}&token=${encodeURIComponent(data.adressevaelgerToken)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return Array.isArray(j) ? j : j.fund || [];
    } finally {
      clearTimeout(t);
    }
  }

  input.addEventListener('input', () => {
    tilstand.adresse = null;
    $('vf-enhed-felt').hidden = true;
    clearTimeout(timer);
    const tekst = input.value.trim();
    if (tekst.length < 3) return lukListe();
    timer = setTimeout(async () => {
      const nr = ++sidsteSoegning;
      try {
        const fund = await soeg(tekst);
        if (nr !== sidsteSoegning) return;
        forslag = fund.filter((f) => f.type === 'adresse' || f.type === 'husnummer').slice(0, 6);
        visListe();
      } catch {
        aabnManuel('Adressesøgningen svarer ikke lige nu. Skriv din adresse her i stedet.');
      }
    }, 180);
  });

  function visListe() {
    aktiv = -1;
    liste.innerHTML = forslag
      .map((f, i) => `<li role="option" id="vf-f-${i}" aria-selected="false" data-i="${i}">${esc(f.titel)}</li>`)
      .join('');
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
      tilstand.adresse = { tekst: f.titel, adresseId: f.id, husnummerId: f.husnummerId || null, ...pn, manuel: false };
      hentBbr();
      return;
    }
    // Husnummer: find de enkelte boliger (etage og dør) på adressen.
    tilstand.adresse = { tekst: f.titel, adresseId: null, husnummerId: f.id, ...pn, manuel: false };
    try {
      const enheder = (await soeg(f.titel)).filter((x) => x.type === 'adresse' && x.husnummerId === f.id);
      if (enheder.length === 1) {
        tilstand.adresse.adresseId = enheder[0].id;
        tilstand.adresse.tekst = enheder[0].titel;
      } else if (enheder.length > 1) {
        const sel = $('vf-enhed');
        sel.innerHTML =
          '<option value="">Vælg</option>' +
          enheder.map((x) => `<option value="${esc(x.id)}">${esc(x.titel.replace(/,\s*\d{4}\s.*$/, ''))}</option>`).join('');
        sel.dataset.titler = JSON.stringify(Object.fromEntries(enheder.map((x) => [x.id, x.titel])));
        $('vf-enhed-felt').hidden = false;
        sel.focus();
        return;
      }
    } catch {}
    hentBbr();
  }

  $('vf-enhed').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id || !tilstand.adresse) return;
    const titler = JSON.parse(e.target.dataset.titler || '{}');
    tilstand.adresse.adresseId = id;
    tilstand.adresse.tekst = titler[id] || tilstand.adresse.tekst;
    hentBbr();
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

  // ---------- Trin 1b: BBR ----------

  function hentBbr() {
    tilstand.bbr = null;
    const a = tilstand.adresse;
    if (!a || (!a.adresseId && !a.husnummerId)) {
      tilstand.bbrPromise = Promise.resolve(null);
      return;
    }
    const q = new URLSearchParams();
    if (a.adresseId) q.set('adresseId', a.adresseId);
    if (a.husnummerId) q.set('husnummerId', a.husnummerId);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    tilstand.bbrPromise = fetch(`/api/bbr?${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (tilstand.bbr = j && (j.boligtype || j.areal) ? j : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
  }

  async function forberedBolig() {
    const note = $('vf-bbr-note');
    note.textContent = 'Vi henter oplysninger om din bolig.';
    const bbr = await tilstand.bbrPromise;
    if (bbr) {
      if (bbr.boligtype && !form.boligtype.value) {
        const r = form.querySelector(`input[name="boligtype"][value="${bbr.boligtype}"]`);
        if (r) r.checked = true;
      }
      if (bbr.areal && !$('vf-areal').value) $('vf-areal').value = String(bbr.areal);
      note.textContent = 'Ret gerne, hvis det ikke passer.';
    } else {
      note.textContent = 'Udfyld boligtype og areal.';
    }
  }

  // ---------- Trin 2: estimat ----------

  function visEstimat() {
    const a = tilstand.adresse;
    const boligtype = form.boligtype.value;
    const areal = parseInt($('vf-areal').value, 10);
    const e = beregnEstimat({
      kvmpriser: data.kvmpriser,
      postnr: a?.postnr,
      boligtype,
      areal,
      spaend: data.estimat.spaend,
      afrund: data.estimat.afrund,
    });
    tilstand.estimat = e;
    $('vf-estimat-ok').hidden = !e;
    $('vf-estimat-mangler').hidden = Boolean(e);
    $('vf-til-provenu').hidden = !e;
    $('vf-spring-provenu').textContent = e ? 'Spring over' : 'Videre';
    $('vf-spring-provenu').className = e ? 'knap knap--link' : 'knap knap--fuld';
    if (e) {
      $('vf-estimat-adresse').textContent = a.tekst;
      $('vf-interval').textContent = `${kr(e.lav).replace(' kr.', '')} til ${kr(e.hoej)}`;
      $('vf-testdata').hidden = !e.testdata;
      if (!tilstand.viewContentSendt) {
        tilstand.viewContentSendt = true;
        tilstand.viewContentId = nytEventId('vc');
        spor('ViewContent', { content_name: 'Estimat vist', content_category: boligtype }, tilstand.viewContentId);
      }
    } else {
      $('vf-estimat-mangler-tekst').textContent =
        boligtype === 'andelsbolig'
          ? 'Prisen på en andelsbolig fastsættes efter andelsforeningens regler. En mægler eller din bestyrelse kan hjælpe dig.'
          : 'Vi kan ikke give et estimat på din bolig lige nu. En lokal mægler kan give dig en gratis vurdering.';
    }
  }

  // ---------- Trin 3: provenu ----------

  let provenuStartet = false;
  function opdaterProvenu() {
    if (!provenuStartet) {
      provenuStartet = true;
      if (tilstand.estimat) $('vf-pris').value = formatTal(tilstand.estimat.midt);
      const std = data.beregner?.standardOmkostninger;
      if (std) $('vf-omk').value = formatTal(std);
      $('vf-omk-ph').hidden = !data.beregner?.pladsholder;
    }
    beregn();
  }
  function beregn() {
    const v = beregnProvenu({
      salgspris: parseBeloeb($('vf-pris').value),
      restgaeld: parseBeloeb($('vf-gaeld').value),
      omkostninger: parseBeloeb($('vf-omk').value),
    });
    $('vf-provenu').textContent = kr(v);
  }
  ['vf-pris', 'vf-gaeld', 'vf-omk'].forEach((id) => $(id).addEventListener('input', beregn));
  ['vf-pris', 'vf-gaeld', 'vf-omk'].forEach((id) =>
    $(id).addEventListener('blur', (e) => {
      const n = parseBeloeb(e.target.value);
      if (n !== null) e.target.value = formatTal(n);
    }),
  );

  // ---------- Trin 4: flow ----------

  function saetFlow() {
    const nysgerrig = form.tidshorisont.value === 'nysgerrig';
    tilstand.maeglere = maeglereForPostnr(data.maeglere, tilstand.adresse?.postnr, 3);
    const ingen = tilstand.maeglere.length === 0;
    tilstand.flow = nysgerrig || ingen ? 'vurdering' : 'maegler';
    tilstand.flowGrund = nysgerrig ? 'nysgerrig' : ingen ? 'ingen-maegler' : null;
    if (tilstand.flow === 'vurdering') tilstand.maegler = null;
    if (tilstand.flowGrund === 'ingen-maegler') {
      $('vf-tilbud-titel').textContent = 'Vi har ingen partnermægler i dit område endnu';
      $('vf-tilbud-tekst').textContent =
        'Vi vil hellere sige det, end sende dig videre til en mægler, der ikke kender dit område. Du kan i stedet få en opdateret vurdering af din bolig hver 3. måned. Det er gratis.';
    } else {
      $('vf-tilbud-titel').textContent = 'Vil du følge med i, hvad din bolig er værd?';
      $('vf-tilbud-tekst').textContent =
        'Vi kan sende dig en opdateret vurdering hver 3. måned. Det er gratis, og ingen mægler ringer til dig.';
    }
  }

  // ---------- Trin 6: mæglere ----------

  function visMaeglere() {
    const pn = tilstand.adresse?.postnr;
    $('vf-maegler-note').textContent = `Her er de partnermæglere, der dækker ${pn}${tilstand.adresse?.by ? ' ' + tilstand.adresse.by : ''}. Kun den, du vælger, får dine oplysninger.`;
    const boks = $('vf-maeglere');
    boks.innerHTML = tilstand.maeglere.map(maeglerKortHtml).join('');
    initVideoer(boks);
  }

  $('vf-maeglere').addEventListener('click', (e) => {
    const knap = e.target.closest('[data-vaelg]');
    if (!knap) return;
    tilstand.maegler = tilstand.maeglere.find((m) => m.id === knap.dataset.vaelg) || null;
    rod.querySelectorAll('.mk').forEach((k) => {
      const valgt = k.dataset.id === tilstand.maegler?.id;
      k.classList.toggle('mk--valgt', valgt);
      k.querySelector('[data-vaelg]').setAttribute('aria-checked', String(valgt));
    });
    fejl('vf-maegler-fejl', '');
    setTimeout(() => naeste('maegler'), 300);
  });

  // ---------- Trin 7 og 8: kontakt og samtykke ----------

  function forberedKontakt() {
    const m = tilstand.flow === 'maegler';
    $('vf-kontakt-titel').textContent = m ? 'Hvordan får vi fat i dig?' : 'Hvor skal vi sende vurderingen hen?';
    $('vf-tlf-valgfri').hidden = m;
    $('vf-tidspunkt-felt').hidden = !m;
  }

  function forberedSamtykke() {
    const m = tilstand.maegler;
    const s1 = $('vf-samtykke-1');
    const s2 = $('vf-samtykke-2');
    s1.checked = false;
    if (tilstand.flow === 'maegler' && m) {
      $('vf-samtykke-titel').textContent = 'Sidste trin';
      $('vf-valgt').innerHTML = `${fotoHtml(m, 56)}<div><p class="mk-navn">${esc(m.navn)}</p><p class="mk-butik">${esc(m.butik)}</p></div>`;
      $('vf-valgt').hidden = false;
      $('vf-samtykke-1-tekst').textContent = samtykkeTekst(m);
      $('vf-samtykke-2-felt').hidden = false;
      $('vf-samtykke-2-tekst').textContent = KVARTAL_TEKST;
      $('vf-send').textContent = `Send til ${fornavn(m.navn)}`;
    } else {
      $('vf-samtykke-titel').textContent = 'Bekræft din tilmelding';
      $('vf-valgt').hidden = true;
      $('vf-samtykke-1-tekst').textContent = KVARTAL_TEKST_NYSGERRIG;
      $('vf-samtykke-2-felt').hidden = true;
      s2.checked = false;
      $('vf-send').textContent = 'Tilmeld mig';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (nuvaerende() !== 'samtykke' || tilstand.sendt) return;
    const s1 = $('vf-samtykke-1');
    if (!s1.checked) {
      return fejl(
        'vf-samtykke-fejl',
        tilstand.flow === 'maegler'
          ? 'Sæt flueben, så vi må sende dine oplysninger til den mægler, du har valgt.'
          : 'Sæt flueben, så vi må sende dig vurderingen.',
      );
    }
    fejl('vf-samtykke-fejl', '');
    const knap = $('vf-send');
    const knapTekst = knap.textContent;
    knap.disabled = true;
    knap.textContent = 'Sender...';

    const payload = byggePayload();
    try {
      if (PREVIEW) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const r = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      tilstand.sendt = true;
      spor('Lead', { content_name: payload.flow, content_category: payload.bolig.type }, payload.event_id);
      visTak(payload);
    } catch {
      knap.disabled = false;
      knap.textContent = knapTekst;
      fejl('vf-samtykke-fejl', 'Vi kunne ikke sende dine oplysninger. Tjek din forbindelse, og prøv igen.');
    }
  });

  function byggePayload() {
    const m = tilstand.maegler;
    const nu = new Date().toISOString();
    const leadId = nytEventId('lead');
    const s1Tekst = $('vf-samtykke-1-tekst').textContent;
    const s2Synlig = !$('vf-samtykke-2-felt').hidden;
    const prio = [...form.querySelectorAll('input[name="prioriteter"]:checked')].map((x) => x.value);
    const tlf = $('vf-tlf').value.trim();
    return {
      lead_id: leadId,
      event_id: leadId,
      form_version: FORM_VERSION,
      samtykke_version: data.samtykkeVersion,
      klient_tidspunkt: nu,
      flow: tilstand.flow,
      flow_grund: tilstand.flowGrund,
      adresse: { ...tilstand.adresse },
      bolig: {
        type: form.boligtype.value,
        type_navn: navnFor(BOLIGTYPER, form.boligtype.value),
        areal: parseInt($('vf-areal').value, 10) || null,
        bbr: tilstand.bbr,
        rettet_af_bruger: Boolean(
          tilstand.bbr && (tilstand.bbr.boligtype !== form.boligtype.value || Number(tilstand.bbr.areal) !== parseInt($('vf-areal').value, 10)),
        ),
      },
      estimat: tilstand.estimat
        ? { lav: tilstand.estimat.lav, hoej: tilstand.estimat.hoej, kvmpris: tilstand.estimat.kvmpris, testdata: tilstand.estimat.testdata }
        : null,
      provenu: tilstand.visProvenu
        ? {
            salgspris: parseBeloeb($('vf-pris').value),
            restgaeld: parseBeloeb($('vf-gaeld').value),
            omkostninger: parseBeloeb($('vf-omk').value),
          }
        : null,
      tidshorisont: form.tidshorisont.value,
      tidshorisont_navn: navnFor(TIDSHORISONTER, form.tidshorisont.value),
      prioriteter: tilstand.flow === 'maegler' ? prio : [],
      prioriteter_navne: tilstand.flow === 'maegler' ? prio.map((p) => navnFor(PRIORITETER, p)) : [],
      maegler: m ? { id: m.id, navn: m.navn, butik: m.butik } : null,
      kontakt: {
        navn: $('vf-navn').value.trim(),
        telefon: normaliserTelefon(tlf) || (tlf ? tlf : null),
        email: $('vf-email').value.trim(),
        bedste_tidspunkt: tilstand.flow === 'maegler' ? form.tidspunkt.value : null,
        bedste_tidspunkt_navn: tilstand.flow === 'maegler' ? navnFor(TIDSPUNKTER, form.tidspunkt.value) : null,
      },
      samtykker: [
        {
          formaal: tilstand.flow === 'maegler' ? 'kontakt_maegler_og_vurdo' : 'kvartalsvurdering',
          givet: $('vf-samtykke-1').checked,
          tekst: s1Tekst,
          modtagere: m ? [`${m.navn}, ${m.butik}`, 'Vurdo (Hero Media ApS)'] : ['Vurdo (Hero Media ApS)'],
          kanaler: tilstand.flow === 'maegler' ? ['telefon', 'sms', 'email'] : ['email'],
          klient_tidspunkt: nu,
        },
        ...(s2Synlig
          ? [
              {
                formaal: 'kvartalsvurdering',
                givet: $('vf-samtykke-2').checked,
                tekst: KVARTAL_TEKST,
                modtagere: ['Vurdo (Hero Media ApS)'],
                kanaler: ['email'],
                klient_tidspunkt: nu,
              },
            ]
          : []),
      ],
      attribution: hentAttribution(),
      side: { url: location.href.split('#')[0], referrer: document.referrer || null },
      cookie_marketing: harMarketing(),
      view_content_event_id: tilstand.viewContentId || null,
      honning: $('vf-firma').value,
      udfyldningstid_sek: Math.round((Date.now() - startTid) / 1000),
    };
  }

  function visTak(p) {
    const m = tilstand.maegler;
    const navn = esc(fornavn(p.kontakt.navn));
    let html;
    if (p.flow === 'maegler' && m) {
      const opkald = opkaldsTekst(new Date(), data.aabningstider);
      html = `
        <h2 class="vf-h" tabindex="-1">Tak, ${navn}.</h2>
        <p class="lead">${esc(opkald)}, og derefter kontakter ${esc(m.navn)} dig.</p>
        <div class="vf-valgt">${fotoHtml(m, 72)}<div><p class="mk-navn">${esc(m.navn)}</p><p class="mk-butik">${esc(m.butik)}</p></div></div>
        <p class="hjaelp">Gem gerne billedet i hukommelsen, så du kan genkende, hvem der ringer.</p>
        <h3>Det sker nu</h3>
        <ol>
          <li><p>Vi ringer kort for at bekræfte dine oplysninger og høre, om du har spørgsmål.</p></li>
          <li><p>${esc(stort(fornavn(m.navn)))} ringer dig op og aftaler en tid til en gratis salgsvurdering hjemme hos dig.</p></li>
          <li><p>Du beslutter selv, om du vil gå videre. Der er ingen binding, og du kan altid sige nej tak.</p></li>
        </ol>`;
    } else {
      html = `
        <h2 class="vf-h" tabindex="-1">Tak, ${navn}.</h2>
        <p class="lead">Du er tilmeldt. Vi sender en opdateret vurdering af din bolig hver 3. måned.</p>
        <h3>Det sker nu</h3>
        <ol>
          <li><p>Du får en e-mail med en bekræftelse lige om lidt.</p></li>
          <li><p>Om 3 måneder sender vi dig en ny vurdering af ${esc(p.adresse.tekst)}.</p></li>
          <li><p>Ingen mægler ringer til dig. Du kan afmelde dig med ét klik i hver e-mail.</p></li>
        </ol>`;
    }
    if (PREVIEW) html = `<p class="vf-preview">Preview: Intet er sendt. På den rigtige side går henvendelsen til GoHighLevel.</p>${html}`;
    $('vf-tak').innerHTML = html;
    vis('tak');
    $('vf-tak').querySelector('.vf-h').focus({ preventScroll: true });
  }

  function visAfslutUdenData() {
    $('vf-tak').innerHTML = `
      <h2 class="vf-h" tabindex="-1">Det er helt i orden.</h2>
      <p class="lead">Vi har ikke gemt noget om dig. Du er velkommen tilbage, når du vil se tallet igen.</p>
      <a class="knap knap--sekundaer" href="/saadan-virker-det">Læs hvordan Vurdo virker</a>`;
    vis('tak');
  }

  // ---------- Hjælpere ----------

  function maeglerKortHtml(m) {
    const bed = m.bedoemmelse !== null && m.bedoemmelse !== undefined ? `${String(m.bedoemmelse).replace('.', ',')} af 5` : null;
    const ph = (v) => (String(v || '').trim().startsWith('[') ? `<mark class="ph">${esc(v)}</mark>` : esc(v));
    const video = m.video
      ? `<button type="button" class="mk-video" data-video="${esc(m.video)}"${m.videoPoster ? ` style="background-image:url('${esc(m.videoPoster)}')"` : ''}><span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"></path></svg>Se video med ${esc(m.navn)}</span></button>`
      : `<div class="mk-video mk-video--ph">[PLADSHOLDER: kort video, 30 til 60 sek.]</div>`;
    return `
      <article class="mk" data-id="${esc(m.id)}">
        <div class="mk-hoved">${fotoHtml(m, 72)}<div>
          <h3 class="mk-navn">${ph(m.navn)}</h3>
          <p class="mk-titel">${esc(m.titel)}</p>
          <p class="mk-butik">${ph(m.butik)}</p>
        </div></div>
        ${video}
        <dl class="mk-tal">
          <div><dt>Solgte i området</dt><dd>${m.solgte ?? '<mark class="ph">[tal]</mark>'}<span class="mk-kilde">${esc(m.solgtePeriode || '')}, ${ph(m.solgteKilde)}</span></dd></div>
          <div><dt>Bedømmelse</dt><dd>${bed ?? '<mark class="ph">[tal]</mark>'}<span class="mk-kilde">${m.bedoemmelseAntal ? `${m.bedoemmelseAntal} anmeldelser, ` : ''}${ph(m.bedoemmelseKilde)}</span></dd></div>
        </dl>
        <p class="mk-beskrivelse">${ph(m.beskrivelse)}</p>
        <button type="button" class="knap knap--fuld" role="radio" aria-checked="false" data-vaelg="${esc(m.id)}">Vælg ${esc(fornavn(m.navn))}</button>
      </article>`;
  }

  function fotoHtml(m, str) {
    return m.billede
      ? `<img class="mk-foto" src="${esc(m.billede)}" alt="Portræt af ${esc(m.navn)}" width="${str}" height="${str}" style="width:${str}px;height:${str}px" loading="lazy" decoding="async">`
      : `<div class="mk-foto mk-foto--ph" style="width:${str}px;height:${str}px" role="img" aria-label="Billede mangler">Foto af mægler</div>`;
  }

  function fornavn(navn) {
    const n = String(navn || '').trim();
    if (n.startsWith('[')) return 'mægleren';
    return n.split(/\s+/)[0];
  }

  function stort(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatTal(n) {
    return new Intl.NumberFormat('da-DK').format(n);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  if (brugHistorik) {
    try {
      history.replaceState({ vurdo: 'adresse' }, '');
    } catch {
      brugHistorik = false;
    }
  }
}
