import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Buddy",
  description: "Your AI chat companion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning prevents React from complaining about the
    // data-theme attribute being set by the inline script below before hydration.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full`}>
      <head>
        {/*
          Inline script runs synchronously before the browser paints,
          so the correct theme is applied instantly with no flash of wrong color.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('buddy-theme');document.documentElement.setAttribute('data-theme',t||'dark');}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
