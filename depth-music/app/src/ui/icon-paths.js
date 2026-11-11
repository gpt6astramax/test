// Line icons as data: [tag, attributes] on a 24 x 24 field, stroke 1.9, round caps and joins. `fill: true` means the
// shape is filled with the icon's colour. Icon.web.jsx draws them as inline SVG, Icon.jsx with react-native-svg.
const HEART = 'M3.6 8.8A4.3 4.3 0 0 1 7.9 4.5C9.9 4.5 11 6 12 7.5C13 6 14.1 4.5 16.1 4.5A4.3 4.3 0 0 1 20.4 8.8C20.4 13.8 15.2 17.6 12.7 19.9Q12 20.5 11.3 19.9C8.8 17.6 3.6 13.8 3.6 8.8Z';
export const ICONS = {
  back: [['path', { d: 'M15 5l-7 7 7 7' }]],
  go: [['path', { d: 'M9 5l7 7-7 7' }]],
  down1: [['path', { d: 'M5 9l7 7 7-7' }]],
  play: [['path', { d: 'M8 5.5v13l11-6.5z', fill: true }]],
  pause: [['path', { d: 'M8 5v14M16 5v14', strokeWidth: 3.2 }]],
  next: [['path', { d: 'M6 6v12l9-6z', fill: true }], ['path', { d: 'M18 6v12' }]],
  prev: [['path', { d: 'M18 6v12l-9-6z', fill: true }], ['path', { d: 'M6 6v12' }]],
  // The heart fills its field: at size 16 it is 12.7 wide, the size it has in a list row. Two round lobes, a V between
  // them (a mitred join, so the notch is a clean point), a tip that is only just rounded.
  heart: [['path', { d: HEART, strokeWidth: 2, strokeLinejoin: 'miter' }]],
  heartFill: [['path', { d: HEART, strokeWidth: 2, strokeLinejoin: 'miter', fill: true }]],
  down: [['path', { d: 'M12 4v11M7 11l5 5 5-5M5 20h14' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  compass: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z' }]],
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l4.5 4.5' }]],
  stack: [['path', { d: 'M5 6v12M9.5 6v12M14 6.5l4.5 11' }]],
  user: [['circle', { cx: 12, cy: 8.5, r: 3.7 }], ['path', { d: 'M4.8 20c1-3.7 4-5.5 7.2-5.5s6.2 1.8 7.2 5.5' }]],
  moon: [['path', { d: 'M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7z' }]],
  sun: [['circle', { cx: 12, cy: 12, r: 3.8 }], ['path', { d: 'M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5L7 7M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5' }]],
};
