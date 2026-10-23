import { CANTONHYMN_CLASSIC_CORPUS } from './cantonhymn-classics';
import { SCRIPTURE_PHRASE_CORPUS } from './scripture-phrases';
import { THEOLOGICAL_LEXICON_CORPUS } from './theological-lexicon';
import { CONTEMPORARY_WORSHIP_CORPUS } from './contemporary-worship';
import { NATURE_CREATION_CORPUS } from './nature-creation';
import { SPIRITUAL_WARFARE_CORPUS } from './spiritual-warfare';
import { INTIMACY_PRAYER_CORPUS } from './intimacy-prayer';

export {
  CANTONHYMN_CLASSIC_CORPUS,
  SCRIPTURE_PHRASE_CORPUS,
  THEOLOGICAL_LEXICON_CORPUS,
  CONTEMPORARY_WORSHIP_CORPUS,
  NATURE_CREATION_CORPUS,
  SPIRITUAL_WARFARE_CORPUS,
  INTIMACY_PRAYER_CORPUS,
};

/**
 * 完整匯聚 7 大維度深度擴充之粵語敬拜聖詩專屬語料庫：
 * 1. CantonHymn 經典聖詩與現代粵譯庫（普天頌讚、青年聖歌、現代CantonHymn）
 * 2. 聖經名句與詩篇金句庫（詩篇、先知書、登山寶訓、愛篇、主禱文）
 * 3. 基督教神學大辭典與成語典故庫（三一論、救贖代贖、成聖、聖靈果子、聖經成語）
 * 4. 當代粵語流行敬拜常用語庫 (同心圓、玻璃海、ACM、原始和聲、角聲)
 * 5. 天地造化與穹蒼自然景觀庫（穹蒼星宿、晨曦破曉、深海汪洋、春雨甘霖）
 * 6. 屬靈爭戰與剛強誇勝庫（全副軍裝、折斷鎖鏈、擊退黑暗、得勝旌旗）
 * 7. 親近契合與內室深情禱告庫（內室相遇、細聽微聲、撫平淚水、如鹿切慕）
 */
export const ALL_EXPANDED_WORSHIP_CORPUS: string[] = Array.from(
  new Set([
    ...CANTONHYMN_CLASSIC_CORPUS,
    ...SCRIPTURE_PHRASE_CORPUS,
    ...THEOLOGICAL_LEXICON_CORPUS,
    ...CONTEMPORARY_WORSHIP_CORPUS,
    ...NATURE_CREATION_CORPUS,
    ...SPIRITUAL_WARFARE_CORPUS,
    ...INTIMACY_PRAYER_CORPUS,
  ])
);
