// The catalogue. Everything here is invented.
export const ARTISTS = {
  vl: { id: 'vl', name: 'Vesper Loom', from: '里斯本', since: 2019, bio: '双人组合。用老磁带机和模块合成器做缓慢的氛围音乐，适合延时摄影、航拍和片尾。' },
  ka: { id: 'ka', name: 'Kite Assembly', from: '墨尔本', since: 2021, bio: '四个人的独立流行乐队。吉他明亮，鼓点干净，副歌一听就记得住。' },
  lt: { id: 'lt', name: 'Low Tide Radio', from: '首尔', since: 2020, bio: '卧室制作人。把雨声、唱片底噪和电钢琴揉在一起，节拍永远慢半拍。' },
  tr: { id: 'tr', name: 'Tamsin Rook', from: '柏林', since: 2018, bio: '俱乐部出身的制作人。低频扎实，律动利落，常被用在产品片和运动短片里。' },
  nl: { id: 'nl', name: 'Nomi & the Lanterns', from: '波特兰', since: 2022, bio: '原声民谣小队。木吉他、手风琴和三部和声，录音里听得见房间。' },
  bm: { id: 'bm', name: 'Brass Meridian', from: '新奥尔良', since: 2017, bio: '七人铜管放克乐团。现场一次录完，不修音，热闹得像街头游行。' },
};

export const TRACKS = [
  { id: 't1', title: 'Glass Harbour', a: 'vl', bpm: 92, key: 'A min', dur: 192, genre: '氛围电子', moods: ['平静', '梦幻'], hue: 205, energy: 2, year: 2025 },
  { id: 't2', title: 'Paper Kites at Noon', a: 'ka', bpm: 118, key: 'D maj', dur: 167, genre: '独立流行', moods: ['明亮', '希望'], hue: 52, energy: 4, year: 2026 },
  { id: 't3', title: 'Slow Ember', a: 'lt', bpm: 74, key: 'F♯ min', dur: 245, genre: 'Lo-fi', moods: ['慵懒', '温暖'], hue: 24, energy: 1, year: 2024 },
  { id: 't4', title: 'Night Bus, Last Stop', a: 'tr', bpm: 126, key: 'G min', dur: 218, genre: 'House', moods: ['律动', '都市'], hue: 288, energy: 4, year: 2026 },
  { id: 't5', title: 'Salt & Static', a: 'lt', bpm: 85, key: 'C maj', dur: 178, genre: 'Lo-fi', moods: ['慵懒', '平静'], hue: 168, energy: 2, year: 2025 },
  { id: 't6', title: 'Meridian Parade', a: 'bm', bpm: 104, key: 'B♭ maj', dur: 141, genre: '放克', moods: ['明亮', '复古'], hue: 12, energy: 5, year: 2023 },
  { id: 't7', title: 'Undertow', a: 'vl', bpm: 60, key: 'E min', dur: 320, genre: '电影配乐', moods: ['紧张', '梦幻'], hue: 236, energy: 3, year: 2026 },
  { id: 't8', title: 'Lantern Field', a: 'nl', bpm: 98, key: 'A maj', dur: 206, genre: '民谣', moods: ['温暖', '希望'], hue: 84, energy: 3, year: 2025 },
  { id: 't9', title: 'Chrome Orchard', a: 'tr', bpm: 140, key: 'D min', dur: 182, genre: '鼓打贝斯', moods: ['律动', '紧张'], hue: 322, energy: 5, year: 2026 },
  { id: 't10', title: 'First Light Protocol', a: 'ka', bpm: 110, key: 'E maj', dur: 156, genre: '合成器流行', moods: ['明亮', '都市'], hue: 186, energy: 4, year: 2024 },
  { id: 't11', title: 'Tin Roof Rain', a: 'nl', bpm: 68, key: 'G maj', dur: 230, genre: '民谣', moods: ['平静', '温暖'], hue: 142, energy: 1, year: 2023 },
  { id: 't12', title: 'Velvet Static', a: 'bm', bpm: 96, key: 'C min', dur: 195, genre: '放克', moods: ['复古', '慵懒'], hue: 346, energy: 3, year: 2025 },
];
TRACKS.forEach((t, i) => { t.n = i; });

export const byId = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
export const artistOf = (t) => ARTISTS[t.a];
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const MOODS = ['平静', '明亮', '慵懒', '律动', '温暖', '紧张', '希望', '复古', '梦幻', '都市'];
const MOOD_NOTE = ['呼吸放慢的时候', '阳光直射的画面', '周日下午三点', '让画面跟着点头', '有人在场的房间', '镜头慢慢推近', '结尾往上扬', '带一点颗粒', '焦点之外', '霓虹和玻璃幕墙'];
export const GENRES = [...new Set(TRACKS.map((t) => t.genre))];
export const PLAYLISTS = [
  { id: 'p1', name: '清晨剪辑', note: '给日出、咖啡和空镜头', ids: ['t1', 't11', 't5', 't8', 't3'] },
  { id: 'p2', name: '旅行 Vlog', note: '明亮、往前走的拍子', ids: ['t2', 't8', 't10', 't6'] },
  { id: 'p3', name: '夜间驾驶', note: '路灯一盏一盏往后退', ids: ['t4', 't7', 't9', 't12', 't1'] },
  { id: 'p4', name: '产品演示', note: '干净，有推进感，不抢旁白', ids: ['t10', 't4', 't2', 't9'] },
];
export const STEMS = ['鼓', '贝斯', '旋律', '氛围'];

/** kind: 'mood' (id = index into MOODS), 'genre' (id = index into GENRES), 'playlist' (id = playlist id). */
export function collection(kind, id) {
  if (kind === 'playlist') {
    const p = PLAYLISTS.find((x) => x.id === id);
    return p ? { eyebrow: '歌单', title: p.name, note: p.note, tracks: p.ids.map((i) => byId[i]) } : null;
  }
  if (kind === 'mood') {
    const m = MOODS[+id];
    return m ? { eyebrow: '情绪', title: m, note: MOOD_NOTE[+id], tracks: TRACKS.filter((t) => t.moods.includes(m)) } : null;
  }
  const g = GENRES[+id];
  return g ? { eyebrow: '类型', title: g, note: '这个类型下的全部曲目', tracks: TRACKS.filter((t) => t.genre === g) } : null;
}

export function similar(t) {
  return TRACKS.filter((o) => o !== t)
    .map((o) => ({ o, s: (o.genre === t.genre ? 3 : 0) + o.moods.filter((m) => t.moods.includes(m)).length * 2 - Math.abs(o.bpm - t.bpm) / 20 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.o);
}
