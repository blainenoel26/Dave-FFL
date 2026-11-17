"use client";

import { useEffect, useState } from "react";

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; standalone?: boolean };

/** True when running as a home-screen app on a phone that can badge the icon but hasn't been allowed yet. */
async function needsPermission(): Promise<boolean> {
  const nav = navigator as BadgeNavigator;
  const installed = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  return installed && typeof nav.setAppBadge === "function" && "Notification" in window && Notification.permission === "default";
}

/**
 * iPhones only show the unread count on the app icon once notifications are allowed, and that can
 * only be asked after a tap. Shown on the Banter page in the home-screen app until it's answered.
 */
export function IconBadgeSetup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    void needsPermission().then(setShow);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().finally(() => setShow(false))}
      className="card w-full text-left text-sm"
    >
      <strong>Show the unread count on the app icon</strong>
      <span className="block text-muted">Tap, then choose Allow. Dave FFL only uses this for the red number.</span>
    </button>
  );
}
