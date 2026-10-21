import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { LyricLine } from '@/types/lyric';

const FALLBACK_SUPABASE_URL = 'https://phiiglwfhrolhcettmlz.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_ELfjj1Yz1qBsKzNOEXRcxw_PEcKTu0q';

const getEnvOrStored = (key: string, fallback: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!.trim();
  }
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(key);
    if (stored && stored.trim()) return stored.trim();
  }
  return fallback;
};

const supabaseUrl = getEnvOrStored('NEXT_PUBLIC_SUPABASE_URL', FALLBACK_SUPABASE_URL);
const supabaseAnonKey = getEnvOrStored('NEXT_PUBLIC_SUPABASE_ANON_KEY', FALLBACK_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SubscriptionTier = 'free' | 'pro' | 'church';

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string;
  aiCreditsRemaining: number;
}

export interface CloudLyricProject {
  id: string;
  userId: string;
  title: string;
  meaning: string;
  patternText: string;
  lines: LyricLine[];
  updatedAt: string;
}

/**
 * 取得當前用戶的會員與訂閱資料
 */
export async function fetchUserProfile(user: User): Promise<UserProfile> {
  if (!supabase) {
    return {
      id: user.id,
      email: user.email || '',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      aiCreditsRemaining: 10,
    };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      // 若觸發器尚未寫入，建立預設 profile
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        subscription_tier: 'free',
        subscription_status: 'active',
        ai_credits_remaining: 10,
      });

      return {
        id: user.id,
        email: user.email || '',
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        aiCreditsRemaining: 10,
      };
    }

    return {
      id: data.id,
      email: data.email || user.email || '',
      displayName: data.display_name,
      subscriptionTier: (data.subscription_tier as SubscriptionTier) || 'free',
      subscriptionStatus: data.subscription_status || 'active',
      aiCreditsRemaining: data.ai_credits_remaining ?? 10,
    };
  } catch {
    return {
      id: user.id,
      email: user.email || '',
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      aiCreditsRemaining: 10,
    };
  }
}

/**
 * 從 Supabase 雲端載入用戶的所有詩歌專案
 */
export async function fetchCloudProjects(userId: string): Promise<CloudLyricProject[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('lyric_projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    userId: item.user_id,
    title: item.title,
    meaning: item.meaning || '',
    patternText: item.pattern_text,
    lines: (item.lines as LyricLine[]) || [],
    updatedAt: new Date(item.updated_at).toLocaleString('zh-HK', { hour12: false }),
  }));
}

/**
 * 儲存詩歌專案至 Supabase 雲端資料庫
 */
export async function saveCloudProject(
  userId: string,
  project: {
    id: string;
    title: string;
    meaning: string;
    patternText: string;
    lines: LyricLine[];
  }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase 未配置' };
  }

  const { error } = await supabase.from('lyric_projects').upsert({
    id: project.id,
    user_id: userId,
    title: project.title.trim() || '無題詩歌',
    meaning: project.meaning || '',
    pattern_text: project.patternText,
    lines: project.lines,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * 刪除 Supabase 雲端詩歌專案
 */
export async function deleteCloudProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase 未配置' };

  const { error } = await supabase.from('lyric_projects').delete().eq('id', projectId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
