import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { AppText } from './ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Job } from '@/types/db';

const money = (n: number) => `JMD ${Number(n).toLocaleString('en-JM')}`;
const digits = (t: string) => t.replace(/[^0-9]/g, '');

export interface CompletionState {
  /** Has this viewer signed off the work? */
  mineDone: boolean;
  /** Has the other party? */
  theirsDone: boolean;
  myAmount: number | null;
  theirAmount: number | null;
  agreed: boolean;
  mismatched: boolean;
}

/** Work out where a job stands from the viewer's side. */
export function completionState(job: Job, isCustomer: boolean): CompletionState {
  const mineDone = Boolean(isCustomer ? job.customer_completed_at : job.worker_completed_at);
  const theirsDone = Boolean(isCustomer ? job.worker_completed_at : job.customer_completed_at);
  const myAmount = isCustomer ? job.customer_amount_jmd : job.worker_amount_jmd;
  const theirAmount = isCustomer ? job.worker_amount_jmd : job.customer_amount_jmd;
  return {
    mineDone,
    theirsDone,
    myAmount,
    theirAmount,
    agreed: Boolean(job.payment_agreed_at),
    mismatched:
      myAmount != null && theirAmount != null && Number(myAmount) !== Number(theirAmount),
  };
}

/**
 * Both signatures on a job: the work, and what was paid for it.
 *
 * A job used to be finished the moment one person said so, which meant a worker
 * could complete their own bookings all afternoon and every one would count
 * toward the reputation score a lender is being asked to trust. Self-attestation
 * is exactly the thing a lender discounts, so it has to be corroborated.
 *
 * The same argument applies to the money — and money is the more valuable half,
 * because a documented, agreed record of what an informal worker actually earned
 * is the alternative credit data they have never been able to produce. myB moves
 * no money (payments are out of scope). It records what both people say changed
 * hands, and only counts it when they say the same thing.
 *
 * The two are deliberately independent. People finish a job on Tuesday and
 * settle up on Friday, and an argument about the invoice must not un-finish the
 * work.
 */
export function CompletionPanel({
  job,
  isCustomer,
  busy,
  onConfirm,
}: {
  job: Job;
  isCustomer: boolean;
  busy: boolean;
  onConfirm: (amount: number | null) => void;
}) {
  const { colors } = useTheme();
  const state = completionState(job, isCustomer);
  const [amount, setAmount] = useState(
    state.myAmount != null ? String(Math.round(Number(state.myAmount))) : '',
  );
  const [editing, setEditing] = useState(false);

  const otherLabel = isCustomer ? 'the pro' : 'the customer';
  const parsed = amount.trim() === '' ? null : Number(digits(amount));

  /* ── Everything settled ────────────────────────────────────────────────── */
  if (state.mineDone && state.theirsDone && state.agreed && !editing) {
    return (
      <Card>
        <View style={{ gap: space.s2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            <AppText variant="label" style={{ flex: 1 }}>
              Confirmed by both of you
            </AppText>
          </View>
          <AppText variant="h2" color="success">
            {money(Number(job.agreed_price_jmd))}
          </AppText>
          <AppText variant="caption" color="textMuted">
            You both recorded the same amount, so this counts as confirmed income on
            {isCustomer ? ' their' : ' your'} reputation record. This is the kind of
            entry a bank can actually read.
          </AppText>
          <Button
            title="Correct the amount"
            variant="text"
            onPress={() => setEditing(true)}
          />
        </View>
      </Card>
    );
  }

  /* ── Both signed the work, but the money disagrees ─────────────────────── */
  if (state.mineDone && state.theirsDone && state.mismatched && !editing) {
    return (
      <Card>
        <View style={{ gap: space.s3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <AppText variant="label" style={{ flex: 1 }}>
              The amounts don’t match
            </AppText>
          </View>
          <View style={{ gap: space.s1 }}>
            <AmountRow label="You said" value={Number(state.myAmount)} tone={colors.text} />
            <AmountRow
              label={`${otherLabel === 'the pro' ? 'The pro' : 'The customer'} said`}
              value={Number(state.theirAmount)}
              tone={colors.textMuted}
            />
          </View>
          <AppText variant="caption" color="textMuted">
            The work is recorded as done. The payment stays unconfirmed until you both
            enter the same figure — an unagreed amount is never counted as income.
          </AppText>
          <Button title="Change my amount" variant="secondary" onPress={() => setEditing(true)} />
        </View>
      </Card>
    );
  }

  /* ── Waiting on the other side ─────────────────────────────────────────── */
  if (state.mineDone && !state.theirsDone && !editing) {
    return (
      <Card>
        <View style={{ gap: space.s2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
            <AppText variant="label" style={{ flex: 1 }}>
              Waiting on {otherLabel}
            </AppText>
          </View>
          <AppText variant="caption" color="textMuted">
            You’ve confirmed this job is done
            {state.myAmount != null ? ` at ${money(Number(state.myAmount))}` : ''}. It counts
            once {otherLabel} confirms too — we’ve let them know.
          </AppText>
          <Button title="Change my answer" variant="text" onPress={() => setEditing(true)} />
        </View>
      </Card>
    );
  }

  /* ── This viewer needs to sign ─────────────────────────────────────────── */
  return (
    <Card>
      <View style={{ gap: space.s4 }}>
        <View style={{ gap: space.s1 }}>
          <AppText variant="h3">
            {state.theirsDone ? `${cap(otherLabel)} says it’s done` : 'Is this job finished?'}
          </AppText>
          <AppText variant="bodySm" color="textMuted">
            {state.theirsDone
              ? 'Confirm to finish the job. Both of you have to agree before it counts.'
              : `Confirming tells ${otherLabel} the work is complete. It only counts once you both do.`}
          </AppText>
        </View>

        <View style={{ gap: space.s2 }}>
          <AppText variant="label" color="textMuted">
            What was actually paid? (optional)
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s2,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              paddingHorizontal: space.s3,
              height: 50,
            }}
          >
            <AppText variant="body" color="textMuted">
              JMD
            </AppText>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(digits(t))}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              accessibilityLabel="Amount paid in Jamaican dollars"
              style={{
                flex: 1,
                color: colors.text,
                fontFamily: 'PlusJakartaSans_600SemiBold',
                fontSize: 18,
              }}
            />
          </View>
          <AppText variant="caption" color="textMuted">
            {state.theirAmount != null
              ? `${cap(otherLabel)} recorded ${money(Number(state.theirAmount))}. Enter the same figure and it becomes confirmed income.`
              : 'myB never handles the money — it just records what you both say was paid, so you have proof of your earnings later. Leave it blank if you haven’t settled up yet.'}
          </AppText>
        </View>

        <Button
          title={state.theirsDone ? 'Confirm and finish job' : 'Mark as done'}
          icon="checkmark-circle"
          fullWidth
          loading={busy}
          onPress={() => {
            setEditing(false);
            onConfirm(parsed);
          }}
        />
        {editing && (
          <Button title="Cancel" variant="text" onPress={() => setEditing(false)} />
        )}
      </View>
    </Card>
  );
}

function AmountRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="bodySm" color="textMuted">
        {label}
      </AppText>
      <AppText variant="label" style={{ color: tone }}>
        {money(value)}
      </AppText>
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
