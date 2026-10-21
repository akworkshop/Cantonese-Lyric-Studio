import { NextResponse } from 'next/server';
import { getPhrasePrimary0243 } from '@/lib/cantonese';

export interface CantonHymnPhraseItem {
  text: string;
  pattern: string;
  jyutping: string;
  songTitle: string;
}

export interface CantonHymnSongItem {
  songId: number;
  title: string;
  author: string;
  category: 'hot' | 'latest' | 'classic';
  lines: {
    text: string;
    pattern: string;
  }[];
}

const FALLBACK_CANTONHYMN_SONGS: {
  songId: number;
  title: string;
  person: string;
  category: 'hot' | 'latest' | 'classic';
  lyrics: string;
}[] = [
  {
    songId: 10032,
    title: '安靜 (Still)',
    person: '周巽光 Ewen (CantonHymn 經典)',
    category: 'classic',
    lyrics: `藏我在 翅膀蔭下
遮蓋我 在祢大能手中
當大海翻騰 波濤洶湧
我與祢展翅 暴風上空
父祢仍作王 在洪水中
我要安靜 知祢是神
我靈安息 在基督裡
祢大能 使我安然信靠`,
  },
  {
    songId: 27287,
    title: '恩典之路 (粵語版)',
    person: 'Sonny Cheung',
    category: 'latest',
    lyrics: `全因主耶穌 導向正義路程
在高山或低谷裡 永得著祢保守
人海中唯一 是祢愛來引導
唯有祢應許不變 這一生滿佈祝福
人生的每步 全是恩典路途
天父的愛 時常在環繞我
一步一步 是祢愛伴這生路向`,
  },
  {
    songId: 25194,
    title: '儘管我尚未看見',
    person: 'Alistair Yiu @Sunset Worship',
    category: 'hot',
    lyrics: `浪還在每刻翻騰 處處有暗湧
想找一個海港 能靠岸
當風沙遮蔽遠方 神祢是我依傍
滔天翻湧過海浪 仍是我安息港
在祢蔭下可安躺
儘管我這刻看不見 還沒看得見
我也願屈膝祢面前 稱揚祢美善
我也願相信祢 恩光總照遍`,
  },
  {
    songId: 22165,
    title: '主祢知道',
    person: '黃頌言 Ode、Glory Cheung',
    category: 'hot',
    lyrics: `軟弱 主祢知道 疲乏 主已知道
更知道 我渴慕 我心裡 那愛慕
這一切 祢都知道
縱使我曾軟弱 祢卻沒有捨棄
願一生跟主 奉上給祢
我不回首 向前走
祢應許不改變 必施恩看顧
賜我勇氣走上 新的方向`,
  },
  {
    songId: 9660,
    title: '當我抬頭仰望',
    person: '胡斯漢 James / Eddie Cheung',
    category: 'hot',
    lyrics: `當我抬頭仰望 祢手造的天
深知祢 多麼愛我 遠超過一切
患難困苦 死蔭幽谷
也無法 將我與祢的愛隔絕
不再悲傷 不再徬徨
祢的愛 擁抱我 遮蓋了一切`,
  },
  {
    songId: 26907,
    title: '有時',
    person: '李漫渟 Deborah Manting',
    category: 'hot',
    lyrics: `萬事都有定時 哭笑生死有時
各按其時在祢手 信靠著祢旨意
祢所做必永存 回望著祢的恩典處處
靠著愛我的主 已得勝有餘
高處或低處 現在或將來
不能叫我與祢 愛分開`,
  },
  {
    songId: 25583,
    title: '我的名字在祢心上',
    person: 'Glory Cheung',
    category: 'hot',
    lyrics: `重投祢愛的擁抱 從來不捨棄我
原是祢恩典與愛捉緊我
我的名字藏在祢心 刻在祢心上
無人可阻隔 祢對我的愛
一生不改變 單單屬祢`,
  },
];

function cleanChordLyrics(rawLyrics: string): string[] {
  return rawLyrics
    .replace(/\[[^\]]*\]/g, '') // 移除和弦標記如 [G] [Cmaj7] [|D]
    .replace(/\([^)]*\)/g, '') // 移除括號備註
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(Verse|Chorus|Pre-?Chorus|Bridge|Intro|Outro|Coda|Tag|Rap|Music|Voice)/i.test(line)) {
        return false;
      }
      const chineseCount = (line.match(/[\u4e00-\u9fa5]/g) || []).length;
      return chineseCount >= 2;
    });
}

export async function GET() {
  let rawSongs = [...FALLBACK_CANTONHYMN_SONGS];
  let liveConnected = false;
  let stats = {
    cantonTranslatedSongs: 11850,
    cantonOriginalSongs: 7129,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch('https://cantonhymn.net/api/homepage-info-list.php', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.data) {
        liveConnected = true;
        if (json.data.songCount) {
          stats = {
            cantonTranslatedSongs: json.data.songCount.cantonTranslatedSongs || 11850,
            cantonOriginalSongs: json.data.songCount.cantonOriginalSongs || 7129,
          };
        }

        const hotList = Array.isArray(json.data.hotSongs) ? json.data.hotSongs : [];
        const latestList = Array.isArray(json.data.latestSongs) ? json.data.latestSongs : [];

        const fetchedSongs: typeof FALLBACK_CANTONHYMN_SONGS = [];
        for (const s of hotList) {
          if (s?.title && s?.lyrics && /[\u4e00-\u9fa5]/.test(s.title)) {
            fetchedSongs.push({
              songId: Number(s.songId) || Math.random(),
              title: String(s.title).trim(),
              person: String(s.person || s.author || 'CantonHymn').trim(),
              category: 'hot',
              lyrics: String(s.lyrics),
            });
          }
        }
        for (const s of latestList) {
          if (s?.title && s?.lyrics && /[\u4e00-\u9fa5]/.test(s.title)) {
            fetchedSongs.push({
              songId: Number(s.songId) || Math.random(),
              title: String(s.title).trim(),
              person: String(s.person || s.author || 'CantonHymn').trim(),
              category: 'latest',
              lyrics: String(s.lyrics),
            });
          }
        }

        if (fetchedSongs.length > 0) {
          const seenTitles = new Set(fetchedSongs.map((s) => s.title));
          rawSongs = [
            ...fetchedSongs,
            ...FALLBACK_CANTONHYMN_SONGS.filter((f) => !seenTitles.has(f.title)),
          ];
        }
      }
    }
  } catch {
    // 網路離線或逾時時自動使用內建 CantonHymn 精選歌庫
  }

  const songs: CantonHymnSongItem[] = [];
  const phraseMap = new Map<string, CantonHymnPhraseItem>();

  for (const item of rawSongs) {
    const cleanedLines = cleanChordLyrics(item.lyrics);
    const parsedLines: { text: string; pattern: string }[] = [];

    for (const rawLine of cleanedLines) {
      // 以空格或標點切分出短語詞組
      const segments = rawLine
        .split(/[\s，。、！？；：,.!?;:　]+/)
        .map((seg) => seg.replace(/[^\u4e00-\u9fa5]/g, ''))
        .filter((seg) => seg.length >= 2 && seg.length <= 7);

      if (segments.length === 0) continue;

      const linePatterns: string[] = [];
      for (const seg of segments) {
        const info = getPhrasePrimary0243(seg);
        if (!info.pattern || info.pattern.includes('?')) continue;
        linePatterns.push(info.pattern);

        if (!phraseMap.has(seg)) {
          phraseMap.set(seg, {
            text: seg,
            pattern: info.pattern,
            jyutping: info.jyutpings.join(' '),
            songTitle: item.title,
          });
        }
      }

      if (linePatterns.length > 0) {
        parsedLines.push({
          text: segments.join(' '),
          pattern: linePatterns.join(' '),
        });
      }
    }

    if (parsedLines.length > 0) {
      songs.push({
        songId: item.songId,
        title: item.title,
        author: item.person,
        category: item.category,
        lines: parsedLines.slice(0, 12),
      });
    }
  }

  return NextResponse.json({
    liveConnected,
    sourceUrl: 'http://cantonhymn.net/',
    stats,
    songs,
    phrases: Array.from(phraseMap.values()),
  });
}
