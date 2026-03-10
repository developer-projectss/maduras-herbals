// =====================================================================
// main.js — Bridge / Router (Web App)
// =====================================================================

import { requireAuth, getName, clearSession } from './auth.js';
import { extractDataFromPDF               } from './extractor.js';
import { generatePDF as coaGenerate        } from './templates/coa.js';
import { generatePDF as msdsGenerate       } from './templates/msds.js';

// ── Auth guard ────────────────────────────────────────────────────────
if (!requireAuth()) throw new Error('Not authenticated');

// Show logged-in user name
document.getElementById('topbarUser').textContent = `Hello, ${getName()}`;

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  window.location.href = './index.html';
});


// ── Template Router ───────────────────────────────────────────────────
async function routeToTemplate(templateId, dataJson, fileName) {
  if (templateId === 'coa')  return await coaGenerate(dataJson, fileName);
  if (templateId === 'msds') return await msdsGenerate(dataJson, fileName);
  throw new Error(`No handler registered for template: "${templateId}"`);
}


// ── State ─────────────────────────────────────────────────────────────
let uploadedPdfBytes = null;
let uploadedFileName = '';
let generatedBlobUrl = null;


// ── DOM References ────────────────────────────────────────────────────
const fileInput       = document.getElementById('fileInput');
const uploadZone      = document.getElementById('uploadZone');
const fileInfo        = document.getElementById('fileInfo');
const fileNameEl      = document.getElementById('fileName');
const changeFileBtn   = document.getElementById('changeFileBtn');
const templateSection = document.getElementById('templateSection');
const generateSection = document.getElementById('generateSection');
const resultSection   = document.getElementById('resultSection');
const templateSelect  = document.getElementById('templateSelect');
const generateBtn     = document.getElementById('generateBtn');
const openPdfBtn      = document.getElementById('openPdfBtn');
const downloadPdfBtn  = document.getElementById('downloadPdfBtn');
const statusMsg       = document.getElementById('statusMsg');


// ── UI Helpers ────────────────────────────────────────────────────────
function showStatus(message, type = 'error') {
  statusMsg.textContent = message;
  statusMsg.className   = `status-msg visible ${type}`;
}
function clearStatus() { statusMsg.className = 'status-msg'; }
function show(el)      { el.classList.add('visible'); }
function hide(el)      { el.classList.remove('visible'); }

function revokeBlob() {
  if (generatedBlobUrl) { URL.revokeObjectURL(generatedBlobUrl); generatedBlobUrl = null; }
}


// ── File Upload ───────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') {
    showStatus('Please upload a valid PDF file (.pdf).');
    return;
  }

  clearStatus();
  revokeBlob();
  hide(resultSection);

  uploadedFileName = file.name;
  uploadedPdfBytes = new Uint8Array(await file.arrayBuffer());

  fileNameEl.textContent = file.name;
  show(fileInfo);
  show(templateSection);
  show(generateSection);
  templateSelect.value = '';
  generateBtn.disabled = true;
}

fileInput.addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
changeFileBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

uploadZone.addEventListener('dragover',  (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});


// ── Template Selection ────────────────────────────────────────────────
templateSelect.addEventListener('change', () => {
  generateBtn.disabled = !templateSelect.value;
  revokeBlob();
  hide(resultSection);
  clearStatus();
});


// ── Generate PDF ──────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  const templateId = templateSelect.value;
  if (!templateId || !uploadedPdfBytes) return;

  clearStatus();
  revokeBlob();
  hide(resultSection);

  generateBtn.disabled  = true;
  generateBtn.innerHTML = '<span class="spinner"></span>Extracting data…';

  try {
    const dataJson = await extractDataFromPDF(uploadedPdfBytes, templateId);
    console.log('[Main] Extracted JSON:', dataJson);

    generateBtn.innerHTML = '<span class="spinner"></span>Building PDF…';
    const outputBytes = await routeToTemplate(templateId, dataJson, uploadedFileName);

    const blob       = new Blob([outputBytes], { type: 'application/pdf' });
    generatedBlobUrl = URL.createObjectURL(blob);

    // Auto-download
    const a    = document.createElement('a');
    a.href     = generatedBlobUrl;
    a.download = buildOutputName(uploadedFileName, templateId);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Auto-open
    window.open(generatedBlobUrl, '_blank');

    show(resultSection);
    showStatus('PDF generated successfully!', 'success');

  } catch (err) {
    console.error('[Generator] Error:', err);
    showStatus(`Generation failed: ${err.message}`);
  } finally {
    generateBtn.disabled    = false;
    generateBtn.textContent = 'Generate PDF';
  }
});


// ── Result Buttons ────────────────────────────────────────────────────
openPdfBtn.addEventListener('click',     () => { if (generatedBlobUrl) window.open(generatedBlobUrl, '_blank'); });
downloadPdfBtn.addEventListener('click', () => {
  if (!generatedBlobUrl) return;
  const a    = document.createElement('a');
  a.href     = generatedBlobUrl;
  a.download = buildOutputName(uploadedFileName, templateSelect.value);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


// ── Utility ───────────────────────────────────────────────────────────
function buildOutputName(originalName, templateId) {
  return originalName.replace(/\.pdf$/i, '') + `_${templateId}.pdf`;
}
