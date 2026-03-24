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

  editContent.innerHTML = `
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

  return {
    _edited:              true,
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

  function grp(title, fields) {
    return `<div class="edit-group">
      <div class="edit-group-title">${title}</div>
      <div class="edit-fields">
        ${fields.map(([id, label, wide, ta]) => `
          <div class="edit-field${wide ? ' full-width' : ''}">
            <label>${label}</label>
            ${ta
              ? `<textarea id="ef_${id}">${esc(d[id])}</textarea>`
              : `<input type="text" id="ef_${id}" value="${esc(d[id])}" />`}
          </div>`).join('')}
      </div>
    </div>`;
  }

  editContent.innerHTML =
    grp('Section 1 &amp; 2: Product &amp; Composition', [
      ['product_name',         'Product Name',         false, false],
      ['inci_name',            'INCI Name',            false, false],
      ['cas_no',               'CAS No',               false, false],
      ['hazardous_components', 'Hazardous Components', true,  true ],
    ]) +
    grp('Section 3: Hazards Identification', [
      ['eye_contact',       'Eye Contact', false, true],
      ['skin_contact',      'Skin Contact', false, true],
      ['ingestion_hazard',  'Ingestion',   false, true],
      ['inhalation_hazard', 'Inhalation',  false, true],
    ]) +
    grp('Section 4: First-Aid Measures', [
      ['first_aid_eyes',       'Eyes',       false, true],
      ['first_aid_skin',       'Skin',       false, true],
      ['first_aid_ingestion',  'Ingestion',  false, true],
      ['first_aid_inhalation', 'Inhalation', false, true],
    ]) +
    grp('Section 5: Fire Fighting Measures', [
      ['extinguishing_media',     'Extinguishing Media',      true, true],
      ['firefighting_procedures', 'Firefighting Procedures',  true, true],
      ['fire_explosion_hazards',  'Fire / Explosion Hazards', true, true],
    ]) +
    grp('Section 6 &amp; 7: Release, Handling &amp; Storage', [
      ['cleaning_methods',     'Cleaning Methods',     true, true],
      ['safe_handling',        'Safe Handling',        true, true],
      ['storage_requirements', 'Storage Requirements', true, true],
    ]) +
    grp('Section 8: Exposure Control / Personal Protection', [
      ['exposure_eye',          'Eye',           false, true],
      ['exposure_skin',         'Skin / Body',   false, true],
      ['exposure_respiratory',  'Respiratory',   false, true],
      ['exposure_other',        'Other',         false, true],
      ['work_hygiene_practice', 'Work Hygiene',  true,  true],
    ]) +
    grp('Section 9: Physical &amp; Chemical Properties', [
      ['physical_state', 'Physical State', false, false],
      ['color',          'Color',          false, false],
      ['odor',           'Odor',           false, false],
      ['flash_point',    'Flash Point',    false, false],
    ]) +
    grp('Section 10: Stability &amp; Reactivity', [
      ['stability',               'Stability',               false, true],
      ['incompatibility',         'Incompatibility',         false, true],
      ['conditions_to_avoid',     'Conditions to Avoid',     false, true],
      ['hazardous_decomposition', 'Hazardous Decomposition', true,  true],
    ]) +
    grp('Section 11 &amp; 12: Toxicology &amp; Ecology', [
      ['toxicity',      'Toxicity',      true, true],
      ['degradability', 'Degradability', true, true],
    ]) +
    grp('Section 13: Disposal', [
      ['waste_disposal', 'Waste Disposal Methods', true, true],
    ]) +
    grp('Section 14: Transport Information', [
      ['dot_classification',   'DOT Classification',  false, false],
      ['iata',                 'IATA',                false, false],
      ['imdg',                 'IMDG',                false, false],
      ['hazard_symbol',        'Hazard Symbol',       false, false],
      ['proper_shipping_name', 'Proper Shipping Name',true,  false],
      ['hazard',               'Hazard',              false, false],
      ['id_number',            'ID Number',           false, false],
      ['label',                'Label',               false, false],
    ]) +
    grp('Section 15 &amp; 16: Regulatory &amp; Additional Info', [
      ['regulatory_info', 'Regulatory Info', true, true],
      ['additional_info', 'Additional Info', true, true],
    ]);
}

function readMSDSData() {
  const gv = (id) => {
    const el = document.getElementById('ef_' + id);
    return el ? (el.value || '').trim() : '';
  };

  return {
    _edited:                 true,
    product_name:            gv('product_name'),
    inci_name:               gv('inci_name'),
    cas_no:                  gv('cas_no'),
    hazardous_components:    gv('hazardous_components'),
    eye_contact:             gv('eye_contact'),
    skin_contact:            gv('skin_contact'),
    ingestion_hazard:        gv('ingestion_hazard'),
    inhalation_hazard:       gv('inhalation_hazard'),
    first_aid_eyes:          gv('first_aid_eyes'),
    first_aid_skin:          gv('first_aid_skin'),
    first_aid_ingestion:     gv('first_aid_ingestion'),
    first_aid_inhalation:    gv('first_aid_inhalation'),
    extinguishing_media:     gv('extinguishing_media'),
    firefighting_procedures: gv('firefighting_procedures'),
    fire_explosion_hazards:  gv('fire_explosion_hazards'),
    cleaning_methods:        gv('cleaning_methods'),
    safe_handling:           gv('safe_handling'),
    storage_requirements:    gv('storage_requirements'),
    exposure_eye:            gv('exposure_eye'),
    exposure_skin:           gv('exposure_skin'),
    exposure_respiratory:    gv('exposure_respiratory'),
    exposure_other:          gv('exposure_other'),
    work_hygiene_practice:   gv('work_hygiene_practice'),
    physical_state:          gv('physical_state'),
    color:                   gv('color'),
    odor:                    gv('odor'),
    flash_point:             gv('flash_point'),
    stability:               gv('stability'),
    incompatibility:         gv('incompatibility'),
    conditions_to_avoid:     gv('conditions_to_avoid'),
    hazardous_decomposition: gv('hazardous_decomposition'),
    toxicity:                gv('toxicity'),
    degradability:           gv('degradability'),
    waste_disposal:          gv('waste_disposal'),
    dot_classification:      gv('dot_classification'),
    iata:                    gv('iata'),
    imdg:                    gv('imdg'),
    hazard_symbol:           gv('hazard_symbol'),
    proper_shipping_name:    gv('proper_shipping_name'),
    hazard:                  gv('hazard'),
    id_number:               gv('id_number'),
    label:                   gv('label'),
    regulatory_info:         gv('regulatory_info'),
    additional_info:         gv('additional_info'),
  };
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


// ── Utility ───────────────────────────────────────────────────────────
function buildOutputName(originalName, templateId) {
  return originalName.replace(/\.pdf$/i, '') + `_${templateId}.pdf`;
}
