/**
 * TEMPORARY. The report figures no table in this app records yet.
 *
 * Two of the five Reports Hub tabs need numbers that nothing produces:
 *
 * - **Stitches per worker per day.** Stitch counts exist per *order*
 *   (`orders.needles`), never per person — there is no attribution of a run to
 *   whoever was standing at the machine, and no shift table to divide by. The
 *   Bonus Slab screen's worker snapshot needs the same figure, which is why it
 *   is one function and not two.
 * - **Machine uptime and downtime.** `machines` records a status right now, not
 *   a history of it, so there is nothing to integrate over a week.
 *
 * Prompt 9 §B5 marks both as illustrative placeholders, so they are generated
 * here rather than left blank — a card with no numbers on it does not show what
 * the report is for. Everything else on those tabs is real: the worker roster,
 * damage deductions, the machine roster and each machine's current job all come
 * from live rows.
 *
 * Generated from a hash of the row's id rather than at random, so a figure does
 * not change between two renders of the same screen, and the same worker reads
 * the same on Reports Hub and on Bonus Slab Config. Replace the whole file when
 * the underlying tables exist; every use site reads from here so that swap is
 * one file, exactly like `data/workers.ts`.
 */

/** FNV-1a. A small stable hash, not a security primitive. */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** A stable value in `[min, max]`, stepped — `salt` varies the draw per field. */
function pick(seed: string, salt: string, min: number, max: number, step = 1): number {
  const span = Math.floor((max - min) / step) + 1;
  return min + (hash(`${seed}:${salt}`) % span) * step;
}

export interface WorkerOutput {
  /** Rounded to the nearest hundred — nobody counts stitches to the unit. */
  avgStitchesPerDay: number;
  efficiencyPct: number;
}

export function workerOutput(employeeId: string): WorkerOutput {
  return {
    avgStitchesPerDay: pick(employeeId, 'stitches', 3800, 4900, 100),
    efficiencyPct: pick(employeeId, 'efficiency', 78, 96),
  };
}

const DOWNTIME_REASONS = [
  'Thread change',
  'Needle break',
  'Scheduled maintenance',
  'Bobbin refill',
  'Power cut',
] as const;

export interface MachineUptime {
  uptimePct: number;
  /** Hours, to the half hour. */
  downtimeHours: number;
  /** "Thread change, Aug 29". */
  reason: string;
}

export function machineUptime(machineId: string): MachineUptime {
  const reason = DOWNTIME_REASONS[hash(`${machineId}:reason`) % DOWNTIME_REASONS.length];

  // Some day inside the week the uptime figure covers, so the caption cannot
  // name a date after the period it belongs to.
  const daysAgo = pick(machineId, 'when', 0, 6);
  const when = new Date();
  when.setDate(when.getDate() - daysAgo);

  return {
    uptimePct: pick(machineId, 'uptime', 68, 97),
    downtimeHours: pick(machineId, 'downtime', 2, 12, 0.5),
    reason: `${reason}, ${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  };
}

/** Shown wherever these numbers are, so nobody reads them as measurements. */
export const ILLUSTRATIVE_NOTE =
  'Stitch counts, efficiency and machine hours are illustrative — nothing in the app records output per worker or machine hours yet. The rosters, damage deductions and machine status above are live.';
