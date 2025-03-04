import './globals.css';
import { Rajdhani } from 'next/font/google';
import localFont from 'next/font/local';
import { Navigation } from '../components/ui/Navigation';
import { Inter } from 'next/font/google';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rajdhani',
});

const shareTechMono = localFont({
  src: '../fonts/ShareTechMono-Regular.ttf',
  variable: '--font-share-tech-mono',
});

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Tummy - Food Tracker',
  description: 'Track your food intake with barcode scanning and nutrition information',
  manifest: '/manifest.json',
  themeColor: '#7C3AED',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tummy',
    startupImage: [
      {
        url: '/splash/apple-splash-2048-2732.png',
        media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)'
      }
    ]
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover'
  },
  icons: {
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${shareTechMono.variable} ${inter.className}`}>
      <head>
        <meta name="application-name" content="Tummy" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tummy" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="none" />
        <meta name="msapplication-TileColor" content="#7C3AED" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#7C3AED" />
        
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#7C3AED" />
      </head>
      <body className="h-screen flex flex-col bg-gray-900">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <Navigation />
      </body>
    </html>
  );
}
