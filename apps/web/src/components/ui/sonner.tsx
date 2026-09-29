"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // Cosmoz has TWO dark themes (dark-blue, dark); sonner only knows light/dark.
  // Toast colors are already bound to Cosmoz tokens via the style vars below,
  // this mapping only keeps the sonner `theme` prop value valid.
  const sonnerTheme: ToasterProps["theme"] =
    theme === "light" ? "light" : theme === "system" ? "system" : "dark"

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Cosmoz exposes RAW theme vars (--surface*, --text-*, --border) —
          // there is no --popover/--radius on :root (only --color-* Tailwind
          // aliases inside @theme). Binding to the raw vars keeps every toast
          // OPAQUE and legible across all three themes (fix: toasts used to
          // render transparent/invisible).
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        // Elevate above the app chrome — hairline border + real shadow so a
        // toast is always readable, whatever sits underneath it.
        style: {
          border: "1px solid var(--border)",
          boxShadow: "0 8px 24px rgb(0 0 0 / 0.35)",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
