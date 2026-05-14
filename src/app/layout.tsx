import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Gizli Görev | Codenames Premium",
  description: "Yayıncılara ve ekiplere özel gerçek zamanlı istihbarat ve tahmin oyunu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}