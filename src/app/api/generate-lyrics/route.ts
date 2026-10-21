import { NextRequest, NextResponse } from 'next/server';
import {
  buildDynamicLexiconPrompt,
  buildLyricLinesFromPatternsAndTexts,
  getVerifiedCandidatesForGroupPattern,
  normalizeTonePatternLine,
  VERIFIED_CANTONESE_WORSHIP_CHARS,
  verifyPhraseAgainstPattern,
} from '@/lib/cantonese';
import { callLLMJson } from '@/lib/ai-providers';
import { AIProviderConfig, LyricLine } from '@/types/lyric';

interface LLMGenerateResponse {
  lines: {
    lineIndex: number;
    groups: string[];
  }[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title = '無題詩歌',
      meaning = '敬拜讚美主恩',
      patternText = '',
      existingLines = [] as LyricLine[],
      aiConfig,
    }: {
      title: string;
      meaning: string;
      patternText: string;
      existingLines?: LyricLine[];
      aiConfig: AIProviderConfig;
    } = body;

    const rawLines = patternText
      .split(/\r?\n/)
      .map((l: string) => normalizeTonePatternLine(l))
      .filter(Boolean);

    if (rawLines.length === 0) {
      return NextResponse.json(
        { error: '請至少輸入一行有效的 0243 數字譜（例如：2444 433）' },
        { status: 400 }
      );
    }

    const themeContext = `${title} ${meaning}`.trim();
    const lexiconHint = buildDynamicLexiconPrompt(rawLines, title, meaning);

    // 整理每一行的結構與已鎖定 (🟢 locked) 的字詞約束
    const lineSpecs = rawLines.map((linePat, lIdx) => {
      const groupPatterns = linePat.split(' ').filter(Boolean);
      const existingLine = existingLines[lIdx];

      const groupConstraintDescriptions = groupPatterns.map((gPat, gIdx) => {
        const existingGroup = existingLine?.groups?.[gIdx];
        if (!existingGroup) {
          return `第${gIdx + 1}組 [目標聲調: ${gPat}，共 ${gPat.length} 字]`;
        }
        const lockedMask = Array.from(gPat)
          .map((tone, tIdx) => {
            const tok = existingGroup.tokens?.[tIdx];
            if (tok && tok.status === 'locked' && tok.char && tok.char !== '＿') {
              return tok.char;
            }
            return `_(${tone}聲)`;
          })
          .join('');
        const hasLocked = existingGroup.tokens?.some((t) => t.status === 'locked');
        return hasLocked
          ? `第${gIdx + 1}組 [目標聲調: ${gPat}，固定鎖定模板: "${lockedMask}"]`
          : `第${gIdx + 1}組 [目標聲調: ${gPat}，共 ${gPat.length} 字]`;
      });

      return {
        lineIndex: lIdx,
        targetPattern: linePat,
        groupPatterns,
        constraintText: `第 ${lIdx + 1} 行 (${linePat})：${groupConstraintDescriptions.join(' ＋ ')}`,
      };
    });

    const systemPrompt = `你是一位精通「0243 粵語協音對位法」與現代粵語敬拜詩歌（如 CantonHymn、玻璃海、同心圓、泥土音樂、讚美之泉粵語版風格）的大師級填詞人。
你的任務是根據用戶提供的「歌曲名稱」、「歌曲含意／想表達的故事」及「0243 數字譜」，創作出**100% 緊扣用戶主題故事、有畫面感、詞彙豐富不單調、情感真摯連貫**且 **100% 符合粵語 0243 聲調**的詩歌歌詞。

### 核心鐵律（必須同時滿足「緊扣主題故事」、「拒絕單調重複」與「0243 啱音」）：

1. **第一優先：100% 緊扣用戶的【歌曲名稱】與【歌曲含意／想表達的故事】**：
   - 用戶寫下的主題故事（例如：「在困境中、患難中不要驚惶，因為神已掌權」）是整首歌的靈魂！
   - **每一句歌詞都必須直接推進並表達這個主題故事**（例如明確寫出困境、患難、風暴、不用驚惶、莫怕、神已掌權、祢已掌權、作王、得勝等核心信息），**絕對不可忽略主題去填寫無關的空泛風景詞，也絕對不可直接照抄下方與本曲故事無關的結構範例詞！**

2. **拒絕單調重複（避免每句都塞滿「主、我、神、祢」）**：
   - **嚴禁生硬堆疊稱謂**：絕對不可寫出「主我神」、「祢恩我神」、「神我主」這類語法生硬的稱謂堆砌！
   - **圍繞用戶故事展開「起、承、轉、合」**：
     - 【起（點出故事處境）】：直接描寫用戶故事中的處境（如困境、患難、黑夜、風浪、疲乏等）。
     - 【承（轉向神的作為與應許）】：描寫神在該處境中的帶領、安慰或掌權（如「患難裡掌權」、「不用驚惶」、「靠著祢得勝」）。
     - 【轉／合（信心宣告與回應）】：畫龍點睛地使用「我 (4聲)」、「祢/你 (4聲)」、「更 (3聲)」作出宣告（如「祢已掌權 (4230)」、「主愛勝患難 (34422)」、「深信祢護佑 (34422)」）。
   - **禁止重複用詞**：同一首詩歌內，相同的二字或三字詞不可重複出現！

3. **0243 粵語協音對位法**：
   - 0（最低音）：陽平聲（如：神、權、王、惶、靈、同、情、全、常、行、人、榮、求、慈、扶、陪、隨、唯、懷、晨、泉、長、前、微、仍）
   - 2（中低音）：陽去、陽入聲等（如：在、患、難、懼、是、大、願、伴、用、共、為、望、路、地、道、父、命、順、領、引、裡、夜、浪、渡、步、靜、漸、座、暴）
   - 4（次高音）：包含「我、你、祢」及陰去、中入聲（如：我、你、祢、怕、困、勝、愛、信、靠、向、敬、拜、讚、看、唱、救、聖、盼、賜、照、獻、見、證、進、去、最、要、放、細、聽、蔭、應）
   - 3（最高音）：包含「更」及陰平、陰上、陰入聲（如：更、掌、驚、境、主、祂、心、恩、深、真、光、歌、天、生、手、身、家、聲、知、依、歸、甘、高、舉、謙、卑、新、清、牽、撫、擁、守、風、星、穩、苦、君）

4. **空格語意分詞與聲樂人體工學**：
   - 每個空格區塊字數必須 100% 吻合，詞彙不可跨空格腰斬。
   - 詞組結尾若是高音（3 或 4），優先使用開口韻。

5. **鎖定字保留**：
   - 若某組標示了「固定鎖定模板」，必須保留已指定的漢字，並讓新填的字與鎖定字組成自然通順的句子。

${lexiconHint}

### 輸出格式要求：
請務必只輸出合法的 JSON 物件，結構如下（不要包含任何其他解釋文字）：
{
  "lines": [
    {
      "lineIndex": 0,
      "groups": ["第一組純中文字串", "第二組純中文字串"]
    }
  ]
}`;

    const userPrompt = `【歌曲名稱】：${title}
【歌曲含意／想表達的故事（核心靈魂，每句歌詞必須緊扣此主題！）】：${meaning}

【各行 0243 數字譜與分組要求】：
${lineSpecs.map((s) => s.constraintText).join('\n')}

請務必緊扣「${title} — ${meaning}」的故事與神學核心來造句（優先運用上方【🎯 本曲主題與故事專屬 0243 協音核心詞彙】中的字詞），嚴格按照每行每組的字數與 0243 聲調選字，回傳 JSON。`;

    // 執行第一輪 LLM 生成
    const firstPass = await callLLMJson<LLMGenerateResponse>(
      aiConfig,
      systemPrompt,
      userPrompt,
      0.45
    );

    const currentGroupTexts: string[][] = lineSpecs.map((spec, lIdx) => {
      const foundLine =
        firstPass?.lines?.find((l) => l.lineIndex === lIdx) ||
        firstPass?.lines?.[lIdx];
      return spec.groupPatterns.map((gPat, gIdx) => {
        const rawGroup = foundLine?.groups?.[gIdx] || '';
        const cleanChars = Array.from(rawGroup.replace(/[^\u4e00-\u9fa5]/g, ''));
        const existingGroup = existingLines[lIdx]?.groups?.[gIdx];
        const mergedChars = Array.from(gPat).map((_, tIdx) => {
          const existingTok = existingGroup?.tokens?.[tIdx];
          if (existingTok && existingTok.status === 'locked' && existingTok.char !== '＿') {
            return existingTok.char;
          }
          return cleanChars[tIdx] || '';
        });
        return mergedChars.join('');
      });
    });

    const evaluateAccuracy = (texts: string[][]) => {
      let totalChars = 0;
      let matchedChars = 0;
      const errorDetails: {
        lineIdx: number;
        groupIdx: number;
        targetPattern: string;
        currentPhrase: string;
        actualPattern: string;
        problemDesc: string;
      }[] = [];

      lineSpecs.forEach((spec, lIdx) => {
        const fullLineText = (texts[lIdx] || []).join('，');
        spec.groupPatterns.forEach((gPat, gIdx) => {
          const phrase = texts[lIdx]?.[gIdx] || '';
          const check = verifyPhraseAgainstPattern(phrase, gPat);
          totalChars += gPat.length;
          const groupMatched = gPat.length - check.mismatches.length;
          matchedChars += Math.max(0, groupMatched);

          if (!check.isExactMatch) {
            const mismatchStrings = check.mismatches.map(
              (m) =>
                `第${m.index + 1}字「${m.char}」(${m.jyutping})實為[${m.actual}聲]，需改為[${m.expected}聲](可用字:${(
                  VERIFIED_CANTONESE_WORSHIP_CHARS[m.expected] || []
                )
                  .slice(0, 16)
                  .join('/')})`
            );
            const verifiedFallbacks = getVerifiedCandidatesForGroupPattern(
              gPat,
              8,
              false,
              themeContext
            );
            errorDetails.push({
              lineIdx: lIdx,
              groupIdx: gIdx,
              targetPattern: gPat,
              currentPhrase: phrase,
              actualPattern: check.actualPattern,
              problemDesc: `第${lIdx + 1}行（整句上下文：「${fullLineText}」）的第${
                gIdx + 1
              }組（目標 [${gPat}]）：目前「${phrase}」實際為 [${
                check.actualPattern
              }]。問題：${mismatchStrings.join('；') || '字數不符'}。請只替換唔啱音的字以保留原句主題意思${
                verifiedFallbacks.length > 0
                  ? `（或參考主題協音詞：${verifiedFallbacks.slice(0, 6).join('、')}）`
                  : ''
              }`,
            });
          }
        });
      });

      return {
        totalChars,
        matchedChars,
        accuracy: totalChars > 0 ? Math.round((matchedChars / totalChars) * 100) : 100,
        errorDetails,
      };
    };

    const initialEval = evaluateAccuracy(currentGroupTexts);
    let currentEval = initialEval;
    let repairCount = 0;
    const maxRetries = aiConfig.enableAutoRepair
      ? Math.min(Math.max(aiConfig.repairMaxRetries || 2, 1), 3)
      : 0;

    // Stage 2: 本地粵拼審音 + 保留主題故事語意之 AI 自動修正迴圈
    while (currentEval.errorDetails.length > 0 && repairCount < maxRetries) {
      repairCount++;
      const repairUserPrompt = `我們使用本地粵語字典（to-jyutping）檢驗了你為《${title}》（主題：${meaning}）生成的歌詞草稿：
${currentGroupTexts
  .map((gList, idx) => `第 ${idx + 1} 行 (${lineSpecs[idx].targetPattern})：${gList.join(' ')}`)
  .join('\n')}

發現以下詞組存在「唔啱音（聲調不符）」：
${currentEval.errorDetails.map((e) => `- ${e.problemDesc}`).join('\n')}

【修正重要原則】：
1. 修正後的字必須 100% 符合目標 0243 數字譜。
2. **極重要：請務必保留原句對主題故事「${title} — ${meaning}」的表達！優先只修改唔啱音的那 1～2 個字，切勿把整句換成與主題無關的空泛詞語！**
請以相同的 JSON 格式回傳完整的 "lines" 陣列。`;

      try {
        const repairedPass = await callLLMJson<LLMGenerateResponse>(
          aiConfig,
          systemPrompt,
          repairUserPrompt,
          0.25
        );

        lineSpecs.forEach((spec, lIdx) => {
          const repLine =
            repairedPass?.lines?.find((l) => l.lineIndex === lIdx) ||
            repairedPass?.lines?.[lIdx];
          if (!repLine) return;

          spec.groupPatterns.forEach((gPat, gIdx) => {
            const oldPhrase = currentGroupTexts[lIdx][gIdx];
            const oldCheck = verifyPhraseAgainstPattern(oldPhrase, gPat);
            if (oldCheck.isExactMatch) return;

            const newRaw = (repLine.groups?.[gIdx] || '').replace(/[^\u4e00-\u9fa5]/g, '');
            if (!newRaw) return;

            const existingGroup = existingLines[lIdx]?.groups?.[gIdx];
            const newMerged = Array.from(gPat)
              .map((_, tIdx) => {
                const existingTok = existingGroup?.tokens?.[tIdx];
                if (
                  existingTok &&
                  existingTok.status === 'locked' &&
                  existingTok.char !== '＿'
                ) {
                  return existingTok.char;
                }
                return Array.from(newRaw)[tIdx] || '';
              })
              .join('');

            const newCheck = verifyPhraseAgainstPattern(newMerged, gPat);
            if (
              newMerged.length === gPat.length &&
              newCheck.mismatches.length < oldCheck.mismatches.length
            ) {
              currentGroupTexts[lIdx][gIdx] = newMerged;
            }
          });
        });

        currentEval = evaluateAccuracy(currentGroupTexts);
      } catch {
        break;
      }
    }

    const lines = buildLyricLinesFromPatternsAndTexts(
      rawLines,
      currentGroupTexts,
      existingLines
    );

    return NextResponse.json({
      lines,
      stats: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        initialAccuracy: initialEval.accuracy,
        finalAccuracy: currentEval.accuracy,
        repairIterations: repairCount,
        totalChars: currentEval.totalChars,
        matchedChars: currentEval.matchedChars,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '生成歌詞時發生未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
