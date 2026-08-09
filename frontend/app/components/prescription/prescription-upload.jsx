"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Paperclip, XCircle } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Attach control for the chat composer.
 *
 * A prescription belongs in the conversation, not in a panel beside it — the person is
 * already explaining their problem, and handing over the paper is part of that same
 * exchange. Reading and verifying happens server-side; this only picks the file and
 * hands the verdict back to the chat.
 */
export function PrescriptionAttachButton({ onResult, disabled }) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error("Sirf JPG, PNG ya WEBP photo chalegi");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo bahut badi hai", { description: "4 MB se chhoti photo lijiye." });
      return;
    }

    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Photo padhi nahi ja saki"));
      reader.readAsDataURL(file);
    }).catch((error) => {
      toast.error(error.message);
      return null;
    });

    if (!dataUri) return;

    onResult?.({ pending: true, preview: dataUri });
    setIsUploading(true);

    try {
      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ imageBase64: dataUri, mimeType: file.type }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        onResult?.({ error: payload?.message || "Upload nahi hua", preview: dataUri });
        return;
      }

      onResult?.({ ...payload.data, preview: dataUri });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading}
        title="Doctor ki parchi ki photo bhejiye"
        aria-label="Doctor ki parchi ki photo bhejiye"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Paperclip size={17} />
        )}
      </button>
    </>
  );
}

/** The verdict, rendered as a card in the conversation itself. */
export function PrescriptionResultCard({ result }) {
  if (result.pending) {
    return (
      <div className="rounded-[16px] border border-line bg-brand-tint-2 p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <Loader2 size={14} className="animate-spin" />
          Parchi padhi ja rahi hai…
        </p>
        {result.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.preview}
            alt="Bheji gayi parchi"
            className="mt-2.5 max-h-40 rounded-[12px] border border-line object-contain"
          />
        ) : null}
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="rounded-[16px] border border-danger-line bg-danger-bg p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-danger-ink">
          <XCircle size={15} />
          Parchi bheji nahi ja saki
        </p>
        <p className="mt-1.5 text-xs text-[#5c342f]">{result.error}</p>
      </div>
    );
  }

  const tone =
    result.status === "VERIFIED"
      ? { box: "border-brand-line bg-brand-tint", text: "text-brand-strong", Icon: CheckCircle2, title: "Parchi verify ho gayi" }
      : result.status === "EXPIRED"
        ? { box: "border-warn-line bg-warn-bg", text: "text-warn-ink", Icon: AlertTriangle, title: "Parchi purani ho chuki hai" }
        : { box: "border-danger-line bg-danger-bg", text: "text-danger-ink", Icon: XCircle, title: "Parchi manzoor nahi hui" };

  const { Icon } = tone;

  return (
    <div className={`rounded-[16px] border p-3.5 ${tone.box}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${tone.text}`}>
        <Icon size={15} />
        {tone.title}
      </p>

      {result.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.preview}
          alt="Bheji gayi parchi"
          className="mt-2.5 max-h-36 rounded-[12px] border border-white/70 object-contain"
        />
      ) : null}

      {result.doctorName || result.prescribedOn ? (
        <p className={`mt-2 text-xs ${tone.text}`}>
          {result.doctorName ? `Dr. ${result.doctorName}` : "Doctor ka naam nahi dikha"}
          {result.clinicName ? ` · ${result.clinicName}` : ""}
          {result.prescribedOn
            ? ` · ${new Date(result.prescribedOn).toLocaleDateString("en-IN")}`
            : ""}
        </p>
      ) : null}

      {result.unlocked?.length ? (
        <div className="mt-2">
          <p className={`text-xs font-semibold ${tone.text}`}>Ab ye dawai book kar sakte hain:</p>
          <p className={`text-xs ${tone.text}`}>
            {result.unlocked.map((item) => item.brand).join(", ")}
          </p>
        </div>
      ) : null}

      {result.reasons?.length ? (
        <ul className={`mt-2 space-y-0.5 text-xs ${tone.text}`}>
          {result.reasons.map((reason, index) => (
            <li key={index}>• {reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
