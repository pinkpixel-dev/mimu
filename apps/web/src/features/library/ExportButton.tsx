import { useState } from "react";
import { saveBlob } from "../../lib/download.ts";

interface Props {
  label: string;
  title: string;
  run: () => Promise<{ blob: Blob; filename: string }>;
  className?: string;
}

/** A download button with real busy and error states, used for single-note and full-library export. */
export function ExportButton({ label, title, run, className = "button" }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function onClick() {
    setState("busy");
    try {
      const { blob, filename } = await run();
      saveBlob(blob, filename);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={state === "busy"} title={title}>
      {state === "busy" ? "Exporting…" : state === "error" ? "Export failed · Retry" : label}
    </button>
  );
}
