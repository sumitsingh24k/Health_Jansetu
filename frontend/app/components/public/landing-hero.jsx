"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The dark opening of the landing page.
 *
 * The three floating cards are an illustration of the method — one ASHA report, one
 * medicine-velocity reading, and the verdict the two produce together. They are
 * deliberately example data and say so, because the live numbers for the visitor's own
 * area are one scroll below, and mixing a sample with a real reading in the same
 * viewport would make both untrustworthy.
 */

const NAV = [
  { label: "Live picture", href: "#live" },
  { label: "How it works", href: "#how" },
  { label: "The hard case", href: "#specificity" },
  { label: "Roles", href: "#roles" },
];

export default function LandingHero() {
  const tiltRef = useRef(null);

  const handleMove = useCallback((event) => {
    const element = tiltRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    element.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`;
  }, []);

  const handleLeave = useCallback(() => {
    const element = tiltRef.current;
    if (element) element.style.transform = "rotateY(0deg) rotateX(0deg)";
  }, []);

  return (
    <div className="relative overflow-hidden bg-night pb-16 text-[#eef5f0] md:pb-24">
      <div className="js-halo pointer-events-none absolute inset-0" />
      <div className="js-dots pointer-events-none absolute inset-0" />

      {/* ------------------------------------------------------------- nav -- */}
      <div className="relative mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3 px-4 py-5 md:px-8">
        <Link href="/" className="flex flex-1 items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[linear-gradient(140deg,#5ee2a0,#1d9e63)] shadow-[0_0_24px_rgba(94,226,160,0.45)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#07130c"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12h4l2-7 4 14 2-7h6" />
            </svg>
          </span>
          <span className="js-display text-xl font-semibold tracking-[0.01em] text-white">
            JanSetu<span className="text-neon">.</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-xs font-medium text-[rgba(238,245,240,0.72)] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <Button
            asChild
            size="sm"
            className="ml-2 bg-neon text-[#07130c] shadow-[0_0_26px_rgba(94,226,160,0.35)] hover:bg-neon hover:brightness-105"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </div>

      {/* ------------------------------------------------------------ body -- */}
      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-10 px-4 pt-10 md:px-8 md:pt-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="js-mono flex items-center gap-2.5 text-[11px] tracking-[0.22em] text-neon">
            <span className="js-blink h-1.5 w-1.5 rounded-full bg-neon" />
            Rural disease surveillance · live
          </p>

          <h1 className="js-display mt-5 text-[clamp(2.5rem,7vw,4rem)] leading-[1.04] text-white">
            Two witnesses.
            <br />
            One verdict.
          </h1>

          <p className="mt-6 max-w-[460px] text-[15.5px] leading-[1.7] font-light text-[rgba(238,245,240,0.66)]">
            The health worker who walks the village, and the shop the medicine leaves
            from — two independent views of the same reality. The useful information
            lives where they agree, and where they don&apos;t.
          </p>

          <div className="mt-9 flex flex-wrap gap-3.5">
            <Button
              asChild
              className="bg-neon px-7 text-[13.5px] text-[#07130c] shadow-[0_0_32px_rgba(94,226,160,0.35)] hover:bg-neon hover:brightness-105"
            >
              <a href="#live">See the live picture</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-transparent px-7 text-[13.5px] text-[#eef5f0] hover:border-neon/60 hover:bg-transparent hover:text-neon"
            >
              <a href="#how">How it works</a>
            </Button>
          </div>

          <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-5">
            {[
              ["ASHA field reports", "Household surveys, filed by voice"],
              ["Confirmed pickups", "Counted only at the counter"],
              ["One verdict per area", "With the reasoning attached"],
            ].map(([term, detail]) => (
              <div key={term} className="max-w-[190px]">
                <dt className="text-sm font-semibold text-white">{term}</dt>
                <dd className="js-mono mt-1.5 text-[9.5px] leading-relaxed tracking-[0.14em] text-[rgba(238,245,240,0.5)]">
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* --------------------------------------------------- card cluster -- */}
        <div
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          className="relative hidden h-[520px] [perspective:1400px] lg:block"
        >
          <div
            ref={tiltRef}
            className="absolute inset-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] [transform-style:preserve-3d]"
          >
            <SampleBadge />

            {/* ASHA report */}
            <div className="absolute top-[30px] left-0 w-[250px] [transform:translateZ(30px)]">
              <article className="js-float-a rounded-[20px] border border-white/[0.12] bg-white/[0.055] p-5 shadow-[0_32px_60px_rgba(0,0,0,0.45)] backdrop-blur-[14px]">
                <header className="flex items-center gap-2.5">
                  <span className="js-display grid h-[34px] w-[34px] place-items-center rounded-full border border-neon/35 bg-neon/15 text-base font-semibold text-neon">
                    A
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold text-white">ASHA field report</p>
                    <p className="js-mono mt-0.5 text-[9px] tracking-[0.14em] text-[rgba(238,245,240,0.5)]">
                      One village · one morning
                    </p>
                  </div>
                </header>
                <dl className="mt-4 flex flex-col gap-2.5 text-xs text-[rgba(238,245,240,0.75)]">
                  {[
                    ["Households visited", "32", "text-white"],
                    ["New fever cases", "9", "text-white"],
                    ["Critical", "2", "text-[#ff9d8a]"],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="flex justify-between">
                      <dt>{label}</dt>
                      <dd className={`js-code font-semibold ${tone}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            </div>

            {/* Medicine velocity */}
            <div className="absolute top-[250px] left-[150px] w-[270px] [transform:translateZ(90px)]">
              <article className="js-float-b rounded-[20px] border border-white/[0.13] bg-white/[0.06] p-5 shadow-[0_40px_80px_rgba(0,0,0,0.5)] backdrop-blur-[14px]">
                <header className="flex items-center gap-2.5">
                  <span className="js-display grid h-[34px] w-[34px] place-items-center rounded-full border border-neon/35 bg-neon/15 text-base font-semibold text-neon">
                    M
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold text-white">Medicine velocity</p>
                    <p className="js-mono mt-0.5 text-[9px] tracking-[0.14em] text-[rgba(238,245,240,0.5)]">
                      Week over week
                    </p>
                  </div>
                </header>
                <div className="mt-4 flex flex-col gap-2.5">
                  {[
                    ["Papaya-leaf syrup", "86%", "+86%", "bg-neon", "text-neon"],
                    [
                      "Paracetamol 650",
                      "31%",
                      "+31%",
                      "bg-white/40",
                      "text-[rgba(238,245,240,0.55)]",
                    ],
                  ].map(([name, width, label, bar, tone]) => (
                    <div key={name} className="flex items-center gap-2.5 text-xs">
                      <span className="w-[104px] shrink-0 truncate text-[rgba(238,245,240,0.75)]">
                        {name}
                      </span>
                      <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <span
                          className={`js-bar-grow block h-full rounded-full ${bar}`}
                          style={{ width }}
                        />
                      </span>
                      <span className={`js-code text-[10px] ${tone}`}>{label}</span>
                    </div>
                  ))}
                  <p className="js-mono text-[9px] tracking-[0.14em] text-neon">
                    Specific + broad rising together
                  </p>
                </div>
              </article>
            </div>

            {/* Verdict */}
            <div className="absolute top-[110px] right-0 w-[225px] [transform:translateZ(140px)]">
              <article className="js-float-c rounded-[20px] border border-neon/40 bg-[linear-gradient(160deg,rgba(94,226,160,0.16),rgba(94,226,160,0.05))] p-5 shadow-[0_44px_90px_rgba(0,0,0,0.55),0_0_40px_rgba(94,226,160,0.12)] backdrop-blur-[14px]">
                <p className="js-mono text-[9.5px] tracking-[0.18em] text-neon">
                  Verdict · confirmed
                </p>
                <p className="mt-3 flex items-baseline gap-2.5">
                  <span className="js-num text-[44px] text-white">77</span>
                  <span className="text-xs font-semibold text-neon">HIGH</span>
                </p>
                <p className="mt-2 text-[12.5px] font-semibold text-white">Dengue · one block</p>
                <p className="mt-2 text-[11px] leading-[1.55] text-[rgba(238,245,240,0.6)]">
                  Field reports and medicine movement point at the same illness.
                </p>
              </article>
            </div>

            {/* connector */}
            <span className="absolute top-[236px] left-[118px] h-3 w-3 rounded-full bg-neon [transform:translateZ(60px)]">
              <span className="js-ring absolute -inset-1.5 rounded-full border border-neon" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SampleBadge() {
  return (
    <p className="js-mono absolute -top-1 right-0 z-10 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[8.5px] tracking-[0.16em] text-[rgba(238,245,240,0.55)]">
      Example · not live data
    </p>
  );
}
