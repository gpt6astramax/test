// Type on the web: Jost from the files bundled by styles.css, through CSS variables.
export const font = {
  display: { fontFamily: 'var(--display)', fontWeight: '300' },
  text: { fontFamily: 'var(--text)', fontWeight: '400' },
  /** names in lists */
  strong: { fontFamily: 'var(--text)', fontWeight: '600' },
  /** durations: every digit as wide as the next */
  mono: { fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace', fontWeight: '400' },
};
export const useAppFonts = () => true;
