# TODO_DATA: data og afklaringer, der mangler før lancering

Alt, der står som `TODO_DATA` på siden, bliver vist med gul markering i demoen. I produktion bliver sektioner uden rigtige tal skjult.

Find alle forekomster med:

```bash
grep -rn "TODO_DATA" data config src netlify
```

## Udfyldt

| Hvad | Kilde | Opdatering |
|---|---|---|
| Kvadratmeterpriser, handler, salgstid og prisudvikling pr. postnummer og kommune (`data/m2-priser.json`) | Finans Danmark, Boligmarkedsstatistikken (tabel BM010, BM011, BM020, BM021, BM030, BM031) | `npm run hent-boligdata` hvert kvartal |
| Tal på de 24 kommunesider (`data/kommuner.json`) | Samme | Samme |
| Boligmarkedet lige nu (`data/marked.json`) | Samme, hele landet | Samme |
| Kommunekoderne | Tjekket mod Finans Danmarks områdeliste | |
| De 20 største kommuner | Tjekket mod Danmarks Statistik, FOLK1A, 3. kvartal 2026 | |
| Cookiepolitik, statistik | Ingen statistikværktøjer er installeret, og det står der nu | |
| Vilkår, hvor ofte tallene opdateres | Hvert kvartal | |

Metode: kvadratmeterprisen er gennemsnittet af de seneste to kvartaler, vægtet med antal handler. Med færre end 20 handler bruges fire kvartaler. Antal handler, salgstid og udvikling gælder de seneste fire kvartaler. Finans Danmark slår parcel- og rækkehuse sammen, og postnumrene i København K, V og Frederiksberg C er samlet i intervallerne 1000, 1500 og 1800. Andelsboliger er ikke med i statistikken, og formularen giver derfor intet estimat for dem.

Tjek Finans Danmarks vilkår for genbrug af statistikken. Kilden står ved alle tal.

## Firma og kontakt (`data/site.json`)

| Felt | Bruges i |
|---|---|
| `cvr`, `adresse`, `postnrBy` | Footer, persondatapolitik, vilkår |
| `telefon`, `email` | Footer, FAQ (træk samtykke tilbage), persondatapolitik |
| `b2bUrl` | Footer-link "Er du ejendomsmægler?". Indtil det er udfyldt, peger linket på `/for-maeglere` |

**Bekræft selskabsformen.** Siden og samtykketeksten siger "Hero Media ApS". Offentlige CVR-opslag viser CVR 42472808 "Hero Media" som enkeltmandsvirksomhed i Aarhus C. Er det ikke et ApS, skal `selskab` i `site.json` og samtykketeksten i `src/lib/faelles.js` rettes.

## Partnermæglere (`data/maeglere.json`)

Eksemplerne i filen er pladsholdere og skal erstattes med rigtige mæglere.

| Felt | Betydning | Hvis det mangler |
|---|---|---|
| `navn`, `firma`, `foto` | Vises på kortet og i samtykketeksten | Kortet viser en gul pladsholder |
| `postnumre`, `boligtyper` | Dækning | Mægleren bliver aldrig matchet |
| `salg_12m.<boligtype>` og `salg_kilde` | Lokale salg pr. boligtype de seneste 12 måneder | Faktoren tæller neutralt, ingen begrundelse |
| `liggetid_dage` | Mæglerens gennemsnitlige salgstid | Neutral, ingen begrundelse |
| `prisinterval.min/max` | Typisk prisklasse | Neutral |
| `kapacitet_dag`, `kapacitet_maaned` | Maks. leads | Ingen grænse |
| `feedback_score`, `responstid_timer` | Fra egne opfølgninger | Starter neutralt (`null`) |

Uden rigtige mæglertal scorer alle mæglere ens, og matchingen er reelt en rotation.

## Estimat-motoren (`config/estimat.json`)

| Felt | Status |
|---|---|
| `faktorer.indvendig`, `faktorer.udvendig`, `faktorer.tilvalg` | Alle er `null` (ingen effekt). Skal fastsættes, fx med partnermæglerne |
| `salaer.min`, `salaer.max` | Salærinterval til provenu-beregneren. Indtil da vises provenu før salær |
| `praecision.hoej_min_handler`, `middel_min_handler`, `spaend` | Startværdier (50 og 15 handler, ±7/12/18 %). Skal godkendes |

## Matching (`config/matching.json`)

Vægtene (lokale salg 0,35, liggetid 0,2, prisniveau 0,2, feedback 0,15, responstid 0,1) og rotationen (0,03) er startværdier. Skal godkendes. Hæv `version`, når de ændres.

## Kommunesider (`data/kommuner.json`)

- Nabokommunerne (`naboer`) er ikke tjekket mod et kort.
- Favrskov har ingen kvadratmeterpris for lejligheder, fordi der er for få handler. Siden viser kun tal for huse.
- `lokal_tekst` er valgfri, men gør siderne stærkere for Google.

## Sammenlignelige handler (`data/sammenlignelige-handler.json`)

Kræver en datakilde med enkelthandler, I har ret til at bruge. Finans Danmarks statistik har kun gennemsnit. Sektionen vises først med mindst 3 handler for postnummeret og boligtypen.

## Feature flags (`config/features.json`)

| Flag | Slå til når |
|---|---|
| `trustpilot` | Der er rigtige anmeldelser. Udfyld `trustpilot_business_unit_id` og `trustpilot_url` |
| `aktivitet` | I er trygge ved at vise "En boligejer i X har lige fået et estimat" fra egne leads |
| `taeller` | Antallet af estimater er over `taeller_minimum` |

## Juridisk

- Persondatapolitik: øvrige leverandører (fx e-mail og sms i GoHighLevel), overførselsgrundlag pr. leverandør, opbevaringstider og dato.
- Cookiepolitik: dato.
- For mæglere: pris og vilkår.
- Samtykketeksterne i `src/lib/faelles.js` skal gennemses af en advokat før lancering.

## Billeder

- Mæglerportrætter.

## Teknik og miljøvariabler

| Hvad | Hvor |
|---|---|
| `GHL_WEBHOOK_URL` | Netlify. Uden den bliver ingen henvendelser modtaget |
| `MATCH_SECRET` | Netlify. En lang, tilfældig tekst. Uden den afvises alle mæglerleads |
| `DATAFORDELER_API_KEY` | Netlify. Uden den udfylder boligejeren selv boligtype, areal, værelser og byggeår |
| BBR-feltnavne | `netlify/functions/bbr.mjs`. `enh031AntalVaerelser` og `byg026Opfoerelsesaar` skal tjekkes mod skemaet |
| `PUBLIC_ADRESSEVAELGER_TOKEN` | Eget token fra Klimadatastyrelsen. Indtil da bruges det offentlige `adressevaelger123` |
| `PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID`, `META_CAPI_TOKEN` | Meta Events Manager |
| Server-events `lead_verified` og `valuation_booked` | Skal sendes fra GoHighLevel til Conversions API med `event_id` fra leadet (`event_ids`) |
