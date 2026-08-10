#!/usr/bin/env node
/**
 * seed-images.mjs — give the demo marketplace a face.
 *
 * `seed.sql` builds 233 accounts with real job history, but every one of them
 * renders as a coloured circle with two initials and an empty portfolio. That
 * is the single biggest gap between "the data is all there" and "this looks
 * like a product", and it is not something SQL can fix on its own: the images
 * have to be fetched from somewhere.
 *
 * So this runs from YOUR machine (it needs the open internet and your service
 * role key), searches a stock-photo provider for imagery that matches what
 * each pro actually does, and writes it back:
 *
 *   · profiles.avatar_url   — a portrait for every demo account
 *   · portfolio_items       — trade-relevant work photos per worker
 *
 * Only accounts under the demo UUID prefix are touched, so it can never
 * scribble on a real user. Re-running replaces what it wrote last time.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────
 *   export SUPABASE_URL="https://<ref>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
 *   export PEXELS_API_KEY="<free key>"        # optional but recommended
 *   node supabase/scripts/seed-images.mjs
 *
 * Providers, in quality order. The first one with a key configured wins:
 *   pexels     — free key, 2-minute signup at pexels.com/api. Best results.
 *   unsplash   — free key at unsplash.com/developers. 50 req/hr on demo tier.
 *   openverse  — NO KEY NEEDED. CC-licensed, more variable quality. Default.
 *
 * ── FLAGS ──────────────────────────────────────────────────────────────────
 *   --mode=upload|link   upload: copy into Supabase Storage (default, fast at
 *                        demo time, ~100 MB of your 1 GB free tier).
 *                        link:   store the remote URL, use no storage at all.
 *   --per-trade=10       distinct work photos fetched per trade
 *   --per-worker=6       photos shown on each worker's profile
 *   --avatars=120        distinct portraits fetched, cycled across accounts
 *   --only=plumbing,...  restrict to certain trades (for a quick retry)
 *   --skip-avatars       portfolios only
 *   --dry-run            search and report, write nothing
 */

import { writeFile } from 'node:fs/promises';

import { AVATAR_QUERIES, GENERIC_IMAGERY, TRADE_IMAGERY } from './trade-imagery.mjs';

// Every account seed.sql creates lives under this prefix. It is the safety
// rail for the whole script: nothing outside it is ever read or written.
const DEMO_PREFIX = '00000000-0000-4000-';
const BUCKET = 'portfolios';
const CREDITS_FILE = new URL('./seed-images-credits.json', import.meta.url);

// ── Arguments ────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const MODE = args.mode === 'link' ? 'link' : 'upload';
const PER_TRADE = Number(args['per-trade'] ?? 10);
const PER_WORKER = Number(args['per-worker'] ?? 6);
const AVATAR_COUNT = Number(args.avatars ?? 120);
const ONLY = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const SKIP_AVATARS = Boolean(args['skip-avatars']);
const DRY_RUN = Boolean(args['dry-run']);

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing credentials.\n' +
      '  export SUPABASE_URL="https://<ref>.supabase.co"\n' +
      '  export SUPABASE_SERVICE_ROLE_KEY="<service role key>"\n\n' +
      'Both are in your Supabase dashboard under Project Settings → API.\n' +
      'The service role key bypasses RLS — keep it out of the app bundle and out of git.',
  );
  process.exit(1);
}

// ── Small helpers ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `worker` over `items` with a fixed number of workers in flight. */
async function pooled(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * fetch with retries. Stock APIs rate-limit aggressively on free tiers and a
 * single 429 halfway through 47 trades should not lose the whole run.
 */
async function retrying(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status >= 500) {
        const wait = 1500 * 2 ** attempt;
        console.warn(`    ${response.status} from ${new URL(url).host} — retrying in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error(`Gave up on ${url}`);
}

// ── Supabase REST ────────────────────────────────────────────────────────────
// Plain REST rather than @supabase/supabase-js so the script has zero installs
// of its own — `node supabase/scripts/seed-images.mjs` works in a fresh clone.

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, options = {}) {
  const response = await retrying(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...restHeaders, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${options.method ?? 'GET'} /${path} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function uploadToStorage(path, bytes, contentType) {
  const response = await retrying(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    },
  );
  if (!response.ok) {
    throw new Error(`Storage upload ${path} → ${response.status}: ${await response.text()}`);
  }
  return path;
}

const storagePublicUrl = (path) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

// ── Stock photo providers ────────────────────────────────────────────────────

const PEXELS_KEY = process.env.PEXELS_API_KEY ?? '';
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY ?? '';

const providers = {
  async pexels(query, count, orientation) {
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
      `&per_page=${count}&orientation=${orientation}`;
    const response = await retrying(url, { headers: { Authorization: PEXELS_KEY } });
    if (!response.ok) throw new Error(`Pexels ${response.status}: ${await response.text()}`);
    const body = await response.json();
    return (body.photos ?? []).map((photo) => ({
      url: photo.src?.large ?? photo.src?.medium,
      credit: photo.photographer,
      creditUrl: photo.photographer_url,
      source: photo.url,
      license: 'Pexels License',
    }));
  },

  async unsplash(query, count, orientation) {
    const url =
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
      `&per_page=${count}&orientation=${orientation}&content_filter=high`;
    const response = await retrying(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    });
    if (!response.ok) throw new Error(`Unsplash ${response.status}: ${await response.text()}`);
    const body = await response.json();
    return (body.results ?? []).map((photo) => ({
      url: photo.urls?.regular ?? photo.urls?.small,
      credit: photo.user?.name,
      creditUrl: photo.user?.links?.html,
      source: photo.links?.html,
      license: 'Unsplash License',
    }));
  },

  async openverse(query, count) {
    const url =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      `&page_size=${count}&license_type=commercial&mature=false`;
    const response = await retrying(url, { headers: { 'User-Agent': 'myB-demo-seed/1.0' } });
    if (!response.ok) throw new Error(`Openverse ${response.status}: ${await response.text()}`);
    const body = await response.json();
    return (body.results ?? []).map((image) => ({
      url: image.url,
      credit: image.creator,
      creditUrl: image.creator_url,
      source: image.foreign_landing_url,
      license: image.license ? `${image.license.toUpperCase()} ${image.license_version ?? ''}`.trim() : 'CC',
    }));
  },
};

const providerName =
  (typeof args.provider === 'string' && args.provider) ||
  (PEXELS_KEY ? 'pexels' : UNSPLASH_KEY ? 'unsplash' : 'openverse');

if (!providers[providerName]) {
  console.error(`Unknown provider "${providerName}". Use pexels, unsplash or openverse.`);
  process.exit(1);
}
if (providerName === 'pexels' && !PEXELS_KEY) {
  console.error('provider=pexels needs PEXELS_API_KEY.');
  process.exit(1);
}
if (providerName === 'unsplash' && !UNSPLASH_KEY) {
  console.error('provider=unsplash needs UNSPLASH_ACCESS_KEY.');
  process.exit(1);
}

const credits = [];

/**
 * Collects `count` distinct images by cycling the supplied queries.
 *
 * Distinct matters more than it sounds: a provider given one query returns the
 * same top results every time, so five plumbers would each show the identical
 * six photos and the marketplace would look generated. Rotating queries and
 * de-duplicating by URL is what makes the grid look like different people.
 */
async function collectImages(queries, count, orientation) {
  const seen = new Set();
  const found = [];
  const perQuery = Math.max(3, Math.ceil((count / queries.length) * 2));

  for (const query of queries) {
    if (found.length >= count) break;
    try {
      const batch = await providers[providerName](query, perQuery, orientation);
      for (const image of batch) {
        if (!image.url || seen.has(image.url)) continue;
        seen.add(image.url);
        found.push(image);
        if (found.length >= count) break;
      }
    } catch (error) {
      console.warn(`    search "${query}" failed: ${error.message}`);
    }
    // Gentle on free-tier rate limits.
    await sleep(providerName === 'openverse' ? 400 : 150);
  }
  return found;
}

/** Downloads one image and, in upload mode, copies it into Storage. */
async function materialise(image, path) {
  if (MODE === 'link') return image.url;

  const response = await retrying(image.url);
  if (!response.ok) throw new Error(`download ${response.status}`);

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType})`);

  const bytes = Buffer.from(await response.arrayBuffer());
  // Guards against a provider handing back a 1x1 tracking pixel or an error
  // page with an image content-type.
  if (bytes.byteLength < 5000) throw new Error(`suspiciously small (${bytes.byteLength}B)`);

  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  // A dry run still downloads — that is what proves the searches return real,
  // usable images — but it must not leave anything behind in Storage.
  if (!DRY_RUN) await uploadToStorage(`${path}.${extension}`, bytes, contentType);
  return `${path}.${extension}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`myB demo imagery`);
  console.log(`  provider : ${providerName}${providerName === 'openverse' ? ' (no key set — set PEXELS_API_KEY for better results)' : ''}`);
  console.log(`  mode     : ${MODE}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log('');

  // 1. Who are we seeding?
  const profiles = (
    await rest('profiles?select=id,full_name,is_worker&order=id&limit=2000')
  ).filter((row) => row.id.startsWith(DEMO_PREFIX));

  if (profiles.length === 0) {
    console.error(
      'No demo accounts found. Run supabase/seed.sql against this project first (SETUP.md §4).',
    );
    process.exit(1);
  }

  const workerIds = new Set(
    (await rest('worker_profiles?select=user_id&limit=2000'))
      .map((row) => row.user_id)
      .filter((id) => id.startsWith(DEMO_PREFIX)),
  );

  // One trade per worker — the first service they listed is their headline act.
  const tradeByWorker = new Map();
  for (const row of await rest('service_descriptions?select=user_id,trade_slug&limit=5000')) {
    if (!workerIds.has(row.user_id)) continue;
    if (!tradeByWorker.has(row.user_id)) tradeByWorker.set(row.user_id, row.trade_slug);
  }

  const workersByTrade = new Map();
  for (const [userId, slug] of tradeByWorker) {
    if (ONLY && !ONLY.has(slug)) continue;
    workersByTrade.set(slug, [...(workersByTrade.get(slug) ?? []), userId]);
  }

  console.log(
    `Found ${profiles.length} demo accounts · ${workerIds.size} workers · ` +
      `${workersByTrade.size} trades to illustrate`,
  );
  console.log('');

  // 2. Work photos, trade by trade.
  const photosByTrade = new Map();
  for (const [slug, workers] of [...workersByTrade].sort()) {
    const imagery = TRADE_IMAGERY[slug] ?? GENERIC_IMAGERY;
    process.stdout.write(`  ${slug.padEnd(20)} ${String(workers.length).padStart(3)} pros … `);

    const images = await collectImages(imagery.queries, PER_TRADE, 'landscape');
    if (images.length === 0) {
      console.log('no images found — skipped');
      continue;
    }

    // Indexed rather than pushed: the uploads run concurrently, and letting
    // completion order decide the array order would reshuffle which caption
    // lands on which photo on every re-run.
    const slots = new Array(images.length).fill(null);
    await pooled(images, 4, async (image, index) => {
      try {
        const path = await materialise(image, `seed/work/${slug}/${index}`);
        slots[index] = path;
        credits.push({ trade: slug, ...image, stored: path });
      } catch (error) {
        console.warn(`\n    image ${index} skipped: ${error.message}`);
      }
    });
    const paths = slots.filter(Boolean);

    photosByTrade.set(slug, { paths, captions: imagery.captions });
    console.log(`${paths.length} photos`);
  }

  // 3. Portraits.
  let avatarPaths = [];
  if (!SKIP_AVATARS) {
    console.log('');
    process.stdout.write(`  avatars              ${String(profiles.length).padStart(3)} people … `);
    const portraits = await collectImages(AVATAR_QUERIES, AVATAR_COUNT, 'portrait');
    const slots = new Array(portraits.length).fill(null);
    await pooled(portraits, 4, async (image, index) => {
      try {
        const path = await materialise(image, `seed/avatars/${index}`);
        slots[index] = path;
        credits.push({ kind: 'avatar', ...image, stored: path });
      } catch {
        /* one missing portrait is not worth a warning line */
      }
    });
    avatarPaths = slots.filter(Boolean);
    console.log(`${avatarPaths.length} portraits`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — nothing written to the database.');
    await writeCredits();
    return;
  }

  // 4. Replace what a previous run wrote. Scoped to demo users, so a real
  //    worker's own uploaded portfolio is never in scope.
  console.log('\nWriting to the database…');
  const demoWorkerIds = [...workerIds];
  for (let i = 0; i < demoWorkerIds.length; i += 50) {
    const batch = demoWorkerIds.slice(i, i + 50);
    await rest(`portfolio_items?user_id=in.(${batch.join(',')})`, { method: 'DELETE' });
  }

  // 5. Portfolio rows. Each worker gets a different window into their trade's
  //    photo set, so two tilers do not show an identical grid.
  const rows = [];
  for (const [slug, workers] of workersByTrade) {
    const pool = photosByTrade.get(slug);
    if (!pool || pool.paths.length === 0) continue;

    workers.forEach((userId, workerIndex) => {
      const take = Math.min(PER_WORKER, pool.paths.length);
      for (let k = 0; k < take; k += 1) {
        const offset = (workerIndex * PER_WORKER + k) % pool.paths.length;
        rows.push({
          user_id: userId,
          storage_path: pool.paths[offset],
          // Caption follows the PHOTO, not the worker. Keying it to the worker
          // meant the same image was "Knotless box braids" on one profile and
          // "Twist-out" on the next — which anyone comparing two pros would
          // notice immediately.
          caption: pool.captions[offset % pool.captions.length] ?? '',
        });
      }
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    await rest('portfolio_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
  }
  console.log(`  ${rows.length} portfolio photos across ${workersByTrade.size} trades`);

  // 6. Avatars for everyone — customers included, since they show up as review
  //    authors and in every chat header.
  if (avatarPaths.length > 0) {
    let done = 0;
    await pooled(profiles, 8, async (profile, index) => {
      const path = avatarPaths[index % avatarPaths.length];
      const url = MODE === 'link' ? path : storagePublicUrl(path);
      await rest(`profiles?id=eq.${profile.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ avatar_url: url }),
      });
      done += 1;
    });
    console.log(`  ${done} avatars`);
  }

  await writeCredits();
  console.log('\nDone. Pull to refresh in the app — the marketplace has faces now.');
}

/**
 * Attribution manifest.
 *
 * Openverse returns CC-licensed work that legally requires credit, and a
 * competition demo is exactly the wrong place to be caught using photos
 * without it. Written next to the script so it can be checked in.
 */
async function writeCredits() {
  if (credits.length === 0) return;
  await writeFile(CREDITS_FILE, JSON.stringify({ provider: providerName, credits }, null, 2));
  console.log(`  credits → supabase/scripts/seed-images-credits.json (${credits.length} images)`);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
