/** A Postgres uuid. Checked before querying: a malformed id is a 400, not a 500 from the driver. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** A foreign-key violation: the folder was deleted, probably on another device. */
export function isMissingFolder(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: string; cause?: unknown };
    if (candidate.code === "23503") return true;
    current = candidate.cause;
  }
  return false;
}
