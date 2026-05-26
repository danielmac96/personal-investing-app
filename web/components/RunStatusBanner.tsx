import { formatDate } from "@/lib/format";

export type RoutineRun = {
  run_type: string;
  run_date: string;
  status: string;
  email_status: string | null;
  error: string | null;
  created_at: string;
};

/**
 * Renders nothing on a clean run. Shows a warning banner when the latest
 * routine run failed/was partial, or when the morning email didn't go out.
 */
export function RunStatusBanner({ run }: { run: RoutineRun | null }) {
  if (!run) return null;

  const emailProblem = run.email_status === "failed";
  const runProblem = run.status === "failed" || run.status === "partial";
  if (!emailProblem && !runProblem) return null;

  const headline =
    run.status === "failed"
      ? `The ${run.run_type.replace("_", " ")} on ${formatDate(run.run_date)} failed.`
      : emailProblem
        ? `The briefing for ${formatDate(run.run_date)} ran, but the email didn't send.`
        : `The ${run.run_type.replace("_", " ")} on ${formatDate(run.run_date)} finished with warnings.`;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-medium">{headline}</div>
      {run.error && (
        <div className="mt-1 truncate font-mono text-xs text-amber-800">
          {run.error}
        </div>
      )}
    </div>
  );
}
