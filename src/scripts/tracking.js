// Tracking. Fire events i flowet: address_entered, estimate_viewed, broker_matched og lead_submitted.
// Hvert event får et unikt event_id, som også sendes til GoHighLevel, så server-events
// (lead_verified, valuation_booked) kan deduplikeres via Conversions API.
//
// dataLayer modtager altid eventet (det sætter ingen cookies i sig selv).
// Meta Pixel indlæses først, når brugeren har sagt ja til marketing-cookies.
import { harMarketing } from './samtykke.js';
import { gemAttribution } from './attribution.js';

const PIXEL_ID = import.meta.env.PUBLIC_META_PIXEL_ID;
let indlaest = false;

// Pixel-navne. lead_submitted er Metas standard-event Lead. De andre sendes som custom events.
const PIXEL = {
  address_entered: { custom: 'AddressEntered' },
  estimate_viewed: { standard: 'ViewContent' },
  broker_matched: { custom: 'BrokerMatched' },
  lead_submitted: { standard: 'Lead' },
};

function indlaesPixel() {
  if (indlaest || !PIXEL_ID || !harMarketing()) return;
  indlaest = true;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
}

export function nytEventId(prefix = 'ev') {
  const r = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${r}`;
}

/** Sender et event til dataLayer og, med samtykke, til Meta Pixel. Returnerer event_id. */
export function spor(navn, data = {}, eventId = nytEventId(navn)) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: navn, event_id: eventId, ...data });
  if (harMarketing() && PIXEL_ID) {
    indlaesPixel();
    const p = PIXEL[navn];
    if (p?.standard) window.fbq?.('track', p.standard, data, { eventID: eventId });
    else if (p?.custom) window.fbq?.('trackCustom', p.custom, data, { eventID: eventId });
  }
  return eventId;
}

/** Metas egne cookies, hvis Pixel har sat dem (kun efter samtykke). */
export function metaCookies() {
  const hent = (n) => (document.cookie.match(new RegExp(`(?:^|; )${n}=([^;]+)`)) || [])[1] || null;
  return { fbc: hent('_fbc'), fbp: hent('_fbp') };
}

indlaesPixel();
window.addEventListener('vurdo:samtykke', () => {
  indlaesPixel();
  gemAttribution();
});
