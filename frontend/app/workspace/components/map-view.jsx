"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import HealthMap from "@/app/components/maps/health-map";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { Panel } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";
import { RISK_COLOR } from "@/app/lib/chart-theme";

const LEGEND = [
  ["HIGH", "High"],
  ["MEDIUM", "Medium"],
  ["LOW", "Safe"],
];

export function MapView() {
  const {
    user,
    reports,
    mapEntities,
    riskZones,
    selectedRegion,
    setSelectedRegion,
    scopedReports,
    isLoadingReports,
    prediction,
  } = useWorkspace();

  const velocity = prediction?.medicine_velocity;
  const topRisk = velocity?.disease_risk?.[0] || null;
  const zoneTone =
    topRisk?.band === "HIGH" ? "danger" : topRisk?.band === "MEDIUM" ? "warn" : "brand";

  return (
    <>
      <WorkspaceHeader
        user={user}
        title="Outbreak map."
        subtitle="Explore cases, clusters and risk zones. Select a region to focus every insight on the trends page."
      />

      {/* A coloured zone with no explanation is just a colour. This says, in named
          medicines, what actually made this area look the way it does. */}
      {velocity?.zone_reason ? (
        <Panel tone={zoneTone} title="Ye area aisa kyun dikh raha hai">
          <p className="text-sm leading-[1.7] text-ink-2">{velocity.zone_reason}</p>
          {topRisk ? (
            <p className="mt-2.5 text-xs leading-[1.7] text-muted">{topRisk.explanation}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted-2">
            Poora chart{" "}
            <Link
              href="/workspace/trends"
              className="font-semibold text-brand underline underline-offset-2"
            >
              Trends
            </Link>{" "}
            par hai — kaunsi dawai kitni tez biki aur kis bimari ka ishara hai.
          </p>
        </Panel>
      ) : null}

      <section data-reveal="" className="js-card overflow-hidden p-6 md:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Live map</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-2">
              <Clock3 size={12} />
              {isLoadingReports
                ? "Loading reports…"
                : `${scopedReports.length} visible reports`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LEGEND.map(([level, label]) => (
              <span
                key={level}
                className="js-mono inline-flex items-center gap-1.5 rounded-full border border-line bg-brand-tint-2 px-2.5 py-1 text-[9px] tracking-[0.12em] text-muted"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: RISK_COLOR[level] }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        <HealthMap
          reports={reports}
          entities={mapEntities}
          riskZones={riskZones}
          role={user.role}
          userLocation={user.location || null}
          selectedRegion={selectedRegion}
          onRegionSelect={setSelectedRegion}
        />
      </section>
    </>
  );
}
