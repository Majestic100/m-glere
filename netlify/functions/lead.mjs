// Modtager en henvendelse fra formularen.
// 1. Validerer og renser data.
// 2. Gemmer samtykket (ordlyd, tidspunkt, modtagere) i Netlify Blobs som dokumentation.
// 3. Sender alt til GoHighLevel via webhook.
// 4. Sender Lead til Meta Conversions API, hvis brugeren har sagt ja til marketing-cookies.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { normaliserTelefon, gyldigEmail, samtykkeTekst, KVARTAL_TEKST, KVARTAL_TEKST_NYSGERRIG } from '../../src/lib/vurdo.js';
import maeglerData from '../../src/data/maeglere.json' with { type: 'json' };

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const tekst = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? null : String(v).slice(0, max));

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { fejl: 'Kun POST' });

  let p;
  try {
    p = await req.json();
  } catch {
    return json(400, { fejl: 'Ugyldig JSON' });
  }

  // Simpel spambeskyttelse: skjult felt og urealistisk hurtig udfyldning.
  if (p.honning || (Number(p.udfyldningstid_sek) || 0) < 4) {
    return json(200, { ok: true });
  }

  const flow = p.flow === 'vurdering' ? 'vurdering' : 'maegler';
  const navn = tekst(p.kontakt?.navn, 120);
  const email = tekst(p.kontakt?.email, 200);
  const telefon = normaliserTelefon(p.kontakt?.telefon);
  if (!navn || navn.length < 2) return json(422, { fejl: 'Navn mangler' });
  if (!gyldigEmail(email)) return json(422, { fejl: 'Ugyldig e-mail' });
  if (flow === 'maegler' && !telefon) return json(422, { fejl: 'Ugyldigt telefonnummer' });

  // Mægleren slås op på serveren, så navn og butik i samtykket ikke kan manipuleres fra browseren.
  let maegler = null;
  if (flow === 'maegler') {
    maegler = maeglerData.maeglere.find((m) => m.id === p.maegler?.id && m.aktiv !== false);
    if (!maegler) return json(422, { fejl: 'Ukendt mægler' });
    if (!maegler.postnumre.includes(String(p.adresse?.postnr))) return json(422, { fejl: 'Mægleren dækker ikke postnummeret' });
  }

  // Samtykke: serveren genskaber den tekst, der skulle være vist, og sammenligner med den viste.
  const forventet1 = flow === 'maegler' ? samtykkeTekst(maegler) : KVARTAL_TEKST_NYSGERRIG;
  const s1 = (p.samtykker || [])[0];
  if (!s1?.givet) return json(422, { fejl: 'Samtykke mangler' });
  const s2 = (p.samtykker || [])[1];
  const modtaget = new Date().toISOString();
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || null;
  const ua = req.headers.get('user-agent') || null;

  const samtykker = [
    {
      formaal: flow === 'maegler' ? 'kontakt_maegler_og_vurdo' : 'kvartalsvurdering',
      givet: true,
      tekst: forventet1,
      tekst_vist_i_browser: tekst(s1.tekst, 2000),
      tekst_matcher: tekst(s1.tekst, 2000) === forventet1,
      modtagere:
        flow === 'maegler'
          ? [{ type: 'maegler', id: maegler.id, navn: maegler.navn, butik: maegler.butik }, { type: 'vurdo', navn: 'Vurdo (Hero Media ApS)' }]
          : [{ type: 'vurdo', navn: 'Vurdo (Hero Media ApS)' }],
      kanaler: flow === 'maegler' ? ['telefon', 'sms', 'email'] : ['email'],
      tidspunkt_server: modtaget,
      tidspunkt_klient: tekst(s1.klient_tidspunkt, 40),
    },
  ];
  if (flow === 'maegler' && s2) {
    samtykker.push({
      formaal: 'kvartalsvurdering',
      givet: Boolean(s2.givet),
      tekst: KVARTAL_TEKST,
      modtagere: [{ type: 'vurdo', navn: 'Vurdo (Hero Media ApS)' }],
      kanaler: ['email'],
      tidspunkt_server: modtaget,
    });
  }

  const leadId = tekst(p.lead_id, 80) || `lead-${crypto.randomUUID()}`;
  const [fornavn, ...rest] = navn.split(/\s+/);
  const kvartal = samtykker.some((s) => s.formaal === 'kvartalsvurdering' && s.givet);

  const lead = {
    lead_id: leadId,
    event_id: leadId,
    modtaget,
    form_version: tekst(p.form_version, 20),
    samtykke_version: tekst(p.samtykke_version, 20),
    flow,
    flow_grund: tekst(p.flow_grund, 30),

    // Flade felter, så de er lette at mappe i GoHighLevel.
    first_name: fornavn,
    last_name: rest.join(' '),
    full_name: navn,
    email,
    phone: telefon,
    address1: tekst(p.adresse?.tekst, 200),
    postal_code: tekst(p.adresse?.postnr, 4),
    city: tekst(p.adresse?.by, 80),
    country: 'DK',
    tags: [
      'vurdo',
      flow === 'maegler' ? 'vurdo-maegler' : 'vurdo-vurdering',
      `tid-${tekst(p.tidshorisont, 20)}`,
      ...(kvartal ? ['vurdo-kvartalsvurdering'] : []),
      ...(maegler ? [`maegler-${maegler.id}`] : []),
    ],

    adresse: {
      tekst: tekst(p.adresse?.tekst, 200),
      adresse_id: tekst(p.adresse?.adresseId, 40),
      husnummer_id: tekst(p.adresse?.husnummerId, 40),
      postnr: tekst(p.adresse?.postnr, 4),
      by: tekst(p.adresse?.by, 80),
      manuelt_indtastet: Boolean(p.adresse?.manuel),
    },
    bolig: {
      type: tekst(p.bolig?.type, 30),
      type_navn: tekst(p.bolig?.type_navn, 60),
      areal_m2: Number(p.bolig?.areal) || null,
      bbr: p.bolig?.bbr || null,
      rettet_af_bruger: Boolean(p.bolig?.rettet_af_bruger),
    },
    estimat: p.estimat || null,
    provenu: p.provenu || null,
    tidshorisont: tekst(p.tidshorisont, 20),
    tidshorisont_navn: tekst(p.tidshorisont_navn, 60),
    prioriteter: Array.isArray(p.prioriteter) ? p.prioriteter.slice(0, 10).map((x) => tekst(x, 40)) : [],
    prioriteter_navne: Array.isArray(p.prioriteter_navne) ? p.prioriteter_navne.slice(0, 10).map((x) => tekst(x, 60)) : [],
    maegler: maegler ? { id: maegler.id, navn: maegler.navn, butik: maegler.butik, titel: maegler.titel } : null,
    bedste_tidspunkt: tekst(p.kontakt?.bedste_tidspunkt, 30),
    bedste_tidspunkt_navn: tekst(p.kontakt?.bedste_tidspunkt_navn, 60),
    samtykker,
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
    side_url: tekst(p.side?.url, 500),
    referrer: tekst(p.side?.referrer, 500),
    ip,
    user_agent: ua,
  };

  // 1. Dokumentation af samtykke. Fejler dette, afvises henvendelsen, så vi aldrig sender data uden dokumentation.
  try {
    const store = getStore({ name: 'samtykker', consistency: 'strong' });
    await store.setJSON(`${modtaget.slice(0, 10)}/${leadId}.json`, {
      lead_id: leadId,
      modtaget,
      navn,
      email,
      telefon,
      adresse: lead.adresse.tekst,
      samtykker,
      ip,
      user_agent: ua,
      side_url: lead.side_url,
      form_version: lead.form_version,
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
  const svar = await fetch(ghl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lead),
  }).catch((err) => ({ ok: false, status: 0, err }));
  if (!svar.ok) {
    console.error('GoHighLevel afviste henvendelsen', svar.status, svar.err);
    return json(502, { fejl: 'Kunne ikke sende henvendelsen' });
  }

  // 3. Meta Conversions API. Kun med marketing-samtykke. Fejl her må ikke stoppe henvendelsen.
  if (p.cookie_marketing === true && process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN) {
    try {
      await sendCapi({ req, lead, fornavn, efternavn: rest.join(' ') });
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

async function sendCapi({ req, lead, fornavn, efternavn }) {
  const fbclid = lead.utm.fbclid;
  const fbc = cookie(req, '_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
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
          ph: [sha(lead.phone?.replace('+', ''))],
          fn: [sha(fornavn)],
          ln: efternavn ? [sha(efternavn)] : undefined,
          zp: [sha(lead.postal_code)],
          ct: lead.city ? [sha(lead.city.replace(/\s+[a-zæøå]{1,2}$/i, '').replace(/\s/g, ''))] : undefined,
          country: [sha('dk')],
          external_id: [sha(lead.lead_id)],
          client_ip_address: lead.ip || undefined,
          client_user_agent: lead.user_agent || undefined,
          fbp: cookie(req, '_fbp'),
          fbc,
        },
        custom_data: { content_name: lead.flow, content_category: lead.bolig.type },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };
  const url = `https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_CAPI_TOKEN}`;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) console.error('CAPI svarede', r.status, await r.text());
}
