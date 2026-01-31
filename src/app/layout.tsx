import { Space_Grotesk, Plus_Jakarta_Sans } from 'next/font/google';

import { DevTools } from '@/components/dev-tools';
import { Toaster } from '@/components/ui/toaster';

import type { Metadata } from 'next';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

export const metadata: Metadata = {
  title: 'Beads',
  description: 'Kanban interface for beads - git-backed distributed issue tracker',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${plusJakartaSans.variable}`}>
      <body className="flex min-h-screen flex-col bg-background antialiased">
        <div className="flex-1">{children}</div>
        <Toaster />
        <DevTools />
      </body>
    </html>
  );
}
