const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  Header, Footer, PageNumber, TableOfContents, LevelFormat, convertInchesToTwip,
  TabStopType, LeaderType, Tab,
  ExternalHyperlink, VerticalAlign, LineRuleType,
} = require('docx');

// Figures and toc.json live alongside this script; the .docx is written one level up.
const SCRATCH = __dirname;
const FIGURES = path.join(__dirname, '..', 'figures');
const OUT_DIR = path.join(__dirname, '..');

// ── Brand ────────────────────────────────────────────────────────────────────
const NAVY = '0F3E85';
const BLUE = '1D6FD8';
const GREEN = '0B6B4A';
const GREY = '5A6672';
const INK = '22303C';
const RULE = 'C6D6EA';
const TINT = 'F4F8FD';
const WARM = 'FFF8E8';

const FONT = 'Calibri';
const CONTENT_W = 9360; // 12240 - 2*1440

// ── Helpers ──────────────────────────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });

const P = (text, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 140, before: o.before ?? 0, line: 276 },
    alignment: o.align,
    indent: o.indent,
    children: typeof text === 'string'
      ? [run(text, { size: o.size ?? 22, color: o.color ?? INK, bold: o.bold, italics: o.italics })]
      : text,
    border: o.border,
    shading: o.shading,
  });

/** Rich paragraph from [text, opts] pairs. */
const RP = (parts, o = {}) =>
  P(parts.map(([t, po = {}]) => run(t, { size: o.size ?? 22, color: po.color ?? o.color ?? INK, ...po })), o);

const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 380, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: BLUE, space: 6 } },
    children: [run(text, { size: 34, bold: true, color: NAVY })],
  });

const H2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 140 },
    children: [run(text, { size: 26, bold: true, color: BLUE })],
  });

const H3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 110 },
    children: [run(text, { size: 23, bold: true, color: INK })],
  });

const BUL = (text, o = {}) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 90, line: 276 },
    children: typeof text === 'string'
      ? [run(text, { size: 22, color: INK })]
      : text,
  });

/** Bullet whose lead phrase is bold: "Lead — rest of sentence". */
const BULL = (lead, rest) =>
  BUL([run(lead, { size: 22, bold: true, color: NAVY }), run(rest, { size: 22, color: INK })]);

const NUM = (text, ref = 'nums') =>
  new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 90, line: 276 },
    children: typeof text === 'string' ? [run(text, { size: 22, color: INK })] : text,
  });

const NUML = (lead, rest, ref = 'nums') =>
  NUM([run(lead, { size: 22, bold: true, color: NAVY }), run(rest, { size: 22, color: INK })], ref);

/** Callout box — a shaded, bordered paragraph block. */
const CALLOUT = (lines, fill = WARM, edge = 'C98A0B') =>
  lines.map((ln, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? 160 : 0, after: i === lines.length - 1 ? 200 : 70, line: 276 },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      indent: { left: 170, right: 170 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, color: edge, space: 8 },
        top: i === 0 ? { style: BorderStyle.SINGLE, size: 2, color: fill, space: 6 } : undefined,
        bottom: i === lines.length - 1 ? { style: BorderStyle.SINGLE, size: 2, color: fill, space: 6 } : undefined,
      },
      children: typeof ln === 'string'
        ? [run(ln, { size: 22, color: INK })]
        : ln.map(([t, po = {}]) => run(t, { size: 22, color: INK, ...po })),
    }),
  );

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
  left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
  right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
};

/**
 * Table from a header array + rows of strings.
 * `widths` must sum to CONTENT_W.
 */
const TBL = (head, rows, widths, o = {}) => {
  const mk = (text, w, opts) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' },
      borders: cellBorders,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      verticalAlign: VerticalAlign.TOP,
      children: String(text).split('\n').map((line, i) =>
        new Paragraph({
          spacing: { after: 0, line: 260 },
          children: [run(line, {
            size: opts.size ?? 20,
            bold: opts.bold || (i === 0 && opts.boldFirstLine),
            color: opts.color ?? INK,
            italics: opts.italics,
          })],
        }),
      ),
    });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: head.map((h, i) => mk(h, widths[i], { fill: NAVY, bold: true, color: 'FFFFFF', size: 20 })),
      }),
      ...rows.map((r, ri) => {
        const sub = (o.subHeaders ?? []).includes(ri);
        return new TableRow({
          cantSplit: true,
          children: r.map((c, i) =>
            mk(c, widths[i], sub
              ? { fill: NAVY, bold: true, color: 'FFFFFF', size: 20 }
              : {
                  fill: ri % 2 === 0 ? 'FFFFFF' : TINT,
                  size: o.size ?? 20,
                  bold: i === 0 && o.boldFirstCol,
                  color: i === 0 && o.boldFirstCol ? NAVY : INK,
                }),
          ),
        });
      }),
    ],
  });
};

const SPACER = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });

const FIG = (file, caption, widthIn) => {
  const buf = fs.readFileSync(path.join(FIGURES, file));
  // PNGs were rendered at 2x device scale.
  const meta = { architecture: [2800, 2196], 'formalization-pathway': [2800, 1676] }[file.replace('.png', '')];
  const w = convertInchesToTwip(widthIn) / 20; // docx image size is in points… use px-equivalent
  const px = Math.round(widthIn * 96);
  return [
    new Paragraph({
      spacing: { before: 160, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        type: 'png',
        data: buf,
        transformation: { width: px, height: Math.round(px * meta[1] / meta[0]) },
      })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER,
      children: [run(caption, { size: 19, italics: true, color: GREY })],
    }),
  ];
};

// ═════════════════════════════════════════════════════════════════════════════
// COVER
// ═════════════════════════════════════════════════════════════════════════════
const cover = [
  SPACER(1400),
  P([run('CANTO Innovation Challenge 2026', { size: 26, color: GREY, bold: true })],
    { align: AlignmentType.CENTER, after: 60 }),
  P([run('Phase 2 Submission', { size: 24, color: GREY })],
    { align: AlignmentType.CENTER, after: 700 }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, line: 1400, lineRule: LineRuleType.AT_LEAST },
    children: [run('myB', { size: 108, bold: true, color: NAVY }), run('.', { size: 108, bold: true, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 260, line: 560, lineRule: LineRuleType.AT_LEAST },
    children: [run('Mind Yuh Business', { size: 40, bold: true, color: BLUE })],
  }),
  P([run('Turning Jamaica’s invisible skilled labour into visible economic participation.', {
    size: 24, italics: true, color: GREY,
  })], { align: AlignmentType.CENTER, after: 900 }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: BLUE, space: 10 } },
    children: [run('Team Bit-by-Bit', { size: 30, bold: true, color: NAVY })],
  }),
  P([run('Abishua Johnson  ·  Joel Dixon  ·  Emani Longmore', { size: 24, color: INK })],
    { align: AlignmentType.CENTER, after: 500 }),
  P([run('Primary Track: ', { size: 22, color: GREY }), run('Smart Businesses, Tourism & Economic Growth', { size: 22, bold: true, color: INK })],
    { align: AlignmentType.CENTER, after: 40 }),
  P([run('Secondary Track: ', { size: 22, color: GREY }), run('Education, Skills & Workforce Development', { size: 22, bold: true, color: INK })],
    { align: AlignmentType.CENTER, after: 400 }),
  P([run('Submitted August 2026', { size: 21, color: GREY })], { align: AlignmentType.CENTER }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// TOC
// ═════════════════════════════════════════════════════════════════════════════
// Built from a first-pass render (toc.json). Static rather than a field, so the
// contents page is correct in whatever the judges open it with.
let tocEntries = [];
try { tocEntries = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'toc.json'), 'utf8')); } catch (e) {}

const tocLine = (title, page, level) =>
  new Paragraph({
    spacing: { after: 60, line: 240 },
    indent: { left: level === 1 ? 0 : 300 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
    children: [
      run(title, { size: level === 1 ? 22 : 21, bold: level === 1, color: level === 1 ? NAVY : INK }),
      new TextRun({ children: [new Tab()] }),
      run(String(page), { size: level === 1 ? 22 : 21, bold: level === 1, color: level === 1 ? NAVY : GREY }),
    ],
  });

const toc = [
  H1('Table of Contents'),
  ...tocEntries.map((e) => tocLine(e.title, e.page, e.level)),
  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
const exec = [
  H1('Executive Summary'),

  P('In Phase 1 we described a platform. In Phase 2 we built it.'),

  P('MyB (Mind Yuh Business) is a mobile platform that turns Jamaica’s invisible skilled labour into visible economic participation. Approximately 55 percent of Jamaica’s workforce operates informally, generating an estimated 40 percent of national GDP. Those workers are economically essential and digitally invisible: no discoverable profile, no portable proof of quality, no record a bank will read. MyB gives them all three, in one app, on a phone they already own.'),

  P('What now exists is not a mock-up or a clickable prototype. It is a working application running against a live PostgreSQL database with row-level security on every table, a seeded market of 221 worker profiles across 48 trades and 1,126 historical jobs, and three complete intelligent subsystems: matching, reputation, and BizBot. A customer can describe a job in plain Jamaican English, get ranked professionals near them, book one, watch the request arrive on that worker’s phone in real time, chat, complete the job, leave a review, and see the worker’s reputation score recompute — end to end, today.'),

  H2('What we delivered'),

  TBL(
    ['What Phase 1 promised', 'What Phase 2 ships'],
    [
      ['AI matching and recommendation',
       'A weighted, transparent ranking function over skill relevance, PostGIS proximity, reputation, availability and job history — layered on Postgres full-text, trigram and Jamaican-colloquial synonym search, with optional pgvector semantic matching on top.'],
      ['Reputation intelligence and trust',
       'A deterministic Postgres scoring function with published weights and smoothing priors, recomputed automatically on every review and completion, plus three live heuristic fraud checks and a two-gate identity verification pipeline.'],
      ['BizBot and progressive formalization',
       'A retrieval-augmented assistant grounded in Jamaican formalization sources with citations on every answer, saved conversations, and a four-stage formalization journey driven by deterministic configuration — never by the language model.'],
    ],
    [2860, 6500],
    { boldFirstCol: true },
  ),

  SPACER(200),
  H2('The numbers behind the build'),

  TBL(
    ['Delivered', 'Detail'],
    [
      ['~23,000 lines of code', 'TypeScript (app), SQL (database), Deno/TypeScript (edge functions), Python (AI service)'],
      ['37 screens', 'A complete two-sided application: customer and worker, light and dark'],
      ['22 database migrations', 'Every one proven on a from-scratch rebuild before it shipped'],
      ['3 deployment surfaces', 'Deliberately three, not a microservice sprawl'],
      ['1,126 seeded jobs', 'A demonstrable market with real distributions, not three placeholder rows'],
      ['US$0 / month', 'Every component runs on a permanent free tier'],
    ],
    [2300, 7060],
    { boldFirstCol: true },
  ),

  SPACER(200),

  ...CALLOUT([
    [['The engineering decision we are proudest of. ', { bold: true, color: GREEN }],
     ['Every core journey in MyB — find a worker, book, chat, complete, get rated, follow the formalization pathway — works with no AI key configured and no Python service running. Discovery falls back from semantic search to Postgres text search to category browsing. BizBot falls back from a language model to quoting the official documents verbatim. In a market where connectivity is uneven and free-tier services cold-start, a feature that only works on a good day is not a feature. Nothing in MyB is allowed to have a single point of failure that takes the product down with it.']],
  ], 'EAF7F1', '0F8A5F'),

  P('Jamaica is the launch market. CARICOM is the scale market. The knowledge base is tagged by country and parish, the trade taxonomy is data rather than code, and the formalization pathway is configuration — so a second country is a content exercise, not a rebuild.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. INNOVATION TRACK ALIGNMENT
// ═════════════════════════════════════════════════════════════════════════════
const s1 = [
  H1('1. Innovation Track Alignment'),

  P('MyB is submitted under the Smart Businesses, Tourism and Economic Growth track, with a strong secondary alignment to Education, Skills and Workforce Development.'),

  H2('1.1 Primary track: Smart Businesses, Tourism and Economic Growth'),

  P('The track asks for solutions that make businesses smarter and grow the economy. MyB does both at the point where Jamaica leaks the most value: the boundary between the informal and formal economy. Jamaica generates a larger share of GDP informally than any other CARICOM state — estimated at 35 to 44 percent. That is not a compliance problem to be policed. It is an enormous quantity of productive economic activity operating without the instruments that let activity compound: credit, contracts, insurance, and scale.'),

  P('Every claim below is delivered by something a judge can open in the prototype:'),

  TBL(
    ['Track outcome', 'What MyB actually does'],
    [
      ['Micro-enterprise formation',
       'The formalization pathway converts registration from a bureaucratic maze into four sequenced stages, each stating what it unlocks — with per-step cost and working-day estimates so a worker knows the real price before starting. It is offered as a suggestion the worker opts into once their own record shows they are ready.'],
      ['SME operational efficiency',
       'A business owner sourcing a tiler, a driver or a cleaner searches in plain language, sees verified identity, a computed reputation score, distance, rate range and completed-job history, and books in under a minute. The alternative today is a WhatsApp group and a hope.'],
      ['Tourism supply chain',
       'Villas, guesthouses and short-let operators depend almost entirely on informal labour — gardeners, cooks, drivers, housekeepers, maintenance. MyB gives that supply chain verified identity and a reputation record, which is precisely what a property manager cannot get today.'],
      ['Economic growth and formalization',
       'Reputation is computed, portable, and owned by the worker. It is designed from the start as alternative credit data: a documented, tamper-resistant record of income-generating activity for a population that currently has none.'],
      ['Digital and financial inclusion',
       'The entry cost is a smartphone and a phone number. Identity verification, not a bank account, is the gate to visibility — and the pathway then walks the worker toward the bank account.'],
    ],
    [2500, 6860],
    { boldFirstCol: true },
  ),

  SPACER(160),
  H2('1.2 Secondary track: Education, Skills and Workforce Development'),

  P('MyB is a skills platform disguised as a marketplace. Every completed job is a verified data point about what a person can actually do — the credential Jamaica’s informal workforce has never been able to produce. Workers progress through visibility tiers (identity, phone, skill, business) that reward credentialing rather than assuming it. BizBot answers the practical business questions no trade school covers: what a TRN is and when you actually need one, which records to keep, how to price and quote a job, what NIS gives you.'),

  P('This creates a bridge that does not exist today. HEART/NSTA certification currently ends at a piece of paper; MyB turns that paper into visible market advantage, and turns market activity back into evidence of skill. The result is a live, continuously updated map of which trades are in demand, in which parishes, at what price — exactly the labour-market intelligence Jamaica’s training institutions and policymakers currently lack.'),

  H2('1.3 Regional relevance'),

  P('Informality is not a Jamaican quirk; it is the structural condition of Caribbean labour markets. What makes MyB travel is that the Jamaica-specific parts are data, not code. Knowledge-base chunks carry country and parish metadata and retrieval is filtered by country. Trades, synonyms, checklist steps, tiers and thresholds live in configuration tables. Launching in Trinidad and Tobago or Guyana means writing a new knowledge base and a new checklist — work measured in weeks, and work a local partner can do without touching the platform.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 2. TECHNICAL SPECIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════
const s2 = [
  H1('2. Technical Specifications'),

  H2('2.1 Technology Stack and Tools Used'),

  P('Every technology below was chosen against three constraints: it must run permanently on a free tier, it must not require a paid tier to remain architecturally valid, and it must not introduce a single point of failure into a core user journey.'),

  TBL(
    ['Layer', 'Technology', 'Why this choice'],
    [
      ['Mobile app', 'React Native 0.81 + Expo SDK 54, Expo Router v6, TypeScript (strict)',
       'One codebase for Android and iOS. Expo Router gives file-based navigation and deep links. Strict TypeScript means the data contracts are checked at compile time, not discovered in production.'],
      ['Database', 'PostgreSQL 16 with PostGIS, pgvector and pg_trgm',
       'One engine covers relational data, geospatial proximity, vector similarity and fuzzy text. Fewer moving parts than a specialist search or vector service, and no additional bill.'],
      ['Backend platform', 'Supabase — Auth, Storage, Realtime, Edge Functions (Deno), Row Level Security',
       'Managed Postgres with authentication, file storage, websockets and serverless functions on one free tier. Business logic sits in the database, where it is enforceable.'],
      ['AI service', 'Python 3.11, FastAPI, Pydantic',
       'The only Python surface, and the only place Python is genuinely required: face embedding and cosine matching. Pydantic models on every boundary.'],
      ['Language models', 'Gemini 2.5 Flash (primary), Groq / Llama (failover)',
       'Both free-tier and OpenAI-compatible, so failover is a base-URL swap. Roughly 1,500 requests/day free is ample for a launch cohort.'],
      ['Embeddings', 'Gemini embeddings, stored in pgvector',
       'Semantic search without a separate vector database. Degrades cleanly to text search when unavailable.'],
      ['Liveness detection', 'Google ML Kit face detection via react-native-vision-camera frame processors',
       'Runs entirely on-device. No face imagery leaves the phone during the liveness challenge — a privacy property, not just a performance one.'],
      ['Maps', 'MapLibre GL + OpenStreetMap tiles', 'Guaranteed zero cost, no API key, no per-view billing surprise at scale.'],
      ['Notifications', 'Expo Push Notifications', 'Free, cross-platform, and already part of the Expo toolchain.'],
      ['Build and delivery', 'EAS Build; GitHub with Conventional Commits; GitHub Actions keep-warm cron',
       'The cron ping prevents Supabase’s free tier from auto-pausing after seven idle days — a real operational risk we engineered around rather than accepted.'],
    ],
    [1450, 2650, 5260],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H3('Compatibility requirements and dependencies'),

  BULL('Runtime targets', ' — Android 8.0+ and iOS 15+, matching Expo SDK 54. The app is built for mid-range Android hardware, which is what the target user actually carries.'),
  BULL('Expo Go for the demo', ' — the entire application, including BizBot, matching, booking, realtime and the formalization pathway, runs in Expo Go with no native build. This was a deliberate demo-resilience decision: a judge can open it from a QR code.'),
  BULL('Custom development build for liveness only', ' — the ML Kit frame processor is native code. That module is loaded behind a runtime guard, so on Expo Go the verification flow runs in a clearly-labelled demo mode instead of crashing the app. The single native dependency is isolated to a single screen.'),
  BULL('Optional external services', ' — the Python AI service and the language-model keys are optional at runtime. Their absence degrades a feature; it never breaks a journey.'),
  BULL('Network posture', ' — job drafts persist locally and survive navigation and app restart, so a customer who loses signal halfway through a request does not lose the request.'),

  new Paragraph({ children: [new PageBreak()] }),
  H2('2.2 System Design and Development Approach'),

  P('MyB runs on exactly three deployment surfaces. That number is a design constraint we enforced, not an outcome we arrived at.'),

  ...FIG('architecture.png', 'Figure 1 — The three-surface architecture, and the degradation ladder that keeps it usable.', 6.4),

  H3('A deliberate change from the Phase 1 indicative direction'),

  P('Phase 1 proposed a Node.js backend with Python AI services on AWS, deployed as containerised microservices. We built something different, and we want to be explicit about why, because the change is the engineering story of this phase.'),

  P('We prototyped the microservice direction and found three problems that were fatal for this product, in this market, at this stage. First, cost: a containerised multi-service deployment cannot run indefinitely at zero cost, and a platform for informal workers that needs funding before it can stay online is a platform that will go offline. Second, cold starts: free container hosts sleep, and a 60-second wake-up in front of a judge — or a worker standing in a hardware store — is a broken product. We learned this concretely: BizBot originally routed through the Python service and was simply dead whenever that service was not running. Third, security surface: authorisation spread across several services is authorisation you have to get right several times.'),

  P('So we moved the system of record into Postgres and pushed the logic down with it. Business rules became SQL functions. Authorisation became row-level security enforced by the database on every single query, including queries the client could construct itself. The glue that genuinely needed to run server-side — BizBot retrieval and generation, intent extraction, embedding, keep-warm — became Supabase edge functions, which are always warm and free. Python was reduced to the one job that actually requires it: face embedding and cosine matching.'),

  ...CALLOUT([
    [['The result. ', { bold: true, color: NAVY }],
     ['Fewer surfaces, one authorisation model, zero monthly cost, no cold start on any core path, and — critically — an upgrade path that is a configuration change rather than a rewrite. Supabase Pro, paid Gemini and Expo Starter are all drop-in. We did not build a cheaper version of the Phase 1 architecture. We built a more defensible one.']],
  ], TINT, BLUE),

  H3('Security model: row-level security first'),

  P('Every table has row-level security enabled and explicit policies. The mobile app carries only the anonymous key; the service-role key exists only inside edge functions and the AI service and is never present in the client bundle. Where a write needs to touch a column the user must not control directly, it goes through a SECURITY DEFINER function with an explicit ownership guard rather than a broader grant. We verified this adversarially: a signed-in user attempting to read another user’s verification record, checklist, saved BizBot conversations or fraud flags is refused by the database itself, not by a check in the app that a modified client could skip.'),

  H3('Workflow 1: from a plain-language request to a completed, rated job'),

  NUML('Describe', ' — the customer types what they need in their own words. "Mi sink a leak under di counter" is a valid query.'),
  NUML('Resolve', ' — the query is normalised into a Postgres full-text query with OR semantics, matched against service descriptions, trade labels and a curated synonym list per trade, with trigram similarity as a fallback for misspellings. Where a language-model key is configured, an edge function additionally extracts structured intent (job type, location, urgency, budget) to pre-fill the request form. Where it is not, the text path alone still resolves the query.'),
  NUML('Rank', ' — candidates are scored by a single transparent SQL expression: 0.35 relevance + 0.25 proximity (PostGIS distance, normalised over 30 km) + 0.20 reputation + 0.10 availability + 0.10 completed-job history.'),
  NUML('Book', ' — the customer picks a professional. The draft they already filled in carries forward; they confirm rather than retype.'),
  NUML('Arrive', ' — the request appears on the worker’s phone over Supabase Realtime, as a banner wherever they are in the app, with a sound and haptic. They accept or decline with a swipe.'),
  NUML('Track', ' — both sides see the same four-stage progress tracker: requested, accepted, in progress, completed. Chat, photos and job cards live in the same thread.'),
  NUML('Rate', ' — on completion the customer reviews. A database trigger immediately recomputes the worker’s reputation score and re-runs the fraud heuristics. No queue, no job runner, no drift between the review and the score.'),

  SPACER(120),
  H3('Workflow 2: identity verification — two gates, kept separate'),

  P('Cosine similarity proves that two faces match. It does not prove that one of them is alive. We treat those as two independent gates and keep them separate in both the code and the interface, because collapsing them is the standard way this kind of system gets defeated by a printed photograph.'),

  NUML('Consent', ' — an explicit, unavoidable consent step before any capture, stating what is collected, why, and how long it is kept. Jamaica’s Data Protection Act treats biometric data as sensitive personal data, and the design assumes that from the first screen.', 'nums2'),
  NUML('Gate one — ID capture', ' — the government ID is photographed, the face is detected and cropped, and an embedding is computed and stored. We store the embedding in preference to the raw image: a vector is far less useful to an attacker than a photograph of a national ID.', 'nums2'),
  NUML('Gate two — active liveness, on-device', ' — a guided challenge (look ahead, turn left, turn right, blink) verified from head Euler-Y angle swing beyond 18 degrees in each direction and an eye-open probability dip, sampled across frames. This runs entirely on the phone. A printed photo cannot turn its head.', 'nums2'),
  NUML('Frontal capture and match', ' — one clean frame from the end of the challenge is sent to the AI service, embedded, and compared to the stored ID embedding by cosine similarity against a threshold. Pass unlocks the verified tier and the badge.', 'nums2'),

  P([run('On thresholds: ', { size: 22, bold: true, color: NAVY }),
     run('the cutoff is model-specific and we present it as such. A sensible value is hardcoded for the demonstration, and false-accept / false-reject calibration against a held-out set is named explicitly as pre-launch work rather than presented as a solved problem. Publishing a single magic number as though it were universal would be the wrong claim to make.', { size: 22, color: INK })]),

  H3('Development approach'),

  BULL('Migration-first database', ' — the schema is 22 ordered migrations, not a console someone clicked in. Any environment can be rebuilt from zero.'),
  BULL('A verification harness', ' — because the free tier gives no staging environment and CI has no Docker, we stood up a bare PostgreSQL 16 instance with shim schemas and roles that emulate Supabase’s auth and storage layers. Every migration is applied to a from-scratch rebuild and its behaviour asserted — row-level isolation, cascade deletes, permission refusals, retrieval quality — before it ships.'),
  BULL('Deterministic logic is unit-tested', ' — pure functions such as the formalization journey builder and the job-title generator are tested independently of the app.'),
  BULL('Small, reviewable commits', ' — Conventional Commits throughout; the commit history reads as a build log.'),
  BULL('Clear ownership', ' — Abishua: AI service, matching, reputation and fraud logic, BizBot retrieval. Joel: schema, row-level security, PostGIS and pgvector, scalability. Emani: the Expo app, user experience, onboarding, liveness interface, and accessibility for low-digital-literacy users.'),

  SPACER(140),
  H2('2.3 Use of AI, Automation and Data-Driven Technologies'),

  P('MyB uses AI deliberately and narrowly. The rule we hold ourselves to is simple, and it is enforced in the architecture: language models are for language, never for decisions.'),

  TBL(
    ['Capability', 'How it works', 'AI or deterministic?'],
    [
      ['Discovery and matching',
       'Postgres full-text search with OR semantics, trigram similarity, and per-trade colloquial synonyms; ranked by a fixed weighted score over relevance, PostGIS proximity, reputation, availability and history. Optional pgvector semantic matching layers on top so "my sink is leaking" reaches a plumber with no keyword in common.',
       'Deterministic, with an optional AI enhancement'],
      ['Intent extraction',
       'An edge function asks the model to turn free text into structured JSON: job type, location, urgency, budget. Used only to pre-fill a form the customer can edit.',
       'AI — and never load-bearing'],
      ['Reputation scoring',
       '0.40 review quality + 0.25 completion rate + 0.20 response consistency + 0.15 dispute history, each with a smoothing prior so a single five-star review cannot manufacture a perfect score. Recomputed by database trigger.',
       'Deterministic, by design'],
      ['Fraud detection',
       'Three live heuristics: review velocity inside 24 hours, device-fingerprint overlap between a worker and their reviewers (the review-ring signal), and rating-pattern anomalies (many reviews, implausibly uniform, all near-perfect). Flags are admin-only and never visible to the flagged account.',
       'Deterministic heuristics; ML is roadmap'],
      ['BizBot question answering',
       'Retrieval-augmented generation. Postgres full-text retrieval over knowledge-base chunks with title and topic weighting, then generation strictly from the retrieved passages, with sources cited on every answer.',
       'AI, tightly grounded'],
      ['Formalization pathway',
       'Stages, steps, required documents, costs and durations come from configuration tables keyed by trade and parish. BizBot narrates that configuration; it never decides it.',
       'Deterministic, deliberately'],
      ['A worker’s own numbers',
       'A single SQL function returns fifteen figures — jobs booked and worked this month, earnings this month and lifetime, rating, response rate, repeat customers. BizBot answers "how many jobs did I book this month" from that result verbatim.',
       'Deterministic — personal figures never reach a model'],
    ],
    [1800, 5560, 2000],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H3('How BizBot is kept honest'),

  P('BizBot answers questions about tax, registration and compliance. Getting those wrong has consequences for a real person’s money, so we constrained it hard.'),

  BULL('Grounded, always', ' — answers are generated only from retrieved passages of curated Jamaican source material (TRN, business-name registration, GCT, NIS, income tax and TCC, record-keeping, pricing and quoting, opening a business account, and why formalization is worth it). Sources are cited on the answer.'),
  BULL('Never invents a rule', ' — if retrieval returns nothing relevant, BizBot says so rather than reasoning from general knowledge about some other country’s tax system.'),
  BULL('Structure is never generated', ' — checklists and required-document lookups are structured queries, not prompts. Two workers with the same trade in the same parish get an identical list, every time.'),
  BULL('Three-tier degradation', ' — edge function with a language model, then the Python service, then the app queries the knowledge base directly and quotes the relevant passages. The worst outcome is a quotation instead of a summary, which also happens to be the outcome that cannot invent a rule.'),
  BULL('Provider failover', ' — Gemini to Groq on error, rate limit or timeout, with explicit 429 handling. Free tiers throttle; the product does not.'),
  BULL('Memory that respects privacy', ' — conversations are titled and saved so a worker can re-read an answer at the agency counter next week, and can delete one or all of them. Asking an assistant whether the tax authority is coming for you is a private act.'),

  SPACER(120),
  H3('Automation'),

  BUL('Database triggers recompute reputation and re-run fraud checks the moment a review lands or a job completes — no scheduler, no lag, no possibility of a stale score being shown next to a fresh review.'),
  BUL('A GitHub Actions cron pings the project on a schedule so the free-tier database never auto-pauses after seven idle days.'),
  BUL('Popular categories on the home screen are computed from actual demand — jobs booked in the last 90 days — so the interface reflects the market rather than a hardcoded list a developer guessed at.'),
  BUL('Realtime publication pushes new job requests to the worker’s device without polling.'),

  SPACER(140),
  H2('2.4 Custom-Built and Innovative Features'),

  NUML('Search that speaks Jamaican.', ' Generic marketplace search assumes the customer knows the trade name. Our users do not think in trade names — they think in problems, in patois. Every trade carries a curated synonym list, queries use OR semantics rather than requiring every word to match, and trigram similarity absorbs spelling. "Tutor", "someone to braid my hair" and "mi sink a leak under di counter" all resolve to the right professionals. This runs in Postgres with no external service and no API key, which means discovery — the single feature the product cannot live without — has no external dependency at all.', 'numsF'),

  NUML('A trust ladder, not a trust badge.', ' Verification is tiered: identity, phone, skill, business. Each tier unlocks visibility, so trust is something a worker builds incrementally and is rewarded for at every step, rather than a binary gate that excludes everyone who has not cleared it.', 'numsF'),

  NUML('Reputation as portable alternative credit data.', ' The score is computed, not crowdsourced sentiment; its components are stored and shown transparently; and it belongs to the worker. This is deliberately built as the artefact a lender or insurer could one day read — a documented, tamper-resistant record of income-generating activity for people who have never had one.', 'numsF'),

  NUML('Formalization framed as unlocks, not obligations.', ' Nobody registers a business because an app told them to. They do it because a door opens. Each of the four stages leads with what it unlocks — "you can bid for company and government work, and open a business account" — and shows the real cost and working days before the worker starts. The suggestion to begin appears only when the worker’s own record shows readiness, and it is always suggestion-with-confirm. The app never enrols anyone.', 'numsF'),

  NUML('An assistant that knows your numbers without ever sending them anywhere.', ' Ask BizBot how many jobs you booked this month and it answers from a SQL function against your own record. The figure is exact, it is yours, and it never touches a third-party model. As far as we are aware, no comparable assistant separates personal data from the language model this cleanly.', 'numsF'),

  NUML('A designed degradation ladder.', ' Most products have an unplanned failure mode. We enumerated ours and built each rung deliberately, for discovery, for BizBot, and for verification. This is what makes a free-tier architecture a legitimate engineering choice rather than a compromise.', 'numsF'),

  NUML('A real accept moment.', ' A job request lands on the worker’s phone in real time with sound, haptics and a full-screen celebration on accept, and a red sweep on decline. This is not decoration. For a worker who has spent years waiting on a phone call that may never come, the moment work arrives is the emotional core of the product, and it should feel like something.', 'numsF'),

  NUML('Designed for low digital literacy.', ' Plain language throughout, a swipe-anywhere sidebar, a route home from every screen, drafts that survive navigation and restarts, explicit progress states on anything slow, permission failures surfaced as readable text instead of a dead button, and full light and dark themes. Accessibility here is not a checklist item — it is the difference between a worker adopting the product and abandoning it.', 'numsF'),

  SPACER(140),
  H2('2.5 Development Challenges and Solutions'),

  TBL(
    ['Challenge', 'What was actually wrong', 'How we solved it'],
    [
      ['BizBot was dead whenever the AI service slept',
       'RAG ran in the Python service. Free hosts sleep, so the flagship feature was unavailable exactly when someone wanted to demonstrate it.',
       'Moved retrieval and generation into a Supabase edge function — always warm, free, no cold start. The Python service became an optional enhancement that adds semantic retrieval when running.'],
      ['Every booking reported "not found"',
       'A PostgREST embed named the wrong foreign key: jobs reference worker_profiles, not profiles. The request was rejected wholesale, which is indistinguishable in the client from "this record does not exist".',
       'Confirmed the constraint against the catalog, replaced the embed with explicit queries, and — more importantly — made the app distinguish a query error from an empty result everywhere, so this class of bug can never again present as missing data.'],
      ['"Permission denied" when saving a worker profile',
       'PostgREST upserts place the conflict key inside the update clause, so a column-level grant that deliberately excluded the ownership column blocked the whole write.',
       'Introduced SECURITY DEFINER functions with explicit ownership guards. The grant stayed tight; the write path became narrow and auditable, which is a better outcome than the broader grant would have been.'],
      ['No image upload worked — anywhere',
       'In React Native, fetching a file:// URI and taking its arrayBuffer yields an empty buffer. Uploads "succeeded" and stored nothing. Denied camera permissions also returned silently, so the button simply looked dead forever.',
       'Read images as base64 at pick time and decode them explicitly. Separately, surfaced permission denials as visible, actionable messages — the silent failure was the worse bug of the two.'],
      ['Search had to work with no AI at all',
       'Semantic search needs embeddings, embeddings need a key, and keys can be absent, throttled or expired. Discovery cannot be allowed to depend on that.',
       'Built discovery as Postgres full-text plus trigram plus curated per-trade synonyms, with pgvector strictly as an optional layer on top. Search works with no key configured; the AI makes it better, never possible.'],
      ['Retrieval returned the wrong document',
       '"What records should I keep" returned the GCT explainer, because body-text frequency alone ranked a longer document above the correct one.',
       'Added weighted title and topic matching to the ranking function. The full demonstration question set went to eight out of eight correct, verified against the seeded knowledge base.'],
      ['Native camera modules break Expo Go',
       'The liveness frame processor is native code. Importing it unconditionally would have made the entire app unrunnable without a custom build — unacceptable for a demo.',
       'Gated the native import behind a runtime check. The full app runs in Expo Go from a QR code; only the liveness screen requires the development build, and it says so plainly.'],
      ['A new worker could reach a perfect score',
       'A naïve average means one five-star review produces a reputation of 100 — which is both wrong and trivially gameable.',
       'Added Laplace-style smoothing priors to every reputation component, so scores start neutral and move only with evidence. Combined with the review-velocity and device-overlap heuristics, manufacturing a reputation now requires effort disproportionate to the reward.'],
      ['No staging environment and no Docker in CI',
       'The free tier provides one database. Testing migrations against it risks the demonstration data; not testing them risks the demonstration itself.',
       'Built a verification harness: a bare PostgreSQL 16 with shim schemas and roles emulating Supabase’s auth and storage. Every migration is proven on a from-scratch rebuild, with row-level isolation and permission refusals asserted, before it goes near the live project.'],
    ],
    [2000, 3680, 3680],
    { boldFirstCol: true, size: 19 },
  ),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 3. USER TESTING & VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
const s3 = [
  H1('3. User Testing, Feedback and Validation Plan'),

  P('We want to be precise about what has been tested and what has not, because the distinction matters and overstating it would be the easiest thing in this document to do.'),

  P([run('What has happened: ', { size: 22, bold: true, color: NAVY }),
     run('sustained, structured usability testing on real devices, by the team, over the full build. What has not yet happened: field testing with informal workers outside the team. That work is scheduled, designed and costed, and it is set out in full in section 3.4.', { size: 22, color: INK })]),

  H2('3.1 How we tested'),

  P('MyB was built in short cycles, each ending with the working application installed on a physical Android device and driven through complete journeys as a customer and as a worker — not clicked through as a developer, but used as a user, including a two-phone protocol where one device books and the other receives, so realtime delivery, notifications, sound and the accept moment were tested as they will actually be experienced.'),

  P('Every observation was logged as a defect or a change request, prioritised, and either fixed or explicitly deferred. Across the build this produced more than sixty logged items over fifteen structured rounds. The commit history is the testing record: each round is traceable to the changes it caused.'),

  P('Two things made this more rigorous than internal testing usually is. First, the team’s prior work on eLife — a proof-of-life application for Jamaican pensioners — gave us direct experience of designing identity verification for users with low digital confidence, and we tested MyB against that standard rather than a developer’s standard. Second, we deliberately tested on a mid-range device on ordinary mobile data, because testing a product for informal workers on a flagship phone and office wifi tells you almost nothing useful.'),

  H2('3.2 What testing changed'),

  P('These are not cosmetic adjustments. In several cases testing invalidated a feature we had already built and we rebuilt it.'),

  TBL(
    ['What testing exposed', 'What we changed'],
    [
      ['The formalization pathway — the product’s single most important feature — had been implemented as a stack of forms. It was accurate, and nobody would ever have finished it.',
       'Rebuilt entirely as a four-stage journey. Each stage now leads with what it unlocks, shows real cost and working-day estimates, and presents one clear next step instead of a wall of fields. This is now the feature we most want to demonstrate.'],
      ['Having described a job in search, the customer was made to fill in the same form again to book. Testers found this genuinely irritating — and it is precisely the point at which someone abandons a booking.',
       'The draft now carries from search into booking. The second screen confirms; it does not re-ask.'],
      ['Generated job titles simply echoed the customer’s description back at them, so the bookings list was a column of near-identical strings.',
       'Built a three-tier title generator that strips conversational openers and trailing filler and falls back to the trade name. Unit-tested independently of the app.'],
      ['BizBot’s answers arrived as undifferentiated grey text with no visual author — indistinguishable from a system error message.',
       'Gave BizBot an identity and a structured answer renderer with headings, steps and source badges, and added saved conversations with titles.'],
      ['The sidebar clipped the "Verified" badge, which is the single element that carries the product’s trust proposition.',
       'Two stacked layout defects, both fixed. The badge now has its own line and the container is allowed to truncate correctly. Also added a close button and swipe-to-close, which testers kept reaching for.'],
      ['The booking progress tracker never visually reached "Completed", so a finished job still looked unfinished.',
       'Rewrote the progress model to count completed steps rather than the index of the current one. A completed job now reads as completed.'],
      ['Image upload buttons appeared to do nothing at all, with no message, forever.',
       'Fixed the underlying upload defect and surfaced permission denials as readable text. A user must never be left tapping a dead control.'],
      ['The splash sequence was too fast to read the product name.',
       'Slowed the sequence and resolved it into the brand mark. First impressions are not a place to optimise for speed.'],
    ],
    [4400, 4960],
  ),

  SPACER(160),
  H2('3.3 What we learned'),

  BULL('Accuracy is not usability.', ' The formalization pathway was factually correct long before it was usable. For this audience, a correct answer presented as a form is a wall. This is the insight that most shaped the product.'),
  BULL('Never make a user say the same thing twice.', ' Every repeated question is an exit point. Continuity between screens is not polish; it is conversion.'),
  BULL('Silence is the worst failure mode.', ' A dead button teaches a user that the app is broken and they cannot fix it. Every failure now says what happened and what to do.'),
  BULL('Emotional moments matter more here, not less.', ' For someone who has waited on work that never came, the arrival of a job is the product. Sound, haptics and celebration are functional.'),
  BULL('Trust must be visible at a glance.', ' Verification badges and reputation scores have to survive every layout, on every screen size. A trust signal that is clipped is worse than no trust signal.'),

  SPACER(140),
  H2('3.4 External validation plan'),

  P('Field validation runs from August to November 2026, structured to answer specific questions rather than to collect general approval. We have deliberately designed it to be able to disprove our assumptions.'),

  TBL(
    ['Activity', 'Participants', 'Method', 'The question it answers'],
    [
      ['Worker discovery interviews', '15–20 informal skilled workers across at least four parishes, spanning trades and personal services',
       'Semi-structured 45-minute interviews, in person',
       'How do workers currently get found, and what would make them trust a platform with their identity documents?'],
      ['Moderated usability testing', '10–12 workers, deliberately including low-digital-confidence participants',
       'Task-based testing on the participant’s own phone; think-aloud; time-on-task and completion rate recorded',
       'Can a worker complete onboarding, verification and the first formalization stage unaided?'],
      ['Customer and SME testing', '10–15 households plus 5–8 SMEs, including at least two tourism operators',
       'Task-based booking tests plus interviews',
       'Does search return what a customer actually meant, and is the trust signal sufficient to book a stranger?'],
      ['Formalization comprehension study', '10 workers who have never registered a business',
       'Read-aloud of the pathway; comprehension questions; intent-to-proceed rating before and after',
       'Does the pathway actually make registration feel achievable, or only make it look tidier?'],
      ['BizBot answer audit', 'A tax practitioner and a business-registration adviser',
       'Blind review of 40 answers scored for accuracy, completeness and citation quality',
       'Is BizBot safe to put in front of a worker making a real financial decision?'],
      ['Stakeholder consultations', 'HEART/NSTA Trust, Companies Office of Jamaica, Tax Administration Jamaica, a credit union or microfinance lender, and a parish-level business association',
       'Structured consultations and a walkthrough of the prototype',
       'Where does MyB fit alongside existing programmes, and what would a lender need before treating reputation as credit evidence?'],
      ['Closed pilot', '30–50 workers and 100+ customers in one parish',
       'Six-week live pilot with instrumentation and weekly check-ins',
       'Do real bookings complete, do reputation scores behave sensibly, and does anyone actually formalize?'],
    ],
    [1800, 2400, 2380, 2780],
    { boldFirstCol: true, size: 18 },
  ),

  SPACER(160),
  H3('What we will measure, and what would count as failure'),

  TBL(
    ['Measure', 'Target', 'What it tells us'],
    [
      ['Unaided onboarding completion', '≥ 80% of workers reach a live profile without help', 'Whether the product is usable by the people it is for'],
      ['Verification completion', '≥ 70% of workers who start identity verification finish it', 'Whether the trust gate is acceptable or is driving people away'],
      ['Search satisfaction', '≥ 85% of queries return a professional the customer judges relevant', 'Whether the language-first approach genuinely works'],
      ['Booking completion', '≥ 60% of accepted jobs reach completed with a review', 'Whether the loop closes off-platform as well as on it'],
      ['BizBot accuracy', '≥ 95% of audited answers rated accurate and correctly cited', 'Whether the assistant is safe to ship'],
      ['Formalization intent lift', 'Measurable increase in intent-to-register after the pathway walkthrough', 'Whether the core thesis of the product holds'],
    ],
    [2600, 3400, 3360],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(140),

  ...CALLOUT([
    [['We have written the metric we would most like to be wrong about. ', { bold: true, color: '8A5F05' }],
     ['If the formalization intent lift does not materialise, the thesis that visibility and reputation create genuine demand for formalization is weakened, and we would rather find that out in a parish pilot with fifty workers than after a national launch. The pilot is designed to surface it.']],
  ]),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 4. BUSINESS MODEL & MARKET VIABILITY
// ═════════════════════════════════════════════════════════════════════════════
const s4 = [
  H1('4. Business Model and Market Viability'),

  H2('4.1 The market'),

  P('Jamaica’s labour force is approximately 1.3 million people, of whom around 55 percent work informally — roughly 715,000 people generating an estimated 40 percent of national GDP. Jamaica has the highest informal share of GDP in CARICOM, estimated at 35 to 44 percent. This is not a niche. It is the larger half of the working population.'),

  TBL(
    ['Market layer', 'Size', 'Basis'],
    [
      ['Total addressable market', '~715,000 informal workers in Jamaica', '55% of a ~1.3 million labour force (STATIN, ILO)'],
      ['Serviceable available market', '~250,000 skilled service providers', 'Our estimate of smartphone-reachable workers in trades, personal services, care, tutoring, transport and repair — to be tested in the validation phase'],
      ['Serviceable obtainable market (3 years)', '~25,000 active workers', 'A deliberately conservative 10% of the serviceable market, reached parish by parish rather than nationally at once'],
      ['Demand side', 'Jamaican households and SMEs, plus the tourism accommodation sector', 'Every household hires informal labour. Villas, guesthouses and short-lets run on it entirely.'],
    ],
    [2500, 2600, 4260],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H3('Why the existing options do not close this gap'),

  BULL('Facebook, WhatsApp and Instagram groups', ' carry the demand today, and carry no verification, no reputation, no searchability and no record. Reputation dies with the group.'),
  BULL('Fiverr, Upwork and Freelancer', ' are built for remote digital work priced in US dollars. They are structurally incapable of serving a plumber in Spanish Town.'),
  BULL('Local job boards — Make The Link JA, IKONWORK, eJAMJobs, Just876, Marketplace Jamaica', ' are listing directories: they help you find a name. They do not verify identity, compute reputation, or connect the work to formalization.'),
  BULL('Government registration systems', ' are destinations, not journeys. They assume you already know you should register, what to register as, and in what order.'),
  BULL('LinkedIn', ' is a professional network for people whose professions already have digital records. It has no answer for a seamstress.'),

  P('Nobody is competing for this position. The gap MyB occupies is not a better listing site — it is the connection between discovery, verified reputation, and a pathway into the formal economy. That connection is the product, and it is the thing that is hard to copy.'),

  SPACER(140),
  H2('4.2 Business Model Canvas'),

  TBL(
    ['Block', 'MyB'],
    [
      ['Customer segments',
       'Primary: informal skilled workers — tradespeople, hairdressers, cooks, seamstresses, tutors, caregivers, drivers, phone-repair technicians. Secondary: households hiring them; SMEs and tourism operators sourcing verified labour. Tertiary: lenders, insurers, training institutions and government agencies needing reliable data on this workforce.'],
      ['Value propositions',
       'To the worker: be found, be trusted, be bankable — and be guided into the formal economy on terms that pay you back. To the customer: hire a stranger with confidence, in under a minute. To institutions: a verified, structured view of a workforce that has always been dark.'],
      ['Channels',
       'Direct mobile app (Android first). Parish-level community and church networks, hardware stores and beauty supply outlets, HEART/NSTA graduate cohorts, market associations. Worker referral — the strongest channel in this market is a worker who got paid because of you.'],
      ['Customer relationships',
       'Self-service with heavy in-product guidance. BizBot as an always-available business adviser. Human support at the verification and formalization steps, where trust is decided.'],
      ['Revenue streams',
       'Worker Pro subscription; SME and tourism business accounts; revenue share on completed formalization services; permissioned reputation reporting to lenders; anonymised labour-market analytics for institutions and development partners. Explicitly not advertising, and explicitly not a commission on the worker’s job.'],
      ['Key resources',
       'The reputation dataset and the trust graph built on top of it — the compounding asset. The verified-worker network. The Jamaican formalization knowledge base. The trade taxonomy with its colloquial synonyms. A three-person team that has shipped a comparable trust-and-identity product before.'],
      ['Key activities',
       'Worker acquisition and verification, knowledge-base curation and accuracy auditing, reputation and fraud model maintenance, formalization partnerships, and per-country content for regional expansion.'],
      ['Key partnerships',
       'HEART/NSTA Trust (skills credentialing pipeline). Companies Office of Jamaica and Tax Administration Jamaica (authoritative content, then integration). Credit unions, microfinance institutions and insurers (reputation as credit evidence). Tourism associations and property managers (demand). Development partners — IDB, CDB, PIOJ — for pilot funding and data partnership.'],
      ['Cost structure',
       'Today: US$0 per month — every component on a free tier. At scale: managed database and storage, language-model inference, push delivery, identity-verification compute, plus field operations for worker onboarding and support, which is the largest line and the one that scales with people rather than servers.'],
    ],
    [2100, 7260],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H2('4.3 Revenue model'),

  P('One decision defines this model, and we made it early: MyB does not take a commission on the worker’s job.'),

  P('Commission models fail in informal markets, and they fail for a structural reason rather than a pricing one. The work is agreed on the platform and paid in cash at the gate. A platform that demands a percentage of a transaction it cannot see teaches workers to complete the deal off-platform, which destroys exactly the data the platform exists to create. So we monetise visibility, credentials and data — never the transaction. The worker keeps every dollar they earn. That is a commercial decision as much as an ethical one: it is what keeps the reputation dataset complete, and the reputation dataset is the asset.'),

  TBL(
    ['Stream', 'Model', 'Notes'],
    [
      ['Worker Pro subscription', 'Freemium. Free tier permanently usable. Pro at approximately JMD 1,200/month.',
       'Pro adds boosted placement, unlimited portfolio, early access to matching requests, and advanced earnings analytics. The free tier must remain genuinely useful — a worker who cannot afford Pro is still the point of the product.'],
      ['Business and tourism accounts', 'Approximately JMD 8,000/month per business.',
       'Multi-site job posting, saved verified-workforce pools, procurement-ready records of who did what and when. This is the fastest revenue to reach because the willingness to pay already exists.'],
      ['Formalization services', 'Revenue share with partner accountants, registration agents and business-support providers on completed registrations.',
       'Monetises the moment of highest value to the worker, and only when the worker actually completes something.'],
      ['Reputation reporting', 'Per-report or subscription, paid by the lender or insurer. Always permissioned by the worker.',
       'The long-term high-margin asset. It requires the dataset to exist first — which is why years one and two are about coverage, not extraction.'],
      ['Institutional analytics', 'Contracts with development partners, training institutions and government agencies.',
       'Anonymised, aggregated labour-market intelligence: which trades are in demand, where, at what price. Currently unavailable to anyone at any price.'],
    ],
    [1900, 3100, 4360],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(140),
  H3('An illustrative path to sustainability'),

  P('The figures below are a model with stated assumptions, not a forecast. They exist to show that the model closes on plausible numbers — and the assumptions are exactly what the pilot is designed to test.'),

  TBL(
    ['', 'Year 1', 'Year 2', 'Year 3'],
    [
      ['Active workers', '2,500 (one to two parishes)', '10,000', '25,000'],
      ['Pro conversion', '5%', '10%', '15%'],
      ['Business accounts', '20', '120', '400'],
      ['Approximate annual revenue', 'JMD 3.7M', 'JMD 26M', 'JMD 92M'],
      ['Approximate infrastructure cost', 'Under US$100/month', 'Under US$600/month', 'Under US$2,000/month'],
      ['Focus', 'Coverage and proof', 'Density and retention', 'Institutional revenue and regional entry'],
    ],
    [2340, 2340, 2340, 2340],
    { boldFirstCol: true, size: 19 },
  ),

  P([run('Assumptions: ', { size: 20, bold: true, color: NAVY }),
     run('Pro at JMD 1,200/month, business accounts at JMD 8,000/month, formalization and reputation revenue excluded entirely from these figures as upside. Approximately JMD 155 = US$1. The infrastructure cost line is the point: this platform reaches meaningful scale before hosting becomes a material expense, because the architecture was designed around that constraint rather than adapted to it.',
         { size: 20, color: GREY })], { after: 200 }),

  H2('4.4 SWOT analysis'),

  TBL(
    ['Strengths', 'Weaknesses'],
    [
      ['• A working, demonstrable product — not a concept\n• Zero operating cost, so runway is not a survival constraint\n• Three genuinely integrated subsystems, not one feature with two labels\n• Team has shipped a comparable identity-verification product before (eLife)\n• Deep local knowledge: the search understands how Jamaicans actually describe work\n• Architecture designed for regional replication from day one',
       '• No external user validation completed yet — scheduled, not done\n• Two-sided marketplace: needs workers and customers simultaneously\n• Verification threshold not yet calibrated against a held-out dataset\n• No payments, so the transaction record depends on both parties confirming\n• Three-person team; field operations will need people we do not yet have'],
      ['Opportunities', 'Threats'],
      ['• No incumbent occupies discovery + reputation + formalization together\n• Government and development-partner appetite for formalization data is real and funded\n• Financial institutions actively seeking alternative credit data for the unbanked\n• Tourism operators have an unmet, immediate need for verified labour\n• HEART/NSTA graduate pipeline is a ready-made acquisition channel\n• CARICOM expansion is a content exercise, not a rebuild',
       '• A well-funded regional or international marketplace entering the space\n• Worker distrust of anything resembling tax surveillance — the single biggest adoption risk\n• Free-tier terms changing under us\n• Data-protection obligations around biometric data are strict, and rightly so\n• Disintermediation: parties transacting off-platform after the first job'],
    ],
    [4680, 4680],
    { size: 19, subHeaders: [1] },
  ),

  SPACER(160),
  H2('4.5 Strategic recommendations'),

  NUML('Lead with the worker, never with formalization.', ' The product’s reason to exist, in the worker’s eyes, is that it gets them work. Formalization must be earned into the conversation after the platform has already paid them. A product that opens by talking about tax will not be installed twice.', 'numsR'),
  NUML('Win one parish completely before touching a second.', ' A marketplace is worthless at 10 percent density and self-sustaining at 60 percent. Depth first, geography second.', 'numsR'),
  NUML('Sign a financial institution early, even without revenue.', ' A single credit union publicly accepting MyB reputation as supporting evidence transforms the pitch to workers from "be visible" to "get a loan". That partnership is worth more than the subscription revenue in year one.', 'numsR'),
  NUML('Treat trust as the product and defend it accordingly.', ' Publish the reputation weights. Keep fraud flags invisible to the flagged. Never let a paid tier buy a better score — boosted placement, yes; a manipulated reputation, never. The moment reputation is purchasable, the asset is worthless.', 'numsR'),
  NUML('Build the government relationship before needing the integration.', ' Direct integration with the Companies Office and Tax Administration Jamaica is correctly out of MVP scope, but the relationship that makes it possible takes longer to build than the code does. Start it during the pilot.', 'numsR'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 5. PROTOTYPE & FUNCTIONALITY
// ═════════════════════════════════════════════════════════════════════════════
const s5 = [
  H1('5. Prototype and Functionality'),

  P('The prototype is a working two-sided application. This section states plainly what runs today, how it feels to use, and what we have deliberately not built.'),

  H2('5.1 What is built and working'),

  TBL(
    ['Area', 'Working today'],
    [
      ['Accounts and onboarding',
       'Animated onboarding carousel, email sign-up with password strength feedback, role selection (customer or worker), and a role-aware interface throughout — a worker and a customer see genuinely different applications.'],
      ['Discovery',
       'Plain-language search across 48 trades with colloquial synonyms; demand-ranked category browsing; filtering by parish, rating and availability; ranked results showing verification, reputation, distance, rate range and completed jobs.'],
      ['Worker profiles',
       'Portfolio-style profiles with cover image, avatar, headline, multiple skills, rate ranges, image portfolio, review history and a transparent reputation record showing the score’s components.'],
      ['Booking',
       'Request a job with description, photos, budget and urgency; the draft carries from search to booking; automatically generated job titles; a four-stage progress tracker shared by both parties.'],
      ['Realtime work delivery',
       'New requests arrive on the worker’s device over websockets as an in-app banner with sound and haptics, wherever they are in the app. Accept with a full-screen celebration; decline with a red sweep.'],
      ['Messaging',
       'Per-job chat threads with image attachments, job cards, read state and realtime delivery.'],
      ['Worker dashboard and earnings',
       'Jobs booked and worked this month, lifetime completions, earnings this month and all time, rating, response rate and repeat-customer count — all computed from the worker’s live record.'],
      ['Reputation and fraud',
       'Automatic recomputation on every review and completion, with the score’s components stored and displayed. Three heuristic fraud checks run on the same trigger; flags are admin-only.'],
      ['Identity verification',
       'Consent, ID capture and embedding, an on-device active liveness challenge, frontal capture, and server-side cosine matching against the stored ID embedding. In Expo Go the liveness step runs in a clearly-labelled demo mode; the full challenge requires the development build.'],
      ['Formalization pathway',
       'A four-stage journey with a readiness questionnaire, per-stage progress, per-step detail with cost and working-day estimates, official source links, and a checklist keyed to trade and parish.'],
      ['BizBot',
       'Grounded question answering with citations over a curated Jamaican knowledge base, saved and titled conversations, business tips, and answers about the worker’s own numbers drawn directly from their record.'],
      ['Demonstration dataset',
       '233 accounts, 221 worker profiles, 48 trades, 1,126 historical jobs with reviews and computed reputation scores, and 30 knowledge-base passages — seeded so the product demonstrates as a populated market rather than an empty shell.'],
    ],
    [2200, 7160],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H2('5.2 The demonstration'),

  P('The live demonstration runs on two phones so the realtime path is visible rather than described.'),

  NUML('Open the market.', ' The home screen opens onto real professionals near you and categories ranked by genuine demand — not an empty search box. The product proves it has a market in the first two seconds.', 'numsD'),
  NUML('Search in plain language.', ' Type "mi sink a leak under di counter". Plumbers are returned, ranked, with verification, reputation, distance and rates. No AI key is required for this to work, and we will demonstrate it with the key removed.', 'numsD'),
  NUML('Open a professional.', ' A portfolio-style profile: work photos, reviews, completed jobs, verified badge, and a reputation record that shows how the score was calculated rather than asserting a number.', 'numsD'),
  NUML('Book.', ' Attach a photo, set a budget, confirm. The details already given are carried forward, not re-asked.', 'numsD'),
  NUML('Watch the second phone.', ' The request lands on the worker’s device in real time — banner, sound, haptic. Accept, and the celebration fires on one phone while the customer’s tracker advances on the other.', 'numsD'),
  NUML('Complete and review.', ' Mark the job complete, leave a rating, and watch the worker’s reputation score and dashboard update immediately, because a database trigger recomputed both.', 'numsD'),
  NUML('Ask BizBot.', ' "What records should I keep?" returns a grounded, cited answer. "How many jobs did I book this month?" returns the exact figure from the worker’s own record — which never reached a language model.', 'numsD'),
  NUML('Walk the pathway.', ' Open the formalization journey: four stages, what each unlocks, real costs and timelines, and the single next step. This is the feature the whole product is built to deliver.', 'numsD'),

  new Paragraph({ children: [new PageBreak()] }),
  H2('5.3 User experience and interaction'),

  P('The interface is designed for someone who may be using their first structured app, on a mid-range phone, possibly in poor light, possibly in a hurry, and quite possibly sceptical that this will work.'),

  BULL('Plain language everywhere.', ' "Find a pro", not "service discovery". "Your pathway", not "formalization module".'),
  BULL('Always a way out and always a way home.', ' A back control on every screen, a swipe-anywhere sidebar, and a home route from anywhere.'),
  BULL('Nothing is ever lost.', ' Drafts persist across navigation and restart.'),
  BULL('Never a silent failure.', ' Every slow operation shows progress; every failure says what happened and what to do next.'),
  BULL('Motion with a purpose.', ' Celebration on accept, a red sweep on decline, a progress rail that visibly advances. These carry meaning for users who read interfaces by feel rather than by label.'),
  BULL('Light and dark throughout.', ' Both themes are fully supported, on every screen, because outdoor daylight and a dark room are both normal working conditions.'),
  BULL('Trust surfaced at every decision point.', ' Verification badges, reputation scores and completed-job counts appear wherever a customer chooses — and they are what the whole product is selling.'),

  ...FIG('formalization-pathway.png', 'Figure 2 — The formalization pathway: deterministic, opt-in, and framed around what each stage unlocks.', 6.4),

  H2('5.4 Technical feasibility, demonstrated'),

  P('Feasibility is not an argument in this submission; it is an observation. The system exists, and the difficult parts are the ones that already work.'),

  BULL('The hard problems are solved, not deferred.', ' Realtime delivery, row-level security, geospatial ranking, grounded retrieval with citations, computed reputation with fraud heuristics, and a two-gate verification pipeline are all implemented and running.'),
  BULL('Every migration is proven from scratch.', ' The database can be rebuilt from zero and behaves identically — verified on a purpose-built harness, including adversarial checks that the wrong user is refused by the database.'),
  BULL('There is no single point of failure on any core path.', ' We can demonstrate the product with the language-model keys removed and the Python service stopped, and every core journey still completes.'),
  BULL('It costs nothing to run.', ' The entire platform sits on free tiers today, and the paid upgrade path is a configuration change rather than a re-architecture.'),
  BULL('The team has done this before.', ' eLife delivered government ID verification, facial recognition, liveness and deepfake detection for Jamaican pensioners on free and open-source technology. MyB’s verification pipeline is built on that experience rather than on a tutorial.'),

  SPACER(140),
  H2('5.5 How the prototype addresses the need'),

  TBL(
    ['The problem, from Phase 1', 'What the prototype does about it'],
    [
      ['Invisibility — skilled workers cannot be found beyond word of mouth, so income depends on who happens to know your name.',
       'A searchable, verified profile discoverable by anyone in the parish, ranked by relevance and proximity rather than by who shouted loudest. Search understands how customers actually describe problems, so a worker is found by people who do not know the trade name.'],
      ['Untrusted trust — reputation is verbal, non-portable, and dies with the group chat.',
       'A computed reputation score with transparent components, recalculated automatically, owned by the worker and portable across the platform. Backed by identity verification and three live fraud heuristics.'],
      ['Formalization as friction — registration is a maze that is easier to avoid than to attempt.',
       'A four-stage pathway with real costs and timelines, one clear next step, an assistant that answers the questions that arise along the way from official sources, and framing built entirely around what each stage unlocks. Offered when the worker’s record shows readiness, and never imposed.'],
      ['No economic record — no bank, insurer or agency has any basis on which to serve this workforce.',
       'Every completed job, review and reputation recalculation builds a structured, timestamped record of income-generating activity — designed from the outset to be readable by a lender, with the worker’s permission.'],
    ],
    [3700, 5660],
    { size: 19 },
  ),

  SPACER(160),
  H3('What we deliberately did not build'),

  P('Scope discipline is why the parts that exist are finished. The following are on the roadmap and were consciously excluded from the MVP, not overlooked:'),

  BUL('In-app payments — they would change the regulatory posture of the product entirely, and the commission model they imply is one we have rejected on principle.'),
  BUL('Live integrations with Tax Administration Jamaica or the Companies Office — the relationships that make these possible take longer to build than the code, and we would rather ship correct guidance now than a broken integration.'),
  BUL('Machine-learning matching and fraud models — we have neither the volume of data to train them nor a problem the deterministic versions fail to solve. Adding them now would cost explainability and buy nothing.'),
  BUL('Multi-country data — the architecture supports it and the MVP does not use it, because a shallow presence in five markets is worth less than a deep one in Jamaica.'),

  SPACER(140),
  H2('5.6 Future development and scalability'),

  TBL(
    ['Horizon', 'What we build'],
    [
      ['Immediate (Aug–Nov 2026)',
       'Field validation and the closed parish pilot. Threshold calibration for face matching against a held-out set. Independent expert audit of BizBot answers. Play Store release. Knowledge-base expansion driven by the questions workers actually ask.'],
      ['Near term (2027)',
       'Machine-learning ranking trained on real booking outcomes, once there are outcomes to train on. Behavioural fraud models layered over the heuristics. Offline-first sync for low-connectivity areas. Skills credentialing integrated with HEART/NSTA. The first permissioned reputation reports issued to a lending partner.'],
      ['Medium term (2027–2028)',
       'Direct integration with the Companies Office and Tax Administration Jamaica, turning the checklist into an in-app filing. Payment rails, once the regulatory position is settled and without a commission on the worker’s job. Insurance products priced against reputation. An institutional analytics product.'],
      ['Regional (2028+)',
       'Trinidad and Tobago, Guyana and Barbados. Each launch is a new knowledge base, a new checklist and a new trade taxonomy — configuration, not a rebuild — and each can be authored by a local partner.'],
    ],
    [2200, 7160],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),
  H3('Scaling characteristics'),

  BULL('The database is the bottleneck, and that is the point.', ' Postgres scales vertically a very long way before anything needs re-architecting, and Supabase Pro is a configuration change.'),
  BULL('Search costs nothing per query.', ' Full-text and trigram indexes scale with the dataset, not with a per-call API bill. This is why discovery stays free as the market grows.'),
  BULL('Language-model cost scales with questions, not with users.', ' Most sessions never ask BizBot anything, and grounded answers are short. Caching common questions cuts it further.'),
  BULL('Face verification scales horizontally and runs once per worker.', ' It is a stateless embedding service on a one-time-per-user path — the cheapest possible shape for that workload.'),
  BULL('Regional expansion adds content, not infrastructure.', ' Country-tagged knowledge, configured checklists, data-driven taxonomy. A second country is a content programme with a launch date, not an engineering project with a risk register.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ═════════════════════════════════════════════════════════════════════════════
// 6. ACCESS / 7. TEAM / REFERENCES
// ═════════════════════════════════════════════════════════════════════════════
const s6 = [
  H1('6. Accessing the Prototype'),

  P('The application runs in Expo Go from a QR code — no build step, no installation of a development environment, and no cost to the person testing it.'),

  TBL(
    ['Item', 'Detail'],
    [
      ['Demo video', '[link to be inserted before submission]'],
      ['Live prototype', 'Expo Go — scan the QR code provided with this submission. Android 8.0+ or iOS 15+.'],
      ['Source repository', '[repository link — access provided to the judging panel on request]'],
      ['Demonstration accounts', 'Worker and customer accounts are pre-seeded with realistic history. Credentials are supplied separately with the demo link rather than printed in this document.'],
      ['Full-feature build', 'An Android development build enabling the on-device liveness challenge is available on request.'],
    ],
    [2200, 7160],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(140),

  ...CALLOUT([
    [['A note on the demonstration data. ', { bold: true, color: NAVY }],
     ['The 233 accounts, 1,126 jobs and their reviews are synthetic, seeded specifically so the prototype demonstrates as a functioning market rather than an empty application. Every score, ranking and statistic shown in the demonstration is computed live from that data by the same functions that would run in production — nothing in the interface is mocked or hardcoded.']],
  ], TINT, BLUE),

  H1('7. The Team'),

  P('Team Bit-by-Bit is three University of the West Indies Computer Science graduates who have shipped a socially critical trust-and-identity product together before.'),

  TBL(
    ['Member', 'Role', 'Delivered in Phase 2'],
    [
      ['Abishua Johnson', 'Backend Developer & AI Engineer (Team Lead). BSc Computer Science, class Valedictorian, with an emphasis on AI and government systems; formerly interned at Carisurg UK on algorithms for robotic minimally invasive surgery.',
       'The AI service (face embedding and matching), BizBot retrieval and grounding, the matching and reputation scoring functions, and the fraud heuristics.'],
      ['Joel Dixon', 'Backend Developer & Systems Architect. BSc Computer Science, First Class Honours; Huawei Seeds for the Future 2025.',
       'The database schema and all 22 migrations, row-level security policies, PostGIS and pgvector setup, the API structure, and scalability planning.'],
      ['Emani Longmore', 'Product Designer & Frontend Developer. BSc Computer Science, First Class Honours, with an emphasis on Business Analysis and Product Design.',
       'The Expo application, the design system, onboarding, the liveness interface, the formalization journey experience, and accessibility for low-digital-literacy users.'],
    ],
    [1700, 4030, 3630],
    { boldFirstCol: true, size: 19 },
  ),

  SPACER(160),

  P([run('A shared foundation. ', { size: 22, bold: true, color: NAVY }),
     run('Before MyB, the three of us built eLife — an application that digitised the proof-of-life process for Jamaican pensioners, integrating government ID verification, facial recognition, liveness detection and deepfake detection, delivered entirely on free and open-source technology to production standards. That project is why MyB’s verification pipeline separates liveness from matching, why it stores embeddings rather than images, and why consent comes before capture. We have built trust infrastructure for a vulnerable population before, and we brought those decisions with us.',
        { size: 22, color: INK })]),

  SPACER(200),

  ...CALLOUT([
    [['Where we are. ', { bold: true, color: GREEN }],
     ['Phase 1 argued that Jamaica’s informal skilled workforce is economically essential and digitally invisible, and that visibility, portable reputation and a pathway to formalization would change that. Phase 2 built it: a working application, on free infrastructure, that a worker in Spanish Town could install this afternoon. What remains is not invention — it is validation, a parish pilot, and the partnerships that turn a reputation score into a loan. Mind yuh business.']],
  ], 'EAF7F1', '0F8A5F'),

  new Paragraph({ children: [new PageBreak()] }),

  H1('References'),

  ...[
    'International Labour Organization. (2023). World employment and social outlook: Trends 2023. ILO. https://www.ilo.org/global/research/global-reports/weso/WCMS_865332/lang--en/index.htm',
    'International Labour Organization. (2024). Informal employment in Latin America and the Caribbean. ILO. https://www.ilo.org/americas',
    'Inter-American Development Bank. (2022). The informal economy in Latin America and the Caribbean: Structure, measurement and policy. IDB. https://publications.iadb.org',
    'Statistical Institute of Jamaica. (2023). Labour force survey: Annual report 2023. STATIN. https://www.statinja.gov.jm',
    'World Bank. (2023). Jamaica economic monitor: Strengthening resilience. World Bank Group. https://www.worldbank.org/en/country/jamaica',
    'Planning Institute of Jamaica. (2022). Economic and social survey Jamaica 2022. PIOJ. https://www.pioj.gov.jm',
    'Caribbean Development Bank. (2023). Caribbean economic review 2023. CDB. https://www.caribank.org',
    'HEART/NSTA Trust. (2023). Annual report 2022–2023. HEART/NSTA Trust. https://www.heart-nsta.gov.jm',
    'Tax Administration Jamaica. (2023). Self-employment and business registration guidelines. TAJ. https://www.jamaicatax.gov.jm',
    'Companies Office of Jamaica. (2023). Business registration procedures and requirements. COJ. https://www.orcjamaica.com',
    'Government of Jamaica. (2020). The Data Protection Act, 2020. Ministry of Justice. https://moj.gov.jm',
    'Ministry of Labour and Social Security. (2023). National Insurance Scheme: Self-employed contributors. MLSS. https://www.mlss.gov.jm',
  ].map((r) => NUM(r, 'numsRef')),
];

// ═════════════════════════════════════════════════════════════════════════════
// DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
      children: [
        run('myB', { size: 19, bold: true, color: NAVY }),
        run('  |  ', { size: 19, color: RULE }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 19, color: GREY }),
      ],
    }),
  ],
});

const doc = new Document({
  features: { updateFields: true },
  creator: 'Team Bit-by-Bit',
  title: 'myB (Mind Yuh Business) — CANTO Innovation Challenge 2026 Phase 2 Submission',
  description: 'Phase 2 submission document for the CANTO Innovation Challenge 2026.',
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, color: INK } },
      heading1: { run: { font: FONT, size: 34, bold: true, color: NAVY } },
      heading2: { run: { font: FONT, size: 26, bold: true, color: BLUE } },
      heading3: { run: { font: FONT, size: 23, bold: true, color: INK } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 340, hanging: 200 } } },
        }],
      },
      ...['nums', 'nums2', 'numsF', 'numsD', 'numsR', 'numsRef'].map((reference) => ({
        reference,
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 260 } } },
        }],
      })),
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1180, right: 1440, bottom: 1080, left: 1440, footer: 560 },
        },
      },
      footers: { default: footer },
      children: [...cover, ...toc, ...exec, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || path.join(OUT_DIR, 'Bit-by-Bit_MyB_Phase2.docx');
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
});
