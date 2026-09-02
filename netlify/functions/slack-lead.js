// This runs on Netlify's servers, not in the browser — so none of the
// browser-side problems we hit (CORS, ad blockers, Safari's tracking
// prevention) apply here. It receives the lead from the form, then makes
// its own server-to-server request to Slack, exactly like the Terminal
// curl command that worked earlier in testing.
//
// IMPORTANT: the webhook URL is read from an environment variable
// (SLACK_WEBHOOK_URL), set in the Netlify dashboard — never hardcoded here.
// This repo is public, and GitHub's secret scanning automatically detects
// and kills any Slack webhook URL committed in plain text within moments
// of the push. That's what killed the last two webhooks instantly. Keeping
// the real value out of the code entirely is the fix.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
  if (!SLACK_WEBHOOK_URL) {
    return { statusCode: 500, body: 'SLACK_WEBHOOK_URL environment variable is not set in Netlify' };
  }

  let lead;
  try {
    lead = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Turns a phone number into a tappable Slack link that opens the phone
  // dialer on mobile (Slack's <tel:...|display text> link syntax). Keeps
  // whatever formatting the lead typed as the display text, but builds a
  // clean E.164-ish number for the actual tel: link. Assumes US numbers
  // (10 digits, or 11 starting with 1) since that's this business's market.
  function formatPhone(phone) {
    if (!phone) return 'Not provided';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return phone;
    let e164;
    if (digits.length === 10) e164 = '+1' + digits;
    else if (digits.length === 11 && digits.startsWith('1')) e164 = '+' + digits;
    else e164 = '+' + digits;
    return `<tel:${e164}|${phone}>`;
  }

  const formLabel = lead.which === 'hero' ? 'top form' : 'bottom form';
  const text = [
    `*New lead from the ${formLabel}*`,
    `*Service:* ${lead.service || 'Not specified'}`,
    `*Name:* ${lead.name || 'Not provided'}`,
    `*Phone:* ${formatPhone(lead.phone)}`,
    `*Address:* ${lead.address || 'Not provided'}`,
    `*Notes:* ${lead.notes || 'Not provided'}`,
  ].join('\n');

  try {
    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!slackResponse.ok) {
      const errText = await slackResponse.text();
      return { statusCode: 502, body: 'Slack rejected the message: ' + errText };
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    return { statusCode: 500, body: 'Failed to reach Slack: ' + err.message };
  }
};
