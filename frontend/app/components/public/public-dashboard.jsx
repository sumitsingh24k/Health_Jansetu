"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AreaGpsPanel from "@/app/components/public/area-gps-panel";
import dynamic from "next/dynamic";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import {
  CHART_INK,
  RISK_COLOR,
  SEQUENTIAL_GREEN,
  SEQUENTIAL_ORANGE,
  SERIES,
} from "@/app/lib/chart-theme";

const PublicRiskMap = dynamic(() => import("@/app/components/public/public-risk-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-[14px] border border-line bg-brand-tint-2 text-sm text-muted-2">
      Map load ho raha hai…
    </div>
  ),
});

function shortDate(value) {
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const RISK_LABEL = {
  HIGH: "Zyada khatra",
  MEDIUM: "Dhyan dein",
  LOW: "Kam khatra",
};

function StatTile({ label, value, hint, tone = "ink" }) {
  const valueColor = {
    ink: "text-ink",
    danger: "text-danger",
    warn: "text-warn",
    brand: "text-brand",
  }[tone];

  return (
    <article data-reveal="" className="js-card js-lift p-5">
      <p className="js-mono text-[9.5px] tracking-[0.16em] text-muted-2">{label}</p>
      <p className={`js-num mt-3 text-[38px] ${valueColor}`}>{value}</p>
      {hint ? <p className="mt-2 text-[11.5px] text-muted-2">{hint}</p> : null}
    </article>
  );
}

/** Shared tooltip so every chart on the page reads the same way. */
function ChartTooltip({ active, payload, label, unit = "" }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-[0_10px_30px_rgba(18,32,25,0.12)]">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey || entry.name} className="mt-1 text-muted">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: entry.color }}
          />
          {entry.name}: <span className="js-code font-semibold text-ink">{entry.value}</span>
          {unit}
        </p>
      ))}
    </div>
  );
}

function ChartCard({ title, description, children, footer, legend }) {
  return (
    <section data-reveal="" className="js-card p-6 md:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-1 text-xs text-muted-2">{description}</p> : null}
        </div>
        {legend ? <div className="flex flex-wrap gap-4">{legend}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
      {footer ? <p className="mt-3 text-xs leading-relaxed text-muted-2">{footer}</p> : null}
    </section>
  );
}

function LegendKey({ color, children }) {
  return (
    <span className="js-mono flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-muted-2">
      <span className="inline-block h-0.5 w-3.5" style={{ background: color }} />
      {children}
    </span>
  );
}

function EmptyNote({ children }) {
  return <p className="py-12 text-center text-sm text-muted-2">{children}</p>;
}

export default function PublicDashboard() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [areaFocus, setAreaFocus] = useState(null);

  const handleAreaFocus = useCallback((focus) => setAreaFocus(focus), []);
  const verdictByZone = areaFocus?.verdictByZone || null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/public/dashboard", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(payload?.message || "Data load nahi hua.");
        }
        setData(payload.data);
      } catch (caught) {
        if (!cancelled) setError(caught.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trendData = useMemo(
    () =>
      (data?.dailyTrend || []).map((entry) => ({
        ...entry,
        label: shortDate(entry.date),
      })),
    [data]
  );

  const diseaseData = useMemo(
    () =>
      (data?.diseaseDistribution || []).map((entry) => ({
        ...entry,
        label: titleCase(entry.disease),
      })),
    [data]
  );

  if (isLoading) {
    return (
      <div className="js-card p-10 text-center text-sm text-muted-2">
        Aapke ilaake ka data load ho raha hai…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-warn-line bg-warn-bg p-7 text-sm text-warn-ink">
        <p className="js-mono text-[10px] tracking-[0.18em]">Data abhi nahi mila</p>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  const summary = data?.summary || {};
  const hasCases = (data?.dailyTrend || []).some((entry) => entry.cases > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Naye case · 14 din" value={summary.totalCases ?? 0} hint={data?.scope} />
        <StatTile
          label="Serious case"
          value={summary.criticalCases ?? 0}
          hint="Escalation chahiye"
          tone="danger"
        />
        <StatTile
          label="High risk ilaake"
          value={summary.highRiskAreas ?? 0}
          hint={`${summary.activeAreas ?? 0} ilaake report kar rahe hain`}
          tone="warn"
        />
        <StatTile
          label="Dawai di gayi"
          value={summary.medicineUnitsDispensed ?? 0}
          hint="Sirf confirmed pickups"
          tone="brand"
        />
      </div>

      <ChartCard
        title="Rozana case trend"
        description="Pichhle 14 din me ASHA workers ne kitne naye case darj kiye."
        legend={
          <>
            <LegendKey color={SERIES[1]}>Naye case</LegendKey>
            <LegendKey color={SERIES[2]}>Serious</LegendKey>
          </>
        }
      >
        {hasCases ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: CHART_INK.label }}
                stroke={CHART_INK.axis}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_INK.label }}
                stroke={CHART_INK.axis}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_INK.label, paddingTop: 8 }}
                iconType="plainline"
              />
              <Line
                type="monotone"
                dataKey="cases"
                name="Naye case"
                stroke={SERIES[1]}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: SERIES[1] }}
                activeDot={{ r: 5, stroke: CHART_INK.surface, strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="critical"
                name="Serious"
                stroke={SERIES[2]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: SERIES[2] }}
                activeDot={{ r: 5, stroke: CHART_INK.surface, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyNote>Abhi is ilaake me koi report darj nahi hui.</EmptyNote>
        )}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Kaunsi bimari sabse zyada" description="Case count ke hisaab se.">
          {diseaseData.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, diseaseData.length * 34)}>
              <BarChart
                data={diseaseData}
                layout="vertical"
                margin={{ top: 4, right: 34, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={{ fontSize: 11, fill: CHART_INK.label }}
                  stroke={CHART_INK.axis}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_INK.grid }} />
                <Bar
                  dataKey="cases"
                  name="Case"
                  fill={SEQUENTIAL_GREEN[550]}
                  radius={[0, 5, 5, 0]}
                  maxBarSize={20}
                  label={{ position: "right", fontSize: 11, fill: CHART_INK.label }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyNote>Abhi koi data nahi.</EmptyNote>
          )}
        </ChartCard>

        <ChartCard
          title="Medicine supply signal"
          description="Kaunsi dawai sabse zyada uthi. Confirmed pickup hi gine gaye hain."
          footer="Ye numbers tabhi badhte hain jab medical shop pickup confirm karti hai — sirf order karne se nahi."
        >
          {data?.medicineDemand?.length ? (
            <ResponsiveContainer
              width="100%"
              height={Math.max(180, data.medicineDemand.length * 34)}
            >
              <BarChart
                data={data.medicineDemand}
                layout="vertical"
                margin={{ top: 4, right: 34, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="brand"
                  width={104}
                  tick={{ fontSize: 11, fill: CHART_INK.label }}
                  stroke={CHART_INK.axis}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip unit=" unit" />} cursor={{ fill: CHART_INK.grid }} />
                <Bar
                  dataKey="units"
                  name="Units"
                  fill={SEQUENTIAL_ORANGE}
                  radius={[0, 5, 5, 0]}
                  maxBarSize={20}
                  label={{ position: "right", fontSize: 11, fill: CHART_INK.label }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyNote>Abhi koi confirmed medicine pickup nahi hua.</EmptyNote>
          )}
        </ChartCard>
      </div>

      <section data-reveal="" className="js-card p-6 md:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Red zone map</h3>
            <p className="mt-1 text-xs text-muted-2">
              Har spot ek ilaaka hai. Rang risk batata hai — label bhi likha hai.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["HIGH", "MEDIUM", "LOW"].map((level) => (
              <span
                key={level}
                className="js-mono inline-flex items-center gap-1.5 rounded-full border border-line bg-brand-tint-2 px-2.5 py-1 text-[9px] tracking-[0.12em] text-muted"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: RISK_COLOR[level] }}
                />
                {RISK_LABEL[level]}
              </span>
            ))}
          </div>
        </div>

        <PublicRiskMap
          zones={data?.riskZones || []}
          focus={areaFocus}
          verdictByZone={verdictByZone}
        />
      </section>

      {/* Sits right under the map because it is the same question, asked personally:
          the map shows every area, this shows yours. */}
      <AreaGpsPanel onFocusArea={handleAreaFocus} />

      <section data-reveal="" className="js-card p-6 md:p-7">
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="js-mono text-[10px] tracking-[0.16em] text-brand underline underline-offset-4 transition-colors hover:text-brand-strong"
        >
          {showTable ? "Table chhupaiye" : "Poora data table me dekhiye"}
        </button>

        {showTable ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">
                Ilaake ke hisaab se case, serious case aur risk level
              </caption>
              <thead>
                <tr className="js-mono border-b border-line text-left text-[9px] tracking-[0.14em] text-faint">
                  <th scope="col" className="py-2.5 pr-3">
                    Ilaaka
                  </th>
                  <th scope="col" className="py-2.5 pr-3">
                    Zila
                  </th>
                  <th scope="col" className="py-2.5 pr-3">
                    Bimari
                  </th>
                  <th scope="col" className="py-2.5 pr-3 text-right">
                    Case
                  </th>
                  <th scope="col" className="py-2.5 pr-3 text-right">
                    Serious
                  </th>
                  <th scope="col" className="py-2.5">
                    Risk
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.riskZones || []).map((zone) => (
                  <tr
                    key={`${zone.district}-${zone.village}`}
                    className="border-b border-line-soft transition-colors hover:bg-card-hover"
                  >
                    <td className="py-2.5 pr-3 font-medium text-ink">{zone.village}</td>
                    <td className="py-2.5 pr-3 text-muted">{zone.district}</td>
                    <td className="py-2.5 pr-3 text-muted">{titleCase(zone.topDisease)}</td>
                    <td className="js-code py-2.5 pr-3 text-right text-xs">{zone.cases}</td>
                    <td className="js-code py-2.5 pr-3 text-right text-xs">{zone.criticalCases}</td>
                    <td className="py-2.5">
                      <span className="js-mono inline-flex items-center gap-1.5 text-[9.5px] tracking-[0.12em] text-muted">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: RISK_COLOR[zone.riskLevel] }}
                        />
                        {zone.riskLevel}
                      </span>
                    </td>
                  </tr>
                ))}
                {!(data?.riskZones || []).length ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-2">
                      Abhi koi ilaaka report nahi kar raha.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <p className="flex items-start gap-2.5 rounded-[16px] border border-line bg-brand-tint-2 px-4 py-3 text-xs leading-relaxed text-muted">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-muted-2" />
        Ye data ASHA workers ki field reports aur medical shops ke confirmed pickups se banta
        hai. Ye doctor ki salah ki jagah nahi leta. Takleef ho to nazdeeki PHC jaiye.
      </p>
    </div>
  );
}
