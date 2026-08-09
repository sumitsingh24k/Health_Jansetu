"use client";

import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-[16px] border border-line bg-card shadow-[0_22px_50px_rgba(18,32,25,0.18)]",
          title: "font-semibold text-ink",
          description: "text-[12.5px] text-muted",
        },
      }}
      {...props}
    />
  );
}
