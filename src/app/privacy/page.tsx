import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Lock, FileText } from 'lucide-react';

export const metadata = {
  title: '隱私權政策 (Privacy Policy) | Cantonese Lyric Studio',
  description: 'Cantonese Lyric Studio 粵語詩歌填詞工作台隱私權政策。',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-zinc-200/90 shadow-sm p-6 sm:p-10">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回工作台首頁
          </Link>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              隱私權政策 (Privacy Policy)
            </h1>
          </div>
          <p className="text-xs text-zinc-400">最後更新日期：2026 年 10 月 25 日</p>
        </div>

        <div className="space-y-6 text-sm text-zinc-700 leading-relaxed border-t border-zinc-100 pt-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              1. 我們收集的資訊
            </h2>
            <p>
              Cantonese Lyric Studio（「本服務」）是一套專為粵語詩歌創作與 0243 協音校驗設計的輔助工具。我們僅收集運作本服務所必需的最低限度資訊：
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-600">
              <li>
                <strong>帳戶驗證資訊</strong>：當您使用 Google OAuth 或電子郵件註冊/登入時，我們透過 Supabase 收集您的電子郵件地址與公開基本資料，僅用於識別帳戶與跨裝置同步詩歌專案。
              </li>
              <li>
                <strong>詩歌創作資料</strong>：您輸入的歌名、主題描述、0243 數字譜與歌詞草稿。若您已登入，資料將加密儲存於 Supabase 雲端資料庫以供跨裝置同步。
              </li>
              <li>
                <strong>自備 API 金鑰</strong>：若您設定了個人的 Gemini 或 Groq API Key，金鑰預設儲存於您的瀏覽器本地（LocalStorage），或於登入後由 Supabase 帳戶中繼資料進行加密儲存，我們絕不會將您的金鑰轉售或用於非本服務之外的用途。
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              2. 資訊的使用方式
            </h2>
            <p>我們收集的資訊僅用於以下合法用途：</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-600">
              <li>提供、維護及優化粵語填詞、聲調協音匹配及專案雲端備份服務。</li>
              <li>依據您的指示，調用 AI 模型（如 Gemini、Groq）生成符合 0243 數字譜的詩歌建議。</li>
              <li>保障系統安全，防止濫用與惡意攻擊。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">3. 第三方服務與資料分享</h2>
            <p>
              我們絕不會將您的個人資訊出售予任何第三方。本服務與以下受信任的基礎架構服務合作：
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-600">
              <li><strong>Supabase</strong>：提供安全的認證與雲端資料庫儲存服務。</li>
              <li><strong>Google OAuth</strong>：提供安全的單一簽入（SSO）驗證。</li>
              <li><strong>AI 提供商（Google Gemini / Groq）</strong>：僅在您主動點擊「AI 生成」或「替換建議」時傳遞該樂句的上下文以取得詞彙。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">4. 資料保存與刪除權利</h2>
            <p>
              您可以隨時在工作台中刪除已儲存的專案，或隨時清除瀏覽器 LocalStorage。如需徹底註銷帳戶並清除所有雲端同步資料，請與我們聯繫，我們將於 7 個工作日內完全清除。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">5. 聯絡我們</h2>
            <p>
              若您對本隱私權政策有任何疑問或建議，歡迎透過 GitHub 倉庫 Issue 或官方頁面與我們聯繫。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
