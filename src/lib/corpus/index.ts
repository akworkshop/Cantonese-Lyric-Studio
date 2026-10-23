import { CANTONHYMN_CLASSIC_CORPUS } from './cantonhymn-classics';
import { SCRIPTURE_PHRASE_CORPUS } from './scripture-phrases';
import { THEOLOGICAL_LEXICON_CORPUS } from './theological-lexicon';
import { CONTEMPORARY_WORSHIP_CORPUS } from './contemporary-worship';

export {
  CANTONHYMN_CLASSIC_CORPUS,
  SCRIPTURE_PHRASE_CORPUS,
  THEOLOGICAL_LEXICON_CORPUS,
  CONTEMPORARY_WORSHIP_CORPUS,
};

/**
 * 完整匯聚 4 大範疇的擴充詩歌語料庫：
 * 1. CantonHymn 經典聖詩與現代粵譯庫
 * 2. 聖經名句與詩篇金句庫
 * 3. 基督教神學大辭典與成語典故庫
 * 4. 當代粵語流行敬拜常用語庫 (同心圓、玻璃海、ACM、原始和聲、角聲)
 */
export const ALL_EXPANDED_WORSHIP_CORPUS: string[] = Array.from(
  new Set([
    ...CANTONHYMN_CLASSIC_CORPUS,
    ...SCRIPTURE_PHRASE_CORPUS,
    ...THEOLOGICAL_LEXICON_CORPUS,
    ...CONTEMPORARY_WORSHIP_CORPUS,
  ])
);
