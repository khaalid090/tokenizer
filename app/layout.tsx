import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tokenizer - Prompt Token Optimization",
  description:
    "Compress prompts locally and cut token usage without altering intent, code blocks, or constraints. No API key, no provider calls - copy the optimized prompt anywhere.",
  icons: { icon: [{ url: "/favicon.ico" }] },
};

/**
 * Applies the saved appearance theme before first paint (no flash of the
 * wrong theme). Values are validated in lib/settings.ts as well.
 */
const themeInitScript = `(function(){try{var raw=localStorage.getItem("tokentrim_settings");var theme="dark";if(raw){var parsed=JSON.parse(raw);if(parsed&&parsed.theme==="light"){theme="light";}}document.documentElement.setAttribute("data-theme",theme);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning` is REQUIRED here, not a workaround.
    // `themeInitScript` (below) writes `data-theme` straight onto <html>
    // from localStorage before React hydrates. That is what prevents a flash
    // of the wrong theme, but it also means the live DOM can legitimately
    // differ from the server-rendered `data-theme="dark"`. Without this,
    // React reports a hydration mismatch and refuses to patch the attribute.
    // Only this element is exempted - mismatches in the tree below still warn.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
