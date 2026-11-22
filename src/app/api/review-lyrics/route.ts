import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeCharToken,
  auditLyricLineGrammar,
  classifyPhraseGrammarRole,
  getCandidatesWithLockedConstraints,
  getVerifiedCandidatesForGroupPattern,
  LINE_END_FORBIDDEN_CONNECTIVES,
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
  blockedPhraseSet: Set<string>,
  maxSplits = 6,
  maxPerPart = 10,
  includeThreeGroup = true,
  randomize = false
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
  // 3-group splits: 6字永遠包含 [2,2,2]（僅1種，極快）；7-8字依長度決定
  if (n === 6) {
    candidateSplits.push([lineDigits.slice(0, 2), lineDigits.slice(2, 4), lineDigits.slice(4)]);
  } else if (includeThreeGroup && n >= 7) {
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

    for (let partIdx = 0; partIdx < parts.length; partIdx++) {
      const p = parts[partIdx];
      const isLastPart = partIdx === parts.length - 1;
      const raw = getVerifiedCandidatesForGroupPattern(
        p,
        Math.max(maxPerPart + 12, 24),
        randomize,
        themeContext
      );
      const fresh = raw.filter(
        (c) => !blockedPhraseSet.has(c) && (!isLastPart || !LINE_END_FORBIDDEN_CONNECTIVES.has(c))
      );
      const pool = fresh.slice(0, maxPerPart);
      const minNeeded = parts.length === 1 && p.length >= 5 ? 1 : 2;
      if (pool.length < minNeeded) {
        valid = false;
        break;
      }
      totalCount += pool.length;
      partData.push({ pattern: p, candidates: pool });
    }

    if (valid) {
      // 以「每段平均候選數」評分，避免 3 段拆法因段數多而把「完整整句(1段)」同「2段自然斷詞」擠走
      const avgCount = totalCount / parts.length;
      const groupBonus = parts.length === 1 ? 6 : parts.length === 2 ? 4 : 0;
      scored.push({ splitPattern, parts: partData, score: avgCount + groupBonus });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSplits)
    .map(({ splitPattern, parts }) => ({ splitPattern, parts }));
}

/**
 * 當 AI 原創句子僅差 1～2 個字唔啱 0243 音階時，保留已啱音的字元與原本語意骨架，
 * 僅在本地微調唔啱音的字位，避免整個丟棄 AI 原創心血而退回靜態詞庫！
 */
function repairNearMissPhraseWithTone(
  aiPhrase: string,
  targetPat: string,
  themeContext: string,
  blockedSet: Set<string>
): string | null {
  const chars = Array.from(aiPhrase.replace(/[^\u4e00-\u9fa5]/g, ''));
  if (chars.length !== targetPat.length || chars.length < 2) return null;

  let matchCount = 0;
  const tempTokens = Array.from(targetPat).map((expectedTone, idx) => {
    const ch = chars[idx];
    const tok = analyzeCharToken(ch, expectedTone, idx === targetPat.length - 1);
    const isMatched = tok.actualTone === expectedTone;
    if (isMatched) matchCount++;
    return {
      expectedTone,
      char: ch,
      status: (isMatched ? 'locked' : 'normal') as 'locked' | 'normal',
    };
  });

  // 至少一半以上字元已啱音才進行局部鎖字救回，保留 AI 原意
  if (matchCount < Math.ceil(targetPat.length / 2)) return null;

  const repairedCands = getCandidatesWithLockedConstraints(tempTokens, 8, false, themeContext);
  for (const cand of repairedCands) {
    if (!blockedSet.has(cand) && verifyPhraseAgainstPattern(cand, targetPat).isExactMatch) {
      return cand;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = '無題詩歌',
      meaning = '敬拜讚美主恩',
      lines = [] as LyricLine[],
      perspective = 'devotional',
      rejectedPhrases = [] as string[],
      aiConfig,
    }: {
      title: string;
      meaning: string;
      lines: LyricLine[];
      perspective?: SongPerspective;
      rejectedPhrases?: string[];
      aiConfig: AIProviderConfig;
    } = body;

    if (!lines || lines.length === 0) {
      return NextResponse.json(
        { error: '目前畫布沒有歌詞可供全局檢測' },
        { status: 400 }
      );
    }

    const themeContext = `${title} ${meaning}`.trim();
    // 第 3 輪起（已有淘汰詞時）啟用洗牌輪替，確保每一輪都能看到全新詞彙組合，唔會原地踏步
    const shouldShuffle = Array.isArray(rejectedPhrases) && rejectedPhrases.length > 0;

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
          80,
          shouldShuffle,
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

    // 🔍 使用統一文法引擎掃描文法不通順／名詞硬拼／句尾懸空／句尾連接詞行，生成強制文法警報給 AI
    const grammarSuspiciousLines: string[] = [];
    for (const l of songOverview) {
      const hasUnlocked = l.groups.some((g) => !g.isFullyLocked);
      if (!hasUnlocked) continue;

      const audit = auditLyricLineGrammar(l.groups.map((g) => g.currentText));
      if (!audit.isNatural) {
        grammarSuspiciousLines.push(
          `第 ${l.lineIndex + 1} 行「${l.fullLineText}」(${audit.issue})`
        );
      }
    }

    const grammarAlert =
      grammarSuspiciousLines.length > 0
        ? `\n⚠️【文法不通／名詞硬拼警報（必須修正！）】：以下行數疑似出現「名詞硬拼、缺乏動詞、或句尾懸空唔通順」：${grammarSuspiciousLines.join(
            '、'
          )}。請務必檢查整句語意，若唔通順請改寫動詞／詞組，或用 isLineRewrite 整行重新斷詞！`
        : '';

    const rejectedPhraseSet = new Set(rejectedPhrases.filter(Boolean));
    const usedPhraseSet = new Set([...allCurrentPhrases, ...rejectedPhraseSet]);

    const isLowTpm = aiConfig?.provider === 'groq';
    // 依未鎖定行數與供應商 TPM 上限動態調節候選數量（Groq 8000 TPM 啟用超精簡高準度模式）
    const unlockedLineCount = songOverview.filter((l) =>
      l.groups.some((g) => !g.isFullyLocked)
    ).length;
    const groupPoolSize = isLowTpm
      ? unlockedLineCount >= 13
        ? 14
        : 20
      : unlockedLineCount >= 14
      ? 26
      : 30;
    const altSplitCount = isLowTpm
      ? unlockedLineCount >= 13
        ? 2
        : 3
      : unlockedLineCount >= 13
      ? 4
      : unlockedLineCount >= 10
      ? 5
      : 7;
    const altPartPoolSize = isLowTpm ? 6 : unlockedLineCount >= 13 ? 7 : unlockedLineCount >= 10 ? 9 : 12;
    const includeThreeGroup = true;

    // 前後綴多樣性抽樣：每個兩字開頭或兩字結尾最多只取 2 個，避免 30 個選項全部同一個開頭或同一個結尾（如全都是「我前路」）
    const pickDiversePhrases = (pool: string[], limit: number): string[] => {
      const picked: string[] = [];
      const prefixCount = new Map<string, number>();
      const suffixCount = new Map<string, number>();
      const overflow: string[] = [];
      for (const item of pool) {
        if (picked.length >= limit) break;
        const prefix = item.slice(0, 2);
        const suffix = item.slice(-2);
        const pCnt = prefixCount.get(prefix) || 0;
        const sCnt = suffixCount.get(suffix) || 0;
        if (pCnt < 2 && sCnt < 2) {
          picked.push(item);
          prefixCount.set(prefix, pCnt + 1);
          suffixCount.set(suffix, sCnt + 1);
        } else {
          overflow.push(item);
        }
      }
      for (const item of overflow) {
        if (picked.length >= limit) break;
        picked.push(item);
      }
      return picked;
    };

    const groupOptionsText = songOverview
      .map((l) => {
        const lineDigits = l.pattern.replace(/\s+/g, '');
        const hasAnyLocked = lines[l.lineIndex]?.groups?.some((g) =>
          g.tokens.some((t) => t.status === 'locked')
        );
        const groupLines = l.groups.map((g) => {
          if (g.isFullyLocked) {
            return isLowTpm
              ? `G${g.groupIdx + 1}[${g.pattern}]🔒${g.currentText}`
              : `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${g.pattern}) 🔒【用戶已鎖定，請勿改動】`;
          }
          // 優先呈現全曲尚未用過且未被淘汰的新鮮詞彙供 AI 替換
          const nonRejected = g.candidates.filter((c) => !rejectedPhraseSet.has(c));
          let freshCandidates = nonRejected.filter((c) => !usedPhraseSet.has(c));
          // 詞性互補過濾：若前組已屬名詞組(NP)或狀語(ADV)，後組自動排除純名詞(NP)，優先呈獻動詞／謂語(VP/CLAUSE)
          if (g.groupIdx > 0 && l.groups[0]) {
            const prevRole = classifyPhraseGrammarRole(l.groups[0].currentText);
            if (prevRole === 'NP' || prevRole === 'ADV') {
              const verbFirst = (freshCandidates.length >= 4 ? freshCandidates : nonRejected).filter(
                (c) => {
                  const r = classifyPhraseGrammarRole(c);
                  return r === 'VP' || r === 'CLAUSE';
                }
              );
              if (verbFirst.length >= 4) {
                freshCandidates = verbFirst;
              }
            }
          }
          const sourcePool = freshCandidates.length >= 4 ? freshCandidates : nonRejected;
          const displayPool = pickDiversePhrases(sourcePool, groupPoolSize);
          return isLowTpm
            ? `G${g.groupIdx + 1}[${g.pattern}]「${g.currentText}」備選:${displayPool.join('、')}`
            : `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${
                g.pattern
              }) 100%啱音全新備選：【${displayPool.join('、')}】`;
        });

        let altSplitText = '';
        if (!hasAnyLocked && lineDigits.length >= 4 && lineDigits.length <= 8) {
          const altSplits = getAlternativeLineSplits(
            lineDigits,
            l.pattern,
            themeContext,
            usedPhraseSet,
            altSplitCount,
            altPartPoolSize,
            includeThreeGroup,
            shouldShuffle
          );
          if (altSplits.length > 0) {
            if (isLowTpm) {
              const splitDesc = altSplits
                .map(
                  (sp) =>
                    `${sp.splitPattern}:${sp.parts
                      .map((p) => p.candidates.join('/'))
                      .join('+')}`
                )
                .join(' | ');
              altSplitText = ` | 重斷:${splitDesc}`;
            } else {
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
        }

        const compactFullLine = l.groups.map((g) => g.currentText).join('');
        return isLowTpm
          ? `L${l.lineIndex}(${l.pattern})「${compactFullLine}」: ${groupLines.join('; ')}${altSplitText}`
          : `第 ${l.lineIndex + 1} 行【整句連讀：${compactFullLine}】（原斷詞：${l.pattern}）：\n${groupLines.join('\n')}${altSplitText}`;
      })
      .join(isLowTpm ? '\n' : '\n\n');

    const lowTpmTargetRange = unlockedLineCount >= 10 ? '6～10' : '3～6';
    const systemPrompt = isLowTpm
      ? `粵語敬拜詩歌精修總監。必須由 L0 逐行連讀到最後一行（如2223 342當成2223342讀），切勿只改頭幾行就停，抓出：
1.唔緊扣《${title}》、前後行唔連貫、重複字詞（🔒勿動）；
2.句尾懸空（如「一生愛」）、名詞硬拼缺動詞（如「浩大頌詩 心盼望」「受造萬邦 真盼望」）。
重要：只要仍有未鎖定行數，必須至少挑出 ${lowTpmTargetRange} 處最需要改進之處；「備選」與「重斷」僅供參考，切勿夾硬揀唔通順的組合（如「帶領 為要」），請積極原創 3～4 個自然貼題的協音版本（切勿回傳空陣列）。
若單改一組仍唔順，設 "isLineRewrite":true、"groupIdx":0，重寫整行（可用原斷詞或「重斷」新斷詞，總音階不變，空格分隔）。
嚴守0243（0陽平/2陽去上入/4我你祢仰這記裡美永柱眼免引曙領及陰去中入/3陰平上入）。
只輸出精簡JSON：{"overallScore":88,"themeSummary":"20字內","storyArcCritique":"20字內","improvements":[{"lineIndex":0,"groupIdx":0,"isLineRewrite":false,"currentPhrase":"原詞","targetPattern":"0243","reason":"10字內","suggestedPhrases":["詞1","詞2"]}]}`
      : `你是粵語基督教敬拜詩歌總監，負責全局主題、句法結構與文法精修。
任務：
1. 【先睇整句連讀，唔好分開兩格各自睇】：例如「2223 342」必須當成完整一句「2223342」連起來大聲讀一次！切勿只見「2223」順眼、「342」順眼就過關，必須檢查兩組拼埋一齊有冇清楚的主謂／動賓／因果連貫，緊扣《${title}》主題與故事，前後行之間亦要起承轉合連貫。
2. 【嚴格文法與句式結構檢測】：
   - 嚴抓「句尾懸空／缺賓語」病句：例如「受神大恩 一生愛」（及物動詞「愛」放在句尾卻沒有受詞「祢／主」，意思懸空不完整），必須改為完整結構（如「永愛祢」「獻上心」「永敬拜」「心感恩」等）。
   - 嚴抓「主謂倒錯、名詞硬拼、兩截唔相干」（例如「浩大頌詩 心盼望」「受造萬邦 真盼望」「大地月光」「頌揚月光」——兩個短語硬擺埋一齊、缺乏動詞同主謂關係，或者前半句同後半句各講各、唔連貫！必須改為有動作、主謂賓完整嘅一句話，例如「靜候父恩 心仰望」或用 isLineRewrite 整行重寫）。
3. 【整句唔連貫／意思不合就整行一齊改（重要！）】：
   - 如果單改其中一組依然令整句（例如 2223342）唔連貫、唔順口或唔夾主題，**唔好勉強只改一組交差**！只要該行沒有🔒鎖定字，請直接用 "isLineRewrite": true、"groupIdx": 0 **一併重寫整行**：
     (a) 可以保留原斷詞（如 "targetPattern": "2223 342"）但同時換晒第 1 組同第 2 組，令兩組真正連成一句；
     (b) 或從🔄【全行跨組重新斷詞備選】挑選更自然的斷詞組合（例如改為「202 3334」或「20 23334」或「2023334」，總音階數字必須與原行完全一致），設定 "targetPattern": "新斷詞音階"、"suggestedPhrases": ["用空格分隔每組的新整行歌詞1", "新整行歌詞2"]！
4. 同時抓出過度重複單字、重複詞組及偏離主題的詞組（🔒已鎖定勿動）。即使原詞來自詞庫，只要放入整行文法唔順、收尾懸空或有重複，都必須修改！
5. 備選庫僅供靈感參考，**切勿夾硬揀選拼湊怪詞（如「帶領 為要」）**！請積極運用你的粵語詩歌文學能力**原創 3～4 個**全新不重複、文法完整順口且 100% 吻合目標 0243 音階的替換句（確保至少 1 個通過嚴格協音驗證；0陽平/2陽去上入/4我你祢仰這記裡美永柱眼免引曙領及陰去中入/3陰平上入）。

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

            // 依新斷詞長度切分，確保每組 100% 協音（若僅差 1～2 字唔啱音，優先局部微調救回 AI 原意）
            const segments: string[] = [];
            let offset = 0;
            let allPartsMatch = true;
            for (const partPat of patternParts) {
              const seg = cleanChars.slice(offset, offset + partPat.length);
              offset += partPat.length;
              if (seg.length !== partPat.length) {
                allPartsMatch = false;
                break;
              }
              if (verifyPhraseAgainstPattern(seg, partPat).isExactMatch) {
                segments.push(seg);
              } else {
                const rescued = repairNearMissPhraseWithTone(
                  seg,
                  partPat,
                  themeContext,
                  usedPhraseSet
                );
                if (rescued) {
                  segments.push(rescued);
                } else {
                  allPartsMatch = false;
                  break;
                }
              }
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

          // 若 AI 原創整行重寫未通過 100% 協音檢查，自動從本地高分新鮮詞庫為該新斷詞組合補上 100% 啱音整句
          if (verifiedLineSuggestions.length === 0) {
            const partPools = patternParts.map((partPat) =>
              getVerifiedCandidatesForGroupPattern(partPat, 16, false, themeContext).filter(
                (c) => !usedPhraseSet.has(c) && !rejectedPhraseSet.has(c)
              )
            );
            if (partPools.every((pool) => pool.length > 0)) {
              const fallbackLine = partPools.map((pool) => pool[0]).join(' ');
              if (fallbackLine !== lineOverview.fullLineText) {
                verifiedLineSuggestions.push(fallbackLine);
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

        // 若 AI 自創詞僅差 1～2 字唔啱音，優先局部鎖定已啱音字元並微調救回 AI 原意
        if (verifiedSuggestions.length === 0) {
          for (const phrase of imp.suggestedPhrases || []) {
            const clean = phrase.replace(/[^\u4e00-\u9fa5]/g, '');
            const rescued = repairNearMissPhraseWithTone(
              clean,
              targetPat,
              themeContext,
              usedPhraseSet
            );
            if (rescued && rescued !== imp.currentPhrase && !verifiedSuggestions.includes(rescued)) {
              verifiedSuggestions.push(rescued);
              if (verifiedSuggestions.length >= 2) break;
            }
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

        // 若仍不足 1 個，放寬去重備援（但絕不重用已被淘汰的詞彙）
        if (verifiedSuggestions.length === 0) {
          for (const poolWord of candidatesPool) {
            if (poolWord !== imp.currentPhrase && !rejectedPhraseSet.has(poolWord)) {
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
