import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// import "./test.css";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";
import Script from "next/script";
import "@/lib/polyfills";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AlphaPair - Crypto交易平台",
  description: "專業的Crypto交易平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark">
      <head>
        <Script id="crypto-polyfill" strategy="beforeInteractive">
          {`
            (function() {
              try {
                if (typeof window !== 'undefined') {
                  if (!window.crypto) {
                    window.crypto = {};

                  }
                  
                  if (!window.crypto.randomUUID) {
                    window.crypto.randomUUID = function() {
                      let d = new Date().getTime();
                      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        const r = (d + Math.random() * 16) % 16 | 0;
                        d = Math.floor(d / 16);
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                      });
                    };

                  }
                  
                  window.__generateUUID = window.crypto.randomUUID;
                }
              } catch (e) {
                console.error('早期 polyfill 初始化失敗:', e);
              }
            })();
          `}
        </Script>
      </head>
      <body className={`${inter.className} min-h-screen bg-gray-900 text-gray-100`}>
        <AuthProvider>
          <Navbar />
          <main className="w-full max-w-none mx-auto px-2 py-6 pt-20 pb-16">
            {children}
          </main>
          <Toaster 
            position="bottom-right" 
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: 'rgb(31, 41, 55)',
                color: 'white',
                border: '1px solid rgb(55, 65, 81)',
              },
              className: 'toast-custom',
              duration: 3000,
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
