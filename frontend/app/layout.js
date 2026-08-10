import { cookies } from "next/headers";
import "../globals.css";
import Providers from "@/app/components/providers";
import ConditionalAppShell from "@/app/components/conditional-app-shell";
import RevealOnScroll from "@/app/components/reveal-on-scroll";
import { LocaleProvider } from "@/app/components/i18n/locale-provider";
import { localeFromCookieStore } from "@/app/lib/i18n/server";

export const metadata = {
  title: "JanSetu",
  description: "JanSetu — public health monitoring and response",
};

/**
 * The language is read here, on the server, so the very first paint is already in it.
 * Reading it on the client instead would render English, hydrate, then swap — a visible
 * flicker on every page load for anyone who chose Hinglish.
 */
export default async function RootLayout({ children }) {
  const locale = localeFromCookieStore(await cookies());

  return (
    <html lang={locale === "hi" ? "hi-Latn" : "en"} className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full bg-canvas text-ink antialiased" suppressHydrationWarning>
        <LocaleProvider initialLocale={locale}>
          <Providers>
            <ConditionalAppShell>{children}</ConditionalAppShell>
            <RevealOnScroll />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
