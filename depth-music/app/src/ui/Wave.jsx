// A track's waveform: bars as a mask, the played part in the track's accent. The progress is a CSS variable the store
// writes straight to the element (state.showProgress), so playing re-renders nothing.
import * as React from 'react';
import { waveURL, accRaw } from '../art';
import { showProgress, seek, nudge } from '../state';

export function Wave({ track, bars = 84, variant = 0, height = 76, seekable = false, style }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => showProgress(ref.current, track.id, 'var'), [track.id]);
  const url = waveURL(track.n + 1, bars, variant);
  const onClick = seekable ? (e) => { const r = ref.current.getBoundingClientRect(); seek(track.id, (e.clientX - r.left) / r.width); } : undefined;
  const onKey = seekable ? (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') nudge(track.id, e.key === 'ArrowRight' ? 5 : -5); } : undefined;
  return (
    <span
      ref={ref}
      className="wave"
      role={seekable ? 'slider' : undefined}
      aria-label={seekable ? '播放进度' : undefined}
      aria-hidden={seekable ? undefined : 'true'}
      tabIndex={seekable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKey}
      style={{ height, WebkitMaskImage: url, maskImage: url, '--wave-acc': accRaw(track.hue), cursor: seekable ? 'pointer' : undefined, ...style }}
    />
  );
}

/** The time played of a track, written by the store like the waveform's progress. */
export function Played({ track, style }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => showProgress(ref.current, track.id, 'time'), [track.id]);
  return <span ref={ref} style={style}>0:00</span>;
}
