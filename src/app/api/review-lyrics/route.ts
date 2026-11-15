import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidatesWithLockedConstraints,
  getVerifiedCandidatesForGroupPattern,
  verifyPhraseAgainstPattern,
} from '@/lib/cantonese';
import { callLLMJson } from '@/lib/ai-providers';
import {
  AIProviderConfig,
  GlobalThematicReview,
  LyricLine,
  SongPerspective,
} from '@/types/lyric';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface LLMReviewResponse {
  overallScore: number;
  themeSummary: string;
  storyArcCritique: string;
  improvements: {
    lineIndex: number;
    groupIdx: number;
    currentPhrase: string;
    targetPattern: string;
    reason: string;
    suggestedPhrases: string[];
    isLineRewrite?: boolean;
  }[];
}

function getAlternativeLineSplits(
  lineDigits: string,
  currentPattern: string,
  themeContext: string,
  usedPhraseSet: Set<string>
): { splitPattern: string; parts: { pattern: string; candidates: string[] }[] }[] {
  const n = lineDigits.length;
  if (n < 4 || n > 8) return [];

  const normalizedCurrent = currentPattern.trim().replace(/\s+/g, ' ');
  const candidateSplits: string[][] = [];

  // 1-group (e.g. 4..7 chars)
  if (n >= 4 && n <= 7) {
    candidateSplits.push([lineDigits]);
  }
  // 2-group splits (each >= 2)
  for (let a = 2; a <= n - 2; a++) {
    candidateSplits.push([lineDigits.slice(0, a), lineDigits.slice(a)]);
  }
  // 3-group splits (each >= 2, for 6..8 chars)
  if (n >= 6) {
    for (let a = 2; a <= n - 4; a++) {
      for (let b = 2; b <= n - a - 2; b++) {
        candidateSplits.push([
          lineDigits.slice(0, a),
          lineDigits.slice(a, a + b),
          lineDigits.slice(a + b),
        ]);
      }
    }
  }

  const scored: {
    splitPattern: string;
    parts: { pattern: string; candidates: string[] }[];
    score: number;
  }[] = [];

  for (const parts of candidateSplits) {
    const splitPattern = parts.join(' ');
    if (splitPattern === normalizedCurrent) continue;

    const partData: { pattern: string; candidates: string[] }[] = [];
    let valid = true;
    let totalCount = 0;

    for (const p of parts) {
      const raw = getVerifiedCandidatesForGroupPattern(p, 12, false, themeContext);
      const fresh = raw.filter((c) => !usedPhraseSet.has(c));
      const pool = (fresh.length >= 2 ? fresh : raw).slice(0, 6);
      const minNeeded = parts.length === 1 && p.length >= 5 ? 1 : 2;
      if (pool.length < minNeeded) {
        valid = false;
        break;
      }
      totalCount += pool.length;
      partData.push({ pattern: p, candidates: pool });
    }

    if (valid) {
      // Prefer 2-group natural splits & higher candidate richness
      const groupBonus = parts.length === 2 ? 4 : parts.length === 1 ? 2 : 0;
      scored.push({ splitPattern, parts: partData, score: totalCount + groupBonus });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ splitPattern, parts }) => ({ splitPattern, parts }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = '無題詩歌',
      meaning = '敬拜讚美主恩',
      lines = [] as LyricLine[],
      perspective = 'devotional',
      aiConfig,
    }: {
      title: string;
      meaning: string;
      lines: LyricLine[];
      perspective?: SongPerspective;
      aiConfig: AIProviderConfig;
    } = body;

    if (!lines || lines.length === 0) {
      return NextResponse.json(
        { error: '目前畫布沒有歌詞可供全局檢測' },
        { status: 400 }
      );
    }

    const themeContext = `${title} ${meaning}`.trim();

    // 整理全曲歌詞文字與各組 100% 啱音詞庫備份
    const songOverview = lines.map((line, lIdx) => {
      const linePat = line.targetPattern || '';
      const section = line.section || '';
      const groupData = (line.groups || []).map((g, gIdx) => {
        const text = g.tokens.map((t) => t.char || '').join('');
        const gPat = g.targetGroupPattern || '';
        const isFullyLocked =
          g.tokens.length > 0 && g.tokens.every((t) => t.status === 'locked');
        const verifiedCandidates = getCandidatesWithLockedConstraints(
          g.tokens,
          30,
          false,
          themeContext
        );
        return {
          groupIdx: gIdx,
          pattern: gPat,
          currentText: text,
          isFullyLocked,
          candidates: verifiedCandidates,
        };
      });

      const fullLineText = groupData.map((g) => g.currentText).join(' ');
      return {
        lineIndex: lIdx,
        section,
        pattern: linePat,
        fullLineText,
        groups: groupData,
      };
    });

    const fullSongLyricsText = songOverview
      .map(
        (l) =>
          `第 ${l.lineIndex + 1} 行 ${l.section ? `【${l.section}】` : ''}(${
            l.pattern
          })：${l.fullLineText}`
      )
      .join('\n');

    // 🔍 自動掃描全曲重複字眼／重複詞組，生成強制去重警報給 AI
    const allCurrentPhrases: string[] = [];
    const phraseFreq = new Map<string, number>();
    const charFreq = new Map<string, number>();
    const ignoreChars = new Set(['我', '你', '祢', '祂', '的', '了', '在', '是', '有', '與', '同', '不']);

    for (const l of songOverview) {
      for (const g of l.groups) {
        if (!g.currentText) continue;
        allCurrentPhrases.push(g.currentText);
        phraseFreq.set(g.currentText, (phraseFreq.get(g.currentText) || 0) + 1);
        for (const ch of Array.from(g.currentText)) {
          if (!ignoreChars.has(ch)) {
            charFreq.set(ch, (charFreq.get(ch) || 0) + 1);
          }
        }
      }
    }

    const repeatedPhrases = Array.from(phraseFreq.entries())
      .filter(([, cnt]) => cnt >= 2)
      .map(([p, cnt]) => `「${p}」(出現${cnt}次)`);
    const overusedChars = Array.from(charFreq.entries())
      .filter(([, cnt]) => cnt >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ch, cnt]) => `「${ch}」(${cnt}次)`);

    const repetitionAlert =
      repeatedPhrases.length > 0 || overusedChars.length > 0
        ? `\n⚠️【全曲重複警報（必須修正！）】：${
            repeatedPhrases.length > 0 ? `重複詞組：${repeatedPhrases.join('、')}；` : ''
          }${
            overusedChars.length > 0 ? `過度重複單字：${overusedChars.join('、')}` : ''
          }。請務必將重複出現的組別改寫為全新不同的詞彙！`
        : '';

    // 🔍 自動掃描文法不通順／名詞硬拼／句尾懸空行，生成強制文法警報給 AI
    const pureNounTailPhrases = new Set([
      '真盼望', '真福氣', '恩翅下', '好牧人', '全能者', '全能神', '大能神', '大能者',
      '救贖主', '避難所', '避難處', '生命樹', '生命水', '活水泉', '施恩座', '保惠師',
      '真理靈', '至聖者', '永恆主', '永在神', '十字架', '大救贖', '救贖恩', '拯救恩',
      '大喜樂', '真平安', '真喜樂', '真自由', '真生命', '永生路', '新生命', '和平君',
    ]);
    const hangingTailRegex = /(?:一生愛|諸天敬|在恩典|深誇勝|道成肉|因信稱)$/;
    const activePredicateRegex =
      /(?:是|有|在|齊|同|來|必|願|要|求|請|向|為|讓|被|蒙|得|受|靠|憑|從|與|跟|愛祢|愛主|愛神|愛我|愛你|信祢|信主|信神|讚美|敬拜|高唱|歌唱|頌讚|頌揚|歌頌|禱告|祈求|呼求|仰望|盼望祢|跟從|順服|獻上|帶領|看顧|保守|扶持|醫治|安慰|拯救|賜下|賜福|照亮|充滿|降臨|掌權|作王|得勝|同行|同在|永存|長存|不變)/;

    const grammarSuspiciousLines: string[] = [];
    for (const l of songOverview) {
      const hasUnlocked = l.groups.some((g) => !g.isFullyLocked);
      if (!hasUnlocked || l.groups.length < 2) continue;

      const lastGroupText = l.groups[l.groups.length - 1]?.currentText || '';
      const firstGroupText = l.groups[0]?.currentText || '';
      const compactLine = l.groups.map((g) => g.currentText).join('');

      const isHangingTail = hangingTailRegex.test(compactLine);
      const isNounPair =
        pureNounTailPhrases.has(lastGroupText) && !activePredicateRegex.test(firstGroupText);
      const hasNoPredicateAtAll =
        l.groups.length >= 2 &&
        !activePredicateRegex.test(compactLine) &&
        pureNounTailPhrases.has(lastGroupText);

      if (isHangingTail || isNounPair || hasNoPredicateAtAll) {
        grammarSuspiciousLines.push(`第 ${l.lineIndex + 1} 行「${l.fullLineText}」`);
      }
    }

    const grammarAlert =
      grammarSuspiciousLines.length > 0
        ? `\n⚠️【文法不通／名詞硬拼警報（必須修正！）】：以下行數疑似出現「名詞硬拼、缺乏動詞、或句尾懸空唔通順」：${grammarSuspiciousLines.join(
            '、'
          )}。請務必檢查整句語意，若唔通順請改寫動詞／詞組，或用 isLineRewrite 整行重新斷詞！`
        : '';

    const usedPhraseSet = new Set(allCurrentPhrases);

    const groupOptionsText = songOverview
      .map((l) => {
        const lineDigits = l.pattern.replace(/\s+/g, '');
        const hasAnyLocked = lines[l.lineIndex]?.groups?.some((g) =>
          g.tokens.some((t) => t.status === 'locked')
        );
        const groupLines = l.groups.map((g) => {
          if (g.isFullyLocked) {
            return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${g.pattern}) 🔒【用戶已鎖定，請勿改動】`;
          }
          // 優先呈現全曲尚未用過的新鮮詞彙供 AI 替換
          const freshCandidates = g.candidates.filter((c) => !usedPhraseSet.has(c));
          const displayPool = (freshCandidates.length >= 6 ? freshCandidates : g.candidates).slice(0, 15);
          return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${
            g.pattern
          }) 100%啱音全新備選：【${displayPool.join('、')}】`;
        });

        let altSplitText = '';
        if (!hasAnyLocked && lineDigits.length >= 4 && lineDigits.length <= 8) {
          const altSplits = getAlternativeLineSplits(
            lineDigits,
            l.pattern,
            themeContext,
            usedPhraseSet
          );
          if (altSplits.length > 0) {
            const splitDesc = altSplits
              .map((sp) => {
                const partDesc = sp.parts
                  .map((p, pIdx) => `組${pIdx + 1}(${p.pattern})[${p.candidates.join('、')}]`)
                  .join(' + ');
                return `    - 斷詞「${sp.splitPattern}」：${partDesc}`;
              })
              .join('\n');
            altSplitText = `\n  🔄【全行跨組重新斷詞備選（音階總數 ${lineDigits} 不變，若單改一組仍唔順可整行重寫）】：\n${splitDesc}`;
          }
        }

        const compactFullLine = l.groups.map((g) => g.currentText).join('');
        return `第 ${l.lineIndex + 1} 行【整句連讀：${compactFullLine}】（原斷詞：${l.pattern}）：\n${groupLines.join('\n')}${altSplitText}`;
      })
      .join('\n\n');

    const systemPrompt = `你是粵語基督教敬拜詩歌總監，負責全局主題、句法結構與文法精修。
任務：
1. 【先睇整句連讀，唔好分開兩格各自睇】：例如「2223 342」必須當成完整一句「2223342」連起來大聲讀一次！切勿只見「2223」順眼、「342」順眼就過關，必須檢查兩組拼埋一齊有冇清楚的主謂／動賓／因果連貫，緊扣《${title}》主題與故事，前後行之間亦要起承轉合連貫。
2. 【嚴格文法與句式結構檢測】：
   - 嚴抓「句尾懸空／缺賓語」病句：例如「受神大恩 一生愛」（及物動詞「愛」放在句尾卻沒有受詞「祢／主」，意思懸空不完整），必須改為完整結構（如「永愛祢」「獻上心」「永敬拜」「心感恩」等）。
   - 嚴抓「主謂倒錯、名詞硬拼、兩截唔相干」（例如「受造萬邦 真盼望」「大地月光」「頌揚月光」——兩個名詞短語硬擺埋一齊、缺乏動詞同主謂關係，或者前半句同後半句各講各、唔連貫！必須改為有動作、主謂賓完整嘅一句話，例如「受造萬邦 齊來敬拜／心仰望／齊頌讚」或整行重寫）。
3. 【整句唔連貫／意思不合就整行一齊改（重要！）】：
   - 如果單改其中一組依然令整句（例如 2223342）唔連貫、唔順口或唔夾主題，**唔好勉強只改一組交差**！只要該行沒有🔒鎖定字，請直接用 "isLineRewrite": true、"groupIdx": 0 **一併重寫整行**：
     (a) 可以保留原斷詞（如 "targetPattern": "2223 342"）但同時換晒第 1 組同第 2 組，令兩組真正連成一句；
     (b) 或從🔄【全行跨組重新斷詞備選】挑選更自然的斷詞組合（例如改為「202 3334」或「20 23334」或「2023334」，總音階數字必須與原行完全一致），設定 "targetPattern": "新斷詞音階"、"suggestedPhrases": ["用空格分隔每組的新整行歌詞1", "新整行歌詞2"]！
4. 同時抓出過度重複單字、重複詞組及偏離主題的詞組（🔒已鎖定勿動）。即使原詞來自詞庫，只要放入整行文法唔順、收尾懸空或有重複，都必須修改！
5. 為每一處挑選 2～3 個**全新不重複**、文法完整順口且 100% 吻合目標 0243 音階的替換詞（優先選自備選庫，或原創地道協音好詞；0陽平/2陽去上入/4我你祢仰這美永柱眼免引曙領及陰去中入/3陰平上入）。

請務必簡明精煉輸出純 JSON（每段評語限 20~35 字以內，極速回傳）：
{
  "overallScore": 88,
  "themeSummary": "一句話總結全曲主題呈現度",
  "storyArcCritique": "一句話點評起承轉合流動感",
  "improvements": [
    {
      "lineIndex": 0,
      "groupIdx": 1,
      "isLineRewrite": false,
      "currentPhrase": "原詞組或原整行",
      "targetPattern": "0243音階（若 isLineRewrite 為 true 則為空格分隔的新斷詞如 202 3334）",
      "reason": "簡述修改原因（15字內）",
      "suggestedPhrases": ["推薦詞1", "推薦詞2"]
    }
  ]
}`;

    const userPrompt = `【歌曲名稱】：${title}
【歌曲含意／想表達的故事】：${meaning}
【人稱視角】：${perspective}

【當前整首歌詞全貌】：
${fullSongLyricsText}${repetitionAlert}${grammarAlert}

【各組目標音階與 100% 啱音全新備選庫】：
${groupOptionsText}

請進行全曲鳥瞰級深度審閱，徹底消除重複並緊扣主題，輸出合法的 JSON。`;

    const reviewResult = await callLLMJson<LLMReviewResponse>(
      aiConfig,
      systemPrompt,
      userPrompt,
      0.3,
      9000
    );

    // 嚴格驗證推薦詞是否 100% 協音（支援單組替換與跨組整行重新斷詞）
    const sanitizedImprovements = (reviewResult.improvements || [])
      .map((imp) => {
        const lineOverview = songOverview[imp.lineIndex];
        if (!lineOverview) return null;

        if (imp.isLineRewrite) {
          const rawLine = lines[imp.lineIndex];
          const hasAnyLocked = rawLine?.groups?.some((g) =>
            g.tokens.some((t) => t.status === 'locked')
          );
          if (hasAnyLocked) return null;

          const origDigits = lineOverview.pattern.replace(/\s+/g, '');
          const cleanNewPattern = (imp.targetPattern || '').trim().replace(/\s+/g, ' ');
          const newDigits = cleanNewPattern.replace(/\s+/g, '');
          if (!origDigits || newDigits !== origDigits) return null;

          const patternParts = cleanNewPattern.split(' ').filter(Boolean);
          const verifiedLineSuggestions: string[] = [];

          for (const rawPhrase of imp.suggestedPhrases || []) {
            const cleanChars = rawPhrase.replace(/[^\u4e00-\u9fa5]/g, '');
            if (cleanChars.length !== origDigits.length) continue;

            // 依新斷詞長度切分，確保每組 100% 協音
            const segments: string[] = [];
            let offset = 0;
            let allPartsMatch = true;
            for (const partPat of patternParts) {
              const seg = cleanChars.slice(offset, offset + partPat.length);
              offset += partPat.length;
              if (
                seg.length !== partPat.length ||
                !verifyPhraseAgainstPattern(seg, partPat).isExactMatch
              ) {
                allPartsMatch = false;
                break;
              }
              segments.push(seg);
            }

            if (allPartsMatch) {
              const formatted = segments.join(' ');
              if (
                formatted !== lineOverview.fullLineText &&
                !verifiedLineSuggestions.includes(formatted)
              ) {
                verifiedLineSuggestions.push(formatted);
              }
            }
          }

          if (verifiedLineSuggestions.length === 0) return null;
          for (const seg of verifiedLineSuggestions[0].split(' ')) {
            usedPhraseSet.add(seg);
          }

          return {
            lineIndex: imp.lineIndex,
            groupIdx: 0,
            isLineRewrite: true,
            currentPhrase: lineOverview.fullLineText,
            targetPattern: cleanNewPattern,
            reason: imp.reason || '重新斷詞令整句文法更完整流暢，緊扣主題。',
            suggestedPhrases: verifiedLineSuggestions.slice(0, 3),
          };
        }

        const targetGroup = lineOverview.groups?.[imp.groupIdx];
        if (!targetGroup || targetGroup.isFullyLocked) return null;

        const targetPat = targetGroup.pattern || imp.targetPattern;
        const candidatesPool = targetGroup.candidates || [];

        // 過濾出 100% 啱音且不與全曲重複的推薦詞
        const verifiedSuggestions: string[] = [];
        for (const phrase of imp.suggestedPhrases || []) {
          const clean = phrase.replace(/[^\u4e00-\u9fa5]/g, '');
          if (
            clean.length === targetPat.length &&
            verifyPhraseAgainstPattern(clean, targetPat).isExactMatch &&
            clean !== imp.currentPhrase &&
            !usedPhraseSet.has(clean)
          ) {
            if (!verifiedSuggestions.includes(clean)) verifiedSuggestions.push(clean);
          }
        }

        // 若 AI 自創詞唔啱音或已重複，從本地高分候選庫中補充全新不重複的主題詞
        for (const poolWord of candidatesPool) {
          if (verifiedSuggestions.length >= 3) break;
          if (
            poolWord !== imp.currentPhrase &&
            !usedPhraseSet.has(poolWord) &&
            !verifiedSuggestions.includes(poolWord)
          ) {
            verifiedSuggestions.push(poolWord);
          }
        }

        // 若仍不足 1 個，放寬去重備援
        if (verifiedSuggestions.length === 0) {
          for (const poolWord of candidatesPool) {
            if (poolWord !== imp.currentPhrase) {
              verifiedSuggestions.push(poolWord);
              break;
            }
          }
        }

        if (verifiedSuggestions[0]) {
          usedPhraseSet.add(verifiedSuggestions[0]);
        }

        return {
          lineIndex: imp.lineIndex,
          groupIdx: imp.groupIdx,
          isLineRewrite: false,
          currentPhrase: imp.currentPhrase,
          targetPattern: targetPat,
          reason: imp.reason || '換用動態詞磚能讓這行詩意更鮮明，深化歌曲故事感。',
          suggestedPhrases: verifiedSuggestions.slice(0, 3),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const responseData: GlobalThematicReview = {
      overallScore: Math.min(100, Math.max(50, reviewResult.overallScore || 85)),
      themeSummary:
        reviewResult.themeSummary ||
        `全曲緊扣《${title}》的主題情懷，文字流暢自然。若在細節處加強動詞引領，故事性將更上層樓。`,
      storyArcCritique:
        reviewResult.storyArcCritique ||
        '起承轉合結構完整，主歌與副歌情感層次分明。',
      improvements: sanitizedImprovements,
    };

    return NextResponse.json(responseData);
  } catch (err: unknown) {
    console.error('全局主題檢測異常：', err);
    const message = err instanceof Error ? err.message : '全局主題檢測時發生錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
