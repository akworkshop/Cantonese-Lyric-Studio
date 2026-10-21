import ToJyutping from 'to-jyutping';
import {
  LyricLine,
  LyricToken,
  LyricWordGroup,
  TokenStatus,
  VocalErgonomicsInfo,
} from '@/types/lyric';

/**
 * 基督教神學與粵語詩歌常用字詞優先審音表（補充神學代名詞與詩歌文讀首選音）
 */
const THEOLOGICAL_JYUTPING_OVERRIDES: Record<string, string[]> = {
  祂: ['taa1'],
  祢: ['nei5'],
  你: ['nei5'],
  我: ['ngo5'],
  更: ['gang1'],
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
    if (
      candidates.size === 0 &&
      candList &&
      candList.length > 0 &&
      Array.isArray(candList[0][1]) &&
      candList[0][1][0]
    ) {
      candidates.add(candList[0][1][0]);
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
 * - 「更」在粵語詩歌填詞實務（如：更新、更深、更愛、更高、更美、更親近）統一歸入 3 聲（gang1 / gaang1）
 */
const CUSTOM_0243_TONE_OVERRIDES: Record<string, string> = {
  我: '4',
  你: '4',
  祢: '4',
  更: '3',
};

/**
 * 分析單一漢字與目標 0243 聲階的對位結果，回傳完整 LyricToken 屬性
 */
export function analyzeCharToken(
  char: string,
  expectedTone: string,
  isGroupEnd = false,
  existingId?: string,
  preserveLockedStatus?: TokenStatus
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

  const parsedList = candidates.map((jp) => {
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

  // 若多音字中有任一讀音符合 expectedTone，優先選取該讀音！否則選第一常讀音
  const matchedReading =
    parsedList.find((p) => p.tone0243 === expectedTone) || parsedList[0];

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

      const groups: LyricWordGroup[] = groupPatterns.map((gPattern, gIdx) => {
        const rawGroupText = (lineGroupTexts[gIdx] || '').replace(/\s+/g, '');
        const chars = Array.from(rawGroupText);
        const existingGroup = existingLine?.groups?.[gIdx];

        const tokens: LyricToken[] = Array.from(gPattern).map((expectedTone, tIdx) => {
          const existingToken = existingGroup?.tokens?.[tIdx];
          if (existingToken && existingToken.status === 'locked') {
            return analyzeCharToken(
              existingToken.char,
              expectedTone,
              tIdx === gPattern.length - 1,
              existingToken.id,
              'locked'
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
            `L${lineIdx}-G${gIdx}-T${tIdx}`
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

  const tokens: LyricToken[] = targetTones.map((expected, idx) => {
    const char = cleanChars[idx] || '？';
    return analyzeCharToken(char, expected, idx === targetTones.length - 1);
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
  const chars = Array.from(phrase.replace(/[^\u4e00-\u9fa5]/g, ''));
  const tones: string[] = [];
  const jyutpings: string[] = [];

  chars.forEach((ch) => {
    const cands = getCharJyutpingCandidates(ch);
    const primary = cands[0] || '';
    const info = jyutpingTo0243(primary);
    const customTone = CUSTOM_0243_TONE_OVERRIDES[ch];
    tones.push(customTone || info.tone0243);
    jyutpings.push(primary);
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
 * 單字 0243 嚴格分類庫（強化「更(3聲)、我/你/祢(4聲)、主/祂(3聲)、神(0聲)」與 CantonHymn 詩意字庫）
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
    '我(ngo5->4)', '你(nei5->4)', '祢(nei5->4)', '怕(paa3)', '困(kwan3)', '勝(sing3)',
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
  // === 0. CantonHymn 經典與「神掌權／困境患難中不驚惶」核心主題詞彙（2～5字） ===
  // 2字：掌權、作王、困境、患難、驚惶、安穩
  '掌權', '作王', '君王', '寶座', '掌管', '統管', '驚惶', '驚怕', '懼怕', '害怕',
  '困境', '困苦', '患難', '苦難', '危難', '試煉', '風暴', '暴風', '波濤', '巨浪',
  '狂風', '洪水', '大水', '翻騰', '洶湧', '動搖', '堅立', '安穩', '得勝', '蔭下',
  '藏身', '避難', '信實', '應許', '遮蓋', '翅膀', '剛強', '壯膽', '堅定', '無懼',
  // 3字：掌權、不驚惶、患難、困境（CantonHymn 常用句式）
  '已掌權', '仍掌權', '神掌權', '主掌權', '祢掌權', '永掌權', '必掌權', '仍作王', '神作王', '主作王', '坐寶座',
  '不驚惶', '不驚怕', '莫驚惶', '莫驚怕', '未驚怕', '別驚怕', '無懼怕', '不懼怕', '不害怕', '未動搖', '不動搖',
  '患難中', '患難裡', '在患難', '在困境', '困境中', '困境裡', '困苦中', '苦難裡', '風暴裡', '暴風中', '洪水中',
  '大水裡', '狂風裡', '巨浪裡', '死蔭谷', '必堅立', '得安穩', '主得勝', '祢得勝', '藏蔭下', '祢蔭下', '主懷裡',
  '開口唱', '心歌唱', '主知道', '祢知道', '懂我心', '不撇下', '不離開', '有定時', '仍信靠', '未看見',
  // 4字：CantonHymn《安靜》《恩典之路》《主祢知道》《儘管我尚未看見》《有時》及掌權患難主題
  '祢已掌權', '主已掌權', '神已掌權', '父已掌權', '祢仍掌權', '主仍掌權', '神仍掌權', '永遠掌權', '萬代掌權',
  '坐著為王', '掌權作王', '執掌王權', '父祢作王', '仍坐寶座', '高坐寶座', '掌管萬有', '掌管萬事', '掌管一生',
  '不用驚惶', '不必驚惶', '不要驚惶', '莫怕驚惶', '未怕驚惶', '不用驚怕', '不要驚怕', '心不驚惶', '心不驚怕',
  '無懼風暴', '無懼患難', '無懼困境', '無懼黑暗', '勝過患難', '勝過風浪', '勝過試煉', '勝過黑暗', '勝過困境',
  '走過患難', '走出困境', '患難困苦', '面對患難', '面對困境', '面對風浪', '縱遇患難', '縱在困境', '在患難中',
  '大水翻騰', '波濤洶湧', '狂風巨浪', '風暴之上', '洪水之上', '暴風上空', '在洪水中', '藏在蔭下', '翅膀蔭下',
  '安然信靠', '安穩在手', '堅定信靠', '應許不變', '得勝有餘', '恩典之路', '刻在心上', '握在手中', '抬頭仰望',
  '刻意靠近', '安靜知神', '萬事定時', '流淚有時', '歡笑有時', '尚未看見', '仍願信靠', '當得讚揚', '配得尊崇',
  // 5字：專為 [42434]、[34422] 等 5 字樂句打造的「掌權／患難／困境／得勝」自然詩句
  '靠著祢得勝', '祢領我走過', '祢伴我走過', '祢助我得勝', '祢讓我得勝', '我願靠主愛', '我定靠主愛', '暗夜見真愛',
  '世上見主愛', '再未怕驚怕', '信是祢恩愛', '看患難走過', '縱面對風浪', '縱遇見風暴', '我在祢蔭下', '靠著主得勝',
  '主愛勝患難', '深信勝患難', '知祢勝患難', '深信祢護佑', '深信祢導引', '心靠祢靜候', '主愛賜力量', '知祢賜力量',
  '主愛照大地', '主看顧大地', '主看顧日夜', '風過見大路', '恩愛賜力量', '父祢仍作王', '在患難掌權', '風暴裡掌權',
  '患難裡掌權', '困境裡掌權', '患難裡不驚', '困境裡信靠', '洪水裡作王', '藏在祢蔭下', '刻在祢心上', '握在祢手中',
  '我心屬於祢', '一生屬於祢', '應許不改變', '恩光總照遍', '屈膝祢面前', '稱揚祢美善',

  // === 1. 含「更 (3聲)」之詩歌高頻詞彙（2～4字） ===
  '更新', '更深', '更高', '更美', '更愛', '更信', '更近', '更清', '更真', '更亮', '更強', '更親', '更懂', '更甜', '更穩',
  '更親近', '更深愛', '更深信', '更堅定', '更剛強', '更認識', '更明白', '更渴慕', '更靠近', '更像祢', '更新我', '更愛祢', '更信祢', '更靠祢', '更知祢',
  '更深愛祢', '更深信祢', '更深靠祢', '更親近祢', '更認識祢', '更新我心', '更新生命', '更新靈命', '愛祢更深', '信祢更深', '信心更堅', '恩典更深', '主愛更深', '比天更高', '比海更深',

  // === 2. 自然意象、光影、水泉與季節畫面（2字） ===
  '晨光', '朝陽', '晨曦', '星光', '星辰', '星河', '銀河', '月光', '真光', '亮光', '榮光', '光輝', '光芒', '火光', '微光', '曙光', '晴空', '藍天', '天際', '穹蒼', '雲彩', '彩虹',
  '清泉', '甘泉', '活水', '水流', '溪水', '江河', '甘霖', '春雨', '恩雨', '細雨', '風雨', '風浪', '海浪', '深海', '海洋', '海岸', '港灣', '春風', '清風', '微風', '和風', '風雲',
  '山嶺', '高山', '山谷', '幽谷', '曠野', '沙漠', '綠洲', '荊棘', '大地', '全地', '世間', '人間', '塵世', '塵土', '花開', '花香', '盛放', '果子', '麥田', '禾稼', '青草', '溪邊',
  '長夜', '黑夜', '暗夜', '夜空', '夜晚', '黎明', '破曉', '清晨', '早晨', '今日', '今朝', '明日', '歲月', '年日', '一生', '前路', '道路', '旅途', '路途', '方向', '步履', '腳步', '足跡', '家園', '天家',

  // === 3. 心靈狀態、生命經歷與詩意動詞（2字） ===
  '照亮', '照明', '照耀', '照射', '點燃', '燃亮', '溫暖', '溫柔', '撫平', '擦乾', '抹乾', '醫治', '包裹', '纏裹', '安慰', '體恤', '擁抱', '環抱', '懷抱', '緊握', '牽引', '帶領', '引領', '引導',
  '伴隨', '陪伴', '同行', '同在', '共行', '同走', '扶持', '扶助', '提攜', '托住', '看顧', '眷顧', '守護', '守望', '守候', '等候', '靜候', '仰望', '凝望', '細看', '看清', '看見', '聽見', '傾聽', '細聽', '垂聽',
  '潔淨', '煉淨', '洗淨', '赦免', '饒恕', '拯救', '救贖', '釋放', '改變', '塑造', '陶造', '建立', '堅固', '剛強', '堅定', '勇敢', '無懼', '無畏', '放開', '放下', '放心', '放懷', '交託', '投靠', '信靠', '倚靠', '依靠',
  '安息', '安靜', '平靜', '安穩', '平安', '喜樂', '滿足', '豐盛', '恩典', '恩惠', '慈愛', '憐憫', '信實', '公義', '聖潔', '榮耀', '奇妙', '永恆', '無窮', '無邊', '無限', '常存', '長存', '不變', '依然',
  '敬拜', '讚美', '歌頌', '頌讚', '高舉', '高唱', '歡唱', '歌唱', '歡欣', '歡呼', '飛揚', '展翅', '高飛', '奔跑', '奔向', '追隨', '跟隨', '親近', '渴慕', '愛慕', '思念', '記念', '禱告', '呼求', '祈求', '感謝', '感恩', '奉獻', '獻上', '順服', '謙卑',
  '疲乏', '困倦', '軟弱', '傷痛', '眼淚', '流淚', '嘆息', '憂慮', '愁煩', '重擔', '迷路', '迷失', '孤單', '幽暗', '低谷', '患難', '試煉', '走過', '勝過', '跨過', '突破', '開路', '開創', '開啟', '盛載', '充滿', '滿溢', '澆灌', '傾倒', '賜下',

  // === 4. 第一、二人稱（「我(4)」「祢/你(4)」「主(3)」「祂(3)」）自然互動短語（2字） ===
  '愛祢', '信祢', '靠祢', '向祢', '見祢', '盼祢', '讚祢', '敬祢', '頌祢', '念祢', '慕祢', '望祢',
  '救我', '愛我', '看我', '聽我', '照我', '賜我', '赦我', '領我', '引我', '伴我', '護我', '念我', '助我', '為我', '造我', '用我', '差我', '召我',
  '求祢', '隨祢', '陪我', '扶我', '憐我', '尋祢', '迎祢', '唯祢', '共祢', '與祢', '同祢', '是祢', '願祢', '讓祢',
  '我心', '我身', '我歌', '我手', '我生', '我路', '我步', '我靈', '我口', '我眼', '我夢',
  '祢恩', '祢手', '祢光', '祢心', '祢道', '祢話', '祢愛', '祢名', '祢聲', '祢面',
  '知我', '牽我', '撫我', '擁我', '守我', '懂我', '因祢', '歸祢', '依祢', '屬祢',
  '主愛', '主恩', '主手', '主心', '主光', '主道', '主名', '主聲', '神恩', '神愛',

  // === 5. 具象詩意與自然流暢 3 字詞組（覆蓋多種 0243 組合） ===
  '晨光裡', '星光下', '星照明', '光照明', '真光輝', '放光明', '出黑暗', '入光明', '見真光', '迎晨光', '向晨光', '看星光', '仰望天', '藍天裡',
  '風雨中', '風浪裡', '黑夜裡', '長夜裡', '幽谷裡', '曠野中', '在低谷', '在患難', '迷霧裡', '孤單裡', '流淚谷', '風浪靜', '夜漸靜', '路漸近', '雨後晴', '天放晴',
  '清泉流', '活水流', '甘霖降', '恩雨降', '春風吹', '微風吹', '花盛放', '果子滿', '新歌聲', '歌讚揚', '唱新歌', '高聲唱', '齊歌唱', '歡呼聲',
  '恩愛長', '主恩深', '主愛深', '恩典多', '恩夠用', '愛無窮', '愛不變', '常同在', '永同在', '不撇下', '不離開', '無窮盡', '永不變',
  '心意誠', '心謙卑', '心安息', '心安靜', '心堅定', '心剛強', '心感恩', '心敬拜', '心讚美', '心信靠', '心仰望', '心順服', '心歸主', '心向祢',
  '靜候著', '步履定', '前路明', '步向光', '向天家', '走前路', '行義路', '奔前路', '展翅飛', '高飛翔', '得安息', '得力量', '得平安', '得喜樂', '得釋放', '得自由', '得醫治', '得安慰', '得更新',
  '賜平安', '賜喜樂', '賜力量', '賜亮光', '賜大恩', '賜新心', '賜盼望', '賜生命', '賜活水', '獻真心', '獻全人', '獻讚美', '獻感謝', '願順服', '願跟隨', '願擺上',
  '伴我走', '領我走', '陪我走', '引導我', '照亮我', '潔淨我', '赦免我', '安慰我', '眷顧我', '擁抱我', '守護我', '醫治我', '扶持我', '堅固我', '塑造我', '陶造我', '充滿我', '釋放我', '提攜我', '體恤我', '看顧我', '保護我', '拯救我', '救贖我', '改變我',
  '聽我言', '聽我聲', '聽禱告', '垂聽我', '細聽我', '牽我手', '緊握我', '擦眼淚', '撫傷痛', '卸重擔', '開道路', '指方向',
  '我愛祢', '我信祢', '我靠祢', '我敬拜', '我讚美', '我盼望', '我信靠', '我感謝', '我仰望', '我順服', '我跟隨', '我歌唱', '我感恩', '我深信', '我深愛', '我渴慕', '我親近', '我投靠', '我交託',
  '祢愛我', '祢救我', '祢看我', '祢聽我', '祢照我', '祢領我', '祢伴我', '祢知我', '祢牽我', '祢撫我', '祢擁我', '祢守我', '祢懂我', '祢造我', '祢護我',
  '敬拜祢', '讚美祢', '信靠祢', '仰望祢', '順服祢', '歌頌祢', '高舉祢', '感謝祢', '親近祢', '跟隨祢', '深愛祢', '渴慕祢', '投靠祢', '等候祢', '愛慕祢', '榮耀祢',
  '在祢手', '在祢裡', '在祢前', '在祢懷', '向祢唱', '為祢活', '因祢愛', '靠祢恩', '靠主恩', '蒙主恩',

  // === 6. 具象詩意、畫面感與連貫敘事 4 字詞組 ===
  '照亮前路', '照亮黑夜', '照亮我心', '照亮生命', '長夜放明', '黑夜放明', '晨光照耀', '晨光破曉', '黎明破曉', '星光引路', '星光閃耀', '真光照耀', '榮耀光輝', '大愛光輝', '生命亮光', '世界真光', '盼望真光', '走出黑夜', '迎向晨光', '步向真光', '進入光明',
  '風浪平息', '風雨同路', '風雨同行', '風浪不驚', '平靜風浪', '跨過風浪', '走過低谷', '行過幽谷', '走出曠野', '曠野開路', '沙漠開河', '清泉流淌', '活水湧流', '甘霖降下', '恩雨降臨', '春風吹拂', '花開盛放', '雨後放晴', '雲彩圍繞',
  '撫平傷痛', '擦乾眼淚', '抹乾眼淚', '醫治傷痛', '包裹傷口', '卸下重擔', '放開愁煩', '放下憂慮', '走出迷惘', '尋回方向', '看清前路', '步履堅定', '展翅高飛', '如鷹展翅', '奔向標竿', '勇敢前行', '無懼風浪', '無畏風雨', '剛強壯膽', '重新得力',
  '救恩降臨', '恩典降臨', '恩典夠用', '恩典滿溢', '恩典湧流', '慈愛永存', '慈愛長存', '信實不變', '大愛無窮', '主愛長存', '主恩滿溢', '平安喜樂', '喜樂滿懷', '喜樂湧流', '生命活水', '生命改變', '生命豐盛', '滿有盼望', '滿有能力', '滿有平安',
  '與我同行', '伴我同行', '陪我同行', '領我前行', '引我前行', '引我歸家', '領我歸家', '牽我手走', '緊握我手', '賜我平安', '賜我喜樂', '賜我力量', '賜我新心', '賜我盼望', '賜我勇氣', '聽我禱告', '聽我呼求', '垂聽禱告', '看顧保守', '晝夜看顧',
  '在祢懷裡', '在祢愛裡', '在祢光中', '在祢手裡', '在祢殿中', '在祢面前', '在祢蔭下', '在主愛裡', '在主懷裡', '在主光中',
  '我深愛祢', '我敬拜祢', '我讚美祢', '我信靠祢', '我仰望祢', '我順服祢', '我感謝祢', '我跟隨祢', '我渴慕祢', '我親近祢', '我歌頌祢', '我高舉祢', '我投靠祢',
  '我心愛祢', '我心靠祢', '我心向祢', '我心敬拜', '我心讚美', '我心安息', '我心安靜', '我心感恩', '我心順服', '我心堅定', '我心歡唱', '我心歌頌', '我心仰望',
  '祢深愛我', '祢先愛我', '祢拯救我', '祢看顧我', '祢引導我', '祢領我走', '祢伴我走', '祢陪伴我', '祢保護我', '祢牧養我', '祢赦免我', '祢潔淨我', '祢醫治我', '祢安慰我', '祢擁抱我', '祢牽我手', '祢扶持我', '祢堅固我', '祢體恤我', '祢塑造我', '祢釋放我', '祢認識我',
  '真心愛祢', '真心敬拜', '真心信靠', '真心讚美', '甘心獻上', '甘心順服', '清心敬拜', '清心愛祢', '全心愛祢', '全心敬拜', '全心讚美', '全心信靠', '同心敬拜', '同心讚美', '同心合意', '高聲讚美', '高聲敬拜', '高聲歌唱', '謙卑順服', '謙卑敬拜', '安靜等候', '專心仰望',
  '一生愛祢', '一生靠祢', '一生敬拜', '一生讚美', '一生跟隨', '一生事奉', '一生頌讚', '永生盼望', '永遠愛祢', '永遠敬拜', '常存感恩', '常存盼望', '常存喜樂', '唱歌讚揚', '願唱新歌', '獻上讚美', '獻上感謝', '獻上自己',
  '求祢引導', '求祢看顧', '求祢憐憫', '求祢赦免', '求祢潔淨', '求祢更新', '求祢聽我', '求祢領我', '求祢掌管', '求祢充滿', '求祢醫治', '求祢安慰', '求祢照明', '求祢扶持',
  '因祢愛我', '因祢同在', '因祢恩典', '向祢歌唱', '向祢敬拜', '向祢讚美', '向祢呼求', '為我捨命', '為我開路', '唯獨愛祢', '唯獨敬拜',

  // === 7. 5～6字經典詩意連貫句式 ===
  '前路未怕行', '長夜漸放明', '風浪裡安息', '風雨未怕行', '牽我渡風浪', '伴我走前路', '領我出黑夜', '晨光照我心', '星光照夜空', '活水湧我心', '清泉潤我心', '恩雨降下來', '主愛像清泉', '聽見祢微聲', '在祢懷安息', '在祢裡安穩', '慈父伴我行', '同在伴我行', '流淚亦讚揚', '無懼共祢行', '恩典伴我行', '一生跟隨祢', '全心敬拜祢', '更深認識祢', '更深愛著祢', '更新我生命', '照亮我前路', '撫平我傷痛', '擦乾我眼淚',

  // === 8. 單字構詞基底（供智慧語法組合） ===
  '更', '掌', '驚', '境', '君', '苦', '穩', '湧', '翻', '星', '光', '風', '雲', '山', '海', '花', '水', '春', '晨', '明', '清', '新', '深', '真', '高', '恩', '心', '歌', '聲', '音', '手', '身', '家', '生', '天', '安', '喜', '歡', '欣', '甘', '謙', '卑', '奔', '飛', '追', '牽', '撫', '擁', '守', '聽', '知', '依', '歸', '開', '今', '終', '將', '親', '溫', '傷', '主', '祂',
  '怕', '困', '蔭', '蓋', '應', '縱', '照', '愛', '信', '靠', '向', '盼', '看', '唱', '敬', '拜', '讚', '救', '賜', '獻', '見', '證', '進', '去', '放', '化', '快', '最', '要', '世', '界', '眷', '顧', '赦', '勝', '過', '再', '創', '作', '意', '志', '氣', '潔', '慰', '細', '破', '曉', '痛', '暗', '我', '你', '祢',
  '患', '難', '懼', '座', '暴', '著', '在', '是', '大', '願', '伴', '用', '共', '為', '望', '仰', '美', '永', '耀', '路', '地', '道', '步', '服', '命', '樂', '頌', '順', '義', '善', '護', '導', '待', '淚', '夜', '日', '力', '活', '領', '引', '慕', '萬', '但', '受', '定', '靜', '念', '話', '近', '盛', '謝', '佑', '裡', '浪', '岸', '雨', '暖', '夢', '渡', '漸', '未', '父',
  '權', '王', '惶', '仍', '騰', '名', '平', '常', '同', '行', '情', '全', '人', '能', '榮', '恆', '揚', '崇', '臨', '言', '前', '憐', '連', '途', '無', '窮', '尋', '求', '祈', '慈', '和', '誠', '然', '源', '流', '泉', '來', '誰', '從', '還', '唯', '懷', '扶', '持', '陪', '隨', '留', '存', '傳', '回', '迎', '長', '微', '柔', '晴', '河', '霖', '愁', '煩', '迷', '神', '靈',
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
 * 主題語意群組擴展表：當用戶輸入的歌名或故事包含特定關鍵詞時，自動激發對應的詩歌同義／關聯字群
 */
const THEME_SEMANTIC_CLUSTERS: {
  triggers: RegExp;
  label: string;
  boostChars: string[];
  featuredPhrases: string[];
}[] = [
  {
    triggers: /(掌權|作王|困境|患難|驚惶|驚怕|害怕|懼怕|風浪|風暴|苦難|試煉|低谷|洪水|大水|動搖|寶座)/,
    label: '神掌權／患難困境中不驚惶',
    boostChars: ['掌', '權', '王', '座', '驚', '惶', '怕', '懼', '患', '難', '困', '境', '苦', '暴', '浪', '穩', '勝', '剛', '強', '定', '靠', '護', '佑', '領', '伴', '渡', '過', '靜', '蔭'],
    featuredPhrases: [
      '祢已掌權', '神已掌權', '主已掌權', '仍掌權', '已掌權', '掌權', '作王',
      '不用驚惶', '不要驚惶', '莫怕驚惶', '不驚惶', '不驚怕', '無懼怕', '驚惶',
      '在患難', '患難裡', '患難中', '患難', '在困境', '困境裡', '困境中', '困境',
      '勝過患難', '走出困境', '靠著祢得勝', '主愛勝患難', '深信勝患難', '祢領我走過', '祢伴我走過', '大水翻騰', '風浪平息', '安穩在手', '藏在祢蔭下',
    ],
  },
  {
    triggers: /(醫治|安慰|眼淚|流淚|傷痛|受傷|疲乏|困倦|孤單|軟弱|憂慮|愁煩|重擔|撫平|擁抱)/,
    label: '醫治安慰／卸下重擔與眼淚',
    boostChars: ['醫', '治', '慰', '撫', '淚', '傷', '痛', '擁', '抱', '懷', '息', '卸', '擔', '伴', '陪', '懂', '知', '憐', '恤', '暖', '柔'],
    featuredPhrases: [
      '撫平傷痛', '擦乾眼淚', '醫治我', '安慰我', '擁抱我', '卸下重擔', '在祢懷裡', '得安息', '祢懂我心', '主祢知道',
    ],
  },
  {
    triggers: /(讚美|敬拜|歌頌|感恩|感謝|榮耀|高舉|歡呼|喜樂|開口唱|頌揚|尊崇)/,
    label: '敬拜讚美／感恩與高舉主名',
    boostChars: ['讚', '美', '敬', '拜', '謝', '頌', '揚', '歌', '唱', '歡', '喜', '樂', '榮', '耀', '高', '舉', '尊', '崇'],
    featuredPhrases: [
      '高聲讚美', '全心敬拜', '向祢歌唱', '當得讚揚', '配得尊崇', '開口唱', '唱新歌', '獻上感謝', '榮耀歸祢',
    ],
  },
  {
    triggers: /(十架|救贖|寶血|赦免|罪|捨命|救恩|羔羊|復活|重生)/,
    label: '十架救贖／寶血赦罪與重生',
    boostChars: ['十', '架', '救', '贖', '血', '赦', '罪', '命', '恩', '愛', '羔', '羊', '潔', '淨', '釋', '放', '新'],
    featuredPhrases: [
      '十架大愛', '為我捨命', '寶血潔淨', '救贖恩典', '赦免我罪', '得著釋放', '更新生命',
    ],
  },
  {
    triggers: /(跟隨|道路|方向|差遣|奉獻|擺上|順服|呼召|前路|同行|引導|帶領)/,
    label: '跟隨引導／恩典之路與奉獻',
    boostChars: ['隨', '路', '道', '步', '行', '走', '領', '引', '獻', '順', '服', '差', '召', '光', '明', '伴', '牽'],
    featuredPhrases: [
      '恩典之路', '伴我同行', '領我前行', '照亮前路', '一生跟隨', '謙卑順服', '牽我手走', '前路未怕行',
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
 * 檢查合成詞是否自然（過濾掉重複字、懸空介詞、生硬稱謂堆疊、以及「曠野愛不變」這類無介詞名詞硬拼）
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

  // 4. 避免詞組結尾停在懸空介詞／連詞／副詞（如「...在」、「...向」、「...求」、「...更」）
  const lastChar = chars[chars.length - 1];
  if (/[在向從為因共唯求更未漸還誰但用縱仍]/.test(lastChar)) return false;

  // 5. 當合成 5 字以上長句時，避免將純景物名詞（無「裡/中/下/過」等連貫字）直接硬貼在另一子句前（例如避免「曠野＋愛不變＝曠野愛不變」）
  if (chars.length >= 5 && left.length === 2) {
    const barePlaceNouns = new Set([
      '曠野', '沙漠', '山嶺', '高山', '山谷', '幽谷', '深海', '海洋', '海岸',
      '港灣', '大地', '全地', '塵世', '塵土', '果子', '麥田', '禾稼', '青草',
      '晴空', '藍天', '天際', '穹蒼', '雲彩', '彩虹', '家園',
    ]);
    if (barePlaceNouns.has(left) && !/^[裡中下上內外間開放流照見]/.test(right)) {
      return false;
    }
  }

  return true;
}

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

  // 2. 自然語法切分拼接
  if (exactCandidates.length < Math.max(limit, 24)) {
    const len = cleanPattern.length;
    const splits: [number, number][] = [];
    if (len === 2) splits.push([1, 1]);
    else if (len === 3) splits.push([2, 1], [1, 2]);
    else if (len === 4) splits.push([2, 2], [1, 3], [3, 1]);
    else if (len === 5) splits.push([2, 3], [3, 2]);
    else if (len === 6) splits.push([2, 4], [4, 2], [3, 3]);
    else if (len > 6) {
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
        for (const rw of rightWords) {
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
  lines.push(`- 數字 4（次高音，含「我、你、祢、怕、困、勝、愛、信、靠、向、敬、拜、讚、盼、賜、照」）：${VERIFIED_CANTONESE_WORSHIP_CHARS['4'].join('、')}`);
  lines.push(`- 數字 3（最高音，含「更、掌、驚、境、主、祂、心、恩、深、真、光、歌、手、穩」）：${VERIFIED_CANTONESE_WORSHIP_CHARS['3'].join('、')}`);

  const groupHints: string[] = [];
  uniqueGroupPatterns.forEach((gp) => {
    const verifiedExamples = getVerifiedCandidatesForGroupPattern(gp, 12, false, themeText);
    if (verifiedExamples.length > 0) {
      groupHints.push(
        `  * 區塊 [${gp}]（${gp.length}字）協音結構參考（請優先依主題故事自行造句，勿照抄與主題無關的詞）：${verifiedExamples.join('、')}`
      );
    }
  });

  if (groupHints.length > 0) {
    lines.push('\n【各數字譜區塊之 100% 啱音短語結構參考】：');
    lines.push(...groupHints);
  }

  return lines.join('\n');
}
