import ToJyutping from 'to-jyutping';
import {
  LyricLine,
  LyricToken,
  LyricWordGroup,
  TokenStatus,
  VocalErgonomicsInfo,
} from '@/types/lyric';
import { ALL_EXPANDED_WORSHIP_CORPUS } from '@/lib/corpus';

/**
 * 基督教神學與粵語詩歌常用字詞優先審音表（補充神學代名詞與詩歌文讀首選音）
 */
const THEOLOGICAL_JYUTPING_OVERRIDES: Record<string, string[]> = {
  祂: ['taa1'],
  祢: ['nei5'],
  你: ['nei5'],
  我: ['ngo5'],
  主: ['zyu2'],
  神: ['san4'],
  聖: ['sing3'],
  靈: ['ling4'],
  耶: ['je4'],
  穌: ['sou1'],
  基: ['gei1'],
  督: ['duk1'],
  恩: ['jan1'],
  愛: ['ngoi3', 'oi3'],
  信: ['seon3'],
  望: ['mong6'],
  敬: ['ging3'],
  拜: ['baai3'],
  讚: ['zaan3'],
  美: ['mei5'],
  榮: ['wing4'],
  耀: ['jiu6'],
  哈: ['haa1'],
  利: ['lei6'],
  路: ['lou6'],
  亞: ['jaa3', 'aa3'],
  阿: ['aa3', 'o1'],
  們: ['mun4'],
  十: ['sap6'],
  架: ['gaa3'],
  救: ['gau3'],
  贖: ['zuk6', 'suk6'],
  寶: ['bou2'],
  血: ['hyut3'],
  羔: ['gou1'],
  羊: ['joeng4'],
  天: ['tin1'],
  父: ['fu6'],
  全: ['cyun4'],
  能: ['nang4'],
  永: ['wing5'],
  恆: ['hang4'],
  光: ['gwong1'],
  真: ['zan1'],
  道: ['dou6'],
  生: ['sang1', 'saang1'],
  命: ['ming6'],
  平: ['ping4'],
  安: ['ngon1', 'on1'],
  喜: ['hei2'],
  樂: ['lok6', 'ngok6'],
  盼: ['paan3'],
  仰: ['joeng5'],
  靠: ['kaau3'],
  頌: ['zung6'],
  揚: ['joeng4'],
  歌: ['go1'],
  唱: ['coeng3'],
  尊: ['zyun1'],
  崇: ['sung4'],
  高: ['gou1'],
  舉: ['geoi2'],
  謙: ['him1'],
  卑: ['bei1'],
  順: ['seon6'],
  服: ['fuk6'],
  行: ['hang4', 'haang4'],
  看: ['hon3'],
  重: ['zung6', 'cung4'],
  為: ['wai6', 'wai4'],
  降: ['gong3'],
  臨: ['lam4'],
  同: ['tung4'],
  在: ['zoi6'],
  裡: ['leoi5'],
  裏: ['leoi5'],
  伴: ['bun6'],
  牽: ['hin1'],
  撫: ['fu2'],
  聽: ['ting1', 'teng1'],
  共: ['gung6'],
  親: ['can1'],
  風: ['fung1'],
  雲: ['wan4'],
  雨: ['jyu5'],
  浪: ['long6'],
  聲: ['sing1'],
  暖: ['nyun5'],
  長: ['coeng4'],
  微: ['mei4'],
  奇: ['kei4'],
  難: ['naan6', 'naan4'],
  患: ['waan6'],
  掌: ['zoeng2'],
  權: ['kyun4'],
  王: ['wong4'],
  惶: ['wong4'],
  驚: ['ging1', 'geng1'],
  怕: ['paa3'],
  懼: ['geoi6'],
  困: ['kwan3'],
  境: ['ging2'],
  苦: ['fu2'],
  勝: ['sing3'],
  座: ['zo6'],
  穩: ['wan2'],
  暴: ['bou6'],
  湧: ['jung2'],
  洶: ['hung1'],
  翻: ['faan1'],
  騰: ['tang4'],
  蔭: ['jam3'],
  翼: ['jik6'],
  翅: ['ci3'],
  膀: ['bong2'],
  遮: ['ze1'],
  蓋: ['goi3'],
  應: ['jing3', 'jing1'],
  許: ['heoi2'],
  刻: ['hak1'],
  名: ['ming4', 'meng2'],
  字: ['zi6'],
  著: ['zoek6', 'zyu3'],
  縱: ['zung3'],
  仍: ['jing4'],
};

/**
 * 將粵拼 1-6 調轉換為 0243 填詞協音音階
 * - 0 (最低音)：陽平 (Tone 4)
 * - 2 (中低音)：陽上 (Tone 5)、陽去 (Tone 6)、陽入 (Tone 6 + p/t/k)
 * - 4 (次高音)：陰去 (Tone 3)、中入 (Tone 3 + p/t/k)
 * - 3 (最高音)：陰平 (Tone 1)、陰上 (Tone 2)、陰入 (Tone 1 + p/t/k)
 */
export function jyutpingTo0243(jyutping: string): {
  tone0243: string;
  toneNum: number;
  toneName: string;
  rhyme: string;
  isStopped: boolean;
  isClosedM: boolean;
} {
  const cleaned = jyutping.trim().toLowerCase();
  const match = cleaned.match(/^([a-z]+?)([1-6])$/);
  if (!match) {
    return {
      tone0243: '?',
      toneNum: 0,
      toneName: '未知',
      rhyme: '',
      isStopped: false,
      isClosedM: false,
    };
  }

  const syllable = match[1];
  const toneNum = parseInt(match[2], 10);

  const rhymeMatch = syllable.match(/^(?:gw|kw|ng|[bpmfdtnlgkhwzcsj])?(.*)$/);
  const rhyme = rhymeMatch ? rhymeMatch[1] : syllable;

  const isStopped = /[ptk]$/.test(syllable);
  const isClosedM = /m$/.test(syllable) && syllable !== 'm';

  let tone0243 = '?';
  let toneName = '';

  switch (toneNum) {
    case 1:
      tone0243 = '3';
      toneName = isStopped ? '陰入(3)' : '陰平(3)';
      break;
    case 2:
      tone0243 = '3';
      toneName = '陰上(3)';
      break;
    case 3:
      tone0243 = '4';
      toneName = isStopped ? '中入(4)' : '陰去(4)';
      break;
    case 4:
      tone0243 = '0';
      toneName = '陽平(0)';
      break;
    case 5:
      tone0243 = '2';
      toneName = '陽上(2)';
      break;
    case 6:
      tone0243 = '2';
      toneName = isStopped ? '陽入(2)' : '陽去(2)';
      break;
  }

  return {
    tone0243,
    toneNum,
    toneName,
    rhyme,
    isStopped,
    isClosedM,
  };
}

/**
 * 查詢單一漢字的現代粵語常讀粵拼（優先使用詩歌審音表，避免罕見古音干擾協音判斷）
 */
export function getCharJyutpingCandidates(char: string): string[] {
  const trimmed = char.trim();
  if (!trimmed) return [];

  const override = THEOLOGICAL_JYUTPING_OVERRIDES[trimmed];
  if (override && override.length > 0) {
    return override;
  }

  const candidates = new Set<string>();
  try {
    const primary = ToJyutping.getJyutpingText(trimmed);
    if (primary && /^[a-z]+[1-6]$/.test(primary)) {
      candidates.add(primary);
    }
    const candList = ToJyutping.getJyutpingCandidates(trimmed);
    if (candList && candList.length > 0 && Array.isArray(candList[0][1])) {
      for (const cand of candList[0][1]) {
        if (cand && /^[a-z]+[1-6]$/.test(cand)) {
          candidates.add(cand);
        }
      }
    }
  } catch {
    // ignore rare symbols
  }

  return Array.from(candidates);
}

/**
 * 評估單字在特定位置（是否詞尾/句尾、是否高音 3/4）的聲樂發音人體工學
 */
export function evaluateVocalErgonomics(
  jyutping: string,
  expectedTone: string,
  isGroupEnd: boolean
): VocalErgonomicsInfo {
  const info = jyutpingTo0243(jyutping);
  const isHighNote = expectedTone === '3' || expectedTone === '4';

  const isWideOpenVowel = /^(aa|aai|aau|aan|aang|o|oi|on|ong|e|eng|oe|oeng)$/.test(
    info.rhyme
  );

  if (info.isStopped) {
    return {
      rating: isGroupEnd && isHighNote ? 'warning_stopped' : 'caution_closed',
      endingType: 'stopped_ptk',
      rhyme: info.rhyme,
      note:
        isGroupEnd && isHighNote
          ? `塞音尾 (-${info.rhyme.slice(-1)}) 屬入聲促音，高音 (${expectedTone}) 句尾無法拖長音`
          : `入聲塞音尾 (-${info.rhyme.slice(-1)})，短促有力`,
    };
  }

  if (info.isClosedM) {
    return {
      rating: isGroupEnd && isHighNote ? 'caution_closed' : 'good',
      endingType: 'closed_nasal_m',
      rhyme: info.rhyme,
      note:
        isGroupEnd && isHighNote
          ? `閉口鼻音 (-m) 在高音 (${expectedTone}) 拖音時共鳴較受限`
          : `閉口鼻音尾 (-m)，收音溫柔`,
    };
  }

  if (isWideOpenVowel) {
    return {
      rating: 'excellent',
      endingType: 'open_vowel',
      rhyme: info.rhyme,
      note: `寬開口韻母 (-${info.rhyme})，共鳴開闊，極適合${isHighNote ? `高音 (${expectedTone}) ` : ''}拖音`,
    };
  }

  return {
    rating: 'good',
    endingType: 'semi_open',
    rhyme: info.rhyme,
    note: `自然舒展韻母 (-${info.rhyme})，發音順暢`,
  };
}

/**
 * 填詞實務專屬 0243 聲階覆寫表
 * - 「我、你、祢」在粵語詩歌填詞實務中歸入 4 聲（次高音）
 * - 「更」字為破音字：
 *    - 作副詞「更加」（如：更深、更高、更愛、更加）讀 gang3（陰去，歸入 4 聲）
 *    - 作動詞「更新/更改」（如：更新、更改、更替）讀 gang1（陰平，歸入 3 聲）
 *    由上下文或目標聲調自動對位，不再硬性鎖死為單一聲階。
 */
const CUSTOM_0243_TONE_OVERRIDES: Record<string, string> = {
  我: '4',
  你: '4',
  祢: '4',
};

/**
 * 分析單一漢字與目標 0243 聲階的對位結果，回傳完整 LyricToken 屬性
 */
export function analyzeCharToken(
  char: string,
  expectedTone: string,
  isGroupEnd = false,
  existingId?: string,
  preserveLockedStatus?: TokenStatus,
  contextJyutping?: string
): LyricToken {
  const trimmedChar = char.trim();
  const candidates = getCharJyutpingCandidates(trimmedChar);

  if (candidates.length === 0) {
    return {
      id: existingId || `tok-${Math.random().toString(36).slice(2, 9)}`,
      char,
      expectedTone,
      actualTone: '?',
      allPossibleTones: [],
      jyutping: '',
      cantoneseToneName: '未知',
      status: preserveLockedStatus === 'locked' ? 'locked' : 'tone_mismatch',
    };
  }

  const customTone = CUSTOM_0243_TONE_OVERRIDES[trimmedChar];

  const effectiveCandidates = [...candidates];
  if (contextJyutping && !effectiveCandidates.includes(contextJyutping)) {
    effectiveCandidates.unshift(contextJyutping);
  }

  const parsedList = effectiveCandidates.map((jp) => {
    const info = jyutpingTo0243(jp);
    if (customTone) {
      return {
        jp,
        ...info,
        tone0243: customTone,
        toneName: `${info.toneName.replace(/\(\d\)/, '')}(${customTone})`,
      };
    }
    return {
      jp,
      ...info,
    };
  });

  const allPossibleTones = Array.from(new Set(parsedList.map((p) => p.tone0243)));

  // 選音優先級：
  // 1. 若有上下文語境讀音 (contextJyutping)，且該詞音義已固定（如更深->gang3, 更新->gang1），以語境讀音為主
  // 2. 若無語境讀音或單字查詢，且多音字中有任一讀音符合 expectedTone，選取該協音讀音
  // 3. 否則採用第一常讀音
  let matchedReading = parsedList[0];
  if (contextJyutping) {
    const contextMatch = parsedList.find((p) => p.jp === contextJyutping);
    if (contextMatch) {
      matchedReading = contextMatch;
    }
  } else {
    const toneMatch = parsedList.find((p) => p.tone0243 === expectedTone);
    if (toneMatch) {
      matchedReading = toneMatch;
    }
  }

  const isToneMatch = matchedReading.tone0243 === expectedTone;
  const ergonomics = evaluateVocalErgonomics(
    matchedReading.jp,
    expectedTone,
    isGroupEnd
  );

  let status: TokenStatus = 'normal';
  if (preserveLockedStatus === 'locked') {
    status = isToneMatch ? 'locked' : 'tone_mismatch';
  } else if (preserveLockedStatus === 'needs_change') {
    status = 'needs_change';
  } else if (!isToneMatch) {
    status = 'tone_mismatch';
  }

  return {
    id: existingId || `tok-${Math.random().toString(36).slice(2, 9)}`,
    char,
    expectedTone,
    actualTone: matchedReading.tone0243,
    allPossibleTones,
    jyutping: matchedReading.jp,
    cantoneseToneNum: matchedReading.toneNum,
    cantoneseToneName: matchedReading.toneName,
    status,
    ergonomics,
  };
}

/**
 * 清理並正規化數字譜字串（僅保留 0, 2, 4, 3 與單一空格；自動忽略 Bridge / Verse 1 / 副歌 等段落標題行）
 */
export function normalizeTonePatternLine(rawLine: string): string {
  const trimmed = rawLine.trim();
  if (!trimmed) return '';
  // 若該行包含英文字母（如 Bridge, Verse 1, Chorus 2）或常見中文段落標記（主歌、副歌、橋段），視為段落標題並略過
  if (/[a-zA-Z]/.test(trimmed) || /(主歌|副歌|橋段|前奏|間奏|尾奏|導歌)/.test(trimmed)) {
    return '';
  }
  return trimmed
    .replace(/[^0234\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 將多行 0243 數字譜與對應歌詞文字結合，建構結構化的 LyricLine[]
 */
export function buildLyricLinesFromPatternsAndTexts(
  patternLines: string[],
  lyricTexts?: string[][],
  existingLines?: LyricLine[]
): LyricLine[] {
  return patternLines
    .map((rawPattern, lineIdx) => {
      const cleanPattern = normalizeTonePatternLine(rawPattern);
      if (!cleanPattern) return null;

      const groupPatterns = cleanPattern.split(' ').filter(Boolean);
      const lineGroupTexts = lyricTexts?.[lineIdx] || [];
      const existingLine = existingLines?.[lineIdx];

      // 提取整行文字，獲取全句上下文粵拼（例如「更深」-> gang3, 「更新」-> gang1）
      const fullLineChars: { char: string; gIdx: number; tIdx: number }[] = [];
      groupPatterns.forEach((gPattern, gIdx) => {
        const rawGroupText = (lineGroupTexts[gIdx] || '').replace(/\s+/g, '');
        const chars = Array.from(rawGroupText);
        for (let tIdx = 0; tIdx < gPattern.length; tIdx++) {
          const ch = chars[tIdx] || '';
          if (ch && ch !== '＿') {
            fullLineChars.push({ char: ch, gIdx, tIdx });
          }
        }
      });

      const fullLineText = fullLineChars.map((item) => item.char).join('');
      const contextJpMap: Record<string, string> = {};
      try {
        if (fullLineText) {
          const list = ToJyutping.getJyutpingList(fullLineText);
          if (list && list.length === fullLineChars.length) {
            list.forEach((item, idx) => {
              const meta = fullLineChars[idx];
              if (meta && item && item[1]) {
                contextJpMap[`${meta.gIdx}-${meta.tIdx}`] = item[1];
              }
            });
          }
        }
      } catch {
        // ignore
      }

      const groups: LyricWordGroup[] = groupPatterns.map((gPattern, gIdx) => {
        const rawGroupText = (lineGroupTexts[gIdx] || '').replace(/\s+/g, '');
        const chars = Array.from(rawGroupText);
        const existingGroup = existingLine?.groups?.[gIdx];

        // 若整行上下文未覆蓋，亦可嘗試從該組文字取得詞組上下文
        let groupJpList: [string, string][] = [];
        try {
          if (rawGroupText) {
            const list = ToJyutping.getJyutpingList(rawGroupText);
            if (list && list.length === chars.length) {
              groupJpList = list as [string, string][];
            }
          }
        } catch {
          // ignore
        }

        const tokens: LyricToken[] = Array.from(gPattern).map((expectedTone, tIdx) => {
          const contextJp =
            contextJpMap[`${gIdx}-${tIdx}`] || groupJpList[tIdx]?.[1];
          const existingToken = existingGroup?.tokens?.[tIdx];
          if (existingToken && existingToken.status === 'locked') {
            return analyzeCharToken(
              existingToken.char,
              expectedTone,
              tIdx === gPattern.length - 1,
              existingToken.id,
              'locked',
              contextJp
            );
          }

          const char = chars[tIdx] || '＿';
          const isGroupEnd = tIdx === gPattern.length - 1;
          if (char === '＿') {
            return {
              id: `L${lineIdx}-G${gIdx}-T${tIdx}`,
              char: '＿',
              expectedTone,
              actualTone: '?',
              jyutping: '',
              status: 'needs_change',
            };
          }
          return analyzeCharToken(
            char,
            expectedTone,
            isGroupEnd,
            `L${lineIdx}-G${gIdx}-T${tIdx}`,
            undefined,
            contextJp
          );
        });

        return {
          groupId: `L${lineIdx}-G${gIdx}`,
          targetGroupPattern: gPattern,
          tokens,
        };
      });

      return {
        lineId: `L${lineIdx}`,
        targetPattern: cleanPattern,
        groups,
      };
    })
    .filter((line): line is LyricLine => line !== null);
}

/**
 * 驗證一段中文字詞是否符合目標 0243 pattern（例如 "我深愛祢" vs "4344"）
 */
export function verifyPhraseAgainstPattern(
  phrase: string,
  targetPattern: string
): {
  isExactMatch: boolean;
  actualPattern: string;
  jyutpingList: string[];
  tokens: LyricToken[];
  mismatches: { index: number; char: string; expected: string; actual: string; jyutping: string }[];
  endErgonomics: VocalErgonomicsInfo;
} {
  const cleanChars = Array.from(phrase.replace(/[^\u4e00-\u9fa5]/g, ''));
  const targetTones = Array.from(targetPattern.trim());

  let phraseJpList: [string, string][] = [];
  try {
    const list = ToJyutping.getJyutpingList(cleanChars.join(''));
    if (list && list.length === cleanChars.length) {
      phraseJpList = list as [string, string][];
    }
  } catch {
    // ignore
  }

  const tokens: LyricToken[] = targetTones.map((expected, idx) => {
    const char = cleanChars[idx] || '？';
    const contextJp = phraseJpList[idx]?.[1];
    return analyzeCharToken(
      char,
      expected,
      idx === targetTones.length - 1,
      undefined,
      undefined,
      contextJp
    );
  });

  const actualPattern = tokens.map((t) => t.actualTone).join('');
  const jyutpingList = tokens.map((t) => t.jyutping || '?');
  const mismatches = tokens
    .map((t, idx) => ({
      index: idx,
      char: t.char,
      expected: t.expectedTone,
      actual: t.actualTone,
      jyutping: t.jyutping || '?',
    }))
    .filter((m) => m.expected !== m.actual);

  const isLengthMatch = cleanChars.length === targetTones.length;
  const isExactMatch = isLengthMatch && mismatches.length === 0;

  const lastToken = tokens[tokens.length - 1];
  const endErgonomics: VocalErgonomicsInfo = lastToken?.ergonomics || {
    rating: 'good',
    endingType: 'other',
    rhyme: '',
    note: '',
  };

  return {
    isExactMatch,
    actualPattern,
    jyutpingList,
    tokens,
    mismatches,
    endErgonomics,
  };
}

/**
 * 計算任意純中文詞組的主讀音 0243 pattern 與尾字聲樂特性
 */
export function getPhrasePrimary0243(phrase: string): {
  pattern: string;
  jyutpings: string[];
  lastCharOpenEnding: boolean;
} {
  const clean = phrase.replace(/[^\u4e00-\u9fa5]/g, '');
  const chars = Array.from(clean);
  const tones: string[] = [];
  const jyutpings: string[] = [];

  let phraseList: [string, string][] = [];
  try {
    const list = ToJyutping.getJyutpingList(clean);
    if (list && list.length === chars.length) {
      phraseList = list as [string, string][];
    }
  } catch {
    phraseList = [];
  }

  chars.forEach((ch, idx) => {
    const customTone = CUSTOM_0243_TONE_OVERRIDES[ch];
    let chosenJp = phraseList[idx]?.[1];
    if (!chosenJp) {
      const cands = getCharJyutpingCandidates(ch);
      chosenJp = cands[0] || '';
    }
    const info = jyutpingTo0243(chosenJp);
    tones.push(customTone || info.tone0243);
    jyutpings.push(chosenJp);
  });

  const lastJp = jyutpings[jyutpings.length - 1] || '';
  const lastInfo = jyutpingTo0243(lastJp);
  const lastCharOpenEnding = !lastInfo.isStopped && !lastInfo.isClosedM;

  return {
    pattern: tones.join(''),
    jyutpings,
    lastCharOpenEnding,
  };
}

/**
 * 單字 0243 嚴格分類庫（強化「更(副詞gang3->4聲 / 動詞gang1->3聲)、我/你/祢(4聲)、主/祂(3聲)、神(0聲)」與 CantonHymn 詩意字庫）
 */
export const VERIFIED_CANTONESE_WORSHIP_CHARS: Record<string, string[]> = {
  '0': [
    '神(san4)', '權(kyun4)', '王(wong4)', '惶(wong4)', '靈(ling4)', '同(tung4)',
    '情(cing4)', '全(cyun4)', '常(soeng4)', '行(hang4)', '人(jan4)', '能(nang4)',
    '榮(wing4)', '羊(joeng4)', '恆(hang4)', '平(ping4)', '揚(joeng4)', '崇(sung4)',
    '臨(lam4)', '言(jin4)', '前(cin4)', '憐(lin4)', '連(lin4)', '途(tou4)',
    '無(mou4)', '窮(kung4)', '尋(cam4)', '求(kau4)', '祈(kei4)', '慈(ci4)',
    '和(wo4)', '誠(sing4)', '然(jin4)', '源(jyun4)', '流(lau4)', '泉(cyun4)',
    '雲(wan4)', '晨(san4)', '明(ming4)', '來(loi4)', '誰(seoi4)', '從(cung4)',
    '還(waan4)', '唯(wai4)', '懷(waai4)', '扶(fu4)', '持(ci4)', '陪(pui4)',
    '隨(ceoi4)', '留(lau4)', '存(cyun4)', '長(coeng4)', '微(mei4)', '柔(jau4)',
    '晴(cing4)', '河(ho4)', '霖(lam4)', '愁(sau4)', '煩(faan4)', '迷(mai4)',
    '回(wui4)', '迎(jing4)', '傳(cyun4)', '仍(jing4)', '騰(tang4)', '名(ming4)',
  ],
  '2': [
    '在(zoi6)', '患(waan6)', '難(naan6)', '懼(geoi6)', '大(daai6)', '是(si6)',
    '願(jyun6)', '伴(bun6)', '用(jung6)', '共(gung6)', '為(wai6)', '望(mong6)',
    '仰(joeng5)', '美(mei5)', '永(wing5)', '耀(jiu6)', '路(lou6)', '地(dei6)',
    '道(dou6)', '步(bou6)', '服(fuk6)', '十(sap6)', '贖(zuk6)', '父(fu6)',
    '命(ming6)', '樂(lok6)', '頌(zung6)', '順(seon6)', '義(ji6)', '善(sin6)',
    '護(wu6)', '導(dou6)', '待(doi6)', '罪(zeoi6)', '淚(leoi6)', '夜(je6)',
    '日(jat6)', '力(lik6)', '活(wut6)', '領(ling5)', '引(jan5)', '慕(mou6)',
    '萬(maan6)', '但(daan6)', '受(sau6)', '定(ding6)', '靜(zing6)', '念(nim6)',
    '話(waa6)', '近(gan6)', '盛(sing6)', '謝(ze6)', '佑(jau6)', '裡(leoi5)',
    '浪(long6)', '岸(ngon6)', '雨(jyu5)', '暖(nyun5)', '夢(mung6)', '渡(dou6)',
    '漸(zim6)', '未(mei6)', '漫(maan6)', '座(zo6)', '暴(bou6)', '著(zoek6)',
  ],
  '4': [
    '我(ngo5->4)', '你(nei5->4)', '祢(nei5->4)', '更(gang3)', '怕(paa3)', '困(kwan3)', '勝(sing3)',
    '愛(ngoi3)', '信(seon3)', '靠(kaau3)', '向(hoeng3)', '敬(ging3)', '拜(baai3)',
    '讚(zaan3)', '看(hon3)', '唱(coeng3)', '救(gau3)', '聖(sing3)', '盼(paan3)',
    '賜(ci3)', '照(ziu3)', '獻(hin3)', '見(gin3)', '證(zing3)', '進(zeon3)',
    '去(heoi3)', '最(zeoi3)', '要(jiu3)', '放(fong3)', '化(faa3)', '快(faai3)',
    '發(faat3)', '架(gaa3)', '降(gong3)', '血(hyut3)', '世(sai3)', '界(gaai3)',
    '眷(gyun3)', '顧(gu3)', '赦(se3)', '恕(syu3)', '祭(zai3)', '過(gwo3)',
    '再(zoi3)', '創(cong3)', '作(zok3)', '意(ji3)', '志(zi3)', '氣(hei3)',
    '配(pui3)', '潔(git3)', '眾(zung3)', '慰(wai3)', '細(sai3)', '破(po3)',
    '曉(hiu3)', '痛(tung3)', '暗(am3)', '嘆(taan3)', '蔭(jam3)', '蓋(goi3)',
    '應(jing3)', '縱(zung3)',
  ],
  '3': [
    '更(gang1)', '掌(zoeng2)', '驚(ging1)', '境(ging2)', '主(zyu2)', '祂(taa1)',
    '心(sam1)', '恩(jan1)', '深(sam1)', '真(zan1)', '光(gwong1)', '歌(go1)',
    '天(tin1)', '生(sang1)', '手(sau2)', '身(san1)', '家(gaa1)', '聲(sing1)',
    '知(zi1)', '依(ji1)', '歸(gwai1)', '甘(gam1)', '今(gam1)', '終(zung1)',
    '將(zoeng1)', '開(hoi1)', '歡(fun1)', '欣(jan1)', '高(gou1)', '舉(geoi2)',
    '謙(him1)', '卑(bei1)', '新(san1)', '清(cing1)', '風(fung1)', '星(sing1)',
    '山(saan1)', '海(hoi2)', '邦(bong1)', '音(jam1)', '尊(zyun1)', '基(gei1)',
    '督(duk1)', '寶(bou2)', '羔(gou1)', '安(on1)', '喜(hei2)', '奔(ban1)',
    '飛(fei1)', '追(zeoi1)', '牽(hin1)', '撫(fu2)', '擁(jung2)', '守(sau2)',
    '禱(tou2)', '感(gam2)', '聽(ting1)', '福(fuk1)', '親(can1)', '溫(wan1)',
    '花(faa1)', '春(ceon1)', '傷(soeng1)', '君(gwan1)', '苦(fu2)', '穩(wan2)',
    '湧(jung2)', '翻(faan1)', '許(heoi2)',
  ],
};

/**
 * 粵語敬拜詩歌大型語料庫（融合 CantonHymn 粵語詩歌網 http://cantonhymn.net/ 經典與現代詩歌詞彙）
 */
export const RAW_CANTONESE_WORSHIP_CORPUS: string[] = [
  // === 0. 【爭戰得勝與宣告掌權】（涵蓋「宣告耶穌作王」多種 0243 自然協音表達） ===
  // 2字
  '掌權', '作王', '君王', '寶座', '掌管', '統管', '誇勝', '得勝', '凱旋', '權柄', '威嚴', '高舉', '稱頌', '稱揚', '宣告', '宣稱', '宣揚', '頌揚', '父神', '大能', '伴隨', '道成', '國度', '榮美', '剛強', '壯膽', '勝過', '擊退', '破開', '衝破',
  // 3字
  '愛慕神', '讚美神', '向著神', '已掌權', '仍掌權', '神掌權', '主掌權', '祢掌權', '永掌權', '必掌權', '已作王', '仍作王', '神作王', '主作王', '永作王', '尊主王', '坐寶座', '顯權柄', '彰榮耀', '高舉主', '宣稱主', '宣告主', '破黑暗', '勝黑暗', '誇勝了', '勝萬有', '大得勝', '主得勝', '立主名', '顯威嚴',
  // 4字（意念同義重組：如「宣告耶穌作王」依不同音階自然轉化）
  '尊主作王', '宣稱作王', '讚美作王', '願祢作王', '祢已掌權', '神已掌權', '主已掌權', '父已掌權', '永遠掌權', '萬代掌權', '坐著為王', '掌權作王', '執掌王權', '父祢作王', '仍坐寶座', '高坐寶座', '掌管萬有', '掌管萬事', '掌管一生', '萬王之王', '榮耀國度', '彰顯榮光', '宣揚主名', '宣告主愛', '宣告作王', '尊主為大', '權柄歸祢', '威嚴無雙', '破開黑暗', '衝破捆鎖', '擊退仇敵', '誇勝得勝', '全然得勝', '勝過患難', '勝過幽暗', '得勝有餘',
  // 5字
  '向恩主獻心', '宣稱主作王', '宣揚主作王', '尊崇主作王', '宣告主掌權', '靠著祢得勝', '靠著主得勝', '靠主得勝了', '誇勝勝萬有', '破開諸黑暗', '永遠坐寶座', '萬代掌王權', '高舉主聖名', '國度歸於祢', '父祢仍作王', '在患難掌權', '風暴裡掌權', '患難裡掌權', '困境裡掌權', '洪水裡作王', '全地當讚揚',

  // === 1. 【患難逆境與安慰陪伴】（風浪、暗夜、牽引、不驚惶、安息） ===
  // 2字
  '驚惶', '驚怕', '懼怕', '害怕', '無懼', '不驚', '莫怕', '困境', '困苦', '患難', '苦難', '危難', '試煉', '風暴', '暴風', '波濤', '巨浪', '狂風', '洪水', '大水', '翻騰', '洶湧', '動搖', '堅立', '安穩', '安歇', '安息', '蔭下', '藏身', '避難', '遮蓋', '翅膀', '牽引', '引導', '扶持', '體恤', '包裹', '撫平', '醫治', '眼淚', '傷痛', '創傷', '孤單', '幽谷', '死蔭', '長夜', '暗夜',
  // 3字
  '不驚惶', '不驚怕', '莫驚惶', '莫驚怕', '未驚怕', '別驚怕', '無懼怕', '不懼怕', '不害怕', '未動搖', '不動搖', '風浪靜', '暗夜過', '幽谷裡', '患難中', '患難裡', '在患難', '在困境', '困境中', '困境裡', '困苦中', '苦難裡', '風暴裡', '暴風中', '洪水中', '大水裡', '狂風裡', '巨浪裡', '死蔭谷', '必堅立', '得安穩', '得安息', '藏蔭下', '祢蔭下', '主懷裡', '主牽引', '主引導', '主安慰', '主醫治', '擦眼淚', '撫傷痛', '卸重擔', '祂看顧', '懂我心', '不撇下', '不離開', '有定時', '仍信靠', '未看見',
  // 4字
  '不用驚惶', '不必驚惶', '不要驚惶', '莫怕驚惶', '未怕驚惶', '不用驚怕', '不要驚怕', '心不驚惶', '心不驚怕', '風浪平息', '風浪不驚', '風雨不懼', '無懼風暴', '無懼患難', '無懼困境', '無懼黑暗', '勝過患難', '勝過風浪', '勝過試煉', '勝過黑暗', '勝過困境', '走過患難', '走出困境', '走出低谷', '行過幽谷', '死蔭幽谷', '大水翻騰', '波濤洶湧', '狂風巨浪', '風暴之上', '洪水之上', '藏在蔭下', '翅膀蔭下', '藏身主懷', '安然度過', '平靜安穩', '安然信靠', '安穩在手', '堅定信靠', '應許不變', '撫平傷痕', '撫平傷痛', '擦乾眼淚', '擦乾淚痕', '抹乾眼淚', '醫治傷痛', '醫治傷痕', '卸下重擔', '不再孤單', '不再憂慮', '不再驚惶', '緊牽我手', '同在同行', '安慰我心', '賜我平安', '安靜知神',
  // 5字
  '風浪裡同行', '黑夜見真光', '患難裡安息', '風雨中同行', '暗夜有祢在', '幽谷見祢手', '緊緊牽我手', '擦乾我眼淚', '撫平我傷痛', '在祢懷安穩', '心中享安息', '祢領我走過', '祢伴我走過', '祢助我得勝', '暗夜見真愛', '世上見主愛', '信是祢恩愛', '看患難走過', '縱面對風浪', '縱遇見風暴', '我在祢蔭下', '主愛勝患難', '深信勝患難', '深信祢護佑', '深信祢導引', '心靠祢靜候', '主愛賜力量', '恩愛賜力量', '藏在祢蔭下', '刻在祢心上', '握在祢手中',

  // === 2. 【十架救贖與感恩獻上】（寶血、犧牲、捨命救贖、赦免、立志一生跟隨） ===
  // 2字
  '十架', '寶血', '救贖', '赦免', '捨命', '受死', '受難', '犧牲', '代贖', '洗淨', '潔淨', '買贖', '復活', '重生', '立志', '跟隨', '奉獻', '回應', '擺上', '順服', '獻上', '報答', '稱謝', '活祭', '恩慈',
  // 3字
  '為我死', '捨自身', '釘十架', '流寶血', '受鞭傷', '代我受', '救贖深', '赦我罪', '得潔淨', '得贖回', '得釋放', '已復活', '勝死亡', '開新路', '立志走', '獻真心', '全擺上', '跟隨主', '聽呼召', '作活祭', '報主恩', '主捨命', '深愛我', '甘獻上',
  // 4字
  '十架大愛', '十架深恩', '捨命救贖', '捨命之愛', '無私捨命', '為我捨命', '寶血洗淨', '寶血潔淨', '代贖我罪', '代我受死', '赦免眾罪', '赦免我罪', '罪得赦免', '勝過死權', '勝過死亡', '破開墳墓', '從死復活', '復活盼望', '賜下永生', '重獲新生', '全新生命', '全然釋放', '更新生命', '甘心獻上', '甘心奉獻', '全然擺上', '全人奉獻', '立志跟隨', '立志走過', '背起十架', '跟主腳蹤', '忠心到底', '一生獻上', '終生不變', '感謝主恩', '感謝厚恩', '稱謝主恩', '感恩不盡', '永記深恩',
  // 5字
  '十架顯深愛', '十架彰顯愛', '為我捨生命', '寶血洗我罪', '寶血洗眾罪', '捨命救眾人', '復活勝死亡', '復活勝死權', '賜我新生命', '我願獻一生', '全心獻給祢', '全心跟隨祢', '立志跟隨主', '立志走義路', '背起十架走', '一生作活祭', '感謝祢深恩', '報答祢厚愛', '一生屬於祢', '稱揚祢美善', '屈膝祢面前',

  // === 3. 【親近渴慕與深情傾訴】（心渴想、安靜等候、相遇、輕撫、心深處） ===
  // 2字
  '渴慕', '渴想', '尋求', '切慕', '貼近', '親近', '安靜', '默想', '等候', '靜候', '仰慕', '愛慕', '傾倒', '細訴', '相遇', '輕撫', '微聲', '同在', '深處', '依戀', '朝夕', '相知', '胸膛', '心懷',
  // 3字
  '渴想祢', '尋求祢', '切切求', '親近祢', '貼近祢', '細細聽', '聽微聲', '深愛祢', '懂我心', '心深處', '相遇時', '安靜坐', '心渴慕', '近主懷', '凝望主', '凝望祢', '細訴說', '與主遇', '願親近', '靜默候', '在祢手', '在祢懷', '向祢唱',
  // 4字
  '切切尋求', '如鹿切慕', '心深渴慕', '渴慕恩主', '親近恩主', '貼近主懷', '安靜等候', '靜默默想', '與主相遇', '與祢相遇', '輕撫我心', '輕撫我靈', '聽祢微聲', '聽主微聲', '心靈深處', '靜候恩光', '貼近主心', '深情傾訴', '朝夕相見', '藏在主懷', '凝望尊容', '傾倒我心', '深處呼求', '寸步不離', '刻意靠近', '在祢懷裡', '在主懷裡', '我心愛祢', '我心渴慕', '我深愛祢',
  // 5字
  '我心渴慕祢', '深深渴想祢', '安靜等候祢', '與恩主相遇', '輕撫我心靈', '聽恩主微聲', '心深處呼求', '貼近祢胸膛', '朝夕常思念', '默想祢恩惠', '親近祢座前', '我心屬於祢', '心靠祢靜候',

  // === 4. 含「更 (3聲)」之詩歌高頻詞彙（2～4字） ===
  '更新', '更深', '更高', '更美', '更愛', '更信', '更近', '更清', '更真', '更亮', '更強', '更親', '更懂', '更甜', '更穩',
  '更親近', '更深愛', '更深信', '更堅定', '更剛強', '更認識', '更明白', '更渴慕', '更靠近', '更像祢', '更新我', '更愛祢', '更信祢', '更靠祢', '更知祢',
  '更深愛祢', '更深信祢', '更深靠祢', '更親近祢', '更認識祢', '更新我心', '更新生命', '更新靈命', '愛祢更深', '信祢更深', '信心更堅', '恩典更深', '主愛更深', '比天更高', '比海更深',

  // === 5. 自然意象、光影、水泉與季節畫面（2字） ===
  '晨光', '朝陽', '晨曦', '星光', '星辰', '星河', '銀河', '月光', '真光', '亮光', '榮光', '光輝', '光芒', '火光', '微光', '曙光', '晴空', '藍天', '天際', '穹蒼', '雲彩', '彩虹',
  '清泉', '甘泉', '活水', '水流', '溪水', '江河', '甘霖', '春雨', '恩雨', '細雨', '風雨', '風浪', '海浪', '深海', '海洋', '海岸', '港灣', '春風', '清風', '微風', '和風', '風雲',
  '山嶺', '高山', '山谷', '幽谷', '曠野', '沙漠', '綠洲', '荊棘', '大地', '全地', '世間', '人間', '塵世', '塵土', '花開', '花香', '盛放', '果子', '麥田', '禾稼', '青草', '溪邊',
  '長夜', '黑夜', '暗夜', '夜空', '夜晚', '黎明', '破曉', '清晨', '早晨', '今日', '今朝', '明日', '歲月', '年日', '一生', '前路', '道路', '旅途', '路途', '方向', '步履', '腳步', '足跡', '家園', '天家',

  // === 6. 心靈狀態、生命經歷與詩意動詞（2字） ===
  '照亮', '照明', '照耀', '照射', '點燃', '燃亮', '溫暖', '溫柔', '撫平', '擦乾', '抹乾', '醫治', '包裹', '纏裹', '安慰', '體恤', '擁抱', '環抱', '懷抱', '緊握', '牽引', '帶領', '引領', '引導',
  '伴隨', '陪伴', '同行', '同在', '共行', '同走', '扶持', '扶助', '提攜', '托住', '看顧', '眷顧', '守護', '守望', '守候', '等候', '靜候', '仰望', '凝望', '細看', '看清', '看見', '聽見', '傾聽', '細聽', '垂聽',
  '潔淨', '煉淨', '洗淨', '赦免', '饒恕', '拯救', '救贖', '釋放', '改變', '塑造', '陶造', '建立', '堅固', '剛強', '堅定', '勇敢', '無懼', '無畏', '放開', '放下', '放心', '放懷', '交託', '投靠', '信靠', '倚靠', '依靠',
  '安息', '安靜', '平靜', '安穩', '平安', '喜樂', '滿足', '豐盛', '恩典', '恩惠', '慈愛', '憐憫', '信實', '公義', '聖潔', '榮耀', '奇妙', '永恆', '無窮', '無邊', '無限', '常存', '長存', '不變', '依然',
  '敬拜', '讚美', '歌頌', '頌讚', '高舉', '高唱', '歡唱', '歌唱', '歡欣', '歡呼', '飛揚', '展翅', '高飛', '奔跑', '奔向', '追隨', '跟隨', '親近', '渴慕', '愛慕', '思念', '記念', '禱告', '呼求', '祈求', '感謝', '感恩', '奉獻', '獻上', '順服', '謙卑',
  '疲乏', '困倦', '軟弱', '傷痛', '眼淚', '流淚', '嘆息', '憂慮', '愁煩', '重擔', '迷路', '迷失', '孤單', '幽暗', '低谷', '患難', '試煉', '走過', '勝過', '跨過', '突破', '開路', '開創', '開啟', '盛載', '充滿', '滿溢', '澆灌', '傾倒', '賜下',

  // === 7. 人稱互動與詩意短語（2～3字） ===
  '愛祢', '信祢', '靠祢', '向祢', '見祢', '盼祢', '讚祢', '敬祢', '頌祢', '念祢', '慕祢', '望祢',
  '救我', '愛我', '看我', '聽我', '照我', '賜我', '赦我', '領我', '引我', '伴我', '護我', '念我', '助我', '為我', '造我', '用我', '差我', '召我',
  '求祢', '隨祢', '陪我', '扶我', '憐我', '尋祢', '迎祢', '唯祢', '共祢', '與祢', '同祢', '是祢', '願祢', '讓祢',
  '我心', '我身', '我歌', '我手', '我生', '我路', '我步', '我靈', '我口', '我眼', '我夢',
  '祢恩', '祢手', '祢光', '祢心', '祢道', '祢話', '祢愛', '祢名', '祢聲', '祢面',
  '知我', '牽我', '撫我', '擁我', '守我', '懂我', '因祢', '歸祢', '依祢', '屬祢',
  '主愛', '主恩', '主手', '主心', '主光', '主道', '主名', '主聲', '神恩', '神愛',
  '伴我走', '領我走', '陪我走', '引導我', '照亮我', '潔淨我', '赦免我', '安慰我', '眷顧我', '擁抱我', '守護我', '醫治我', '扶持我', '堅固我', '塑造我', '陶造我', '充滿我', '釋放我', '提攜我', '體恤我', '看顧我', '保護我', '拯救我', '救贖我', '改變我',
  '聽我言', '聽我聲', '聽禱告', '垂聽我', '細聽我', '牽我手', '緊握我', '指方向',
  '我愛祢', '我信祢', '我靠祢', '我敬拜', '我讚美', '我盼望', '我信靠', '我感謝', '我仰望', '我順服', '我跟隨', '我歌唱', '我感恩', '我深信', '我深愛', '我渴慕', '我親近', '我投靠', '我交託',
  '祢愛我', '祢救我', '祢看我', '祢聽我', '祢照我', '祢領我', '祢伴我', '祢知我', '祢牽我', '祢撫我', '祢擁我', '祢守我', '祢懂我', '祢造我', '祢護我',
  '敬拜祢', '讚美祢', '信靠祢', '仰望祢', '順服祢', '歌頌祢', '高舉祢', '感謝祢', '親近祢', '跟隨祢', '深愛祢', '渴慕祢', '投靠祢', '等候祢', '愛慕祢', '榮耀祢',

  // === 8. 具象詩意 4～6 字自然詩句 ===
  '照亮前路', '照亮黑夜', '照亮我心', '照亮生命', '長夜放明', '黑夜放明', '晨光照耀', '晨光破曉', '黎明破曉', '星光引路', '星光閃耀', '真光照耀', '榮耀光輝', '大愛光輝', '生命亮光', '世界真光', '盼望真光', '走出黑夜', '迎向晨光', '步向真光', '進入光明',
  '救恩降臨', '恩典降臨', '恩典夠用', '恩典滿溢', '恩典湧流', '慈愛永存', '慈愛長存', '信實不變', '大愛無窮', '主愛長存', '主恩滿溢', '平安喜樂', '喜樂滿懷', '喜樂湧流', '生命活水', '生命改變', '生命豐盛', '滿有盼望', '滿有能力', '滿有平安',
  '與我同行', '伴我同行', '陪我同行', '領我前行', '引我前行', '引我歸家', '領我歸家', '牽我手走', '緊握我手', '賜我平安', '賜我喜樂', '賜我力量', '賜我新心', '賜我盼望', '賜我勇氣', '聽我禱告', '聽我呼求', '垂聽禱告', '看顧保守', '晝夜看顧',
  '在祢懷裡', '在祢愛裡', '在祢光中', '在祢手裡', '在祢殿中', '在祢面前', '在祢蔭下', '在主愛裡', '在主懷裡', '在主光中',
  '真心愛祢', '真心敬拜', '真心信靠', '真心讚美', '甘心獻上', '甘心順服', '清心敬拜', '清心愛祢', '全心愛祢', '全心敬拜', '全心讚美', '全心信靠', '同心敬拜', '同心讚美', '同心合意', '高聲讚美', '高聲敬拜', '高聲歌唱', '謙卑順服', '謙卑敬拜', '安靜等候', '專心仰望',
  '一生愛祢', '一生靠祢', '一生敬拜', '一生讚美', '一生跟隨', '一生事奉', '一生頌讚', '永生盼望', '永遠愛祢', '永遠敬拜', '常存感恩', '常存盼望', '常存喜樂', '唱歌讚揚', '願唱新歌', '獻上讚美', '獻上感謝', '獻上自己',
  '求祢引導', '求祢看顧', '求祢憐憫', '求祢赦免', '求祢潔淨', '求祢更新', '求祢聽我', '求祢領我', '求祢掌管', '求祢充滿', '求祢醫治', '求祢安慰', '求祢照明', '求祢扶持',
  '因祢愛我', '因祢同在', '因祢恩典', '向祢歌唱', '向祢敬拜', '向祢讚美', '向祢呼求', '為我捨命', '為我開路', '唯獨愛祢', '唯獨敬拜',
  '前路未怕行', '長夜漸放明', '風浪裡安息', '風雨未怕行', '牽我渡風浪', '伴我走前路', '領我出黑夜', '晨光照我心', '星光照夜空', '活水湧我心', '清泉潤我心', '恩雨降下來', '主愛像清泉', '聽見祢微聲', '在祢懷安息', '在祢裡安穩', '慈父伴我行', '同在伴我行', '流淚亦讚揚', '無懼共祢行', '恩典伴我行', '一生跟隨祢', '全心敬拜祢', '更深認識祢', '更深愛著祢', '更新我生命', '照亮我前路', '撫平我傷痛', '擦乾我眼淚',

  // === 9. 聖靈降臨、復興與恩膏活水（2～5字） ===
  '聖靈', '澆灌', '恩膏', '復興', '烈火', '焚燒', '運行', '充滿', '吹氣', '降臨', '恩雨', '甘霖', '春雨', '秋雨', '清泉', '活水', '江河',
  '聖靈火', '澆灌我', '充滿我', '復興我', '吹聖氣', '降恩雨', '活水湧', '恩膏厚', '靈引導', '隨靈動', '在靈裡',
  '聖靈降臨', '聖靈之火', '澆灌這地', '澆灌我心', '更新這心', '復興這地', '焚燒我心', '恩膏湧流', '活水江河', '春雨秋雨', '微聲引領', '隨風吹拂', '聖靈引導', '聖靈同在', '聖靈安慰', '烈火焚燒', '復興之火', '恩膏降下', '天開門了', '榮耀降臨',
  '求聖靈降臨', '求聖靈充滿', '求聖靈引領', '活水湧我心', '清泉潤我心', '恩雨降下來', '烈火焚燒我', '復興這世代', '聖靈伴我行', '恩膏臨到我',

  // === 10. 堅固磐石、避難高台與得勝盾牌（2～5字） ===
  '磐石', '堅石', '山寨', '高台', '盾牌', '堡壘', '堅城', '避難', '藏身', '投靠', '信靠', '堅固', '不動', '不移', '安穩', '站立', '昂首', '誇勝', '凱旋', '護佑', '保衛', '抵擋',
  '立磐石', '作高台', '作山寨', '作盾牌', '安穩住', '必堅立', '站立穩', '得勝了', '勝仇敵', '主護佑', '主保守', '靠主站', '深信靠',
  '堅固磐石', '永遠高台', '堅固盾牌', '投靠主蔭', '抓緊應許', '信心不移', '屹立不倒', '堅定不移', '不再驚慌', '無懼風雨', '永恆盼望', '盼望不滅', '安息主懷', '立於磐石', '高舉盾牌', '山寨高台', '避難之所', '隨時幫助', '我心堅定', '主是我盾',
  '萬世之磐石', '我避難之所', '我力量磐石', '投靠祢蔭下', '站立在磐石', '堅心倚靠祢', '祢是我高台', '祢是我盾牌', '祢是我力量', '一生信靠祢',

  // === 11. 讚美稱頌、萬民宣告與榮耀普世（2～5字） ===
  '稱頌', '稱揚', '讚美', '歌唱', '歡呼', '高唱', '彈琴', '拍掌', '吹角', '跳舞', '歡騰', '慶賀', '榮耀', '威嚴', '尊貴', '全地', '萬邦', '萬民', '列國', '蒼穹', '普世',
  '齊讚美', '同歌唱', '拍掌跳', '吹號角', '稱頌主', '萬民拜', '萬膝跪', '萬口稱', '顯榮光', '彰榮耀', '歸於主', '聲震天',
  '全地讚頌', '萬口稱揚', '萬膝跪拜', '高舉主名', '琴瑟和鳴', '歡呼宣告', '天使敬拜', '榮耀歸神', '尊崇救主', '萬民稱頌', '歌唱讚美', '普世歡騰', '宣告主名', '稱頌主恩', '榮耀聖名', '尊貴無雙', '同心高唱', '高聲歡呼', '歡樂讚頌', '同心稱謝',
  '萬國當稱讚', '全地齊歌唱', '同聲稱頌主', '高聲讚美祢', '萬膝當跪拜', '萬口同稱認', '天使同敬拜', '榮耀歸於祢', '威嚴遍全地', '聖潔歸於主',

  // === 12. 差遣奉獻、作光作鹽與天路歷程（2～5字） ===
  '差遣', '呼召', '回應', '奉獻', '順服', '委身', '忠心', '僕人', '使者', '麥種', '活祭', '奔跑', '天路', '發光', '鹽光', '傳揚', '福音', '見證', '同行', '到底',
  '聽呼召', '應差遣', '走天路', '作活祭', '作使者', '作世光', '作地鹽', '傳福音', '作見證', '跑盡路', '守真道', '守到底', '獻生命',
  '願隨主走', '甘心獻上', '任憑差遣', '遵行祢旨', '一生奉獻', '盡心盡力', '至死忠心', '跟主到底', '為主發光', '傳遍萬邦', '福音廣傳', '活出召命', '奔跑天路', '作鹽作光', '真理見證', '如鷹展翅', '展翅上騰', '力上加力', '恩上加恩', '一生事奉',
  '願聽主呼召', '甘心作活祭', '一生跟主走', '遵行主旨意', '為福音奔跑', '如鷹展翅飛', '奔跑不困倦', '行走不疲乏', '向著標竿跑', '打過美好仗',

  // === 13. 羔羊救贖、釘痕大愛與長闊高深（2～5字） ===
  '羔羊', '替罪', '代死', '受傷', '釘痕', '肋旁', '創傷', '贖價', '代價', '恩情', '深恩', '厚愛', '浩大', '深廣', '長闊', '高深', '換來', '永生',
  '神羔羊', '看釘痕', '代我死', '付代價', '恩浩大', '愛深長', '銘於心', '永難忘', '贖我身', '賜新生',
  '被殺羔羊', '十架換來', '寶血代贖', '恩典浩大', '主愛深廣', '無盡恩情', '厚愛難忘', '銘記深恩', '白白赦免', '完全洗淨', '罪痕抹去', '重價買贖', '釘痕雙手', '肋旁創傷', '長闊高深', '大愛無邊', '恩深似海', '勝過千山', '何等奇妙', '甘願捨身',
  '因祢受鞭傷', '因祢受刑罰', '使我得平安', '使我得醫治', '大愛長闊深', '神羔羊配得', '永誌十架恩', '感謝捨命愛', '主愛深莫測', '銘記十架恩',

  // === 14. 擴展語料庫（CantonHymn 經典、聖經詩篇金句、神學大辭典、當代敬拜） ===
  ...ALL_EXPANDED_WORSHIP_CORPUS,
];

let cachedPatternMap: Map<string, string[]> | null = null;

/**
 * 取得由 to-jyutping 100% 實時驗證過的 0243 詞庫索引表
 */
export function getVerifiedPatternMap(): Map<string, string[]> {
  if (cachedPatternMap) return cachedPatternMap;

  const map = new Map<string, string[]>();

  for (const phrase of RAW_CANTONESE_WORSHIP_CORPUS) {
    const clean = phrase.replace(/[^\u4e00-\u9fa5]/g, '');
    if (!clean) continue;

    const { pattern } = getPhrasePrimary0243(clean);
    if (pattern.includes('?')) continue;

    if (!verifyPhraseAgainstPattern(clean, pattern).isExactMatch) continue;

    const list = map.get(pattern) || [];
    if (!list.includes(clean)) {
      list.push(clean);
      map.set(pattern, list);
    }
  }

  cachedPatternMap = map;
  return map;
}

/**
 * 主題語意群組擴展表：覆蓋四大核心敬拜場合
 */
const THEME_SEMANTIC_CLUSTERS: {
  triggers: RegExp;
  label: string;
  boostChars: string[];
  featuredPhrases: string[];
}[] = [
  {
    triggers: /(掌權|作王|君王|誇勝|得勝|破開|衝破|擊退|寶座|統管|宣告|宣揚|高舉|權柄|威嚴|國度)/,
    label: '爭戰得勝／宣告神掌權與作王',
    boostChars: ['掌', '權', '王', '座', '勝', '誇', '破', '衝', '退', '管', '宣', '告', '稱', '舉', '冠', '國', '榮', '剛', '強', '定'],
    featuredPhrases: [
      '尊主作王', '宣稱主作王', '宣揚主作王', '宣告主掌權', '祢已掌權', '神已掌權', '主已掌權', '永遠掌權', '坐著為王', '掌權作王', '高坐寶座', '萬王之王', '執掌王權', '破開黑暗', '衝破捆鎖', '擊退仇敵', '誇勝得勝', '靠著祢得勝', '勝過患難',
    ],
  },
  {
    triggers: /(患難|困境|風暴|風浪|暗夜|黑夜|長夜|低谷|幽谷|死蔭|驚惶|驚怕|害怕|懼怕|無懼|安息|安穩|牽引|同行|撫平|擦乾|醫治|眼淚|傷痛|軟弱|孤單)/,
    label: '患難逆境與安慰陪伴／不驚惶',
    boostChars: ['患', '難', '困', '境', '風', '暴', '浪', '夜', '暗', '谷', '驚', '惶', '怕', '懼', '穩', '息', '牽', '引', '伴', '撫', '淚', '傷', '痛', '醫', '蔭'],
    featuredPhrases: [
      '風浪平息', '風浪不驚', '風雨不懼', '無懼風暴', '無懼患難', '不用驚惶', '不要驚怕', '風浪裡同行', '黑夜見真光', '患難裡安息', '暗夜有祢在', '幽谷見祢手', '緊緊牽我手', '擦乾我眼淚', '撫平我傷痛', '在祢懷安穩', '走出低谷', '安穩在手', '藏在祢蔭下',
    ],
  },
  {
    triggers: /(十架|寶血|救贖|捨命|受死|受難|犧牲|代贖|赦免|洗淨|潔淨|復活|重生|立志|跟隨|奉獻|擺上|活祭)/,
    label: '十架救贖與感恩獻上／一生跟隨',
    boostChars: ['十', '架', '寶', '血', '救', '贖', '捨', '命', '死', '受', '犧', '牲', '代', '赦', '洗', '潔', '活', '生', '志', '隨', '獻', '祭'],
    featuredPhrases: [
      '十架大愛', '十架深恩', '捨命救贖', '無私捨命', '為我捨命', '寶血洗淨', '寶血潔淨', '代贖我罪', '赦免眾罪', '勝過死權', '破開墳墓', '從死復活', '賜下永生', '重獲新生', '甘心獻上', '全然擺上', '立志跟隨', '背起十架', '一生作活祭',
    ],
  },
  {
    triggers: /(渴慕|渴想|尋求|切慕|貼近|親近|安靜|默想|等候|靜候|相遇|輕撫|微聲|深處|傾訴|朝夕|同在)/,
    label: '親近渴慕與深情傾訴／安靜相遇',
    boostChars: ['渴', '慕', '想', '求', '切', '貼', '近', '靜', '默', '候', '遇', '撫', '微', '聲', '深', '處', '傾', '訴', '胸', '懷'],
    featuredPhrases: [
      '切切尋求', '如鹿切慕', '心深渴慕', '親近恩主', '貼近主懷', '安靜等候', '靜默默想', '與主相遇', '輕撫我心', '聽祢微聲', '心靈深處', '靜候恩光', '深情傾訴', '朝夕相見', '藏在主懷', '凝望尊容', '我心渴慕祢', '安靜等候祢', '貼近祢胸膛',
    ],
  },
  {
    triggers: /(聖靈|澆灌|恩膏|復興|烈火|焚燒|活水|清泉|江河|甘霖|春雨|秋雨|聖火)/,
    label: '聖靈降臨與復興恩膏／活水江河',
    boostChars: ['聖', '靈', '澆', '灌', '膏', '復', '興', '火', '燒', '活', '水', '泉', '河', '霖', '雨'],
    featuredPhrases: [
      '聖靈降臨', '聖靈之火', '澆灌這地', '澆灌我心', '更新這心', '復興這地', '恩膏湧流', '活水江河', '微聲引領', '求聖靈降臨', '求聖靈充滿', '恩雨降下來', '烈火焚燒我',
    ],
  },
  {
    triggers: /(磐石|堅石|高台|山寨|盾牌|堡壘|避難|堅固|投靠|信靠|不動|不移|站立)/,
    label: '堅固磐石與避難高台／盾牌信靠',
    boostChars: ['磐', '石', '堅', '台', '寨', '盾', '牌', '壘', '避', '難', '投', '靠', '固', '立', '穩'],
    featuredPhrases: [
      '堅固磐石', '永遠高台', '堅固盾牌', '投靠主蔭', '抓緊應許', '信心不移', '屹立不倒', '避難之所', '隨時幫助', '萬世之磐石', '我避難之所', '祢是我高台', '祢是我盾牌',
    ],
  },
  {
    triggers: /(讚美|稱頌|歌唱|高唱|歡呼|拍掌|跳舞|琴瑟|號角|榮耀|尊貴|威嚴|萬邦|萬民|列國|普世)/,
    label: '讚美稱頌與萬民宣告／榮耀威嚴',
    boostChars: ['讚', '美', '稱', '頌', '歌', '唱', '歡', '呼', '琴', '角', '舞', '榮', '耀', '尊', '貴', '威', '嚴', '邦', '民', '國'],
    featuredPhrases: [
      '全地讚頌', '萬口稱揚', '萬膝跪拜', '高舉主名', '琴瑟和鳴', '歡呼宣告', '天使敬拜', '榮耀歸神', '萬民稱頌', '普世歡騰', '萬國當稱讚', '全地齊歌唱', '榮耀歸於祢',
    ],
  },
  {
    triggers: /(差遣|呼召|回應|委身|使者|活祭|天路|作光|作鹽|發光|福音|見證|標竿|如鷹|奔跑)/,
    label: '差遣委身與作光作鹽／天路歷程',
    boostChars: ['差', '遣', '呼', '召', '委', '身', '忠', '心', '祭', '光', '鹽', '福', '音', '證', '鷹', '跑'],
    featuredPhrases: [
      '願隨主走', '甘心獻上', '任憑差遣', '遵行祢旨', '一生奉獻', '至死忠心', '跟主到底', '為主發光', '傳遍萬邦', '如鷹展翅', '展翅上騰', '願聽主呼召', '甘心作活祭', '向著標竿跑',
    ],
  },
  {
    triggers: /(比喻|如同|好像|像|如|似|象徵|意象|麥子|陶造|瓦器|泥土|香膏|如鹿|靈魂的錨|蘆葦|燈火|枝子|葡萄)/,
    label: '聖經經典比喻與神聖象徵／如泥在手',
    boostChars: ['如', '似', '像', '若', '麥', '泥', '陶', '器', '膏', '鹿', '錨', '葦', '枝', '鷹'],
    featuredPhrases: [
      '如鹿切慕', '如鷹展翅', '如泥在手', '窯匠陶造', '瓦器寶貝', '一粒麥子', '靈魂的錨', '壓傷蘆葦', '將殘燈火', '常在主裡', '果子豐盛', '恩深似海', '愛比天高', '如春雨沛', '如晨光現',
    ],
  },
  {
    triggers: /(為了|因祢|因為|因主|因愛|因信|卻是|反而|轉變|成為|化作|縱使|縱然|哪怕|即使|就算|雖然|只要|若是|從今|直到|自此|令我|使我|終於|確信|深信|堅信|篤信|深知|我已|祢已|早已|已蒙|不再|如今|此刻|定要|誓要)/,
    label: '轉折承接、確信誓言與終局釋放／終於看見',
    boostChars: ['為', '因', '卻', '成', '化', '縱', '怕', '使', '叫', '雖', '若', '只', '自', '直', '終', '確', '信', '已', '今', '誓', '定', '決', '再'],
    featuredPhrases: [
      '終於得救', '終於看見', '終於明白', '終於釋懷', '我心深信', '滿心確信', '堅信不疑', '深知祢愛', '我已得救', '我已重生', '我已立志', '祢已掌權', '縱使風浪', '哪怕艱難', '不再驚惶', '不再懼怕', '如今我知', '自此一生', '定要歌唱', '為了這愛',
    ],
  },
];

/**
 * 計算候選詞組與用戶「歌名＋故事主題」的語意契合分數
 */
export function scorePhraseByTheme(phrase: string, themeText = ''): number {
  if (!themeText.trim()) return 0;
  const cleanTheme = themeText.replace(/[^\u4e00-\u9fa5]/g, '');
  if (!cleanTheme) return 0;

  let score = 0;
  const chars = Array.from(phrase);

  // 1. 直接命中用戶輸入的故事雙字詞或單字（權重最高）
  for (let i = 0; i < chars.length - 1; i++) {
    const bigram = chars[i] + chars[i + 1];
    if (cleanTheme.includes(bigram)) {
      score += 18;
    }
  }

  // 排除過於高頻的功能字以免喧賓奪主
  const stopChars = new Set(['一', '的', '在', '是', '有', '了', '中', '裡', '我', '你', '祢']);
  for (const ch of chars) {
    if (!stopChars.has(ch) && cleanTheme.includes(ch)) {
      score += 6;
    }
  }

  // 2. 命中主題語意群組擴展字
  for (const cluster of THEME_SEMANTIC_CLUSTERS) {
    if (cluster.triggers.test(themeText)) {
      if (cluster.featuredPhrases.includes(phrase)) {
        score += 15;
      }
      for (const ch of chars) {
        if (cluster.boostChars.includes(ch)) {
          score += 3;
        }
      }
    }
  }

  return score;
}

/**
 * 檢查合成詞是否自然（嚴禁腰斬神聖名詞、過濾重複字、懸空介詞、生硬稱謂堆疊）
 */
function isNaturalCombinedPhrase(left: string, right: string): boolean {
  const combined = `${left}${right}`;
  const chars = Array.from(combined);

  // 1. 同一詞組內禁止出現任何重複漢字（例如「愛主愛」、「心清心」、「主我主」）
  if (new Set(chars).size !== chars.length) return false;

  // 2. 避免同一詞組內同時擠入「你」與「祢」
  if (combined.includes('你') && combined.includes('祢')) return false;

  // 3. 避免「主」與「神」或「祢」與「神」生硬堆疊（如「主我神」、「祢恩我神」、「神我主」）
  if (combined.includes('主') && combined.includes('神')) return false;
  if ((combined.includes('祢') || combined.includes('你')) && combined.includes('神'))
    return false;
  if (combined.endsWith('我神') || combined.endsWith('我主')) return false;

  // 4. 嚴禁任何縮寫、殘缺或腰斬神聖稱謂與核心詞彙（例如「耶」代表耶穌、「基督」拆成「督」、「上帝」拆成「上」）
  if (combined.includes('耶') && !combined.includes('耶穌')) return false;
  if (combined.includes('督') && !combined.includes('基督')) return false;
  if (combined.includes('宣') && !combined.includes('宣告') && !combined.includes('宣稱') && !combined.includes('宣揚')) return false;

  // 5. 避免詞組結尾停在懸空介詞／連詞／副詞（如「...在」、「...向」、「...求」、「...更」）
  const lastChar = chars[chars.length - 1];
  // 7. 嚴禁任何文理不通、生硬古怪的死板拼湊（例如「真主」、「我慕神」、「慕神」、「萬王」作為雙字）
  if (combined.includes('真主')) return false; // 「真主」非現代粵語基督教詩歌用語
  if (combined.includes('慕神') || combined.includes('我慕')) return false; // 「我慕神」不合粵語語法，應用「愛慕神」、「渴慕神」或「渴慕祢」
  if (combined === '萬王' || (combined.includes('萬王') && !combined.includes('萬王之王'))) return false; // 「萬王」單獨不成詞，必須是「萬王之王」
  if (combined.includes('主我心') || combined.includes('真主我心')) return false; // 倒錯語法
  if (combined.includes('神我主') || combined.includes('我主神')) return false;

  return true;
}

const ALLOWED_SINGLE_PREFIX = new Set([
  '我', '你', '祢', '祂', '主', '神', '在', '為', '同', '共', '向', '未', '莫', '不', '定', '願', '聽', '靠', '因', '將', '更', '已', '仍', '深', '真', '全',
  '但', '縱', '雖', '若', '使', '令', '叫', '憑'
]);

const ALLOWED_SINGLE_SUFFIX = new Set([
  '裡', '中', '前', '後', '邊', '旁', '手', '心', '聲', '光', '話', '愛', '恩', '名', '道', '面', '家', '深'
]);

/**
 * 針對任意長度的單一目標數字譜（支援 1 至 8+ 字），
 * 自動從已驗證詞庫中檢索或透過自然語法拼接出 100% 符合 0243 聲調且優先契合歌曲主題的流暢詞組！
 */
export function getVerifiedCandidatesForGroupPattern(
  groupPattern: string,
  limit = 20,
  randomize = false,
  themeText = ''
): string[] {
  const cleanPattern = groupPattern.trim();
  if (!cleanPattern) return [];

  const map = getVerifiedPatternMap();
  const exactCandidates: string[] = [];
  const combinedCandidates: string[] = [];
  const seen = new Set<string>();

  const maybeShuffle = <T>(arr: T[]): T[] => {
    if (!randomize) return arr;
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // 1. 直接命中完整長度的詞組（最自然、語意最完整）
  const exactList = maybeShuffle(map.get(cleanPattern) || []);
  for (const item of exactList) {
    if (!seen.has(item) && verifyPhraseAgainstPattern(item, cleanPattern).isExactMatch) {
      seen.add(item);
      exactCandidates.push(item);
    }
  }

  // 2. 嚴格自然語法切分拼接（杜絕 1+1 胡亂拼字）
  if (exactCandidates.length < Math.max(limit, 24)) {
    const len = cleanPattern.length;
    const splits: [number, number][] = [];
    if (len === 2) {
      // 2字詞組絕對禁止 1+1 亂拼！必須從人手驗證的完整2字詞庫產生
    } else if (len === 3) {
      // 3字詞組只允許 1+2 或 2+1，且單字必須是合法前綴/後綴，2字部分必須是真實詞彙
      splits.push([1, 2], [2, 1]);
    } else if (len === 4) {
      // 4字詞組只允許 2+2（兩個真實雙字詞合成，例如「恩典之路」），禁止 1+3 或 3+1 拼裝
      splits.push([2, 2]);
    } else if (len === 5) {
      // 5字詞組只允許 2+3 或 3+2（真實雙字詞 + 真實三字短語，如「風浪裡同行」），禁止 1+4 或 4+1
      splits.push([2, 3], [3, 2]);
    } else if (len === 6) {
      splits.push([3, 3], [2, 4], [4, 2]);
    } else if (len > 6) {
      splits.push([4, len - 4], [3, len - 3], [2, len - 2]);
    }

    for (const [leftLen] of splits) {
      const leftPat = cleanPattern.slice(0, leftLen);
      const rightPat = cleanPattern.slice(leftLen);

      const leftRaw =
        map.get(leftPat) && map.get(leftPat)!.length > 0
          ? map.get(leftPat)!
          : leftPat.length > 1
          ? getVerifiedCandidatesForGroupPattern(leftPat, 16, randomize, themeText)
          : [];
      const rightRaw =
        map.get(rightPat) && map.get(rightPat)!.length > 0
          ? map.get(rightPat)!
          : rightPat.length > 1
          ? getVerifiedCandidatesForGroupPattern(rightPat, 16, randomize, themeText)
          : [];

      const leftWords = maybeShuffle(leftRaw).slice(0, 22);
      const rightWords = maybeShuffle(rightRaw).slice(0, 22);

      for (const lw of leftWords) {
        if (leftLen === 1 && !ALLOWED_SINGLE_PREFIX.has(lw)) continue;
        for (const rw of rightWords) {
          if (cleanPattern.length - leftLen === 1 && !ALLOWED_SINGLE_SUFFIX.has(rw)) continue;
          if (!isNaturalCombinedPhrase(lw, rw)) continue;

          const combined = `${lw}${rw}`;
          if (seen.has(combined)) continue;

          const check = verifyPhraseAgainstPattern(combined, cleanPattern);
          if (
            check.isExactMatch &&
            check.endErgonomics.rating !== 'warning_stopped'
          ) {
            seen.add(combined);
            combinedCandidates.push(combined);
            if (exactCandidates.length + combinedCandidates.length >= Math.max(limit * 3, 45)) {
              break;
            }
          }
        }
        if (exactCandidates.length + combinedCandidates.length >= Math.max(limit * 3, 45)) {
          break;
        }
      }
    }
  }

  const allPool = [...exactCandidates, ...combinedCandidates];

  // 若有提供歌曲主題／故事，優先將契合主題故事的詞組排在最前面！
  if (themeText.trim()) {
    allPool.sort((a, b) => {
      const scoreDiff = scorePhraseByTheme(b, themeText) - scorePhraseByTheme(a, themeText);
      if (scoreDiff !== 0) return scoreDiff;
      // 完整詞庫原詞優先於拼接詞
      const aExact = exactCandidates.includes(a) ? 1 : 0;
      const bExact = exactCandidates.includes(b) ? 1 : 0;
      return bExact - aExact;
    });
  }

  return allPool.slice(0, limit);
}

/**
 * 針對含有部分鎖定字元 (🟢 locked) 的詞組區塊，
 * 自動為未鎖定的部分檢索或自然拼接出 100% 啱音且保留鎖定字元的完整候選詞組！
 * 例如：目標 [0234]，前兩字 [02] 鎖定為「神在」，未鎖定部分 [34] 會自動調用「誇勝/得勝/宣告/看顧」
 * 生成「神在誇勝」、「神在得勝」、「神在宣告」、「神在看顧」供用戶直接選擇！
 */
export function getCandidatesWithLockedConstraints(
  tokens: { expectedTone: string; status?: TokenStatus; char?: string }[],
  limit = 16,
  randomize = false,
  themeText = ''
): string[] {
  const fullPat = tokens.map((t) => t.expectedTone).join('');
  if (!fullPat) return [];

  const lockedIndices = tokens
    .map((t, idx) => (t.status === 'locked' && t.char && t.char !== '＿' ? idx : -1))
    .filter((idx) => idx !== -1);

  // 1. 若無任何字元鎖定，直接使用標準候選生成
  if (lockedIndices.length === 0) {
    return getVerifiedCandidatesForGroupPattern(fullPat, limit, randomize, themeText);
  }

  // 2. 若全部字元皆鎖定，直接回傳鎖定字本身
  if (lockedIndices.length === tokens.length) {
    return [tokens.map((t) => t.char || '').join('')];
  }

  const matchesLocked = (word: string) => {
    const chars = Array.from(word);
    if (chars.length !== tokens.length) return false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].status === 'locked' && tokens[i].char && tokens[i].char !== '＿') {
        if (chars[i] !== tokens[i].char) return false;
      }
    }
    return true;
  };

  const results: string[] = [];
  const seen = new Set<string>();

  // A. 先嘗試全詞匹配（最自然的原生詞或成語）
  const fullCands = getVerifiedCandidatesForGroupPattern(fullPat, 100, randomize, themeText);
  for (const w of fullCands) {
    if (matchesLocked(w) && !seen.has(w)) {
      seen.add(w);
      results.push(w);
      if (results.length >= limit) return results;
    }
  }

  // B. 連續未鎖定區塊精準拼接填補
  const firstUnlocked = tokens.findIndex((t) => t.status !== 'locked');
  const lastUnlocked = tokens.map((t) => t.status !== 'locked').lastIndexOf(true);

  // 情況 1：前綴鎖定，後綴未鎖定（例如 02 鎖定，後綴 34 待填）
  if (firstUnlocked > 0 && lastUnlocked === tokens.length - 1) {
    const lockedPrefix = tokens.slice(0, firstUnlocked).map((t) => t.char || '').join('');
    const suffixPat = tokens.slice(firstUnlocked).map((t) => t.expectedTone).join('');
    const suffixCands = getVerifiedCandidatesForGroupPattern(suffixPat, 40, randomize, themeText);

    for (const sc of suffixCands) {
      if (!isNaturalCombinedPhrase(lockedPrefix, sc)) continue;
      const combined = `${lockedPrefix}${sc}`;
      if (!seen.has(combined) && matchesLocked(combined)) {
        const check = verifyPhraseAgainstPattern(combined, fullPat);
        if (check.isExactMatch && check.endErgonomics.rating !== 'warning_stopped') {
          seen.add(combined);
          results.push(combined);
          if (results.length >= limit) return results;
        }
      }
    }
  }

  // 情況 2：後綴鎖定，前綴未鎖定（例如前綴 02 待填，後綴 34 鎖定）
  if (firstUnlocked === 0 && lastUnlocked < tokens.length - 1) {
    const prefixPat = tokens.slice(0, lastUnlocked + 1).map((t) => t.expectedTone).join('');
    const lockedSuffix = tokens.slice(lastUnlocked + 1).map((t) => t.char || '').join('');
    const prefixCands = getVerifiedCandidatesForGroupPattern(prefixPat, 40, randomize, themeText);

    for (const pc of prefixCands) {
      if (!isNaturalCombinedPhrase(pc, lockedSuffix)) continue;
      const combined = `${pc}${lockedSuffix}`;
      if (!seen.has(combined) && matchesLocked(combined)) {
        const check = verifyPhraseAgainstPattern(combined, fullPat);
        if (check.isExactMatch && check.endErgonomics.rating !== 'warning_stopped') {
          seen.add(combined);
          results.push(combined);
          if (results.length >= limit) return results;
        }
      }
    }
  }

  // 情況 3：中間未鎖定，前後皆鎖定（例如 0 鎖定，23 待填，4 鎖定）
  if (firstUnlocked > 0 && lastUnlocked < tokens.length - 1) {
    const lockedPrefix = tokens.slice(0, firstUnlocked).map((t) => t.char || '').join('');
    const middlePat = tokens.slice(firstUnlocked, lastUnlocked + 1).map((t) => t.expectedTone).join('');
    const lockedSuffix = tokens.slice(lastUnlocked + 1).map((t) => t.char || '').join('');
    const middleCands = getVerifiedCandidatesForGroupPattern(middlePat, 40, randomize, themeText);

    for (const mc of middleCands) {
      const combined = `${lockedPrefix}${mc}${lockedSuffix}`;
      if (!seen.has(combined) && matchesLocked(combined)) {
        const check = verifyPhraseAgainstPattern(combined, fullPat);
        if (check.isExactMatch && check.endErgonomics.rating !== 'warning_stopped') {
          seen.add(combined);
          results.push(combined);
          if (results.length >= limit) return results;
        }
      }
    }
  }

  // C. 兜底逐字填補（任意零散鎖定字，從單字庫精選音階吻合之常用字）
  if (results.length < limit) {
    const unlockedPositions = tokens
      .map((t, idx) => (t.status !== 'locked' ? { idx, tone: t.expectedTone } : null))
      .filter(Boolean) as { idx: number; tone: string }[];

    if (unlockedPositions.length > 0 && unlockedPositions.length <= 2) {
      const candLists = unlockedPositions.map((pos) => {
        const raw = VERIFIED_CANTONESE_WORSHIP_CHARS[pos.tone] || [];
        return raw.map((c) => c.replace(/\(.*\)/, '')).filter(Boolean).slice(0, 20);
      });

      if (unlockedPositions.length === 1) {
        const pos = unlockedPositions[0];
        for (const ch of candLists[0]) {
          const chars = tokens.map((t) => t.char || '＿');
          chars[pos.idx] = ch;
          const combined = chars.join('');
          if (!seen.has(combined) && matchesLocked(combined)) {
            const check = verifyPhraseAgainstPattern(combined, fullPat);
            if (check.isExactMatch && check.endErgonomics.rating !== 'warning_stopped') {
              seen.add(combined);
              results.push(combined);
              if (results.length >= limit) return results;
            }
          }
        }
      } else if (unlockedPositions.length === 2) {
        const pos1 = unlockedPositions[0];
        const pos2 = unlockedPositions[1];
        for (const ch1 of candLists[0].slice(0, 10)) {
          for (const ch2 of candLists[1].slice(0, 10)) {
            const chars = tokens.map((t) => t.char || '＿');
            chars[pos1.idx] = ch1;
            chars[pos2.idx] = ch2;
            const combined = chars.join('');
            if (!seen.has(combined) && matchesLocked(combined)) {
              const check = verifyPhraseAgainstPattern(combined, fullPat);
              if (check.isExactMatch && check.endErgonomics.rating !== 'warning_stopped') {
                seen.add(combined);
                results.push(combined);
                if (results.length >= limit) return results;
              }
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * 從用戶輸入的「歌曲名稱」與「主題故事」中，自動提取核心詞彙並附上 100% 準確的 0243 聲調標記，
 * 讓 AI 填詞時能直接把用戶故事中的關鍵字（如：掌權[30]、困境[43]、患難[22]、驚惶[30]）精準嵌進對應旋律！
 */
export function extractThemeVocabularyHints(title = '', meaning = ''): {
  matchedClusterLabels: string[];
  annotatedKeywords: string[];
} {
  const combinedText = `${title} ${meaning}`.trim();
  if (!combinedText) {
    return { matchedClusterLabels: [], annotatedKeywords: [] };
  }

  const matchedClusterLabels: string[] = [];
  const candidateWords = new Set<string>();

  // 1. 提取用戶輸入中的中文短句與 2~4 字關鍵詞
  const segments = combinedText
    .split(/[，。、！？；：,.!?;:\s（）()「」『』]+/)
    .map((s) => s.replace(/[^\u4e00-\u9fa5]/g, ''))
    .filter((s) => s.length >= 2);

  const stopWords = new Set([
    '一首', '一首歌', '一首講', '無論', '什麼', '因為', '我們', '可以', '不要', '不用', '一個', '這個',
  ]);

  for (const seg of segments) {
    if (seg.length >= 2 && seg.length <= 5 && !stopWords.has(seg)) {
      candidateWords.add(seg);
    }
    // 針對較長敘述（例如「在無論什麼困境中」），比對詞庫中有出現在用戶敘述裡的詞彙
    for (const corpusWord of RAW_CANTONESE_WORSHIP_CORPUS) {
      if (corpusWord.length >= 2 && seg.includes(corpusWord)) {
        candidateWords.add(corpusWord);
      }
    }
  }

  // 2. 加入觸發的主題語意群組推薦詞
  for (const cluster of THEME_SEMANTIC_CLUSTERS) {
    if (cluster.triggers.test(combinedText)) {
      matchedClusterLabels.push(cluster.label);
      cluster.featuredPhrases.forEach((p) => candidateWords.add(p));
    }
  }

  const annotatedKeywords: string[] = [];
  candidateWords.forEach((word) => {
    const { pattern, jyutpings } = getPhrasePrimary0243(word);
    if (pattern && !pattern.includes('?')) {
      annotatedKeywords.push(`${word}[${pattern}](${jyutpings.join(' ')})`);
    }
  });

  return {
    matchedClusterLabels,
    annotatedKeywords: annotatedKeywords.slice(0, 36),
  };
}

/**
 * 根據用戶輸入的目標 pattern 列表與歌曲主題，動態生成「主題核心詞彙 + 100% 協音字詞速查提示表」供 AI 參考
 */
export function buildDynamicLexiconPrompt(
  patterns: string[],
  title = '',
  meaning = ''
): string {
  const themeText = `${title} ${meaning}`.trim();
  const uniqueGroupPatterns = new Set<string>();
  patterns.forEach((line) => {
    normalizeTonePatternLine(line)
      .split(' ')
      .filter(Boolean)
      .forEach((gp) => uniqueGroupPatterns.add(gp));
  });

  const lines: string[] = [];

  // 優先輸出用戶主題／故事專屬的 0243 關鍵詞對照表
  const themeHints = extractThemeVocabularyHints(title, meaning);
  if (themeHints.annotatedKeywords.length > 0) {
    lines.push(
      `【🎯 本曲主題與故事專屬 0243 協音核心詞彙（自動根據用戶主題「${title}：${meaning}」分析，請務必優先將這些主題詞彙寫進對應聲調的樂句中！）】：`
    );
    if (themeHints.matchedClusterLabels.length > 0) {
      lines.push(`- 偵測到核心神學主題：${themeHints.matchedClusterLabels.join('、')}`);
    }
    lines.push(`- 主題核心詞與 0243 聲調：${themeHints.annotatedKeywords.join('、')}`);
    lines.push('');
  }

  lines.push('【本地粵拼引擎 100% 驗證之 0243 協音常用單字】：');
  lines.push(`- 數字 0（陽平，最低音）：${VERIFIED_CANTONESE_WORSHIP_CHARS['0'].join('、')}`);
  lines.push(`- 數字 2（中低音，含「在、患、難、懼、是、大、願、伴、望、靜」）：${VERIFIED_CANTONESE_WORSHIP_CHARS['2'].join('、')}`);
  lines.push(`- 數字 4（次高音，含「我、你、祢」、「更(更深/更愛/更加)」、怕、困、勝、愛、信、靠、向、敬、拜、讚、盼、賜、照）：${VERIFIED_CANTONESE_WORSHIP_CHARS['4'].join('、')}`);
  lines.push(`- 數字 3（最高音，含「更(更新/更改)」、掌、驚、境、主、祂、心、恩、深、真、光、歌、手、穩）：${VERIFIED_CANTONESE_WORSHIP_CHARS['3'].join('、')}`);

  const groupHints: string[] = [];
  uniqueGroupPatterns.forEach((gp) => {
    const verifiedExamples = getVerifiedCandidatesForGroupPattern(gp, 12, false, themeText);
    if (verifiedExamples.length > 0) {
      groupHints.push(
        `  * 區塊 [${gp}]（${gp.length}字）100%啱音積木推薦（強烈建議優先調用或作為基底，將故事意境自然融入；若自創新詞必須嚴格符合各字聲調）：${verifiedExamples.join('、')}`
      );
    }
  });

  lines.push('\n【💡 大師級意念同義重組指南（嚴禁削足適履／嚴禁腰斬專有名詞）】：');
  lines.push('當你想表達的概念與特定音階不合時，請換用另一個同義且自然順口的粵語詞組，保留神學意境，絕不可自造縮寫：');
  lines.push('  • 表達「宣告耶穌作王」：3320 ➔「尊主作王」；4420 ➔「宣告作王」；4230 ➔「祢已掌權」；2430 ➔「願祢作王」；04430 ➔「宣稱主作王」。（切勿寫成「宣耶王」！）；');
  lines.push('  • 表達「十架救贖捨命」：2444 ➔「十架捨命」；4242 ➔「為我捨命」；3442 ➔「寶血洗淨」；2422 ➔「十架大愛」；');
  lines.push('  • 表達「風浪患難不驚」：3422 ➔「風雨不懼」；4222 ➔「無懼患難」；3344 ➔「風浪平息」；4232 ➔「不再驚怕」；');
  lines.push('  • 表達「親近深情渴慕」：4430 ➔「我渴慕祢」；2432 ➔「靜候主前」；3324 ➔「清心仰盼」；4420 ➔「切切尋求」。');

  if (groupHints.length > 0) {
    lines.push('\n【各數字譜區塊之 100% 啱音短語結構參考】：');
    lines.push(...groupHints);
  }

  return lines.join('\n');
}
