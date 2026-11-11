// The offer of a new version of the page, inside the Expo app (lib/shell-bridge.js): a glass card at the top, with
// "下次打开 App 时生效" and "更新". Only for a "medium" update; light ones are used from the next launch without a word,
// urgent ones at once.
import * as React from 'react';
import { Text, View } from 'react-native';
import { Tap, GLASS_PRESS } from './Tap';
import { useColors } from './theme';
import { onUpdateOffer, post } from '../lib/shell-bridge';

export function UpdateNotice() {
  const c = useColors();
  const [offer, setOffer] = React.useState(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => onUpdateOffer((o) => {
    setOffer(o);
    post({ type: 'update-shown', version: o && o.version });
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));     // in from above, on a spring
  }), []);
  if (!offer) return null;
  const answer = (now) => {
    setShown(false);
    window.__depthMusicUpdate = null;
    post({ type: 'update', now, version: offer.version });
    setTimeout(() => setOffer(null), 400);
  };
  return (
    <div className={'update-notice glass' + (shown ? ' on' : '')} role="alertdialog" aria-label="新版本">
      <View>
        <Text style={{ color: c.fg, fontSize: 15, fontWeight: '600' }}>新版本已经下载好了</Text>
        <Text style={{ color: c.fg2, fontSize: 13.5, marginTop: 3, lineHeight: 19 }}>{offer.note || '现在更新会重新载入页面。'}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, gap: 6 }}>
        <Tap onPress={() => answer(false)} label="下次打开 App 时生效"
          style={{ paddingHorizontal: 12, height: 36, justifyContent: 'center', borderRadius: 18 }}>
          <Text style={{ color: c.fg2, fontSize: 14 }}>下次打开 App 时生效</Text>
        </Tap>
        <Tap onPress={() => answer(true)} label="更新" pressed={GLASS_PRESS}
          style={{ paddingHorizontal: 18, height: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: c.fg }}>
          <Text style={{ color: c.bg, fontSize: 14, fontWeight: '600' }}>更新</Text>
        </Tap>
      </View>
    </div>
  );
}
export default UpdateNotice;
