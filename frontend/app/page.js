import { cookies } from "next/headers";
import Link from "next/link";
import PublicDashboard from "@/app/components/public/public-dashboard";
import LandingHero from "@/app/components/public/landing-hero";
import { Button } from "@/components/ui/button";
import { translatorFor } from "@/app/lib/i18n/locale";
import { localeFromCookieStore } from "@/app/lib/i18n/server";

/**
 * Landing page.
 *
 * The surveillance picture is public: anyone who lands here sees the charts, the
 * red-zone map and the medicine signal without an account, because a villager
 * checking whether dengue is rising in their block should not have to sign up first.
 * Accounts exist only for the three roles that *write* data.
 */

const ROLE_REGISTRATIONS = [
  {
    letter: "A",
    title: "ASHA Worker",
    subtitle: { en: "Field reports", hi: "Field reports" },
    description: {
      en: "File a report by speaking — the illness and case counts fill themselves in, and the map updates at once.",
      hi: "Bol kar report darj kijiye — bimari aur case count apne aap bhar jaate hain, map turant update hota hai.",
    },
    href: "/register/asha",
    note: { en: "Sign in right after registering", hi: "Register karte hi login kijiye" },
    cta: { en: "Register", hi: "Register kijiye" },
  },
  {
    letter: "M",
    title: "Medical Shop",
    subtitle: { en: "Stock & pickups", hi: "Stock & pickups" },
    description: {
      en: "Manage your stock, confirm customers' pickup codes, and watch the medicine demand chart.",
      hi: "Apna stock manage kijiye, customer ke pickup code confirm kijiye, aur dawai ki demand ka chart dekhiye.",
    },
    href: "/register/medical",
    note: { en: "Sign in right after registering", hi: "Register karte hi login kijiye" },
    cta: { en: "Register", hi: "Register kijiye" },
  },
  {
    letter: "N",
    title: { en: "Citizen", hi: "Aam Nagrik" },
    subtitle: { en: "Sehat Sahayak", hi: "Sehat Sahayak" },
    description: {
      en: "Describe what is wrong, get guidance, and book the medicine you need at a nearby shop.",
      hi: "Apni takleef bataiye, salah lijiye aur zaroorat ki dawai nazdeeki medical par book kar lijiye.",
    },
    href: "/register/user",
    note: { en: "Start straight away — no waiting", hi: "Turant shuru — koi wait nahi" },
    cta: { en: "Get started", hi: "Shuru kijiye" },
  },
];

/** How one sick person becomes an outbreak alert. */
const CHAIN = [
  {
    n: "1",
    who: "Resident",
    title: "Describes symptoms",
    body: "Chats with Sehat Sahayak. The assistant suggests medicines from the catalog — never a diagnosis.",
  },
  {
    n: "2",
    who: "Resident → shop",
    title: "Order + pickup code",
    body: "Booked at a nearby shop that actually stocks it. Nothing is counted yet.",
  },
  {
    n: "3",
    who: "Shop",
    title: "Code confirmed",
    body: "Stock drops now. This is the evidence that somebody was really ill.",
  },
  {
    n: "4",
    who: "Engine",
    title: "Medicine → illness",
    body: "Each medicine carries weights saying which illness it points at, and how specifically.",
  },
  {
    n: "5",
    who: "Engine",
    title: "Matched to reports",
    body: "Sales joined with ASHA field reports into a verdict, with its reasoning attached.",
  },
];

const VERDICT_KINDS = [
  {
    tag: "Confirmed",
    title: "Both sources agree.",
    body: "Field reports and medicine movement point at the same illness. Strongest available evidence — act on it.",
    accent: "var(--brand)",
  },
  {
    tag: "Medicine only",
    title: "Moving, unreported.",
    body: "People are ill and are not being counted. The clearest sign of under-reporting — send a survey team.",
    accent: "var(--danger)",
  },
  {
    tag: "ASHA only",
    title: "Reported, no movement.",
    body: "Either it is very early, or the count was overstated. Worth verifying before committing supplies.",
    accent: "var(--warn)",
  },
];

export default async function HomePage() {
  // Read on the server so the first paint is already in the reader's language.
  const t = translatorFor(localeFromCookieStore(await cookies()));

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <LandingHero />

      {/* ======================================================== live picture */}
      <section id="live" className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-4 pt-16 md:px-8 md:pt-24">
        <p className="js-mono text-[10.5px] tracking-[0.22em] text-brand">
          {t("The live picture · no login needed", "The live picture · no login needed")}
        </p>
        <h2 className="js-display mt-3.5 text-[clamp(1.9rem,4vw,2.5rem)] leading-tight">
          {t("What is happening in your area right now.", "Aapke ilaake me abhi kya chal raha hai.")}
        </h2>
        <p className="mt-3.5 max-w-[540px] text-sm leading-[1.65] text-muted">
          {t(
            "ASHA workers' field reports and medical shops' confirmed medicine pickups — a live outbreak picture built from both, rebuilt continuously.",
            "ASHA workers ki field reports aur medical shops ke confirmed medicine pickups — dono ko jodkar banaya gaya live outbreak picture, lagataar dobara banta hua."
          )}
        </p>

        <div className="mt-9">
          <PublicDashboard />
        </div>
      </section>

      {/* ====================================================== how it works */}
      <section id="how" className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-4 pt-24 md:px-8">
        <p className="js-mono text-[10.5px] tracking-[0.22em] text-brand">
          From one sick person to an outbreak alert
        </p>
        <h2 className="js-display mt-3.5 text-[clamp(1.9rem,4vw,2.5rem)]">
          The chain of evidence.
        </h2>

        <ol className="relative mt-11 grid gap-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-0">
          <span
            aria-hidden="true"
            className="absolute top-[23px] right-[10%] left-[10%] hidden h-px bg-[linear-gradient(90deg,transparent,#c8d6cc_15%,#c8d6cc_85%,transparent)] lg:block"
          />
          {CHAIN.map((step) => (
            <li key={step.n} data-reveal="" className="relative px-3 text-center">
              <span className="js-display mx-auto grid h-[46px] w-[46px] place-items-center rounded-full border border-brand-line bg-card text-[17px] font-semibold text-brand shadow-[0_2px_8px_rgba(18,32,25,0.06)]">
                {step.n}
              </span>
              <p className="js-mono mt-3.5 text-[9px] tracking-[0.16em] text-muted-2">{step.who}</p>
              <p className="mt-1.5 text-[13.5px] font-semibold text-ink">{step.title}</p>
              <p className="mt-1.5 text-[11.5px] leading-[1.6] text-muted-2">{step.body}</p>
            </li>
          ))}
        </ol>

        <div
          data-reveal=""
          className="relative mt-11 grid gap-9 overflow-hidden rounded-[20px] bg-night-2 p-8 text-[#e9f2ec] md:grid-cols-2 md:p-9"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_85%_0%,rgba(94,226,160,0.14),transparent_60%)]"
          />
          <div className="relative">
            <p className="js-mono text-[10px] tracking-[0.18em] text-neon">
              The decision that matters most
            </p>
            <p className="js-display mt-3 text-xl leading-snug text-white">
              Placing an order counts for nothing — only a confirmed pickup counts.
            </p>
            <p className="mt-3 text-[13px] leading-[1.7] text-[rgba(233,242,236,0.65)]">
              If orders counted, anyone could manufacture an outbreak by booking ten times.
              The two-step flow keeps the signal honest.
            </p>
          </div>
          <div className="relative">
            <p className="js-mono text-[10px] tracking-[0.18em] text-neon">The second one</p>
            <p className="js-display mt-3 text-xl leading-snug text-white">
              Everything is filed against the patient&apos;s village, never the shop&apos;s.
            </p>
            <p className="mt-3 text-[13px] leading-[1.7] text-[rgba(233,242,236,0.65)]">
              If the two streams landed in different places, the comparison itself would be
              wrong in both directions.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {VERDICT_KINDS.map((kind) => (
            <article
              key={kind.tag}
              data-reveal=""
              className="js-card js-lift p-6"
              style={{ borderTop: `3px solid ${kind.accent}` }}
            >
              <p className="js-mono text-[10px] tracking-[0.18em]" style={{ color: kind.accent }}>
                {kind.tag}
              </p>
              <p className="js-display mt-2.5 text-[22px] font-semibold text-ink">{kind.title}</p>
              <p className="mt-2.5 text-[13px] leading-[1.65] text-muted">{kind.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ================================================ the paracetamol problem */}
      <section
        id="specificity"
        className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-4 pt-24 md:px-8"
      >
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-reveal="">
            <p className="js-mono text-[10.5px] tracking-[0.22em] text-brand">
              Why a naive dashboard fails
            </p>
            <h2 className="js-display mt-3.5 text-[clamp(1.9rem,4vw,2.5rem)]">
              The paracetamol problem.
            </h2>
            <p className="mt-4 text-sm leading-[1.7] text-muted">
              Two medicines, both up 100%. On a plain bar chart they look identical — they mean
              entirely different things. Paracetamol is given for every fever there is; a
              papaya-leaf extract is bought for dengue and essentially nothing else. The
              strongest pattern of all is a specific medicine and a broad one accelerating
              together.
            </p>
            <p className="mt-4 text-sm leading-[1.7] text-muted">
              That is why every medicine in the catalog carries a weight per illness, and why
              the score is a sum of evidence rather than a percentage of sales.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <article
              data-reveal=""
              className="rounded-[20px] border border-brand bg-card p-6 shadow-[0_8px_28px_rgba(20,122,76,0.12)]"
            >
              <p className="js-mono text-[9.5px] tracking-[0.16em] text-muted-2">
                A real dengue cluster
              </p>
              <div className="mt-4 flex flex-col gap-2.5 text-[12.5px]">
                <MixRow name="Papaya-leaf syrup" delta="+86%" kind="Specific" strong />
                <MixRow name="Paracetamol 650" delta="+31%" kind="Broad" />
              </div>
              <div className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-4">
                <div>
                  <p className="text-xs font-semibold text-ink">DENGUE</p>
                  <p className="js-mono mt-1 text-[9.5px] tracking-[0.14em] text-brand">High</p>
                </div>
                <span className="js-num text-[40px] text-brand">77</span>
              </div>
            </article>

            <article data-reveal="" className="js-card p-6">
              <p className="js-mono text-[9.5px] tracking-[0.16em] text-muted-2">
                A bad flu week
              </p>
              <div className="mt-4 flex flex-col gap-2.5 text-[12.5px] text-muted-2">
                <MixRow name="Antacid" delta="+67%" kind="Broad" />
                <MixRow name="Paracetamol 650" delta="+34%" kind="Broad" />
                <MixRow name="Antihistamine" delta="+19%" kind="Broad" />
              </div>
              <div className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-4">
                <div>
                  <p className="text-xs font-semibold text-ink-2">VIRAL FEVER</p>
                  <p className="js-mono mt-1 text-[9.5px] tracking-[0.14em] text-warn">Medium</p>
                </div>
                <span className="js-num text-[40px] text-faint">37</span>
              </div>
            </article>

            <p className="text-xs leading-[1.6] text-muted-2 sm:col-span-2">
              The flu week shows the larger percentage and still scores lower — nothing specific
              moved there. A naive &ldquo;demand spiked&rdquo; dashboard would have raised a red
              alarm over a seasonal cold.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================== roles */}
      <section id="roles" className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-4 py-24 md:px-8">
        <p className="js-mono text-[10.5px] tracking-[0.22em] text-brand">
          Three roles · one engine
        </p>
        <h2 className="js-display mt-3.5 text-[clamp(1.9rem,4vw,2.5rem)]">
          {t("Want to contribute data? Pick your role.", "Data dena hai? Apna role chuniye.")}
        </h2>
        <p className="mt-3.5 max-w-2xl text-sm text-muted">
          {t("Already have an account? Go straight to", "Pehle se account hai to seedha")}{" "}
          <Link href="/login" className="font-semibold text-brand underline underline-offset-4">
            {t("sign in", "login")}
          </Link>
          {t(".", " kijiye.")}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {ROLE_REGISTRATIONS.map((role) => (
            <article key={role.href} data-reveal="" className="js-card js-lift flex flex-col p-6">
              <span className="js-display grid h-11 w-11 place-items-center rounded-[14px] bg-brand-tint text-[19px] font-semibold text-brand">
                {role.letter}
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">
                {typeof role.title === "string" ? role.title : t(role.title.en, role.title.hi)}
              </h3>
              <p className="js-mono mt-1 text-[9px] tracking-[0.16em] text-muted-2">
                {t(role.subtitle.en, role.subtitle.hi)}
              </p>
              <p className="mt-3 flex-1 text-[12.5px] leading-[1.65] text-muted">
                {t(role.description.en, role.description.hi)}
              </p>
              <p className="js-mono mt-4 text-[9px] tracking-[0.14em] text-faint">{t(role.note.en, role.note.hi)}</p>
              <Button asChild className="mt-4 w-full">
                <Link href={role.href}>{t(role.cta.en, role.cta.hi)}</Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================= footer */}
      <footer className="bg-night text-[rgba(238,245,240,0.55)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-5 px-4 py-9 text-xs md:px-8">
          <p className="flex flex-wrap items-center gap-3">
            <span className="js-display text-base font-semibold text-white">
              JanSetu<span className="text-neon">.</span>
            </span>
            <span>
              {t(
                "Surveillance and guidance — not medical advice. In an emergency call 108.",
                "Surveillance and guidance — not medical advice. Emergency me 108 par call kijiye."
              )}
            </span>
          </p>
          <p className="js-mono text-[10px] tracking-[0.14em]">
            Field reports · confirmed pickups · one verdict
          </p>
        </div>
      </footer>
    </main>
  );
}

/** One medicine line inside the specificity comparison. */
function MixRow({ name, delta, kind, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={strong ? "text-ink" : undefined}>{name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`js-code text-xs ${strong ? "text-brand" : "text-muted-2"}`}>{delta}</span>
        <span
          className={`js-mono rounded-full px-2 py-[3px] text-[8.5px] tracking-[0.1em] ${
            strong ? "bg-brand text-white" : "bg-line-soft text-muted-2"
          }`}
        >
          {kind}
        </span>
      </span>
    </div>
  );
}
