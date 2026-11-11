// Type on iOS / Android: Jost through expo-font, one family per weight (a custom family has no synthesized weights).
// Chinese falls to the system face on its own.
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { Jost_300Light } from '@expo-google-fonts/jost/300Light';
import { Jost_400Regular } from '@expo-google-fonts/jost/400Regular';
import { Jost_600SemiBold } from '@expo-google-fonts/jost/600SemiBold';

export const font = {
  display: { fontFamily: 'Jost_300Light' },
  text: { fontFamily: 'Jost_400Regular' },
  /** names in lists */
  strong: { fontFamily: 'Jost_600SemiBold' },
  /** durations: every digit as wide as the next (the system's monospaced face) */
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
};
/** True once the font files are loaded. */
export const useAppFonts = () => useFonts({ Jost_300Light, Jost_400Regular, Jost_600SemiBold })[0];
