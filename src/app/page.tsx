'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Sparkles,
  Lock,
  RefreshCw,
  AlertTriangle,
  Edit3,
  Check,
  X,
  Music,
  Settings,
  BookOpen,
  Copy,
  Undo2,
  Redo2,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Eye,
  EyeOff,
  FolderOpen,
  Plus,
  Save,
  Trash2,
  Download,
  Upload,
  FileText,
  User as UserIcon,
  LogIn,
  LogOut,
  Cloud,
  Crown,
} from 'lucide-react';
import {
  AIProviderConfig,
  AIProviderType,
  AlternativeCandidate,
  LyricLine,
  LyricToken,
  TokenStatus,
} from '@/types/lyric';
import {
  analyzeCharToken,
  buildLyricLinesFromPatternsAndTexts,
  getCandidatesWithLockedConstraints,
  getVerifiedCandidatesForGroupPattern,
  normalizeTonePatternLine,
  verifyPhraseAgainstPattern,
} from '@/lib/cantonese';
import { DEFAULT_MODELS } from '@/lib/ai-providers';
import {
  supabase,
  isSupabaseConfigured,
  UserProfile,
  CloudLyricProject,
  fetchUserProfile,
  fetchCloudProjects,
  saveCloudProject,
  deleteCloudProject,
} from '@/lib/supabase';
import {
  getGoogleClientId,
  saveGoogleClientId,
  signInWithGoogleIdToken,
  initializeGoogleIdentity,
  promptGoogleOneTap,
  renderGoogleNativeButton,
} from '@/lib/google-auth';
import type { User } from '@supabase/supabase-js';

interface PresetSong {
  id: string;
  name: string;
  title: string;
  meaning: string;
  patternText: string;
  sampleTexts: string[][];
}

interface SavedProject {
  id: string;
  title: string;
  meaning: string;
  patternText: string;
  lines: LyricLine[];
  updatedAt: string;
}

const PRESET_SONGS: PresetSong[] = [
  {
    id: 'preset-1',
    name: '範本一：我深愛祢（第一人稱親密敬拜）',
    title: '主我深愛祢',
    meaning:
      '以「我」向「祢（主）」傾訴的親密對話詩歌：感謝祢先愛我、牽我手走過風浪，我願一生深愛祢、敬拜祢。',
    patternText: `4344 4343 3344\n4444 0422 2400\n4344 433 0233`,
    sampleTexts: [
      ['我深愛祢', '祢牽我手', '一生愛祢'],
      ['我敬拜祢', '求祢引導', '伴我同行'],
      ['祢深愛我', '賜平安', '同頌主恩'],
    ],
  },
  {
    id: 'preset-2',
    name: '範本二：在祢懷裡（7字抒情慢歌）',
    title: '在祢懷裡得安息',
    meaning:
      '在疲乏與風浪中回到天父懷裡，經歷祢溫柔的安慰與看顧，我心全然信靠祢。',
    patternText: `2402 433\n0444 444\n4344 423\n3344 443`,
    sampleTexts: [
      ['在祢懷裡', '我安息'],
      ['求祢看顧', '我信祢'],
      ['我深愛祢', '讚美主'],
      ['真心愛祢', '敬拜主'],
    ],
  },
  {
    id: 'preset-3',
    name: '範本三：含「唔啱音」測試修訂',
    title: '主愛照亮我心',
    meaning: '此範例第一句刻意放入「全心（03）」對位「43」，示範黃燈自動偵測與就地換詞。',
    patternText: `4344 433 3344\n0242 423 4444`,
    sampleTexts: [
      ['全心愛祢', '唱新歌', '一生愛祢'], // "全" 實為 0，目標 4 -> 自動標示黃色！
      ['同在讚美', '盼望主', '我敬拜祢'],
    ],
  },
];

const PROJECTS_STORAGE_KEY = 'cls_saved_projects_v1';

export default function CantoneseLyricStudioPage() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // 當前專案 ID 與基本資料
  const [currentProjectId, setCurrentProjectId] = useState<string>('proj-default');
  const [title, setTitle] = useState<string>(PRESET_SONGS[0].title);
  const [meaning, setMeaning] = useState<string>(PRESET_SONGS[0].meaning);
  const [patternText, setPatternText] = useState<string>(PRESET_SONGS[0].patternText);
  const [lines, setLines] = useState<LyricLine[]>([]);

  // 專案庫列表與 Modal 狀態
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [newProjForm, setNewProjForm] = useState<{
    title: string;
    meaning: string;
    patternText: string;
  }>({
    title: '',
    meaning: '',
    patternText: '4344 433\n4444 0422',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Undo / Redo 歷史
  const [history, setHistory] = useState<LyricLine[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // AI 模型設定
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: '',
    ollamaBaseUrl: 'http://localhost:11434',
    enableAutoRepair: true,
    repairMaxRetries: 2,
  });
  const [savedKeys, setSavedKeys] = useState<{ gemini: string; groq: string }>({
    gemini: '',
    groq: '',
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showToneGuideModal, setShowToneGuideModal] = useState<boolean>(false);
  const [lexiconSearchPattern, setLexiconSearchPattern] = useState<string>('3344');
  const [ollamaStatus, setOllamaStatus] = useState<{
    checking: boolean;
    connected: boolean;
    models: { id: string; name: string; badge: string }[];
  }>({
    checking: false,
    connected: false,
    models: [],
  });
  const [groqStatus, setGroqStatus] = useState<{
    checking: boolean;
    connected: boolean;
    models: { id: string; name: string; badge: string }[];
  }>({
    checking: false,
    connected: false,
    models: [],
  });
  const [geminiStatus, setGeminiStatus] = useState<{
    checking: boolean;
    connected: boolean;
    models: { id: string; name: string; badge: string }[];
    message?: string;
  }>({
    checking: false,
    connected: false,
    models: [],
  });

  // 就地選取與就地浮動工具列狀態 (In-Place Popover)
  const [selectedRef, setSelectedRef] = useState<{
    lineIdx: number;
    groupIdx: number;
    tokenIdx: number;
  } | null>(null);
  const [applyScope, setApplyScope] = useState<'token' | 'group'>('group');
  const [editingGroupRef, setEditingGroupRef] = useState<{
    lineIdx: number;
    groupIdx: number;
    tokenIdx?: number;
    value: string;
  } | null>(null);

  // Supabase 登入、訂閱與雲端專案同步狀態
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudLyricProject[]>([]);
  const [isCloudLoading, setIsCloudLoading] = useState<boolean>(false);
  const [projectModalTab, setProjectModalTab] = useState<'cloud' | 'local'>('cloud');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [isGsiReady, setIsGsiReady] = useState<boolean>(false);
  const [showGoogleConfig, setShowGoogleConfig] = useState<boolean>(false);

  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState<boolean>(false);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [alternatives, setAlternatives] = useState<AlternativeCandidate[]>([]);
  const [aiAlternatives, setAiAlternatives] = useState<AlternativeCandidate[]>([]);
  const [cantonHymnData, setCantonHymnData] = useState<{
    loading: boolean;
    liveConnected: boolean;
    phrases: { text: string; pattern: string; jyutping: string; songTitle: string }[];
    songs: {
      songId: number;
      title: string;
      author: string;
      lines: { text: string; pattern: string }[];
    }[];
  }>({
    loading: false,
    liveConnected: false,
    phrases: [],
    songs: [],
  });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // 跨裝置同步 Supabase 帳號中的 AI API Keys
  const syncCloudApiKeys = useCallback(async (user: User) => {
    const meta = user.user_metadata || {};
    const cloudGemini = (meta.gemini_key as string) || '';
    const cloudGroq = (meta.groq_key as string) || '';
    const cloudProvider = (meta.preferred_provider as AIProviderType) || '';

    const localGemini = localStorage.getItem('cls_gemini_key') || '';
    const localGroq = localStorage.getItem('cls_groq_key') || '';
    const localProvider = (localStorage.getItem('cls_provider') as AIProviderType) || 'gemini';

    // 若雲端已有 Key，優先拉取雲端；若雲端沒有但本地有，則以本地為主
    const finalGemini = cloudGemini || localGemini;
    const finalGroq = cloudGroq || localGroq;
    const finalProvider = cloudProvider || localProvider;

    if (finalGemini) {
      localStorage.setItem('cls_gemini_key', finalGemini);
    }
    if (finalGroq) {
      localStorage.setItem('cls_groq_key', finalGroq);
    }
    if (finalProvider) {
      localStorage.setItem('cls_provider', finalProvider);
    }

    setSavedKeys({ gemini: finalGemini, groq: finalGroq });
    setAiConfig((prev) => {
      const activeProvider = finalProvider || prev.provider;
      const activeKey =
        activeProvider === 'gemini'
          ? finalGemini
          : activeProvider === 'groq'
          ? finalGroq
          : '';
      return {
        ...prev,
        provider: activeProvider,
        apiKey: activeKey || prev.apiKey,
      };
    });

    // 若本地有 Key 但雲端尚未備份，自動同步備份到 Supabase 帳號 metadata
    if (
      supabase &&
      ((!cloudGemini && localGemini) ||
        (!cloudGroq && localGroq) ||
        (!cloudProvider && localProvider))
    ) {
      try {
        await supabase.auth.updateUser({
          data: {
            gemini_key: finalGemini,
            groq_key: finalGroq,
            preferred_provider: finalProvider,
          },
        });
      } catch {}
    }
  }, []);

  // 初始化載入預設詩歌、儲存的專案列表與 API Keys，並監聽 Supabase 登入狀態
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }

    const initialLines = buildLyricLinesFromPatternsAndTexts(
      PRESET_SONGS[0].patternText.split('\n'),
      PRESET_SONGS[0].sampleTexts
    );
    setLines(initialLines);
    setHistory([initialLines]);
    setHistoryIndex(0);

    try {
      const savedGemini = localStorage.getItem('cls_gemini_key') || '';
      const savedGroq = localStorage.getItem('cls_groq_key') || '';
      const savedProvider = (localStorage.getItem('cls_provider') as AIProviderType) || 'gemini';
      const savedOllamaUrl = localStorage.getItem('cls_ollama_url') || 'http://localhost:11434';
      setSavedKeys({ gemini: savedGemini, groq: savedGroq });
      setAiConfig((prev) => ({
        ...prev,
        provider: savedProvider,
        model: DEFAULT_MODELS[savedProvider]?.[0]?.id || prev.model,
        apiKey: savedProvider === 'gemini' ? savedGemini : savedProvider === 'groq' ? savedGroq : '',
        ollamaBaseUrl: savedOllamaUrl,
      }));

      const rawProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (rawProjects) {
        const parsed = JSON.parse(rawProjects) as SavedProject[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedProjects(parsed);
        }
      }
    } catch {}

    // 監聽 Supabase 登入與會話狀態
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setCurrentUser(session.user);
          syncCloudApiKeys(session.user);
          fetchUserProfile(session.user).then(setUserProfile);
          setIsCloudLoading(true);
          fetchCloudProjects(session.user.id)
            .then(setCloudProjects)
            .finally(() => setIsCloudLoading(false));
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          syncCloudApiKeys(session.user);
          const prof = await fetchUserProfile(session.user);
          setUserProfile(prof);
          setIsCloudLoading(true);
          const cProjs = await fetchCloudProjects(session.user.id);
          setCloudProjects(cProjs);
          setIsCloudLoading(false);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setCloudProjects([]);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [syncCloudApiKeys]);

  // 登入 / 註冊 提交處理
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setAuthError('Supabase 尚未配置，請檢查環境變數。');
      return;
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('請填寫 Email 與密碼');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);

    try {
      if (authMode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        if (data.user) {
          await syncCloudApiKeys(data.user);
        }
        setShowAuthModal(false);
        setAuthPassword('');
        showToast('登入成功！已連線 Supabase 雲端跨裝置同步並載入 AI 設定');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        if (data.session && data.user) {
          await syncCloudApiKeys(data.user);
          setShowAuthModal(false);
          setAuthPassword('');
          showToast('註冊並登入成功！已連線 Supabase 雲端同步並備份 AI 設定');
        } else {
          setAuthSuccessMsg('註冊成功！若有啟用信箱驗證，請至 Email 收信開通。');
        }
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : '登入或註冊失敗');
    } finally {
      setAuthLoading(false);
    }
  };

  // 登出帳號
  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setUserProfile(null);
      setCloudProjects([]);
      setProjectModalTab('local');
      showToast('已登出帳號');
    }
  };

  // Google 一鍵登入 (傳統 OAuth 跳轉備用方案)
  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    try {
      const redirectTarget = typeof window !== 'undefined' ? window.location.origin : undefined;
      console.log('[Auth] Initiating Google OAuth with redirectTo:', redirectTarget);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTarget,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google 登入失敗');
    }
  };

  // Google 原生 ID Token 登入回調 (Google Identity Services / One Tap)
  const handleGoogleCredentialResponse = useCallback(
    async (credential: string) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const data = await signInWithGoogleIdToken(credential);
        if (data.user) {
          await syncCloudApiKeys(data.user);
        }
        setShowAuthModal(false);
        showToast('Google 原生 One Tap 登入成功！');
      } catch (err: unknown) {
        setAuthError(err instanceof Error ? err.message : 'Google 原生登入失敗');
      } finally {
        setAuthLoading(false);
      }
    },
    [syncCloudApiKeys, showToast]
  );

  // 初始化 Google Identity Services (GIS) 與觸發 One Tap
  useEffect(() => {
    const cid = getGoogleClientId();
    setGoogleClientId(cid);

    if (currentUser || !cid) return;

    let timer: NodeJS.Timeout | null = null;
    const tryInit = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        const ok = initializeGoogleIdentity(handleGoogleCredentialResponse, (err) => {
          console.warn('GSI 初始化提示:', err);
        });
        if (ok) {
          setIsGsiReady(true);
          // 畫面載入稍後觸發 One Tap 浮動提示
          setTimeout(() => {
            promptGoogleOneTap();
          }, 800);
        }
        return true;
      }
      return false;
    };

    if (!tryInit()) {
      timer = setInterval(() => {
        if (tryInit() && timer) {
          clearInterval(timer);
        }
      }, 500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentUser, googleClientId, handleGoogleCredentialResponse]);

  // 當登入彈窗打開且 GSI 就緒時，渲染原生 Google 按鈕
  useEffect(() => {
    if (showAuthModal && isGsiReady) {
      const t = setTimeout(() => {
        renderGoogleNativeButton('gsi-native-button-container');
      }, 150);
      return () => clearTimeout(t);
    }
  }, [showAuthModal, isGsiReady]);

  // 儲存專案至 LocalStorage
  const persistProjectsToStorage = useCallback((projList: SavedProject[]) => {
    setSavedProjects(projList);
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projList));
    } catch {}
  }, []);

  // 儲存當前專案（已登入時自動雙向儲存至 Supabase 雲端與本機 LocalStorage）
  const handleSaveCurrentProject = useCallback(
    (silent = false) => {
      const now = new Date().toLocaleString('zh-HK', { hour12: false });
      const proj: SavedProject = {
        id: currentProjectId,
        title: title.trim() || '無題詩歌',
        meaning,
        patternText,
        lines,
        updatedAt: now,
      };

      // 1. 本地 LocalStorage 備份儲存
      setSavedProjects((prev) => {
        const exists = prev.some((p) => p.id === proj.id);
        const next = exists
          ? prev.map((p) => (p.id === proj.id ? proj : p))
          : [proj, ...prev];
        try {
          localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });

      // 2. 若用戶已登入，同步儲存至 Supabase 雲端資料庫
      if (currentUser) {
        saveCloudProject(currentUser.id, proj).then((res) => {
          if (res.success) {
            fetchCloudProjects(currentUser.id).then(setCloudProjects);
            if (!silent) {
              showToast(`已儲存專案「${proj.title}」並同步至 Supabase 雲端！`);
            }
          } else {
            if (!silent) {
              showToast(`已儲存至本機（雲端同步失敗: ${res.error}）`);
            }
          }
        });
      } else if (!silent) {
        showToast(`已儲存專案「${proj.title}」至本機（登入可啟用跨裝置雲端同步）`);
      }
    },
    [currentProjectId, title, meaning, patternText, lines, currentUser, showToast]
  );

  // 建立新專案 (New Project)
  const handleCreateNewProject = (autoGenerateLexicon = false) => {
    const newId = `proj-${Date.now()}`;
    const cleanTitle = newProjForm.title.trim() || '新詩歌專案';
    const cleanMeaning =
      newProjForm.meaning.trim() ||
      '以「我」與「祢（主）」對話，表達對主恩典的感謝與信靠。';
    const cleanPattern = newProjForm.patternText.trim() || '2342 433\n2442 0222';

    const rawPatternLines = cleanPattern
      .split(/\r?\n/)
      .map((l) => normalizeTonePatternLine(l))
      .filter(Boolean);

    const usedWords = new Set<string>();
    const initialTexts: string[][] | undefined = autoGenerateLexicon
      ? rawPatternLines.map((linePat) =>
          linePat
            .split(' ')
            .filter(Boolean)
            .map((gPat) => {
              const cands = getVerifiedCandidatesForGroupPattern(gPat, 20, true);
              const pick = cands.find((c) => !usedWords.has(c)) || cands[0] || '';
              if (pick) usedWords.add(pick);
              return pick;
            })
        )
      : undefined;

    const builtLines = buildLyricLinesFromPatternsAndTexts(
      rawPatternLines,
      initialTexts
    );

    setCurrentProjectId(newId);
    setTitle(cleanTitle);
    setMeaning(cleanMeaning);
    setPatternText(cleanPattern);
    setLines(builtLines);
    setHistory([builtLines]);
    setHistoryIndex(0);
    setSelectedRef(null);
    setShowNewProjectModal(false);

    // 同步存入專案庫
    const now = new Date().toLocaleString('zh-HK', { hour12: false });
    const newProj: SavedProject = {
      id: newId,
      title: cleanTitle,
      meaning: cleanMeaning,
      patternText: cleanPattern,
      lines: builtLines,
      updatedAt: now,
    };
    persistProjectsToStorage([newProj, ...savedProjects]);
    showToast(`已建立新專案「${cleanTitle}」`);
  };

  // 讀取已儲存專案 (Load Project)
  const handleLoadSavedProject = (proj: SavedProject) => {
    setCurrentProjectId(proj.id);
    setTitle(proj.title);
    setMeaning(proj.meaning);
    setPatternText(proj.patternText);
    setLines(proj.lines);
    setHistory([proj.lines]);
    setHistoryIndex(0);
    setSelectedRef(null);
    setShowProjectModal(false);
    showToast(`已讀取專案「${proj.title}」`);
  };

  // 刪除專案
  const handleDeleteSavedProject = (id: string) => {
    const next = savedProjects.filter((p) => p.id !== id);
    persistProjectsToStorage(next);
    showToast('已刪除專案');
  };

  // 匯出當前專案為 .json 檔案
  const handleExportProjectFile = () => {
    const now = new Date().toLocaleString('zh-HK', { hour12: false });
    const proj: SavedProject = {
      id: currentProjectId,
      title: title.trim() || '無題詩歌',
      meaning,
      patternText,
      lines,
      updatedAt: now,
    };
    const blob = new Blob([JSON.stringify(proj, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.title.replace(/[\\/:*?"<>|]/g, '_')}_0243專案.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已匯出專案檔案 (.json)');
  };

  // 從電腦讀取 .json 專案檔
  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SavedProject;
        if (!parsed || !Array.isArray(parsed.lines)) {
          throw new Error('無效的專案檔格式');
        }
        const importedProj: SavedProject = {
          id: parsed.id || `proj-${Date.now()}`,
          title: parsed.title || '匯入的詩歌',
          meaning: parsed.meaning || '',
          patternText: parsed.patternText || '',
          lines: parsed.lines,
          updatedAt: new Date().toLocaleString('zh-HK', { hour12: false }),
        };
        handleLoadSavedProject(importedProj);
        persistProjectsToStorage([
          importedProj,
          ...savedProjects.filter((p) => p.id !== importedProj.id),
        ]);
      } catch {
        setErrorBanner('無法讀取該檔案，請確認是否為有效的 .json 專案檔。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 刷新本地詞庫建議詞（支援隨機換一批，並智能保留 🟢 locked 鎖定字元）
  const refreshLocalAlternatives = useCallback(
    (lineIdx: number, groupIdx: number, randomize = false) => {
      const line = lines[lineIdx];
      const group = line?.groups?.[groupIdx];
      if (!group) return;

      const currentText = group.tokens.map((t) => t.char).join('');
      const targetPat = group.targetGroupPattern;

      // 智能調用支援鎖定約束的詞庫檢索
      const localVerified = getCandidatesWithLockedConstraints(
        group.tokens,
        28,
        randomize,
        `${title} ${meaning}`
      )
        .filter((w) => w !== currentText)
        .slice(0, 10);

      const hasLocked = group.tokens.some((t) => t.status === 'locked' && t.char && t.char !== '＿');

      const instantCands: AlternativeCandidate[] = localVerified.map((word, i) => {
        const check = verifyPhraseAgainstPattern(word, targetPat);
        return {
          id: `local-${Date.now()}-${i}-${word}`,
          text: word,
          targetPattern: targetPat,
          actualPattern: check.actualPattern,
          isExactToneMatch: check.isExactMatch,
          jyutpingList: check.jyutpingList,
          toneAnalysis: hasLocked
            ? '📚 保留鎖定字・智能推薦未鎖定部分'
            : '📚 本地／CantonHymn 0243 協音詞庫',
          vocalErgonomics: check.endErgonomics.note,
          ergonomicsRating: check.endErgonomics.rating,
        };
      });

      setAlternatives(instantCands);
    },
    [lines, title, meaning]
  );

  useEffect(() => {
    if (!selectedRef) return;
    setAiAlternatives([]);
    refreshLocalAlternatives(selectedRef.lineIdx, selectedRef.groupIdx, false);
  }, [selectedRef?.lineIdx, selectedRef?.groupIdx, refreshLocalAlternatives]);

  // 當開啟 0243 速查與 CantonHymn 詞庫視窗時，自動載入 cantonhymn.net 參考詞彙
  useEffect(() => {
    if (!showToneGuideModal || cantonHymnData.phrases.length > 0 || cantonHymnData.loading) {
      return;
    }
    setCantonHymnData((prev) => ({ ...prev, loading: true }));
    fetch('/api/cantonhymn')
      .then((r) => r.json())
      .then((data) => {
        setCantonHymnData({
          loading: false,
          liveConnected: Boolean(data.liveConnected),
          phrases: Array.isArray(data.phrases) ? data.phrases : [],
          songs: Array.isArray(data.songs) ? data.songs : [],
        });
      })
      .catch(() => {
        setCantonHymnData((prev) => ({ ...prev, loading: false }));
      });
  }, [showToneGuideModal, cantonHymnData.phrases.length, cantonHymnData.loading]);

  // 檢查 Groq 帳號可用模型
  const checkGroqModels = useCallback(async (apiKey: string) => {
    if (!apiKey.trim()) return;
    setGroqStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/groq-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (data.connected && data.models?.length > 0) {
        setGroqStatus({ checking: false, connected: true, models: data.models });
        setAiConfig((prev) => {
          if (data.models.some((m: { id: string }) => m.id === prev.model)) {
            return prev;
          }
          const preferred =
            data.models.find((m: { id: string }) => m.id.includes('llama-3.3-70b')) ||
            data.models.find((m: { id: string }) => m.id.includes('deepseek-r1')) ||
            data.models[0];
          return {
            ...prev,
            model: preferred.id,
          };
        });
      } else {
        setGroqStatus({
          checking: false,
          connected: false,
          models: DEFAULT_MODELS.groq,
        });
      }
    } catch {
      setGroqStatus({
        checking: false,
        connected: false,
        models: DEFAULT_MODELS.groq,
      });
    }
  }, []);

  // 檢查 Gemini 帳號可用模型（檢測是否支援 2.5 / 3.0 / 3.8 等模型）
  const checkGeminiModels = useCallback(async (apiKey: string) => {
    if (!apiKey.trim()) return;
    setGeminiStatus((prev) => ({ ...prev, checking: true, message: undefined }));
    try {
      const res = await fetch('/api/gemini-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (data.connected && data.models?.length > 0) {
        setGeminiStatus({
          checking: false,
          connected: true,
          models: data.models,
          message: `已成功讀取 ${data.models.length} 個可用 Gemini 模型`,
        });
        setAiConfig((prev) => ({
          ...prev,
          model: data.models.some((m: { id: string }) => m.id === prev.model)
            ? prev.model
            : data.models[0].id,
        }));
      } else {
        setGeminiStatus({
          checking: false,
          connected: false,
          models: DEFAULT_MODELS.gemini,
          message: data.message || '無法讀取模型列表，請確認 API Key 是否正確',
        });
      }
    } catch {
      setGeminiStatus({
        checking: false,
        connected: false,
        models: DEFAULT_MODELS.gemini,
        message: '連線失敗，請檢查網路或 API Key',
      });
    }
  }, []);

  // 檢查本地 Ollama
  const checkOllamaConnection = useCallback(async (baseUrl: string) => {
    setOllamaStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/ollama-models?baseUrl=${encodeURIComponent(baseUrl)}`);
      const data = await res.json();
      if (data.connected) {
        const models = data.models?.length > 0 ? data.models : DEFAULT_MODELS.ollama;
        setOllamaStatus({ checking: false, connected: true, models });
        setAiConfig((prev) => ({ ...prev, model: models[0]?.id || prev.model }));
      } else {
        setOllamaStatus({ checking: false, connected: false, models: DEFAULT_MODELS.ollama });
      }
    } catch {
      setOllamaStatus({ checking: false, connected: false, models: DEFAULT_MODELS.ollama });
    }
  }, []);

  useEffect(() => {
    if (showSettingsModal && aiConfig.provider === 'ollama') {
      checkOllamaConnection(aiConfig.ollamaBaseUrl || 'http://localhost:11434');
    }
    if (showSettingsModal && aiConfig.provider === 'groq' && aiConfig.apiKey) {
      checkGroqModels(aiConfig.apiKey);
    }
    if (showSettingsModal && aiConfig.provider === 'gemini' && aiConfig.apiKey) {
      checkGeminiModels(aiConfig.apiKey);
    }
  }, [
    showSettingsModal,
    aiConfig.provider,
    aiConfig.ollamaBaseUrl,
    aiConfig.apiKey,
    checkOllamaConnection,
    checkGroqModels,
    checkGeminiModels,
  ]);

  // 記錄歷史並自動保存
  const commitLinesUpdate = useCallback(
    (newLines: LyricLine[]) => {
      setLines(newLines);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced.slice(-24), newLines];
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 24));
    },
    [historyIndex]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setLines(history[nextIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setLines(history[nextIdx]);
    }
  };

  // 切換 AI 供應商
  const handleProviderChange = (provider: AIProviderType) => {
    const nextModel =
      provider === 'ollama' && ollamaStatus.models.length > 0
        ? ollamaStatus.models[0].id
        : provider === 'gemini' && geminiStatus.models.length > 0
        ? geminiStatus.models[0].id
        : provider === 'groq' && groqStatus.models.length > 0
        ? groqStatus.models[0].id
        : DEFAULT_MODELS[provider][0].id;
    const nextKey =
      provider === 'gemini' ? savedKeys.gemini : provider === 'groq' ? savedKeys.groq : '';

    setAiConfig((prev) => ({ ...prev, provider, model: nextModel, apiKey: nextKey }));
    try {
      localStorage.setItem('cls_provider', provider);
    } catch {}

    if (supabase && currentUser) {
      supabase.auth.updateUser({ data: { preferred_provider: provider } }).catch(() => {});
    }
  };

  const handleApiKeyChange = (val: string) => {
    setAiConfig((prev) => ({ ...prev, apiKey: val }));
    const provider = aiConfig.provider;

    if (provider === 'gemini') {
      setSavedKeys((prev) => ({ ...prev, gemini: val }));
      try {
        localStorage.setItem('cls_gemini_key', val);
      } catch {}
    } else if (provider === 'groq') {
      setSavedKeys((prev) => ({ ...prev, groq: val }));
      try {
        localStorage.setItem('cls_groq_key', val);
      } catch {}
    }

    // 若已登入，即時自動同步到 Supabase 帳號 metadata
    if (supabase && currentUser) {
      const field = provider === 'gemini' ? 'gemini_key' : 'groq_key';
      supabase.auth.updateUser({ data: { [field]: val } }).catch(() => {});
    }
  };

  // 載入範例
  const handleLoadPreset = (preset: PresetSong) => {
    setCurrentProjectId(`proj-${preset.id}`);
    setTitle(preset.title);
    setMeaning(preset.meaning);
    setPatternText(preset.patternText);
    const built = buildLyricLinesFromPatternsAndTexts(
      preset.patternText.split('\n'),
      preset.sampleTexts
    );
    commitLinesUpdate(built);
    setSelectedRef(null);
    setErrorBanner(null);
    showToast(`已載入「${preset.title}」`);
  };

  // 離線本地詞庫秒速生成（加入反單調過濾，平衡自然意象與「我／祢」）
  const handleLocalLexiconGenerate = () => {
    setErrorBanner(null);
    const rawPatternLines = patternText
      .split(/\r?\n/)
      .map((l) => normalizeTonePatternLine(l))
      .filter(Boolean);

    if (rawPatternLines.length === 0) {
      setErrorBanner('請至少輸入一行 0243 數字譜（如：2342 433）');
      return;
    }

    const usedWords = new Set<string>();
    let titleCount = 0; // 控制「主、神」出現次數，避免單調

    const generatedTexts: string[][] = rawPatternLines.map((linePat, lIdx) => {
      const groupPats = linePat.split(' ').filter(Boolean);
      const lineChosen: string[] = [];

      return groupPats.map((gPat, gIdx) => {
        const existingGroup = lines[lIdx]?.groups?.[gIdx];
        if (
          existingGroup &&
          existingGroup.tokens.length === gPat.length &&
          existingGroup.tokens.every((t) => t.status === 'locked')
        ) {
          const lockedStr = existingGroup.tokens.map((t) => t.char).join('');
          lineChosen.push(lockedStr);
          return lockedStr;
        }

        const cands = getVerifiedCandidatesForGroupPattern(
          gPat,
          36,
          true,
          `${title} ${meaning}`
        );
        const prevInLine = lineChosen[lineChosen.length - 1] || '';

        const pick =
          cands.find((c) => {
            if (usedWords.has(c)) return false;
            // 避免同一行內重複開頭字或重複「我/祢」過密
            if (prevInLine && prevInLine[0] === c[0]) return false;
            const hasTitle = /[主神]/.test(c);
            if (hasTitle && titleCount >= 2) return false;
            if (prevInLine && /[主神]/.test(prevInLine) && hasTitle) return false;
            return true;
          }) ||
          cands.find((c) => !usedWords.has(c)) ||
          cands[0] ||
          '';

        if (pick) {
          usedWords.add(pick);
          if (/[主神]/.test(pick)) titleCount++;
          lineChosen.push(pick);
        }
        return pick;
      });
    });

    const newLines = buildLyricLinesFromPatternsAndTexts(
      rawPatternLines,
      generatedTexts,
      lines
    );
    commitLinesUpdate(newLines);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    showToast('已依歌曲主題與 CantonHymn 協音詞庫完成 100% 啱音組詞');
  };

  // AI 生成歌詞
  const handleAIGenerateLyrics = async () => {
    setErrorBanner(null);
    setIsGeneratingLyrics(true);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    try {
      const res = await fetch('/api/generate-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          meaning,
          patternText,
          existingLines: lines,
          aiConfig,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        if (
          res.status === 504 ||
          text.includes('FUNCTION_INVOCATION_TIMEOUT') ||
          text.includes('Gateway Timeout')
        ) {
          throw new Error(
            'AI 生成超時 (504 Timeout)。請稍後重試，或可在設定中將模型切換為極速模型（如 Gemini 2.5 Flash 或 Groq Llama 3.3）'
          );
        }
        throw new Error(`伺服器回應異常 (${res.status})，請確認網路或 API Key 設定`);
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'AI 生成失敗');
      }
      commitLinesUpdate(data.lines);
      let toastMsg = `AI 主題生成完成（協音準確率 ${data.stats?.finalAccuracy ?? 100}%）`;
      if (data.stats?.repeatedWordWarnings && data.stats.repeatedWordWarnings.length > 0) {
        toastMsg += `；提示：${data.stats.repeatedWordWarnings.join('、')} 出現超過 3 次`;
      }
      showToast(toastMsg);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : '生成歌詞時發生錯誤');
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  // 設定狀態（支援單字或整組）
  const handleSetStatus = (
    lineIdx: number,
    groupIdx: number,
    status: TokenStatus,
    tokenIdx?: number
  ) => {
    const nextLines: LyricLine[] = lines.map((line, lIdx) => {
      if (lIdx !== lineIdx) return line;
      return {
        ...line,
        groups: line.groups.map((group, gIdx) => {
          if (gIdx !== groupIdx) return group;
          return {
            ...group,
            tokens: group.tokens.map((tok, tIdx): LyricToken => {
              if (tokenIdx !== undefined && tIdx !== tokenIdx) return tok;
              if (status === 'normal' && tok.actualTone !== tok.expectedTone) {
                return { ...tok, status: 'tone_mismatch' };
              }
              return { ...tok, status };
            }),
          };
        }),
      };
    });
    commitLinesUpdate(nextLines);
    setTimeout(() => {
      refreshLocalAlternatives(lineIdx, groupIdx, false);
    }, 10);
  };

  // 儲存手動改字
  const handleCommitInlineEdit = () => {
    if (!editingGroupRef) return;
    const { lineIdx, groupIdx, tokenIdx, value } = editingGroupRef;
    const cleanChars = Array.from(value.replace(/\s+/g, ''));

    if (cleanChars.length === 0) {
      setEditingGroupRef(null);
      return;
    }

    const nextLines = lines.map((line, lIdx) => {
      if (lIdx !== lineIdx) return line;
      return {
        ...line,
        groups: line.groups.map((group, gIdx) => {
          if (gIdx !== groupIdx) return group;

          if (tokenIdx !== undefined && cleanChars.length === 1) {
            return {
              ...group,
              tokens: group.tokens.map((tok, tIdx) =>
                tIdx === tokenIdx
                  ? analyzeCharToken(
                      cleanChars[0],
                      tok.expectedTone,
                      tIdx === group.tokens.length - 1,
                      tok.id
                    )
                  : tok
              ),
            };
          }

          return {
            ...group,
            tokens: group.tokens.map((tok, tIdx) => {
              const newChar = cleanChars[tIdx] || tok.char;
              return analyzeCharToken(
                newChar,
                tok.expectedTone,
                tIdx === group.tokens.length - 1,
                tok.id
              );
            }),
          };
        }),
      };
    });

    commitLinesUpdate(nextLines);
    setEditingGroupRef(null);
    showToast('已更新字詞並重算 0243 聲調');
  };

  // 呼叫 AI 產生局部替換詞（獨立儲存於 aiAlternatives，不會被「詞庫換一批」覆蓋）
  const handleRequestAIAlternatives = async (
    targetLineIdx: number,
    targetGroupIdx: number
  ) => {
    const line = lines[targetLineIdx];
    const group = line?.groups?.[targetGroupIdx];
    if (!line || !group) return;

    setErrorBanner(null);
    setIsSuggesting(true);

    const fullLyricsContext = lines
      .map(
        (l, idx) =>
          `第${idx + 1}行 (${l.targetPattern}): ${l.groups
            .map((g) => g.tokens.map((t) => t.char).join(''))
            .join(' ')}`
      )
      .join('\n');

    const lineText = line.groups
      .map((g) => g.tokens.map((t) => t.char).join(''))
      .join(' ');
    const currentGroupText = group.tokens.map((t) => t.char).join('');

    try {
      const res = await fetch('/api/suggest-alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          meaning,
          fullLyricsContext,
          linePattern: line.targetPattern,
          lineText,
          targetGroupPattern: group.targetGroupPattern,
          currentGroupText,
          groupTokens: group.tokens,
          userInstruction: customInstruction.trim(),
          aiConfig,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        if (
          res.status === 504 ||
          text.includes('FUNCTION_INVOCATION_TIMEOUT') ||
          text.includes('Gateway Timeout')
        ) {
          throw new Error('AI 建議請求超時 (504 Timeout)，請稍後重試或更換極速模型');
        }
        throw new Error(`伺服器回應異常 (${res.status})`);
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || '無法取得替換建議');
      }
      setAiAlternatives(data.candidates || []);
      showToast('已由 AI 根據歌曲主題產生專屬候選詞');
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : '取得替換建議時發生錯誤');
    } finally {
      setIsSuggesting(false);
    }
  };

  // 一鍵套用候選詞（支援整組、部分鎖定補位與單字替換）
  const handleApplyCandidate = (
    lineIdx: number,
    groupIdx: number,
    candidateText: string,
    autoLock = true
  ) => {
    const chars = Array.from(candidateText);
    const nextLines = lines.map((line, lIdx) => {
      if (lIdx !== lineIdx) return line;
      return {
        ...line,
        groups: line.groups.map((group, gIdx) => {
          if (gIdx !== groupIdx) return group;

          // 情況 1：單字模式 (applyScope === 'token') 且候選字是 1 個字
          if (applyScope === 'token' && selectedRef?.tokenIdx !== undefined && chars.length === 1) {
            return {
              ...group,
              tokens: group.tokens.map((tok, tIdx) => {
                if (tIdx !== selectedRef.tokenIdx) return tok;
                const analyzed = analyzeCharToken(
                  chars[0],
                  tok.expectedTone,
                  tIdx === group.tokens.length - 1,
                  tok.id
                );
                if (autoLock && analyzed.actualTone === analyzed.expectedTone) {
                  analyzed.status = 'locked';
                }
                return analyzed;
              }),
            };
          }

          // 情況 2：候選詞長度剛好等於「未鎖定」的字數（例如 02 鎖定，點選了候選詞 34「得勝」）
          const unlockedIndices = group.tokens
            .map((t, idx) => (t.status !== 'locked' ? idx : -1))
            .filter((idx) => idx !== -1);

          if (chars.length === unlockedIndices.length && unlockedIndices.length < group.tokens.length) {
            const newChars = group.tokens.map((t) => t.char);
            unlockedIndices.forEach((uIdx, i) => {
              newChars[uIdx] = chars[i];
            });
            return {
              ...group,
              tokens: group.tokens.map((tok, tIdx) => {
                const wasLocked = tok.status === 'locked';
                const analyzed = analyzeCharToken(
                  newChars[tIdx],
                  tok.expectedTone,
                  tIdx === group.tokens.length - 1,
                  tok.id,
                  wasLocked ? 'locked' : undefined
                );
                if (wasLocked) {
                  analyzed.status = 'locked';
                } else if (autoLock && analyzed.actualTone === analyzed.expectedTone) {
                  analyzed.status = 'locked';
                }
                return analyzed;
              }),
            };
          }

          // 情況 3：整組替換（嚴格保留原本已鎖定位置的鎖定狀態）
          return {
            ...group,
            tokens: group.tokens.map((tok, tIdx) => {
              const newChar = chars[tIdx] || tok.char;
              const wasLocked = tok.status === 'locked';
              const analyzed = analyzeCharToken(
                newChar,
                tok.expectedTone,
                tIdx === group.tokens.length - 1,
                tok.id,
                wasLocked ? 'locked' : undefined
              );
              if (wasLocked) {
                analyzed.status = 'locked';
              } else if (autoLock && analyzed.actualTone === analyzed.expectedTone) {
                analyzed.status = 'locked';
              }
              return analyzed;
            }),
          };
        }),
      };
    });

    commitLinesUpdate(nextLines);
    setTimeout(() => {
      refreshLocalAlternatives(lineIdx, groupIdx, false);
    }, 10);
    showToast(`已替換為「${candidateText}」`);
  };

  // 統計全曲協音指標
  const projectMetrics = useMemo(() => {
    let total = 0;
    let matched = 0;
    let lockedCount = 0;
    let needsChangeCount = 0;
    let mismatchCount = 0;

    lines.forEach((l) =>
      l.groups.forEach((g) =>
        g.tokens.forEach((t) => {
          total++;
          if (t.actualTone === t.expectedTone) matched++;
          if (t.status === 'locked') lockedCount++;
          if (t.status === 'needs_change') needsChangeCount++;
          if (t.status === 'tone_mismatch' || t.actualTone !== t.expectedTone)
            mismatchCount++;
        })
      )
    );

    const accuracy = total > 0 ? Math.round((matched / total) * 100) : 100;
    return { total, matched, accuracy, lockedCount, needsChangeCount, mismatchCount };
  }, [lines]);

  // 複製歌詞
  const handleCopyLyrics = (includeAnnotations: boolean) => {
    const outputLines = lines.map((line, idx) => {
      const lyricStr = line.groups
        .map((g) => g.tokens.map((t) => t.char).join(''))
        .join('　');
      if (!includeAnnotations) return lyricStr;
      const jyutpingStr = line.groups
        .map((g) => g.tokens.map((t) => t.jyutping || '?').join(' '))
        .join(' ｜ ');
      return `${idx + 1}. ${lyricStr}\n   [${line.targetPattern}] ${jyutpingStr}`;
    });

    const header = `《${title}》\n${meaning}\n\n`;
    navigator.clipboard.writeText(header + outputLines.join('\n\n'));
    showToast(includeAnnotations ? '已複製歌詞與粵拼對照' : '已複製純文字歌詞');
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/60 text-zinc-900">
      {/* 隱藏的檔案匯入 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportProjectFile}
        className="hidden"
      />

      {/* 輕量 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 極簡純白頂部導航列（支援手機響應式橫滑與自適應緊湊佈局） */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-zinc-200 px-2.5 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-600 transition"
            title={sidebarOpen ? '收合左側輸入欄' : '展開左側輸入欄'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
              <Music className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-900 hidden md:inline">
              Cantonese Lyric Studio
            </span>
          </div>

          <div className="h-4 w-px bg-zinc-200 mx-0.5 sm:mx-1" />

          {/* 專案管理快捷按鈕：新專案 / 讀取專案 / 儲存 */}
          <button
            onClick={() => {
              setNewProjForm({
                title: '',
                meaning: '',
                patternText: '2342 433\n2442 0222',
              });
              setShowNewProjectModal(true);
            }}
            className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 text-xs font-medium flex items-center gap-1 shrink-0 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">新專案</span>
          </button>

          <button
            onClick={() => setShowProjectModal(true)}
            className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 text-xs font-medium flex items-center gap-1 shrink-0 transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-600" />
            <span className="hidden md:inline">讀取專案</span>
            <span className="text-[11px] text-zinc-500">({savedProjects.length})</span>
          </button>

          <button
            onClick={() => handleSaveCurrentProject(false)}
            className="px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 text-zinc-700 text-xs font-medium flex items-center gap-1 shrink-0 transition"
            title="儲存目前專案進度"
          >
            <Save className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden sm:inline">儲存</span>
          </button>
        </div>

        {/* 右側精簡工具按鈕 */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setShowToneGuideModal(true)}
            className="px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition flex items-center gap-1 shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden lg:inline">0243 聲調表</span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 transition flex items-center gap-1.5 shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-600" />
            <span className="hidden sm:inline">模型：</span>
            <span>{aiConfig.provider.toUpperCase()}</span>
          </button>

          <div className="h-4 w-px bg-zinc-200 mx-0.5 hidden sm:block" />

          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 transition"
            title="復原"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 transition"
            title="重做"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleCopyLyrics(false)}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition flex items-center gap-1.5 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">複製歌詞</span>
          </button>

          <div className="h-4 w-px bg-zinc-200 mx-0.5" />

          {/* 👤 帳號登入與訂閱狀態按鈕 (Supabase Auth & Subscription Tier) */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200/80 rounded-xl px-2.5 py-1 transition border border-zinc-200/60 shrink-0">
              <div className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold">
                {currentUser.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col text-left leading-tight hidden md:flex">
                <span className="text-[11px] font-medium text-zinc-900 max-w-[110px] truncate">
                  {currentUser.email}
                </span>
                <span className="text-[9px] font-semibold flex items-center gap-0.5 text-emerald-700">
                  <Crown className="w-2.5 h-2.5 text-amber-500" />
                  {userProfile?.subscriptionTier === 'pro'
                    ? 'Pro 訂閱會員'
                    : userProfile?.subscriptionTier === 'church'
                    ? 'Church 敬拜隊'
                    : 'Free 免費版'}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                title="登出帳號"
                className="p-1 text-zinc-400 hover:text-rose-600 transition ml-0.5"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthError(null);
                setAuthSuccessMsg(null);
                setShowAuthModal(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs shrink-0 transition"
              title="登入 Supabase 帳號，支援跨電腦／手機雲端同步詩歌專案"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">登入 / 雲端同步</span>
              <span className="sm:hidden">登入</span>
            </button>
          )}
        </div>
      </header>

      {/* 錯誤訊息列 */}
      {errorBanner && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLocalLexiconGenerate}
              className="px-2.5 py-1 rounded-md bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-medium"
            >
              改用內建詞庫直接生成
            </button>
            <button onClick={() => setErrorBanner(null)}>
              <X className="w-4 h-4 text-rose-500" />
            </button>
          </div>
        </div>
      )}

      {/* 主內容區：可收合側欄 + 超寬敞歌詞畫布 */}
      <div className="flex-1 flex items-start max-w-[1600px] w-full mx-auto">
        {/* 左側輸入欄（支援桌面常駐與手機滑出式抽屜 Drawer） */}
        {sidebarOpen && (
          <>
            {/* 手機版半透明遮罩背景 */}
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
            />

            <aside className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-xs bg-white border-r border-zinc-200 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5 shadow-2xl lg:static lg:z-auto lg:shadow-none lg:w-80 lg:shrink-0 lg:min-h-[calc(100vh-3.5rem)] transition-all">
              {/* 手機版頂部標題與關閉按鈕 */}
              <div className="flex items-center justify-between lg:hidden pb-2.5 border-b border-zinc-100">
                <span className="font-semibold text-sm text-zinc-900 flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-zinc-700" />
                  歌曲設定與 0243 譜
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"
                  title="關閉側邊欄"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            {/* 範例快速選擇 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                示範範本
              </label>
              <div className="flex flex-col gap-1">
                {PRESET_SONGS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    className={`text-left px-3 py-2 rounded-lg text-xs transition ${
                      title === preset.title
                        ? 'bg-zinc-900 text-white font-medium'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-zinc-100" />

            {/* 歌名 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">歌曲名稱</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 transition"
              />
            </div>

            {/* 主題 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">
                主題／想表達的故事（建議寫入「我」與「祢」）
              </label>
              <textarea
                rows={3}
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="例如：感謝主在風浪中牽我手，我願一生深愛祢、跟隨祢..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs leading-relaxed text-zinc-800 focus:bg-white focus:outline-none focus:border-zinc-900 transition resize-none"
              />
            </div>

            {/* 0243 數字譜 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700">
                  0243 數字譜
                </label>
                <span className="text-[11px] text-zinc-400">空格＝呼吸斷詞</span>
              </div>
              <textarea
                rows={6}
                value={patternText}
                onChange={(e) => setPatternText(e.target.value)}
                placeholder={`4344 4343 3344\n4444 0422 2400`}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wider text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 transition leading-relaxed"
              />
              <p className="text-[11px] text-zinc-400">
                💡 小貼士：「我、你、祢」皆為 <strong className="text-zinc-700">4</strong> 聲（如 <code className="text-zinc-700">4344</code> = 我深愛祢）。
              </p>
            </div>

            {/* 生成按鈕 */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleAIGenerateLyrics}
                disabled={isGeneratingLyrics}
                className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                {isGeneratingLyrics ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 構思連貫句子中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 生成連貫歌詞</span>
                  </>
                )}
              </button>

              <button
                onClick={handleLocalLexiconGenerate}
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <span>用內建「我/祢」抒情詞庫填詞</span>
              </button>
            </div>
          </aside>
          </>
        )}

        {/* 中央超寬敞歌詞畫布（支援手機響應式邊距與觸控橫滑） */}
        <main
          className="flex-1 p-3.5 sm:p-8 lg:p-10 min-w-0"
          onClick={() => {
            setSelectedRef(null);
            setEditingGroupRef(null);
          }}
        >
          {/* 歌曲標題與極簡狀態列 */}
          <div className="max-w-5xl mx-auto mb-6 sm:mb-8 flex flex-wrap items-end justify-between gap-3 sm:gap-4 border-b border-zinc-200 pb-4 sm:pb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                {title || '無題詩歌'}
              </h1>
              <p className="text-xs text-zinc-500 mt-1 max-w-2xl">{meaning}</p>
            </div>

            {/* 簡潔清楚的色塊圖例 */}
            <div className="flex items-center gap-3 sm:gap-4 text-xs text-zinc-600 bg-white px-3 sm:px-3.5 py-2 rounded-xl border border-zinc-200 shadow-sm flex-wrap">
              <span className="font-semibold text-zinc-900">
                啱音率 {projectMetrics.accuracy}%
              </span>
              <span className="text-zinc-300">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                鎖定 ({projectMetrics.lockedCount})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                重寫 ({projectMetrics.needsChangeCount})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                唔啱音 ({projectMetrics.mismatchCount})
              </span>
            </div>
          </div>

          {/* 歌詞行列表 */}
          <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
            {lines.map((line, lIdx) => {
              const isLineActive = selectedRef?.lineIdx === lIdx;
              const activeGroup =
                isLineActive && selectedRef
                  ? line.groups[selectedRef.groupIdx]
                  : null;
              const activeToken =
                activeGroup && selectedRef
                  ? activeGroup.tokens[selectedRef.tokenIdx]
                  : null;

              return (
                <div
                  key={line.lineId}
                  onClick={(e) => e.stopPropagation()}
                  className={`bg-white rounded-2xl border transition p-3.5 sm:p-5 ${
                    isLineActive
                      ? 'border-zinc-400 shadow-md'
                      : 'border-zinc-200/90 shadow-sm hover:border-zinc-300'
                  }`}
                >
                  {/* 行號與極簡字詞橫排 */}
                  <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1">
                    <div className="w-6 sm:w-7 shrink-0 text-xs font-mono font-semibold text-zinc-400 select-none">
                      {String(lIdx + 1).padStart(2, '0')}
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-5 flex-nowrap">
                      {line.groups.map((group, gIdx) => {
                        const isGroupSelected =
                          selectedRef?.lineIdx === lIdx &&
                          selectedRef?.groupIdx === gIdx;

                        const isEditingThisGroup =
                          editingGroupRef?.lineIdx === lIdx &&
                          editingGroupRef?.groupIdx === gIdx;

                        return (
                          <div
                            key={group.groupId}
                            className={`flex items-center gap-1.5 p-1.5 rounded-xl transition ${
                              isGroupSelected
                                ? 'bg-zinc-100/90 ring-1 ring-zinc-300'
                                : 'hover:bg-zinc-50'
                            }`}
                          >
                            {isEditingThisGroup ? (
                              <div className="flex items-center gap-1.5 px-1 py-0.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingGroupRef.value}
                                  onChange={(e) =>
                                    setEditingGroupRef((prev) =>
                                      prev ? { ...prev, value: e.target.value } : null
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCommitInlineEdit();
                                    if (e.key === 'Escape') setEditingGroupRef(null);
                                  }}
                                  className="w-32 bg-white border border-zinc-900 rounded-lg px-2.5 py-1.5 text-lg font-semibold text-zinc-900 tracking-widest focus:outline-none"
                                />
                                <button
                                  onClick={handleCommitInlineEdit}
                                  className="p-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingGroupRef(null)}
                                  className="p-1.5 rounded-lg bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              group.tokens.map((token, tIdx) => {
                                const isTokenSelected =
                                  isGroupSelected && selectedRef?.tokenIdx === tIdx;
                                const isToneMatch =
                                  token.actualTone === token.expectedTone;

                                let cardStyle =
                                  'bg-white border-zinc-200 text-zinc-900 hover:border-zinc-400';
                                let toneStyle = 'text-zinc-400';

                                if (token.status === 'locked') {
                                  cardStyle =
                                    'bg-emerald-50/90 border-emerald-400 text-emerald-950';
                                  toneStyle = 'text-emerald-600 font-semibold';
                                } else if (token.status === 'needs_change') {
                                  cardStyle =
                                    'bg-rose-50/90 border-rose-400 text-rose-950';
                                  toneStyle = 'text-rose-600 font-semibold';
                                } else if (
                                  token.status === 'tone_mismatch' ||
                                  !isToneMatch
                                ) {
                                  cardStyle =
                                    'bg-amber-50/95 border-amber-400 text-amber-950';
                                  toneStyle = 'text-amber-700 font-bold';
                                }

                                return (
                                  <button
                                    key={token.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedRef({
                                        lineIdx: lIdx,
                                        groupIdx: gIdx,
                                        tokenIdx: tIdx,
                                      })
                                    }
                                    onDoubleClick={() =>
                                      setEditingGroupRef({
                                        lineIdx: lIdx,
                                        groupIdx: gIdx,
                                        value: group.tokens
                                          .map((t) => t.char)
                                          .join(''),
                                      })
                                    }
                                    className={`w-12 h-14 rounded-xl border flex flex-col items-center justify-center transition select-none shrink-0 ${cardStyle} ${
                                      isTokenSelected
                                        ? 'ring-2 ring-zinc-900 shadow-sm -translate-y-0.5'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-lg font-semibold leading-none">
                                      {token.char}
                                    </span>
                                    <span
                                      className={`text-[11px] font-mono mt-1.5 leading-none ${toneStyle}`}
                                    >
                                      {isToneMatch
                                        ? token.expectedTone
                                        : `${token.expectedTone}≠${token.actualTone}`}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ✨ 就地展開的互動工具列與替換詞面板 */}
                  {isLineActive && activeGroup && selectedRef && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 bg-zinc-50/90 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-zinc-900">
                            「{activeGroup.tokens.map((t) => t.char).join('')}」
                          </span>
                          <span className="text-xs font-mono text-zinc-500 bg-white px-2.5 py-1 rounded-md border border-zinc-200">
                            粵拼：
                            {activeGroup.tokens
                              .map((t) => `${t.char}(${t.jyutping || '?'})`)
                              .join(' ')}
                          </span>
                          {activeToken?.ergonomics && (
                            <span className="text-xs text-zinc-500 hidden md:inline">
                              · {activeToken.ergonomics.note}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex items-center bg-zinc-200/70 rounded-lg p-0.5 text-[11px] mr-1">
                            <button
                              onClick={() => setApplyScope('group')}
                              className={`px-2 py-1 rounded-md transition ${
                                applyScope === 'group'
                                  ? 'bg-white text-zinc-900 font-medium shadow-sm'
                                  : 'text-zinc-600'
                              }`}
                            >
                              整組詞
                            </button>
                            <button
                              onClick={() => setApplyScope('token')}
                              className={`px-2 py-1 rounded-md transition ${
                                applyScope === 'token'
                                  ? 'bg-white text-zinc-900 font-medium shadow-sm'
                                  : 'text-zinc-600'
                              }`}
                            >
                              單字「{activeToken?.char}」
                            </button>
                          </div>

                          <button
                            onClick={() =>
                              handleSetStatus(
                                lIdx,
                                selectedRef.groupIdx,
                                'locked',
                                applyScope === 'token' ? selectedRef.tokenIdx : undefined
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-1 transition"
                          >
                            <Lock className="w-3 h-3" />
                            <span>鎖定保留</span>
                          </button>

                          <button
                            onClick={() =>
                              handleSetStatus(
                                lIdx,
                                selectedRef.groupIdx,
                                'needs_change',
                                applyScope === 'token' ? selectedRef.tokenIdx : undefined
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-medium flex items-center gap-1 transition"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>要求重寫</span>
                          </button>

                          <button
                            onClick={() =>
                              handleSetStatus(
                                lIdx,
                                selectedRef.groupIdx,
                                'tone_mismatch',
                                applyScope === 'token' ? selectedRef.tokenIdx : undefined
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-medium flex items-center gap-1 transition"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>唔啱音</span>
                          </button>

                          <button
                            onClick={() =>
                              handleSetStatus(
                                lIdx,
                                selectedRef.groupIdx,
                                'normal',
                                applyScope === 'token' ? selectedRef.tokenIdx : undefined
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600 text-xs flex items-center gap-1 transition"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>還原</span>
                          </button>

                          <button
                            onClick={() =>
                              setEditingGroupRef({
                                lineIdx: lIdx,
                                groupIdx: selectedRef.groupIdx,
                                tokenIdx:
                                  applyScope === 'token'
                                    ? selectedRef.tokenIdx
                                    : undefined,
                                value:
                                  applyScope === 'token' && activeToken
                                    ? activeToken.char
                                    : activeGroup.tokens.map((t) => t.char).join(''),
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium flex items-center gap-1 transition"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>直接打字</span>
                          </button>

                          <button
                            onClick={() => setSelectedRef(null)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-700"
                            title="關閉工具列"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 第二排：清楚區分「✨ AI 主題造句候選」與「📚 本地／CantonHymn 詞庫候選」 */}
                      <div className="space-y-2.5 pt-2 border-t border-zinc-200/70">
                        {/* ✨ AI 主題造句專區（點擊「詞庫換一批」時絕對不會覆蓋此區！） */}
                        {(aiAlternatives.length > 0 || isSuggesting) && (
                          <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-indigo-950 flex items-center gap-1">
                              <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>✨ AI 根據主題故事造句（[{activeGroup.targetGroupPattern}]）：</span>
                            </span>
                            {isSuggesting ? (
                              <span className="text-xs text-indigo-600 animate-pulse">
                                AI 正在根據主題「{title}」與整句上下文構思中...
                              </span>
                            ) : (
                              aiAlternatives.map((cand) => {
                                const isDictFallback = cand.id.startsWith('cand-dict-');
                                return (
                                  <button
                                    key={cand.id}
                                    onClick={() =>
                                      handleApplyCandidate(
                                        lIdx,
                                        selectedRef.groupIdx,
                                        cand.text,
                                        true
                                      )
                                    }
                                    className="group px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100/80 border border-indigo-200 hover:border-indigo-400 transition flex items-center gap-2 shadow-xs"
                                    title={`${cand.toneAnalysis}｜${cand.vocalErgonomics}`}
                                  >
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                        isDictFallback
                                          ? 'bg-zinc-100 text-zinc-600'
                                          : 'bg-indigo-600 text-white'
                                      }`}
                                    >
                                      {isDictFallback ? '📚 詞庫補充' : '✨ AI'}
                                    </span>
                                    <span className="text-sm font-semibold text-zinc-900">
                                      {cand.text}
                                    </span>
                                    <span className="text-[11px] font-mono text-zinc-500">
                                      {cand.jyutpingList.join(' ')}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}

                        {/* 📚 本地／CantonHymn 協音詞庫專區 + 操作按鈕 */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {activeGroup.tokens.some(
                              (t) => t.status === 'locked' && t.char && t.char !== '＿'
                            ) ? (
                              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                <span>
                                  已保留鎖定字「
                                  {activeGroup.tokens
                                    .map((t) =>
                                      t.status === 'locked' && t.char && t.char !== '＿'
                                        ? t.char
                                        : '＿'
                                    )
                                    .join('')}
                                  」，智能推薦未鎖定音階：
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-zinc-500">
                                📚 本地／CantonHymn 詞庫 [{activeGroup.targetGroupPattern}]（非 AI）：
                              </span>
                            )}
                            {alternatives.length === 0 ? (
                              <span className="text-xs text-zinc-400">
                                請點擊右側「詞庫換一批」或「AI 換一批」
                              </span>
                            ) : (
                              alternatives.map((cand) => (
                                <button
                                  key={cand.id}
                                  onClick={() =>
                                    handleApplyCandidate(
                                      lIdx,
                                      selectedRef.groupIdx,
                                      cand.text,
                                      true
                                    )
                                  }
                                  className="group px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 border border-zinc-200 hover:border-emerald-400 transition flex items-center gap-2 shadow-sm"
                                  title={`${cand.toneAnalysis}｜${cand.vocalErgonomics}`}
                                >
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">
                                    詞庫
                                  </span>
                                  <span className="text-sm font-semibold text-zinc-900 group-hover:text-emerald-950">
                                    {cand.text}
                                  </span>
                                  <span className="text-[11px] font-mono text-zinc-400 group-hover:text-emerald-700">
                                    {cand.jyutpingList.join(' ')}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() =>
                                refreshLocalAlternatives(
                                  lIdx,
                                  selectedRef.groupIdx,
                                  true
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-medium flex items-center gap-1 transition shrink-0"
                              title="從本地與 CantonHymn 詞庫隨機換一批 100% 啱音詞（非 AI 生成，不會洗掉上方 AI 答案）"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>詞庫換一批</span>
                            </button>
                            <input
                              type="text"
                              value={customInstruction}
                              onChange={(e) => setCustomInstruction(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleRequestAIAlternatives(
                                    lIdx,
                                    selectedRef.groupIdx
                                  );
                                }
                              }}
                              placeholder="輸入方向（如：貼近掌權主題）"
                              className="w-44 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                            />
                            <button
                              onClick={() =>
                                handleRequestAIAlternatives(lIdx, selectedRef.groupIdx)
                              }
                              disabled={isSuggesting}
                              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition shrink-0"
                            >
                              <Wand2 className="w-3 h-3" />
                              <span>{isSuggesting ? 'AI 構思中...' : 'AI 換一批'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* ➕ 建立新專案 Modal (New Project) */}
      {showNewProjectModal && (
        <div
          onClick={() => setShowNewProjectModal(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-zinc-900" />
                <h3 className="font-semibold text-base text-zinc-900">
                  建立新詩歌專案
                </h3>
              </div>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="font-medium text-zinc-700">歌曲名稱</label>
                <input
                  type="text"
                  autoFocus
                  value={newProjForm.title}
                  onChange={(e) =>
                    setNewProjForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="例如：主我深愛祢"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-zinc-700">
                  歌曲主題／故事脈絡（可加入「我」「祢」情境）
                </label>
                <textarea
                  rows={3}
                  value={newProjForm.meaning}
                  onChange={(e) =>
                    setNewProjForm((prev) => ({ ...prev, meaning: e.target.value }))
                  }
                  placeholder="例如：在黑夜中祢牽我手，我心向祢歌唱，一生深愛祢..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-zinc-700">
                    0243 數字譜（每行一句，空格代表斷詞）
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={newProjForm.patternText}
                  onChange={(e) =>
                    setNewProjForm((prev) => ({
                      ...prev,
                      patternText: e.target.value,
                    }))
                  }
                  placeholder={`2342 433\n2442 0222`}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono tracking-wider text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => handleCreateNewProject(false)}
                className="px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium transition"
              >
                建立空白骨架
              </button>
              <button
                onClick={() => handleCreateNewProject(true)}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>建立並自動填入初稿</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📂 讀取與管理專案介面 Modal (Load / Manage Projects) */}
      {showProjectModal && (
        <div
          onClick={() => setShowProjectModal(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-zinc-900" />
                <h3 className="font-semibold text-base text-zinc-900">
                  我的專案庫（雲端跨裝置同步／本機儲存）
                </h3>
              </div>
              <button
                onClick={() => setShowProjectModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 雲端 vs 本地 分頁切換 */}
            <div className="flex border-b border-zinc-200 text-xs">
              <button
                type="button"
                onClick={() => setProjectModalTab('cloud')}
                className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition ${
                  projectModalTab === 'cloud'
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>☁️ Supabase 雲端專案 ({cloudProjects.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setProjectModalTab('local')}
                className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition ${
                  projectModalTab === 'local'
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>💻 本機離線專案 ({savedProjects.length})</span>
              </button>
            </div>

            {/* 頂部操作列：儲存目前專案、匯出 JSON、從電腦讀取 JSON */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 text-xs">
              <button
                onClick={() => handleSaveCurrentProject(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium flex items-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>儲存目前專案「{title || '無題'}」</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportProjectFile}
                  className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-medium flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載 (.json)</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-medium flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>匯入 (.json)</span>
                </button>
              </div>
            </div>

            {/* ☁️ 雲端專案分頁 */}
            {projectModalTab === 'cloud' && (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {!currentUser ? (
                  <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 text-center space-y-3">
                    <Cloud className="w-8 h-8 text-emerald-600 mx-auto" />
                    <div>
                      <h4 className="font-semibold text-sm text-zinc-900">
                        登入以啟用跨裝置雲端同步
                      </h4>
                      <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                        登入 Supabase 帳號後，你在屋企寫到一半的歌詞，返教會用 iPad、手機或另一部電腦都能即時讀取！
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProjectModal(false);
                        setShowAuthModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>立即登入 / 註冊帳號</span>
                    </button>
                  </div>
                ) : isCloudLoading ? (
                  <div className="text-center py-10 text-xs text-zinc-400">
                    正在載入雲端專案...
                  </div>
                ) : cloudProjects.length === 0 ? (
                  <div className="text-center py-10 text-xs text-zinc-400 space-y-2">
                    <Cloud className="w-6 h-6 mx-auto text-zinc-300" />
                    <p>雲端尚無專案。點擊上方「儲存目前專案」，即可自動同步至雲端！</p>
                  </div>
                ) : (
                  cloudProjects.map((cProj) => {
                    const previewLine = cProj.lines?.[0]?.groups
                      ?.map((g) => g.tokens.map((t) => t.char).join(''))
                      .join(' ');
                    const isCurrent = cProj.id === currentProjectId;

                    return (
                      <div
                        key={cProj.id}
                        className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-4 ${
                          isCurrent
                            ? 'bg-emerald-50/50 border-emerald-400'
                            : 'bg-white border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-zinc-900 truncate">
                              {cProj.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                              ☁️ 雲端
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-white font-medium">
                                目前編輯中
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-400">
                              {cProj.lines.length} 句 · {cProj.updatedAt}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 truncate mt-1">
                            {previewLine || cProj.meaning || '空白歌詞'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              handleLoadSavedProject({
                                id: cProj.id,
                                title: cProj.title,
                                meaning: cProj.meaning,
                                patternText: cProj.patternText,
                                lines: cProj.lines,
                                updatedAt: cProj.updatedAt,
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition"
                          >
                            讀取
                          </button>
                          <button
                            onClick={async () => {
                              const res = await deleteCloudProject(cProj.id);
                              if (res.success) {
                                setCloudProjects((prev) =>
                                  prev.filter((p) => p.id !== cProj.id)
                                );
                                showToast(`已從雲端刪除「${cProj.title}」`);
                              }
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="刪除雲端專案"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 💻 本機專案分頁 */}
            {projectModalTab === 'local' && (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {savedProjects.length === 0 ? (
                  <div className="text-center py-10 text-xs text-zinc-400 space-y-2">
                    <FileText className="w-6 h-6 mx-auto text-zinc-300" />
                    <p>目前尚無本機已儲存的專案，點擊上方「儲存目前專案」即可保存進度。</p>
                  </div>
                ) : (
                  savedProjects.map((proj) => {
                    const previewLine = proj.lines?.[0]?.groups
                      ?.map((g) => g.tokens.map((t) => t.char).join(''))
                      .join(' ');
                    const isCurrent = proj.id === currentProjectId;

                    return (
                      <div
                        key={proj.id}
                        className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-4 ${
                          isCurrent
                            ? 'bg-zinc-50 border-zinc-900'
                            : 'bg-white border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-zinc-900 truncate">
                              {proj.title}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-white font-medium">
                                目前編輯中
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-400">
                              {proj.lines.length} 句 · {proj.updatedAt}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 truncate mt-1">
                            {previewLine || proj.meaning || '空白歌詞'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleLoadSavedProject(proj)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition"
                          >
                            讀取
                          </button>
                          <button
                            onClick={() => handleDeleteSavedProject(proj.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="刪除此專案"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowProjectModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔐 Supabase 登入 / 註冊 Modal */}
      {showAuthModal && (
        <div
          onClick={() => setShowAuthModal(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Cloud className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">
                    {authMode === 'login' ? '登入帳號' : '免費註冊帳號'}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    啟用跨電腦／手機雲端同步與會員專屬功能
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 登入／註冊 切換 Tab */}
            <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`py-1.5 rounded-lg transition ${
                  authMode === 'login'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                登入
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className={`py-1.5 rounded-lg transition ${
                  authMode === 'register'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                註冊
              </button>
            </div>

            {authError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccessMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{authSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-zinc-700">Email 電子信箱</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-zinc-700">密碼</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="至少 6 位數密碼"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                {authLoading ? (
                  <span>處理中...</span>
                ) : authMode === 'login' ? (
                  <span>立即登入</span>
                ) : (
                  <span>建立帳號 (免費)</span>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-zinc-100 space-y-2.5">
              {isGsiReady ? (
                <div className="space-y-2">
                  <div className="flex flex-col items-center justify-center min-h-[44px]">
                    <div id="gsi-native-button-container" className="flex justify-center w-full" />
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600 underline"
                    >
                      若原生按鈕未顯示，改用傳統 Google 跳轉授權
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full py-2 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-700 flex items-center justify-center gap-2 transition"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>以 Google 帳號一鍵登入</span>
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowGoogleConfig((prev) => !prev)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-800 underline inline-flex items-center gap-1"
                    >
                      ⚡ 啟用 Google One Tap 秒登體驗 (免跳轉)
                    </button>
                  </div>

                  {showGoogleConfig && (
                    <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-700">
                          Google Web Client ID
                        </label>
                        <span className="text-[10px] text-emerald-600 font-medium">即時啟用</span>
                      </div>
                      <input
                        type="text"
                        value={googleClientId}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setGoogleClientId(val);
                          saveGoogleClientId(val);
                        }}
                        placeholder="例如: xxx.apps.googleusercontent.com"
                        className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                      />
                      <p className="text-[10px] text-zinc-500 leading-relaxed">
                        在 Google Cloud OAuth 建立的 Web 用戶端 ID。設定後將支援頁面角落自動 One Tap 彈出與免跳轉原生驗證。
                      </p>
                    </div>
                  )}
                </>
              )}

              <p className="text-[10px] text-center text-zinc-400">
                登入即表示您同意本工作台的{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-600 underline hover:text-zinc-900"
                >
                  服務條款
                </a>{' '}
                與{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-600 underline hover:text-zinc-900"
                >
                  隱私權政策
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ AI 模型設定 Modal */}
      {showSettingsModal && (
        <div
          onClick={() => setShowSettingsModal(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-base text-zinc-900">
                AI 模型設定 (Gemini / Groq / Ollama)
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-medium text-zinc-700">選擇模型供應商</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'gemini', label: 'Gemini API' },
                      { id: 'groq', label: 'Groq (GPT-OSS)' },
                      { id: 'ollama', label: '本地 Ollama' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleProviderChange(item.id)}
                      className={`py-2 px-3 rounded-lg font-medium border transition ${
                        aiConfig.provider === item.id
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-zinc-700">選擇或輸入模型名稱</label>
                <select
                  value={aiConfig.model}
                  onChange={(e) =>
                    setAiConfig((prev) => ({ ...prev, model: e.target.value }))
                  }
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:border-zinc-900"
                >
                  {(aiConfig.provider === 'ollama' && ollamaStatus.models.length > 0
                    ? ollamaStatus.models
                    : aiConfig.provider === 'gemini' && geminiStatus.models.length > 0
                    ? geminiStatus.models
                    : aiConfig.provider === 'groq' && groqStatus.models.length > 0
                    ? groqStatus.models
                    : DEFAULT_MODELS[aiConfig.provider]
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.badge}) — [{m.id}]
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={aiConfig.model}
                  onChange={(e) =>
                    setAiConfig((prev) => ({ ...prev, model: e.target.value }))
                  }
                  placeholder="亦可直接輸入模型 ID（例如 gemini-2.5-flash 或 llama-3.3-70b-versatile）"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:border-zinc-900 mt-1.5"
                />
              </div>

              {aiConfig.provider !== 'ollama' ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-zinc-700">
                      {aiConfig.provider === 'gemini' ? 'Gemini' : 'Groq'} API Key
                    </label>
                    {aiConfig.provider === 'gemini' && (
                      <button
                        type="button"
                        onClick={() => checkGeminiModels(aiConfig.apiKey || '')}
                        className="text-[11px] text-zinc-600 hover:text-zinc-900 underline font-medium"
                      >
                        {geminiStatus.checking
                          ? '正在讀取 Gemini 可用模型...'
                          : '🔍 偵測帳號可用 Gemini 模型版本'}
                      </button>
                    )}
                    {aiConfig.provider === 'groq' && (
                      <button
                        type="button"
                        onClick={() => checkGroqModels(aiConfig.apiKey || '')}
                        className="text-[11px] text-zinc-600 hover:text-zinc-900 underline font-medium"
                      >
                        {groqStatus.checking
                          ? '正在讀取帳號可用模型...'
                          : '🔍 偵測帳號可用模型 (GPT-OSS)'}
                      </button>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={aiConfig.apiKey || ''}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder={
                        currentUser
                          ? '輸入 API Key（已自動雲端同步至帳號）'
                          : '輸入 API Key（自動儲存於瀏覽器）'
                      }
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-3 pr-9 py-2 text-zinc-900 focus:outline-none focus:border-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((p) => !p)}
                      className="absolute right-2.5 text-zinc-400 hover:text-zinc-700"
                    >
                      {showApiKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                    {currentUser ? (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <Cloud className="w-3.5 h-3.5" /> 已自動與您的 Supabase 帳號 ({currentUser.email}) 雲端同步
                      </span>
                    ) : (
                      <span>💡 登入帳號後，API Key 將自動備份至雲端，換電腦或換瀏覽器自動載入</span>
                    )}
                  </div>
                  {aiConfig.provider === 'gemini' && geminiStatus.message && (
                    <p
                      className={`text-[11px] ${
                        geminiStatus.connected ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {geminiStatus.message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-medium text-zinc-700">
                    本地 Ollama 伺服器網址
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiConfig.ollamaBaseUrl || 'http://localhost:11434'}
                      onChange={(e) =>
                        setAiConfig((prev) => ({
                          ...prev,
                          ollamaBaseUrl: e.target.value,
                        }))
                      }
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900"
                    />
                    <button
                      onClick={() =>
                        checkOllamaConnection(
                          aiConfig.ollamaBaseUrl || 'http://localhost:11434'
                        )
                      }
                      className="px-3 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium"
                    >
                      {ollamaStatus.checking ? '檢測中...' : '重新偵測'}
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 pt-2 cursor-pointer text-zinc-700">
                <input
                  type="checkbox"
                  checked={aiConfig.enableAutoRepair}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      enableAutoRepair: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-300 text-zinc-900"
                />
                <span>啟用「本地粵拼字典驗證 + AI 連貫句子修正迴圈」（推薦開啟）</span>
              </label>

              <div className="pt-3 border-t border-zinc-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-zinc-700">Google Client ID (One Tap 原生秒登)</label>
                  <span className="text-[10px] text-zinc-400">選填</span>
                </div>
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setGoogleClientId(val);
                    saveGoogleClientId(val);
                  }}
                  placeholder="例如: xxxxxx.apps.googleusercontent.com"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  填入在 Google Cloud Console 申請的 Web Client ID 後，將自動啟用 One Tap 浮動提示與免跳轉原生驗證。亦可於 Netlify 環境變數設置 <code className="bg-zinc-100 px-1 py-0.5 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>。
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📖 0243 聲調速查表與 CantonHymn 詞庫檢索 Modal */}
      {showToneGuideModal && (
        <div
          onClick={() => setShowToneGuideModal(false)}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-xl max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="font-semibold text-base text-zinc-900">
                  0243 粵語協音速查 ＋ CantonHymn 詩歌詞庫檢索（1000+ 詩歌詞彙）
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  已整合 <a href="http://cantonhymn.net/" target="_blank" rel="noreferrer" className="underline text-zinc-700">cantonhymn.net</a> 經典與熱門粵語詩歌句式，自動依本曲主題「{title || '無題'}」排序
                </p>
              </div>
              <button
                onClick={() => setShowToneGuideModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 🔍 互動式 0243 詞庫即時檢索器 */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-900">
                  🔍 輸入任意 0243 數字組合，即時檢索 100% 啱音詩歌詞彙（優先排列符合本曲主題的詞）：
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    '30',
                    '22',
                    '222',
                    '4230',
                    '3230',
                    '3344',
                    '4344',
                    '42434',
                    '34422',
                    '02240',
                  ].map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => setLexiconSearchPattern(pat)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                        lexiconSearchPattern === pat
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      {pat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={lexiconSearchPattern}
                  onChange={(e) =>
                    setLexiconSearchPattern(e.target.value.replace(/[^0234]/g, '').slice(0, 7))
                  }
                  placeholder="輸入 0243 數字（例如：4230 祢已掌權、42434 靠著祢得勝、34422 主愛勝患難）"
                  className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                />
              </div>

              {lexiconSearchPattern ? (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-40 overflow-y-auto">
                  {getVerifiedCandidatesForGroupPattern(
                    lexiconSearchPattern,
                    30,
                    false,
                    `${title} ${meaning}`
                  ).map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(word);
                        showToast(`已複製「${word}」(${lexiconSearchPattern})`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-zinc-200 hover:border-emerald-400 text-xs font-medium text-zinc-800 transition"
                      title="點擊複製詞彙"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* 🎵 CantonHymn (http://cantonhymn.net/) 實時粵語詩歌佳句與 0243 對照 */}
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950">
                  🎵 參考自 CantonHymn (cantonhymn.net) 粵語詩歌實例詞彙（點擊即可複製）：
                </span>
                <span className="text-[11px] text-emerald-700 font-medium">
                  {cantonHymnData.loading
                    ? '正在連線 CantonHymn...'
                    : cantonHymnData.liveConnected
                    ? `🟢 已即時同步 cantonhymn.net (${cantonHymnData.phrases.length} 組佳句)`
                    : `📚 已載入 CantonHymn 精選詞庫 (${cantonHymnData.phrases.length} 組佳句)`}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                {cantonHymnData.phrases
                  .filter((p) =>
                    lexiconSearchPattern
                      ? p.pattern === lexiconSearchPattern ||
                        p.pattern.includes(lexiconSearchPattern)
                      : true
                  )
                  .slice(0, 48)
                  .map((item) => (
                    <button
                      key={`${item.songTitle}-${item.text}`}
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(item.text);
                        showToast(
                          `已複製 CantonHymn《${item.songTitle}》詞彙：「${item.text}」[${item.pattern}]`
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100/80 border border-emerald-200 text-xs flex items-center gap-1.5 transition"
                      title={`出自 CantonHymn《${item.songTitle}》｜粵拼：${item.jyutping}`}
                    >
                      <span className="font-semibold text-zinc-900">{item.text}</span>
                      <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                        {item.pattern}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="font-bold text-zinc-900 mb-1">
                  💡 填詞實務高頻字特別設定
                </div>
                <div className="text-zinc-600">
                  <strong>更 (更深 4 / 更新 3)</strong>、<strong>我 (4)</strong>、<strong>你 (4)</strong>、<strong>祢 (4)</strong>、<strong>主 (3)</strong>、<strong>祂 (3)</strong>、<strong>神 (0)</strong>、<strong>掌權 (30)</strong>、<strong>患難 (22)</strong>、<strong>困境 (43)</strong>、<strong>驚惶 (30)</strong>
                  <br />
                  例句：祢已掌權 (<code className="font-mono">4230</code>)、不用驚惶 (<code className="font-mono">3230</code>)、靠著祢得勝 (<code className="font-mono">42434</code>)、主愛勝患難 (<code className="font-mono">34422</code>)、愛祢更深 (<code className="font-mono">3443</code>)、更新我生命 (<code className="font-mono">33422</code>)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="font-bold text-zinc-900 mb-1">
                  3（最高音）— 包含「更新/更改 之更」及陰平、陰上、陰入聲
                </div>
                <div className="text-zinc-600">
                  例字：更(更新)、掌、驚、境、主、祂、心、恩、深、真、光、歌、天、生、手、身、家、高、舉、謙、卑、清、新、風、星、穩、苦、君
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="font-bold text-zinc-900 mb-1">
                  4（次高音）— 包含「我、你、祢」、「更深/更愛/更加 之更」及陰去、中入聲
                </div>
                <div className="text-zinc-600">
                  例字：我、你、祢、更(更深/更愛)、怕、困、勝、愛、信、靠、向、敬、拜、讚、看、唱、救、聖、盼、賜、照、獻、細、破、曉、痛、暗、蔭、應
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="font-bold text-zinc-900 mb-1">
                  2（中低音）— 陽去、陽入聲等
                </div>
                <div className="text-zinc-600">
                  例字：在、患、難、懼、是、大、願、伴、用、共、為、望、路、地、道、父、命、順、領、引、裡、夜、浪、岸、雨、暖、夢、渡、漸、未、座、暴
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="font-bold text-zinc-900 mb-1">
                  0（最低音）— 陽平聲
                </div>
                <div className="text-zinc-600">
                  例字：神、權、王、惶、靈、同、情、全、常、行、人、能、榮、平、揚、崇、臨、求、扶、陪、隨、晨、泉、雲、長、微、柔、晴、河、霖、仍
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowToneGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
