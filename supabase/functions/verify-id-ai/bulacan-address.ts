// Pure text matcher for the advisory Bulacan address check. Takes the OCR
// lines Rekognition DetectText read off the ID and decides whether the
// address is in Bulacan, and whether it's the municipality the user declared.
//
// Keep the municipality names in sync with lib/bulacan.ts and
// public.bulacan_municipalities().

export type AddressFlag =
  | 'match'
  | 'other_bulacan_town'
  | 'bulacan_unknown_town'
  | 'not_bulacan'
  | 'not_found'
  | 'not_applicable'
  | 'error';

export type AddressCheck = {
  flag: AddressFlag;
  municipality: string | null;
};

// Aliases are written pre-normalized (uppercase, no accents/punctuation).
// `unique` = the name doesn't also belong to a town outside Bulacan, so it
// counts as Bulacan evidence even when the OCR missed the province line.
const MUNICIPALITIES: { name: string; aliases: string[]; unique: boolean }[] = [
  { name: 'Angat', aliases: ['ANGAT'], unique: true },
  { name: 'Balagtas', aliases: ['BALAGTAS', 'BIGAA'], unique: true },
  { name: 'Baliwag', aliases: ['BALIWAG', 'BALIUAG'], unique: true },
  { name: 'Bocaue', aliases: ['BOCAUE'], unique: true },
  { name: 'Bulakan', aliases: ['BULAKAN'], unique: false },
  { name: 'Bustos', aliases: ['BUSTOS'], unique: true },
  { name: 'Calumpit', aliases: ['CALUMPIT'], unique: true },
  { name: 'Doña Remedios Trinidad', aliases: ['DONA REMEDIOS TRINIDAD', 'DONA REMEDIOS', 'DRT'], unique: true },
  { name: 'Guiguinto', aliases: ['GUIGUINTO'], unique: true },
  { name: 'Hagonoy', aliases: ['HAGONOY'], unique: false },
  { name: 'Malolos', aliases: ['MALOLOS'], unique: true },
  { name: 'Marilao', aliases: ['MARILAO'], unique: true },
  { name: 'Meycauayan', aliases: ['MEYCAUAYAN'], unique: true },
  { name: 'Norzagaray', aliases: ['NORZAGARAY'], unique: true },
  { name: 'Obando', aliases: ['OBANDO'], unique: true },
  { name: 'Pandi', aliases: ['PANDI'], unique: true },
  { name: 'Paombong', aliases: ['PAOMBONG'], unique: true },
  { name: 'Plaridel', aliases: ['PLARIDEL'], unique: false },
  { name: 'Pulilan', aliases: ['PULILAN'], unique: true },
  { name: 'San Ildefonso', aliases: ['SAN ILDEFONSO'], unique: false },
  { name: 'San Jose del Monte', aliases: ['SAN JOSE DEL MONTE', 'CSJDM', 'SJDM'], unique: true },
  { name: 'San Miguel', aliases: ['SAN MIGUEL'], unique: false },
  { name: 'San Rafael', aliases: ['SAN RAFAEL'], unique: false },
  { name: 'Santa Maria', aliases: ['SANTA MARIA', 'STA MARIA'], unique: false },
];

const PROVINCE_KEYWORDS = ['BULACAN'];

// Below this many words the OCR almost certainly failed (blur, glare, crop).
const MIN_WORDS_FOR_VERDICT = 4;

export function normalizeOcrText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Position of the first whole-phrase hit, or -1.
function findPhrase(padded: string, phrase: string): number {
  return padded.indexOf(` ${phrase} `);
}

export function checkBulacanAddress(ocrLines: string[], declaredCity: string | null): AddressCheck {
  const text = normalizeOcrText(ocrLines.join(' '));
  const wordCount = text ? text.split(' ').length : 0;
  if (wordCount < MIN_WORDS_FOR_VERDICT) {
    return { flag: 'not_found', municipality: null };
  }

  const padded = ` ${text} `;
  const hasProvince = PROVINCE_KEYWORDS.some((keyword) => findPhrase(padded, keyword) >= 0);

  const hits: { name: string; position: number; unique: boolean }[] = [];
  for (const town of MUNICIPALITIES) {
    const positions = town.aliases.map((alias) => findPhrase(padded, alias)).filter((p) => p >= 0);
    if (positions.length > 0) {
      hits.push({ name: town.name, position: Math.min(...positions), unique: town.unique });
    }
  }

  // Names shared with towns elsewhere (San Miguel, Santa Maria...) only count
  // when the province is on the card too.
  const credible = hits.filter((hit) => hit.unique || hasProvince);

  if (credible.length === 0) {
    return hasProvince
      ? { flag: 'bulacan_unknown_town', municipality: null }
      : { flag: 'not_bulacan', municipality: null };
  }

  // An ID can name more than one town (birthplace, issuing office), so the
  // declared town wins if it appears anywhere; otherwise take the first one.
  const declared = credible.find((hit) => hit.name === declaredCity);
  if (declared) {
    return { flag: 'match', municipality: declared.name };
  }
  credible.sort((a, b) => a.position - b.position);
  return { flag: 'other_bulacan_town', municipality: credible[0].name };
}
