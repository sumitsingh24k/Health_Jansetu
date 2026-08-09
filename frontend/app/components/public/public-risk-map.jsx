"use client";

import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { RISK_COLOR } from "@/app/lib/chart-theme";

const INDIA_CENTER = [22.9734, 78.6569];

/**
 * Flies to the area the visitor's GPS resolved to.
 *
 * Keyed on the coordinates rather than the object so a re-render cannot yank the map
 * away from wherever the visitor has since panned it — they asked to be taken there
 * once, not to be pinned there.
 */
function FocusOnArea({ latitude, longitude }) {
  const map = useMap();

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.flyTo([latitude, longitude], Math.max(map.getZoom(), 9), { duration: 1.1 });
  }, [map, latitude, longitude]);

  return null;
}

/** Bigger circle for more cases, floored so a 1-case area is still clickable. */
function radiusForCases(cases) {
  return Math.max(8, Math.min(26, 8 + Math.sqrt(cases) * 2.4));
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Read-only outbreak map for visitors with no account.
 *
 * Circles are drawn per area, never per report, so no individual case can be traced
 * back to a household from this view.
 */
export default function PublicRiskMap({ zones = [], focus = null, verdictByZone = null }) {
  const plottable = useMemo(
    () =>
      zones.filter(
        (zone) => Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude)
      ),
    [zones]
  );

  // The visitor's own district is drawn heavier, but every other district stays on the
  // map — knowing your block is calm matters less if you cannot see the one next door.
  const focusDistrict = focus?.district || null;

  const center = useMemo(() => {
    if (!plottable.length) return INDIA_CENTER;
    const hottest = plottable.reduce((best, zone) => (zone.cases > best.cases ? zone : best));
    return [hottest.latitude, hottest.longitude];
  }, [plottable]);

  if (!plottable.length) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-[14px] border border-line bg-brand-tint-2 text-sm text-muted-2">
        Abhi kisi ilaake ka GPS data nahi mila.
      </div>
    );
  }

  return (
    <div className="h-[360px] overflow-hidden rounded-[14px] border border-line md:h-[440px]">
      <MapContainer
        center={center}
        zoom={plottable.length > 1 ? 7 : 10}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <FocusOnArea latitude={focus?.latitude} longitude={focus?.longitude} />

        {/* Where the visitor actually is, so the coloured circle nearby reads as
            "your area" rather than as an anonymous dot. */}
        {Number.isFinite(focus?.userLatitude) && Number.isFinite(focus?.userLongitude) ? (
          <Circle
            center={[focus.userLatitude, focus.userLongitude]}
            radius={900}
            pathOptions={{ color: "#147a4c", weight: 2, fillColor: "#147a4c", fillOpacity: 0.18 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="text-xs font-semibold">Aap yahan hain</span>
            </Tooltip>
          </Circle>
        ) : null}

        {plottable.map((zone) => {
          const isFocused = focusDistrict ? zone.district === focusDistrict : false;
          const verdict = verdictByZone?.[`${zone.district}|${zone.village}`] || null;

          return (
          <CircleMarker
            key={`${zone.district}-${zone.village}`}
            center={[zone.latitude, zone.longitude]}
            radius={radiusForCases(zone.cases) * (isFocused ? 1.15 : 1)}
            pathOptions={{
              color: isFocused ? "#08110d" : "#ffffff",
              weight: isFocused ? 3 : 2,
              fillColor: RISK_COLOR[zone.riskLevel] || RISK_COLOR.LOW,
              fillOpacity: focusDistrict && !isFocused ? 0.4 : 0.75,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="text-xs font-semibold">
                {zone.village} — {zone.cases} case ({verdict || zone.riskLevel})
              </span>
            </Tooltip>

            <Popup>
              <div className="min-w-[190px] space-y-1 text-sm">
                <p className="js-display text-[15px] text-ink">
                  {zone.village}, {zone.district}
                </p>
                <p>
                  <strong>Risk:</strong>{" "}
                  <span className="font-semibold">{verdict || zone.riskLevel}</span>
                </p>
                <p>
                  <strong>Naye case:</strong> {zone.cases}
                </p>
                <p>
                  <strong>Serious:</strong> {zone.criticalCases}
                </p>
                <p>
                  <strong>Sabse zyada:</strong> {titleCase(zone.topDisease)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
