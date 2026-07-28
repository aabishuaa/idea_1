/**
 * Row types for the tables/RPCs the app touches. Hand-maintained for the MVP;
 * swap for `supabase gen types typescript` output as the schema stabilizes.
 */

export type JobStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type JobUrgency = 'low' | 'normal' | 'high' | 'emergency';

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  phone_verified: boolean;
  is_worker: boolean;
  is_customer: boolean;
  is_sme: boolean;
  is_admin: boolean;
  identity_verified: boolean;
  trn: string | null;
  country: string;
  parish: string | null;
}

export interface WorkerProfile {
  user_id: string;
  headline: string;
  bio: string;
  parish: string;
  years_experience: number;
  rate_min_jmd: number | null;
  rate_max_jmd: number | null;
  rate_unit: 'hour' | 'day' | 'job';
  available: boolean;
  availability_note: string | null;
  visible: boolean;
  tier_phone: boolean;
  tier_skill: boolean;
  tier_business: boolean;
  reputation: number;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
}

export interface ServiceDescription {
  id: string;
  user_id: string;
  trade_slug: string;
  title: string;
  description: string;
}

export interface Trade {
  slug: string;
  label: string;
  emoji: string;
  /** Grouping for the search screen, e.g. "Beauty & Wellness". */
  category?: string;
}

/** get_popular_trades(): categories ranked by real booking demand. */
export interface PopularTrade extends Trade {
  category: string;
  job_count: number;
}

export interface Job {
  id: string;
  customer_id: string;
  worker_id: string;
  title: string;
  description: string;
  trade_slug: string | null;
  parish: string | null;
  urgency: JobUrgency;
  budget_min_jmd: number | null;
  budget_max_jmd: number | null;
  agreed_price_jmd: number | null;
  status: JobStatus;
  requested_at: string;
  /** When the worker first answered — powers the response-time stat. */
  responded_at: string | null;
  completed_at: string | null;
}

export interface Review {
  id: string;
  job_id: string;
  worker_id: string;
  reviewer_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface MatchedWorker {
  worker_id: string;
  full_name: string;
  avatar_url: string | null;
  headline: string;
  parish: string;
  trade_slug: string;
  service_title: string;
  rate_min_jmd: number | null;
  rate_max_jmd: number | null;
  rate_unit: string;
  reputation: number;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  identity_verified: boolean;
  tier_skill: boolean;
  tier_business: boolean;
  available: boolean;
  distance_km: number | null;
  similarity: number | null;
  match_score: number;
}

export interface Thread {
  id: string;
  customer_id: string;
  worker_id: string;
  job_id: string | null;
  last_message_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** text · image · job_card (migration 0017). */
  kind?: 'text' | 'image' | 'job_card';
  attachment_path?: string | null;
  attachment_mime?: string | null;
  /** Set when this message is a shared job card. */
  job_id?: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type:
    | 'job_request'
    | 'job_status'
    | 'new_message'
    | 'new_review'
    | 'formalization_suggestion'
    | 'verification_result'
    | 'system';
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type VerificationStatus =
  | 'unstarted'
  | 'consented'
  | 'id_captured'
  | 'liveness_passed'
  | 'verified'
  | 'failed';

export interface VerificationRecord {
  user_id: string;
  status: VerificationStatus;
  consent_given_at: string | null;
  id_captured_at: string | null;
  liveness_passed: boolean;
  liveness_at: string | null;
  face_match_score: number | null;
  face_match_passed: boolean | null;
}

export interface ChecklistStep {
  id: number;
  step_order: number;
  title: string;
  description: string;
  agency: string;
  documents: string[];
  est_cost_jmd: number | null;
  est_days: number | null;
  done: boolean;
  done_at: string | null;
  /** Journey stage: identity → register → operate → grow (migration 0015). */
  stage?: 'identity' | 'register' | 'operate' | 'grow';
  /** Plain-language payoff for completing this step. */
  benefit?: string;
  /** False for steps that are worth doing but not legally required. */
  required?: boolean;
  official_url?: string;
}

export interface QuestionnaireItem {
  id: number;
  sort_order: number;
  question: string;
  help_text: string;
  options: { label: string; points: number }[];
}

export interface FormalizationProgress {
  user_id: string;
  status: 'not_started' | 'suggested' | 'active' | 'completed';
  readiness_score: number | null;
  answers: Record<string, string>;
  activation_mode: 'auto_suggested' | 'manual' | null;
}

export interface Partner {
  id: number;
  name: string;
  category: 'banking' | 'credit_union' | 'training' | 'government' | 'insurance';
  description: string;
  url: string | null;
  parish: string | null;
}

export interface DemandInsight {
  trade_slug: string;
  trade_label: string;
  job_count: number;
  avg_budget_jmd: number | null;
}

/**
 * get_incoming_requests() — job requests a worker has not answered yet, with
 * the customer's identity attached so the decision can be made from the card.
 */
export interface IncomingRequest {
  id: string;
  title: string;
  description: string;
  trade_slug: string | null;
  parish: string | null;
  urgency: JobUrgency;
  budget_min_jmd: number | null;
  budget_max_jmd: number | null;
  requested_at: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string | null;
  customer_verified: boolean;
}
