// =====================================================================
// api/extract.js — Vercel Serverless Function: POST /api/extract
// =====================================================================

import crypto from 'crypto';

// ── System prompts ────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {

  coa: `You are a COA (Certificate of Analysis) data extractor for Maduras Herbals.
When given a COA source document, extract and return ONLY a valid JSON object with
this exact structure — no explanation, no markdown fences, just raw JSON:

{
  "product_name": "",
  "botanical_name": "",
  "country_of_origin": "",
  "batch_size": "",
  "batch_no": "",
  "date_of_manufacture": "",
  "date_of_expiry": "",
  "sensory_data": {
    "appearance": "",
    "color": "",
    "odor": "",
    "solubility": ""
  },
  "analytical_data": [
    { "parameter": "", "specification": "", "result": "" }
  ],
  "microbiological_data": [
    { "parameter": "", "specification": "", "result": "" }
  ],
  "doc_no": "",
  "date": ""
}

Rules:
- If a field is not found in the source document, use "N/A"
- analytical_data must always include rows for: Moisture, Total Ash, pH (in 5%),
  Bulk Density g/ml — plus any additional parameters found in the source
- microbiological_data must always include rows for: Total Plate Count,
  Yeast & Mould, E. Coli, Salmonella / 25g
- Return NOTHING except the raw JSON object`,

  msds: `You are an MSDS (Material Safety Data Sheet) data extractor for Maduras Herbals.
When given an MSDS source document, extract and return ONLY a valid JSON object with
this exact structure — no explanation, no markdown fences, just raw JSON:

{
  "product_name": "",
  "inci_name": "",
  "cas_no": "",
  "hazardous_components": "",
  "eye_contact": "",
  "skin_contact": "",
  "ingestion_hazard": "",
  "inhalation_hazard": "",
  "first_aid_eyes": "",
  "first_aid_skin": "",
  "first_aid_ingestion": "",
  "first_aid_inhalation": "",
  "extinguishing_media": "",
  "firefighting_procedures": "",
  "fire_explosion_hazards": "",
  "cleaning_methods": "",
  "safe_handling": "",
  "storage_requirements": "",
  "exposure_eye": "",
  "exposure_skin": "",
  "exposure_respiratory": "",
  "exposure_other": "",
  "work_hygiene_practice": "",
  "physical_state": "",
  "color": "",
  "odor": "",
  "flash_point": "",
  "stability": "",
  "incompatibility": "",
  "conditions_to_avoid": "",
  "hazardous_decomposition": "",
  "toxicity": "",
  "degradability": "",
  "waste_disposal": "",
  "dot_classification": "",
  "iata": "",
  "imdg": "",
  "hazard_symbol": "",
  "proper_shipping_name": "",
  "hazard": "",
  "id_number": "",
  "label": "",
  "regulatory_info": "",
  "additional_info": ""
}

Rules:
- If a field is not found in the source document, use "N/A"
- Keep values concise — single sentences or short phrases
- For regulatory_info: use "Not available" if not found
- For additional_info: extract any disclaimer/safety statement, or use "N/A"
- Return NOTHING except the raw JSON object`,
};

// ── Token verification ────────────────────────────────────────────────
function verifyToken(token) {
  if (!token) return null;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const payload = token.slice(0, dotIdx);
  const sig     = token.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || 'changeme')
                         .update(payload).digest('hex');
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.expires < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Body size limit ───────────────────────────────────────────────────
export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
};

// ── Handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });

  // Auth
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });

  const session = verifyToken(auth.slice(7));
  if (!session)
    return res.status(401).json({ error: 'Session expired. Please log in again.' });

  // Body
  const { template, pdf: pdfBase64, productName } = req.body || {};
  if (!template || (!pdfBase64 && !productName))
    return res.status(400).json({ error: 'Missing template and either pdf or productName' });

  const systemPrompt = SYSTEM_PROMPTS[template.toLowerCase()];
  if (!systemPrompt)
    return res.status(400).json({ error: `Unknown template: ${template}` });

  // Call Anthropic
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     systemPrompt,
      messages: [{
        role: 'user',
        content: pdfBase64
          ? [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: 'Extract the data from this document and return the JSON.' },
            ]
          : [
              { type: 'text', text: `Generate ${template.toUpperCase()} data for the following product/ingredient based on your scientific knowledge:\n\nProduct / INCI Name: ${productName}\n\nFill all JSON fields with accurate, typical values for this ingredient. For any field where data is genuinely unknown, use "N/A". Return ONLY the JSON object.` },
            ],
      }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    let err = {};
    try { err = JSON.parse(errText); } catch {}
    return res.status(500).json({
      error: err?.error?.message || `Anthropic error ${anthropicRes.status}`,
      raw:   errText,
    });
  }

  const result   = await anthropicRes.json();
  const rawText  = result.content[0].text.trim();
  const jsonText = rawText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return res.status(200).json({ data: JSON.parse(jsonText) });
  } catch {
    return res.status(500).json({ error: 'Failed to parse extracted JSON', raw: jsonText });
  }
}
