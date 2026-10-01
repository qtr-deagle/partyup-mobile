import { RankMedal } from '@/components/guild/RankMedal';
import { RANK_PERKS, rankFor, titleFor } from '@/lib/guilds';
import { forwardRef, type RefObject } from 'react';
import { Share, Text, View } from 'react-native';

type Props = {
  points: number;
  role: string | null | undefined;
  displayName: string;
  guildName?: string | null;
};

const BACKGROUNDS: Record<string, string> = {
  Rookie: '#1E293B',
  Bronze: '#431407',
  Silver: '#1E293B',
  Gold: '#422006',
  Platinum: '#083344',
  Legend: '#2E1065',
};

// Square brag card for sharing a rank: the medal, title, name and guild.
// Rendered on screen (or off to the side) so it can be captured as a PNG.
export const MedalShareCard = forwardRef<View, Props>(function MedalShareCard({ points, role, displayName, guildName }, ref) {
  const { rank, tier } = rankFor(points);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: 320, height: 320, backgroundColor: BACKGROUNDS[rank.name] ?? '#1E293B', borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ position: 'absolute', width: 420, height: 420, borderRadius: 210, backgroundColor: 'rgba(255,255,255,0.06)', top: -170 }} />
      <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -150, right: -90 }} />
      <RankMedal rank={rank.name} tier={tier} size={120} />
      <Text style={{ marginTop: 10, color: '#FFFFFF', fontSize: 24, fontWeight: '900' }}>{titleFor(points, role)}</Text>
      <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
        {displayName}
        {guildName ? ` · ${guildName}` : ''}
      </Text>
      <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{points} lifetime pts</Text>
      <Text style={{ position: 'absolute', bottom: 14, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>PARTYUP</Text>
    </View>
  );
});

// Shares the card as an image when the native modules are in this build,
// otherwise falls back to a text share so the button always does something.
export async function shareMedalCard(cardRef: RefObject<View | null>, points: number, role: string | null | undefined) {
  const { rank } = rankFor(points);
  const message = `I just reached ${titleFor(points, role)} on PartyUp with ${points} pts! 🏅 ${RANK_PERKS[rank.name]?.[0] ?? ''}`.trim();
  try {
    const [{ captureRef }, Sharing] = await Promise.all([import('react-native-view-shot'), import('expo-sharing')]);
    if (cardRef.current && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share my medal', UTI: 'public.png' });
      return;
    }
  } catch {
    // Native share modules missing from this build; fall through to text.
  }
  await Share.share({ message });
}
