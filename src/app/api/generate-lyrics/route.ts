import { NextRequest, NextResponse } from 'next/server';
import {
  buildDynamicLexiconPrompt,
  buildLyricLinesFromPatternsAndTexts,
  getCandidatesWithLockedConstraints,
  getVerifiedCandidatesForGroupPattern,
  normalizeTonePatternLine,
  parsePatternTextWithSections,
  ParsedPatternLine,
  VERIFIED_CANTONESE_WORSHIP_CHARS,
  verifyPhraseAgainstPattern,
} from '@/lib/cantonese';
import { callLLMJson } from '@/lib/ai-providers';
import { AIProviderConfig, LyricLine, SongPerspective } from '@/types/lyric';

interface LLMGenerateResponse {
  lines: {
    lineIndex: number;
    groups: string[];
  }[];
}

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const {
      title = '無題詩歌',
      meaning = '敬拜讚美主恩',
      patternText = '',
      existingLines = [] as LyricLine[],
      perspective = 'devotional',
      aiConfig,
    }: {
      title: string;
      meaning: string;
      patternText: string;
      existingLines?: LyricLine[];
      perspective?: SongPerspective;
      aiConfig: AIProviderConfig;
    } = body;

    const parsedPatternLines = parsePatternTextWithSections(patternText);
    const rawLines = parsedPatternLines.map((p) => p.pattern);

    if (rawLines.length === 0) {
      return NextResponse.json(
        { error: '請至少輸入一行有效的 0243 數字譜（例如：2444 433）' },
        { status: 400 }
      );
    }

    const themeContext = `${title} ${meaning}`.trim();
    const lexiconHint = buildDynamicLexiconPrompt(rawLines, title, meaning, perspective);

    const perspectiveGuidelines: Record<SongPerspective, { title: string; desc: string }> = {
      devotional: {
        title: '親密傾訴（我向祢 / 私禱）',
        desc: '代名詞嚴格以「我」與「祢」為主，展現個人在密室中向神的深情傾訴、靈修默想、渴慕與甘心奉獻。口吻溫柔真摯，全曲切勿突兀切換成「我們」或「他們」。',
      },
      congregational: {
        title: '全體宣告（我們向主 / 會眾敬拜）',
        desc: '【會眾全體宣告視角 - 絕對禁令】：❌ 嚴格禁止使用任何單數私禱稱謂（如「我」、「我心」、「我身」、「牽我手」等）！全曲每一行都必須站在「全體會眾／我們／萬民／全地」的集體敬拜視角，使用「我們」、「同心」、「齊聲」、「萬民」、「普世」、「眾心」！',
      },
      narrative: {
        title: '福音敘事（祂的作為 / 救恩見證）',
        desc: '【福音敘事視角 - 絕對禁令】：❌ 嚴格禁止私禱式的「我心愛祢」！全曲必須以客觀福音歷史視角見證「祂的作為、十架、基督、耶穌、救恩、天地、創造」！',
      },
      exhortation: {
        title: '彼此勸勉（奔跑天路 / 差遣激勵）',
        desc: '【彼此勸勉視角 - 絕對禁令】：❌ 嚴格禁止內向自憐的私禱！全曲以向聖徒弟兄姊妹說話「你當剛強」、「我們奔跑」、「同心站立」、「莫怕風浪」！',
      },
    };
    const activePerspective =
      perspectiveGuidelines[perspective as SongPerspective] || perspectiveGuidelines.devotional;

    // 為全曲每一行、每一組預先精選 100% 協音的神學詞磚菜單（Inverted Candidate Menu）
    const lineMenus: {
      lineIndex: number;
      groupMenus: { groupIdx: number; pattern: string; candidates: string[] }[];
    }[] = [];

    // 整理每一行的結構與已鎖定 (🟢 locked) 的字詞約束，並注入 100% 啱音詞磚菜單供 AI 精選
    const lineSpecs = parsedPatternLines.map((pLine, lIdx) => {
      const linePat = pLine.pattern;
      const section = pLine.section || '';
      const groupPatterns = linePat.split(' ').filter(Boolean);
      const existingLine = existingLines[lIdx];

      // 根據段落功能（Verse 主歌 vs Chorus 副歌 vs Bridge 橋段）給予鮮明且對比強烈的寫作指引
      let sectionGuidance = '';
      const isVerse = /verse|主歌/i.test(section) || (!section && lIdx < Math.ceil(parsedPatternLines.length / 2));
      const isChorus = /chorus|副歌/i.test(section);
      const isBridge = /bridge|橋段/i.test(section);

      if (isVerse) {
        sectionGuidance = '【本行任務：Verse 主歌敘事鋪陳】嚴禁一開頭就大喊副歌式的讚美口號！必須從具體處境、受造宇宙浩瀚、黑夜風浪或世人奔波尋求的真實場景切入鋪陳！';
      } else if (isChorus) {
        sectionGuidance = `【本行任務：Chorus 副歌情感高潮】全曲情感最高峰！用最響亮洗練、全體齊聲宣揚的詞磚，強烈呼應歌名《${title}》與主題的核心大宣告！`;
      } else if (isBridge) {
        sectionGuidance = '【本行任務：Bridge 橋段轉折深化】推動信心轉折與決定性的立志跨越（如走出幽谷、十架光芒、定意跟隨）！';
      }

      const groupMenus: { groupIdx: number; pattern: string; candidates: string[] }[] = [];

      const groupConstraintDescriptions = groupPatterns.map((gPat, gIdx) => {
        const existingGroup = existingLine?.groups?.[gIdx];
        const groupTokens =
          existingGroup?.tokens ||
          Array.from(gPat).map((t) => ({ expectedTone: t }));

        let verifiedBricks = getCandidatesWithLockedConstraints(
          groupTokens,
          80,
          true,
          themeContext
        );

        if (perspective === 'congregational') {
          const privates = ['我心', '我身', '我手', '我靈', '牽我', '撫我', '親近祢', '我愛祢', '我深愛', '我渴慕'];
          const filtered = verifiedBricks.filter((c) => !privates.some((p) => c.includes(p)));
          if (filtered.length >= 8) verifiedBricks = filtered;
        } else if (perspective === 'narrative') {
          const filtered = verifiedBricks.filter((c) => !['我愛祢', '我深愛', '我渴慕', '牽我手'].some((p) => c.includes(p)));
          if (filtered.length >= 8) verifiedBricks = filtered;
        }

        groupMenus.push({
          groupIdx: gIdx,
          pattern: gPat,
          candidates: verifiedBricks,
        });

        const hasLocked = existingGroup?.tokens?.some((t) => t.status === 'locked');
        const lockedMask = hasLocked
          ? Array.from(gPat)
              .map((tone, tIdx) => {
                const tok = existingGroup?.tokens?.[tIdx];
                return tok?.status === 'locked' && tok.char && tok.char !== '＿'
                  ? tok.char
                  : `_(${tone}聲)`;
              })
              .join('')
          : '';

        const candidateSampleList = verifiedBricks.slice(0, 60);
        const candidateSample = candidateSampleList.join('、');

        return `  • 第 ${gIdx + 1} 組 [目標聲調: ${gPat}，${gPat.length}字]${
          hasLocked ? ` (鎖定模板: "${lockedMask}")` : ''
        }:\n    👉 100% 啱音精選詞磚菜單（共 ${candidateSampleList.length} 個候選供精選）：【${candidateSample}】`;
      });

      lineMenus.push({ lineIndex: lIdx, groupMenus });

      return {
        lineIndex: lIdx,
        targetPattern: linePat,
        groupPatterns,
        constraintText: `第 ${lIdx + 1} 行 ${section ? `【${section}】` : ''}(${linePat})：\n${groupConstraintDescriptions.join(
          '\n'
        )}${sectionGuidance ? `\n    💡 ${sectionGuidance}` : ''}`,
      };
    });

    const systemPrompt = `你是一位精通「0243 粵語協音對位法」與現代粵語敬拜詩歌（如玻璃海、同心圓、ACM、CantonHymn 風格）的大師級填詞人。
你的任務是根據用戶提供的「歌曲名稱」、「歌曲含意／想表達的故事」及「0243 數字譜」，創作出**100% 文法自然、絕不夾硬砌字、緊扣故事精髓、詞彙豐富且 100% 啱音**的詩歌歌詞。

### 👤 本曲指定人稱視角與口吻：【${activePerspective.title}】
- ${activePerspective.desc}

### 🎼 歌曲段落結構與功能指引（主歌與副歌必須有巨大的修辭與畫面反差！）：
- **【Verse 主歌（鋪陳敘事與具體場景）】**：
  - **必須由「具體情境、自然畫面、受造宇宙、世人處境、黑夜呼求」切入**！
  - **❌ 主歌第一行絕對嚴禁直接大喊副歌口號（嚴禁一開頭就「向祢敬拜、權柄大地、掌管世界」）！**
  - 例如主題是「創造萬物、掌管所有的主，是我們力量泉源」：
    - 主歌第一段必須寫**諸天穹蒼之浩瀚、世人奔波之疲乏軟弱、受造界對造物主的仰望**！
- **【Chorus 副歌（情感最高峰與齊聲宣告）】**：
  - 只有在進入【Chorus】時，才全面引爆核心歌名《${title}》與集體大宣告（如「萬民屈膝高唱、掌管萬有、至高榮耀」）！
  - 副歌必須洗練、琅琅上口、充滿信心的爆發力！
- **【Bridge 橋段（轉折深化與信心跨越）】**：推動視角轉向（如跨過約旦、走出幽谷、十架光芒），帶來生命更新與決定性的立志回應。

### 核心大師級填詞鐵律（違者視為嚴重失敗）：

0. **【靈魂最高鐵律：全曲全局故事弧（起承轉合）與行內呼吸連貫，絕不可孤立拼湊！】**：
   - 🎯 **你不是在填寫獨立孤立的句子，你是在執導一首完整的敬拜詩歌長卷！**
   - ❌ **絕對嚴禁各行各自為政、前後矛盾或前言不對後語！** 每一行都必須承接上一行的情感與畫面：
     - **第 1 行【起 - 處境或宏觀】**：奠定具體時空氛圍（受造宇宙／黑夜尋求／真實處境／晨光破曉），絕不一開頭就空喊副歌大口號！
     - **第 2 行【承 - 救恩與作為】**：承接第 1 行處境，深化神聖同在、基督十架救恩或溫柔安慰引導；
     - **第 3 行【轉 - 信心與跨越】**：心靈轉折點，在風浪或軟弱中定意仰望、立志跟隨、信心跨越；
     - **第 4 行【合 - 讚美與宣告】**：情感全面爆發，全心讚頌主恩，齊聲宣揚基督掌權直到永遠！
   - ✅ **一行內的各組詞磚必須串聯成主謂完整、深具意境的詩歌長句**！嚴禁碎詞硬拼或口號堆疊。

1. **【鐵律：全曲絕對零重複（Zero Word Repetition，詞彙豐富度）】**：
   - ❌ **全曲任何 2～4 字的實詞組（如「心讚美」、「聲高唱」、「道成肉身」、「恩翅下」等），全曲絕對嚴禁重複出現超過 1 次！**
   - 示例：如果第 1 行挑選了「心讚美」，後續第 2、3、4 行**絕對嚴禁再選「心讚美」**！必須改用菜單中的「真盼望」、「深愛慕」、「彰顯愛」、「高唱頌」等！
   - 描寫讚美：輪流使用「稱頌」、「歌唱」、「高唱」、「頌揚」、「敬拜」、「宣揚」；
   - 描寫恩惠：輪流使用「慈愛」、「厚恩」、「真光」、「恩惠」、「眷顧」、「信實」；
   - 善用每組提供的大量候選詞磚，展現豐富多元的文學修養，杜絕重複單調！

1. **【最高鐵律：嚴禁文法倒錯、拼湊怪句、尾部強塞贅字與腰斬專有名詞（絕不夾硬放字）】**：
   - **零容忍夾硬砌字與尾部強行墊字**：
     - 絕對不可為了湊足音節而將 4 字句在句尾隨意加字充數！
     - 嚴禁句尾疊字或強塞孤立無意義動詞（如「願稱頌主主」、「齊歌唱主求」等毫無文理之病句）。
     - 每句文字必須符合正規粵語語法，具有完整的主謂賓結構。
   - **專有名詞與核心動詞絕對不可腰斬**：
     - 嚴禁將「耶穌」縮寫成「耶」（例如用戶想寫「宣告耶穌為王」，你若為了啱音改成「宣耶王」，在粵語中意思完全錯哂、極度不敬，絕對禁止！）。
     - 嚴禁將「萬王之王」縮寫成「萬王」（「萬王」單獨不成詞！若音階為 20 請用「作王」、「父神」、「頌揚」、「大能」）。
     - 嚴禁寫出文法不通的硬砌字：如「我慕神」（420 毫無意義！若想表達渴慕神，在 420 請用「愛慕神」、「讚美神」，或改用 424「渴慕祢」）。
     - 嚴禁寫出生硬古典或倒裝怪句：如「獻真主我心」（「真主」過於古典且語序生硬倒錯！請寫成自然的「向恩主獻心」）。
     - 「基督」、「天父」、「上帝」、「聖靈」、「救主」、「十架」、「寶血」、「救贖」、「宣告」等神聖名詞必須保持自然完整，不可畸形拼接。
     - 嚴禁生硬堆疊稱謂代名詞，如「主我神」、「祢愛我神」、「神我主」等病句。

2. **【專業填詞人三步破局法：死守原音階，同義換詞 -> 借位轉意（絕不夾硬放字）】**：
   - **【最核心鐵律：旋律音階絕對不可改動！】** 樂譜給定 3320 就是 3320，絕對不能改為 3420！填詞是「詞遷就曲」，旋律音階神聖不可動搖！
   - 當你想表達的特定概念與給定音階不合時，**真正成熟的填詞人絕非削足適履縮字，而是採用「三步破局法」死守音階**：
     - **第一步（嚴格守音，同義換詞）**：在【必須 100% 嚴格匹配當前給定音階】的前提下，換用意思相同、音階精準吻合的粵語正規詞組：
       - 例如當前旋律音階是 3320，想表達「宣告耶穌作王」，絕不可填 3420 的詞或硬縮成「宣耶王」，而是填精準吻合 3320 的「尊主作王」！
       - 若當前音階是 4230，才填「祢已掌權」；若當前音階是 2430，才填「願祢作王」。
     - **第二步（嚴格守音，借位轉意切換視角）**：若該特定概念在【當前這個給定音階】下實在找不到同義詞，**音階依然分毫不改（3320 依然是 3320）**，而是立刻改換表達角度：
       - 從「神的作為」轉為「敬拜者的回應」（如當前音階需要特定聲調，寫敬拜者屈膝跪拜、開口稱頌）；
       - 從「抽象神學」轉為「具體畫面與光景」（如晨光照亮、寶座長存、活水湧流）；
       - **音階 100% 嚴格保留，視角靈活轉換，文法 100% 順暢，絕不夾硬砌字！**

3. **【拒絕空泛套話與過度重複（相同詞彙全曲最多出現三次）】**：
   - **詞彙多樣性鐵律（嚴禁洗腦單調）**：
     - 除核心神聖代名詞（「我」、「你」、「祢」、「祂」、「主」、「神」）及常用助詞之外，**任何具體的 2～4 字實詞／詞組（例如「恩典」、「十架」、「讚美」、「榮美」、「救贖」、「盼望」、「深恩」、「安息」、「風浪」、「寶血」等），在整首歌曲中絕對不可重複超過三次！**
     - 填詞人必須展現豐富的語言修養，廣泛運用同義詞或轉換表達視角進行遞進（例如描寫神的恩惠，輪流使用「主愛」、「慈愛」、「厚恩」、「深恩」、「恩惠」、「眷顧」；描寫讚頌，輪流使用「稱頌」、「歌唱」、「敬拜」、「宣揚」、「高唱」等）。
   - **嚴禁萬用罐頭套話**：嚴禁整首歌只會反覆填寫「恩典深／讚美神／主恩多」這種空洞無物的套話！
   - **緊扣用戶故事與心路歷程**：用戶寫下的【歌曲含意／想表達的故事】是整首歌的靈魂！必須深入故事中的真實掙扎、黑夜苦楚與處境，層層推進：
     - 【起（處境描寫）】：描寫黑夜、軟弱、風浪、疲乏等具體生活場景；
     - 【承（神聖相遇）】：描寫神在該處境中的同在、微聲、安慰與帶領；
     - 【轉（信心轉向）】：信心的宣告（如「祢已掌權」、「莫怕風浪」）；
     - 【合（深情回應）】：以真摯情感回應，全心跟隨與獻上。

4. **【善用情感轉折、確信宣告與生命敘事流動】**：
   - 大膽並自然地運用粵語抒情詩歌最動人的關係與情態樞紐詞，讓語意如流水般推進：
     - **終局釋放與開花**：「終於（30）」、「終必（34）」、「終得見（344）」、「黑夜終過（4434）」、「晨光終現（0034）」；
     - **信心確信與深知**：「確信（44）」、「深信（34）」、「深知（33）」、「我心深信（4334）」、「堅信不移（3440）」；
     - **救恩成就與自稱宣告**：「我已（44）」、「祢已（44）」、「我已得救（4442）」、「我已重生（4400）」、「我已立志（4444）」、「祢已掌權（4430）」；
     - **逆境讓步與跨越**：「縱使（44）」、「縱然（40）」、「哪怕（44）」、「即使（44）」、「就算（44）」、「縱使風浪（4432）」、「哪怕黑暗（4434）」；
     - **當下更新與解脫**：「如今（00）」、「此刻（44）」、「自此（24）」、「不再驚惶（4230）」、「不再懼怕（4224）」、「定要歌唱（2434）」、「誓要跟隨（2430）」。
    - **聖經人物典範與信心歷史敘事**（若用戶主題涉及聖經人物或典範）：
      - 若主題涉及信心先賢（如「約書亞剛強壯膽」、「迦勒專心跟從」、「大衛戰勝歌利亞／合神心意」、「摩西曠野引路／分開紅海」、「亞伯拉罕信心之父」、「但以理立志自潔」、「保羅打美好仗」等），應敏銳地將歷史典故與當下靈命激勵結合，自然運用「跨過約旦（3442）」、「攻破堅城（3430）」、「承受應許（0234）」、「專心跟從（3330）」、「我和我家（4043）」、「事奉耶和華（22000）」、「不可驚惶（3330）」等豐富典故詞彙。

5. **【美學風格要求】**：
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
【指定人稱視角（嚴格遵守，違者無效）】：${activePerspective.title}（${activePerspective.desc}）

【各行 0243 數字譜與 100% 啱音精選詞磚菜單】：
${lineSpecs.map((s) => s.constraintText).join('\n\n')}

【大師級全曲總導演精選與寫作要求】：
1. 🎯【全曲起承轉合宏觀連貫】：整首歌必須是一篇完整、通順、連貫的信仰故事長卷！第 1 行鋪陳 ➔ 第 2 行推進 ➔ 第 3 行轉折 ➔ 第 4 行高潮宣告，前後文脈絡緊密相扣，絕非每一行孤立拼湊！
2. 🚫【全曲絕對零重複】：任何 2～4 字詞組全曲絕對嚴禁重複出現超過 1 次！若前面某行選了某詞（如「心讚美」），後續各行絕對嚴禁再選，必須從菜單中挑選不同詞磚！
3. 💎【嚴格選自 100% 啱音菜單】：嚴格從每組提供的【100% 啱音精選詞磚菜單】（共數十個候選）中，挑選最契合《${title}》（${meaning}）的詞組！
4. 🌊【行內呼吸自然連貫】：每一行歌詞串聯起來必須是一句主謂完整、文理自然的粵語詩句，絕不可碎詞堆砌！
5. 嚴格遵守人稱視角【${activePerspective.title}】。
6. 依各組目標字數輸出 JSON。`;

    // 執行第一輪 LLM 生成（設置 5 秒超時，預留充足時間給本地審查與單次定向微修，杜絕 Vercel 504）
    let firstPass: LLMGenerateResponse | null = null;
    try {
      firstPass = await callLLMJson<LLMGenerateResponse>(
        aiConfig,
        systemPrompt,
        userPrompt,
        0.5,
        5000
      );
    } catch (pass1Err) {
      console.warn('AI 初稿生成逾時或異常，由本地神學詞庫無縫補全：', pass1Err);
    }

    const usedPhrasesAcrossSong = new Set<string>();

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
        const phrase = mergedChars.join('');
        const fallbackCandidates = lineMenus[lIdx]?.groupMenus?.[gIdx]?.candidates || [];

        // 檢驗 AI 選出的詞組是否 100% 協音且在全曲中尚未被使用過
        const isExact = phrase.length === gPat.length && verifyPhraseAgainstPattern(phrase, gPat).isExactMatch;
        const isRepeated = usedPhrasesAcrossSong.has(phrase);

        if (isExact && !isRepeated) {
          usedPhrasesAcrossSong.add(phrase);
          return phrase;
        }

        // 若 AI 脫稿寫出唔啱音的詞，或重複了前面各行已出現的詞組，從預選菜單中挑選第一個「全曲尚未被使用過」的啱音詞組！
        const unusedFallback =
          fallbackCandidates.find((cand) => !usedPhrasesAcrossSong.has(cand)) ||
          fallbackCandidates[0] ||
          phrase;

        usedPhrasesAcrossSong.add(unusedFallback);
        return unusedFallback;
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

    // 檢查人稱視角違規（如：會眾全體宣告模式嚴禁單數私禱稱謂）
    const checkPerspectiveViolations = (texts: string[][]) => {
      const violations: {
        lineIdx: number;
        groupIdx: number;
        targetPattern: string;
        currentPhrase: string;
        problemDesc: string;
      }[] = [];

      if (perspective !== 'congregational' && perspective !== 'narrative') {
        return violations;
      }

      const forbiddenDevotional = [
        '我心', '我身', '我手', '我靈', '牽我', '撫我', '親近祢', '我愛祢', '我深愛', '我渴慕',
        '向我', '伴我', '叫我', '憐憫我', '救我', '懂我心', '聽我'
      ];

      texts.forEach((line, lIdx) => {
        line.forEach((group, gIdx) => {
          const gPat = lineSpecs[lIdx]?.groupPatterns?.[gIdx] || '';
          for (const bad of forbiddenDevotional) {
            if (group.includes(bad)) {
              violations.push({
                lineIdx: lIdx,
                groupIdx: gIdx,
                targetPattern: gPat,
                currentPhrase: group,
                problemDesc: `詞組「${group}」包含單數私禱稱謂「${bad}」，違背了【${activePerspective.title}】要求。請使用會眾詞彙（如「眾心/全地/萬民/我們/同心/齊聲」）`,
              });
              return;
            }
          }
          if (perspective === 'congregational') {
            const withoutWe = group.replace(/我們|我和/g, '');
            if (withoutWe.includes('我')) {
              violations.push({
                lineIdx: lIdx,
                groupIdx: gIdx,
                targetPattern: gPat,
                currentPhrase: group,
                problemDesc: `詞組「${group}」使用了單數「我」，會眾宣告模式嚴禁單數私禱，請改用「我們」、「眾」、「萬民」或客觀敬拜詞彙`,
              });
            }
          }
        });
      });

      return violations;
    };

    // 檢查全曲詞彙重複率（除核心代名詞外，實詞不可重複超過 3 次）
    const findExcessiveRepetitions = (
      groupTexts: string[][],
      maxAllowed = 3
    ): { word: string; count: number }[] => {
      const wordCounts: Record<string, number> = {};
      const stopWords = new Set([
        '我們', '你們', '祢們', '祂們', '我的', '祢的', '你的', '祂的',
        '的主', '之主', '的神', '之神', '同在', '在這', '在那', '不知',
        '我要', '祢要', '只要', '不要', '可以', '能夠', '這生', '一生',
      ]);

      groupTexts.forEach((line) => {
        line.forEach((group) => {
          const gClean = group.replace(/[^\u4e00-\u9fa5]/g, '');
          if (gClean.length >= 2) {
            if (!stopWords.has(gClean)) {
              wordCounts[gClean] = (wordCounts[gClean] || 0) + 1;
            }
            if (gClean.length === 4) {
              const w1 = gClean.slice(0, 2);
              const w2 = gClean.slice(2, 4);
              if (!stopWords.has(w1)) wordCounts[w1] = (wordCounts[w1] || 0) + 1;
              if (!stopWords.has(w2)) wordCounts[w2] = (wordCounts[w2] || 0) + 1;
            }
          }
        });
      });

      const excessive: { word: string; count: number }[] = [];
      for (const [word, count] of Object.entries(wordCounts)) {
        if (count > maxAllowed) {
          excessive.push({ word, count });
        }
      }
      return excessive;
    };

    const initialEval = evaluateAccuracy(currentGroupTexts);
    let currentEval = initialEval;
    let initialViolations = checkPerspectiveViolations(currentGroupTexts);
    let currentViolations = initialViolations;
    let excessiveReps = findExcessiveRepetitions(currentGroupTexts, 3);
    let repairCount = 0;

    // Stage 2: 輕量級定向微修 (Delta Repair) - 嚴格限制在 8 秒安全預算內，杜絕 Vercel 10s 504 Timeout
    const elapsedAfterPass1 = Date.now() - startTime;
    const budgetRemaining = 8000 - elapsedAfterPass1;
    const needsRepair =
      currentEval.errorDetails.length > 0 ||
      currentViolations.length > 0 ||
      excessiveReps.length > 0;

    if (
      aiConfig.enableAutoRepair !== false &&
      needsRepair &&
      budgetRemaining >= 2500
    ) {
      repairCount = 1;
      const errorNotes: string[] = [];
      if (currentEval.errorDetails.length > 0) {
        errorNotes.push(
          '【唔啱音問題】：\n' +
            currentEval.errorDetails.map((e) => `- ${e.problemDesc}`).join('\n')
        );
      }
      if (currentViolations.length > 0) {
        errorNotes.push(
          '【人稱視角違規】：\n' +
            currentViolations.map((v) => `- 第 ${v.lineIdx + 1} 行第 ${v.groupIdx + 1} 組: ${v.problemDesc}`).join('\n')
        );
      }
      if (excessiveReps.length > 0) {
        errorNotes.push(
          '【過度重複詞彙】：\n' +
            excessiveReps.map((r) => `- 「${r.word}」出現 ${r.count} 次，請用同義詞替換`).join('\n')
        );
      }

      const repairUserPrompt = `我們檢驗了你為《${title}》（主題：${meaning}）生成的歌詞草稿：
${currentGroupTexts
  .map((gList, idx) => `第 ${idx + 1} 行 (${lineSpecs[idx].targetPattern})：${gList.join(' ')}`)
  .join('\n')}

發現以下少數問題需要微修：
${errorNotes.join('\n\n')}

【極重要微修原則】：
1. 絕不重寫整首歌！請保留其餘所有良好且協音的詞句與故事情感，僅定向修改上述有瑕疵的詞組。
2. 修正後的字必須 100% 吻合該組目標 0243 聲調。
3. 嚴格遵守人稱視角【${activePerspective.title}】。
請以相同 JSON 格式回傳完整的 "lines" 陣列。`;

      try {
        const deltaTimeout = Math.min(budgetRemaining - 500, 3000);
        const repairedPass = await callLLMJson<LLMGenerateResponse>(
          aiConfig,
          systemPrompt,
          repairUserPrompt,
          0.2,
          deltaTimeout
        );

        lineSpecs.forEach((spec, lIdx) => {
          const repLine =
            repairedPass?.lines?.find((l) => l.lineIndex === lIdx) ||
            repairedPass?.lines?.[lIdx];
          if (!repLine) return;

          spec.groupPatterns.forEach((gPat, gIdx) => {
            const oldPhrase = currentGroupTexts[lIdx][gIdx];
            const oldCheck = verifyPhraseAgainstPattern(oldPhrase, gPat);
            const hasViolation = currentViolations.some(
              (v) => v.lineIdx === lIdx && v.groupIdx === gIdx
            );

            // 若原本已經完全協音且無人稱違規，優先保留原詞，避免 AI 節外生枝
            if (oldCheck.isExactMatch && !hasViolation) return;

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
              (newCheck.mismatches.length <= oldCheck.mismatches.length || hasViolation)
            ) {
              currentGroupTexts[lIdx][gIdx] = newMerged;
            }
          });
        });

        currentEval = evaluateAccuracy(currentGroupTexts);
        currentViolations = checkPerspectiveViolations(currentGroupTexts);
      } catch (repairErr) {
        console.warn('AI 定向微修逾時或跳過，立即切換至本地高精度詞庫完成最終潤飾：', repairErr);
      }
    }

    // Stage 3: 高保真整組本地 100% 協音補全（0.001 秒，嚴禁隨機單字硬塞，確保每一組都是完整優美的神學詞組）
    const allPendingGroupIssues = new Set<string>();
    currentEval.errorDetails.forEach((e) => allPendingGroupIssues.add(`${e.lineIdx}-${e.groupIdx}`));
    currentViolations.forEach((v) => allPendingGroupIssues.add(`${v.lineIdx}-${v.groupIdx}`));

    allPendingGroupIssues.forEach((key) => {
      const [lStr, gStr] = key.split('-');
      const lineIdx = parseInt(lStr, 10);
      const groupIdx = parseInt(gStr, 10);
      const targetPattern = lineSpecs[lineIdx]?.groupPatterns?.[groupIdx];
      if (!targetPattern) return;

      const currentPhrase = currentGroupTexts[lineIdx]?.[groupIdx] || '';
      const check = verifyPhraseAgainstPattern(currentPhrase, targetPattern);
      const hasViolation = currentViolations.some((v) => v.lineIdx === lineIdx && v.groupIdx === groupIdx);

      // 若原詞已經 100% 協音且無人稱違規，保留原貌
      if (check.isExactMatch && !hasViolation) return;

      // 從本地高精度神學協音詞庫中，選取 100% 吻合該音階且語意完整的整組好詞（如「萬民曙光」、「事奉永生」）
      let verifiedCandidates =
        lineMenus[lineIdx]?.groupMenus?.[groupIdx]?.candidates ||
        getVerifiedCandidatesForGroupPattern(targetPattern, 80, true, themeContext);

      if (perspective === 'congregational') {
        const privates = ['我心', '我身', '我手', '我靈', '牽我', '撫我', '親近祢', '我愛祢', '我深愛', '我渴慕'];
        const filtered = verifiedCandidates.filter((c) => !privates.some((p) => c.includes(p)));
        if (filtered.length > 0) verifiedCandidates = filtered;
      } else if (perspective === 'narrative') {
        const filtered = verifiedCandidates.filter((c) => !['我愛祢', '我深愛', '我渴慕', '牽我手'].some((p) => c.includes(p)));
        if (filtered.length > 0) verifiedCandidates = filtered;
      }

      if (verifiedCandidates.length > 0) {
        const existingGroup = existingLines[lineIdx]?.groups?.[groupIdx];
        const matchingCand =
          verifiedCandidates.find((cand) => {
            if (usedPhrasesAcrossSong.has(cand) && currentGroupTexts[lineIdx]?.[groupIdx] !== cand) {
              return false;
            }
            const candChars = Array.from(cand);
            if (candChars.length !== targetPattern.length) return false;
            if (!existingGroup) return true;
            return targetPattern.split('').every((_, tIdx) => {
              const tok = existingGroup.tokens?.[tIdx];
              if (tok && tok.status === 'locked' && tok.char && tok.char !== '＿') {
                return candChars[tIdx] === tok.char;
              }
              return true;
            });
          }) ||
          verifiedCandidates.find((cand) => !usedPhrasesAcrossSong.has(cand)) ||
          verifiedCandidates[0];

        if (matchingCand) {
          usedPhrasesAcrossSong.add(matchingCand);
          currentGroupTexts[lineIdx][groupIdx] = matchingCand;
        }
      }
    });

    currentEval = evaluateAccuracy(currentGroupTexts);

    const lines = buildLyricLinesFromPatternsAndTexts(
      parsedPatternLines,
      currentGroupTexts,
      existingLines
    );

    excessiveReps = findExcessiveRepetitions(currentGroupTexts, 3);

    return NextResponse.json({
      lines,
      stats: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        initialAccuracy: initialEval.accuracy,
        finalAccuracy: currentEval.accuracy,
        repairIterations: repairCount,
        elapsedMs: Date.now() - startTime,
        totalChars: currentEval.totalChars,
        matchedChars: currentEval.matchedChars,
        repeatedWordWarnings: excessiveReps.map((e) => `${e.word} (${e.count}次)`),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '生成歌詞時發生未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
