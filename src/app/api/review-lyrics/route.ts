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

    const groupOptionsText = songOverview
      .map((l) => {
        const groupLines = l.groups.map((g) => {
          if (g.isFullyLocked) {
            return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${g.pattern}) 🔒【用戶已鎖定，請勿改動】`;
          }
          return `  • 第 ${g.groupIdx + 1} 組「${g.currentText}」(音階: ${
            g.pattern
          }) 可選 100% 啱音好詞：【${g.candidates.slice(0, 12).join('、')}】`;
        });
        return `第 ${l.lineIndex + 1} 行：\n${groupLines.join('\n')}`;
      })
      .join('\n\n');

    const systemPrompt = `你是一位享譽華語與粵語基督教音樂界的大師級填詞總監／金牌審查顧問（深諳香港玻璃海、同心圓、ACM、CantonHymn 詩歌美學）。
你的職責是對整首已填好的粵語敬拜詩歌進行**「深度全局主題檢測與嚴格意境修訂」**。

### 審查任務核心（寧缺勿濫，嚴格把關！）：
1. **整體上有沒有緊扣主題故事**：
   - 深入檢驗整首歌詞是否真正貼合用戶輸入的【歌曲名稱】與【歌曲含意／想表達的故事】！
   - 絕不容忍浮泛空洞地拼湊宗教詞彙，整首歌必須前後連貫地帶出主題核心信息。
2. **嚴格抓出任何「唔 make sense」或生硬怪詞（即使原本來自詞庫菜單！）**：
   - ⚠️ **最重要原則**：就算第 1 輪選出的某個詞原本在詞庫內（例如「大地月光」、「頌揚月光」、「頌揚大水」、「步履亮光」或任何兩個靜態名詞硬塞在一起），**只要放到全句前後文中覺得唔 make sense、文法不通、語意斷裂、重複單調、或未能服務主題，就必須堅決標記為需要修改！**
   - 嚴禁保留「名詞＋名詞」無動詞拼湊（如「浩瀚宇宙 真盼望」），必須換成有動作、有畫面的流暢主謂句。
3. **精準改寫與替換建議（不限數量，凡唔順就改，🔒 已鎖定組別除外）**：
   - 挑出**所有**不自然、唔 make sense、跨行重複或偏離主題的詞組。
   - 為每一處推薦 2～3 個**最貼題、最順口、且 100% 吻合該組 0243 音階**的替代詞（可優先從該組【100% 啱音好詞菜單】精選，若菜單不合句意，亦歡迎你直接原創地道粵語協音好詞！）：
     - 0：陽平（神/權/王/靈/同/行/人/榮/名/常/前）
     - 2：陽去/陽上/陽入（在/是/大/願/伴/望/路/地/道/夜/浪/步/靜）
     - 4：次高音（我/你/祢/美/永/柱/眼/免/引/曙/領/這/愛/信/靠/向/敬/讚/唱/救/聖/盼/賜/照/獻/見）
     - 3：最高音（主/祂/心/恩/深/真/光/歌/天/生/手/身/家/聲/知/依/高/謙/新/清/牽）

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
      18000
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
