"use client";

import Link from "next/link";
import { LanguageToggle } from "@/app/components/i18n/language-toggle";
import { useT } from "@/app/components/i18n/locale-provider";

/**
 * The pieces every signed-in screen is built from.
 *
 * Sehat Sahayak, the medical shop and the workspace all open the same way — a mono
 * kicker naming who and where you are, an italic display headline, one line of context,
 * then a row of tabs. Sharing the parts is what makes the four roles read as one product
 * rather than four apps that happen to share a login.
 */

export function ScreenHeader({ kicker, title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker ? (
          <p className="js-mono text-[10px] tracking-[0.2em] text-brand">{kicker}</p>
        ) : null}
        <h1 className="js-display mt-3 text-[clamp(1.65rem,3.4vw,2.25rem)] leading-tight text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>
      {/* Every signed-in screen is built on this header, so putting the language switch
          here puts it in the same place for a resident, a shop, an ASHA and an admin. */}
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <LanguageToggle />
      </div>
    </header>
  );
}

/**
 * Tabs that are real links, so a role landing on a screen it cannot open is caught by
 * the route guard rather than by a dead button.
 */
export function TabNav({ items, activeHref }) {
  const t = useT();

  if (!items?.length) return null;

  const isActive = (href) => {
    if (activeHref === href) return true;
    if (href === "/" || !activeHref) return false;
    const deeper = items.some((item) => item.href !== href && item.href.startsWith(`${href}/`));
    return !deeper && activeHref.startsWith(`${href}/`);
  };

  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-line pb-3.5">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-brand-tint hover:text-brand-strong"
            }`}
          >
            {/* A label is either already-final text or an {en, hi} pair, so a caller can
                hand over whichever it has without wrapping every entry. */}
            {typeof item.label === "string" ? item.label : t(item.label.en, item.label.hi)}
          </Link>
        );
      })}
    </nav>
  );
}

/** A number the reader is meant to remember. */
export function StatCard({ label, value, hint, tone = "ink", reveal = true }) {
  const valueColor =
    {
      ink: "text-ink",
      brand: "text-brand",
      danger: "text-danger",
      warn: "text-warn",
      faint: "text-faint",
    }[tone] || "text-ink";

  return (
    <article {...(reveal ? { "data-reveal": "" } : {})} className="js-card p-5">
      <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">{label}</p>
      <p className={`js-num mt-2.5 text-[30px] ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted-2">{hint}</p> : null}
    </article>
  );
}

/** A framed block of content. `tone` carries the status colours used app-wide. */
export function Panel({ title, description, children, actions, tone = "plain", className = "", id }) {
  const shell = {
    plain: "js-card",
    brand: "rounded-[20px] border border-brand-line bg-brand-tint",
    warn: "rounded-[20px] border border-warn-line bg-warn-bg",
    danger: "rounded-[20px] border border-danger-line bg-danger-bg",
    night: "rounded-[20px] bg-night-2 text-[#e9f2ec]",
  }[tone];

  const titleColor = tone === "night" ? "text-white" : "text-ink";
  const bodyColor = tone === "night" ? "text-[rgba(233,242,236,0.65)]" : "text-muted-2";

  return (
    <section id={id} data-reveal="" className={`${shell} p-6 md:p-7 ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className={`text-[15px] font-semibold ${titleColor}`}>{title}</h2> : null}
            {description ? (
              <p className={`mt-1 text-xs leading-relaxed ${bodyColor}`}>{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Small uppercase status chip. Always carries its own word — never colour alone. */
export function Chip({ children, tone = "neutral", className = "" }) {
  const palette = {
    neutral: "border-line bg-brand-tint-2 text-muted",
    brand: "border-brand-line bg-brand-tint text-brand-strong",
    solid: "border-brand bg-brand text-white",
    warn: "border-warn-line bg-warn-bg text-warn-ink",
    danger: "border-danger-line bg-danger-bg text-danger-ink",
  }[tone];

  return (
    <span
      className={`js-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] tracking-[0.12em] ${palette} ${className}`}
    >
      {children}
    </span>
  );
}

/** Placeholder copy for a panel with nothing in it yet. */
export function EmptyState({ children, className = "" }) {
  return (
    <p className={`py-8 text-center text-sm text-muted-2 ${className}`}>{children}</p>
  );
}

/** Horizontal magnitude bar used by every "what is moving" list. */
export function MeterBar({ value, tone = "brand", dashed = false }) {
  const fill = {
    brand: "bg-brand",
    orange: "bg-[#d96f43]",
    warn: "bg-warn",
    danger: "bg-danger",
    faint: "bg-faint",
  }[tone];

  return (
    <span className="block h-[7px] overflow-hidden rounded-full bg-line-soft">
      {dashed ? (
        <span className="block h-full w-full rounded-full border border-dashed border-brand" />
      ) : (
        <span className={`js-bar-grow block h-full rounded-full ${fill}`} style={{ width: value }} />
      )}
    </span>
  );
}
