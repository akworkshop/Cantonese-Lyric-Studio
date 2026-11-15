import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidatesWithLockedConstraints,
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
  }[];
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

    const usedPhraseSet = new Set(allCurrentPhrases);

    const groupOptionsText = songOverview
      .map((l) => {
        const groupLines = l.groups.map((g) => {
          if (g.isFullyLocked) {
            return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${g.pattern}) 🔒【用戶已鎖定，請勿改動】`;
          }
          // 優先呈現全曲尚未用過的新鮮詞彙供 AI 替換
          const freshCandidates = g.candidates.filter((c) => !usedPhraseSet.has(c));
          const displayPool = (freshCandidates.length >= 6 ? freshCandidates : g.candidates).slice(0, 10);
          return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${
            g.pattern
          }) 100%啱音全新備選：【${displayPool.join('、')}】`;
        });
        return `第 ${l.lineIndex + 1} 行：\n${groupLines.join('\n')}`;
      })
      .join('\n\n');

    const systemPrompt = `你是粵語基督教敬拜詩歌總監，負責全局主題、句法結構與文法精修。
任務：
1. 檢視全曲結構是否緊扣《${title}》主題與故事，起承轉合是否連貫。
2. 【嚴格文法與句式結構檢測】：逐行把同一行各組詞磚連起來讀一次，檢查整句的粵語文法與結構是否完整合理：
   - 嚴抓「句尾懸空／缺賓語」病句：例如「受神大恩 一生愛」（及物動詞「愛」放在句尾卻沒有受詞「祢／主」，意思懸空不完整），必須改為完整結構（如「永愛祢」「獻上心」「永敬拜」「心感恩」等）。
   - 嚴抓「主謂倒錯、名詞硬拼」（如「大地月光」「頌揚月光」）、介詞結構缺方位詞（「在恩典」缺「中／裡」）、以及前後組詞性唔夾或唔 make sense 的組合。
3. 同時抓出過度重複單字、重複詞組及偏離主題的詞組（🔒已鎖定勿動）。即使原詞來自詞庫，只要放入整行文法唔順、收尾懸空或有重複，都必須修改！
4. 為每一處挑選 2～3 個**全新不重複**、文法完整順口且 100% 吻合該組 0243 音階的替換詞（優先選自備選庫，或原創地道協音好詞；0陽平/2陽去上入/4我你祢美永柱眼免引曙領及陰去中入/3陰平上入）。

請務必簡明精煉輸出純 JSON（每段評語限 20~35 字以內，極速回傳）：
{
  "overallScore": 88,
  "themeSummary": "一句話總結全曲主題呈現度",
  "storyArcCritique": "一句話點評起承轉合流動感",
  "improvements": [
    {
      "lineIndex": 0,
      "groupIdx": 1,
      "currentPhrase": "原詞組",
      "targetPattern": "0243音階",
      "reason": "簡述修改原因（15字內）",
      "suggestedPhrases": ["推薦詞1", "推薦詞2"]
    }
  ]
}`;

    const userPrompt = `【歌曲名稱】：${title}
【歌曲含意／想表達的故事】：${meaning}
【人稱視角】：${perspective}

【當前整首歌詞全貌】：
${fullSongLyricsText}${repetitionAlert}

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

    // 嚴格驗證推薦詞是否 100% 協音
    const sanitizedImprovements = (reviewResult.improvements || [])
      .filter((imp) => {
        const targetGroup = songOverview[imp.lineIndex]?.groups?.[imp.groupIdx];
        return targetGroup && !targetGroup.isFullyLocked;
      })
      .map((imp) => {
      const targetPat =
        songOverview[imp.lineIndex]?.groups?.[imp.groupIdx]?.pattern || imp.targetPattern;
      const candidatesPool =
        songOverview[imp.lineIndex]?.groups?.[imp.groupIdx]?.candidates || [];

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
        currentPhrase: imp.currentPhrase,
        targetPattern: targetPat,
        reason: imp.reason || '換用動態詞磚能讓這行詩意更鮮明，深化歌曲故事感。',
        suggestedPhrases: verifiedSuggestions.slice(0, 3),
      };
    });

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
