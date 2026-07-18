import { clsx } from "clsx";
import type { JobStatus, Stage } from "@/lib/types";

const STYLES: Record<string, string> = {
  NEW: "bg-neutral-200 text-neutral-700",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  QUEUED: "bg-neutral-200 text-neutral-700",
  DOWNLOADING: "bg-blue-100 text-blue-700",
  PROBING: "bg-blue-100 text-blue-700",
  TRANSCODING: "bg-indigo-100 text-indigo-700",
  PACKAGING: "bg-violet-100 text-violet-700",
};

export function StatusBadge({ value }: { value: JobStatus | Stage }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[value] ?? "bg-neutral-200 text-neutral-700",
      )}
    >
      {value}
    </span>
  );
}
