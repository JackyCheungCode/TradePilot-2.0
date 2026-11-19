export function filterVisibleDiscoveryRecords(
  rows: Array<Record<string, unknown>>,
  runId?: string | null,
): Array<Record<string, unknown>> {
  return rows.flatMap(record => {
    const occurrences = Array.isArray(record.discovery_record_occurrences)
      ? record.discovery_record_occurrences as Array<Record<string, unknown>>
      : [];
    const activeOccurrences = occurrences.filter(item =>
      item.is_removed !== true && (!runId || String(item.run_id) === runId),
    );
    if (runId && !activeOccurrences.length) return [];
    if (!runId && occurrences.length > 0 && !activeOccurrences.length) return [];
    return [{ ...record, discovery_record_occurrences: activeOccurrences }];
  });
}
