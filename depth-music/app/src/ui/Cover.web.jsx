// Cover art on the web: the canvas drawing as an image. Cover.jsx is the SVG twin for iOS / Android.
import * as React from 'react';
import { Image } from 'react-native';
import { coverURL } from '../art.web';

export const CoverArt = ({ hue, seed, style }) => <Image source={{ uri: coverURL(hue, seed) }} style={style} accessibilityIgnoresInvertColors />;
export default CoverArt;
