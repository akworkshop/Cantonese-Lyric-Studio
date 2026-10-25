import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cantonese Lyric Studio | 粵語詩歌 0243 填詞工作台',
  description:
    '極簡純白粵語詩歌填詞輔助工具，支援 0243 協音檢測與就地智慧修訂。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body className="min-h-screen bg-zinc-50/70 text-zinc-900 font-sans">
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
