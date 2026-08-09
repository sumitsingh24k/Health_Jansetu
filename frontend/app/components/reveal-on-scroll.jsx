"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Fades sections in as they enter the viewport.
 *
 * One observer for the whole app rather than a wrapper component per card: the cards
 * are plain markup, they only opt in with `data-reveal`, and nothing has to be
 * converted into a client component just to animate. Elements that are already on
 * screen at mount are shown on the first callback, so nothing above the fold waits
 * for a scroll that may never happen.
 */
export default function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const show = (element) => element.setAttribute("data-reveal", "shown");

    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
      document.querySelectorAll("[data-reveal]").forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    const scan = () => {
      document.querySelectorAll('[data-reveal=""]').forEach((element) => observer.observe(element));
    };

    scan();

    // Panels that mount after a fetch resolves, or after a tab is switched, still
    // need picking up. Coalesced into one frame so a chart re-render does not
    // trigger a full document query per inserted node.
    let queued = 0;
    const mutations = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (queued) cancelAnimationFrame(queued);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return null;
}
