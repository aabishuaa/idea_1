/**
 * Where a worker is based.
 *
 * This list lived in three screens as three copies (search, account,
 * worker-setup), which is how "Virtual" would have ended up in two of them.
 * One list, one source of truth.
 */

/** Jamaica's parishes, in rough order of how much work is booked in each. */
export const PARISHES = [
  'Kingston',
  'St. Andrew',
  'St. Catherine',
  'St. James',
  'Manchester',
  'Clarendon',
  'St. Ann',
  'Portland',
  'St. Thomas',
  'St. Mary',
  'Trelawny',
  'Hanover',
  'Westmoreland',
  'St. Elizabeth',
] as const;

/**
 * Not a parish — a way of saying "location is not the constraint".
 *
 * Two very different workers pick this: the tutor or designer whose work
 * happens over a phone, and the tradesperson who will drive to another parish
 * for the right job. Both were previously forced to name one parish and were
 * then invisible to every search outside it.
 *
 * Stored in the same `parish` column as a real parish, because it answers the
 * same question the customer is asking. `match_workers` treats it as matching
 * every parish rather than none (migration 0023).
 */
export const VIRTUAL = 'Virtual';

/** Everything a worker can choose as their base, Virtual first. */
export const LOCATIONS: string[] = [VIRTUAL, ...PARISHES];

/** Everything a customer can filter by. Same list — the filter must be able to find them. */
export const LOCATION_FILTERS: string[] = LOCATIONS;

export const isVirtual = (location: string | null | undefined): boolean =>
  location === VIRTUAL;

/** How a location reads on a profile or a card. */
export function locationLabel(location: string | null | undefined): string {
  if (!location) return 'Jamaica';
  return isVirtual(location) ? 'Virtual · works anywhere' : location;
}
