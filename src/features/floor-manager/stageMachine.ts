import { STAGE_DEFS, type StageKey } from '../../data/stageDefs';
import type { SheetStage } from '../../data/types';
import type { SheetPhaseTone } from '../../components';

/**
 * The per-sheet production state machine.
 *
 * ```
 * producing --[Inspection]--> readyForStage (index 0)     (or readyForFinal if the queue is empty)
 *                                    |
 *                          [stage button -> Stage Form]
 *                                    v
 *                             stageFormDone
 *                                    |
 *                             [Inspection]
 *                                    v
 *              index + 1 < queue.length? --yes--> readyForStage (index + 1)
 *                          |no
 *                          v
 *                    readyForFinal --[Final Inspection]--> ready
 * ```
 *
 * The queue is evaluated once per *order* (from `orders.stages`), not per
 * sheet — every sheet on an order runs the same finishing stages.
 *
 * Kept as a pure function of (stage, index, queue) so the three cases the spec
 * calls out — no stages, one stage, all three — are the same code path.
 */

export interface SheetPhase {
  label: string;
  tone: SheetPhaseTone;
  /** Omitted when the sheet is finished and has no action left. */
  actionLabel?: string;
  /** The stage whose form opens, when the action is a stage form. */
  opensStageForm?: StageKey;
}

export function describeSheetPhase(
  stage: SheetStage | null,
  stageIndex: number,
  queue: StageKey[],
): SheetPhase {
  switch (stage) {
    case 'producing':
      return { label: 'In Production', tone: 'neutral', actionLabel: 'Inspection' };

    case 'readyForStage': {
      const key = queue[stageIndex];
      if (!key) {
        // Defensive: an order whose stages changed under a running sheet.
        return { label: 'Ready for Final', tone: 'progress', actionLabel: 'Final Inspection' };
      }
      return {
        label: `Ready for ${STAGE_DEFS[key].label}`,
        tone: 'progress',
        actionLabel: STAGE_DEFS[key].label,
        opensStageForm: key,
      };
    }

    case 'stageFormDone': {
      const key = queue[stageIndex];
      return {
        label: key ? `${STAGE_DEFS[key].label} done` : 'Stage done',
        tone: 'progress',
        actionLabel: 'Inspection',
      };
    }

    case 'readyForFinal':
      return { label: 'Ready for Final', tone: 'progress', actionLabel: 'Final Inspection' };

    case 'ready':
      return { label: 'Ready', tone: 'done' };

    default:
      return { label: 'Not started', tone: 'neutral' };
  }
}

export interface SheetTransition {
  stage: SheetStage;
  stage_index: number;
}

/**
 * What the sheet's action button does. Returns null when there is no action —
 * `readyForStage` opens the Stage Form instead of transitioning directly, and
 * `ready` is terminal.
 */
export function advanceSheet(
  stage: SheetStage | null,
  stageIndex: number,
  queue: StageKey[],
): SheetTransition | null {
  switch (stage) {
    case 'producing':
      // Embroidery passed. Straight to final if this order runs no finishing
      // stages at all.
      return queue.length === 0
        ? { stage: 'readyForFinal', stage_index: 0 }
        : { stage: 'readyForStage', stage_index: 0 };

    case 'stageFormDone':
      return stageIndex + 1 < queue.length
        ? { stage: 'readyForStage', stage_index: stageIndex + 1 }
        : { stage: 'readyForFinal', stage_index: stageIndex };

    case 'readyForFinal':
      return { stage: 'ready', stage_index: stageIndex };

    // `readyForStage` goes through the Stage Form, `ready` is the end.
    default:
      return null;
  }
}
