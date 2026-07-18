import { clsx } from "clsx";

export function ProgressBar({ value, failed }: { value: number; failed?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
      <div
        className={clsx("h-full transition-all duration-300", failed ? "bg-red-500" : "bg-blue-500")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
