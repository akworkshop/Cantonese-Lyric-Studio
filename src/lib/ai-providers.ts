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
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (OpenAI)', badge: '推薦・旗艦推理模型' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (OpenAI)', badge: '極速輕量推理' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', badge: '通用高速模型' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', badge: '新一代多模態' },
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
    const model = (config.model || 'openai/gpt-oss-120b').trim();

    // GPT-OSS 與推理模型在 Groq 上使用標準 messages 呼叫最穩定，不強加可能導致 400 的參數
    const makeGroqCall = async (useJsonFormat: boolean) => {
      const payload: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
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

    const isReasoningOrGptOss =
      model.toLowerCase().includes('gpt-oss') ||
      model.toLowerCase().includes('deepseek') ||
      model.toLowerCase().includes('qwq') ||
      model.toLowerCase().includes('r1');

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
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) {
      throw new Error('Groq API 回傳空白內容');
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
