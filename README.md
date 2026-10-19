# Nem Vurdering

Mobile-first hjemmeside for Nem Vurdering, en gratis tjeneste der hjælper boligejere med at se, hvad deres bolig er værd, og vælge den rette lokale mægler. Drives af Hero Media ApS. Hero Media nævnes kun der, hvor loven kræver det: privatlivspolitik, vilkår og samtykketekst.

## Teknik kort

| Del | Valg | Hvorfor |
| --- | --- | --- |
| Sider | [Astro 5](https://astro.build), statisk output | Næsten ingen JavaScript. Forsiden er ca. 13 kB HTML og 11 kB JS komprimeret. |
| Formular | Ren JavaScript (`src/scripts/vurdering.js`) | Intet framework at downloade på mobil. |
| Adresser | Klimadatastyrelsens **Adressevælger** | DAWA er lukket. Alle DAWA-endpoints svarer `410 Gone`. |
| Boligtype og areal | BBR via Datafordelerens GraphQL (`netlify/functions/bbr.mjs`) | Kræver gratis API-nøgle. Uden nøgle udfylder boligejeren selv. |
| Henvendelser | Netlify Function (`netlify/functions/lead.mjs`) til GoHighLevel-webhook | Webhook-URL'en er skjult for browseren. |
| Samtykkelog | Netlify Blobs, store `samtykker` | Ordlyd, tidspunkt og modtager gemmes, før data sendes videre. |
| Redigering | Decap CMS på `/admin` | Mæglere, postnumre, priser, bysider og firmaoplysninger uden kode. |
| Hosting | Netlify | Funktioner, Blobs og CMS-login samme sted. |

## Kom i gang

```bash
npm install
npm run dev      # http://localhost:4321
npm test         # beregninger og lead-funktionen
npm run build
```

Funktionerne under `/api` kører kun på Netlify eller med `netlify dev`.

## Opsætning på Netlify

1. Opret et site fra dette repo. Build-indstillingerne ligger i `netlify.toml`.
2. Sæt miljøvariabler fra `.env.example`:
   - `GHL_WEBHOOK_URL`: I GoHighLevel, lav en workflow med triggeren **Inbound Webhook** og kopiér URL'en.
   - `DATAFORDELER_API_KEY`: Opret bruger og IT-system på datafordeler.dk og lav en API-nøgle.
   - `PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID`, `META_CAPI_TOKEN`: fra Meta Events Manager. `META_TEST_EVENT_CODE` under test.
3. Netlify Blobs virker automatisk på Netlify. Fejler samtykkeloggen, afvises henvendelsen, så der aldrig sendes data uden dokumentation.

## Felter til GoHighLevel

Hver henvendelse sendes som JSON. Flade felter til nem mapping: `first_name`, `last_name`, `email`, `phone` (+45), `address1`, `postal_code`, `city`, `tags`.

Desuden: `lead_id`, `event_id`, `flow` (`maegler` eller `vurdering`), `adresse`, `bolig` (type, areal, BBR-data, om brugeren rettede), `estimat`, `provenu`, `tidshorisont`, `prioriteter`, `maegler` (id, navn, butik), `bedste_tidspunkt`, `samtykker` (ordlyd, givet, modtagere, kanaler, servertidspunkt), `utm` (source, medium, campaign, content, term, fbclid, gclid, landingsside), `side_url`, `ip`, `user_agent`.

Tags: `vurdo`, `vurdo-maegler` eller `vurdo-vurdering`, `tid-0-3` osv., `vurdo-kvartalsvurdering` og `maegler-<id>`.

## Meta Pixel og Conversions API

- Pixel indlæses kun, hvis brugeren har sagt ja til marketing-cookies.
- `ViewContent` sendes, når estimatet vises. `Lead` sendes, når formularen er sendt.
- `Lead` har `eventID` lig med `lead_id`. Serveren sender samme `event_id` til Conversions API, så Meta kan deduplikere. CAPI sendes kun med marketing-samtykke.

## CMS

`/admin` åbner Decap CMS. Login sker med GitHub:

1. I Netlify: Site configuration, Access & security, OAuth. Installér GitHub som provider.
2. Personer, der skal redigere, skal have skriveadgang til repoet.
3. Ret `backend.branch` i `public/admin/config.yml`, hvis produktionsgrenen ikke hedder `main`.

Hver gemning bliver et commit, og Netlify bygger siden igen på cirka et minut.

| Hvad | Fil |
| --- | --- |
| Mæglere og deres postnumre | `src/data/maeglere.json` |
| Kvadratmeterpriser pr. postnummer | `src/data/kvmpriser.json` |
| Bysider | `src/content/byer/*.json` |
| CVR, adresse, åbningstider | `src/data/site.json` |
| Spørgsmål og svar | `src/data/faq.js` |

## Bysider

En ny JSON-fil i `src/content/byer` giver en ny side på `/hvad-er-min-bolig-vaerd-i-<slug>`. Siden viser formularen, prisudviklingen og de mæglere, der dækker byens postnumre. Opret dem i CMS'et under **Bysider**.

## Før lancering

Alt i gult på siden er pladsholdere. Kør `grep -rn "PLADSHOLDER\|\[Mægler" src` for at finde dem.

- [ ] Rigtige kvadratmeterpriser i `kvmpriser.json` og `pladsholder: false`. De nuværende er runde testtal.
- [ ] Rigtige mæglere med portræt, video, tal og kilder.
- [ ] CVR, adresse, telefon og e-mail i `site.json`.
- [ ] Rigtige åbningstider. De styrer, om tak-siden lover et opkald inden for 15 minutter.
- [ ] Standardtal for salær i provenu-beregneren.
- [ ] Egne fotos i stedet for de AI-genererede boligbilleder i `src/assets/boliger`.
- [ ] Privatlivspolitik og vilkår gennemgået af jurist.
- [ ] Svar på "Hvordan bliver mæglerne udvalgt?".
- [ ] BBR-feltnavne tjekket mod skemaet, når API-nøglen er oprettet (se kommentar i `bbr.mjs`).
- [ ] Trustpilot-link i `site.json`, når der er rigtige anmeldelser.

## Preview

`npm run build && npm run preview-bundle` laver en flad, statisk kopi i `preview/` med relative links. Formularen kører i preview-tilstand og sender intet.

## Brandguide

Se `/brandguide` på sitet. Farverne er defineret som variabler øverst i `src/styles/global.css`.
