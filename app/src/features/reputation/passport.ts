import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface PassportData {
  name: string;
  headline: string;
  parish: string;
  score: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  identityVerified: boolean;
  memberSince: string | null;
  calculatedAt: string | null;
  components: {
    review?: number;
    completion?: number;
    response?: number;
    disputes?: number;
  };
}

const COMPONENTS: { key: keyof PassportData['components']; label: string; weight: number; explain: string }[] = [
  { key: 'review', label: 'Review quality', weight: 40, explain: 'Average rating across verified reviews' },
  { key: 'completion', label: 'Completion rate', weight: 25, explain: 'Jobs finished after being accepted' },
  { key: 'response', label: 'Response time', weight: 20, explain: 'Requests answered within 24 hours' },
  { key: 'disputes', label: 'Clean record', weight: 15, explain: 'Absence of upheld disputes' },
];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pct = (v: number | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-JM', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The reputation record as a document, not a text message.
 *
 * The old export was `Share.share({ message })` — nine lines of plain text.
 * That is fine for a group chat and useless for the thing this feature exists
 * to do: hand a loan officer, a landlord or a procurement manager something
 * that reads as evidence. A worker with no payslip and no bank statement needs
 * a document, and "portable reputation" that arrives as an SMS is not portable
 * in any sense that matters.
 *
 * Rendered as HTML and printed to PDF on-device. No server, no cost, nothing to
 * deploy, and it works in Expo Go — expo-print and expo-sharing are both part
 * of the SDK.
 *
 * Every number here is computed by Postgres and shown with its weight, because
 * the credibility of the document rests on it being checkable rather than
 * flattering.
 */
export function passportHtml(data: PassportData): string {
  const rows = COMPONENTS.map((c) => {
    const raw = data.components[c.key];
    const width = raw == null ? 0 : Math.round(raw * 100);
    return `
      <tr>
        <td class="cname">
          <div class="clabel">${esc(c.label)}</div>
          <div class="cexplain">${esc(c.explain)}</div>
        </td>
        <td class="cweight">${c.weight}%</td>
        <td class="cbar">
          <div class="track"><div class="fill" style="width:${width}%"></div></div>
        </td>
        <td class="cscore">${pct(raw)}</td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
         color: #22303C; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #1D6FD8; padding-bottom: 14px; }
  .brand { font-size: 30px; font-weight: 800; color: #0F3E85; letter-spacing: -0.5px; }
  .brand span { color: #1D6FD8; }
  .doc { text-align: right; font-size: 11px; color: #5A6672; line-height: 1.6; }
  .title { font-size: 13px; letter-spacing: 1.6px; text-transform: uppercase;
           color: #5A6672; margin: 26px 0 4px; font-weight: 700; }
  .name { font-size: 30px; font-weight: 800; color: #0F3E85; margin: 0; }
  .sub { font-size: 14px; color: #5A6672; margin: 4px 0 0; }
  .verified { display: inline-block; margin-top: 10px; font-size: 11px; font-weight: 700;
              padding: 4px 10px; border-radius: 20px; }
  .yes { background: #EAF7F1; color: #0B6B4A; }
  .no  { background: #F1F3F5; color: #5A6672; }

  .scorewrap { display: flex; gap: 14px; margin: 24px 0 8px; }
  .score { flex: 0 0 190px; border: 3px solid #1D6FD8; border-radius: 14px;
           padding: 18px; text-align: center; background: #F4F8FD; }
  .score .n { font-size: 58px; font-weight: 800; color: #0F3E85; line-height: 1; }
  .score .of { font-size: 13px; color: #5A6672; margin-top: 2px; }
  .score .cap { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
                color: #1D6FD8; font-weight: 700; margin-top: 8px; }
  .facts { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fact { border: 1px solid #C6D6EA; border-radius: 10px; padding: 12px 14px; }
  .fact .k { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #5A6672; }
  .fact .v { font-size: 20px; font-weight: 700; color: #22303C; margin-top: 3px; }

  h2 { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; color: #5A6672;
       margin: 26px 0 8px; border-bottom: 1px solid #C6D6EA; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 9px 6px; vertical-align: middle; border-bottom: 1px solid #EDF1F6; font-size: 12px; }
  .clabel { font-weight: 700; }
  .cexplain { font-size: 10px; color: #5A6672; margin-top: 1px; }
  .cweight { width: 52px; text-align: center; color: #5A6672; font-size: 11px; }
  .cbar { width: 34%; }
  .track { background: #EDF1F6; border-radius: 6px; height: 9px; overflow: hidden; }
  .fill { background: #1D6FD8; height: 100%; }
  .cscore { width: 52px; text-align: right; font-weight: 700; }

  .note { margin-top: 22px; background: #F4F8FD; border-left: 4px solid #1D6FD8;
          padding: 12px 14px; font-size: 11px; line-height: 1.65; color: #31404F; }
  .foot { margin-top: 20px; border-top: 1px solid #C6D6EA; padding-top: 10px;
          font-size: 9.5px; color: #8A94A0; line-height: 1.6; }
</style></head>
<body>
  <div class="head">
    <div class="brand">myB<span>.</span></div>
    <div class="doc">
      <strong>Reputation Record</strong><br />
      Issued ${esc(formatDate(new Date().toISOString()))}<br />
      Score calculated ${esc(formatDate(data.calculatedAt))}
    </div>
  </div>

  <div class="title">This record belongs to</div>
  <p class="name">${esc(data.name)}</p>
  <p class="sub">${esc(data.headline || 'Skilled professional')} · ${esc(data.parish || 'Jamaica')}</p>
  <div class="verified ${data.identityVerified ? 'yes' : 'no'}">
    ${data.identityVerified
      ? 'IDENTITY VERIFIED — government ID matched to a live selfie'
      : 'IDENTITY NOT YET VERIFIED'}
  </div>

  <div class="scorewrap">
    <div class="score">
      <div class="n">${data.score.toFixed(0)}</div>
      <div class="of">out of 100</div>
      <div class="cap">Reputation score</div>
    </div>
    <div class="facts">
      <div class="fact"><div class="k">Jobs completed</div><div class="v">${data.jobsCompleted}</div></div>
      <div class="fact"><div class="k">Average rating</div><div class="v">${data.ratingAvg.toFixed(1)} / 5</div></div>
      <div class="fact"><div class="k">Verified reviews</div><div class="v">${data.ratingCount}</div></div>
      <div class="fact"><div class="k">On myB since</div><div class="v" style="font-size:14px">${esc(formatDate(data.memberSince))}</div></div>
    </div>
  </div>

  <h2>How this score is calculated</h2>
  <table>${rows}</table>

  <div class="note">
    <strong>Why this is verifiable.</strong> Every review counted here is tied to a
    job that was requested, accepted and completed through myB by an account that
    is not the worker's own. The score is computed by a fixed formula from those
    records — the weights above are the whole calculation, and no part of it can
    be bought, edited or set by hand. New accounts begin near the middle and move
    only with evidence, so a high score cannot be manufactured quickly.
  </div>

  <div class="foot">
    Issued by myB (Mind Yuh Business) at the request of the person named above, and
    intended to be shared by them. myB records completed work and the reviews
    customers leave for it; it does not verify income, assets or creditworthiness,
    and this document is not a credit reference. Verify a copy by asking the holder
    to generate a fresh record from their myB account.
  </div>
</body></html>`;
}

export type PassportResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed'; message: string };

/**
 * Build the PDF and hand it to the share sheet.
 *
 * Falls back rather than failing: if printing or sharing is not available on
 * this device, the caller is told so it can offer the plain-text summary
 * instead. Same rule as everywhere else in the app — degrade, never break.
 */
export async function shareReputationPassport(data: PassportData): Promise<PassportResult> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: passportHtml(data),
      base64: false,
    });

    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Sharing is not available on this device.',
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Your myB reputation record',
      UTI: 'com.adobe.pdf',
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : 'Could not build the document.',
    };
  }
}
