export type TokenStatus = 'normal' | 'locked' | 'needs_change' | 'tone_mismatch'; // normal, 綠色, 紅色, 黃色

export type VocalErgonomicsRating = 'excellent' | 'good' | 'caution_closed' | 'warning_stopped';

export interface VocalErgonomicsInfo {
  rating: VocalErgonomicsRating;
  endingType: 'open_vowel' | 'semi_open' | 'closed_nasal_m' | 'stopped_ptk' | 'other';
  rhyme: string;
  note: string;
}

export interface LyricToken {
  id: string;
  char: string;               // 漢字，例如 "敬"
  expectedTone: string;       // 旋律要求，例如 "4"
  actualTone: string;         // 實際推算聲階，例如 "4" (若多音字有吻合則優先取吻合音階，否則取常讀音階)
  allPossibleTones?: string[]; // 破音字所有可能 0243 聲階
  jyutping?: string;          // 粵拼，例如 "ging3"
  cantoneseToneNum?: number;  // 粵語 1-6 調號
  cantoneseToneName?: string; // 例如 "陰去"、"陽平"、"中入"
  status: TokenStatus;        // 當前標記狀態
  ergonomics?: VocalErgonomicsInfo; // 聲樂發音人體工學分析（特別針對詞尾高音 3/4）
}

export interface LyricWordGroup {
  groupId: string;            // 依空格切分出的詞組區塊（如 "2444" 為一組）
  targetGroupPattern: string; // 該詞組目標數字譜，如 "2444"
  tokens: LyricToken[];
  userInstruction?: string;   // 用戶針對此詞組的特定修改指令
}

export interface LyricLine {
  lineId: string;
  targetPattern: string;      // 例如 "2444 433"
  groups: LyricWordGroup[];
}

export interface SongProject {
  title: string;
  meaning: string;
  lines: LyricLine[];
}

export interface AlternativeCandidate {
  id: string;
  text: string;               // 候選詞，例如 "敬拜讚美"
  targetPattern: string;      // 目標 0243，例如 "4442"
  actualPattern: string;      // 實際 0243，例如 "4442"
  isExactToneMatch: boolean;  // 是否 100% 協音吻合
  jyutpingList: string[];     // 逐字粵拼，例如 ["ging3", "baai3", "zaan3", "mei5"]
  toneAnalysis: string;       // 字音與神學語境分析
  vocalErgonomics: string;    // 聲樂拖音難易度說明
  ergonomicsRating: VocalErgonomicsRating;
}

export type AIProviderType = 'gemini' | 'groq' | 'ollama';

export interface AIProviderConfig {
  provider: AIProviderType;
  model: string;
  apiKey?: string;            // Gemini or Groq API Key (optional if set in env)
  ollamaBaseUrl?: string;     // Default: http://localhost:11434
  enableAutoRepair: boolean;  // 是否啟用本地字典驗證後的 AI 自動修正迴圈 (極大提升準確率)
  repairMaxRetries: number;   // 自動修正最大重試次數 (1~3)
}
