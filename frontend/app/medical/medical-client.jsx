"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, FileCheck2, Search } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/app/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { CHART_INK, SEQUENTIAL_ORANGE } from "@/app/lib/chart-theme";
import { Chip, EmptyState, Panel, ScreenHeader, StatCard, TabNav } from "@/app/components/screen-ui";

const SHOP_TABS = [
  { href: "/medical", label: { en: "My shop", hi: "Meri dukaan" } },
  { href: "/workspace/trends", label: { en: "Trends", hi: "Trends" } },
  { href: "/workspace/map", label: { en: "Map", hi: "Map" } },
  { href: "/workspace/insights", label: { en: "Insights", hi: "Insights" } },
];

/**
 * The caller keys this row on the saved quantity, so a successful save remounts the
 * row with a fresh input rather than syncing local state from props in an effect.
 */
function StockRow({ item, onSave }) {
  const t = useT();
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    await onSave(item.sku, Number(quantity) || 0);
    setIsSaving(false);
  }

  const isDirty = String(item.quantity) !== quantity;

  return (
    <tr className="border-b border-line-soft transition-colors hover:bg-card-hover">
      <td className="py-3 pr-3">
        <p className="text-[13px] font-semibold text-ink">{item.brand}</p>
        <p className="mt-0.5 text-[11px] text-muted-2">{item.salt}</p>
      </td>
      <td className="py-3 pr-3">
        <Chip tone={item.schedule === "OTC" ? "brand" : "danger"}>{item.schedule}</Chip>
      </td>
      <td className="py-3 pr-3">
        <input
          type="number"
          min={0}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label={`${item.brand} quantity`}
          className="js-code w-20 rounded-[10px] border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus:border-brand"
        />
      </td>
      <td className="py-3 pr-3">
        {item.isStocked ? (
          item.isLow ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-warn-ink">
              <AlertTriangle size={12} />
              {t("Low", "Kam hai")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand">
              <CheckCircle2 size={12} />
              {t("Fine", "Theek")}
            </span>
          )
        ) : (
          <span className="text-[11.5px] text-faint">{t("Not stocked", "Nahi rakhte")}</span>
        )}
      </td>
      <td className="py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={save}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}

/**
 * Four boxes over one real input.
 *
 * The counter is the moment the whole signal depends on, so the code gets the weight of
 * a keypad rather than a text field — but it is still a single `<input>` underneath, so
 * keyboard, paste and screen readers all behave exactly as before.
 */
function PickupCodeField({ code, onChange, disabled }) {
  const t = useT();
  const digits = [0, 1, 2, 3];

  return (
    <label className="relative block">
      <span className="sr-only">{t("Pickup code", "Pickup code")}</span>
      <input
        value={code}
        onChange={onChange}
        disabled={disabled}
        placeholder={t("4 digit code", "4 digit code")}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={t("Pickup code", "Pickup code")}
        className="peer absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
      />
      <span className="flex gap-2.5">
        {digits.map((index) => (
          <span
            key={index}
            className={`js-num grid h-16 w-14 place-items-center rounded-[14px] border bg-white/[0.06] text-[28px] text-white transition-colors ${
              code.length === index
                ? "border-neon/70"
                : code[index]
                  ? "border-neon/40"
                  : "border-white/[0.16]"
            }`}
          >
            {code[index] || ""}
          </span>
        ))}
      </span>
    </label>
  );
}

export default function MedicalClient({ user }) {
  const t = useT();
  const [stock, setStock] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function loadAll() {
    const [stockRes, orderRes] = await Promise.all([
      fetch("/api/medical/stock", { credentials: "same-origin" }),
      fetch("/api/medical/orders?status=PENDING", { credentials: "same-origin" }),
    ]);

    const stockBody = await stockRes.json().catch(() => ({}));
    const orderBody = await orderRes.json().catch(() => ({}));

    if (stockRes.ok) {
      setStock(stockBody.data || []);
      setSummary(stockBody.summary || {});
    }
    if (orderRes.ok) setOrders(orderBody.data || []);
  }

  useEffect(() => {
    loadAll().finally(() => setIsLoading(false));
  }, []);

  async function saveStock(sku, quantity) {
    const response = await fetch("/api/medical/stock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ sku, quantity }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(t("Not saved", "Save nahi hua"), { description: body?.message });
      return;
    }

    toast.success(t("Stock updated", "Stock update ho gaya"));
    await loadAll();
  }

  async function confirmPickup(event) {
    event.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      toast.error(t("Enter the 4 digit code", "4 digit ka code daaliye"));
      return;
    }

    setIsConfirming(true);
    try {
      const response = await fetch("/api/medical/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pickupCode: code }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(t("Not confirmed", "Confirm nahi hua"), { description: body?.message });
        return;
      }

      toast.success(t("Pickup confirmed", "Pickup confirm"), { description: body.data.message });
      setCode("");
      await loadAll();
    } finally {
      setIsConfirming(false);
    }
  }

  const filteredStock = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stock;
    return stock.filter(
      (item) =>
        item.brand.toLowerCase().includes(needle) ||
        item.salt.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
    );
  }, [stock, query]);

  // What is actually walking out of the shop right now — the shop's own view of
  // the same signal the outbreak map reads.
  const demandChart = useMemo(() => {
    const totals = new Map();
    for (const order of orders) {
      totals.set(order.brand, (totals.get(order.brand) || 0) + order.quantity);
    }
    return [...totals.entries()]
      .map(([brand, units]) => ({ brand, units }))
      .sort((left, right) => right.units - left.units)
      .slice(0, 8);
  }, [orders]);

  const areaLabel = `${user.location?.village || ""}${
    user.location?.district ? `, ${user.location.district}` : ""
  }`;

  return (
    <div className="space-y-7">
      <ScreenHeader
        kicker={`Medical shop · ${user.name}${areaLabel ? ` · ${areaLabel}` : ""}`}
        title={t("The counter is the second witness.", "The counter is the second witness.")}
        subtitle={t(
          "Stock drops only when a customer actually collects the medicine — and that one event is what the outbreak signal counts.",
          "Stock tabhi ghatega jab customer sach me dawai le jaye — aur wahi ek event outbreak signal me gina jata hai."
        )}
      />

      <TabNav items={SHOP_TABS} activeHref="/medical" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t("Items in stock", "Stock me items")} value={summary.stockedItems ?? 0} />
        <StatCard label={t("Running low", "Kam stock")} value={summary.lowStockItems ?? 0} tone="warn" />
        <StatCard label={t("Out of stock", "Khatam")} value={summary.outOfStockItems ?? 0} tone="danger" />
        <StatCard label={t("Pickups pending", "Pickup baaki")} value={orders.length} tone="brand" />
      </div>

      {/* --------------------------------------------------- pickup counter -- */}
      <section
        data-reveal=""
        className="relative overflow-hidden rounded-[20px] bg-night-2 p-7 text-[#e9f2ec] md:p-8"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_0%,rgba(94,226,160,0.14),transparent_60%)]"
        />
        <div className="relative">
          <p className="js-mono text-[9.5px] tracking-[0.18em] text-neon">
            {t("Customer here? Enter the code", "Customer aaya? Code daaliye")}
          </p>
          <p className="js-display mt-3 text-xl text-white">
            {t("Stock drops the moment the code is confirmed.", "Code confirm karte hi stock ghatega.")}
          </p>
          <p className="mt-2 max-w-xl text-[12.5px] leading-[1.65] text-[rgba(233,242,236,0.6)]">
            {t(
              "This sale counts towards the area's outbreak signal. Placing an order alone does nothing — this is the real evidence.",
              "Ye sale ilaake ke outbreak signal me gini jayegi. Sirf order karne se kuch nahi hota — asli saboot yahi hai."
            )}
          </p>

          <form onSubmit={confirmPickup} className="mt-6 flex flex-wrap items-center gap-4">
            <PickupCodeField
              code={code}
              disabled={isConfirming}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <Button
              type="submit"
              disabled={isConfirming}
              className="bg-neon px-7 text-[13px] text-[#07130c] shadow-[0_0_28px_rgba(94,226,160,0.3)] hover:bg-neon hover:brightness-105"
            >
              {isConfirming ? t("Confirming…", "Confirm ho raha…") : t("Confirm pickup", "Confirm pickup")}
            </Button>
          </form>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={t("Pending pickups", "Pending pickups")}
          description={t(
            "These customers are coming to collect. An order cancels itself after 48 hours.",
            "Ye customers dawai lene aayenge. 48 ghante baad order apne aap cancel ho jaata hai."
          )}
        >
          <div className="space-y-2.5">
            {isLoading ? <EmptyState>{t("Loading…", "Load ho raha hai…")}</EmptyState> : null}
            {!isLoading && !orders.length ? (
              <EmptyState>{t("No pending orders yet.", "Abhi koi pending order nahi.")}</EmptyState>
            ) : null}

            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-[14px] border border-line bg-brand-tint-2 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">
                      {order.brand} × {order.quantity}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {order.customerName} ·{" "}
                      {order.intent === "DOCTOR_PRESCRIBED"
                        ? t("Prescription medicine", "Parchi wali dawai")
                        : t("Self-care", "Khud ke liye")}
                    </p>
                  </div>
                  <span className="js-code shrink-0 rounded-[10px] border border-line bg-card px-3 py-1.5 text-base font-semibold tracking-[0.2em] text-ink">
                    {order.pickupCode}
                  </span>
                </div>

                {order.prescription ? (
                  <div className="mt-3 rounded-[12px] border border-brand-line bg-brand-tint p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-strong">
                      <FileCheck2 size={12} />
                      Parchi verify hui hai
                    </p>
                    <p className="mt-1 text-[11.5px] text-brand-strong">
                      {order.prescription.doctorName
                        ? `Dr. ${order.prescription.doctorName}`
                        : t("Doctor's name not legible", "Doctor ka naam nahi dikha")}
                      {order.prescription.clinicName ? ` · ${order.prescription.clinicName}` : ""}
                      {order.prescription.prescribedOn
                        ? ` · ${new Date(order.prescription.prescribedOn).toLocaleDateString("en-IN")}`
                        : ""}
                    </p>
                    {order.prescription.reasons?.length ? (
                      <p className="mt-1.5 text-[11.5px] text-warn-ink">
                        Dhyan de: {order.prescription.reasons.join(" ")}
                      </p>
                    ) : null}
                    <a
                      href={`/api/prescriptions/${order.prescription.id}/image`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-brand underline underline-offset-2"
                    >
                      Parchi dekhiye
                    </a>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={t("What is being asked for right now", "Abhi kaunsi dawai maangi ja rahi")}
          description={t(
            "From pending orders — the picture before any pickup is confirmed.",
            "Pending orders ke hisaab se — pickup confirm hone se pehle ki tasveer."
          )}
        >
          {demandChart.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, demandChart.length * 34)}>
              <BarChart
                data={demandChart}
                layout="vertical"
                margin={{ top: 4, right: 34, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="brand"
                  width={110}
                  tick={{ fontSize: 11, fill: CHART_INK.label }}
                  stroke={CHART_INK.axis}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: CHART_INK.grid }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 12,
                    borderColor: CHART_INK.grid,
                    boxShadow: "0 10px 30px rgba(18,32,25,0.12)",
                  }}
                />
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
            <EmptyState>{t("No demand yet.", "Abhi koi demand nahi.")}</EmptyState>
          )}
        </Panel>
      </div>

      <Panel
        title={t("Stock", "Stock")}
        description={t(
          "Change the quantity and press Save. Only medicine you actually stock is suggested to customers.",
          "Quantity badalkar Save dabaiye. Jo dawai aap rakhte hain sirf wahi customers ko suggest hogi."
        )}
        actions={
          <label className="relative">
            <span className="sr-only">{t("Search medicine", "Dawai dhoondhiye")}</span>
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search medicine", "Dawai dhoondhiye")}
              className="w-56 rounded-full border border-line bg-card py-2 pr-4 pl-9 text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
            />
          </label>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">{t("Your shop's medicine stock", "Aapki dukaan ka medicine stock")}</caption>
            <thead>
              <tr className="js-mono border-b border-line text-left text-[9px] tracking-[0.14em] text-faint">
                <th scope="col" className="py-2.5 pr-3">
                  {t("Medicine", "Dawai")}
                </th>
                <th scope="col" className="py-2.5 pr-3">
                  {t("Type", "Type")}
                </th>
                <th scope="col" className="py-2.5 pr-3">
                  {t("Quantity", "Quantity")}
                </th>
                <th scope="col" className="py-2.5 pr-3">
                  {t("Status", "Status")}
                </th>
                <th scope="col" className="py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filteredStock.map((item) => (
                <StockRow key={`${item.sku}-${item.quantity}`} item={item} onSave={saveStock} />
              ))}
              {!filteredStock.length ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-2">
                    {isLoading ? t("Loading…", "Load ho raha hai…") : t("No medicine found.", "Koi dawai nahi mili.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
