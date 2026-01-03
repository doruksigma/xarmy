import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "XARMY Arena",
  description: "Mini oyunlar, skorlar ve eğlence."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          {/* Arka plan efekti */}
          <div className="pointer-events-none fixed inset-0 -z-10">
            <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          </div>

          <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
        </main>
        <Footer />
      </body>
    </html>
  );
}
