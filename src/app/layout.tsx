import type { Metadata } from "next";
import { Heebo, Frank_Ruhl_Libre, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

// Extra faces used only by the /studio aesthetic variants.
// Loaded at the root so variants don't each ship their own <link>.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "זרקור — ממקד את המשרד במה שחשוב עכשיו",
  description: "מערכת AI חכמה למשרד ביטוח",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${frankRuhl.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
