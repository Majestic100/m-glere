// Ofte stillede spørgsmål. Bruges på forsiden, FAQ-siden og kommunesiderne.
// Tekst i [klammer] eller med TODO_DATA er pladsholdere og kommer ikke med i FAQPage-schema.
export const faq = [
  {
    id: 'hvor-praecist-er-estimatet',
    q: 'Hvor præcist er estimatet?',
    a: [
      'Estimatet er et prisinterval, ikke en pris. Vi regner det ud fra kvadratmeterpriser for boliger som din i dit postnummer, boligens areal fra BBR og det, du fortæller om stand og tilvalg.',
      'Jo flere handler der er i dit område, jo smallere bliver intervallet. Derfor viser vi altid, hvor præcist estimatet er. Den rigtige pris kan godt ligge uden for intervallet, fordi vi ikke kan se din bolig. En mægler, der har været ude at se den, kan give dig en langt mere præcis pris.',
    ],
  },
  {
    id: 'forskel-paa-vurderinger',
    q: 'Hvad er forskellen på estimatet, en salgsvurdering og den offentlige ejendomsvurdering?',
    a: [
      'Estimatet her på siden er et automatisk prisinterval ud fra registre og handler i området.',
      'En salgsvurdering er en mæglers bud på, hvad din bolig kan sælges for. Mægleren kommer ud og ser boligen, og det er gratis.',
      'Den offentlige ejendomsvurdering kommer fra Vurderingsstyrelsen og bruges til at beregne boligskatter. Den er ikke et bud på en salgspris.',
    ],
  },
  {
    id: 'hvem-faar-mine-oplysninger',
    q: 'Hvem får mine oplysninger?',
    a: [
      'Kun den ene mægler, vi anbefaler, og kun hvis du sætter flueben i samtykket. Vi ringer eller skriver først til dig for at bekræfte, og derefter sender vi dine oplysninger til mægleren. Ingen andre mæglere får dem.',
    ],
  },
  {
    id: 'hvordan-finder-i-min-maegler',
    q: 'Hvordan finder I min mægler?',
    a: [
      'Vi samarbejder med udvalgte lokale mæglere, og det er blandt dem, vi finder din. Først ser vi på, hvem der dækker dit postnummer, handler med din boligtype og har tid til en ny opgave.',
      'Derefter ser vi på lokale salg af boliger som din, hvor hurtigt mægleren typisk sælger, erfaring med din prisklasse, hvad andre boligejere siger, og hvor hurtigt mægleren svarer. Den, der passer bedst til netop din bolig, bliver din anbefaling.',
      'Vi gemmer, hvorfor du fik netop den mægler, så vi altid kan forklare det.',
    ],
  },
  {
    id: 'hvis-jeg-ikke-synes-om-maegleren',
    q: 'Hvad hvis jeg ikke synes om mægleren?',
    a: ['Sig det til os, når vi ringer for at bekræfte. Vi finder en anden. Dine oplysninger går først videre, når du har bekræftet.'],
  },
  {
    id: 'er-jeg-forpligtet',
    q: 'Er jeg forpligtet til at sælge?',
    a: ['Nej. Estimatet og salgsvurderingen er gratis og uden binding. Du bestemmer selv, om og hvornår du vil sælge.'],
  },
  {
    id: 'skal-jeg-rydde-op',
    q: 'Skal jeg rydde op, før mægleren kommer?',
    a: ['Nej. Mægleren kommer for at se boligen, som den er. Det er beliggenhed, stand og indretning, der betyder noget for prisen, ikke opvasken.'],
  },
  {
    id: 'hvad-koster-en-salgsvurdering',
    q: 'Hvad koster en salgsvurdering?',
    a: ['Den er gratis. Hverken mægleren eller vi tager penge fra dig for den.'],
  },
  {
    id: 'traek-samtykke-tilbage',
    q: 'Hvordan trækker jeg mit samtykke tilbage?',
    a: [
      'Skriv til os på TODO_DATA, eller sig det, når vi ringer. Mails om din boligværdi kan du afmelde med ét klik i bunden af hver mail. Har mægleren allerede fået dine oplysninger, giver vi også mægleren besked.',
    ],
  },
  {
    id: 'ingen-maegler-i-mit-omraade',
    q: 'Hvad hvis der ikke er en mægler i mit område?',
    a: ['Du får stadig dit estimat. Vil du, kan du skrive dig op, så giver vi besked, når vi har en partnermægler i dit område. Indtil da sender vi ikke dine oplysninger til nogen mægler.'],
  },
];
