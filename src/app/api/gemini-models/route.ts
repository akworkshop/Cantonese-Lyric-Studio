import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = (body?.apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({
        connected: false,
        models: [],
        error: '未提供 Gemini API Key',
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({
        connected: false,
        models: [],
        error: `HTTP ${res.status}: ${errText.slice(0, 120)}`,
      });
    }

    const data = await res.json();
    const rawModels: {
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }[] = Array.isArray(data?.models) ? data.models : [];

    // 僅保留文字生成 (Text / Chat) 的 Gemini 模型，排除圖像、語音 TTS、即時串流 Live、機器人及電腦操控等非純文字模型
    const NON_TEXT_KEYWORDS = [
      'embedding',
      'vision',
      'imagen',
      'image',
      'tts',
      'live',
      'audio',
      'robotics',
      'computer-use',
      'aqa',
      'veo',
      'lyria',
    ];

    const chatModels = rawModels
      .filter((m) => {
        if (!m.name) return false;
        const lower = m.name.toLowerCase();
        if (!lower.includes('gemini')) return false;
        if (NON_TEXT_KEYWORDS.some((kw) => lower.includes(kw))) return false;
        const methods = m.supportedGenerationMethods;
        if (methods && !methods.includes('generateContent')) return false;
        return true;
      })
      .map((m) => {
        const cleanId = m.name.replace(/^models\//, '');
        return {
          id: cleanId,
          name: m.displayName ? `${m.displayName}` : cleanId,
          badge: '文字模型 · 帳號可用',
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));

    return NextResponse.json({
      connected: true,
      models: chatModels,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      connected: false,
      models: [],
      error: err instanceof Error ? err.message : '無法查詢 Gemini 模型列表',
    });
  }
}
