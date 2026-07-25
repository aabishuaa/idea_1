-- MyB · 0011 — Jamaican reference data
-- Config data the app requires to function (kept in migrations so `db push`
-- provisions every environment identically). Costs/fees are DEV PLACEHOLDERS —
-- verify against current TAJ/COJ/NIS published fees before demo day (see docs/kb).

-- All 14 parishes with approximate centroids (PostGIS: lng first).
insert into public.parishes (country, name, centroid) values
  ('JM', 'Kingston',      st_setsrid(st_makepoint(-76.7832, 17.9714), 4326)::geography),
  ('JM', 'St. Andrew',    st_setsrid(st_makepoint(-76.7500, 18.0333), 4326)::geography),
  ('JM', 'St. Thomas',    st_setsrid(st_makepoint(-76.4000, 17.9500), 4326)::geography),
  ('JM', 'Portland',      st_setsrid(st_makepoint(-76.4500, 18.1500), 4326)::geography),
  ('JM', 'St. Mary',      st_setsrid(st_makepoint(-76.9000, 18.3500), 4326)::geography),
  ('JM', 'St. Ann',       st_setsrid(st_makepoint(-77.2500, 18.3500), 4326)::geography),
  ('JM', 'Trelawny',      st_setsrid(st_makepoint(-77.6000, 18.3500), 4326)::geography),
  ('JM', 'St. James',     st_setsrid(st_makepoint(-77.8939, 18.4762), 4326)::geography),
  ('JM', 'Hanover',       st_setsrid(st_makepoint(-78.1300, 18.4000), 4326)::geography),
  ('JM', 'Westmoreland',  st_setsrid(st_makepoint(-78.1300, 18.2500), 4326)::geography),
  ('JM', 'St. Elizabeth', st_setsrid(st_makepoint(-77.7500, 18.0500), 4326)::geography),
  ('JM', 'Manchester',    st_setsrid(st_makepoint(-77.5000, 18.0500), 4326)::geography),
  ('JM', 'Clarendon',     st_setsrid(st_makepoint(-77.2500, 17.9500), 4326)::geography),
  ('JM', 'St. Catherine', st_setsrid(st_makepoint(-76.9574, 17.9911), 4326)::geography);

insert into public.trades (slug, label, emoji) values
  ('plumbing',        'Plumbing',            '🔧'),
  ('electrical',      'Electrical',          '⚡'),
  ('carpentry',       'Carpentry',           '🪚'),
  ('painting',        'Painting',            '🎨'),
  ('masonry',         'Masonry',             '🧱'),
  ('tiling',          'Tiling',              '◽'),
  ('welding',         'Welding',             '🔥'),
  ('mechanics',       'Auto Mechanics',      '🚗'),
  ('appliance-repair','Appliance Repair',    '🔌'),
  ('landscaping',     'Landscaping',         '🌿'),
  ('ac-refrigeration','AC & Refrigeration',  '❄️'),
  ('roofing',         'Roofing',             '🏠');

-- Readiness questionnaire (FR-BIZ-1) — deterministic points, max 16.
insert into public.questionnaire_items (country, sort_order, question, help_text, options) values
  ('JM', 1, 'Do you have a TRN (Tax Registration Number)?',
   'A TRN is free from Tax Administration Jamaica and is the first step for everything else.',
   '[{"label":"Yes","points":2},{"label":"Not yet","points":0},{"label":"Not sure","points":0}]'),
  ('JM', 2, 'Do you have a bank account you use for work money?',
   'Separating work money makes registration and loans much easier.',
   '[{"label":"Yes","points":2},{"label":"Not yet","points":0}]'),
  ('JM', 3, 'Do you keep any record of jobs and what you earn?',
   'Even a notebook or phone notes count.',
   '[{"label":"Yes, regularly","points":2},{"label":"Sometimes","points":1},{"label":"No","points":0}]'),
  ('JM', 4, 'How long have you been doing this work?',
   '',
   '[{"label":"More than 2 years","points":2},{"label":"1–2 years","points":1},{"label":"Less than a year","points":0}]'),
  ('JM', 5, 'Do you work under a business name?',
   'e.g. "Delroy''s Electrical" instead of just your own name.',
   '[{"label":"Yes","points":2},{"label":"Thinking about it","points":1},{"label":"No","points":0}]'),
  ('JM', 6, 'Would you like to take on bigger jobs (companies, government)?',
   'Formal businesses can bid on contracts that require registration.',
   '[{"label":"Yes","points":2},{"label":"Maybe","points":1},{"label":"No","points":0}]'),
  ('JM', 7, 'Are you interested in loans or financing to grow?',
   'Lenders need proof of income — your MyB reputation and records help here.',
   '[{"label":"Yes","points":2},{"label":"Maybe later","points":1},{"label":"No","points":0}]'),
  ('JM', 8, 'Do you have anyone helping you with jobs?',
   'Hiring helpers formally protects you and them.',
   '[{"label":"Yes, regularly","points":2},{"label":"Sometimes","points":1},{"label":"Just me","points":0}]');

-- Formalization checklist (FR-BIZ-3) — country-wide sequence, with trade-specific
-- steps. Deterministic config; BizBot narrates this, RAG never generates it.
insert into public.checklist_items
  (country, trade_slug, parish, step_order, title, description, agency, documents, est_cost_jmd, est_days) values
  ('JM', null, null, 1, 'Get your TRN',
   'Apply for a Tax Registration Number at any Tax Administration Jamaica office. It''s free and you need it for every other step.',
   'TAJ', '["Government-issued photo ID (or birth certificate)", "Proof of address"]', 0, 1),
  ('JM', null, null, 2, 'Open a bank account for your work',
   'A personal account works to start; a business account after you register your name. Bring your TRN and ID.',
   'Bank / Credit Union', '["TRN", "Photo ID", "Proof of address"]', 0, 1),
  ('JM', null, null, 3, 'Register your business name',
   'Register at the Companies Office of Jamaica (COJ) using the Business Name form (BRF 1). Sole trader registration is the simplest path.',
   'COJ', '["Completed BRF 1 form", "TRN", "Photo ID", "Registration fee"]', 2500, 5),
  ('JM', null, null, 4, 'Register as self-employed with TAJ',
   'Tell TAJ you are self-employed so you can file income tax and get a Tax Compliance Certificate (TCC) later.',
   'TAJ', '["TRN", "Business name certificate (if registered)"]', 0, 3),
  ('JM', null, null, 5, 'Register with NIS',
   'The National Insurance Scheme covers self-employed workers — it builds your pension and injury protection.',
   'NIS (Ministry of Labour)', '["TRN", "Photo ID", "NIS application form"]', 0, 3),
  ('JM', null, null, 6, 'Keep simple monthly records',
   'Track money in, money out, and jobs done — your MyB job history is already evidence of income.',
   '', '["Record book or app"]', 0, null),
  ('JM', null, null, 7, 'Get a Tax Compliance Certificate (TCC)',
   'With your filings in order, request a TCC — many companies and all government contracts require it.',
   'TAJ', '["TRN", "Filed returns"]', 0, 7),
  ('JM', 'electrical', null, 8, 'Get certified as an electrician',
   'A recognized certification (e.g. HEART/NSTA Trust) and registration with the Government Electrical Regulator strengthens the jobs you can legally sign off.',
   'GER / HEART NSTA', '["Proof of training or experience", "Application form"]', null, 30),
  ('JM', 'plumbing', null, 8, 'Get your plumbing certification',
   'A HEART/NSTA Trust certification helps you qualify for commercial and insurance-backed jobs.',
   'HEART NSTA', '["Proof of training or experience"]', null, 30),
  ('JM', 'mechanics', null, 8, 'Certify your garage practice',
   'HEART/NSTA automotive certification plus records of parts sourcing builds customer and insurer trust.',
   'HEART NSTA', '["Proof of training or experience"]', null, 30);

-- Vetted referral partners (FR-BIZ-8) — replace/extend with confirmed partners.
insert into public.partners (country, name, category, description, url) values
  ('JM', 'HEART/NSTA Trust', 'training',
   'National training agency — free and subsidised certification for skilled trades.', 'https://www.heart-nsta.org'),
  ('JM', 'Jamaica Business Development Corporation', 'government',
   'Free advice and support services for micro and small businesses.', 'https://www.jbdc.net'),
  ('JM', 'Companies Office of Jamaica', 'government',
   'Business name and company registration.', 'https://www.orcjamaica.com'),
  ('JM', 'Tax Administration Jamaica', 'government',
   'TRN, tax filing, and Tax Compliance Certificates.', 'https://www.jamaicatax.gov.jm'),
  ('JM', 'Development Bank of Jamaica', 'banking',
   'Financing programmes for micro, small and medium enterprises.', 'https://www.dbankjm.com'),
  ('JM', 'COK Sodality Co-operative Credit Union', 'credit_union',
   'Member-owned savings and small-business loans.', 'https://www.cokcu.com');
