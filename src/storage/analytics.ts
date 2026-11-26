import {
  FAULT_TYPES,
  FAULT_TYPE_LABELS,
  type DashboardStats,
  type FaultTypeStat,
  type IncidentRecord,
} from '../types';
import { computeResolutionMinutes } from './sanitizer';

/**
 * Strictly calculates all dashboard KPIs and distributions from the provided
 * incidents array. Never fabricates or hardcodes metrics.
 */
export function calculateDashboardStats(incidents: IncidentRecord[]): DashboardStats {
  const totalCount = incidents.length;
  let resolvedCount = 0;
  let sampleCount = 0;
  const validResolutionDurations: number[] = [];

  const faultCounts = new Map<string, { count: number; resolvedCount: number }>();
  for (const faultType of FAULT_TYPES) {
    faultCounts.set(faultType, { count: 0, resolvedCount: 0 });
  }

  for (const incident of incidents) {
    if (incident.isSample === true) {
      sampleCount += 1;
    }

    const bucket = faultCounts.get(incident.faultType);
    if (bucket) {
      bucket.count += 1;
    }

    if (incident.status === 'resolved') {
      resolvedCount += 1;
      if (bucket) {
        bucket.resolvedCount += 1;
      }

      const duration =
        typeof incident.resolutionMinutes === 'number' &&
        Number.isFinite(incident.resolutionMinutes) &&
        incident.resolutionMinutes >= 0
          ? incident.resolutionMinutes
          : computeResolutionMinutes(incident.occurredAt, incident.resolvedAt);

      if (duration !== undefined) {
        validResolutionDurations.push(duration);
      }
    }
  }

  const unresolvedCount = totalCount - resolvedCount;
  const resolutionRate =
    totalCount === 0 ? 0 : Math.round((resolvedCount / totalCount) * 1000) / 10;

  const averageResolutionMinutes =
    validResolutionDurations.length === 0
      ? null
      : Math.round(
          (validResolutionDurations.reduce((acc, value) => acc + value, 0) /
            validResolutionDurations.length) *
            10
        ) / 10;

  const byFaultType: FaultTypeStat[] = FAULT_TYPES.map((faultType) => {
    const bucket = faultCounts.get(faultType) ?? { count: 0, resolvedCount: 0 };
    return {
      faultType,
      label: FAULT_TYPE_LABELS[faultType],
      count: bucket.count,
      resolvedCount: bucket.resolvedCount,
    };
  });

  const recentIncidents = [...incidents]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 5);

  return {
    totalCount,
    resolvedCount,
    unresolvedCount,
    resolutionRate,
    averageResolutionMinutes,
    byFaultType,
    recentIncidents,
    sampleCount,
  };
}
