import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = (body?.apiKey || process.env.OPENROUTER_API_KEY || '').trim();

    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://cantoneselyricstudio.vercel.app',
      'X-Title': 'Cantonese Lyric Studio',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        models: [],
        error: `HTTP ${res.status}`,
      });
    }

    const data = await res.json();
    const rawList: { id: string; name?: string; description?: string }[] = Array.isArray(data?.data)
      ? data.data
      : [];

    // 優先推薦的精選熱門與特色模型列表（保證 stealth/crouton-alpha 置頂）
    const priorityModelIds = [
      'stealth/crouton-alpha',
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'qwen/qwen-2.5-72b-instruct',
      'mistralai/mistral-large',
    ];

    const modelMap = new Map<string, { id: string; name: string; badge: string }>();

    // 1. 先加入特定優先模型
    priorityModelIds.forEach((pid) => {
      const found = rawList.find((m) => m.id.toLowerCase() === pid.toLowerCase());
      const displayName = found?.name || pid;
      let badge = 'OpenRouter 線上可用';
      if (pid === 'stealth/crouton-alpha') badge = '推薦・預設極速模型';
      else if (pid.includes('claude-3.5-sonnet')) badge = '頂級旗艦・文學詩意';
      else if (pid.includes('deepseek-chat')) badge = '高性價比・中文推薦';
      else if (pid.includes('deepseek-r1')) badge = '深度推理';
      else if (pid.includes('llama-3.3')) badge = '開源旗艦';

      modelMap.set(pid, {
        id: found?.id || pid,
        name: displayName,
        badge,
      });
    });

    // 2. 加入其他所有可用模型（過濾語音、embedding、圖像等非文本生成模型）
    rawList.forEach((m) => {
      if (
        m.id &&
        !modelMap.has(m.id) &&
        !m.id.includes('whisper') &&
        !m.id.includes('embed') &&
        !m.id.includes('dall-e') &&
        !m.id.includes('flux') &&
        !m.id.includes('tts')
      ) {
        modelMap.set(m.id, {
          id: m.id,
          name: m.name ? `${m.name} (${m.id})` : m.id,
          badge: 'OpenRouter 模型',
        });
      }
    });

    const chatModels = Array.from(modelMap.values());

    return NextResponse.json({
      connected: true,
      models: chatModels,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      connected: false,
      models: [],
      error: err instanceof Error ? err.message : '無法查詢 OpenRouter 模型列表',
    });
  }
}
