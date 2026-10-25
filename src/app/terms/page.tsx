import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle, AlertCircle } from 'lucide-react';

export const metadata = {
  title: '服務條款 (Terms of Service) | Cantonese Lyric Studio',
  description: 'Cantonese Lyric Studio 粵語詩歌填詞工作台服務條款。',
};

export default function TermsOfServicePage() {
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
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              服務條款 (Terms of Service)
            </h1>
          </div>
          <p className="text-xs text-zinc-400">最後更新日期：2026 年 10 月 25 日</p>
        </div>

        <div className="space-y-6 text-sm text-zinc-700 leading-relaxed border-t border-zinc-100 pt-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              1. 接受本條款
            </h2>
            <p>
              當您訪問或使用 Cantonese Lyric Studio（下稱「本工作台」或「本服務」），即表示您已閱讀、理解並同意受本服務條款約束。若您不同意任何條款內容，請勿使用本服務。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">2. 服務內容與創作授權</h2>
            <p>
              本服務提供粵語 0243 協音校驗、詩歌名句檢索、AI 填詞輔助及跨裝置專案備份功能。
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-600">
              <li>
                <strong>創作者版權歸屬</strong>：您在本工作台上創作的原創歌詞，其智慧財產權完全歸屬於您個人或您所屬之敬拜機構，本服務不會對您的原創作品主張任何所有權。
              </li>
              <li>
                <strong>AI 生成內容</strong>：由本服務調用之大語言模型所產出的建議詞彙，僅作為輔助參考與靈感引導，請依基督教信仰與文意自行斟酌採用。
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">3. 使用者責任與行為規範</h2>
            <p>在使用本服務時，您同意：</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-600">
              <li>妥善保管您的登入帳號及自備 API 金鑰，不將金鑰公開於非安全環境。</li>
              <li>不得利用本服務進行任何違法、惡意攻擊、散播誹謗或侵害他人著作權之行為。</li>
              <li>不得嘗試透過自動化機器人惡意抓取或癱瘓伺服器資源。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              4. 免責聲明
            </h2>
            <p>
              本服務以「現狀（as-is）」基礎提供。雖然我們盡最大努力透過香港語言學會（LSHK）粵拼引擎確保 0243 聲調檢測之準確性，但仍不保證系統在所有網路環境下 100% 不中斷或毫無微小誤差。對於因第三方網路連線或 API 服務中斷所造成之任何損失，本服務不承擔賠償責任。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900">5. 條款修訂</h2>
            <p>
              我們保留隨時更新或修改本服務條款之權利。重大變更將於本網頁公告，繼續使用本服務即視為您接受修訂後的條款。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
