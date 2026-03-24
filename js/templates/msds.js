// =====================================================================
// msds.js — MSDS Template PDF Generator (Maduras Herbals)
// =====================================================================

import {
  PDFDocument,
  rgb,
  StandardFonts,
} from './pdf-lib.esm.js';

// ── Colours ───────────────────────────────────────────────────────────
const COL = {
  sectionHeader: rgb(0.369, 0.647, 0),
  rowWhite:      rgb(1, 1, 1),
  red:           rgb(1, 0, 0),
  black:         rgb(0, 0, 0),
  white:         rgb(1, 1, 1),
  border:        rgb(0.7, 0.7, 0.7),
};

// ── Page geometry (A4 portrait) ───────────────────────────────────────
const PW = 595.28;
const PH = 841.89;
const ML = 50;
const MR = 50;
const CW = PW - ML - MR;

// ── Table column widths ───────────────────────────────────────────────
const LW = CW * 0.38; // label column
const VW = CW * 0.62; // value column

// ── Typography ───────────────────────────────────────────────────────
const FS   = 8.5; // font size
const LH   = 11;  // line height for multi-line text
const RPAD = 4;   // vertical cell padding (each side)

// ── Safe bottom margin (above footer bar) ────────────────────────────
const FOOT_Y = 65;

// ── Auto-incrementing doc number ──────────────────────────────────────
function getNextDocNumber() {
  const key  = 'maduras_docNum_msds';
  const next = (parseInt(localStorage.getItem(key) || '0', 10)) + 1;
  localStorage.setItem(key, String(next));
  return 'MSDS-' + String(next).padStart(5, '0');
}

function todayFormatted() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

// ── Public entry point ────────────────────────────────────────────────
export async function generatePDF(d, _fileName) {
  const doc     = await PDFDocument.create();
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const boldObl = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  let logoImg = null;
  try {
    const logoUrl   = new URL('./logo.png', import.meta.url).href;
    const logoBytes = await fetch(logoUrl).then(r => r.arrayBuffer());
    logoImg = await doc.embedPng(logoBytes);
  } catch (e) {
    console.warn('[MSDS] Logo load failed:', e.message);
  }

  const docNo   = d._docNo   || getNextDocNumber();
  const docDate = d._docDate || todayFormatted();

  // ── Dynamic Page Manager ──────────────────────────────────────────
  const pm = { page: null, y: 0, num: 0 };

  function calcRowH(label, value) {
    const n = Math.max(
      wrapText(bold,    String(label  ?? ''),    FS, LW - 10).length,
      wrapText(regular, String(value  ?? 'N/A'), FS, VW - 12).length
    );
    return n * LH + 2 * RPAD;
  }

  function addPage() {
    if (pm.page) {
      drawPageFooter(pm.page, regular, pm.num, pm.num > 1);
    }
    pm.num++;
    pm.page = doc.addPage([PW, PH]);
    drawWatermark(pm.page, logoImg);
    if (pm.num === 1) {
      drawPage1Header(pm.page, bold, regular, boldObl, logoImg);
      pm.y = PH - 92;
    } else {
      drawMiniHeader(pm.page, regular, logoImg, docNo, docDate);
      pm.y = PH - 75;
    }
  }

  function ensureSpace(h) {
    if (!pm.page || pm.y - h < FOOT_Y) addPage();
  }

  function gap(n) { pm.y -= n; }

  // ── Page-break-aware section drawing ─────────────────────────────
  function drawSec(title, rows) {
    const firstH = rows.length ? calcRowH(rows[0][0], rows[0][1]) : 0;
    ensureSpace(20 + firstH);
    pm.y = drawSectionHeader(pm.page, bold, pm.y, title);
    rows.forEach(([label, value]) => {
      ensureSpace(calcRowH(label, value));
      pm.y = drawRow(pm.page, bold, regular, pm.y, label, value);
    });
  }

  function drawSec3() {
    const firstH = calcRowH('Eye Contact', d.eye_contact);
    ensureSpace(20 + FS + 8 + firstH);
    pm.y = drawSectionHeader(pm.page, bold, pm.y, 'SECTION 3. HAZARDS IDENTIFICATION');
    pm.y -= 4;
    pm.page.drawText('Routes of Entry:', {
      x: ML + 5, y: pm.y - FS,
      size: FS, font: bold, color: COL.black,
    });
    pm.y -= FS + 8;
    [
      ['Eye Contact',  d.eye_contact],
      ['Skin Contact', d.skin_contact],
      ['Ingestion',    d.ingestion_hazard],
      ['Inhalation',   d.inhalation_hazard],
    ].forEach(([label, value]) => {
      ensureSpace(calcRowH(label, value));
      pm.y = drawRow(pm.page, bold, regular, pm.y, label, value);
    });
  }

  function drawSecText(title, text) {
    const lines = wrapText(regular, text, FS, CW - 4);
    ensureSpace(20 + LH + 8);
    pm.y = drawSectionHeader(pm.page, bold, pm.y, title);
    pm.y -= 8;
    lines.forEach(line => {
      ensureSpace(LH);
      pm.page.drawText(line, { x: ML, y: pm.y, size: FS, font: regular, color: COL.black });
      pm.y -= LH;
    });
  }

  // ── Draw all sections ─────────────────────────────────────────────
  addPage(); // start page 1

  drawSec('SECTION 1. PRODUCT AND COMPANY IDENTIFICATION', [
    ['Product Name',    d.product_name],
    ['Product Use',     'For personal care formulation'],
    ['Company Name',    'Maduras Herbals Pvt Ltd'],
    ['Company Address', 'Reddiyur, Salem-636004, Tamil Nadu, India.'],
    ['Phone Number',    '+91 8644823456'],
  ]);
  gap(8);

  drawSec('SECTION 2. COMPOSITION/INGREDIENT INFORMATION', [
    ['INCI Name',            d.inci_name],
    ['CAS No',               d.cas_no],
    ['Hazardous Components', d.hazardous_components],
  ]);
  gap(8);

  drawSec3();
  gap(8);

  drawSec('SECTION 4. FIRST-AID MEASURES', [
    ['Eyes',       d.first_aid_eyes],
    ['Skin',       d.first_aid_skin],
    ['Ingestion',  d.first_aid_ingestion],
    ['Inhalation', d.first_aid_inhalation],
  ]);
  gap(8);

  drawSec('SECTION 5. FIRE FIGHTING MEASURES', [
    ['Extinguishing media\nrecommended',  d.extinguishing_media],
    ['Special Firefighting\nProcedures',  d.firefighting_procedures],
    ['Unusual Fire &\nExplosion Hazards', d.fire_explosion_hazards],
  ]);
  gap(8);

  drawSec('SECTION 6. ACCIDENTAL RELEASE MEASURES (STEPS FOR SPILLS)', [
    ['Methods for Cleaning Up', d.cleaning_methods],
  ]);
  gap(8);

  drawSec('SECTION 7. HANDLING AND STORAGE', [
    ['Safe Handling',                                    d.safe_handling],
    ['Requirements for\nStorage Areas and\nContainers', d.storage_requirements],
  ]);
  gap(8);

  drawSec('SECTION 8. EXPOSURE CONTROL/PERSONAL PROTECTION', [
    ['Eye',                    d.exposure_eye],
    ['Skin/Body',              d.exposure_skin],
    ['Respiratory',            d.exposure_respiratory],
    ['Other',                  d.exposure_other],
    ['Work/Hygiene\nPractice', d.work_hygiene_practice],
  ]);
  gap(8);

  drawSec('SECTION 9. PHYSICAL AND CHEMICAL PROPERTIES', [
    ['Physical State', d.physical_state],
    ['Color',          d.color],
    ['Odor',           d.odor],
    ['Flash Point',    d.flash_point],
  ]);
  gap(8);

  drawSec('SECTION 10. STABILITY AND REACTIVITY', [
    ['Stability',                              d.stability],
    ['Incompatibility\n(Materials to Avoid)',  d.incompatibility],
    ['Conditions to Avoid',                    d.conditions_to_avoid],
    ['Hazardous Decomposition\nor Byproducts', d.hazardous_decomposition],
  ]);
  gap(8);

  drawSec('SECTION 11. TOXICOLOGICAL INFORMATION', [
    ['Toxicity', d.toxicity],
  ]);
  gap(8);

  drawSec('SECTION 12. ECOLOGICAL INFORMATION', [
    ['Degradability', d.degradability],
  ]);
  gap(8);

  drawSec('SECTION 13. DISPOSAL CONSIDERATIONS', [
    ['Waste Disposal Methods', d.waste_disposal],
  ]);
  gap(8);

  drawSec('SECTION 14. TRANSPORT INFORMATION', [
    ['DOT Classification',   d.dot_classification],
    ['IATA',                 d.iata],
    ['IMDG',                 d.imdg],
    ['Hazard symbol',        d.hazard_symbol],
    ['Proper Shipping Name', d.proper_shipping_name],
    ['Hazard',               d.hazard],
    ['ID Number',            d.id_number],
    ['Label',                d.label],
  ]);
  gap(7);

  ensureSpace(LH + 4);
  pm.page.drawText('This product is not regulated as a hazardous material for transport.', {
    x: ML, y: pm.y, size: FS, font: regular, color: COL.black,
  });
  pm.y -= LH;
  gap(8);

  drawSec('SECTION 15. REGULATORY INFORMATION', [
    ['Regulatory Information', d.regulatory_info || 'Not available'],
  ]);
  gap(10);

  drawSecText('SECTION 16. ADDITIONAL INFORMATION',
    d.additional_info ||
    'This information is provided for documentation purposes only. This product is not ' +
    'considered hazardous. The complete range of conditions or methods of use are beyond ' +
    'our control therefore we do not assume any responsibility and expressly disclaim any ' +
    'liability for any use of this product. Information contained herein is believed to be ' +
    'true and accurate however, all statements or suggestions are made without warranty, ' +
    'expressed or implied, regarding accuracy of the information, the hazards connected ' +
    'with the use of the material or the results to be obtained from the use thereof. ' +
    'Compliance with all applicable federal, state, and local laws and local regulations ' +
    'remains the responsibility of the user. This safety sheet cannot cover all possible ' +
    'situations which the user may experience during processing. Each aspect of your ' +
    'operation should be examined to determine if, or were, additional precautions may be ' +
    'necessary. All health and safety information contained in this bulletin should be ' +
    'provided to your employees or customer');

  // ── Signature area ────────────────────────────────────────────────
  ensureSpace(50);
  pm.y -= 16;
  await drawSignatureArea(pm.page, regular, pm.y, doc, d);

  // ── Close last page ───────────────────────────────────────────────
  drawPageFooter(pm.page, regular, pm.num, pm.num > 1);

  return await doc.save();
}

// ═══════════════════════════════════════════════════════════════════════
// WATERMARK
// ═══════════════════════════════════════════════════════════════════════
function drawWatermark(page, logoImg) {
  if (!logoImg) return;
  const wW = 300;
  const wH = (logoImg.height / logoImg.width) * wW;
  page.drawImage(logoImg, {
    x:       PW / 2 - wW / 2,
    y:       PH / 2 - wH / 2,
    width:   wW,
    height:  wH,
    opacity: 0.05,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE 1 HEADER — full header (same branding as COA)
// ═══════════════════════════════════════════════════════════════════════
function drawPage1Header(page, bold, regular, boldObl, logoImg) {
  page.drawText('MADURAS HERBALS', {
    x: ML, y: PH - 36,
    size: 18, font: bold, color: COL.black,
  });
  page.drawText('Connecting Nature to You', {
    x: ML, y: PH - 49,
    size: 8, font: boldObl, color: COL.sectionHeader,
  });

  if (logoImg) {
    const logoW = 155;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    page.drawImage(logoImg, {
      x:      PW / 2 - logoW / 2 + 18,
      y:      PH + 10 - logoH,
      width:  logoW,
      height: logoH,
    });
  }

  const contacts = [
    'Phone: +9173390 22047',
    '+91 75025 49477',
    'Email: hello@madurasherbals.com',
    'Website: www.madurasherbals.com',
  ];
  contacts.forEach((line, i) => {
    const tw = regular.widthOfTextAtSize(line, 8);
    page.drawText(line, {
      x: PW - MR - tw, y: PH - 18 - i * 13,
      size: 8, font: regular, color: COL.black,
    });
  });

  page.drawRectangle({ x: ML, y: PH - 74, width: CW, height: 5, color: COL.red });
}

// ═══════════════════════════════════════════════════════════════════════
// CONTINUATION HEADER — small logo left, Doc No / Date right
// ═══════════════════════════════════════════════════════════════════════
function drawMiniHeader(page, regular, logoImg, docNo, docDate) {
  if (logoImg) {
    const logoW = 75;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    page.drawImage(logoImg, {
      x: ML, y: PH - 8 - logoH,
      width: logoW, height: logoH,
    });
  }

  const dnText = 'Doc No: ' + docNo;
  const dtText = 'Date: '   + docDate;
  page.drawText(dnText, {
    x: PW - MR - regular.widthOfTextAtSize(dnText, 8),
    y: PH - 20,
    size: 8, font: regular, color: COL.black,
  });
  page.drawText(dtText, {
    x: PW - MR - regular.widthOfTextAtSize(dtText, 8),
    y: PH - 32,
    size: 8, font: regular, color: COL.black,
  });

  page.drawRectangle({ x: ML, y: PH - 58, width: CW, height: 5, color: COL.red });
}

// ═══════════════════════════════════════════════════════════════════════
// FOOTER — green bar, website left, page number right
// ═══════════════════════════════════════════════════════════════════════
function drawPageFooter(page, regular, pageNum, withPrefix) {
  page.drawRectangle({ x: ML, y: 42, width: CW, height: 3, color: COL.sectionHeader });
  page.drawText('www.madurasherbals.com', {
    x: ML, y: 28, size: 7.5, font: regular, color: COL.black,
  });
  const label = withPrefix ? 'Page | ' + pageNum : String(pageNum);
  page.drawText(label, {
    x: PW - MR - regular.widthOfTextAtSize(label, 7.5),
    y: 28, size: 7.5, font: regular, color: COL.black,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TEXT WRAPPING
// ═══════════════════════════════════════════════════════════════════════
function wrapText(font, text, size, maxWidth) {
  const str    = String(text ?? 'N/A');
  const result = [];
  for (const para of str.split('\n')) {
    const words = para.trim().split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : ['N/A'];
}

// ═══════════════════════════════════════════════════════════════════════
// TABLE ROW — dynamic height
// ═══════════════════════════════════════════════════════════════════════
function drawRow(page, bold, regular, y, labelStr, valueStr) {
  const labLines = wrapText(bold,    labelStr,          FS, LW - 10);
  const valLines = wrapText(regular, valueStr ?? 'N/A', FS, VW - 12);
  const n  = Math.max(labLines.length, valLines.length);
  const rh = n * LH + 2 * RPAD;

  page.drawRectangle({
    x: ML, y: y - rh, width: CW, height: rh,
    color: COL.rowWhite,
    borderColor: COL.border, borderWidth: 0.3,
  });

  page.drawLine({
    start: { x: ML + LW, y },
    end:   { x: ML + LW, y: y - rh },
    thickness: 0.5, color: COL.border,
  });

  const labBlockH = labLines.length * LH;
  const labY0 = y - (rh - labBlockH) / 2 - FS * 0.85;
  labLines.forEach((line, i) => {
    const tw = bold.widthOfTextAtSize(line, FS);
    page.drawText(line, {
      x: ML + (LW - tw) / 2,
      y: labY0 - i * LH,
      size: FS, font: bold, color: COL.black,
    });
  });

  const valBlockH = valLines.length * LH;
  const valY0 = y - (rh - valBlockH) / 2 - FS * 0.85;
  valLines.forEach((line, i) => {
    const x = valLines.length === 1
      ? ML + LW + (VW - regular.widthOfTextAtSize(line, FS)) / 2
      : ML + LW + 6;
    page.drawText(line, {
      x, y: valY0 - i * LH,
      size: FS, font: regular, color: COL.black,
    });
  });

  return y - rh;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION HEADER BAR
// ═══════════════════════════════════════════════════════════════════════
function drawSectionHeader(page, bold, y, title) {
  const rh = 20;
  page.drawRectangle({ x: ML, y: y - rh, width: CW, height: rh, color: COL.sectionHeader });
  page.drawText(title, {
    x: ML + 5, y: y - rh + 6,
    size: 9, font: bold, color: COL.white,
  });
  return y - rh;
}

// ═══════════════════════════════════════════════════════════════════════
// SIGNATURE AREA
// ═══════════════════════════════════════════════════════════════════════
async function drawSignatureArea(page, regular, y, doc, d) {
  if (d._sigOption === 1) {
    const text = 'This is a computer-generated document and does not require a signature.';
    page.drawText(text, { x: ML, y, size: 8, font: regular, color: COL.black });
  } else if (d._sigOption === 2 && d._sigBytes) {
    try {
      let sigImg;
      try { sigImg = await doc.embedPng(d._sigBytes); }
      catch { sigImg = await doc.embedJpg(d._sigBytes); }
      const sigW = 130;
      const sigH = (sigImg.height / sigImg.width) * sigW;
      page.drawImage(sigImg, { x: ML + 20, y: y - sigH + 10, width: sigW, height: sigH });
    } catch (e) { console.warn('[MSDS] Signature embed failed:', e); }
  }
}
