// =====================================================================
// coa.js — COA Template PDF Generator (Maduras Herbals)
// =====================================================================

import {
  PDFDocument,
  rgb,
  StandardFonts,
} from './pdf-lib.esm.js';

// ── Colours ───────────────────────────────────────────────────────────
const COL = {
  tableHeader: rgb(0.369, 0.647, 0),
  rowAlt:      rgb(0.88, 0.94, 0.88),
  rowWhite:    rgb(1, 1, 1),
  red:         rgb(1, 0, 0),
  black:       rgb(0, 0, 0),
  white:       rgb(1, 1, 1),
};

// ── Page geometry (A4 portrait) ───────────────────────────────────────
const PW = 595.28;
const PH = 841.89;
const ML = 60;
const MR = 60;
const CW = PW - ML - MR;

// ── Minimum y before footer area ─────────────────────────────────────
const FOOT_Y_COA = 100;

// ── Auto-incrementing doc number (persisted in localStorage) ──────────
function getNextDocNumber() {
  const key  = 'maduras_docNum_coa';
  const next = (parseInt(localStorage.getItem(key) || '0', 10)) + 1;
  localStorage.setItem(key, String(next));
  return 'COA-' + String(next).padStart(5, '0');
}

function todayFormatted() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

// ── Public entry point ────────────────────────────────────────────────
export async function generatePDF(d, _fileName) {
  const doc         = await PDFDocument.create();
  const bold        = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular     = await doc.embedFont(StandardFonts.Helvetica);
  const boldOblique = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  let logoImg = null;
  try {
    const logoUrl   = new URL('./logo.png', import.meta.url).href;
    const logoBytes = await fetch(logoUrl).then(r => r.arrayBuffer());
    logoImg = await doc.embedPng(logoBytes);
  } catch (e) {
    console.warn('[COA] Logo load failed:', e.message);
  }

  const docNo   = d._docNo   || getNextDocNumber();
  const docDate = d._docDate || todayFormatted();

  // Context passed to table functions for overflow handling
  const ctx = { doc, page: doc.addPage([PW, PH]), bold, regular, boldOblique, logoImg, docNo, docDate };

  drawWatermark(ctx.page, logoImg);
  drawHeader(ctx.page, bold, regular, boldOblique, logoImg);
  const y1 = drawProductInfo(ctx.page, bold, regular, d);

  if (d.sections && Array.isArray(d.sections) && d.sections.length) {
    // Dynamic sections mode
    let y = y1 - 20;
    for (const sec of d.sections) {
      y = drawDynamicCOASection(ctx, sec, y) - 16;
    }
    await drawFooterArea(ctx.page, bold, regular, y - 12, doc, d);
  } else {
    // Legacy mode — flat extracted fields
    const y2 = drawSensoryTable(ctx, d, y1 - 20);
    const y3 = drawAnalyticalTable(ctx, d, y2 - 16);
    const y4 = drawMicroTable(ctx, d, y3 - 16);
    await drawFooterArea(ctx.page, bold, regular, y4 - 28, doc, d);
  }
  drawBottomBar(ctx.page, bold, regular, docNo, docDate);

  return await doc.save();
}

// ── Create a continuation page for COA ───────────────────────────────
function newCOAPage(ctx) {
  const page = ctx.doc.addPage([PW, PH]);
  drawCOAMiniHeader(page, ctx.bold, ctx.regular, ctx.boldOblique, ctx.logoImg, ctx.docNo, ctx.docDate);
  ctx.page = page;
  return page;
}

// ── Mini header for COA continuation pages ───────────────────────────
function drawCOAMiniHeader(page, bold, regular, boldOblique, logoImg, docNo, docDate) {
  if (logoImg) {
    const logoW = 75;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    page.drawImage(logoImg, { x: ML, y: PH - 8 - logoH, width: logoW, height: logoH });
  }
  const title = 'CERTIFICATE OF ANALYSIS (CONTINUED)';
  const tw    = bold.widthOfTextAtSize(title, 10);
  page.drawText(title, { x: PW / 2 - tw / 2, y: PH - 28, size: 10, font: bold, color: COL.black });
  const dnText = 'Doc No: ' + docNo;
  const dtText = 'Date: '   + docDate;
  page.drawText(dnText, { x: PW - MR - regular.widthOfTextAtSize(dnText, 8), y: PH - 18, size: 8, font: regular, color: COL.black });
  page.drawText(dtText, { x: PW - MR - regular.widthOfTextAtSize(dtText, 8), y: PH - 30, size: 8, font: regular, color: COL.black });
  page.drawRectangle({ x: ML, y: PH - 50, width: CW, height: 4, color: COL.red });
}

// ═══════════════════════════════════════════════════════════════════════
// WATERMARK — logo centred on page, very low opacity
// ═══════════════════════════════════════════════════════════════════════
function drawWatermark(page, logoImg) {
  if (!logoImg) return;
  const wW = 380;
  const wH = (logoImg.height / logoImg.width) * wW;
  page.drawImage(logoImg, {
    x:       PW / 2 - wW / 2,
    y:       PH / 2 - wH / 2 - 30,
    width:   wW,
    height:  wH,
    opacity: 0.5,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// HEADER — name, logo, contacts, ONE red line, title
// ═══════════════════════════════════════════════════════════════════════
function drawHeader(page, bold, regular, boldOblique, logoImg) {
  page.drawText('MADURAS HERBALS', {
    x: ML, y: PH - 36,
    size: 18, font: bold, color: COL.black,
  });
  page.drawText('Connecting Nature to You', {
    x: ML, y: PH - 49,
    size: 8, font: boldOblique, color: rgb(0.369, 0.647, 0),
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
    'Phone: +91 73390 22047',
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

  // ONE red line under header
  page.drawRectangle({ x: ML, y: PH - 74, width: CW, height: 5, color: COL.red });

  const title = 'CERTIFICATE OF ANALYSIS';
  const tW    = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: PW / 2 - tW / 2, y: PH - 96,
    size: 14, font: bold, color: COL.black,
  });
  page.drawLine({
    start: { x: PW / 2 - tW / 2, y: PH - 98 },
    end:   { x: PW / 2 + tW / 2, y: PH - 98 },
    thickness: 1, color: COL.black,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCT INFO
// ═══════════════════════════════════════════════════════════════════════
function drawProductInfo(page, bold, regular, d) {
  const fields = [
    ['Product Name',        d.product_name],
    ['Botanical Name',      d.botanical_name],
    ['Country of Origin',   d.country_of_origin],
    ['Batch Size',          d.batch_size],
    ['Batch no',            d.batch_no],
    ['Date of Manufacture', d.date_of_manufacture],
    ['Date of Expiry',      d.date_of_expiry],
  ];
  let y = PH - 120;
  fields.forEach(([label, value]) => {
    page.drawText(label + ':', { x: ML, y, size: 9.5, font: bold,    color: COL.black });
    page.drawText(String(value ?? 'N/A'), { x: ML + 125, y, size: 9.5, font: regular, color: COL.black });
    y -= 21;
  });
  return y;
}

// ═══════════════════════════════════════════════════════════════════════
// TABLE HELPERS
// ═══════════════════════════════════════════════════════════════════════
function drawTableHeader(page, bold, y, cols) {
  const rh = 20;
  page.drawRectangle({ x: ML, y: y - rh, width: CW, height: rh, color: COL.tableHeader });
  cols.forEach(({ label, x, w }, i) => {
    // vertical divider between columns
    if (i > 0) {
      page.drawLine({
        start: { x, y: y },
        end:   { x, y: y - rh },
        thickness: 0.5, color: rgb(0.9, 0.9, 0.9),
      });
    }
    if (!label) return;
    const tw = bold.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: x + w / 2 - tw / 2, y: y - rh + 6, size: 9, font: bold, color: COL.white });
  });
  return y - rh;
}

function drawTableRow(page, regular, y, cols, values, alt) {
  const rh = 18;
  page.drawRectangle({
    x: ML, y: y - rh, width: CW, height: rh,
    color: alt ? COL.rowAlt : COL.rowWhite,
  });
  page.drawRectangle({
    x: ML, y: y - rh, width: CW, height: rh,
    borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.3, color: undefined,
  });
  cols.forEach(({ x, w }, i) => {
    // vertical divider between columns
    if (i > 0) {
      page.drawLine({
        start: { x, y: y },
        end:   { x, y: y - rh },
        thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
      });
    }
    const val = String(values[i] ?? 'N/A');
    const tw  = regular.widthOfTextAtSize(val, 9);
    page.drawText(val, { x: x + w / 2 - tw / 2, y: y - rh + 5, size: 9, font: regular, color: COL.black });
  });
  return y - rh;
}

// ═══════════════════════════════════════════════════════════════════════
// DYNAMIC COA SECTION — 2-col or 3-col, fully user-defined
// ═══════════════════════════════════════════════════════════════════════
function drawDynamicCOASection(ctx, sec, startY) {
  const { bold, regular } = ctx;
  const is3col = sec.type === '3col';

  let cols;
  if (is3col) {
    const w1 = CW * 0.38, w2 = CW * 0.35, w3 = CW * 0.27;
    cols = [
      { label: (sec.title || '').toUpperCase(), x: ML,           w: w1 },
      { label: 'SPECIFIED REQUIREMENT',          x: ML + w1,      w: w2 },
      { label: 'RESULT',                         x: ML + w1 + w2, w: w3 },
    ];
  } else {
    const half = CW / 2;
    cols = [
      { label: (sec.title || '').toUpperCase(), x: ML,        w: half },
      { label: '',                               x: ML + half, w: half },
    ];
  }

  let y = startY;
  if (y - 20 - 18 < FOOT_Y_COA) { newCOAPage(ctx); y = PH - 65; }
  y = drawTableHeader(ctx.page, bold, y, cols);

  let altIdx = 0;
  for (const row of sec.rows || []) {
    if (y - 18 < FOOT_Y_COA) {
      newCOAPage(ctx);
      y = PH - 65;
      y = drawTableHeader(ctx.page, bold, y, cols);
      altIdx = 0;
    }
    const values = is3col ? [row.c1, row.c2, row.c3] : [row.c1, row.c2];
    y = drawTableRow(ctx.page, regular, y, cols, values, altIdx % 2 === 0);
    altIdx++;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════
// SENSORY TABLE
// ═══════════════════════════════════════════════════════════════════════
function drawSensoryTable(ctx, d, startY) {
  const { bold, regular } = ctx;
  const half = CW / 2;
  const col1 = { label: 'SENSORY DATA', x: ML,       w: half };
  const col2 = { label: '',             x: ML + half, w: half };

  // Ensure space for header + at least one row
  let y = startY;
  if (y - 20 - 18 < FOOT_Y_COA) {
    newCOAPage(ctx);
    y = PH - 65;
  }
  y = drawTableHeader(ctx.page, bold, y, [col1, col2]);

  let rows;
  if (Array.isArray(d.sensory_data)) {
    rows = d.sensory_data.map(r => [r.label, r.value]);
  } else {
    const sd = d.sensory_data || {};
    rows = [
      ['Appearance', sd.appearance],
      ['Color',      sd.color],
      ['Odor',       sd.odor],
      ['Solubility', sd.solubility],
    ];
  }

  let altIdx = 0;
  for (const [p, v] of rows) {
    if (y - 18 < FOOT_Y_COA) {
      newCOAPage(ctx);
      y = PH - 65;
      y = drawTableHeader(ctx.page, bold, y, [col1, col2]);
      altIdx = 0;
    }
    y = drawTableRow(ctx.page, regular, y, [col1, col2], [p, v ?? 'N/A'], altIdx % 2 === 0);
    altIdx++;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYTICAL TABLE
// ═══════════════════════════════════════════════════════════════════════
function drawAnalyticalTable(ctx, d, startY) {
  const { bold, regular } = ctx;
  const w1 = CW * 0.38, w2 = CW * 0.35, w3 = CW * 0.27;
  const cols = [
    { label: 'ANALYTICAL DATA',       x: ML,          w: w1 },
    { label: 'SPECIFIED REQUIREMENT', x: ML + w1,      w: w2 },
    { label: 'RESULT (%)',            x: ML + w1 + w2, w: w3 },
  ];

  let rows;
  if (d._edited) {
    rows = d.analytical_data || [];
  } else {
    const defaults = ['Moisture', 'Total Ash', 'pH (in 5%)', 'Bulk Density g/ml'];
    const src      = d.analytical_data || [];
    const covered  = new Set(defaults.map(p => p.toLowerCase()));
    const extras   = src.filter(r => !covered.has((r.parameter || '').toLowerCase()));
    rows = [
      ...defaults.map(p => {
        const m = src.find(r => r.parameter && r.parameter.toLowerCase().includes(p.toLowerCase().split(' ')[0]));
        return { parameter: p, specification: m?.specification ?? 'N/A', result: m?.result ?? 'N/A' };
      }),
      ...extras,
    ];
  }

  let y = startY;
  if (y - 20 - 18 < FOOT_Y_COA) {
    newCOAPage(ctx);
    y = PH - 65;
  }
  y = drawTableHeader(ctx.page, bold, y, cols);

  let altIdx = 0;
  for (const r of rows) {
    if (y - 18 < FOOT_Y_COA) {
      newCOAPage(ctx);
      y = PH - 65;
      y = drawTableHeader(ctx.page, bold, y, cols);
      altIdx = 0;
    }
    y = drawTableRow(ctx.page, regular, y, cols, [r.parameter, r.specification, r.result], altIdx % 2 === 0);
    altIdx++;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════
// MICROBIOLOGICAL TABLE
// ═══════════════════════════════════════════════════════════════════════
function drawMicroTable(ctx, d, startY) {
  const { bold, regular } = ctx;
  const w1 = CW * 0.38, w2 = CW * 0.35, w3 = CW * 0.27;
  const cols = [
    { label: 'MICROBIOLOGICAL DATA',  x: ML,           w: w1 },
    { label: 'SPECIFIED REQUIREMENT', x: ML + w1,       w: w2 },
    { label: 'RESULT',               x: ML + w1 + w2,  w: w3 },
  ];

  let rows;
  if (d._edited) {
    rows = d.microbiological_data || [];
  } else {
    const defaults = ['Total Plate Count', 'Yeast & Mould', 'E. Coli', 'Salmonella / 25g'];
    const src      = d.microbiological_data || [];
    rows = defaults.map(p => {
      const m = src.find(r => r.parameter && r.parameter.toLowerCase().includes(p.toLowerCase().split(' ')[0]));
      return { parameter: p, specification: m?.specification ?? 'N/A', result: m?.result ?? 'N/A' };
    });
  }

  let y = startY;
  if (y - 20 - 18 < FOOT_Y_COA) {
    newCOAPage(ctx);
    y = PH - 65;
  }
  y = drawTableHeader(ctx.page, bold, y, cols);

  let altIdx = 0;
  for (const r of rows) {
    if (y - 18 < FOOT_Y_COA) {
      newCOAPage(ctx);
      y = PH - 65;
      y = drawTableHeader(ctx.page, bold, y, cols);
      altIdx = 0;
    }
    y = drawTableRow(ctx.page, regular, y, cols, [r.parameter, r.specification, r.result], altIdx % 2 === 0);
    altIdx++;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════
// FOOTER AREA — disclaimer + signature labels
// ═══════════════════════════════════════════════════════════════════════
async function drawFooterArea(page, bold, regular, y, doc, d) {
  page.drawText('*Properties may change season to season & Batch to Batch', {
    x: ML, y: y - 10, size: 9, font: regular, color: COL.black,
  });
  const sigY = y - 32;

  if (d._sigOption === 1) {
    const text = 'This is a computer-generated document and does not require a signature.';
    page.drawText(text, { x: ML, y: sigY, size: 8.5, font: regular, color: COL.black });
  } else if (d._sigOption === 2 && d._sigBytes) {
    try {
      let sigImg;
      try { sigImg = await doc.embedPng(d._sigBytes); }
      catch { sigImg = await doc.embedJpg(d._sigBytes); }
      const sigW = 130;
      const sigH = (sigImg.height / sigImg.width) * sigW;
      page.drawImage(sigImg, { x: ML + 20, y: sigY - sigH + 10, width: sigW, height: sigH });
    } catch (e) { console.warn('[COA] Signature embed failed:', e); }
  } else {
    page.drawText('Analyst',     { x: ML + 30, y: sigY, size: 9, font: bold, color: COL.black });
    page.drawText('QC Approved', {
      x: PW - MR - bold.widthOfTextAtSize('QC Approved', 9) - 30,
      y: sigY, size: 9, font: bold, color: COL.black,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BOTTOM BAR — red line, Doc No (auto-incrementing), Date (today)
// ═══════════════════════════════════════════════════════════════════════
function drawBottomBar(page, _bold, regular, docNo, docDate) {
  page.drawRectangle({ x: ML, y: 42, width: CW, height: 5, color: COL.tableHeader });
  page.drawText('Doc No: ' + docNo,  { x: ML, y: 30, size: 7.5, font: regular, color: COL.black });
  page.drawText('Date: '  + docDate, { x: ML, y: 20, size: 7.5, font: regular, color: COL.black });
}
