import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { STAGE_DEFS, type StageKey } from '../../data/stageDefs';
import {
  billingSchema,
  needleEntrySchema,
  orderStagesSchema,
  stockTypeSchema,
  uuid,
  type StockType,
} from '../../data/types';
import {
  currentMonthLabel,
  currentMonthStartIso,
  currentPeriod,
  monthExpensesByCategoryTotal,
  netFor,
  totalBillFor,
  type CurrentMonthStats,
} from '../../lib/ledgerMath';
import { getCurrentMonthPnl } from './api';
import { machineUptime, workerOutput } from './illustrative';
import {
  FINISHING_STAGES,
  type FinishingStage,
} from './rosters';

/**
 * The five Reports Hub tabs.
 *
 * Every tab is a read — this screen writes nothing, and the role has no grant
 * that would let it. Three of the five are mirrors of another module's own
 * numbers rather than a second calculation of them:
 *
 * - **P&L** is the Accountant's Stats tab, through the same `ledgerMath`
 *   helpers. A second formula here is how the owner and the accountant end up
 *   disagreeing about the month.
 * - **Leakage** is the Store Manager's Weekly Stock Audit, read from the
 *   owner's side. There is no separate leakage calculation anywhere.
 * - **Uptime**'s machine roster and Running/Idle status are the Floor Manager's
 *   `machines` rows.
 *
 * Per-Order is the one tab that computes something new, and its cost side is a
 * documented apportionment rather than itemised cost — see `orderProfit` below.
 */

// --- P&L --------------------------------------------------------------------

export interface PnlMonth {
  /** "Aug 2026". */
  label: string;
  income: number;
  payables: number;
  salary: number;
  /** The expense ledger only: payables and salary are their own rows. */
  fixedExpenses: number;
  net: number;
}

const monthHistorySchema = z.object({
  month_label: z.string(),
  income: z.number(),
  payables: z.number(),
  salary: z.number(),
  expenses_by_category: z.record(z.string(), z.number()),
});

async function getPnl(
  factoryId: string,
  stats: CurrentMonthStats,
): Promise<{ current: PnlMonth; closed: PnlMonth[] }> {
  const history = await supabase
    .from('monthly_history')
    .select('month_label, income, payables, salary, expenses_by_category')
    .eq('factory_id', factoryId);

  if (history.error) throw history.error;

  return {
    current: {
      label: currentMonthLabel(),
      income: stats.income,
      payables: stats.payables,
      salary: stats.salary,
      fixedExpenses: stats.expensesTab,
      net: stats.net,
    },
    closed: z
      .array(monthHistorySchema)
      .parse(history.data)
      .map((month) => ({
        label: month.month_label,
        income: month.income,
        payables: month.payables,
        salary: month.salary,
        fixedExpenses: monthExpensesByCategoryTotal(month),
        net: netFor(month),
      })),
  };
}

// --- Per-order profitability ------------------------------------------------

export interface OrderProfit {
  id: string;
  code: string;
  clientName: string;
  revenue: number;
  cost: number;
  net: number;
  /** Null when the order has no revenue to take a percentage of. */
  marginPct: number | null;
}

const profitOrderSchema = z.object({
  id: uuid(),
  code: z.string(),
  billing: billingSchema.nullable(),
  needles: z.array(needleEntrySchema).nullable(),
  stages: orderStagesSchema.nullable(),
  clients: z.object({ name: z.string() }).nullable(),
  order_sheets: z.array(z.object({ repeats: z.number().int() })),
});

const partnerRateSchema = z.object({
  stage_type: z.enum(FINISHING_STAGES),
  rate: z.number(),
});

/** Mean per-repeat rate of the active partners doing each stage. */
function ratesByStage(
  rows: z.infer<typeof partnerRateSchema>[],
): Record<FinishingStage, number> {
  const totals = { clipping: 0, piko: 0, press: 0 };
  const counts = { clipping: 0, piko: 0, press: 0 };

  for (const row of rows) {
    totals[row.stage_type] += row.rate;
    counts[row.stage_type] += 1;
  }

  return {
    clipping: counts.clipping ? totals.clipping / counts.clipping : 0,
    piko: counts.piko ? totals.piko / counts.piko : 0,
    press: counts.press ? totals.press / counts.press : 0,
  };
}

/**
 * This month's orders, priced against an apportioned cost.
 *
 * **The cost side is a placeholder, and the column header says so.** Nothing in
 * this app costs an order: `po_items.price` is what a *purchase order* cost,
 * not what an order consumed of it, and no table attributes a worker's hours to
 * a job. So "Thread + Labor + Finishing" is built out of what does exist:
 *
 * - **Thread + Labor** — the month's real supplier payments and paid salaries,
 *   the same two figures the P&L tab shows, apportioned across the month's
 *   orders by each order's share of total repeats. One driver rather than three
 *   because a second guessed driver is not more accurate than the first, only
 *   harder to explain.
 * - **Finishing** — real. Each order's `stages` flags say which finishing
 *   stages it runs, and `finishing_partners` holds a per-repeat rate for each.
 *
 * Scoped to the current month because the cost pools are: apportioning this
 * month's payroll across last quarter's orders would charge an order for work
 * done long after it shipped. Orders with no billing terms are left out
 * entirely — an order with no rate has no revenue to compare a cost against,
 * and a zero would read as a loss rather than as missing data.
 */
async function getOrderProfits(
  factoryId: string,
  stats: CurrentMonthStats,
): Promise<OrderProfit[]> {
  const [orders, partners] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, code, billing, needles, stages, clients(name), order_sheets(repeats)',
      )
      .eq('factory_id', factoryId)
      .gte('created_at', currentMonthStartIso())
      .order('created_at', { ascending: false }),
    supabase
      .from('finishing_partners')
      .select('stage_type, rate')
      .eq('factory_id', factoryId)
      .eq('status', 'active'),
  ]);

  if (orders.error) throw orders.error;
  if (partners.error) throw partners.error;

  const rates = ratesByStage(z.array(partnerRateSchema).parse(partners.data));

  const priced = z
    .array(profitOrderSchema)
    .parse(orders.data)
    .filter((order) => order.billing !== null && order.order_sheets.length > 0)
    .map((order) => ({
      order,
      repeats: order.order_sheets.reduce((sum, sheet) => sum + sheet.repeats, 0),
      revenue: totalBillFor({
        sheets: order.order_sheets,
        needles: order.needles ?? [],
        billing: order.billing,
        damagedRepeatsPrice: 0,
        payments: [],
      }),
    }));

  const pool = stats.payables + stats.salary;
  const totalRepeats = priced.reduce((sum, entry) => sum + entry.repeats, 0);

  return priced.map(({ order, repeats, revenue }) => {
    const share = totalRepeats > 0 ? repeats / totalRepeats : 0;
    const finishing = order.stages
      ? FINISHING_STAGES.reduce(
          (sum, stage) => sum + (order.stages?.[stage] ? rates[stage] * repeats : 0),
          0,
        )
      : 0;

    const cost = Math.round(pool * share + finishing);
    const net = revenue - cost;

    return {
      id: order.id,
      code: order.code,
      clientName: order.clients?.name ?? 'Unknown client',
      revenue,
      cost,
      net,
      marginPct: revenue > 0 ? Math.round((net / revenue) * 100) : null,
    };
  });
}

// --- Leakage ----------------------------------------------------------------

export interface LeakageItem {
  id: string;
  label: string;
  /** Signed and unit-suffixed, e.g. "-80g" or "+3 CDs". */
  variance: string;
  short: boolean;
}

export interface LeakageAudit {
  id: string;
  date: string;
  itemsChecked: number;
  itemsMatched: number;
  varianceCount: number;
  items: LeakageItem[];
}

const leakageAuditSchema = z.object({
  id: uuid(),
  date: z.string(),
  items_checked: z.number().int(),
  items_matched: z.number().int(),
  variance_count: z.number().int(),
  audit_line_items: z.array(
    z.object({
      id: uuid(),
      variance: z.number(),
      stock_items: z
        .object({ label: z.string(), type: stockTypeSchema })
        .nullable(),
    }),
  ),
});

/** Sequin is counted in CDs; everything else is weighed. */
function varianceLabel(variance: number, stockType: StockType): string {
  const unit = stockType === 'sequin' ? ' CDs' : 'g';
  const sign = variance < 0 ? '-' : '+';
  return `${sign}${Math.abs(variance).toLocaleString()}${unit}`;
}

/**
 * The Store Manager's own audits, read from the owner's side.
 *
 * There is no separate leakage table and no second count: a variance is what
 * the weekly stock audit already recorded, and this tab is that data with a
 * different heading on it. Matched lines are dropped here rather than in the
 * query so `variance_count` on the parent row stays the number the audit
 * itself reported.
 */
async function getLeakage(factoryId: string): Promise<LeakageAudit[]> {
  const { data, error } = await supabase
    .from('audit_records')
    .select(
      'id, date, items_checked, items_matched, variance_count, audit_line_items(id, variance, stock_items(label, type))',
    )
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });

  if (error) throw error;

  return z
    .array(leakageAuditSchema)
    .parse(data)
    .map((audit) => ({
      id: audit.id,
      date: audit.date,
      itemsChecked: audit.items_checked,
      itemsMatched: audit.items_matched,
      varianceCount: audit.variance_count,
      items: audit.audit_line_items
        .filter((line) => line.variance !== 0)
        .map((line) => ({
          id: line.id,
          label: line.stock_items?.label ?? 'Unknown item',
          variance: varianceLabel(line.variance, line.stock_items?.type ?? 'thread'),
          short: line.variance < 0,
        })),
    }));
}

// --- Productivity -----------------------------------------------------------

export interface WorkerProductivity {
  id: string;
  name: string;
  avgStitchesPerDay: number;
  efficiencyPct: number;
  /**
   * This period's damage deduction, or null when there was none.
   *
   * Null and zero are the same fact here and both render the "No damage this
   * period" line — the card shows exactly one of the two lines, never both.
   */
  damage: { amount: number; stageLabel: string | null } | null;
}

const damageSchema = z.object({
  damage_deduction: z.number(),
  damage_stage: z.string().nullable(),
  profiles: z.object({ full_name: z.string() }).nullable(),
});

const productivityEmployeeSchema = z.object({
  id: uuid(),
  name: z.string(),
});

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stageLabelOf(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_DEFS[stage as StageKey]?.label ?? stage;
}

/**
 * Machine workers, their output, and whether they were docked this period.
 *
 * The roster is real — `employees` filtered to machine workers, which is the
 * roster this same module curates. Output is illustrative (see
 * `illustrative.ts`); the damage deduction is real, off this period's
 * `salary_records`.
 *
 * Those two are joined **by name**, which is not how a join should work and is
 * flagged rather than hidden: `0010_company_admin.sql` deliberately left
 * `employees` unlinked from `profiles` — payroll pays a profile, the roster
 * describes a person, and nothing in the spec ties one to the other. Until that
 * link exists the name is the only bridge there is. Add the foreign key and
 * this becomes a real join and nothing else on the tab changes.
 */
async function getProductivity(factoryId: string): Promise<WorkerProductivity[]> {
  const [employees, salaries] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name')
      .eq('factory_id', factoryId)
      .eq('status', 'active')
      .eq('role', 'machine_worker')
      .order('name'),
    supabase
      .from('salary_records')
      .select('damage_deduction, damage_stage, profiles:person_id(full_name)')
      .eq('factory_id', factoryId)
      .eq('period', currentPeriod()),
  ]);

  if (employees.error) throw employees.error;
  if (salaries.error) throw salaries.error;

  const damageByName = new Map<string, { amount: number; stageLabel: string | null }>();
  for (const row of z.array(damageSchema).parse(salaries.data)) {
    if (row.damage_deduction <= 0 || !row.profiles) continue;
    damageByName.set(normalise(row.profiles.full_name), {
      amount: row.damage_deduction,
      stageLabel: stageLabelOf(row.damage_stage),
    });
  }

  return z
    .array(productivityEmployeeSchema)
    .parse(employees.data)
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      ...workerOutput(employee.id),
      damage: damageByName.get(normalise(employee.name)) ?? null,
    }));
}

// --- Uptime -----------------------------------------------------------------

export interface MachineUptimeReport {
  id: string;
  label: string;
  running: boolean;
  /** "Running ORD-0798 · Rahim Garments", or "No job assigned". */
  jobLine: string;
  uptimePct: number;
  downtimeHours: number;
  /** Downtime reason for a running machine; what an idle one is waiting on. */
  note: string;
}

const uptimeMachineSchema = z.object({
  id: uuid(),
  label: z.string(),
  status: z.enum(['idle', 'running']),
  current_job: z.object({ code: z.string(), client: z.string() }).nullable(),
});

async function getUptime(factoryId: string): Promise<MachineUptimeReport[]> {
  const { data, error } = await supabase
    .from('machines')
    .select('id, label, status, current_job')
    .eq('factory_id', factoryId)
    .order('label');

  if (error) throw error;

  return z
    .array(uptimeMachineSchema)
    .parse(data)
    .map((machine) => {
      const hours = machineUptime(machine.id);
      // A machine can read `running` with no job blob on it — the status is the
      // floor manager's write and the blob is written alongside it, so trust
      // the blob's presence for the label rather than the status alone.
      const running = machine.status === 'running' && machine.current_job !== null;

      return {
        id: machine.id,
        label: machine.label,
        running,
        jobLine: running
          ? `Running ${machine.current_job?.code} · ${machine.current_job?.client}`
          : 'No job assigned',
        uptimePct: hours.uptimePct,
        downtimeHours: hours.downtimeHours,
        note: running ? hours.reason : 'Awaiting next job assignment',
      };
    });
}

// --- The hub ----------------------------------------------------------------

export interface ReportsData {
  pnl: { current: PnlMonth; closed: PnlMonth[] };
  orders: OrderProfit[];
  audits: LeakageAudit[];
  workers: WorkerProductivity[];
  machines: MachineUptimeReport[];
}

/**
 * Every tab, in one fetch.
 *
 * Five parallel reads on mount rather than one per tab switch: the tabs are a
 * filter over one screen's worth of a single factory's data, and refetching on
 * every tap would make switching tabs slower than scrolling one.
 */
export async function getReports(factoryId: string): Promise<ReportsData> {
  // Read once and handed to both consumers: the P&L tab shows this month's
  // figures and the Per-Order tab apportions two of them, so fetching it twice
  // would double five queries to answer the same question.
  const stats = await getCurrentMonthPnl(factoryId);

  const [pnl, orders, audits, workers, machines] = await Promise.all([
    getPnl(factoryId, stats),
    getOrderProfits(factoryId, stats),
    getLeakage(factoryId),
    getProductivity(factoryId),
    getUptime(factoryId),
  ]);

  return { pnl, orders, audits, workers, machines };
}
