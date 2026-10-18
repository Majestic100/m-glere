// Meta Pixel. Indlæses først, når brugeren har sagt ja til marketing-cookies.
// Hver hændelse får et event_id, så den kan deduplikeres mod Conversions API.
import { harMarketing } from './samtykke.js';
import { gemAttribution } from './attribution.js';

const PIXEL_ID = import.meta.env.PUBLIC_META_PIXEL_ID;
let indlaest = false;

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

export function spor(haendelse, data = {}, eventId) {
  if (!harMarketing() || !PIXEL_ID) return;
  indlaesPixel();
  window.fbq?.('track', haendelse, data, eventId ? { eventID: eventId } : undefined);
}

indlaesPixel();
window.addEventListener('vurdo:samtykke', () => {
  indlaesPixel();
  gemAttribution();
});
