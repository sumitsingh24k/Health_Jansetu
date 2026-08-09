"use client";

import { Copy, LocateFixed, MapPin, ShieldCheck, Users } from "lucide-react";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import { useWorkspace } from "@/app/workspace/workspace-context";
import {
  formatDistance,
  locationLabel,
  normalizeText,
} from "@/app/workspace/workspace-shared";
import { AdminSidebarNav } from "@/app/workspace/components/admin-sidebar-nav";
import { Panel, StatCard } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamView() {
  const {
    user,
    filters,
    setFilters,
    loadReports,
    createAshaForm,
    setCreateAshaForm,
    handleCreateAsha,
    isCreatingAsha,
    ashaLookup,
    setAshaLookup,
    ashaDirectory,
    ashaSpotlight,
    isLoadingAshaDirectory,
    loadAshaDirectory,
    applyCreateLocationToLookup,
    handleCopyAshaId,
  } = useWorkspace();

  return (
    <>
      <WorkspaceHeader
        user={user}
        title="ASHA &amp; approvals."
        subtitle="Create workers, filter the board, and remember who covers which village."
      />

      <section className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <AdminSidebarNav />

        <div className="space-y-6">
          <section id="create-asha" className="grid gap-5 lg:grid-cols-2">
            <form
              onSubmit={handleCreateAsha}
              data-reveal=""
              className="js-card space-y-4 p-6 md:p-7"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={17} className="text-brand" />
                <h2 className="text-[15px] font-semibold text-ink">Create ASHA worker</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Full Name"
                  value={createAshaForm.name}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, name: event.target.value }))
                  }
                 
                  required
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={createAshaForm.email}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, email: event.target.value }))
                  }
                 
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={createAshaForm.password}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, password: event.target.value }))
                  }
                 
                  required
                />

                <AreaSearchFields
                  value={{
                    village: createAshaForm.village,
                    district: createAshaForm.district,
                    latitude: createAshaForm.latitude,
                    longitude: createAshaForm.longitude,
                  }}
                  onChange={(patch) =>
                    setCreateAshaForm((current) => ({
                      ...current,
                      ...patch,
                    }))
                  }
                  className="md:col-span-2"
                />
              </div>

              <Button type="submit" disabled={isCreatingAsha} className="w-full">
                {isCreatingAsha ? "Creating…" : "Create ASHA worker"}
              </Button>
            </form>

            <section data-reveal="" className="js-card space-y-3.5 p-6 md:p-7">
              <h2 className="text-[15px] font-semibold text-ink">Admin map filters</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  placeholder="District"
                  value={filters.district}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, district: event.target.value }))
                  }
                 
                />
                <Input
                  placeholder="Village"
                  value={filters.village}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, village: event.target.value }))
                  }
                 
                />
                <Input
                  placeholder="Disease"
                  value={filters.disease}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, disease: event.target.value }))
                  }
                 
                />
                <select
                  value={filters.reporterRole}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, reporterRole: event.target.value }))
                  }
                  aria-label="Source"
                  className="h-10 rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none transition-colors hover:border-brand-line focus:border-brand"
                >
                  <option value="">All sources</option>
                  <option value="ASHA">ASHA</option>
                  <option value="MEDICAL">MEDICAL</option>
                </select>
              </div>
              <Button type="button" onClick={() => loadReports(filters)}>
                Apply filters
              </Button>
              <p className="text-xs leading-relaxed text-muted-2">
                Admin can inspect outbreak markers for any location using district, village, and
                disease filters.
              </p>
            </section>
          </section>

          <section
            id="memory"
            data-reveal=""
            className="rounded-[20px] border border-brand-line bg-brand-tint p-6 md:p-7"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="js-mono inline-flex items-center gap-2 text-[9.5px] tracking-[0.18em] text-brand-strong">
                  <Users size={13} />
                  ASHA memory board
                </p>
                <h2 className="js-display mt-2.5 text-xl text-ink">
                  Remember ASHA IDs by exact or nearby location
                </h2>
              </div>
              <Button type="button" variant="outline" onClick={() => loadAshaDirectory(ashaLookup)}>
                <LocateFixed size={15} />
                Refresh board
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-6">
              <Input
                placeholder="District"
                value={ashaLookup.district}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, district: event.target.value }))
                }
                className="md:col-span-2"
              />
              <Input
                placeholder="Village"
                value={ashaLookup.village}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, village: event.target.value }))
                }
                className="md:col-span-2"
              />
              <Input
                type="number"
                min="1"
                max="50"
                step="1"
                placeholder="Nearby Radius (km)"
                value={ashaLookup.radiusKm}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, radiusKm: event.target.value }))
                }
                
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextLookup = applyCreateLocationToLookup();
                  loadAshaDirectory(nextLookup);
                }}
              >
                Use Create Form Location
              </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <StatCard reveal={false} label="Total ASHA" value={ashaDirectory.data.length} />
              <StatCard
                reveal={false}
                label="Exact location"
                value={ashaDirectory.exact.length}
                tone="brand"
              />
              <StatCard
                reveal={false}
                label="Nearby match"
                value={ashaDirectory.nearby.length}
                tone="brand"
              />
              <StatCard
                reveal={false}
                label="Search radius"
                value={`${ashaDirectory.context?.radiusKm || 12} km`}
              />
            </div>

            {isLoadingAshaDirectory ? (
              <p className="mt-5 text-sm text-muted-2">Loading ASHA memory board…</p>
            ) : null}

            {!isLoadingAshaDirectory && ashaSpotlight.length === 0 ? (
              <p className="mt-5 text-sm leading-relaxed text-muted-2">
                No ASHA workers found for this filter. Try a district-only search for wider nearby
                results.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ashaSpotlight.map((worker) => {
                const districtMatches =
                  normalizeText(worker?.location?.district) ===
                  normalizeText(ashaDirectory.context?.district);
                const villageMatches =
                  normalizeText(worker?.location?.village) === normalizeText(ashaDirectory.context?.village);

                const matchTag =
                  districtMatches && villageMatches
                    ? "Exact area"
                    : districtMatches
                      ? "Nearby district"
                      : "Other area";

                return (
                  <article key={worker.id} className="js-card js-lift p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">{worker.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-2">{worker.email}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyAshaId(worker.workerId)}
                        className="h-auto gap-1 px-3 py-1.5 text-[11px]"
                      >
                        <Copy size={13} />
                        ID
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="js-code rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold text-white">
                        {worker.workerId || "NO_ID"}
                      </span>
                      <span className="js-mono rounded-full bg-brand-tint-2 px-2.5 py-1 text-[8.5px] tracking-[0.12em] text-muted">
                        {matchTag}
                      </span>
                      {worker.distanceKm !== null ? (
                        <span className="js-code rounded-full bg-brand-tint px-2.5 py-1 text-[10px] text-brand-strong">
                          {formatDistance(worker.distanceKm)}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3.5 inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                      <MapPin size={12} />
                      {locationLabel(worker.location)}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

        </div>
      </section>
    </>
  );
}
