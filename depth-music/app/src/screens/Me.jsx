import * as React from 'react';
import { View, Text, Platform } from 'react-native';
import { Big, Lede, Fine, RootHead, Section, Stats, SetRow, ArtistDisc } from '../ui/parts';
import { Segmented } from '../ui/Segmented';
import { themed } from '../ui/themed';
import { TRACKS, ARTISTS } from '../data';
import { Tap } from '../ui/Tap';
import { useStore, set, setChromeMode } from '../state';
import { CHROME_MODES } from '../lib/chrome-mode';
import { DEPTH_MODES, getDepthSetting, saveDepthSetting, getDepthMode } from '../lib/depth-mode';
import { getDriver, setDriver } from '../lib/driver';

const WEB = Platform.OS === 'web';
const BUILD = typeof __BUILD__ === 'undefined' ? '' : __BUILD__;      // set by the web build only
const HOW = [
  '点任意曲目，播放器从下面升上来；往下一拉就收走。它和别的页面不一样，任何时候都是这样出现。',
  '点歌单、情绪、音乐人进入下一页：原来那页原地缩小、下沉、虚化，留在后面当背景。',
  WEB
    ? '在页面任意位置向右滑返回，后面那页跟着手指回到焦点。电脑上用触控板双指横滑，或点左上角的返回。'
    : '在页面任意位置向右滑返回，后面那页跟着手指回到焦点。也可以点左上角的返回。',
  WEB ? '右上角的圆钮切换浅色和深色，新主题从按钮处一圈圈铺开。' : '右上角的圆钮切换浅色和深色。',
  '按住底栏拖动，小圆点跟着手指走，经过哪个页签就切到哪个。再点一次当前页签回到第一页。',
];

export default function Me() {
  const S = useS();
  const bar = useStore((s) => s.bar);
  const [fmt, setFmt] = React.useState(0);
  const [lufs, setLufs] = React.useState(0);

  return (
    <>
      <RootHead><Big>我的</Big></RootHead>

      <View style={S.who}>
        <ArtistDisc artist={{ ...ARTISTS.nl, hue: 64 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={S.name}>山岚工作室</Text>
          <Lede>创作者方案 · 2027 年 3 月到期</Lede>
        </View>
      </View>
      <Stats items={[['12', '本月下载'], ['2 / 3', '已授权频道'], [String(TRACKS.length), '曲库示例曲目']]} />

      <Section title="界面">
        <SetRow title="底部播放条" note={WEB ? '在它上面左右滑切歌，点一下打开播放器' : '点一下打开播放器'} last>
          <Segmented label="底部播放条" items={['隐藏', '显示']} index={bar ? 1 : 0} onChange={(i) => set({ bar: i === 1 })} />
        </SetRow>
      </Section>

      <Section title="下载">
        <View>
          <SetRow title="格式" note="WAV 为 48 kHz / 24 bit">
            <Segmented label="下载格式" items={['WAV', 'MP3']} index={fmt} onChange={setFmt} />
          </SetRow>
          <SetRow title="响度" note="下载时统一到这个目标" last>
            <Segmented label="目标响度" items={['-14', '-16', '-23']} index={lufs} onChange={setLufs} />
          </SetRow>
        </View>
        <Fine>响度单位 LUFS：-14 适合视频平台，-23 是广播标准。</Fine>
      </Section>

      <Section title="这个原型怎么玩">
        <View style={{ gap: 10 }}>
          {HOW.map((t) => (
            <View key={t} style={S.li}><Text style={S.bullet}>·</Text><Text style={S.liText}>{t}</Text></View>
          ))}
        </View>
        <Fine>曲目、音乐人和数据都是虚构的。原型不含音频，播放进度是模拟的。</Fine>
        <Fine>{WEB ? `版本 ${BUILD} · React Native（react-native-web）` : `React Native · ${Platform.OS === 'ios' ? 'iOS' : 'Android'}（Expo）`}</Fine>
      </Section>

      {WEB ? <DepthSection /> : null}
      {WEB ? <ChromeSection /> : null}
      {WEB ? <GestureSection /> : null}
      {WEB ? <FitSection /> : null}
    </>
  );
}

// One choice out of several, each with a line of explanation: [{ key, title, note }].
function Picks({ items, value, onPick }) {
  const S = useS();
  return (
    <View>
      {items.map((m, i) => (
        <Tap key={m.key} role="radio" aria-checked={m.key === value} label={m.title} onPress={() => onPick(m.key)}
          style={[S.pick, i === items.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={S.pickTitle}>{m.title}</Text>
            <Text style={S.pickNote}>{m.note}</Text>
          </View>
          <View style={[S.ring, m.key === value && S.ringOn]}>{m.key === value ? <View style={S.ringDot} /> : null}</View>
        </Tap>
      ))}
    </View>
  );
}

// Web only: how the page behind goes out of focus (lib/depth-mode.js). Several ways, to compare on a device.
function DepthSection() {
  const [mode, setMode] = React.useState(getDepthSetting);
  const inEffect = (DEPTH_MODES.find((m) => m.key === getDepthMode()) || {}).title;
  return (
    <Section title="后面那页怎么变虚">
      <Picks items={DEPTH_MODES} value={mode} onPick={(k) => { saveDepthSetting(k); setMode(k); }} />
      <Fine>对之后打开的页面和播放器生效。{mode === 'auto' ? `这个浏览器里“自动”用的是：${inEffect}。` : ''}</Fine>
    </Section>
  );
}

// Web only: what the tab row does while the player is up. Several ways, to compare on a device.
function ChromeSection() {
  const mode = useStore((s) => s.chromeMode);
  return (
    <Section title="播放器升起时的底栏">
      <Picks items={CHROME_MODES} value={mode} onPick={setChromeMode} />
      <Fine>下次打开播放器时生效。前四种把底栏放在后面那一层的外面，只用位移离开（“原地淡出”用毛玻璃自己的 opacity()）；后两种留在里面。</Fine>
    </Section>
  );
}

// Web only: which ScrollGesture driver the page turns and the player use.
function GestureSection() {
  const [d, setD] = React.useState(() => (getDriver() === 'js' ? 1 : 0));
  return (
    <Section title="手势方案">
      <SetRow title="翻页和播放器的手势" note="对之后打开的页面生效" last>
        <Segmented label="手势方案" items={['原生滚动', 'JS']} index={d} onChange={(i) => { setD(i); setDriver(i ? 'js' : 'scroll'); }} />
      </SetRow>
      <Fine>原生滚动：拖动就是浏览器自己的滚动和吸附，不占主线程。JS：触摸事件加弹簧，每一帧都由脚本算，可以在半路接住。</Fine>
    </Section>
  );
}

// Web only: the manual switch for the home-screen full-height workaround, and the numbers behind it.
const FIT = ['auto', 'on', 'off'];
function fitText() {
  const f = window.__fit;
  if (!f) return '';
  const r = document.getElementById('app').getBoundingClientRect();
  return `现在：${f.short ? '已上移' : '未上移'} · 屏幕 ${f.screen} · 100vh ${f.vh} · innerHeight ${f.inner} · 上安全区 ${f.top} · 主屏幕全屏模式 ${f.full ? '是' : '否'} · 容器 top ${Math.round(r.top)} 高 ${Math.round(r.height)}`;
}
function FitSection() {
  const [fit, setFit] = React.useState(() => Math.max(0, FIT.indexOf((window.__fit || {}).mode)));
  const [info, setInfo] = React.useState(fitText);
  React.useEffect(() => { const t = setTimeout(() => setInfo(fitText()), 800); return () => clearTimeout(t); }, [fit]);
  if (!window.__fit) return null;
  return (
    <Section title="铺满整屏">
      <SetRow title="把容器上移一个上安全区" note="高度 100vh + 上安全区，top 为负的上安全区" last>
        <Segmented label="铺满整屏" items={['自动', '开', '关']} index={fit} onChange={(i) => { setFit(i); window.__setFit(FIT[i]); setInfo(fitText()); }} />
      </SetRow>
      <Fine>{info}</Fine>
    </Section>
  );
}

const useS = themed((c, f) => ({
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { ...f.display, fontSize: 24, lineHeight: 30, letterSpacing: 1, color: c.fg },
  li: { flexDirection: 'row', gap: 8 },
  bullet: { ...f.text, fontSize: 15, lineHeight: 23, color: c.fg3 },
  liText: { ...f.text, flex: 1, fontSize: 15, lineHeight: 23, color: c.fg2 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.hair },
  pickTitle: { ...f.text, fontSize: 15, lineHeight: 21, color: c.fg },
  pickNote: { ...f.text, fontSize: 12.5, lineHeight: 18, color: c.fg2 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.fg3, alignItems: 'center', justifyContent: 'center' },
  ringOn: { borderColor: c.fg },
  ringDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.fg },
}));
