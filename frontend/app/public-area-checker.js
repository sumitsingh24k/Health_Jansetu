"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Crosshair, Hospital, Loader2, MapPin, Pill } from "lucide-react";

function riskTone(level) {
  if (level === "HIGH") return "border-danger-line bg-danger-bg text-danger-ink";
  if (level === "MEDIUM") return "border-warn-line bg-warn-bg text-warn-ink";
  return "border-brand-line bg-brand-tint text-brand-strong";
}

export default function PublicAreaChecker() {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const risk = result?.risk || null;
  const publicView = result?.publicView || null;
  const nearby = publicView?.nearby || result?.nearby || { hospitals: [], janaushadhi: [], privateStores: [] };
  const riskClass = useMemo(() => riskTone(risk?.level), [risk?.level]);

  async function handleCheck(event) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    setResult(null);

    try {
      const params = new URLSearchParams({
        latitude,
        longitude,
        radiusKm,
      });
      const response = await fetch(`/api/public/area-insight?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Could not fetch area insight");
      }
      setResult(payload);
    } catch (fetchError) {
      setError(fetchError?.message || "Could not fetch area insight");
    } finally {
      setIsLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator?.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
      },
      (geoError) => {
        setError(geoError?.message || "Could not capture current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <section className="js-card p-6 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="js-display text-[26px] text-ink">Public Area Safety Checker</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Enter location and get only useful outputs: risk, precautions, nearby care, and medicines.
          </p>
        </div>
      </div>

      <form onSubmit={handleCheck} className="mt-4 grid gap-3 md:grid-cols-4">
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          required
        />
        <input
          type="number"
          min="2"
          max="25"
          step="1"
          placeholder="Radius (km)"
          value={radiusKm}
          onChange={(event) => setRadiusKm(event.target.value)}
          className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          required
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card px-3 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-strong"
          >
            <Crosshair size={14} />
            Use GPS
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-3 py-2.5 text-sm font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            Check
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-[14px] border border-danger-line bg-danger-bg px-3.5 py-2.5 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <article className={`rounded-[16px] border px-3.5 py-3 ${riskClass}`}>
              <p className="js-mono text-[8.5px] tracking-[0.14em]">Risk decision</p>
              <p className="js-num mt-1.5 text-[22px]">{publicView?.riskLevel || risk?.level || "Low Risk Area"}</p>
            </article>
            <article className="rounded-[16px] border border-line bg-brand-tint-2 px-3.5 py-3">
              <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">Trend</p>
              <p className="js-num mt-1.5 text-[24px] text-warn-ink">{publicView?.trend || risk?.trend || "Stable"}</p>
            </article>
            <article className="rounded-[16px] border border-line bg-brand-tint-2 px-3.5 py-3">
              <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">Supply Status</p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{publicView?.supply || "Stock Check"}</p>
            </article>
            <article className="rounded-[16px] border border-line bg-brand-tint-2 px-3.5 py-3">
              <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">Price Decision</p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{publicView?.price || "Price Normal"}</p>
            </article>
          </div>

          <article className="rounded-[16px] border border-line bg-card p-4">
            <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">AI Decision</p>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">{publicView?.supplyMessage || risk?.prediction}</p>
            <p className="mt-2 text-[11.5px] font-semibold text-brand">{publicView?.savingsMessage || "Prefer affordable nearby options."}</p>
          </article>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <AlertTriangle size={13} />
                Precautions
              </p>
              <div className="mt-2 space-y-1">
                {(publicView?.precautions || result?.precautions || []).map((item, index) => (
                  <p key={`${item}-${index}`} className="rounded-[10px] border border-line bg-brand-tint-2 px-2.5 py-1.5 text-xs text-ink-2">
                    {item}
                  </p>
                ))}
              </div>
            </article>

            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <Pill size={13} />
                Medicine Need
              </p>
              <div className="mt-2 space-y-1">
                {(result?.medicineDemand || []).slice(0, 4).map((item) => (
                  <div key={item.medicine} className="flex items-center justify-between rounded-[10px] border border-line bg-brand-tint-2 px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-ink">{item.medicine}</span>
                    <span className="js-num text-ink-2">
                      {item.expectedUnitsNext3Days} ({item.availability})
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <Pill size={13} />
                Price Comparison
              </p>
              {result?.priceComparison ? (
                <div className="mt-2 rounded-[14px] border border-warn-line bg-warn-bg px-3.5 py-2.5">
                  <p className="text-[13px] font-semibold text-ink">{result.priceComparison.medicine}</p>
                  <p className="js-code mt-1.5 text-[11px] text-ink-2">
                    {`Rs ${result.priceComparison.privatePrice} -> Rs ${result.priceComparison.janaushadhiPrice}`}
                  </p>
                  <p className="mt-1.5 text-[11.5px] font-semibold text-brand">
                    {publicView?.savingsMessage || `Save Rs ${result.priceComparison.savings}`}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11.5px] text-muted-2">
                  Price comparison appears when medical reports include benchmark pricing.
                </p>
              )}
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <Hospital size={13} />
                Nearby Hospitals
              </p>
              <div className="mt-2.5 space-y-1.5 text-[11.5px] text-ink-2">
                {nearby.hospitals.length === 0 ? (
                  <p>No hospitals found in range.</p>
                ) : (
                  nearby.hospitals.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <MapPin size={13} />
                Nearby Janaushadhi
              </p>
              <div className="mt-2.5 space-y-1.5 text-[11.5px] text-ink-2">
                {nearby.janaushadhi.length === 0 ? (
                  <p>No centers found in range.</p>
                ) : (
                  nearby.janaushadhi.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
            <article className="rounded-[16px] border border-line bg-card p-4">
              <p className="inline-flex items-center gap-2 js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                <Pill size={13} />
                Nearby Medical Stores
              </p>
              <div className="mt-2.5 space-y-1.5 text-[11.5px] text-ink-2">
                {nearby.privateStores.length === 0 ? (
                  <p>No private stores found in range.</p>
                ) : (
                  nearby.privateStores.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
