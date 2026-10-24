let lastImportTime = 0;
/** Keep ordering deterministic even when multiple imports happen in the same millisecond. */
export function importTimestamp(previous = 0) {
  lastImportTime = Math.max(Date.now(), lastImportTime + 1, previous + 1);
  return lastImportTime;
}
