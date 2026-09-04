import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PwaRegister } from '@/components/prism/pwa-register';
import { VaultProvider } from '@/components/prism/vault-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://wxjj.woxiangyyyy.chatgpt.site'),
  title: 'wxjj · PRISM — Midjourney 私人资产库',
  description: '本地优先、加密保存的 Midjourney 提示词、Profile、Moodboard 与图片工作台。',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'wxjj · PRISM — Midjourney 私人资产库',
    description: '提示词、Profile、Moodboard、配方与图片处理，都留在你的设备里。',
    images: [{ url: 'https://wxjj.woxiangyyyy.chatgpt.site/og.png', width: 1200, height: 630, alt: 'wxjj · PRISM Private Visual Vault' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'wxjj · PRISM — Midjourney 私人资产库',
    description: '提示词、Profile、Moodboard、配方与图片处理，都留在你的设备里。',
    images: ['https://wxjj.woxiangyyyy.chatgpt.site/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <VaultProvider>
          {children}
          <PwaRegister />
        </VaultProvider>
      </body>
    </html>
  );
}
