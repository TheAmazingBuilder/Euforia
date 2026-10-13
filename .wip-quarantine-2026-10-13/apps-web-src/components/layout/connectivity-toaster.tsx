"use client";

import * as React from "react";
import { Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Connectivity toasts (Priorité 3 polish) — Cosmoz is offline-capable, so
 * losing the network is a state change worth surfacing once, not an error:
 * the shell keeps rendering, journaled data stays local and the JSON backup
 * lives on-device. Online/offline events fire once per transition, which is
 * exactly the toast cadence we want — no extra debouncing needed.
 */
export function ConnectivityToaster() {
  React.useEffect(() => {
    const goOffline = () => {
      toast.warning("You're offline", {
        icon: <WifiOff className="size-4" aria-hidden="true" />,
        description:
          "Cosmoz keeps running from local data — capture as usual, nothing is lost.",
      });
    };
    const goOnline = () => {
      toast.success("Back online", {
        icon: <Wifi className="size-4" aria-hidden="true" />,
        description: "Live data is flowing again.",
      });
    };

    // Already offline when the app mounts (restored tab in airplane mode).
    if (!window.navigator.onLine) goOffline();

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return null;
}
