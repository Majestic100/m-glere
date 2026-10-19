// Modtager en henvendelse fra formularen. Tre typer:
//   maeglerlead  Boligejeren vil have en præcis vurdering fra den matchede mægler. Sendes som lead.
//   nurture      Estimatet tilsendt og/eller Følg din boligværdi. Aldrig et mæglerlead.
//   venteliste   Ingen partnermægler i området endnu. Aldrig et mæglerlead.
//
// For hver henvendelse:
// 1. Validerer og renser data. Mæglerleads kræver et gyldigt, signeret match fra /api/match.
// 2. Gemmer samtykket (ordlyd, tidspunkt, modtagere, IP, user agent) i Netlify Blobs som dokumentation.
// 3. Sender alt til GoHighLevel via webhook. Feltnavnene fra første version er bevaret.
// 4. Sender Lead til Meta Conversions API, kun for mæglerleads og kun med marketing-samtykke.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import {
  normaliserTelefon,
  gyldigEmail,
  samtykkeTekst,
  FOELG_TEKST,
  VENTELISTE_TEKST,
  BOLIGTYPER,
  HORISONTER,
  STAND,
  TILVALG,
  navnFor,
} from '../../src/lib/faelles.js';
import { json, laesMatch, taelKapacitet, logAktivitet } from './_faelles.mjs';
import maeglerData from '../../data/maeglere.json' with { type: 'json' };
import site from '../../data/site.json' with { type: 'json' };

const TYPER = ['maeglerlead', 'nurture', 'venteliste'];
const tekst = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? null : String(v).slice(0, max));
const liste = (v, tilladte) => (Array.isArray(v) ? v.filter((x) => tilladte.some((t) => t.id === x)) : []);

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { fejl: 'Kun POST' });

  let p;
  try {
    p = await req.json();
  } catch {
    return json(400, { fejl: 'Ugyldig JSON' });
  }

  // Simpel spambeskyttelse: skjult felt og urealistisk hurtig udfyldning.
  if (p.honning || (Number(p.udfyldningstid_sek) || 0) < 4) return json(200, { ok: true });

  const type = TYPER.includes(p.lead_type) ? p.lead_type : null;
  if (!type) return json(422, { fejl: 'Ukendt type' });

  const email = tekst(p.kontakt?.email, 200);
  if (!gyldigEmail(email)) return json(422, { fejl: 'Ugyldig e-mail' });
  const fornavn = tekst(p.kontakt?.fornavn, 60) || '';
  const efternavn = tekst(p.kontakt?.efternavn, 80) || '';
  const telefon = normaliserTelefon(p.kontakt?.telefon);

  const modtaget = new Date().toISOString();
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || null;
  const ua = req.headers.get('user-agent') || null;
  const leadId = tekst(p.lead_id, 80) || `lead-${crypto.randomUUID()}`;
  const vist = (formaal) => (p.samtykker || []).find((s) => s.formaal === formaal);
  const samtykker = [];

  // Mæglerlead: kræver et ægte match, fornavn, efternavn, dansk telefon og samtykke til netop den mægler.
  let maegler = null;
  let match = null;
  if (type === 'maeglerlead') {
    if (!fornavn || !efternavn) return json(422, { fejl: 'Navn mangler' });
    if (!telefon) return json(422, { fejl: 'Ugyldigt telefonnummer' });
    match = laesMatch(p.match_token);
    if (!match) return json(422, { fejl: 'Matchet er udløbet. Start forfra.' });
    maegler = maeglerData.maeglere.find((m) => m.id === match.maegler_id && m.aktiv !== false);
    if (!maegler) return json(422, { fejl: 'Mægleren er ikke længere aktiv' });
    if (String(p.adresse?.postnr) !== match.postnr) return json(422, { fejl: 'Adressen passer ikke til matchet' });

    const s = vist('kontakt_maegler_og_bekraeftelse');
    if (!s?.givet) return json(422, { fejl: 'Samtykke mangler' });
    const forventet = samtykkeTekst(maegler);
    samtykker.push({
      formaal: 'kontakt_maegler_og_bekraeftelse',
      givet: true,
      tekst: forventet,
      tekst_vist_i_browser: tekst(s.tekst, 2000),
      tekst_matcher: tekst(s.tekst, 2000) === forventet,
      modtagere: [
        { type: 'maegler', id: maegler.id, navn: maegler.navn, firma: maegler.firma },
        { type: 'nem_vurdering', navn: 'Nem Vurdering (Hero Media ApS)' },
      ],
      kanaler: ['telefon', 'sms', 'email'],
      tidspunkt_server: modtaget,
      tidspunkt_klient: tekst(s.klient_tidspunkt, 40),
    });
  }

  if (type === 'venteliste') {
    const s = vist('venteliste');
    if (!s?.givet) return json(422, { fejl: 'Samtykke mangler' });
    samtykker.push({
      formaal: 'venteliste',
      givet: true,
      tekst: VENTELISTE_TEKST,
      tekst_vist_i_browser: tekst(s.tekst, 2000),
      modtagere: [{ type: 'nem_vurdering', navn: 'Nem Vurdering (Hero Media ApS)' }],
      kanaler: ['email'],
      tidspunkt_server: modtaget,
      tidspunkt_klient: tekst(s.klient_tidspunkt, 40),
    });
  }

  // Følg din boligværdi er altid frivilligt og separat.
  const foelg = vist('foelg_boligvaerdi');
  if (foelg) {
    samtykker.push({
      formaal: 'foelg_boligvaerdi',
      givet: Boolean(foelg.givet),
      tekst: FOELG_TEKST,
      tekst_vist_i_browser: tekst(foelg.tekst, 2000),
      modtagere: [{ type: 'nem_vurdering', navn: 'Nem Vurdering (Hero Media ApS)' }],
      kanaler: ['email'],
      tidspunkt_server: modtaget,
      tidspunkt_klient: tekst(foelg.klient_tidspunkt, 40),
    });
  }
  const foelgGivet = samtykker.some((s) => s.formaal === 'foelg_boligvaerdi' && s.givet);
  if (type === 'nurture' && !foelgGivet && !p.send_estimat) return json(422, { fejl: 'Intet at tilmelde' });

  const tags = ['nem_vurdering'];
  if (type === 'maeglerlead') tags.push('maeglerlead', `maegler-${maegler.id}`, `horisont-${tekst(p.horisont, 20)}`);
  if (type === 'venteliste') tags.push('venteliste_omraade');
  if (p.send_estimat) tags.push('estimat_tilsendt');
  if (foelgGivet) tags.push('nurture_boligvaerdi');
  if (p.horisont === 'nysgerrig') tags.push('nysgerrig');

  const boligtype = BOLIGTYPER.some((b) => b.id === p.bolig?.type) ? p.bolig.type : null;
  const lead = {
    lead_id: leadId,
    event_id: tekst(p.event_ids?.lead_submitted, 80) || leadId,
    lead_type: type,
    modtaget,
    form_version: tekst(p.form_version, 20),
    samtykke_version: site.samtykkeVersion,
    flow: type === 'maeglerlead' ? 'maegler' : 'vurdering',

    // Flade felter, så de er lette at mappe i GoHighLevel.
    first_name: fornavn,
    last_name: efternavn,
    full_name: `${fornavn} ${efternavn}`.trim(),
    email,
    phone: telefon,
    address1: tekst(p.adresse?.tekst, 200),
    postal_code: tekst(p.adresse?.postnr, 4),
    city: tekst(p.adresse?.by, 80),
    country: 'DK',
    tags,

    adresse: {
      tekst: tekst(p.adresse?.tekst, 200),
      adresse_id: tekst(p.adresse?.adresseId, 40),
      husnummer_id: tekst(p.adresse?.husnummerId, 40),
      postnr: tekst(p.adresse?.postnr, 4),
      by: tekst(p.adresse?.by, 80),
      kommunekode: tekst(p.adresse?.kommunekode, 4),
      manuelt_indtastet: Boolean(p.adresse?.manuel),
    },
    bolig: {
      type: boligtype,
      type_navn: navnFor(BOLIGTYPER, boligtype),
      areal_m2: Number(p.bolig?.areal) || null,
      vaerelser: Number(p.bolig?.vaerelser) || null,
      byggeaar: Number(p.bolig?.byggeaar) || null,
      bbr: p.bolig?.bbr || null,
      rettet_af_bruger: Boolean(p.bolig?.rettet_af_bruger),
      stand_indvendig: navnFor(STAND, p.stand?.indvendig) || null,
      stand_udvendig: navnFor(STAND, p.stand?.udvendig) || null,
      tilvalg: liste(p.tilvalg, TILVALG).map((t) => navnFor(TILVALG, t)),
    },
    estimat: p.estimat || null,
    provenu: p.provenu || null,
    tidshorisont: tekst(p.horisont, 20),
    tidshorisont_navn: navnFor(HORISONTER, p.horisont),
    maegler: maegler ? { id: maegler.id, navn: maegler.navn, firma: maegler.firma, by: maegler.by } : null,
    match: match
      ? { match_id: match.match_id, score: match.score, faktorer: match.faktorer, begrundelser: match.begrundelser, vaegte_version: match.version, kandidater: match.kandidater, udstedt: match.udstedt }
      : null,
    samtykker,
    event_ids: p.event_ids || {},
    utm: {
      source: tekst(p.attribution?.utm_source, 300),
      medium: tekst(p.attribution?.utm_medium, 300),
      campaign: tekst(p.attribution?.utm_campaign, 300),
      content: tekst(p.attribution?.utm_content, 300),
      term: tekst(p.attribution?.utm_term, 300),
      id: tekst(p.attribution?.utm_id, 300),
      fbclid: tekst(p.attribution?.fbclid, 300),
      gclid: tekst(p.attribution?.gclid, 300),
      landingsside: tekst(p.attribution?.landingsside, 300),
    },
    fbc: tekst(p.fbc, 300) || cookie(req, '_fbc') || null,
    fbp: tekst(p.fbp, 300) || cookie(req, '_fbp') || null,
    side_url: tekst(p.side?.url, 500),
    referrer: tekst(p.side?.referrer, 500),
    ip,
    user_agent: ua,
  };

  // 1. Dokumentation af samtykke. Fejler dette, afvises henvendelsen, så der aldrig sendes data uden dokumentation.
  try {
    const store = getStore({ name: 'samtykker', consistency: 'strong' });
    await store.setJSON(`${modtaget.slice(0, 10)}/${leadId}.json`, {
      lead_id: leadId,
      lead_type: type,
      modtaget,
      navn: lead.full_name,
      email,
      telefon,
      adresse: lead.adresse.tekst,
      samtykker,
      samtykke_version: site.samtykkeVersion,
      ip,
      user_agent: ua,
      side_url: lead.side_url,
      utm: lead.utm,
    });
  } catch (err) {
    console.error('Kunne ikke gemme samtykke', err);
    if (process.env.KRAEV_SAMTYKKELOG !== 'nej') return json(500, { fejl: 'Kunne ikke gemme samtykke' });
  }

  // 2. GoHighLevel
  const ghl = process.env.GHL_WEBHOOK_URL;
  if (!ghl) {
    console.error('GHL_WEBHOOK_URL mangler');
    return json(500, { fejl: 'Ikke konfigureret' });
  }
  const svar = await fetch(ghl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) }).catch((err) => ({ ok: false, status: 0, err }));
  if (!svar.ok) {
    console.error('GoHighLevel afviste henvendelsen', svar.status, svar.err);
    return json(502, { fejl: 'Kunne ikke sende henvendelsen' });
  }

  // 3. Kapacitet og aktivitet. Fejl her må ikke stoppe henvendelsen.
  if (maegler) await taelKapacitet(maegler.id).catch((err) => console.error('Kapacitet', err));
  if (type === 'maeglerlead' || lead.estimat) await logAktivitet(lead.adresse.by?.replace(/\s+[A-ZÆØÅ]{1,2}$/, ''));

  // 4. Meta Conversions API. Kun mæglerleads og kun med marketing-samtykke.
  if (type === 'maeglerlead' && p.cookie_marketing === true && process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN) {
    try {
      await sendCapi({ lead });
    } catch (err) {
      console.error('CAPI fejlede', err);
    }
  }

  return json(200, { ok: true, lead_id: leadId });
};

const sha = (v) => (v ? createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined);

function cookie(req, navn) {
  const m = new RegExp(`(?:^|;\\s*)${navn}=([^;]+)`).exec(req.headers.get('cookie') || '');
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function sendCapi({ lead }) {
  const fbc = lead.fbc || (lead.utm.fbclid ? `fb.1.${Date.now()}.${lead.utm.fbclid}` : undefined);
  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id,
        action_source: 'website',
        event_source_url: lead.side_url,
        user_data: {
          em: [sha(lead.email)],
          ph: lead.phone ? [sha(lead.phone.replace('+', ''))] : undefined,
          fn: lead.first_name ? [sha(lead.first_name)] : undefined,
          ln: lead.last_name ? [sha(lead.last_name)] : undefined,
          zp: lead.postal_code ? [sha(lead.postal_code)] : undefined,
          country: [sha('dk')],
          external_id: [sha(lead.lead_id)],
          client_ip_address: lead.ip || undefined,
          client_user_agent: lead.user_agent || undefined,
          fbp: lead.fbp || undefined,
          fbc,
        },
        custom_data: { content_name: lead.lead_type, content_category: lead.bolig.type },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };
  const url = `https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_CAPI_TOKEN}`;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) console.error('CAPI svarede', r.status, await r.text());
}
