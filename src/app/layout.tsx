import './globals.css';
import { Rajdhani } from 'next/font/google';
import localFont from 'next/font/local';
import { TummyLayout } from '../components/ui/TummyLayout';
import { Navigation } from '../components/ui/Navigation';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rajdhani',
});

const shareTechMono = localFont({
  src: '../fonts/ShareTechMono-Regular.ttf',
  variable: '--font-share-tech-mono',
});

export const metadata = {
  title: 'Tummy - Data Mining Through Food',
  description: 'Mine data by scanning and logging your food consumption',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${shareTechMono.variable}`}>
      <body className="h-screen flex flex-col bg-gray-900">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <Navigation />
      </body>
    </html>
  );
}
