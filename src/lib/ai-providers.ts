import { AIProviderConfig } from '@/types/lyric';

export const DEFAULT_MODELS: Record<
  'gemini' | 'groq' | 'ollama',
  { id: string; name: string; badge: string }[]
> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: '推薦・極速精準' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', badge: '深度神學與文學推理' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: '穩定高CP值' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', badge: '推薦・頂級旗艦' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 (70B Distill)', badge: '深度思考推理' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', badge: '極速輕量' },
    { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B', badge: '高階推理' },
  ],
  ollama: [
    { id: 'qwen2.5:14b', name: 'Qwen 2.5 (14B)', badge: '本地中文首選' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B)', badge: '輕量快速' },
    { id: 'gpt-oss:20b', name: 'GPT-OSS (20B Local)', badge: '本地 OpenAI 開源模型' },
    { id: 'llama3.1:8b', name: 'Llama 3.1 (8B)', badge: '通用本地模型' },
  ],
};

/**
 * 從模型輸出字串中安全提取 JSON 物件（支援去除 <think>...</think> 標籤與 Markdown codefence）
 */
export function extractJsonFromText<T>(rawText: string): T {
  // 1. 移除推理模型的 <think>...</think> 區塊
  const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. 嘗試直接解析
  try {
    return JSON.parse(withoutThink) as T;
  } catch {
    // 3. 嘗試從 ```json ... ``` 提取
    const fenceMatch = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim()) as T;
      } catch {
        // continue
      }
    }

    // 4. 尋找最外層的 { ... }
    const firstBrace = withoutThink.indexOf('{');
    const lastBrace = withoutThink.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = withoutThink.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate) as T;
    }

    throw new Error(`無法從模型回應解析 JSON 格式: ${withoutThink.slice(0, 200)}`);
  }
}

/**
 * 統一呼叫 Gemini API / Groq API (含 GPT-OSS) / 本地 Ollama 並回傳結構化 JSON
 */
export async function callLLMJson<T>(
  config: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.4
): Promise<T> {
  const provider = config.provider || 'gemini';

  if (provider === 'gemini') {
    const apiKey = (config.apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('請點擊右上角「模型」設定您的 Gemini API Key。');
    }
    const model = config.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API 錯誤 (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('') || '';
    if (!text) {
      throw new Error('Gemini API 回傳空白內容');
    }
    return extractJsonFromText<T>(text);
  }

  if (provider === 'groq') {
    const apiKey = (config.apiKey || process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('請點擊右上角「模型」設定您的 Groq API Key。');
    }

    const runWithModel = async (targetModel: string): Promise<T> => {
      const isReasoning =
        targetModel.toLowerCase().includes('gpt-oss') ||
        targetModel.toLowerCase().includes('deepseek') ||
        targetModel.toLowerCase().includes('qwq') ||
        targetModel.toLowerCase().includes('r1');

      // DeepSeek R1 / 推理模型在低溫下容易進入死循環，官方推薦 0.6
      const effectiveTemperature = isReasoning
        ? Math.max(0.6, Math.min(temperature, 0.7))
        : temperature;

      // 針對推理模型加入限制思考長度的指示，防止思考過長耗盡 Token
      const reasoningInstruction = isReasoning
        ? '\n\n【重要格式要求】：請將思考過程嚴格控制在 100 字以內，切勿進行過度漫長的英文分析，請迅速直接輸出合法的 JSON 代碼區塊 ```json ... ```。'
        : '';

      const messages = isReasoning
        ? [
            {
              role: 'user',
              content: `${systemPrompt}\n\n---\n\n請務必依上述規則直接以合法 JSON 回傳：\n\n${userPrompt}${reasoningInstruction}`,
            },
          ]
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ];

      const makeGroqCall = async (useJsonFormat: boolean) => {
        const payload: Record<string, unknown> = {
          model: targetModel,
          messages,
          temperature: effectiveTemperature,
          max_tokens: 8192,
        };
        if (useJsonFormat) {
          payload.response_format = { type: 'json_object' };
        }

        return fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      };

      // 先嘗試呼叫；若因 response_format 報 400，自動降級為純文字提取 JSON
      let res = await makeGroqCall(!isReasoning);
      if (!res.ok && !isReasoning && res.status === 400) {
        res = await makeGroqCall(false);
      }

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(
          `Groq API 錯誤 (${res.status}) [模型: ${targetModel}]: ${errBody.slice(0, 300)}`
        );
      }

      const data = await res.json();
      const choice = data?.choices?.[0];
      const text = choice?.message?.content || '';

      // 1. 若 content 存在且能找到 JSON，直接使用
      if (text) {
        try {
          return extractJsonFromText<T>(text);
        } catch {
          // content 內未含完整 JSON，繼續嘗試 reasoning
        }
      }

      // 2. 檢查 reasoning / reasoning_content（DeepSeek R1 模型可能將 JSON 寫入思考區塊）
      if (choice?.message?.reasoning) {
        try {
          return extractJsonFromText<T>(choice.message.reasoning);
        } catch {
          // continue
        }
      }

      if ((choice?.message as { reasoning_content?: string })?.reasoning_content) {
        try {
          return extractJsonFromText<T>(
            (choice.message as { reasoning_content?: string }).reasoning_content!
          );
        } catch {
          // continue
        }
      }

      // 3. 若是非推理模型且啟用了 response_format 失敗，重試一次無格式模式
      if (!isReasoning) {
        const retryRes = await makeGroqCall(false);
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryChoice = retryData?.choices?.[0];
          const retryText =
            retryChoice?.message?.content || retryChoice?.message?.reasoning || '';
          if (retryText) {
            return extractJsonFromText<T>(retryText);
          }
        }
      }

      const finishReason = choice?.finish_reason || 'unknown';
      throw new Error(
        `Groq 模型 [${targetModel}] 生成未能輸出完整 JSON (finish_reason: ${finishReason})`
      );
    };

    const initialModel = (config.model || 'llama-3.3-70b-versatile').trim();

    try {
      return await runWithModel(initialModel);
    } catch (initialErr) {
      // 若當前模型為推理模型（如 DeepSeek R1 / QwQ）且失敗，自動使用旗艦通用模型 llama-3.3-70b-versatile 無縫救援
      const isInitialReasoning =
        initialModel.toLowerCase().includes('deepseek') ||
        initialModel.toLowerCase().includes('qwq') ||
        initialModel.toLowerCase().includes('r1') ||
        initialModel.toLowerCase().includes('gpt-oss');

      if (isInitialReasoning && initialModel !== 'llama-3.3-70b-versatile') {
        console.warn(
          `[Groq 智慧救援] 推理模型 ${initialModel} 生成失敗，自動無縫切換至 llama-3.3-70b-versatile 重新生成...`
        );
        try {
          return await runWithModel('llama-3.3-70b-versatile');
        } catch (fallbackErr) {
          throw new Error(
            `Groq 生成失敗: ${
              initialErr instanceof Error ? initialErr.message : String(initialErr)
            }；備用救援模型亦失敗: ${
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            }`
          );
        }
      }
      throw initialErr;
    }
  }

  if (provider === 'ollama') {
    const baseUrl = (
      config.ollamaBaseUrl ||
      process.env.OLLAMA_BASE_URL ||
      'http://localhost:11434'
    ).replace(/\/+$/, '');
    const model = config.model || 'qwen2.5:14b';

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: {
          temperature,
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `本地 Ollama 連線錯誤 (${res.status})，請確認已下載模型 "${model}"：${errBody.slice(
          0,
          250
        )}`
      );
    }

    const data = await res.json();
    const text = data?.message?.content || '';
    if (!text) {
      throw new Error('Ollama 模型回傳空白內容');
    }
    return extractJsonFromText<T>(text);
  }

  throw new Error(`不支援的 AI 供應商: ${provider}`);
}
