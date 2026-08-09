"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Apple,
  Dumbbell,
  Loader2,
  Package,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, Panel, ScreenHeader, TabNav } from "@/app/components/screen-ui";

const RESIDENT_TABS = [
  { href: "/sehat", label: "Sehat Sahayak" },
  { href: "/sehat/profile", label: "Mera health record" },
];

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ListCard({ icon: Icon, title, items, tone = "plain", hint }) {
  if (!items?.length) return null;

  const shell = {
    plain: "js-card",
    brand: "rounded-[20px] border border-brand-line bg-brand-tint",
    warn: "rounded-[20px] border border-warn-line bg-warn-bg",
    danger: "rounded-[20px] border border-danger-line bg-danger-bg",
  }[tone];

  const headingColor = tone === "danger" ? "text-danger-ink" : "text-ink";

  return (
    <section data-reveal="" className={`${shell} p-5`}>
      <h2 className={`flex items-center gap-2 text-sm font-semibold ${headingColor}`}>
        <Icon size={15} />
        {title}
      </h2>
      {hint ? <p className="mt-1 text-xs text-muted-2">{hint}</p> : null}
      <ol className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2.5 text-sm leading-[1.65] text-ink-2">
            <span className="js-code shrink-0 text-xs text-brand">{index + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ProfileClient({ user }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openEpisode, setOpenEpisode] = useState(null);

  const load = useCallback(async (refresh = false) => {
    const response = await fetch(`/api/profile${refresh ? "?refresh=true" : ""}`, {
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast.error("Profile load nahi hui", { description: body?.message });
      return;
    }
    setData(body.data);
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await load(true);
      toast.success("Report update ho gayi");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function viewEpisode(id) {
    const response = await fetch(`/api/episodes/${id}`, { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setOpenEpisode(body.data);
  }

  async function deleteEpisode(id) {
    const response = await fetch(`/api/episodes/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast.error("Delete nahi hua", { description: body?.message });
      return;
    }

    toast.success("Record hata diya gaya");
    setOpenEpisode(null);
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const areaLabel = user?.location?.village
    ? `${user.location.village}${user.location.district ? `, ${user.location.district}` : ""}`
    : "Apna ilaaka";

  const header = (
    <>
      <ScreenHeader
        kicker={`Resident · ${areaLabel}`}
        title="Mera health record."
        subtitle="Har takleef alag se save hai. Isi record se aapki apni report banti hai — doctor ko dikhane ke liye."
        actions={
          data?.hasHistory ? (
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Report refresh
            </Button>
          ) : null
        }
      />
      <TabNav items={RESIDENT_TABS} activeHref="/sehat/profile" />
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-7">
        {header}
        <p className="js-card p-10 text-center text-sm text-muted-2">
          Aapka record load ho raha hai…
        </p>
      </div>
    );
  }

  if (!data?.hasHistory) {
    return (
      <div className="space-y-7">
        {header}
        <section className="js-card p-10 text-center">
          <Activity size={28} className="mx-auto text-brand" />
          <h2 className="js-display mt-3 text-xl text-ink">Abhi koi record nahi</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            {data?.message}
          </p>
          <Button asChild className="mt-5">
            <Link href="/sehat">Sehat Sahayak se baat kijiye</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <>
      {openEpisode ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-night/50 p-4 backdrop-blur-sm">
          <div className="js-card w-full max-w-2xl p-6 shadow-[0_40px_90px_rgba(8,17,13,0.35)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="js-display text-lg text-ink">{openEpisode.title}</h2>
                <p className="js-mono mt-1.5 text-[9px] tracking-[0.14em] text-muted-2">
                  {formatDate(openEpisode.startedAt)}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenEpisode(null)}>
                Band
              </Button>
            </div>

            <div className="mt-4 max-h-[55vh] space-y-2.5 overflow-y-auto">
              {openEpisode.messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[16px] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      message.role === "user"
                        ? "bg-ink text-white"
                        : "border border-line bg-brand-tint-2 text-ink-2"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => deleteEpisode(openEpisode.id)}
              className="mt-5 border-danger-line text-danger-ink hover:border-danger hover:bg-danger-bg hover:text-danger-ink"
            >
              <Trash2 size={14} />
              Ye record hata dijiye
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-7">
        {header}

        <section data-reveal="" className="js-card p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="js-display text-xl text-ink">{user.name}</h2>
              <p className="js-mono mt-1.5 text-[9px] tracking-[0.14em] text-muted-2">
                {areaLabel} · {data.totalEpisodes} record
              </p>
            </div>
            {data.generatedAt ? (
              <Chip>
                {formatDate(data.generatedAt)}
                {data.episodesUsed ? ` · ${data.episodesUsed} record` : ""}
              </Chip>
            ) : null}
          </div>

          {data.headline ? (
            <p className="mt-4 rounded-[14px] bg-brand-tint px-4 py-3 text-sm font-semibold text-brand-strong">
              {data.headline}
            </p>
          ) : null}
          {data.overview ? (
            <p className="mt-3 text-sm leading-[1.7] text-ink-2">{data.overview}</p>
          ) : null}
          {data.message ? (
            <p className="mt-3 rounded-[12px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-xs text-warn-ink">
              {data.message}
            </p>
          ) : null}
        </section>

        {data.patterns?.length ? (
          <Panel
            title="Baar-baar kya ho raha hai"
            description="Ek se zyada baar dikhe hue pattern, unke saboot ke saath."
          >
            <div className="space-y-2.5">
              {data.patterns.map((item, index) => (
                <div key={index} className="rounded-[14px] border border-line bg-brand-tint-2 p-4">
                  <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                    <Repeat size={14} className="mt-0.5 shrink-0 text-brand" />
                    {item.pattern}
                  </p>
                  {item.evidence ? (
                    <p className="js-mono mt-1.5 text-[9px] tracking-[0.12em] text-muted-2">
                      {item.evidence}
                    </p>
                  ) : null}
                  {item.whatItMeans ? (
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.whatItMeans}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <ListCard
          icon={ShieldCheck}
          title="Aage ye bimari na ho, iske liye"
          items={data.preventionPlan}
          tone="brand"
        />

        <div className="grid gap-5 md:grid-cols-2">
          <ListCard icon={Dumbbell} title="Halki kasrat" items={data.exercisePlan} />
          <ListCard icon={Apple} title="Khaan-paan" items={data.dietAdvice} />
        </div>

        <ListCard
          icon={AlertTriangle}
          title="In nishaniyon par doctor ke paas jaiye"
          items={data.warningSigns}
          tone="danger"
        />

        <div className="grid gap-5 md:grid-cols-2">
          <ListCard
            icon={Package}
            title="Ghar me ye rakhiye"
            items={data.homeKit}
            hint="Aapke saath jo baar-baar hota hai, uske hisaab se."
          />
          <ListCard
            icon={AlertTriangle}
            title="Kis wajah se dobara ho sakta hai"
            items={data.riskFactors}
            tone="warn"
          />
        </div>

        {data.doctorNotes ? (
          <Panel title="Doctor ko ye bataiye">
            <p className="flex items-start gap-2.5 text-sm leading-[1.7] text-ink-2">
              <Stethoscope size={15} className="mt-0.5 shrink-0 text-brand" />
              {data.doctorNotes}
            </p>
          </Panel>
        ) : null}

        <Panel
          title="Mera record"
          description="Kisi bhi record par tap karke poori baat-cheet dekh sakte hain ya use hata sakte hain."
        >
          <div className="space-y-2">
            {data.timeline.map((episode) => (
              <button
                key={episode.id}
                type="button"
                onClick={() => viewEpisode(episode.id)}
                className="flex w-full items-start justify-between gap-3 rounded-[14px] border border-line bg-brand-tint-2 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{episode.title}</p>
                  {episode.conditionGuess ? (
                    <p className="mt-0.5 truncate text-xs text-muted">{episode.conditionGuess}</p>
                  ) : null}
                  {episode.symptoms?.length ? (
                    <p className="mt-1 truncate text-[11px] text-muted-2">
                      {episode.symptoms.slice(0, 4).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="js-code text-[10.5px] text-muted">{formatDate(episode.startedAt)}</p>
                  <p className="js-mono mt-1 text-[8.5px] tracking-[0.12em] text-brand">
                    {episode.status === "ACTIVE" ? "Chal raha hai" : "Poora hua"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        {data.medicines?.length ? (
          <Panel title="Jo dawai aapne li">
            <div className="space-y-1.5">
              {data.medicines.map((medicine, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 border-b border-line-soft px-1 py-2.5 last:border-b-0"
                >
                  <span className="text-[13px] font-medium text-ink">
                    {medicine.brand} × {medicine.quantity}
                  </span>
                  <span className="js-code text-[10.5px] text-muted-2">
                    {formatDate(medicine.pickedUpAt)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <p className="rounded-[16px] border border-line bg-brand-tint-2 px-4 py-3 text-xs leading-relaxed text-muted">
          Ye report aapki apni baat-cheet se bani hai. Ye doctor ki jaanch ki jagah nahi leti —
          isse doctor ko dikhaiye, uske bajay mat istemal kijiye.
        </p>
      </div>
    </>
  );
}
