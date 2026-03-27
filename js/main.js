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
let uploadedPdfBytes    = null;
let uploadedFileName    = '';
let generatedBlobUrl    = null;
let extractedTemplateId = null;
let sigSelectedBytes    = null;


// ── DOM References ────────────────────────────────────────────────────
const fileInput          = document.getElementById('fileInput');
const uploadZone         = document.getElementById('uploadZone');
const fileInfo           = document.getElementById('fileInfo');
const fileNameEl         = document.getElementById('fileName');
const changeFileBtn      = document.getElementById('changeFileBtn');
const templateSection    = document.getElementById('templateSection');
const generateSection    = document.getElementById('generateSection');
const editSection        = document.getElementById('editSection');
const editContent        = document.getElementById('editContent');
const confirmGenerateBtn = document.getElementById('confirmGenerateBtn');
const resultSection      = document.getElementById('resultSection');
const templateSelect     = document.getElementById('templateSelect');
const generateBtn        = document.getElementById('generateBtn');
const openPdfBtn         = document.getElementById('openPdfBtn');
const downloadPdfBtn     = document.getElementById('downloadPdfBtn');
const statusMsg          = document.getElementById('statusMsg');
const card               = document.querySelector('.card');


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

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  hide(editSection);
  card.classList.remove('card--wide');
  extractedTemplateId = null;

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
  hide(editSection);
  card.classList.remove('card--wide');
  extractedTemplateId = null;
  clearStatus();
});


// ── Extract & Preview ─────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  const templateId = templateSelect.value;
  if (!templateId || !uploadedPdfBytes) return;

  clearStatus();
  revokeBlob();
  hide(resultSection);
  hide(editSection);
  card.classList.remove('card--wide');

  generateBtn.disabled  = true;
  generateBtn.innerHTML = '<span class="spinner"></span>Extracting data…';

  try {
    const dataJson = await extractDataFromPDF(uploadedPdfBytes, templateId);
    console.log('[Main] Extracted JSON:', dataJson);

    extractedTemplateId = templateId;
    renderEditablePreview(templateId, dataJson);
    show(editSection);
    card.classList.add('card--wide');
    editSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showStatus('Data extracted. Review and edit below, then click Generate PDF.', 'success');

  } catch (err) {
    console.error('[Generator] Error:', err);
    showStatus(`Extraction failed: ${err.message}`);
  } finally {
    generateBtn.disabled  = false;
    generateBtn.textContent = 'Extract & Preview';
  }
});


// ── Confirm Generate ──────────────────────────────────────────────────
confirmGenerateBtn.addEventListener('click', async () => {
  if (!extractedTemplateId) return;

  clearStatus();
  revokeBlob();
  hide(resultSection);

  confirmGenerateBtn.disabled  = true;
  confirmGenerateBtn.innerHTML = '<span class="spinner"></span>Building PDF…';

  try {
    const editedData  = readDataFromPreview(extractedTemplateId);
    const outputBytes = await routeToTemplate(extractedTemplateId, editedData, uploadedFileName);

    const blob       = new Blob([outputBytes], { type: 'application/pdf' });
    generatedBlobUrl = URL.createObjectURL(blob);

    // Auto-download
    const a    = document.createElement('a');
    a.href     = generatedBlobUrl;
    a.download = buildOutputName(uploadedFileName, extractedTemplateId);
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
    confirmGenerateBtn.disabled    = false;
    confirmGenerateBtn.textContent = 'Generate PDF';
  }
});


// ── Edit Content — Event Delegation ──────────────────────────────────
editContent.addEventListener('click', (e) => {
  const t = e.target;

  if (t.classList.contains('del-btn')) {
    t.closest('tr').remove();
    return;
  }
  // MSDS: remove entire section
  if (t.classList.contains('del-section-btn')) {
    if (!confirm('Remove this entire section?')) return;
    t.closest('.msds-section').remove();
    return;
  }
  // MSDS: add row inside a specific section
  if (t.classList.contains('msds-add-row')) {
    t.closest('.msds-section').querySelector('.msds-tbody').insertAdjacentHTML('beforeend', makeRow2('', ''));
    return;
  }
  // MSDS: add a brand-new section at the bottom
  if (t.id === 'addMSDSSection') {
    document.getElementById('msds-sections-container').insertAdjacentHTML('beforeend', makeMSDSSection('NEW SECTION TITLE', []));
    return;
  }
  // COA row buttons
  if (t.id === 'addSensoryRow') {
    document.getElementById('tbody_sensory').insertAdjacentHTML('beforeend', makeRow2('', ''));
    return;
  }
  if (t.id === 'addAnalyticalRow') {
    document.getElementById('tbody_analytical').insertAdjacentHTML('beforeend', makeRow3('', '', ''));
    return;
  }
  if (t.id === 'addMicroRow') {
    document.getElementById('tbody_micro').insertAdjacentHTML('beforeend', makeRow3('', '', ''));
    return;
  }
});


// ── Download as Word ─────────────────────────────────────────────────
document.getElementById('downloadWordBtn').addEventListener('click', () => {
  if (!extractedTemplateId) return;
  try {
    const data = readDataFromPreview(extractedTemplateId);
    const body = extractedTemplateId === 'msds' ? buildMSDSWordHTML(data) : buildCOAWordHTML(data);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 9pt; margin: 2cm; }
  h1 { font-size: 16pt; margin-bottom: 2pt; }
  p.sub { font-size: 9pt; color: #5EA600; margin-bottom: 4pt; }
  p.docinfo { font-size: 9pt; margin-bottom: 14pt; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; }
  .sec-hdr { background: #5EA600; color: white; font-weight: bold; padding: 5pt 8pt; font-size: 9pt; }
  td { border: 0.5pt solid #aaa; padding: 5pt 8pt; font-size: 9pt; vertical-align: top; word-break: break-word; }
  td.lbl { font-weight: bold; width: 38%; }
  th { background: #5EA600; color: white; padding: 5pt 8pt; font-size: 9pt; font-weight: bold; text-align: left; }
</style></head>
<body>${body}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = buildOutputName(uploadedFileName, extractedTemplateId).replace('.pdf', '.doc');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    showStatus(err.message);
  }
});

function buildMSDSWordHTML(data) {
  let html = `<h1>MADURAS HERBALS</h1>
<p class="sub">Connecting Nature to You</p>
<p class="docinfo">Doc No: ${esc(data._docNo)} &nbsp;&nbsp;&nbsp; Date: ${esc(data._docDate)}</p>`;
  for (const sec of data.sections || []) {
    html += `<table><tr><td colspan="2" class="sec-hdr">${esc(sec.title)}</td></tr>`;
    for (const row of sec.rows || []) {
      html += `<tr><td class="lbl">${esc(row.label)}</td><td>${esc(row.value || 'N/A')}</td></tr>`;
    }
    html += '</table>';
  }
  return html;
}

function buildCOAWordHTML(data) {
  let html = `<h1>MADURAS HERBALS</h1>
<p class="sub">Connecting Nature to You</p>
<p class="docinfo">Doc No: ${esc(data._docNo)} &nbsp;&nbsp;&nbsp; Date: ${esc(data._docDate)}</p>
<table>
  <tr><td colspan="2" class="sec-hdr">PRODUCT INFORMATION</td></tr>
  ${[
    ['Product Name', data.product_name],
    ['Botanical Name', data.botanical_name],
    ['Country of Origin', data.country_of_origin],
    ['Batch Size', data.batch_size],
    ['Batch No', data.batch_no],
    ['Date of Manufacture', data.date_of_manufacture],
    ['Date of Expiry', data.date_of_expiry],
  ].map(([l, v]) => `<tr><td class="lbl">${esc(l)}</td><td>${esc(v || '')}</td></tr>`).join('')}
</table>
<table>
  <tr><th style="width:50%">SENSORY DATA</th><th>VALUE</th></tr>
  ${(data.sensory_data || []).map(r => `<tr><td class="lbl">${esc(r.label)}</td><td>${esc(r.value)}</td></tr>`).join('')}
</table>
<table>
  <tr><th style="width:38%">ANALYTICAL DATA</th><th>SPECIFIED REQUIREMENT</th><th>RESULT (%)</th></tr>
  ${(data.analytical_data || []).map(r => `<tr><td>${esc(r.parameter)}</td><td>${esc(r.specification)}</td><td>${esc(r.result)}</td></tr>`).join('')}
</table>
<table>
  <tr><th style="width:38%">MICROBIOLOGICAL DATA</th><th>SPECIFIED REQUIREMENT</th><th>RESULT</th></tr>
  ${(data.microbiological_data || []).map(r => `<tr><td>${esc(r.parameter)}</td><td>${esc(r.specification)}</td><td>${esc(r.result)}</td></tr>`).join('')}
</table>`;
  return html;
}

// ── Result Buttons ────────────────────────────────────────────────────
openPdfBtn.addEventListener('click', () => {
  if (generatedBlobUrl) window.open(generatedBlobUrl, '_blank');
});
downloadPdfBtn.addEventListener('click', () => {
  if (!generatedBlobUrl) return;
  const a    = document.createElement('a');
  a.href     = generatedBlobUrl;
  a.download = buildOutputName(uploadedFileName, extractedTemplateId || templateSelect.value);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});


// ── Render Preview Router ─────────────────────────────────────────────
function renderEditablePreview(templateId, data) {
  if (templateId === 'coa')  renderCOAEditor(data);
  if (templateId === 'msds') renderMSDSEditor(data);
}

function readDataFromPreview(templateId) {
  if (templateId === 'coa')  return readCOAData();
  if (templateId === 'msds') return readMSDSData();
  throw new Error('Unknown template');
}


// ── COA Editor ───────────────────────────────────────────────────────
function renderCOAEditor(data) {
  const sd = data.sensory_data || {};
  const ad = data.analytical_data || [];
  const md = data.microbiological_data || [];

  const sensoryRows = [
    { label: 'Appearance', value: sd.appearance || '' },
    { label: 'Color',      value: sd.color      || '' },
    { label: 'Odor',       value: sd.odor       || '' },
    { label: 'Solubility', value: sd.solubility || '' },
  ];

  sigSelectedBytes = null;
  editContent.innerHTML = sigControlHTML() + docControlHTML('COA-', 'maduras_docNum_coa') + `
    <div class="edit-group">
      <div class="edit-group-title">Product Information</div>
      <div class="edit-fields">
        <div class="edit-field"><label>Product Name</label><input type="text" id="ef_product_name" value="${esc(data.product_name)}" /></div>
        <div class="edit-field"><label>Botanical Name</label><input type="text" id="ef_botanical_name" value="${esc(data.botanical_name)}" /></div>
        <div class="edit-field"><label>Country of Origin</label><input type="text" id="ef_country_of_origin" value="${esc(data.country_of_origin)}" /></div>
        <div class="edit-field"><label>Batch Size</label><input type="text" id="ef_batch_size" value="${esc(data.batch_size)}" /></div>
        <div class="edit-field"><label>Batch No</label><input type="text" id="ef_batch_no" value="${esc(data.batch_no)}" /></div>
        <div class="edit-field"><label>Date of Manufacture</label><input type="text" id="ef_date_of_manufacture" value="${esc(data.date_of_manufacture)}" /></div>
        <div class="edit-field"><label>Date of Expiry</label><input type="text" id="ef_date_of_expiry" value="${esc(data.date_of_expiry)}" /></div>
      </div>
    </div>

    <div class="edit-group">
      <div class="edit-group-title">Sensory Data</div>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead><tr><th style="width:40%">Property</th><th>Value</th><th class="del-col"></th></tr></thead>
          <tbody id="tbody_sensory">
            ${sensoryRows.map(r => makeRow2(r.label, r.value)).join('')}
          </tbody>
        </table>
      </div>
      <button class="add-row-btn" id="addSensoryRow">+ Add Row</button>
    </div>

    <div class="edit-group">
      <div class="edit-group-title">Analytical Data</div>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead><tr><th style="width:38%">Parameter</th><th>Specification</th><th>Result (%)</th><th class="del-col"></th></tr></thead>
          <tbody id="tbody_analytical">
            ${ad.map(r => makeRow3(r.parameter || '', r.specification || '', r.result || '')).join('')}
          </tbody>
        </table>
      </div>
      <button class="add-row-btn" id="addAnalyticalRow">+ Add Row</button>
    </div>

    <div class="edit-group">
      <div class="edit-group-title">Microbiological Data</div>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead><tr><th style="width:38%">Parameter</th><th>Specification</th><th>Result</th><th class="del-col"></th></tr></thead>
          <tbody id="tbody_micro">
            ${md.map(r => makeRow3(r.parameter || '', r.specification || '', r.result || '')).join('')}
          </tbody>
        </table>
      </div>
      <button class="add-row-btn" id="addMicroRow">+ Add Row</button>
    </div>
  `;
  setupSigHandlers();
}

function readCOAData() {
  const gv = (id) => (document.getElementById('ef_' + id) || {}).value || '';

  const sensoryData = [];
  document.getElementById('tbody_sensory').querySelectorAll('tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    const label  = (inputs[0]?.value || '').trim();
    if (label) sensoryData.push({ label, value: (inputs[1]?.value || '').trim() });
  });

  const analyticalData = [];
  document.getElementById('tbody_analytical').querySelectorAll('tr').forEach(tr => {
    const inputs    = tr.querySelectorAll('input');
    const parameter = (inputs[0]?.value || '').trim();
    if (parameter) analyticalData.push({
      parameter,
      specification: (inputs[1]?.value || '').trim(),
      result:        (inputs[2]?.value || '').trim(),
    });
  });

  const microData = [];
  document.getElementById('tbody_micro').querySelectorAll('tr').forEach(tr => {
    const inputs    = tr.querySelectorAll('input');
    const parameter = (inputs[0]?.value || '').trim();
    if (parameter) microData.push({
      parameter,
      specification: (inputs[1]?.value || '').trim(),
      result:        (inputs[2]?.value || '').trim(),
    });
  });

  const sigOption = parseInt(document.querySelector('input[name="sigOption"]:checked')?.value || '1');
  if (sigOption === 2 && !sigSelectedBytes) throw new Error('Please select or upload a signature image for Option 2.');

  return {
    _edited:              true,
    _docNo:               (document.getElementById('ef__docNo')?.value  || '').trim(),
    _docDate:             formatDateForPDF(document.getElementById('ef__docDate')?.value),
    _sigOption:           sigOption,
    _sigBytes:            sigOption === 2 ? sigSelectedBytes : null,
    product_name:         gv('product_name'),
    botanical_name:       gv('botanical_name'),
    country_of_origin:    gv('country_of_origin'),
    batch_size:           gv('batch_size'),
    batch_no:             gv('batch_no'),
    date_of_manufacture:  gv('date_of_manufacture'),
    date_of_expiry:       gv('date_of_expiry'),
    sensory_data:         sensoryData,
    analytical_data:      analyticalData,
    microbiological_data: microData,
  };
}


// ── MSDS Editor ──────────────────────────────────────────────────────
function renderMSDSEditor(data) {
  const d = data || {};

  // If data already has sections (re-edit), use them; otherwise build defaults from flat fields
  const sections = d.sections || [
    { title: 'SECTION 1. PRODUCT AND COMPANY IDENTIFICATION', rows: [
      { label: 'Product Name',    value: d.product_name || '' },
      { label: 'Product Use',     value: 'For personal care formulation' },
      { label: 'Company Name',    value: 'Maduras Herbals Pvt Ltd' },
      { label: 'Company Address', value: 'Reddiyur, Salem-636004, Tamil Nadu, India.' },
      { label: 'Phone Number',    value: '+91 8644823456' },
    ]},
    { title: 'SECTION 2. COMPOSITION/INGREDIENT INFORMATION', rows: [
      { label: 'INCI Name',            value: d.inci_name || '' },
      { label: 'CAS No',               value: d.cas_no || '' },
      { label: 'Hazardous Components', value: d.hazardous_components || '' },
    ]},
    { title: 'SECTION 3. HAZARDS IDENTIFICATION', rows: [
      { label: 'Routes of Entry', value: '' },
      { label: 'Eye Contact',     value: d.eye_contact || '' },
      { label: 'Skin Contact',    value: d.skin_contact || '' },
      { label: 'Ingestion',       value: d.ingestion_hazard || '' },
      { label: 'Inhalation',      value: d.inhalation_hazard || '' },
    ]},
    { title: 'SECTION 4. FIRST-AID MEASURES', rows: [
      { label: 'Eyes',       value: d.first_aid_eyes || '' },
      { label: 'Skin',       value: d.first_aid_skin || '' },
      { label: 'Ingestion',  value: d.first_aid_ingestion || '' },
      { label: 'Inhalation', value: d.first_aid_inhalation || '' },
    ]},
    { title: 'SECTION 5. FIRE FIGHTING MEASURES', rows: [
      { label: 'Extinguishing Media Recommended',  value: d.extinguishing_media || '' },
      { label: 'Special Firefighting Procedures',  value: d.firefighting_procedures || '' },
      { label: 'Unusual Fire & Explosion Hazards', value: d.fire_explosion_hazards || '' },
    ]},
    { title: 'SECTION 6. ACCIDENTAL RELEASE MEASURES (STEPS FOR SPILLS)', rows: [
      { label: 'Methods for Cleaning Up', value: d.cleaning_methods || '' },
    ]},
    { title: 'SECTION 7. HANDLING AND STORAGE', rows: [
      { label: 'Safe Handling',                              value: d.safe_handling || '' },
      { label: 'Requirements for Storage Areas and Containers', value: d.storage_requirements || '' },
    ]},
    { title: 'SECTION 8. EXPOSURE CONTROL/PERSONAL PROTECTION', rows: [
      { label: 'Eye',                   value: d.exposure_eye || '' },
      { label: 'Skin/Body',             value: d.exposure_skin || '' },
      { label: 'Respiratory',           value: d.exposure_respiratory || '' },
      { label: 'Other',                 value: d.exposure_other || '' },
      { label: 'Work/Hygiene Practice', value: d.work_hygiene_practice || '' },
    ]},
    { title: 'SECTION 9. PHYSICAL AND CHEMICAL PROPERTIES', rows: [
      { label: 'Physical State', value: d.physical_state || '' },
      { label: 'Color',          value: d.color || '' },
      { label: 'Odor',           value: d.odor || '' },
      { label: 'Flash Point',    value: d.flash_point || '' },
    ]},
    { title: 'SECTION 10. STABILITY AND REACTIVITY', rows: [
      { label: 'Stability',                             value: d.stability || '' },
      { label: 'Incompatibility (Materials to Avoid)',  value: d.incompatibility || '' },
      { label: 'Conditions to Avoid',                   value: d.conditions_to_avoid || '' },
      { label: 'Hazardous Decomposition or Byproducts', value: d.hazardous_decomposition || '' },
    ]},
    { title: 'SECTION 11. TOXICOLOGICAL INFORMATION', rows: [
      { label: 'Toxicity', value: d.toxicity || '' },
    ]},
    { title: 'SECTION 12. ECOLOGICAL INFORMATION', rows: [
      { label: 'Degradability', value: d.degradability || '' },
    ]},
    { title: 'SECTION 13. DISPOSAL CONSIDERATIONS', rows: [
      { label: 'Waste Disposal Methods', value: d.waste_disposal || '' },
    ]},
    { title: 'SECTION 14. TRANSPORT INFORMATION', rows: [
      { label: 'DOT Classification',   value: d.dot_classification || '' },
      { label: 'IATA',                 value: d.iata || '' },
      { label: 'IMDG',                 value: d.imdg || '' },
      { label: 'Hazard Symbol',        value: d.hazard_symbol || '' },
      { label: 'Proper Shipping Name', value: d.proper_shipping_name || '' },
      { label: 'Hazard',               value: d.hazard || '' },
      { label: 'ID Number',            value: d.id_number || '' },
      { label: 'Label',                value: d.label || '' },
    ]},
    { title: 'SECTION 15. REGULATORY INFORMATION', rows: [
      { label: 'Regulatory Information', value: d.regulatory_info || 'Not available' },
    ]},
    { title: 'SECTION 16. ADDITIONAL INFORMATION', rows: [
      { label: 'Additional Information', value: d.additional_info || 'This information is provided for documentation purposes only. This product is not considered hazardous. The complete range of conditions or methods of use are beyond our control therefore we do not assume any responsibility.' },
    ]},
  ];

  sigSelectedBytes = null;
  editContent.innerHTML = sigControlHTML() + docControlHTML('MSDS-', 'maduras_docNum_msds') + `
    <div style="margin-bottom:6px;padding:10px 14px;background:#fffbe6;border:1.5px solid #f0c040;border-radius:7px;font-size:12px;color:#7a5800">
      <b>Full Edit Mode:</b> Rename section titles, add/delete rows inside each section, remove sections, or add new sections from scratch.
    </div>
    <div id="msds-sections-container">
      ${sections.map(sec => makeMSDSSection(sec.title, sec.rows)).join('')}
    </div>
    <div style="margin-top:14px;padding-bottom:10px;text-align:center">
      <button class="add-row-btn" id="addMSDSSection" type="button" style="padding:10px 28px;font-size:13px">+ Add New Section</button>
    </div>
  `;
  setupSigHandlers();
}

function readMSDSData() {
  const sections = [];
  document.querySelectorAll('.msds-section').forEach(sec => {
    const title = (sec.querySelector('.msds-sec-title')?.value || '').trim();
    const rows = [];
    sec.querySelectorAll('.msds-tbody tr').forEach(tr => {
      const inputs = tr.querySelectorAll('input');
      rows.push({
        label: (inputs[0]?.value || '').trim(),
        value: (inputs[1]?.value || '').trim(),
      });
    });
    if (title) sections.push({ title, rows });
  });

  const sigOption = parseInt(document.querySelector('input[name="sigOption"]:checked')?.value || '1');
  if (sigOption === 2 && !sigSelectedBytes) throw new Error('Please select or upload a signature image for Option 2.');

  return {
    _edited:    true,
    _docNo:     (document.getElementById('ef__docNo')?.value  || '').trim(),
    _docDate:   formatDateForPDF(document.getElementById('ef__docDate')?.value),
    _sigOption: sigOption,
    _sigBytes:  sigOption === 2 ? sigSelectedBytes : null,
    sections,
  };
}


// ── Signature Helpers ─────────────────────────────────────────────────
function sigControlHTML() {
  return `
    <div class="edit-group">
      <div class="edit-group-title">Signature Option</div>
      <div class="sig-options">
        <label class="sig-radio-label">
          <input type="radio" name="sigOption" id="sigOpt1" value="1" checked />
          <div class="sig-radio-text">
            <span>Option 1 — Computer Generated Statement</span>
            <small>"This is a computer-generated document and does not require a signature."</small>
          </div>
        </label>
        <label class="sig-radio-label">
          <input type="radio" name="sigOption" id="sigOpt2" value="2" />
          <div class="sig-radio-text">
            <span>Option 2 — Authorized Signature</span>
          </div>
        </label>
        <div class="sig-choice-area" id="sigChoiceArea" style="display:none">
          <div class="sig-presets">
            <button type="button" class="sig-preset-btn" id="sigBtn1" data-src="./js/templates/sig1.png">
              <img src="./js/templates/sig1.png" alt="Signature 1" onerror="this.parentElement.classList.add('sig-missing')" />
              <span>Signature 1</span>
            </button>
            <button type="button" class="sig-preset-btn" id="sigBtn2" data-src="./js/templates/sig2.png">
              <img src="./js/templates/sig2.png" alt="Signature 2" onerror="this.parentElement.classList.add('sig-missing')" />
              <span>Signature 2</span>
            </button>
            <label class="sig-upload-label">
              <input type="file" id="sigUpload" accept="image/png,image/jpeg" style="display:none" />
              ⬆ Upload Signature
            </label>
          </div>
          <div class="sig-preview" id="sigPreview" style="display:none">
            <img id="sigPreviewImg" alt="Selected signature" />
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupSigHandlers() {
  const opt1       = document.getElementById('sigOpt1');
  const opt2       = document.getElementById('sigOpt2');
  const choiceArea = document.getElementById('sigChoiceArea');
  const sigUpload  = document.getElementById('sigUpload');
  const sigBtn1    = document.getElementById('sigBtn1');
  const sigBtn2    = document.getElementById('sigBtn2');
  if (!opt1) return;

  opt2.addEventListener('change', () => { choiceArea.style.display = 'block'; });
  opt1.addEventListener('change', () => {
    choiceArea.style.display = 'none';
    sigSelectedBytes = null;
  });

  sigBtn1.addEventListener('click', () => selectPresetSig('./js/templates/sig1.png', sigBtn1));
  sigBtn2.addEventListener('click', () => selectPresetSig('./js/templates/sig2.png', sigBtn2));

  sigUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      sigSelectedBytes = new Uint8Array(ev.target.result);
      document.getElementById('sigPreviewImg').src = URL.createObjectURL(file);
      document.getElementById('sigPreview').style.display = 'block';
      sigBtn1.classList.remove('selected');
      sigBtn2.classList.remove('selected');
    };
    reader.readAsArrayBuffer(file);
  });
}

async function selectPresetSig(src, btn) {
  try {
    const bytes      = await fetch(src).then(r => r.arrayBuffer());
    sigSelectedBytes = new Uint8Array(bytes);
    document.querySelectorAll('.sig-preset-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('sigPreviewImg').src = src;
    document.getElementById('sigPreview').style.display = 'block';
  } catch {
    showStatus('Could not load predefined signature. Please upload one instead.', 'error');
  }
}

// ── Doc Control Helpers ───────────────────────────────────────────────
function peekDocNumber(prefix, storageKey) {
  const next = (parseInt(localStorage.getItem(storageKey) || '0', 10)) + 1;
  return prefix + String(next).padStart(5, '0');
}

function todayInputValue() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDateForPDF(dateInputVal) {
  if (!dateInputVal) return '';
  const [y, m, day] = dateInputVal.split('-');
  return `${day}/${m}/${y}`;
}

function docControlHTML(prefix, storageKey) {
  const suggestedNo = peekDocNumber(prefix, storageKey);
  const todayVal    = todayInputValue();
  return `
    <div class="edit-group">
      <div class="edit-group-title">Document Control</div>
      <div class="edit-fields">
        <div class="edit-field">
          <label>Document Number</label>
          <input type="text" id="ef__docNo" value="${esc(suggestedNo)}" placeholder="e.g. ${esc(suggestedNo)}" />
        </div>
        <div class="edit-field">
          <label>Document Date</label>
          <input type="date" id="ef__docDate" value="${todayVal}" />
        </div>
      </div>
    </div>
  `;
}

// ── Table Row Helpers ─────────────────────────────────────────────────
function makeRow2(v1, v2) {
  return `<tr>
    <td><input type="text" value="${esc(v1)}" /></td>
    <td><input type="text" value="${esc(v2)}" /></td>
    <td><button class="del-btn" type="button" title="Remove row">✕</button></td>
  </tr>`;
}

function makeRow3(v1, v2, v3) {
  return `<tr>
    <td><input type="text" value="${esc(v1)}" /></td>
    <td><input type="text" value="${esc(v2)}" /></td>
    <td><input type="text" value="${esc(v3)}" /></td>
    <td><button class="del-btn" type="button" title="Remove row">✕</button></td>
  </tr>`;
}

function makeMSDSSection(title, rows) {
  return `
    <div class="edit-group msds-section">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input class="msds-sec-title" type="text" value="${esc(title)}"
          style="flex:1;font-weight:700;font-size:12px;padding:6px 10px;border:1.5px solid #bbb;border-radius:5px;background:#f7f7f7;color:#222" />
        <button class="del-section-btn" type="button"
          style="background:#e74c3c;color:#fff;border:none;padding:6px 13px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">
          ✕ Remove Section
        </button>
      </div>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead><tr><th style="width:35%">Label</th><th>Value</th><th class="del-col"></th></tr></thead>
          <tbody class="msds-tbody">
            ${rows.map(r => makeRow2(r.label, r.value)).join('')}
          </tbody>
        </table>
      </div>
      <button class="add-row-btn msds-add-row" type="button">+ Add Row</button>
    </div>
  `;
}


// ── Utility ───────────────────────────────────────────────────────────
function buildOutputName(originalName, templateId) {
  return originalName.replace(/\.pdf$/i, '') + `_${templateId}.pdf`;
}
