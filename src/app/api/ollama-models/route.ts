import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const baseUrl = (
    req.nextUrl.searchParams.get('baseUrl') ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434'
  ).replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { connected: false, models: [], error: `HTTP ${res.status}` },
        { status: 200 }
      );
    }

    const data = await res.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((m: { name: string; size?: number }) => ({
          id: m.name,
          name: m.name,
          badge: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '本地已安裝',
        }))
      : [];

    return NextResponse.json({
      connected: true,
      models,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '無法連線至本地 Ollama';
    return NextResponse.json(
      { connected: false, models: [], error: message },
      { status: 200 }
    );
  }
}
