"use client";
// "Install SalesOS" card: the browser's install prompt where it exists
// (Chrome / Edge / Android), step-by-step help on iPhone/iPad (Safari has no prompt).
import * as React from "react";
import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallApp() {
  const [prompt, setPrompt] = React.useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [ios, setIos] = React.useState(false);
  const [secure, setSecure] = React.useState(true);

  React.useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    // Reading the device once on mount — browser-only facts.
    /* eslint-disable react-hooks/set-state-in-effect */
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setSecure(window.isSecureContext);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-ok)]">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> The app is installed on this device.
      </p>
    );
  }
  if (!secure) {
    return <p className="text-sm text-[color:var(--color-ink-3)]">Installing needs the secure (https://) address.</p>;
  }
  if (ios) {
    return (
      <ol className="space-y-2 text-sm text-[color:var(--color-ink-2)]">
        <li className="flex items-center gap-2">1. Open this page in <b>Safari</b>.</li>
        <li className="flex items-center gap-2">2. Tap <Share className="h-4 w-4" aria-label="Share" /> <b>Share</b>.</li>
        <li className="flex items-center gap-2">3. Tap <SquarePlus className="h-4 w-4" aria-hidden /> <b>Add to Home Screen</b>.</li>
      </ol>
    );
  }
  return prompt ? (
    <Button gold onClick={install} className="w-full">
      <Download className="mr-2 h-4 w-4" aria-hidden /> Install the app
    </Button>
  ) : (
    <p className="text-sm text-[color:var(--color-ink-2)]">
      Use your browser menu → <b>Install Kumar Food Machinery</b> (or <b>Add to Home screen</b> on Android).
    </p>
  );
}
