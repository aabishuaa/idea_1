import { supabase } from './supabase';

export interface WorkerContact {
  user_id: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  show_publicly: boolean;
}

/**
 * Read a worker's contact details.
 *
 * Returns null when the caller is not allowed to see them — the row-level
 * policy (migration 0023) decides that, not this function. A stranger gets
 * nothing unless the worker published it; a customer who has an accepted
 * booking gets it either way, because you need to be able to phone the
 * plumber you hired.
 *
 * Deliberately a plain select rather than an RPC: the policy IS the rule, and
 * routing it through a function would only give us somewhere to get it wrong.
 */
export async function getContact(workerId: string): Promise<WorkerContact | null> {
  const { data } = await supabase
    .from('worker_contacts')
    .select('user_id, phone, email, website, show_publicly')
    .eq('user_id', workerId)
    .maybeSingle<WorkerContact>();
  return data ?? null;
}

export async function saveMyContact(input: {
  phone: string;
  email: string;
  website: string;
  show: boolean;
}): Promise<string | null> {
  const { error } = await supabase.rpc('save_my_contact', {
    p_phone: input.phone,
    p_email: input.email,
    p_website: input.website,
    p_show: input.show,
  });
  return error ? error.message : null;
}

/** Anything worth rendering? A row of all-nulls is not worth a heading. */
export function hasAnyContact(contact: WorkerContact | null): boolean {
  return Boolean(contact && (contact.phone || contact.email || contact.website));
}

/** tel: needs the punctuation stripped; humans need it kept. */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^0-9+]/g, '')}`;

export function websiteHref(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}
