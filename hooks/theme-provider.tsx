import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  setPreference: (nextPreference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(preference === 'system' ? null : preference);
    }
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      setPreference: (nextPreference: ThemePreference) => {
        setPreferenceState(nextPreference);
      },
    }),
    [preference]
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);

  if (!context) {
    throw new Error('useThemePreference must be used within a ThemePreferenceProvider.');
  }

  return context;
}

export function useColorScheme() {
  const systemColorScheme = useSystemColorScheme();
  const { preference } = useThemePreference();

  if (preference === 'system') {
    return systemColorScheme ?? 'light';
  }

  return preference;
}