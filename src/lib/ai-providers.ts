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
    const model = (config.model || 'llama-3.3-70b-versatile').trim();

    const isReasoningOrGptOss =
      model.toLowerCase().includes('gpt-oss') ||
      model.toLowerCase().includes('deepseek') ||
      model.toLowerCase().includes('qwq') ||
      model.toLowerCase().includes('r1');

    // DeepSeek R1 / 推理模型在低溫下容易進入循環死鎖輸出空白，官方推薦 0.6
    const effectiveTemperature = isReasoningOrGptOss
      ? Math.max(0.6, Math.min(temperature, 0.7))
      : temperature;

    // GPT-OSS 與推理模型若使用 system role 可能會丟失輸出或返回空白，合併至 user
    const messages = isReasoningOrGptOss
      ? [
          {
            role: 'user',
            content: `${systemPrompt}\n\n---\n\n請務必依上述規則直接以合法 JSON 回傳：\n\n${userPrompt}`,
          },
        ]
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ];

    const makeGroqCall = async (useJsonFormat: boolean) => {
      const payload: Record<string, unknown> = {
        model,
        messages,
        temperature: effectiveTemperature,
        max_tokens: 4096,
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
    let res = await makeGroqCall(!isReasoningOrGptOss);
    if (!res.ok && !isReasoningOrGptOss && res.status === 400) {
      res = await makeGroqCall(false);
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `Groq API 錯誤 (${res.status}) [模型: ${model}]: ${errBody.slice(0, 300)}`
      );
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    let text = choice?.message?.content || '';

    // 若 content 為空（常見於 DeepSeek R1 / 推理模型），檢查 reasoning 欄位
    if (!text && choice?.message?.reasoning) {
      text = choice.message.reasoning;
    }
    if (!text && (choice?.message as { reasoning_content?: string })?.reasoning_content) {
      text = (choice.message as { reasoning_content?: string }).reasoning_content || '';
    }

    // 若依然為空且剛剛使用了 response_format，嘗試不帶 response_format 重試一次
    if (!text && !isReasoningOrGptOss) {
      const retryRes = await makeGroqCall(false);
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryChoice = retryData?.choices?.[0];
        text =
          retryChoice?.message?.content ||
          retryChoice?.message?.reasoning ||
          (retryChoice?.message as { reasoning_content?: string })?.reasoning_content ||
          '';
      }
    }

    if (!text) {
      console.error('[Groq API Empty Response Debug]', JSON.stringify(data, null, 2));
      const finishReason = choice?.finish_reason || 'unknown';
      throw new Error(
        `Groq API 回傳空白內容 [模型: ${model}, 結束狀態: ${finishReason}]。建議在頂部模型設定切換為「llama-3.3-70b-versatile」。`
      );
    }

    return extractJsonFromText<T>(text);
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
