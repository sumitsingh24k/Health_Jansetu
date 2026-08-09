import "../globals.css";
import Providers from "@/app/components/providers";
import ConditionalAppShell from "@/app/components/conditional-app-shell";
import RevealOnScroll from "@/app/components/reveal-on-scroll";

export const metadata = {
  title: "JanSetu",
  description: "JanSetu — public health monitoring and response",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full bg-canvas text-ink antialiased" suppressHydrationWarning>
        <Providers>
          <ConditionalAppShell>{children}</ConditionalAppShell>
          <RevealOnScroll />
        </Providers>
      </body>
    </html>
  );
}
