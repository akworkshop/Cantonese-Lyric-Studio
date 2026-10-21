import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = (body?.apiKey || process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ connected: false, models: [], error: '未提供 API Key' });
    }

    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
    const rawList: { id: string }[] = Array.isArray(data?.data) ? data.data : [];

    // 過濾掉語音轉文字 (whisper) 或純護欄 (guard) 模型，並把 gpt-oss 排在最前面
    const chatModels = rawList
      .filter(
        (m) =>
          m.id &&
          !m.id.includes('whisper') &&
          !m.id.includes('guard') &&
          !m.id.includes('tts') &&
          !m.id.includes('playai')
      )
      .sort((a, b) => {
        const aIsGptOss = a.id.toLowerCase().includes('gpt-oss') ? -1 : 1;
        const bIsGptOss = b.id.toLowerCase().includes('gpt-oss') ? -1 : 1;
        if (aIsGptOss !== bIsGptOss) return aIsGptOss - bIsGptOss;
        return a.id.localeCompare(b.id);
      })
      .map((m) => ({
        id: m.id,
        name: m.id,
        badge: m.id.toLowerCase().includes('gpt-oss') ? 'GPT-OSS 可用' : 'Groq 線上可用',
      }));

    return NextResponse.json({
      connected: true,
      models: chatModels,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      connected: false,
      models: [],
      error: err instanceof Error ? err.message : '無法查詢 Groq 模型列表',
    });
  }
}
