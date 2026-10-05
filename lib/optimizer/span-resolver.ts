import { ProtectedSpan } from "../types";

export function getFullyResolvedSpans(spans: ProtectedSpan[]): ProtectedSpan[] {
  // Build a lookup map
  const spanMap = new Map<string, string>();
  for (const s of spans) {
    spanMap.set(s.placeholder, s.original);
  }

  // Fully resolve each span's original string
  return spans.map((span) => {
    let resolved = span.original;
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      for (const [ph, orig] of spanMap.entries()) {
        if (resolved.includes(ph)) {
          resolved = resolved.split(ph).join(orig);
          changed = true;
        }
      }
    }
    return {
      ...span,
      original: resolved,
    };
  });
}
