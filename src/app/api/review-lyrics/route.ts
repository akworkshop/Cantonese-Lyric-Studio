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

    const groupOptionsText = songOverview
      .map((l) => {
        const groupLines = l.groups.map(
          (g) =>
            `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${
              g.pattern
            }) 可選 100% 啱音好詞：【${g.candidates.slice(0, 12).join('、')}】`
        );
        return `第 ${l.lineIndex + 1} 行：\n${groupLines.join('\n')}`;
      })
      .join('\n\n');

    const systemPrompt = `你是一位享譽華語與粵語基督教音樂界的大師級填詞總監／金牌審查顧問（深諳香港玻璃海、同心圓、ACM、CantonHymn 詩歌美學）。
你的職責是對整首已填好的粵語敬拜詩歌進行**「深度全局主題檢測與意境昇華審查」**。

### 審查任務核心：
1. **整體上有沒有深刻帶出主題意思**：
   - 深入檢驗整首歌詞是否緊扣用戶輸入的【歌曲名稱】與【歌曲含意／想表達的故事】！
   - 是真的在講述一個有血有肉、情真意切的生命故事，還是僅在浮泛空洞地拼湊宗教詞彙？
2. **全曲起承轉合情節與畫面推進**：
   - 主歌（Verse）是否成功由具體場景、處境呼求切入？
   - 副歌（Chorus）是否情感爆發、齊聲宣告王權與救恩？
   - 各行之間是否一氣呵成，有沒有前言不對後語或語法斷裂？
3. **定向挑選可以寫得更好的部分（精準改進）**：
   - 挑出 1～4 處詞意較空泛、名詞生硬堆砌（如「浩瀚宇宙 真盼望」）或未充分帶出主題故事的詞組。
   - 清晰點評該處為何可以更好，並直接從我們為該組預備的【100% 啱音好詞菜單】或正規粵語協音詞中，推薦 2～3 個最能大幅深化主題的替代詞（必須嚴格 100% 吻合該組 0243 音階）！

### 輸出格式（純 JSON，不要任何 Markdown 圍欄外文字）：
{
  "overallScore": 88,
  "themeSummary": "全面評析整首歌詞對主題的呈現度（優點、核心情懷與不足之處）",
  "storyArcCritique": "分析全曲起承轉合的流動感（起、承、轉、合各自的發揮）",
  "improvements": [
    {
      "lineIndex": 0,
      "groupIdx": 1,
      "currentPhrase": "原詞組",
      "targetPattern": "0243音階",
      "reason": "具體說明為什麼這部分可以寫得更好（如：原詞為靜態名詞堆疊，換成動態動作更能呼應走過風浪的主題）",
      "suggestedPhrases": ["推薦詞1", "推薦詞2", "推薦詞3"]
    }
  ]
}`;

    const userPrompt = `【歌曲名稱】：${title}
【歌曲含意／想表達的故事】：${meaning}
【人稱視角】：${perspective}

【當前整首歌詞全貌】：
${fullSongLyricsText}

【各組目標音階與 100% 啱音候選庫】：
${groupOptionsText}

請進行全曲鳥瞰級深度審閱，輸出合法的 JSON。`;

    const reviewResult = await callLLMJson<LLMReviewResponse>(
      aiConfig,
      systemPrompt,
      userPrompt,
      0.3,
      7000
    );

    // 嚴格驗證推薦詞是否 100% 協音
    const sanitizedImprovements = (reviewResult.improvements || []).map((imp) => {
      const targetPat =
        songOverview[imp.lineIndex]?.groups?.[imp.groupIdx]?.pattern || imp.targetPattern;
      const candidatesPool =
        songOverview[imp.lineIndex]?.groups?.[imp.groupIdx]?.candidates || [];

      // 過濾出 100% 啱音的推薦詞
      const verifiedSuggestions: string[] = [];
      for (const phrase of imp.suggestedPhrases || []) {
        const clean = phrase.replace(/[^\u4e00-\u9fa5]/g, '');
        if (
          clean.length === targetPat.length &&
          verifyPhraseAgainstPattern(clean, targetPat).isExactMatch &&
          clean !== imp.currentPhrase
        ) {
          if (!verifiedSuggestions.includes(clean)) verifiedSuggestions.push(clean);
        }
      }

      // 若 AI 自創詞唔啱音，從本地高分候選庫中補充優質主題詞
      for (const poolWord of candidatesPool) {
        if (verifiedSuggestions.length >= 3) break;
        if (poolWord !== imp.currentPhrase && !verifiedSuggestions.includes(poolWord)) {
          verifiedSuggestions.push(poolWord);
        }
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
