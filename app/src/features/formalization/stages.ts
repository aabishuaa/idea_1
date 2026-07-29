import type { Ionicons } from '@expo/vector-icons';

import type { ChecklistStep } from '@/types/db';

export type StageKey = 'identity' | 'register' | 'operate' | 'grow';

export interface Stage {
  key: StageKey;
  /** Short label for the rail. */
  label: string;
  /** What this stage actually is, in one line. */
  blurb: string;
  /** What having finished it means — the reason to bother. */
  unlocks: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * The four stages of going from hustle to business.
 *
 * Deliberately config, not RAG (CLAUDE.md §4.3): the pathway has to be
 * identical for two workers in the same trade and parish, every time. BizBot
 * answers the open questions asked ALONG the way; it never decides what the
 * way is.
 *
 * The `unlocks` copy is the whole argument of this feature. Nobody registers a
 * business because an app told them to — they do it because it opens a door
 * that was shut, so each stage says which door.
 */
export const STAGES: Stage[] = [
  {
    key: 'identity',
    label: 'Get identified',
    blurb: 'A TRN, and somewhere separate for work money to live.',
    unlocks: 'Proof of who you are, and income you can point at.',
    icon: 'finger-print',
  },
  {
    key: 'register',
    label: 'Register the name',
    blurb: 'Your business name, filed at the Companies Office.',
    unlocks: 'You can bid for company and government work, and open a business account.',
    icon: 'document-text',
  },
  {
    key: 'operate',
    label: 'Operate properly',
    blurb: 'NIS cover, and records that hold up to inspection.',
    unlocks: 'A pension and injury cover nobody else provides, and a record lenders accept.',
    icon: 'shield-checkmark',
  },
  {
    key: 'grow',
    label: 'Grow',
    blurb: 'Tax compliance, and certification for your trade.',
    unlocks: 'Government contracts, and work unqualified competitors legally cannot sign off.',
    icon: 'trending-up',
  },
];

export interface StageProgress extends Stage {
  steps: ChecklistStep[];
  done: number;
  /** Required steps only — optional ones must never block a stage. */
  required: number;
  complete: boolean;
}

export interface JourneyState {
  stages: StageProgress[];
  /** The stage the worker is currently in, or null when everything is done. */
  currentStage: StageProgress | null;
  /** The single next thing to do. */
  nextStep: ChecklistStep | null;
  totalDone: number;
  totalRequired: number;
  /** Money and working days still to spend, from the config's estimates. */
  remainingCostJmd: number;
  remainingDays: number;
}

/**
 * Turns a flat checklist into a journey.
 *
 * Pure and deterministic — same input, same output — so this is unit-testable
 * and cannot drift between screens the way two hand-rolled reduces would.
 */
export function buildJourney(steps: ChecklistStep[]): JourneyState {
  const stages: StageProgress[] = STAGES.map((stage) => {
    const items = steps
      .filter((step) => (step.stage ?? 'identity') === stage.key)
      .sort((a, b) => a.step_order - b.step_order);
    const required = items.filter((step) => step.required !== false);
    const doneRequired = required.filter((step) => step.done).length;
    return {
      ...stage,
      steps: items,
      done: items.filter((step) => step.done).length,
      required: required.length,
      // A stage with no required steps is not "complete" out of nowhere; it is
      // complete only once it has steps and they are all done.
      complete: required.length > 0 && doneRequired === required.length,
    };
  }).filter((stage) => stage.steps.length > 0);

  const currentStage = stages.find((stage) => !stage.complete) ?? null;

  const nextStep =
    currentStage?.steps.find((step) => !step.done && step.required !== false) ??
    currentStage?.steps.find((step) => !step.done) ??
    null;

  const required = steps.filter((step) => step.required !== false);
  const outstanding = steps.filter((step) => !step.done);

  return {
    stages,
    currentStage,
    nextStep,
    totalDone: required.filter((step) => step.done).length,
    totalRequired: required.length,
    remainingCostJmd: outstanding.reduce((sum, step) => sum + Number(step.est_cost_jmd ?? 0), 0),
    remainingDays: outstanding.reduce((sum, step) => sum + (step.est_days ?? 0), 0),
  };
}
