"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { parseCoordinate } from "@/app/lib/location-utils";
import { canSeeSupplyInsights } from "@/app/lib/auth/role-home";
import {
  DEFAULT_AI_INSIGHTS,
  EMPTY_MAP_ENTITIES,
  normalizeText,
  parseMedicineSalesText,
} from "@/app/workspace/workspace-shared";
import {
  DISEASE_CODES,
  diseaseLabel,
  mergeParsedIntoForm,
  normalizeDiseaseInput,
} from "@/app/lib/report-nlp";

const WorkspaceContext = createContext(null);

/** How often an open workspace re-pulls reports so the map stays live. */
const LIVE_REFRESH_MS = 20000;

export function WorkspaceProvider({ user, children }) {
  const didBootstrapRef = useRef(false);
  /** True once a prediction has been shown, so later refreshes can run silently. */
  const hasPredictionRef = useRef(false);
  const [reports, setReports] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [filters, setFilters] = useState({
    district: "",
    village: "",
    disease: "",
    reporterRole: "",
    severity: "",
    startDate: "",
    endDate: "",
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  // Ticks on every live refresh. The medicine-velocity prediction is driven by shop
  // stock movements, not by field reports, so a pickup confirmed at a counter changes
  // nothing about the report list — without this counter the zone reason would sit
  // stale until an ASHA happened to file something.
  const [liveTick, setLiveTick] = useState(0);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dashboardAlerts, setDashboardAlerts] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [aiInsights, setAiInsights] = useState(() => ({ ...DEFAULT_AI_INSIGHTS }));
  const [mapEntities, setMapEntities] = useState(() => ({ ...EMPTY_MAP_ENTITIES }));
  const [dailyTrend, setDailyTrend] = useState([]);
  const [diseaseDistribution, setDiseaseDistribution] = useState([]);
  const [isCreatingAsha, setIsCreatingAsha] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState("");
  const [createAshaForm, setCreateAshaForm] = useState({
    name: "",
    email: "",
    password: "",
    village: "",
    district: "",
    latitude: "",
    longitude: "",
  });
  const [reportForm, setReportForm] = useState({
    disease: "",
    householdsVisited: "",
    newCases: "",
    criticalCases: "",
    medicineSalesText: "",
    notes: "",
    reportDate: "",
    spokenPlace: "",
    latitude: user?.location?.latitude?.toString() || "",
    longitude: user?.location?.longitude?.toString() || "",
  });
  // What the workspace is currently zoomed in on after a voice/text capture:
  // { disease, district, village, latitude, longitude, source: "capture" | "submitted" }
  const [reportFocus, setReportFocus] = useState(null);
  const [lastParsedReport, setLastParsedReport] = useState(null);
  const [ashaLookup, setAshaLookup] = useState({
    district: "",
    village: "",
    latitude: "",
    longitude: "",
    radiusKm: "12",
  });
  const [ashaDirectory, setAshaDirectory] = useState({
    data: [],
    exact: [],
    nearby: [],
    others: [],
    context: {
      district: null,
      village: null,
      radiusKm: 12,
    },
  });
  const [isLoadingAshaDirectory, setIsLoadingAshaDirectory] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [predictionError, setPredictionError] = useState("");
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);

  const canCreateAsha = user.role === "ADMIN";
  // ASHA only. A field report is a household survey — a shop has no households to
  // report on, and its real contribution (what left the shelf) is recorded automatically.
  const canSubmitReports = user.role === "ASHA";
  const canSeePendingApprovals = user.role === "ADMIN";
  const canSeeLocationInsight = canSeeSupplyInsights(user.role);
  const showBottomDock = true;

  const loadReports = useCallback(
    async (activeFilters = filters, options = {}) => {
      // Background polling passes `silent` so the map does not flash a loading
      // state every few seconds under the worker.
      const silent = options.silent === true;
      if (!silent) setIsLoadingReports(true);

      try {
        const params = new URLSearchParams({ limit: "200", includeEntities: "true" });
        const district = (activeFilters.district || "").trim();
        const village = (activeFilters.village || "").trim();
        const disease = (activeFilters.disease || "").trim();
        if (district) params.set("district", district);
        if (village) params.set("village", village);
        if (disease) params.set("disease", disease);
        if (activeFilters.reporterRole) params.set("reporterRole", activeFilters.reporterRole);
        if (activeFilters.severity) params.set("severity", activeFilters.severity);
        if (activeFilters.startDate) params.set("startDate", activeFilters.startDate);
        if (activeFilters.endDate) params.set("endDate", activeFilters.endDate);

        const res = await fetch(`/api/health-data?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));

        if (res.ok) {
          setReports(Array.isArray(payload.data) ? payload.data : []);
          setDashboardSummary(payload.summary ?? null);
          setDashboardAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
          setRiskZones(Array.isArray(payload.riskZones) ? payload.riskZones : []);
          setDiseaseDistribution(
            Array.isArray(payload.diseaseDistribution) ? payload.diseaseDistribution : []
          );
          setDailyTrend(Array.isArray(payload.trends?.daily) ? payload.trends.daily : []);
          setMapEntities({
            ashaWorkers: payload.entities?.ashaWorkers ?? [],
            hospitals: payload.entities?.hospitals ?? [],
            medicalTeams: payload.entities?.medicalTeams ?? [],
          });
          setAiInsights(
            payload.aiInsights && typeof payload.aiInsights === "object"
              ? { ...DEFAULT_AI_INSIGHTS, ...payload.aiInsights }
              : { ...DEFAULT_AI_INSIGHTS }
          );
        } else {
          // A failed poll must not wipe the map the worker is looking at.
          if (!silent) {
            setReports([]);
            setDashboardSummary(null);
            setDashboardAlerts([]);
            setRiskZones([]);
            setDiseaseDistribution([]);
            setDailyTrend([]);
            setAiInsights({ ...DEFAULT_AI_INSIGHTS });
            setMapEntities({ ...EMPTY_MAP_ENTITIES });

            toast.error("Data load failed", {
              description: payload?.message || payload?.error || "Please refresh and try again.",
            });
          }
        }
      } catch (error) {
        if (!silent) {
          toast.error("Data load failed", {
            description: error.message || "Please refresh and try again.",
          });
        }
      } finally {
        if (!silent) setIsLoadingReports(false);
      }
    },
    [filters]
  );

  const loadPendingUsers = useCallback(async () => {
    if (!canSeePendingApprovals) return;
    setIsLoadingPending(true);

    try {
      const res = await fetch("/api/admin/pending-users", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || body.error || "Failed to load pending users");
      }
      setPendingUsers(Array.isArray(body.data) ? body.data : []);
    } catch (error) {
      toast.error("Pending users failed", { description: error.message || "Please refresh." });
      setPendingUsers([]);
    } finally {
      setIsLoadingPending(false);
    }
  }, [canSeePendingApprovals]);

  const loadAshaDirectory = useCallback(
    async (
      activeLookup = {
        district: "",
        village: "",
        latitude: "",
        longitude: "",
        radiusKm: "12",
      }
    ) => {
      if (!canCreateAsha) return;
      setIsLoadingAshaDirectory(true);

      try {
        setAshaDirectory({
          data: [],
          exact: [],
          nearby: [],
          others: [],
          context: {
            district: activeLookup.district || null,
            village: activeLookup.village || null,
            radiusKm: Number(activeLookup.radiusKm) || 12,
          },
        });
      } catch (error) {
        toast.error("ASHA list failed", {
          description: error.message || "Could not load ASHA details.",
        });
      } finally {
        setIsLoadingAshaDirectory(false);
      }
    },
    [canCreateAsha]
  );

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    loadReports({
      district: "",
      village: "",
      disease: "",
      reporterRole: "",
      severity: "",
      startDate: "",
      endDate: "",
    });

    if (canSeePendingApprovals) {
      loadPendingUsers();
    }

    if (canCreateAsha) {
      loadAshaDirectory();
    }
  }, [canCreateAsha, canSeePendingApprovals, loadAshaDirectory, loadPendingUsers, loadReports]);

  /**
   * Keeps the map live: a report filed by one ASHA shows up on every other open
   * workspace without a manual refresh. Polling pauses while the tab is hidden so
   * a phone left in a pocket is not burning a rural data connection.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      loadReports(filters, { silent: true });
      setLiveTick((current) => current + 1);
    };

    const timer = setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    // A shop confirms a pickup in one tab and switches back to the map in another;
    // `focus` catches that window swap, which visibilitychange alone misses.
    window.addEventListener("focus", refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [filters, loadReports]);

  useEffect(() => {
    if (!reports.length) {
      setPrediction(null);
      hasPredictionRef.current = false;
      setPredictionError("");
      return;
    }

    let cancelled = false;
    const loadPrediction = async () => {
      // Only the first load may show a spinner. A background tick that flashed the
      // zone reason back to "loading" every 20s would read as the panel breaking.
      const isBackgroundTick = hasPredictionRef.current;
      if (!isBackgroundTick) setIsLoadingPrediction(true);
      setPredictionError("");
      try {
        // The route scores from MongoDB itself; we only tell it which area to look at.
        const res = await fetch("/api/predictions/outbreak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            district: selectedRegion?.district || user?.location?.district || "",
            village: selectedRegion?.village || user?.location?.village || "",
          }),
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload?.message || "Failed to load outbreak prediction");
        }

        if (!cancelled) {
          setPrediction(payload.data ?? null);
          hasPredictionRef.current = Boolean(payload.data);
        }
      } catch (error) {
        if (!cancelled) {
          // Same rule as the report poll: a failed background tick must not wipe the
          // reading the worker is currently looking at.
          if (!isBackgroundTick) {
            setPrediction(null);
            hasPredictionRef.current = false;
          }
          setPredictionError(error.message || "Could not fetch prediction.");
        }
      } finally {
        if (!cancelled && !isBackgroundTick) {
          setIsLoadingPrediction(false);
        }
      }
    };

    loadPrediction();
    return () => {
      cancelled = true;
    };
  }, [
    reports.length,
    liveTick,
    selectedRegion,
    user?.location?.district,
    user?.location?.village,
  ]);

  const scopedReports = useMemo(() => {
    if (!selectedRegion?.district) return reports;
    return reports.filter((report) => {
      const districtMatch =
        normalizeText(report?.location?.district) === normalizeText(selectedRegion?.district);
      const villageMatch = selectedRegion?.village
        ? normalizeText(report?.location?.village) === normalizeText(selectedRegion?.village)
        : true;
      return districtMatch && villageMatch;
    });
  }, [reports, selectedRegion]);

  /**
   * The areas an admin can actually score, built from the data itself.
   *
   * ASHA and MEDICAL carry a village on their profile, so every area-scoped screen just
   * used that. An admin has no village — they oversee all of them — which left the
   * outbreak prediction and everything downstream of it, including the medicine
   * velocity chart, permanently stuck on "district is required" with nothing on the
   * page to set it. Risk zones are included alongside reports because a district can
   * have medicine movement before any ASHA has filed there, and that is exactly the
   * area an admin most needs to open.
   */
  const areaOptions = useMemo(() => {
    const districts = new Map();

    const add = (district, village) => {
      const name = (district || "").trim();
      if (!name) return;
      if (!districts.has(name)) districts.set(name, new Set());
      const clean = (village || "").trim();
      if (clean) districts.get(name).add(clean);
    };

    for (const report of reports) add(report?.location?.district, report?.location?.village);
    for (const zone of riskZones) add(zone?.district, zone?.village);
    // A worker posted somewhere quiet would otherwise not find her own area in the list
    // at all, and the select would render blank against a value it has no option for.
    add(user?.location?.district, user?.location?.village);

    return [...districts.entries()]
      .map(([district, villages]) => ({ district, villages: [...villages].sort() }))
      .sort((left, right) => left.district.localeCompare(right.district));
  }, [reports, riskZones, user?.location?.district, user?.location?.village]);

  const summary = useMemo(() => {
    const local = scopedReports.reduce(
      (acc, item) => {
        acc.newCases += item.newCases || 0;
        acc.criticalCases += item.criticalCases || 0;
        return acc;
      },
      { newCases: 0, criticalCases: 0 }
    );

    return {
      newCases: selectedRegion?.district
        ? local.newCases
        : Number.isFinite(dashboardSummary?.totalNewCases)
          ? dashboardSummary.totalNewCases
          : local.newCases,
      criticalCases: selectedRegion?.district
        ? local.criticalCases
        : Number.isFinite(dashboardSummary?.totalCriticalCases)
          ? dashboardSummary.totalCriticalCases
          : local.criticalCases,
      activeCases: Number.isFinite(dashboardSummary?.activeCases) ? dashboardSummary.activeCases : local.newCases,
      criticalAlerts: Number.isFinite(dashboardSummary?.criticalAlerts)
        ? dashboardSummary.criticalAlerts
        : riskZones.filter((zone) => zone?.riskLevel === "HIGH_RISK").length,
      predictiveIncreasePercent: Number.isFinite(dashboardSummary?.predictiveIncreasePercent)
        ? dashboardSummary.predictiveIncreasePercent
        : 0,
      outbreakProbabilityNext3Days: Number.isFinite(dashboardSummary?.outbreakProbabilityNext3Days)
        ? dashboardSummary.outbreakProbabilityNext3Days
        : 0,
      expectedPatientsNext2Days: Number.isFinite(dashboardSummary?.expectedPatientsNext2Days)
        ? dashboardSummary.expectedPatientsNext2Days
        : Math.round(local.newCases * 0.25),
      hospitalLoadPercent: Number.isFinite(dashboardSummary?.hospitalLoadPercent)
        ? dashboardSummary.hospitalLoadPercent
        : Math.min(100, Math.round(local.newCases / 2)),
    };
  }, [dashboardSummary, riskZones, scopedReports, selectedRegion]);

  const diseaseInsights = useMemo(() => {
    if (diseaseDistribution.length) {
      return diseaseDistribution.map((item) => ({
        disease: item.disease,
        reports: item.reports,
        cases: item.newCases,
      }));
    }

    const buckets = scopedReports.reduce((acc, item) => {
      const key = item.disease || "UNKNOWN";
      const current = acc.get(key) || { disease: key, reports: 0, cases: 0 };
      current.reports += 1;
      current.cases += item.newCases || 0;
      acc.set(key, current);
      return acc;
    }, new Map());

    return [...buckets.values()].sort((a, b) => b.cases - a.cases).slice(0, 5);
  }, [diseaseDistribution, scopedReports]);

  const ashaSpotlight = useMemo(() => {
    const topMatches =
      ashaDirectory.exact.length || ashaDirectory.nearby.length
        ? [...ashaDirectory.exact, ...ashaDirectory.nearby]
        : ashaDirectory.data;
    return topMatches.slice(0, 12);
  }, [ashaDirectory]);

  const selectedZoneInsight = useMemo(() => {
    if (!selectedRegion?.district) return null;

    return (
      riskZones.find((zone) => {
        const districtMatch = normalizeText(zone?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(zone?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      }) || null
    );
  }, [riskZones, selectedRegion]);

  const selectedAreaDemand = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return aiInsights.medicineDemand
      .filter((item) => {
        const districtMatch = normalizeText(item?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(item?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      })
      .slice(0, 5);
  }, [aiInsights.medicineDemand, selectedRegion]);

  const selectedAreaPriceAnomalies = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return aiInsights.priceAnomalies
      .filter((item) => {
        const districtMatch = normalizeText(item?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(item?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      })
      .slice(0, 6);
  }, [aiInsights.priceAnomalies, selectedRegion]);

  const nearbyZoneRisk = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return riskZones
      .filter((zone) => {
        if (!selectedZoneInsight || zone.id === selectedZoneInsight.id) return false;
        return normalizeText(zone?.district) === normalizeText(selectedRegion?.district);
      })
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 3);
  }, [riskZones, selectedRegion, selectedZoneInsight]);

  const handleCopyAshaId = useCallback(async (workerId) => {
    if (!workerId) return;

    try {
      await navigator.clipboard.writeText(workerId);
      toast.success("Copied", { description: `${workerId} copied to clipboard.` });
    } catch (_error) {
      toast.info("ASHA ID", { description: workerId });
    }
  }, []);

  const applyCreateLocationToLookup = useCallback(() => {
    const nextLookup = {
      district: createAshaForm.district || "",
      village: createAshaForm.village || "",
      latitude: createAshaForm.latitude || "",
      longitude: createAshaForm.longitude || "",
      radiusKm: ashaLookup.radiusKm || "12",
    };

    setAshaLookup(nextLookup);
    return nextLookup;
  }, [createAshaForm.district, createAshaForm.latitude, createAshaForm.longitude, createAshaForm.village, ashaLookup.radiusKm]);

  const handleCreateAsha = useCallback(
    async (event) => {
      event.preventDefault();
      setIsCreatingAsha(true);

      try {
        const nextLookup = {
          district: createAshaForm.district || "",
          village: createAshaForm.village || "",
          latitude: createAshaForm.latitude || "",
          longitude: createAshaForm.longitude || "",
          radiusKm: ashaLookup.radiusKm || "12",
        };

        const response = await fetch("/api/admin/create-asha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createAshaForm.name,
            email: createAshaForm.email,
            password: createAshaForm.password,
            location: {
              village: createAshaForm.village,
              district: createAshaForm.district,
              latitude: createAshaForm.latitude,
              longitude: createAshaForm.longitude,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          toast.error("Creation failed", {
            description:
              payload?.message || payload?.error || "Please review form values.",
          });
          return;
        }

        toast.success("ASHA worker created", {
          description: payload?.user?.workerId
            ? `${payload.user.workerId} created successfully.`
            : payload?.message || "Worker created successfully.",
        });
        setAshaLookup(nextLookup);
        loadAshaDirectory(nextLookup);
        setCreateAshaForm({
          name: "",
          email: "",
          password: "",
          village: "",
          district: "",
          latitude: "",
          longitude: "",
        });
      } catch (error) {
        toast.error("Creation failed", {
          description: error.message || "Please review form values.",
        });
      } finally {
        setIsCreatingAsha(false);
      }
    },
    [createAshaForm, ashaLookup.radiusKm, loadAshaDirectory]
  );

  const handleApproveUser = useCallback(
    async (userId, role) => {
      setApprovingUserId(userId);

      try {
        const response = await fetch(`/api/admin/approve/${userId}`, {
          method: "POST",
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          toast.error("Approval failed", {
            description: payload?.message || payload?.error || "Please retry.",
          });
          return;
        }

        toast.success("User approved", {
          description: payload?.message || `${role} approved successfully.`,
        });
        loadPendingUsers();
      } catch (error) {
        toast.error("Approval failed", { description: error.message || "Please retry." });
      } finally {
        setApprovingUserId("");
      }
    },
    [loadPendingUsers]
  );

  /**
   * Reads GPS and writes it into the report form.
   * Resolves with { latitude, longitude } or null so callers can await it before submitting.
   * `options.silent` suppresses the toasts when it runs as part of a one-tap submit.
   */
  const captureCurrentLocation = useCallback((options) => {
    const silent = options?.silent === true;

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (!silent) {
          toast.error("GPS unavailable", {
            description: "Your browser does not support geolocation.",
          });
        }
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coordinates = {
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
          };
          setReportForm((current) => ({ ...current, ...coordinates }));
          if (!silent) {
            toast.success("GPS captured", {
              description: "Current coordinates added to the report.",
            });
          }
          resolve(coordinates);
        },
        (error) => {
          if (!silent) {
            toast.error("GPS permission required", {
              description: error.message || "Could not read your location.",
            });
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  /** Points the workspace (map + scoped lists) at one disease in one area. */
  const focusOnArea = useCallback(
    (focus) => {
      const district = focus?.district || user?.location?.district || "";
      const village = focus?.village || user?.location?.village || "";
      if (!district) return;

      // The map flies to selectedRegion only when the coordinates are real numbers,
      // and the form keeps them as strings.
      const latitude = parseCoordinate(focus?.latitude) ?? parseCoordinate(user?.location?.latitude);
      const longitude =
        parseCoordinate(focus?.longitude) ?? parseCoordinate(user?.location?.longitude);

      const nextFocus = {
        disease: focus?.disease || "",
        district,
        village,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        source: focus?.source || "capture",
        spokenPlace: focus?.spokenPlace || "",
      };

      setReportFocus(nextFocus);
      setSelectedRegion({
        district,
        village,
        latitude: nextFocus.latitude,
        longitude: nextFocus.longitude,
      });
    },
    [user?.location?.district, user?.location?.latitude, user?.location?.longitude, user?.location?.village]
  );

  const clearReportFocus = useCallback(() => {
    setReportFocus(null);
    setSelectedRegion(null);
  }, []);

  /**
   * Applies a parsed voice/text capture to the report form and focuses the workspace
   * on that disease + area so the worker can sanity-check before submitting.
   */
  const applyParsedReport = useCallback(
    (parsed) => {
      if (!parsed || parsed.isEmpty) return null;

      const merged = mergeParsedIntoForm(parsed, reportForm);
      const withPlace = {
        ...merged,
        spokenPlace: parsed.locationIntent?.kind === "named" ? parsed.locationIntent.name : "",
      };

      setReportForm(withPlace);
      setLastParsedReport(parsed);
      focusOnArea({
        disease: parsed.disease,
        spokenPlace: withPlace.spokenPlace,
        source: "capture",
      });

      if (parsed.locationIntent?.kind !== "none" && !normalizeText(String(withPlace.latitude ?? ""))) {
        captureCurrentLocation({ silent: true });
      }

      return withPlace;
    },
    [reportForm, focusOnArea, captureCurrentLocation]
  );

  /**
   * Single submission path for both the form and one-tap voice submit.
   * Writes to Mongo through /api/health-data — the single store the dashboard, map,
   * risk engine and ASHA/medical cross-source trust scoring all read from.
   */
  const submitReport = useCallback(
    async (overrides) => {
      const draft = { ...reportForm, ...(overrides || {}) };
      setIsSubmittingReport(true);

      try {
        const disease = normalizeDiseaseInput(draft.disease) || "";
        if (!disease || !DISEASE_CODES.includes(disease)) {
          throw new Error(
            "Bimari pehchani nahi gayi. Disease list se ek option chuniye (jaise DENGUE)."
          );
        }

        const newCases = Number.parseInt(draft.newCases, 10);
        if (!Number.isFinite(newCases) || newCases < 1) {
          throw new Error("Kitne naye case mile? Kam se kam 1 hona chahiye.");
        }

        const criticalCases = Number.parseInt(draft.criticalCases, 10) || 0;
        if (criticalCases > newCases) {
          throw new Error(`Critical cases (${criticalCases}) new cases (${newCases}) se zyada nahi ho sakte.`);
        }

        const medicineSales =
          user.role === "MEDICAL" ? parseMedicineSalesText(draft.medicineSalesText) : [];
        if (user.role === "MEDICAL" && !medicineSales.length) {
          throw new Error(
            "Medicine lines chahiye: Medicine,UnitsSold,PrivatePrice,BenchmarkPrice,CurrentStock,IncomingStock"
          );
        }

        let latitude = String(draft.latitude ?? "");
        let longitude = String(draft.longitude ?? "");
        if (!normalizeText(latitude) || !normalizeText(longitude)) {
          const coordinates = await captureCurrentLocation({ silent: true });
          latitude = String(coordinates?.latitude ?? user?.location?.latitude ?? "");
          longitude = String(coordinates?.longitude ?? user?.location?.longitude ?? "");
        }
        if (!normalizeText(latitude) || !normalizeText(longitude)) {
          throw new Error("GPS nahi mila. 'Use Current GPS' dabaiye ya latitude/longitude bhariye.");
        }

        const response = await fetch("/api/health-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            disease,
            householdsVisited: draft.householdsVisited || 0,
            newCases,
            criticalCases,
            medicineSales,
            notes: draft.notes || "",
            latitude,
            longitude,
            ...(draft.reportDate ? { reportDate: draft.reportDate } : {}),
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload?.message || payload?.error || "Report submit nahi ho paayi. Dobara koshish kijiye."
          );
        }

        toast.success(`${diseaseLabel(disease)} report submitted`, {
          description: `${newCases} case${newCases === 1 ? "" : "s"} recorded for ${
            user?.location?.village || "your area"
          }. Map aur dashboard update ho gaya.`,
        });

        setReportForm((current) => ({
          ...current,
          disease: "",
          householdsVisited: "",
          newCases: "",
          criticalCases: "",
          medicineSalesText: "",
          notes: "",
          reportDate: "",
          spokenPlace: "",
          latitude,
          longitude,
        }));
        setLastParsedReport(null);

        focusOnArea({
          disease,
          latitude,
          longitude,
          source: "submitted",
          spokenPlace: draft.spokenPlace,
        });
        await loadReports(filters);
        // Report count alone may not move (the list is capped and filtered), so nudge
        // the prediction explicitly — the ASHA must see her own report reflected in the
        // zone reason the moment she files it, not on the next poll.
        setLiveTick((current) => current + 1);

        return payload?.data || payload || null;
      } catch (error) {
        toast.error("Submission failed", {
          description: error.message || "Please validate the form.",
        });
        return null;
      } finally {
        setIsSubmittingReport(false);
      }
    },
    [reportForm, user, filters, loadReports, captureCurrentLocation, focusOnArea]
  );

  const handleSubmitReport = useCallback(
    async (event) => {
      event.preventDefault();
      return submitReport();
    },
    [submitReport]
  );

  /** One tap: parsed capture -> form -> submit, without waiting for a render pass. */
  const submitParsedReport = useCallback(
    async (parsed) => {
      if (!parsed || parsed.isEmpty) {
        toast.error("Kuch samajh nahi aaya", {
          description: "Pehle bolkar ya likhkar report banaiye.",
        });
        return null;
      }

      const draft = {
        ...mergeParsedIntoForm(parsed, reportForm),
        spokenPlace: parsed.locationIntent?.kind === "named" ? parsed.locationIntent.name : "",
      };
      setReportForm(draft);
      setLastParsedReport(parsed);
      return submitReport(draft);
    },
    [reportForm, submitReport]
  );

  /** Reports that match the current focus - the worker's evidence view before submitting. */
  const focusedReports = useMemo(() => {
    if (!reportFocus) return [];

    return scopedReports
      .filter((report) => !reportFocus.disease || report.disease === reportFocus.disease)
      .sort(
        (left, right) =>
          new Date(right.reportDate || right.createdAt || 0) -
          new Date(left.reportDate || left.createdAt || 0)
      );
  }, [reportFocus, scopedReports]);

  const focusSummary = useMemo(() => {
    if (!reportFocus) return null;

    const totals = focusedReports.reduce(
      (acc, report) => {
        acc.newCases += Number(report.newCases) || 0;
        acc.criticalCases += Number(report.criticalCases) || 0;
        return acc;
      },
      { newCases: 0, criticalCases: 0 }
    );

    const lastReport = focusedReports[0];

    return {
      ...reportFocus,
      diseaseLabel: reportFocus.disease ? diseaseLabel(reportFocus.disease) : "All diseases",
      reportCount: focusedReports.length,
      newCases: totals.newCases,
      criticalCases: totals.criticalCases,
      lastReportedAt: lastReport?.reportDate || lastReport?.createdAt || null,
    };
  }, [focusedReports, reportFocus]);

  const value = useMemo(
    () => ({
      user,
      reports,
      setReports,
      pendingUsers,
      isLoadingReports,
      isLoadingPending,
      filters,
      setFilters,
      selectedRegion,
      setSelectedRegion,
      dashboardSummary,
      dashboardAlerts,
      riskZones,
      areaOptions,
      aiInsights,
      mapEntities,
      dailyTrend,
      diseaseDistribution,
      isCreatingAsha,
      isSubmittingReport,
      approvingUserId,
      createAshaForm,
      setCreateAshaForm,
      reportForm,
      setReportForm,
      reportFocus,
      focusedReports,
      focusSummary,
      lastParsedReport,
      ashaLookup,
      setAshaLookup,
      ashaDirectory,
      isLoadingAshaDirectory,
      prediction,
      predictionError,
      isLoadingPrediction,
      canCreateAsha,
      canSubmitReports,
      canSeePendingApprovals,
      canSeeLocationInsight,
      showBottomDock,
      canSeeAiPanel: Boolean(selectedRegion?.district),
      loadReports,
      loadPendingUsers,
      loadAshaDirectory,
      scopedReports,
      summary,
      diseaseInsights,
      ashaSpotlight,
      selectedZoneInsight,
      selectedAreaDemand,
      selectedAreaPriceAnomalies,
      nearbyZoneRisk,
      handleCopyAshaId,
      applyCreateLocationToLookup,
      handleCreateAsha,
      handleApproveUser,
      handleSubmitReport,
      submitReport,
      submitParsedReport,
      applyParsedReport,
      focusOnArea,
      clearReportFocus,
      captureCurrentLocation,
    }),
    [
      user,
      reports,
      pendingUsers,
      isLoadingReports,
      isLoadingPending,
      filters,
      selectedRegion,
      dashboardSummary,
      dashboardAlerts,
      riskZones,
      areaOptions,
      aiInsights,
      mapEntities,
      dailyTrend,
      diseaseDistribution,
      isCreatingAsha,
      isSubmittingReport,
      approvingUserId,
      createAshaForm,
      reportForm,
      reportFocus,
      focusedReports,
      focusSummary,
      lastParsedReport,
      ashaLookup,
      ashaDirectory,
      isLoadingAshaDirectory,
      prediction,
      predictionError,
      isLoadingPrediction,
      canCreateAsha,
      canSubmitReports,
      canSeePendingApprovals,
      canSeeLocationInsight,
      showBottomDock,
      loadReports,
      loadPendingUsers,
      loadAshaDirectory,
      scopedReports,
      summary,
      diseaseInsights,
      ashaSpotlight,
      selectedZoneInsight,
      selectedAreaDemand,
      selectedAreaPriceAnomalies,
      nearbyZoneRisk,
      handleCopyAshaId,
      applyCreateLocationToLookup,
      handleCreateAsha,
      handleApproveUser,
      handleSubmitReport,
      submitReport,
      submitParsedReport,
      applyParsedReport,
      focusOnArea,
      clearReportFocus,
      captureCurrentLocation,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
