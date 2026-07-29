import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { JobPhotos } from '@/components/JobPhotos';
import { PersonLink } from '@/components/PersonLink';
import { JobTracker } from '@/components/JobTracker';
import { StatusPill } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { formatDateTime, formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { openThread } from '@/lib/threads';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';
import type { Job, JobPhoto, JobStatus, Review } from '@/types/db';

interface JobDetail extends Job {
  customer: { full_name: string } | null;
  worker: { full_name: string } | null;
}

/** Booking detail: status, lifecycle actions, review on completion (design 07). */
export default function JobDetailScreen() {
  const { id, confirmed } = useLocalSearchParams<{ id: string; confirmed?: string }>();
  const { session } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  // Distinguish "still loading" from "loaded, nothing found" — without this
  // the screen spun forever whenever the row could not be read.
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [celebration, setCelebration] = useState<
    null | 'booked' | 'reviewed' | 'completed' | 'accepted' | 'declined' | 'cancelled'
  >(confirmed === '1' ? 'booked' : null);
  // Remembered so a status arriving over Realtime can be recognised as a
  // TRANSITION (requested → accepted) rather than just a value.
  const previousStatus = useRef<JobStatus | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setPhase('missing');
      return;
    }
    /*
      No PostgREST embeds here, deliberately. This used to select
        worker:profiles!jobs_worker_id_fkey(full_name)
      but jobs.worker_id references worker_profiles, NOT profiles — so that
      constraint hint names no relationship to `profiles` and PostgREST
      rejected the ENTIRE request. data came back null, which the screen could
      only read as "this booking does not exist": hence "Booking not found" on
      a booking that was right there in the table.

      Two plain queries instead. Names are a nice-to-have; the booking must
      render without them.
    */
    const [jobRes, reviewRes, photosRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('reviews').select('*').eq('job_id', id).maybeSingle(),
      supabase.from('job_photos').select('*').eq('job_id', id).order('created_at'),
    ]);
    setPhotos((photosRes.data as JobPhoto[] | null) ?? []);
    const base = (jobRes.data as Job | null) ?? null;

    let row: JobDetail | null = null;
    if (base) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [base.customer_id, base.worker_id]);
      const byId = new Map(
        ((people as { id: string; full_name: string }[] | null) ?? []).map((person) => [
          person.id,
          person,
        ]),
      );
      row = {
        ...base,
        customer: byId.get(base.customer_id) ?? null,
        worker: byId.get(base.worker_id) ?? null,
      };
    }

    // The customer is watching this screen when the pro answers: turn that
    // into the same celebration the pro just saw, not a silent pill change.
    if (
      row &&
      previousStatus.current === 'requested' &&
      row.status === 'accepted' &&
      session?.user.id === row.customer_id
    ) {
      setCelebration('accepted');
    }
    previousStatus.current = row?.status ?? null;

    setJob(row);
    setReview((reviewRes.data as Review | null) ?? null);
    setPhase(row ? 'ready' : 'missing');
  }, [id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates on this booking (migration 0019 publishes `jobs`).
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`job-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  if (phase === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading booking…" />
      </Screen>
    );
  }

  if (phase === 'missing' || !job) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="Booking not found"
          message="This booking may have been removed, or it belongs to another account."
          actionTitle="Back to bookings"
          onAction={() => router.replace('/(tabs)/bookings')}
        />
      </Screen>
    );
  }

  const isWorker = session?.user.id === job.worker_id;
  const isCustomer = session?.user.id === job.customer_id;

  const transition = async (status: JobStatus) => {
    setBusy(true);
    const { error } = await supabase.from('jobs').update({ status }).eq('id', job.id);
    setBusy(false);
    if (error) return;
    if (status === 'completed') setCelebration('completed');
    if (status === 'accepted') setCelebration('accepted');
    if (status === 'declined') setCelebration('declined');
    if (status === 'cancelled') setCelebration('cancelled');
    void load();
  };

  const submitReview = async () => {
    if (!session || rating === 0) return;
    setBusy(true);
    const { error } = await supabase.from('reviews').insert({
      job_id: job.id,
      worker_id: job.worker_id,
      reviewer_id: session.user.id,
      rating,
      comment: comment.trim(),
    });
    setBusy(false);
    if (error) return;
    setCelebration('reviewed');
    void load();
  };

  const celebrationCopy = {
    booked: {
      title: 'Request sent!',
      message: `${job.worker?.full_name ?? 'The pro'} will confirm shortly. We'll notify you as soon as they respond.`,
      icon: 'checkmark' as const,
    },
    completed: {
      title: 'Job completed',
      message: 'Nice work. This job now counts towards your reputation record.',
      icon: 'trophy' as const,
    },
    reviewed: {
      title: 'Thanks for the review',
      message: 'Your rating helps the next customer choose with confidence.',
      icon: 'star' as const,
    },
    declined: {
      title: 'Request declined',
      message: 'The customer has been told, so they can find someone else.',
      icon: 'close' as const,
    },
    cancelled: {
      title: 'Booking cancelled',
      message: 'Everyone has been notified. Nothing further is owed on this job.',
      icon: 'close' as const,
    },
    accepted: isWorker
      ? {
          title: 'Job accepted!',
          message: `${job.customer?.full_name ?? 'The customer'} has been told you're on it. This job is now tracked here.`,
          icon: 'briefcase' as const,
        }
      : {
          title: 'You\u2019re booked!',
          message: `${job.worker?.full_name ?? 'Your pro'} accepted the job. You can message them any time from here.`,
          icon: 'briefcase' as const,
        },
  };

  return (
    <Screen>
      {celebration && (
        <SuccessOverlay
          visible
          // Red for the endings, blue for the beginnings.
          tone={
            celebration === 'declined' || celebration === 'cancelled' ? 'danger' : 'success'
          }
          icon={celebrationCopy[celebration].icon}
          title={celebrationCopy[celebration].title}
          message={celebrationCopy[celebration].message}
          actionTitle="View booking"
          onAction={() => setCelebration(null)}
          secondaryTitle={celebration === 'booked' ? 'Back to home' : undefined}
          onSecondary={
            celebration === 'booked' ? () => router.replace('/(tabs)') : undefined
          }
        />
      )}
      <View style={{ gap: space.s5 }}>
        <JobTracker job={job} />

        <Card>
          <View style={{ gap: space.s3 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h3" style={{ flex: 1 }}>
                {job.title}
              </AppText>
              <StatusPill status={job.status} />
            </View>
            {job.description ? (
              <AppText variant="bodySm" color="textMuted">
                {job.description}
              </AppText>
            ) : null}
            <JobPhotos photos={photos} />
            {/* Whoever is on the other side, openable — a name you cannot
                tap is a dead end at the moment you want to check somebody. */}
            <PersonLink
              id={isCustomer ? job.worker_id : job.customer_id}
              name={
                (isCustomer ? job.worker?.full_name : job.customer?.full_name) ?? 'This person'
              }
              subtitle={isCustomer ? 'The pro on this job' : 'Booked this job'}
            />

            <View style={{ gap: space.s2 }}>
              <Row label="Requested" value={formatDateTime(job.requested_at)} />
              {job.parish && <Row label="Where" value={job.parish} />}
              <Row label="Urgency" value={job.urgency} />
              {(job.budget_min_jmd ?? job.budget_max_jmd) != null && (
                <Row label="Budget" value={formatJmd(job.budget_max_jmd ?? job.budget_min_jmd)} />
              )}
              {job.agreed_price_jmd != null && (
                <Row label="Agreed price" value={formatJmd(job.agreed_price_jmd)} />
              )}
            </View>
          </View>
        </Card>

        {/* Lifecycle actions (FR-JOB-1/2; transitions enforced in SQL) */}
        <View style={{ gap: space.s3 }}>
          {isWorker && job.status === 'requested' && (
            <>
              <Button title="Accept job" fullWidth loading={busy} onPress={() => transition('accepted')} />
              <Button title="Decline" variant="secondary" fullWidth onPress={() => transition('declined')} />
            </>
          )}
          {isWorker && job.status === 'accepted' && (
            <Button title="Start job" fullWidth loading={busy} onPress={() => transition('in_progress')} />
          )}
          {isWorker && job.status === 'in_progress' && (
            <Button title="Mark completed" fullWidth loading={busy} onPress={() => transition('completed')} />
          )}
          {(isWorker || isCustomer) &&
            ['requested', 'accepted', 'in_progress'].includes(job.status) && (
              <Button title="Cancel" variant="text" onPress={() => transition('cancelled')} />
            )}
          <Button
            title="Open chat"
            variant="secondary"
            fullWidth
            onPress={async () => {
              const threadId = await openThread({
                customerId: job.customer_id,
                workerId: job.worker_id,
                jobId: job.id,
              });
              if (threadId) router.push(`/thread/${threadId}`);
            }}
          />
        </View>

        {/* Review (FR-JOB-3) */}
        {isCustomer && job.status === 'completed' && !review && (
          <Card>
            <View style={{ gap: space.s4 }}>
              <AppText variant="h3">How did it go?</AppText>
              <Rating value={rating} onChange={setRating} />
              <Input
                placeholder="Share a few words about the work…"
                value={comment}
                onChangeText={setComment}
                multiline
              />
              <Button
                title="Submit review"
                fullWidth
                disabled={rating === 0}
                loading={busy}
                onPress={submitReview}
              />
            </View>
          </Card>
        )}
        {review && (
          <Card>
            <View style={{ gap: space.s2 }}>
              <AppText variant="label">Review</AppText>
              <Rating value={review.rating} />
              {review.comment ? (
                <AppText variant="bodySm" color="textMuted">
                  {review.comment}
                </AppText>
              ) : null}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="bodySm" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodySm">{value}</AppText>
    </View>
  );
}
