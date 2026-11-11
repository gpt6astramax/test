// Styles that take their colours and type from the theme:
//   const useS = themed((c, f) => ({ title: { ...f.display, fontSize: 36, color: c.fg } }));
//   const S = useS();
// On the web the colours are CSS variables, so the sheet is made once and a theme switch re-renders nothing; on iOS and
// Android they are plain values and the sheet is remade when the theme changes.
import * as React from 'react';
import { StyleSheet } from 'react-native';
import { useColors } from './theme';
import { font } from './fonts';

export function themed(factory) {
  return function useStyles() {
    const c = useColors();
    return React.useMemo(() => StyleSheet.create(factory(c, font)), [c]);
  };
}
