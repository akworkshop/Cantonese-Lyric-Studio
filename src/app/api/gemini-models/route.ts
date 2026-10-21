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

    // 篩選支援 generateContent 的 Gemini 生成模型，並按版本號由新到舊排序（例如 3.x -> 2.5 -> 2.0）
    const chatModels = rawModels
      .filter(
        (m) =>
          m.name &&
          m.name.includes('gemini') &&
          !m.name.includes('embedding') &&
          !m.name.includes('vision') &&
          !m.name.includes('imagen') &&
          !m.name.includes('aqa') &&
          (!m.supportedGenerationMethods ||
            m.supportedGenerationMethods.includes('generateContent'))
      )
      .map((m) => {
        const cleanId = m.name.replace(/^models\//, '');
        return {
          id: cleanId,
          name: m.displayName ? `${m.displayName} (${cleanId})` : cleanId,
          badge: '帳號可用',
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
