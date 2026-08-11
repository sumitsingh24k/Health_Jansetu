"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock3,
  Download,
  FileText,
  Info,
  Loader2,
  Package,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PrescriptionAttachButton,
  PrescriptionResultCard,
} from "@/app/components/prescription/prescription-upload";
import { Button } from "@/components/ui/button";
import { Chip, Panel, ScreenHeader, TabNav } from "@/app/components/screen-ui";
import { useT } from "@/app/components/i18n/locale-provider";

// Sent verbatim to the assistant, so each carries the wording for its own language.
const STARTERS = [
  { en: "Hello", hi: "Namaste" },
  { en: "I have not been feeling well for a few days", hi: "Mujhe kuch dino se theek nahi lag raha" },
  { en: "My child is unwell", hi: "Bachche ki tabiyat kharab hai" },
  { en: "A doctor has prescribed a medicine", hi: "Doctor ne ek dawai likhi hai" },
];

const RESIDENT_TABS = [
  { href: "/sehat", label: { en: "Sehat Sahayak", hi: "Sehat Sahayak" } },
  { href: "/sehat/profile", label: { en: "My health record", hi: "Mera health record" } },
];

function OrderCard({ order }) {
  const t = useT();
  const tone =
    order.status === "PENDING"
      ? "border-warn-line bg-warn-bg text-warn-ink"
      : order.status === "PICKED_UP"
        ? "border-brand-line bg-brand-tint text-brand-strong"
        : "border-line bg-brand-tint-2 text-muted";

  return (
    <div className={`rounded-[14px] border px-3.5 py-2.5 text-xs ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {order.brand} × {order.quantity}
        </span>
        <span className="js-mono text-[9px] tracking-[0.12em]">{order.status}</span>
      </div>
      {order.pickupCode ? (
        <p className="mt-2">
          {t("Give this code at the shop:", "Medical par ye code bataiye:")}{" "}
          <span className="js-code text-base font-semibold tracking-[0.2em]">
            {order.pickupCode}
          </span>
        </p>
      ) : null}
      {order.shopVillage ? (
        <p className="mt-1 opacity-80">
          {order.shopVillage}
          {order.distanceKm ? ` · ${order.distanceKm} km` : ""}
        </p>
      ) : null}
    </div>
  );
}

function SuggestionCard({ suggestion, onOrder, isOrdering }) {
  const t = useT();
  const [quantity, setQuantity] = useState(suggestion.typicalQuantity || 1);

  return (
    <div className="js-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{suggestion.brand}</p>
          <p className="mt-0.5 text-xs text-muted-2">{suggestion.salt}</p>
        </div>
        <Chip tone={suggestion.schedule === "OTC" ? "brand" : "danger"}>
          {suggestion.schedule === "OTC"
            ? t("No prescription", "Bina parchi")
            : t("Prescription needed", "Parchi zaroori")}
        </Chip>
      </div>

      {suggestion.whyThisMedicine ? (
        <div className="mt-3 rounded-[12px] bg-brand-tint-2 px-3 py-2.5">
          <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">{t("Why this", "Ye kyun")}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{suggestion.whyThisMedicine}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted">{suggestion.description}</p>
      )}

      {suggestion.howToUse ? (
        <div className="mt-2 rounded-[12px] bg-brand-tint px-3 py-2.5">
          <p className="js-mono text-[8.5px] tracking-[0.14em] text-brand-strong">{t("How to take it", "Kaise lein")}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{suggestion.howToUse}</p>
        </div>
      ) : null}

      <p className="js-code mt-2.5 text-[11px] text-muted-2">
        {suggestion.packSize} · ₹{suggestion.mrp}
      </p>

      {suggestion.orderable ? (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-muted" htmlFor={`qty-${suggestion.sku}`}>
            {t("How many?", "Kitni?")}
          </label>
          <input
            id={`qty-${suggestion.sku}`}
            type="number"
            min={1}
            max={60}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
            className="js-code w-16 rounded-[10px] border border-line bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <Button
            type="button"
            size="sm"
            disabled={isOrdering}
            onClick={() => onOrder(suggestion.sku, quantity)}
          >
            <Package size={13} />
            Book kijiye
          </Button>
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-[12px] border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn-ink">
          <Clock3 size={12} className="mt-0.5 shrink-0" />
          {suggestion.blockedMessage}
        </p>
      )}
    </div>
  );
}

function GuideSection({ title, items, text }) {
  if (!items?.length && !text) return null;

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {text ? <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p> : null}
      {items?.length ? (
        <ol className="mt-1.5 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
              <span className="js-code shrink-0 text-xs text-brand">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function GuidePanel({ guide, onClose, onDownload, isDownloading }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-night/50 p-4 backdrop-blur-sm">
      <div className="js-card w-full max-w-2xl p-6 shadow-[0_40px_90px_rgba(8,17,13,0.35)] md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="js-display text-xl text-ink">{guide.title}</h2>
            <p className="js-mono mt-1.5 text-[9px] tracking-[0.14em] text-muted-2">
              {guide.name} · {guide.area || "-"} · {guide.generatedAt}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close", "Band kijiye")}
            className="rounded-full p-2 text-muted-2 transition-colors hover:bg-brand-tint-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 rounded-[14px] bg-brand-tint-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
          {guide.summary}
        </p>

        {guide.conditionGuess ? (
          <p className="mt-3 text-sm text-muted">
            <span className="font-semibold text-ink">{t("Likely: ", "Kya lagta hai: ")}</span>
            {guide.conditionGuess}
          </p>
        ) : null}

        {guide.medicineNotes?.length ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-ink">{t("Medicine", "Dawai")}</h3>
            <div className="mt-2 space-y-2">
              {guide.medicineNotes.map((note) => (
                <div key={note.medicine} className="rounded-[14px] border border-line p-3">
                  <p className="text-sm font-semibold text-ink">{note.medicine}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-semibold text-ink-2">{t("What for:", "Kis liye:")}</span> {note.purpose}
                  </p>
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink-2">{t("How to take:", "Kaise lein:")}</span> {note.howToTake}
                  </p>
                  {note.caution ? (
                    <p className="mt-1 text-xs text-warn-ink">
                      <span className="font-semibold">{t("Careful:", "Dhyan de:")}</span> {note.caution}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <GuideSection title={t("Everyday care", "Roz ka dhyan")} items={guide.dailyCare} />
        <GuideSection title={t("Light exercise / rest", "Halki kasrat / aaram")} items={guide.exercise} />
        <GuideSection title={t("Precautions", "Bachav")} items={guide.precautions} />

        {guide.warningSigns?.length ? (
          <section className="mt-5 rounded-[16px] border border-danger-line bg-danger-bg p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-danger-ink">
              <AlertTriangle size={15} />
              {t("See a doctor at once if you notice these", "In nishaniyon par turant doctor")}
            </h3>
            <ol className="mt-2 space-y-1.5">
              {guide.warningSigns.map((sign, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-[#5c342f]">
                  <span className="js-code shrink-0 text-xs">{index + 1}.</span>
                  <span>{sign}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <GuideSection title={t("What next", "Aage kya")} text={guide.followUp} />

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button type="button" onClick={onDownload} disabled={isDownloading}>
            <Download size={15} />
            {isDownloading ? t("Downloading…", "Download ho raha…") : t("Download", "Download kijiye")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Close", "Band kijiye")}
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-2">
          Ye guide aapki chat ke aadhar par bani hai aur doctor ki salah ki jagah nahi leti.
        </p>
      </div>
    </div>
  );
}

export default function SehatClient({ user }) {
  const t = useT();
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [latest, setLatest] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [guide, setGuide] = useState(null);
  const [isBuildingGuide, setIsBuildingGuide] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [chatRes, orderRes] = await Promise.all([
          fetch("/api/chat", { credentials: "same-origin" }),
          fetch("/api/orders", { credentials: "same-origin" }),
        ]);

        const chatBody = await chatRes.json().catch(() => ({}));
        const orderBody = await orderRes.json().catch(() => ({}));

        if (chatRes.ok) setMessages(chatBody.data?.messages || []);
        if (orderRes.ok) setOrders(orderBody.data || []);
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, latest]);

  async function refreshOrders() {
    const response = await fetch("/api/orders", { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setOrders(body.data || []);
  }

  /**
   * A prescription lands in the conversation like any other turn: the card goes into the
   * message stream, and once it verifies the assistant is told, so it can pick up from
   * there instead of the user having to explain what just happened.
   */
  function handlePrescription(result) {
    setMessages((current) => {
      // The pending card is replaced by the verdict rather than stacking beneath it.
      const withoutPending = current.filter((message) => !message.prescription?.pending);
      return [...withoutPending, { role: "prescription", prescription: result }];
    });

    if (result.status === "VERIFIED" && result.unlocked?.length) {
      toast.success(t("Prescription verified", "Parchi verify ho gayi"), {
        description: t(
          `${result.unlocked.length} medicine unlocked for booking.`,
          `${result.unlocked.length} dawai book karne ke liye khul gayi.`
        ),
      });
      send(
        t(
          "I have sent the doctor's prescription. What should I do next?",
          "Maine doctor ki parchi bhej di hai. Ab aage kya karna hai?"
        )
      );
    }
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || isSending) return;

    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setLatest(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(t("No reply", "Jawab nahi mila"), {
          description: body?.message || t("Please try again.", "Dobara try kijiye."),
        });
        return;
      }

      setMessages((current) => [...current, { role: "assistant", content: body.data.reply }]);
      setLatest({ ...body.data, question: message });
    } catch (error) {
      toast.error(t("Connection problem", "Connection problem"), { description: error.message });
    } finally {
      setIsSending(false);
    }
  }

  async function placeOrder(sku, quantity) {
    setIsOrdering(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ sku, quantity, symptomsText: latest?.question || "" }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(t("Order failed", "Order nahi hua"), {
          description: body?.message || t("Please try again.", "Dobara try kijiye."),
        });
        setLatest((current) =>
          current
            ? {
                ...current,
                suggestions: current.suggestions.map((item) =>
                  item.sku === sku
                    ? { ...item, orderable: false, blockedMessage: body?.message }
                    : item
                ),
              }
            : current
        );
        return;
      }

      toast.success(t("Booked", "Book ho gaya"), { description: body.data.message });
      setLatest((current) =>
        current
          ? {
              ...current,
              suggestions: current.suggestions.map((item) =>
                item.sku === sku
                  ? {
                      ...item,
                      orderable: false,
                      blockedMessage: `Book ho chuki hai. Code: ${body.data.pickupCode}`,
                    }
                  : item
              ),
            }
          : current
      );
      await refreshOrders();
    } finally {
      setIsOrdering(false);
    }
  }

  async function buildGuide() {
    setIsBuildingGuide(true);
    try {
      const response = await fetch("/api/health-guide", {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(t("Guide not created", "Guide nahi bani"), { description: body?.message });
        return;
      }
      setGuide(body.data);
    } finally {
      setIsBuildingGuide(false);
    }
  }

  async function downloadGuide() {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/health-guide?format=text", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        toast.error(t("Download failed", "Download nahi hua"));
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "jansetu-sehat-guide.txt";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  /**
   * Ends this complaint and starts a new one. The finished conversation is kept on the
   * health record — nothing is thrown away — so the profile can still learn from it.
   */
  async function startFresh() {
    await fetch("/api/chat", { method: "DELETE", credentials: "same-origin" });
    setMessages([]);
    setLatest(null);
    setGuide(null);
    toast.success(t("Saved to your record", "Purani baat record me save ho gayi"), {
      description: t("Now tell me the new problem.", "Ab nayi takleef bataiye."),
    });
  }

  const pendingOrders = orders.filter((order) => order.status === "PENDING");
  const pastOrders = orders.filter((order) => order.status !== "PENDING");
  const userTurns = messages.filter((message) => message.role === "user").length;
  const areaLabel = user?.location?.village
    ? `${user.location.village}, ${user.location.district}`
    : t("Your area", "Apna ilaaka");

  return (
    <>
      {guide ? (
        <GuidePanel
          guide={guide}
          onClose={() => setGuide(null)}
          onDownload={downloadGuide}
          isDownloading={isDownloading}
        />
      ) : null}

      <div className="space-y-7">
        <ScreenHeader
          kicker={`Resident · ${areaLabel}`}
          title={t("Sehat Sahayak.", "Sehat Sahayak.")}
          subtitle={t(
            "Describe what is wrong, get guidance, and book the medicine you need at a nearby shop — never a diagnosis, only medicine guidance.",
            "Apni takleef bataiye, salah lijiye aur zaroorat ki dawai nazdeeki medical par book kijiye — diagnosis kabhi nahi, sirf dawai ki salah."
          )}
          actions={
            messages.length ? (
              <Button type="button" variant="outline" size="sm" onClick={startFresh}>
                <RotateCcw size={13} />
                {t("New conversation", "Nayi baat")}
              </Button>
            ) : null
          }
        />

        <TabNav items={RESIDENT_TABS} activeHref="/sehat" />

        <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
          {/* ------------------------------------------------------- chat -- */}
          <section
            data-reveal=""
            className="js-card flex min-h-[70vh] flex-col overflow-hidden p-0"
          >
            <header className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-tint text-brand">
                <Stethoscope size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Sehat Sahayak</p>
                <p className="text-[11.5px] text-muted-2">{areaLabel}</p>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-5 py-5">
              {!isLoaded ? (
                <p className="text-center text-sm text-muted-2">{t("Loading…", "Load ho raha hai…")}</p>
              ) : null}

              {isLoaded && !messages.length ? (
                // Centred while the thread is empty, so the page does not open as a card
                // pinned to the top of a tall blank area.
                <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-brand-tint text-brand">
                    <Stethoscope size={22} />
                  </span>
                  <p className="mt-4 text-base font-semibold text-ink">
                    {t(`Hello ${user?.name || ""}`, `Namaste ${user?.name || ""}`)}
                  </p>
                  <p className="mt-2 max-w-sm text-[12.5px] leading-[1.65] text-muted-2">
                    {t(
                      "Tell me what is wrong the way you would tell anyone. There is no hurry — I will only suggest medicine once I understand.",
                      "Jaise kisi se baat karte hain waise hi bataiye ki kya takleef hai. Jaldi nahi hai — samajh kar hi dawai bataunga."
                    )}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter.en}
                        type="button"
                        onClick={() => send(t(starter.en, starter.hi))}
                        className="rounded-full border border-line bg-card px-4 py-2 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand"
                      >
                        {t(starter.en, starter.hi)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-faint">
                    <Paperclip size={12} />
                    {t(
                      "Have a doctor's prescription? Send a photo using the clip below.",
                      "Doctor ki parchi hai? Neeche clip se photo bhej dijiye."
                    )}
                  </p>
                </div>
              ) : null}

              {messages.map((message, index) => {
                if (message.role === "prescription") {
                  return (
                    <div key={`rx-${index}`} className="flex justify-end">
                      <div className="max-w-[85%]">
                        <PrescriptionResultCard result={message.prescription} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${message.role}-${index}`}
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
                );
              })}

              {isSending ? (
                <p className="flex items-center gap-2 text-sm text-muted-2">
                  <Loader2 size={14} className="animate-spin" />
                  Soch raha hoon…
                </p>
              ) : null}

              {latest?.redFlags?.length ? (
                <div className="rounded-[16px] border border-danger-line bg-danger-bg p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-danger-ink">
                    <ShieldAlert size={15} />
                    Turant doctor ko dikhaiye
                  </p>
                  <p className="mt-1.5 text-xs text-[#5c342f]">
                    Is halat me koi dawai suggest nahi ki ja sakti.
                  </p>
                </div>
              ) : null}

              {latest?.conditionGuess ? (
                <p className="flex items-start gap-2 rounded-[14px] border border-line bg-brand-tint-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
                  <Info size={13} className="mt-0.5 shrink-0 text-brand" />
                  <span>
                    <span className="font-semibold">{t("Likely: ", "Kya lagta hai: ")}</span>
                    {latest.conditionGuess}
                  </span>
                </p>
              ) : null}

              {latest?.suggestions?.length ? (
                <div className="space-y-2.5">
                  <p className="js-mono text-[9px] tracking-[0.16em] text-muted-2">
                    {latest.intent === "DOCTOR_PRESCRIBED"
                      ? t("Doctor-prescribed medicine", "Doctor ki likhi dawai")
                      : t("Medicine for you", "Aapke liye dawai")}
                  </p>
                  {latest.suggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.sku}
                      suggestion={suggestion}
                      onOrder={placeOrder}
                      isOrdering={isOrdering}
                    />
                  ))}
                </div>
              ) : null}

              {latest?.needsPrescription ? (
                <div className="rounded-[16px] border border-warn-line bg-warn-bg p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-warn-ink">
                    <Paperclip size={15} />
                    {t("Prescription needed", "Parchi chahiye")}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-warn-ink">
                    {t(
                      "Medicine like antibiotics, malaria or TB drugs does harm if taken wrongly. Press the clip below and send a photo of the doctor's prescription — the medicine unlocks for booking as soon as it verifies.",
                      "Antibiotic, malaria ya TB jaisi dawai galat li jaye to nuksan karti hai. Neeche clip dabakar doctor ki parchi ki photo bhej dijiye — verify hote hi wo dawai book ho jayegi."
                    )}
                  </p>
                </div>
              ) : null}

              {latest?.careAdvice?.length ? (
                <div className="rounded-[16px] border border-brand-line bg-brand-tint p-4">
                  <p className="js-mono text-[9px] tracking-[0.16em] text-brand-strong">
                    {t("Besides medicine, do this", "Dawai ke alawa ye kijiye")}
                  </p>
                  <ol className="mt-2 space-y-1.5">
                    {latest.careAdvice.map((advice, index) => (
                      <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                        <span className="js-code shrink-0 text-xs text-brand">{index + 1}.</span>
                        <span>{advice}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
              className="flex items-center gap-2.5 border-t border-line-soft p-4"
            >
              <PrescriptionAttachButton onResult={handlePrescription} disabled={isSending} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t("Type here…", "Yahan likhiye…")}
                className="h-11 flex-1 rounded-[12px] border border-line bg-card px-4 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSending || !input.trim()}
                aria-label={t("Send", "Bhejiye")}
                className="h-11 w-11"
              >
                <Send size={15} />
              </Button>
            </form>
          </section>

          {/*
            Two cards, not five. The prescription upload moved into the composer and the
            rules text moved to a footnote, so the only panel that earns permanent space is
            the one carrying a number the person needs at the counter: their pickup code.
          */}
          <aside className="space-y-4">
            <Panel
              title={t("Your orders", "Aapke orders")}
              description={t(
                "Stock only drops when you collect the medicine from the shop.",
                "Stock tabhi ghatega jab aap medical se dawai lenge."
              )}
              actions={
                pendingOrders.length ? (
                  <Chip tone="warn">{pendingOrders.length} pending</Chip>
                ) : null
              }
            >
              <div className="space-y-2.5">
                {pendingOrders.length ? (
                  pendingOrders.map((order) => <OrderCard key={order.id} order={order} />)
                ) : (
                  <p className="text-xs text-muted-2">{t("No pending orders yet.", "Abhi koi pending order nahi.")}</p>
                )}
              </div>

              {pastOrders.length ? (
                <details className="mt-4">
                  <summary className="js-mono cursor-pointer text-[9px] tracking-[0.14em] text-muted-2 hover:text-brand">
                    {t(`Past orders (${pastOrders.length})`, `Purane orders (${pastOrders.length})`)}
                  </summary>
                  <div className="mt-2.5 space-y-2.5">
                    {pastOrders.slice(0, 6).map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                </details>
              ) : null}
            </Panel>

            <Panel
              title={t("A guide for this conversation", "Is baat ki guide")}
              description={t(
                "For the problem at hand: what to eat, what to avoid, and when to see a doctor.",
                "Abhi wali takleef ke liye: kya khayein, kya bachav karein, kab doctor ke paas jayein."
              )}
            >
              <Button
                type="button"
                variant="outline"
                onClick={buildGuide}
                disabled={isBuildingGuide || userTurns < 2}
                className="w-full"
              >
                {isBuildingGuide ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("Creating…", "Ban rahi hai…")}
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    {t("Create the guide", "Guide banaiye")}
                  </>
                )}
              </Button>
              {userTurns < 2 ? (
                <p className="mt-2.5 text-xs text-muted-2">
                  {t(
                    "Talk a little about the problem first.",
                    "Pehle apni takleef ke baare me thodi baat kar lijiye."
                  )}
                </p>
              ) : (
                <Link
                  href="/sehat/profile"
                  className="mt-3 block text-center text-xs font-semibold text-brand hover:underline"
                >
                  {t("See the record of every past illness", "Saari purani bimariyon ka record dekhiye")}
                </Link>
              )}
            </Panel>

            <p className="px-1 text-[11px] leading-[1.75] text-muted-2">
              {t(
                "The same medicine cannot be ordered again and again — a new order opens only after the last one is collected, so the area's data stays honest.",
                "Ek hi dawai baar-baar order nahi ho sakti — pichhla order uthane ke baad hi naya banega, taaki ilaake ka data sahi rahe."
              )}
              <br />
              <br />
              {t(
                "This is not a substitute for a doctor. If it worsens or lasts more than 3 days, go to a PHC. In an emergency, call 108.",
                "Ye doctor ki jagah nahi hai. Takleef badhe ya 3 din se zyada rahe to PHC jaiye. Emergency me 108."
              )}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
