import type { Run } from "./types";

/** Client-facing run: progress and log without the large intermediate pipeline state. */
export type RunView = Omit<Run, "state" | "leaseUntil" | "baseUrl"> & {
  counts: { candidates?: number; clusters?: number; selected?: number; written?: number; queries?: number };
};

export function toRunView(run: Run): RunView {
  const { state } = run;
  const rest: Partial<Run> = { ...run };
  delete rest.state;
  delete rest.leaseUntil;
  delete rest.baseUrl;
  return {
    ...(rest as Omit<Run, "state" | "leaseUntil" | "baseUrl">),
    log: run.log.slice(-60),
    counts: {
      queries: state.queriesRun,
      candidates: state.candidates?.length,
      clusters: state.clusters?.length,
      selected: state.selected?.length,
      written: state.items?.length,
    },
  };
}
