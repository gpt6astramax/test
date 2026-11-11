// Type on iOS / Android: Jost through expo-font, one family per weight (a custom family has no synthesized weights).
// Chinese falls to the system face on its own.
import { useFonts } from 'expo-font';
import { Jost_300Light } from '@expo-google-fonts/jost/300Light';
import { Jost_400Regular } from '@expo-google-fonts/jost/400Regular';

export const font = {
  display: { fontFamily: 'Jost_300Light' },
  text: { fontFamily: 'Jost_400Regular' },
};
/** True once the font files are loaded. */
export const useAppFonts = () => useFonts({ Jost_300Light, Jost_400Regular })[0];
