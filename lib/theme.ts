export function getTheme(isDark: boolean) {
  return {
    primaryColor: isDark ? '#3B82F6' : '#1E40AF',
    accentColor: isDark ? '#10B981' : '#059669',
    destructiveColor: isDark ? '#EF4444' : '#DC2626',
    warningColor: isDark ? '#F0A93B' : '#D88700',
    screenBackground: isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]',
    headerBackground: isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white/80',
    titleColor: isDark ? 'text-white' : 'text-[#182A4D]',
    subtitleColor: isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]',
    panelBackground: isDark ? 'bg-[#0F172A]' : 'bg-white/85',
    panelBorder: isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]',
    mutedPanel: isDark ? 'bg-[#18253C]' : 'bg-white/75',
    mutedText: isDark ? 'text-[#CBD5E1]' : 'text-[#6D7A96]',
    primaryText: isDark ? 'text-white' : 'text-[#1B2340]',
    softBorder: isDark ? 'border-[#22324B]' : 'border-[#D8E0EE]',
  };
}

export const typography = {
  pageTitle: 'text-[32px] leading-9 font-black',
  sectionTitle: 'text-xl font-black',
  cardHeadline: 'text-3xl font-black',
  label: 'text-sm',
  value: 'text-lg font-bold',
  valueLarge: 'text-2xl font-black',
  body: 'text-base',
  caption: 'text-xs',
};
