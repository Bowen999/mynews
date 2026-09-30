import type { LLMProvider } from "../llm/types";
import type { Store } from "../store/types";
import type { Profile, RequiredInput, Run } from "../types";
import type { Deadline } from "../util/concurrency";
import type { Window } from "../util/dates";

export interface StageContext {
  run: Run;
  store: Store;
  profile: Profile;
  window: Window;
  deadline: Deadline;
  llm(): LLMProvider;
  log(level: "info" | "warn" | "error", message: string): void;
  /** Update the live status line for the current stage (persisted, throttled). */
  detail(text: string): Promise<void>;
}

/** `done: false` means the stage made progress but needs another invocation to finish. */
export type StageResult = { done: boolean };

export class NeedsInputError extends Error {
  constructor(readonly inputs: RequiredInput[]) {
    super(inputs.map((i) => i.message).join(" "));
    this.name = "NeedsInputError";
  }
}
