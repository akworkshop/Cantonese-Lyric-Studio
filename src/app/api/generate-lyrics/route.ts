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

    const systemPrompt = `你是一位精通「0243 粵語協音對位法」與現代粵語敬拜詩歌（如玻璃海、同心圓、ACM、CantonHymn 風格）的大師級填詞人。
你的任務是根據用戶提供的「歌曲名稱」、「歌曲含意／想表達的故事」及「0243 數字譜」，創作出**100% 文法自然、絕不夾硬砌字、緊扣故事精髓、詞彙豐富且 100% 啱音**的詩歌歌詞。

### 核心大師級填詞鐵律（違者視為嚴重失敗）：

1. **【最高鐵律：嚴禁文法倒錯、拼湊怪句與腰斬專有名詞（絕不夾硬放字）】**：
   - **零容忍夾硬砌字**：絕對不可為了滿足 0243 數字譜而拼湊出日常廣東話不會講的怪詞怪句！每一句歌詞必須語法自然流暢、一聽就懂、有真實的情感與呼吸節奏。
   - **專有名詞與核心動詞絕對不可腰斬**：
     - 嚴禁將「耶穌」縮寫成「耶」（例如用戶想寫「宣告耶穌為王」，你若為了啱音改成「宣耶王」，在粵語中意思完全錯哂、極度不敬，絕對禁止！）。
      - 嚴禁將「萬王之王」縮寫成「萬王」（「萬王」單獨不成詞！若音階為 20 請用「作王」、「父神」、「頌揚」、「大能」）。
      - 嚴禁寫出文法不通的硬砌字：如「我慕神」（420 毫無意義！若想表達渴慕神，在 420 請用「愛慕神」、「讚美神」，或改用 424「渴慕祢」）。
      - 嚴禁寫出生硬古典或倒裝怪句：如「獻真主我心」（「真主」過於古典且語序生硬倒錯！請寫成自然的「向恩主獻心」）。
     - 「基督」、「天父」、「上帝」、「聖靈」、「救主」、「十架」、「寶血」、「救贖」、「宣告」等神聖名詞必須保持自然完整，不可畸形拼接。
     - 嚴禁生硬堆疊稱謂代名詞，如「主我神」、「祢愛我神」、「神我主」等病句。

2. **【專業填詞人三步破局法：同義換詞 -> 借位轉意（絕不夾硬放字）】**：
   - 當你想表達的特定概念與音階不合時，**真正成熟的填詞人絕非削足適履縮字，而是採用「三步破局法」**：
     - **第一步（同義換詞）**：換用意思相同、但音階完全符合的粵語正規詞組：
       - 想表達「宣告耶穌作王」：若音階為 3320 請填「尊主作王」；4420 填「宣告作王」；4230 填「祢已掌權」；2430 填「願祢作王」；04430 填「宣稱主作王」（切勿寫成「宣耶王」！）；
       - 想表達「十架救贖捨命」：2444 填「十架捨命」；4242 填「為我捨命」；3442 填「寶血洗淨」；2422 填「十架大愛」；
       - 想表達「風浪患難不驚」：3422 填「風雨不懼」；4222 填「無懼患難」；3344 填「風浪平息」；4232 填「不再驚怕」；
       - 想表達「親近深情渴慕」：4430 填「我渴慕祢」；2432 填「靜候主前」；3324 填「清心仰盼」；4420 填「切切尋求」。
     - **第二步（借位轉意，靈活切換視角）**：若該特定詞義實在無同義詞能配上音階，**立刻改換表達角度**，保持歌曲的核心精神：
       - 從「神的作為」轉為「敬拜者的回應」（如屈膝跪拜、開口稱頌、舉手讚美）；
       - 從「抽象神學」轉為「具體畫面與光景」（如晨光照亮、寶座長存、活水湧流）；
       - 只要感情真摯、緊扣故事靈魂，視角一換，文法自然 100% 順暢，意境更為深刻！

3. **【拒絕空泛套話罐頭歌詞（深入具體處境故事，層層遞進）】**：
   - **嚴禁萬用罐頭套話**：嚴禁整首歌只會反覆填寫「恩典深／讚美神／主恩多」這種空洞無物的套話！
   - **緊扣用戶故事與心路歷程**：用戶寫下的【歌曲含意／想表達的故事】是整首歌的靈魂！必須深入故事中的真實掙扎、黑夜苦楚與處境，層層推進：
     - 【起（處境描寫）】：描寫黑夜、軟弱、風浪、疲乏等具體生活場景；
     - 【承（神聖相遇）】：描寫神在該處境中的同在、微聲、安慰與帶領；
     - 【轉（信心轉向）】：信心的宣告（如「祢已掌權」、「莫怕風浪」）；
     - 【合（深情回應）】：以真摯情感回應，全心跟隨與獻上。

4. **【美學風格要求】**：
   - 融合現代細膩感人風格（玻璃海、同心圓風格：深情真摯、富有畫面感）與簡樸會眾敬拜風格（易唱易記、琅琅上口）。
   - 空格區塊字數必須 100% 吻合，詞組結尾若是高音（3 或 4）優先使用開口韻。

5. **【0243 粵語協音對位標準】**：
   - 0（最低音）：陽平聲（神、權、王、惶、靈、同、情、全、常、行、人、榮、求、慈、扶、陪、隨、唯、懷、晨、泉、長、前、微、仍）
   - 2（中低音）：陽去、陽上（如「美」）、陽入聲（美、在、患、難、懼、是、大、願、伴、用、共、為、望、路、地、道、父、命、順、領、引、裡、夜、浪、渡、步、靜、漸、座、暴）
   - 4（次高音）：含「我、你、祢」、「更(更深/更愛/更加)」及陰去、中入聲（我、你、祢、更、怕、困、勝、愛、信、靠、向、敬、拜、讚、看、唱、救、聖、盼、賜、照、獻、見、證、進、去、最、要、放、細、聽、蔭、應）
   - 3（最高音）：含「更(更新/更改)」及陰平、陰上、陰入聲（更、掌、驚、境、主、祂、心、恩、深、真、光、歌、天、生、手、身、家、聲、知、依、歸、甘、高、舉、謙、卑、新、清、牽、撫、擁、守、風、星、穩、苦、君）

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
