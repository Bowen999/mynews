// Client-side registry of unsaved edits, so actions elsewhere on the page can warn before they are lost.

let pending: string | null = null;

/** Called by a form when it gains or loses unsaved edits (a sentence describing them, or null). */
export function setUnsavedChanges(description: string | null) {
  pending = description;
}

/** True when there is nothing unsaved, or the reader confirms that `question` should go ahead anyway. */
export function confirmUnsaved(question: string): boolean {
  return !pending || window.confirm(`${pending} ${question}`);
}
