export function isUniqueConstraintError(error: unknown) {
  const visited = new Set<unknown>();
  let current = error;

  while (current && !visited.has(current)) {
    visited.add(current);

    if (typeof current === "object") {
      const details = current as {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        cause?: unknown;
      };
      const description = [details.name, details.message, details.code]
        .filter((value) => value !== undefined)
        .map(String)
        .join(": ");
      if (/unique constraint|sqlite_constraint_unique|constraint_unique/i.test(description)) {
        return true;
      }
      current = details.cause;
      continue;
    }

    if (/unique constraint|sqlite_constraint_unique|constraint_unique/i.test(String(current))) {
      return true;
    }
    break;
  }

  return false;
}
