export function getTheme(isDark: boolean) {
  return {
    primaryColor: isDark ? '#3B82F6' : '#1E40AF',
    accentColor: isDark ? '#10B981' : '#059669',
    destructiveColor: isDark ? '#EF4444' : '#DC2626',
    warningColor: isDark ? '#F0A93B' : '#D88700',
    screenBackground: isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFC]',
    headerBackground: isDark ? 'border-white/5 bg-[#0F172A]' : 'border-black/5 bg-white',
    titleColor: isDark ? 'text-white' : 'text-[#182A4D]',
    subtitleColor: isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]',
    panelBackground: isDark ? 'bg-[#111B2E]' : 'bg-white',
    panelBorder: isDark ? 'border-white/5' : 'border-[#EDF0F5]',
    mutedPanel: isDark ? 'bg-[#18253C]' : 'bg-[#F4F6FA]',
    mutedText: isDark ? 'text-[#CBD5E1]' : 'text-[#6D7A96]',
    primaryText: isDark ? 'text-white' : 'text-[#1B2340]',
    softBorder: isDark ? 'border-[#22324B]' : 'border-[#D8E0EE]',
  };
}

export const typography = {
  pageTitle: 'text-headline-24 font-bold',
  sectionTitle: 'text-headline-18 font-semibold',
  cardHeadline: 'text-headline-28 font-bold',
  label: 'text-sm',
  value: 'text-lg font-bold',
  valueLarge: 'text-headline-24 font-bold',
  body: 'text-base',
  caption: 'text-xs',
};
