import { supabase } from '@/lib/supabase';

// PartyUp is for Bulacan residents only (they may travel anywhere). Keep in
// sync with public.bulacan_municipalities() -- the DB rejects any other value.
export const BULACAN_MUNICIPALITIES = [
  'Angat',
  'Balagtas',
  'Baliwag',
  'Bocaue',
  'Bulakan',
  'Bustos',
  'Calumpit',
  'Doña Remedios Trinidad',
  'Guiguinto',
  'Hagonoy',
  'Malolos',
  'Marilao',
  'Meycauayan',
  'Norzagaray',
  'Obando',
  'Pandi',
  'Paombong',
  'Plaridel',
  'Pulilan',
  'San Ildefonso',
  'San Jose del Monte',
  'San Miguel',
  'San Rafael',
  'Santa Maria',
] as const;

export type BulacanMunicipality = (typeof BULACAN_MUNICIPALITIES)[number];

export function formatResidence(city: string | null | undefined) {
  return city ? `${city}, Bulacan` : null;
}

// Allowed while unverified/rejected, or once if still empty; the DB silently
// keeps the old value otherwise, so read it back to confirm.
export async function setMyMunicipality(userId: string, city: BulacanMunicipality) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ city, country: 'Philippines' })
    .eq('id', userId)
    .select('city')
    .single();
  if (error) {
    return { error };
  }
  if (data?.city !== city) {
    return { error: new Error('Your municipality is locked after verification. Contact support to change it.') };
  }
  return { error: null };
}

// Town-proper centers, used to jump the meetup map to the chosen municipality
// before the creator drags the pin to the exact spot.
export const BULACAN_CENTERS: Record<BulacanMunicipality, { latitude: number; longitude: number }> = {
  Angat: { latitude: 14.9283, longitude: 121.029 },
  Balagtas: { latitude: 14.815, longitude: 120.906 },
  Baliwag: { latitude: 14.9546, longitude: 120.897 },
  Bocaue: { latitude: 14.798, longitude: 120.926 },
  Bulakan: { latitude: 14.793, longitude: 120.879 },
  Bustos: { latitude: 14.957, longitude: 120.917 },
  Calumpit: { latitude: 14.916, longitude: 120.766 },
  'Doña Remedios Trinidad': { latitude: 15.009, longitude: 121.083 },
  Guiguinto: { latitude: 14.833, longitude: 120.883 },
  Hagonoy: { latitude: 14.834, longitude: 120.733 },
  Malolos: { latitude: 14.8433, longitude: 120.8114 },
  Marilao: { latitude: 14.758, longitude: 120.948 },
  Meycauayan: { latitude: 14.737, longitude: 120.96 },
  Norzagaray: { latitude: 14.91, longitude: 121.049 },
  Obando: { latitude: 14.708, longitude: 120.937 },
  Pandi: { latitude: 14.865, longitude: 120.957 },
  Paombong: { latitude: 14.831, longitude: 120.789 },
  Plaridel: { latitude: 14.887, longitude: 120.857 },
  Pulilan: { latitude: 14.902, longitude: 120.849 },
  'San Ildefonso': { latitude: 15.079, longitude: 120.942 },
  'San Jose del Monte': { latitude: 14.8139, longitude: 121.0453 },
  'San Miguel': { latitude: 15.146, longitude: 120.978 },
  'San Rafael': { latitude: 14.995, longitude: 120.968 },
  'Santa Maria': { latitude: 14.819, longitude: 120.96 },
};

// Meetups may be outside the province (e.g. a tour meeting at a port), so
// the meetup dropdown adds this on top of the 24 LGUs. Keep in sync with
// create_trip's p_meetup_municipality check.
export const OUTSIDE_BULACAN = 'Outside Bulacan';
