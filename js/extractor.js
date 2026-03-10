// =====================================================================
// extractor.js — Calls the Vercel API to extract PDF data
// =====================================================================

import { getToken } from './auth.js';

/**
 * Extract structured data from a PDF via the API.
 *
 * @param {Uint8Array} pdfBytes  - Raw bytes of the uploaded PDF
 * @param {string}     template  - Template ID ("coa" | "msds")
 * @returns {Promise<Object>}     Extracted JSON data
 */
export async function extractDataFromPDF(pdfBytes, template) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please log in again.');

  const pdfBase64 = uint8ToBase64(pdfBytes);

  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ template, pdf: pdfBase64 }),
  });

  const result = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = './index.html';
    }
    throw new Error(result.error || `Server error ${response.status}`);
  }

  return result.data;
}

// ── Utility ───────────────────────────────────────────────────────────
function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
