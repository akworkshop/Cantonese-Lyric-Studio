import { NextRequest, NextResponse } from 'next/server';
import {
  buildDynamicLexiconPrompt,
  getCandidatesWithLockedConstraints,
  getVerifiedCandidatesForGroupPattern,
  VERIFIED_CANTONESE_WORSHIP_CHARS,
  verifyPhraseAgainstPattern,
} from '@/lib/cantonese';
import { callLLMJson } from '@/lib/ai-providers';
import { AIProviderConfig, AlternativeCandidate, LyricToken } from '@/types/lyric';

interface LLMSuggestResponse {
  candidates: {
    text: string;
    toneAnalysis: string;
    vocalErgonomics: string;
  }[];
}

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = '無題詩歌',
      meaning = '敬拜讚美主恩',
      fullLyricsContext = '',
      linePattern = '',
      lineText = '',
      targetGroupPattern = '',
      currentGroupText = '',
      groupTokens = [] as LyricToken[],
      userInstruction = '',
      aiConfig,
    }: {
      title: string;
      meaning: string;
      fullLyricsContext: string;
      linePattern: string;
      lineText: string;
      targetGroupPattern: string;
      currentGroupText: string;
      groupTokens: LyricToken[];
      userInstruction?: string;
      aiConfig: AIProviderConfig;
    } = body;

    const cleanTargetPattern = targetGroupPattern.trim();
    if (!cleanTargetPattern) {
      return NextResponse.json({ error: '缺少目標詞組的 0243 數字譜' }, { status: 400 });
    }

    // 檢查是否有 🟢 locked 鎖定字元
    const lockedTemplate = Array.from(cleanTargetPattern)
      .map((tone, idx) => {
        const tok = groupTokens[idx];
        if (tok && tok.status === 'locked' && tok.char && tok.char !== '＿') {
          return tok.char;
        }
        return `_(${tone}聲)`;
      })
      .join('');

    const hasLockedChars = groupTokens.some(
      (t) => t.status === 'locked' && t.char && t.char !== '＿'
    );

    const matchesLockedConstraint = (phrase: string): boolean => {
      const chars = Array.from(phrase.replace(/[^\u4e00-\u9fa5]/g, ''));
      if (chars.length !== cleanTargetPattern.length) return false;
      for (let i = 0; i < groupTokens.length; i++) {
        const tok = groupTokens[i];
        if (tok && tok.status === 'locked' && tok.char && tok.char !== '＿') {
          if (chars[i] !== tok.char) return false;
        }
      }
      return true;
    };

    const themeContext = `${title} ${meaning} ${userInstruction}`.trim();
    const lexiconHint = buildDynamicLexiconPrompt([cleanTargetPattern], title, meaning);
    const verifiedExamples = getCandidatesWithLockedConstraints(
      groupTokens,
      15,
      false,
      themeContext
    ).filter((p) => p !== currentGroupText);

    const systemPrompt = `你是一位精通「0243 粵語協音對位法」與現代粵語敬拜詩歌（如玻璃海、同心圓、ACM、CantonHymn 風格）的填詞顧問。
用戶目前正在修訂歌曲《${title}》（主題故事：${meaning}）中，歌詞行「${lineText}」的一個詞組區塊（目前為「${currentGroupText}」）。請針對該區塊提供 **6 個** 符合目標 0243 數字譜、**緊扣歌曲主題故事「${meaning}」**、且放進整句「${lineText}」後**意思連貫、直白易明、自然流暢且絕不夾硬**的候選替換詞組。

### 硬性填詞鐵律：
1. **【最高鐵律：嚴禁文法倒錯與拼湊怪句（絕不夾硬砌字）】**：
   - 推薦的詞組必須是真實自然的粵語搭配，絕對不可為了啱音自造無人使用的怪詞！
   - **專有名詞不可腰斬**：嚴禁將「耶穌」縮寫成「耶」（如自造「宣耶王」等怪詞，意思全錯！）。「基督」、「天父」、「上帝」、「聖靈」、「救贖」、「宣告」等必須自然完整。
      - 嚴禁將「萬王之王」縮寫成「萬王」（「萬王」單獨孤立不成詞！若音階為 20 請用「作王」、「父神」、「頌揚」、「大能」）。
      - 嚴禁寫出文法不通的硬砌字：如「我慕神」（420 毫無意義！若想表達渴慕神，在 420 請用「愛慕神」、「讚美神」，或改用 424「渴慕祢」）。
      - 嚴禁寫出生硬古典或倒裝怪句：如「獻真主我心」（「真主」過於古典且語序生硬倒錯！請寫成自然的「向恩主獻心」）。
2. **【意念同義重組與借位轉意（死守原音階，以詞入曲）】**：
   - **【最核心鐵律：目標 0243 聲調「${cleanTargetPattern}」絕對不可改動！】** 旋律給定 3320 就是 3320，絕不可擅自變成 3420！是詞遷就曲，死守原音！
   - 第一優先（嚴格守音，同義換詞）：在【100% 嚴格吻合「${cleanTargetPattern}」】的前提下，換用同義詞（例如目標是 3320，表達宣告耶穌作王，必須填精準等於 3320 的「尊主作王」，切勿改動目標音階或腰斬名詞！）；
   - 第二優先（嚴格守音，借位轉意切換視角）：若該特定概念在【${cleanTargetPattern}】下實在無同義詞，**音階依然分毫不改**，立刻切換表達視角（如敬拜者的動作「跪拜讚美」、或神聖光景「榮美顯彰」），字音必須 100% 嚴格等於「${cleanTargetPattern}」！
3. **【拒絕空泛套話罐頭，扣緊整句上下文】**：
   - 拒絕只推薦空洞的「恩典深／讚美神」；
   - 檢視整句歌詞：「${lineText}」，你推薦的候選詞替換掉「${currentGroupText}」之後，必須與同一句的其他詞組連成一句文法自然、一聽就懂、意境深刻的詩句！
4. **【字數與 0243 聲調必須 100% 吻合】**：
   - 目標數字譜為「${cleanTargetPattern}」（共 ${cleanTargetPattern.length} 個漢字）。
   - 0=陽平，2=陽去/陽上(如「美」)/陽入等，4=含「我、你、祢」、「更(更深/更愛)」及陰去/中入，3=含「更(更新/更改)」及陰平/陰上/陰入。
5. **【鎖定字保留】**：
   ${
     hasLockedChars
       ? `- 用戶已鎖定部分字元，候選詞必須嚴格符合此固定模板：「${lockedTemplate}」（已鎖定的漢字不可更改，僅替換底線位置）。`
       : `- 此詞組內無鎖定字，請替換整個 ${cleanTargetPattern.length} 字詞組，且不要重複目前的詞組「${currentGroupText}」。`
   }

${lexiconHint}

### 請只輸出合法 JSON 格式：
{
  "candidates": [
    {
      "text": "${cleanTargetPattern.length}個字的候選詞",
      "toneAnalysis": "簡述如何呼應主題與整句連貫度（約 15-25 字）",
      "vocalErgonomics": "簡述尾字唱感（約 15-20 字）"
    }
  ]
}`;

    const userPrompt = `【歌曲名稱】：${title}
【歌曲主題／想表達的故事】：${meaning}
【全曲上下文】：
${fullLyricsContext || lineText}

【當前所在歌詞行】：${lineText} （全行數字譜：${linePattern}）
【欲替換之目標詞組】：目前為「${currentGroupText}」，目標 0243 聲調為 [${cleanTargetPattern}]（必須剛好 ${
      cleanTargetPattern.length
    } 個字）
${hasLockedChars ? `【固定鎖定字模板】：${lockedTemplate}` : ''}
${userInstruction ? `【用戶特別修改要求】：${userInstruction}` : ''}
${
  verifiedExamples.length > 0
    ? `【本地詞庫符合 [${cleanTargetPattern}] 的協音結構參考（請優先依主題故事自行造句）】：${verifiedExamples.join('、')}`
    : ''
}

請提供 6 個緊扣主題故事且 100% 符合 [${cleanTargetPattern}] 聲調的 AI 原創候選詞（JSON）。`;

    const rawResponse = await callLLMJson<LLMSuggestResponse>(
      aiConfig,
      systemPrompt,
      userPrompt,
      0.45
    );

    const processRawCandidates = (
      rawList: { text: string; toneAnalysis?: string; vocalErgonomics?: string }[]
    ): AlternativeCandidate[] => {
      const seen = new Set<string>();
      const evaluated: AlternativeCandidate[] = [];

      for (const item of rawList || []) {
        const cleanText = (item?.text || '').replace(/[^\u4e00-\u9fa5]/g, '');
        if (
          !cleanText ||
          cleanText.length !== cleanTargetPattern.length ||
          cleanText === currentGroupText ||
          seen.has(cleanText) ||
          !matchesLockedConstraint(cleanText)
        ) {
          continue;
        }
        seen.add(cleanText);

        const check = verifyPhraseAgainstPattern(cleanText, cleanTargetPattern);
        evaluated.push({
          id: `ai-cand-${Math.random().toString(36).slice(2, 9)}`,
          text: cleanText,
          targetPattern: cleanTargetPattern,
          actualPattern: check.actualPattern,
          isExactToneMatch: check.isExactMatch,
          jyutpingList: check.jyutpingList,
          toneAnalysis:
            item.toneAnalysis ||
            `✨ AI 根據主題「${title}」造句，字音結構 [${check.actualPattern}] 與上下文自然銜接。`,
          vocalErgonomics: item.vocalErgonomics || check.endErgonomics.note,
          ergonomicsRating: check.endErgonomics.rating,
        });
      }

      return evaluated;
    };

    let evaluatedCandidates = processRawCandidates(rawResponse?.candidates || []);
    let exactMatches = evaluatedCandidates.filter((c) => c.isExactToneMatch);

    // 若啟用自動修正且 100% 協音吻合的候選詞不足 3 個，執行一次 AI 精準修正請求
    if (aiConfig.enableAutoRepair && exactMatches.length < 3) {
      const failedDesc = evaluatedCandidates
        .filter((c) => !c.isExactToneMatch)
        .map(
          (c) =>
            `「${c.text}」實際為 [${c.actualPattern}] (${c.jyutpingList.join(
              ' '
            )})，與目標 [${cleanTargetPattern}] 不符`
        )
        .join('；');

      const perPositionHint = Array.from(cleanTargetPattern)
        .map(
          (tone, idx) =>
            `第${idx + 1}字必須是 [${tone}聲]（可用字：${(
              VERIFIED_CANTONESE_WORSHIP_CHARS[tone] || []
            )
              .slice(0, 15)
              .join('、')}）`
        )
        .join('\n');

      const repairPrompt = `你剛剛提供的候選詞中，有以下詞組未通過本地粵拼 0243 檢驗：
${failedDesc || '候選詞數量不足'}

請嚴格按照每個位置的聲調要求，重新提供 5 個 **100% 符合 [${cleanTargetPattern}]** 的候選詞：
${perPositionHint}
${
  verifiedExamples.length > 0
    ? `你也可以優先從這些 100% 已驗證詞組中挑選最合適的並撰寫分析：${verifiedExamples.join('、')}`
    : ''
}`;

      try {
        const repairRes = await callLLMJson<LLMSuggestResponse>(
          aiConfig,
          systemPrompt,
          repairPrompt,
          0.25
        );
        const repairedCandidates = processRawCandidates(repairRes?.candidates || []);
        const combinedMap = new Map<string, AlternativeCandidate>();
        [...exactMatches, ...repairedCandidates, ...evaluatedCandidates].forEach((c) => {
          if (!combinedMap.has(c.text)) {
            combinedMap.set(c.text, c);
          }
        });
        evaluatedCandidates = Array.from(combinedMap.values());
        exactMatches = evaluatedCandidates.filter((c) => c.isExactToneMatch);
      } catch {
        // fallback to dictionary augmentation below
      }
    }

    // Stage 3: 若經過 AI 生成後 100% 協音吻合的候選詞仍少於 4 個，自動以本地已驗證神學詞庫補齊至 4 個！
    if (exactMatches.length < 4 && verifiedExamples.length > 0) {
      const existingTexts = new Set(evaluatedCandidates.map((c) => c.text));
      for (const verifiedWord of verifiedExamples) {
        if (existingTexts.has(verifiedWord)) continue;
        const check = verifyPhraseAgainstPattern(verifiedWord, cleanTargetPattern);
        if (check.isExactMatch) {
          exactMatches.push({
            id: `cand-dict-${Math.random().toString(36).slice(2, 9)}`,
            text: verifiedWord,
            targetPattern: cleanTargetPattern,
            actualPattern: check.actualPattern,
            isExactToneMatch: true,
            jyutpingList: check.jyutpingList,
            toneAnalysis: `【本地協音詞庫精選】100% 符合 [${cleanTargetPattern}] 聲調對位，切合敬拜詩歌語境。`,
            vocalErgonomics: check.endErgonomics.note,
            ergonomicsRating: check.endErgonomics.rating,
          });
          existingTexts.add(verifiedWord);
          if (exactMatches.length >= 4) break;
        }
      }
    }

    // 優先排序：100% 協音吻合 + 聲樂開口度佳者排最前，取前 4 個
    const ratingScore: Record<string, number> = {
      excellent: 4,
      good: 3,
      caution_closed: 2,
      warning_stopped: 1,
    };

    const finalCandidates = [
      ...exactMatches.sort(
        (a, b) =>
          (ratingScore[b.ergonomicsRating] || 0) - (ratingScore[a.ergonomicsRating] || 0)
      ),
      ...evaluatedCandidates.filter((c) => !c.isExactToneMatch),
    ].slice(0, 4);

    return NextResponse.json({
      candidates: finalCandidates,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '產生替換選項時發生錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
