/* ================================================
   KARIPAP BONDA — Documents Module (PO & Invoice)
   ================================================ */

'use strict';

// ===== STATE =====
const state = {
  activeTab: 'po',
  zoom: 1,
  saved: JSON.parse(localStorage.getItem('kb_docs') || '[]'),
};

// ===== HELPERS =====
const $ = id => document.getElementById(id);
const fmt = (n, sym = 'RM') => `${sym} ${Number(n).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];
const addDays = (d, n) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
};
const fmtDate = s => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[+m - 1]} ${y}`;
};
const genDocNum = prefix => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(state.saved.filter(d => d.type === prefix).length + 1).padStart(4, '0');
  return `${prefix}-${yy}${mm}-${seq}`;
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Show logged-in user
  const session = Auth.session();
  if (session) {
    $('topbarUser').innerHTML =
      `<span class="topbar-user-badge"><i class="bi bi-person-circle me-1"></i>${escHtml(session.displayName)}</span>`;
  }

  // Logout
  $('btnLogout').addEventListener('click', () => Auth.logout());

  initDates();
  initDocNumbers();
  addRow('po'); addRow('po');
  addRow('inv'); addRow('inv');
  bindEvents();
  updatePreview();
});

function initDates() {
  $('poDate').value = today();
  $('poDeliveryDate').value = addDays(today(), 7);
  $('invDate').value = today();
  $('invDueDate').value = addDays(today(), 14);
}

function initDocNumbers() {
  $('poNumber').value = genDocNum('PO');
  $('invNumber').value = genDocNum('INV');
}

// ===== EVENT BINDING =====
function bindEvents() {
  document.querySelectorAll('.doc-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('poAddRow').addEventListener('click', () => addRow('po'));
  $('invAddRow').addEventListener('click', () => addRow('inv'));

  document.addEventListener('input', () => { calcTotals(state.activeTab); updatePreview(); });
  document.addEventListener('change', () => { calcTotals(state.activeTab); updatePreview(); });

  $('btnPrint').addEventListener('click', () => window.print());
  $('btnPrint2').addEventListener('click', () => window.print());
  $('btnPreview').addEventListener('click', () => {
    $('previewPanel').scrollIntoView({ behavior: 'smooth' });
  });
  $('btnSave').addEventListener('click', saveDoc);
  $('btnReset').addEventListener('click', resetForm);
  $('btnNewDoc').addEventListener('click', resetForm);
  $('btnHistory').addEventListener('click', openHistory);
  $('btnZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('btnZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
}

// ===== TAB SWITCH =====
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.doc-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  $('poForm').classList.toggle('d-none', tab !== 'po');
  $('invForm').classList.toggle('d-none', tab !== 'inv');
  calcTotals(tab);
  updatePreview();
}

// ===== ROW MANAGEMENT =====
function addRow(type) {
  const tbody = $(`${type}ItemsBody`);
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="form-control item-desc" type="text" placeholder="e.g. Karipap Classik (10 pcs)" /></td>
    <td><input class="form-control item-unit" type="text" placeholder="Box" /></td>
    <td><input class="form-control item-qty" type="number" value="1" min="0" step="1" /></td>
    <td><input class="form-control item-price" type="number" value="0.00" min="0" step="0.01" /></td>
    <td class="row-amount">RM 0.00</td>
    <td><button class="btn-remove-row" title="Remove row"><i class="bi bi-x-lg"></i></button></td>
  `;
  tbody.appendChild(tr);

  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    if (tbody.children.length > 1) { tr.remove(); calcTotals(type); updatePreview(); }
  });

  ['item-qty', 'item-price'].forEach(cls => {
    tr.querySelector(`.${cls}`).addEventListener('input', () => {
      updateRowAmount(tr); calcTotals(type); updatePreview();
    });
  });
}

function updateRowAmount(tr) {
  const qty   = parseFloat(tr.querySelector('.item-qty')?.value)   || 0;
  const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
  const amt   = qty * price;
  tr.querySelector('.row-amount').textContent = fmt(amt);
  return amt;
}

function getRows(type) {
  return [...$(`${type}ItemsBody`).querySelectorAll('tr')].map(tr => ({
    desc:   tr.querySelector('.item-desc')?.value.trim()  || '',
    unit:   tr.querySelector('.item-unit')?.value.trim()  || '',
    qty:    parseFloat(tr.querySelector('.item-qty')?.value)    || 0,
    price:  parseFloat(tr.querySelector('.item-price')?.value)  || 0,
    amount: updateRowAmount(tr),
  }));
}

// ===== CALC TOTALS =====
function calcTotals(type) {
  const rows     = getRows(type);
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const taxRate  = parseFloat($(`${type}TaxRate`).value) / 100;

  let discount = 0;
  if (type === 'inv') {
    const dv = parseFloat($('invDiscountValue').value) || 0;
    const dt = $('invDiscountType').value;
    discount = dt === 'pct' ? subtotal * (dv / 100) : Math.min(dv, subtotal);
    $('invDiscountAmt').textContent = `– ${fmt(discount)}`;
    $('invDiscountRow').style.display = dv > 0 ? '' : 'none';
  }

  const taxable = subtotal - discount;
  const tax     = taxable * taxRate;
  const total   = taxable + tax;

  $(`${type}Subtotal`).textContent = fmt(subtotal);
  $(`${type}Tax`).textContent      = fmt(tax);
  $(`${type}Total`).textContent    = fmt(total);
}

// ===== LIVE PREVIEW =====
function updatePreview() {
  state.activeTab === 'po' ? renderPO() : renderInvoice();
}

// ---- PURCHASE ORDER ----
function renderPO() {
  const cur        = 'RM';
  const rows       = getRows('po');
  const subtotal   = rows.reduce((s, r) => s + r.amount, 0);
  const taxRate    = parseFloat($('poTaxRate').value);
  const tax        = subtotal * (taxRate / 100);
  const total      = subtotal + tax;
  const supplierName = $('poSupplierName').value.trim();

  // Header branding — supplier is the principal
  $('pDocLogo').textContent  = '🏢';
  $('pFromName').textContent = supplierName || 'Supplier Name';
  $('pFromReg').textContent  = $('poSupplierSST').value
    ? `SST Reg: ${$('poSupplierSST').value}` : '';
  $('pAgentLine').textContent = 'via Karipap Bonda Enterprise (Authorized Agent)';

  // Doc meta
  $('pDocType').textContent      = 'PURCHASE ORDER';
  $('pDocNumber').textContent    = $('poNumber').value;
  $('pDocDate').textContent      = fmtDate($('poDate').value);
  $('pDocDateLabel2').textContent = 'Delivery Date';
  $('pDocDate2').textContent     = fmtDate($('poDeliveryDate').value);
  setStatusBadge($('poStatus').value);

  // FROM box — Supplier (principal)
  $('pFromLabel').textContent   = 'FROM (SUPPLIER / PRINCIPAL)';
  $('pFromNameBox').textContent = supplierName || '—';
  $('pFromAddr').textContent    = $('poSupplierAddress').value || '—';
  $('pFromContact').textContent = $('poSupplierContact').value
    ? `Contact: ${$('poSupplierContact').value}` : '';
  $('pFromEmail').textContent   = $('poSupplierPhone').value || '';
  $('pFromExtra').textContent   = $('poSupplierEmail').value || '';

  // TO box — Buyer
  $('pToLabel').textContent   = 'BUYER / DELIVER TO';
  const buyerName = $('poBuyerName').value.trim();
  const buyerCo   = $('poBuyerCompany').value.trim();
  $('pToName').textContent    = buyerName || '—';
  $('pToAddress').textContent = buyerCo || '';
  $('pToContact').textContent = $('poBuyerAddress').value || '—';
  $('pToEmail').textContent   = $('poBuyerPhone').value || '';
  $('pToExtra').textContent   = $('poBuyerEmail').value || '';

  renderPreviewItems(rows, cur);

  $('pSubtotal').textContent  = fmt(subtotal, cur);
  $('pTaxLabel').textContent  = `SST (${taxRate}%)`;
  $('pTaxAmt').textContent    = fmt(tax, cur);
  $('pGrandTotal').textContent = fmt(total, cur);
  $('pTotalLabel').textContent = 'Total';
  $('pDiscountTr').classList.add('d-none');

  const notes = $('poDeliveryNotes').value;
  $('pNotes').innerHTML = notes
    ? `<strong>Delivery Instructions:</strong><br>${escHtml(notes)}` : '';
  $('pTerms').textContent = $('poTerms').value;
  $('pBankBlock').classList.add('d-none');

  $('pSigLabel1').textContent = `Authorised — ${supplierName || 'Supplier'}`;
  $('pSigLabel2').textContent = 'Received / Acknowledged';
  $('pFooterNote').textContent =
    `This Purchase Order is prepared by Karipap Bonda Enterprise as Authorized Agent` +
    (supplierName ? ` on behalf of ${supplierName}` : '') +
    ` • hello@karipapbonda.my`;
}

// ---- INVOICE ----
function renderInvoice() {
  const sym      = $('invCurrency').value;
  const rows     = getRows('inv');
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const taxRate  = parseFloat($('invTaxRate').value);
  const dv       = parseFloat($('invDiscountValue').value) || 0;
  const dt       = $('invDiscountType').value;
  const discount = dt === 'pct' ? subtotal * (dv / 100) : Math.min(dv, subtotal);
  const taxable  = subtotal - discount;
  const tax      = taxable * (taxRate / 100);
  const total    = taxable + tax;

  // Header branding — Karipap Bonda is the issuer
  $('pDocLogo').textContent  = '🥟';
  $('pFromName').textContent = 'Karipap Bonda Enterprise';
  $('pFromReg').textContent  = '(002345678-K)';
  $('pAgentLine').textContent = '';

  // Doc meta
  $('pDocType').textContent       = 'INVOICE';
  $('pDocNumber').textContent     = $('invNumber').value;
  $('pDocDate').textContent       = fmtDate($('invDate').value);
  $('pDocDateLabel2').textContent = 'Due Date';
  $('pDocDate2').textContent      = fmtDate($('invDueDate').value);
  setStatusBadge($('invStatus').value);

  // FROM box — Karipap Bonda
  $('pFromLabel').textContent   = 'FROM';
  $('pFromNameBox').textContent = 'Karipap Bonda Enterprise';
  $('pFromAddr').textContent    = 'No. 12, Jalan Bonda Maju, Kampung Baru';
  $('pFromContact').textContent = '50300 Kuala Lumpur, Malaysia';
  $('pFromEmail').textContent   = '+60 12-345 6789 | hello@karipapbonda.my';
  $('pFromExtra').textContent   = 'SST: W10-1234-12345678';

  // TO box — Customer
  $('pToLabel').textContent   = 'BILL TO (CUSTOMER)';
  const custName = $('invCustomerName').value;
  const custCo   = $('invCustomerCompany').value;
  $('pToName').textContent    = custName || '—';
  $('pToAddress').textContent = custCo || '';
  $('pToContact').textContent = $('invCustomerAddress').value || '—';
  $('pToEmail').textContent   = $('invCustomerPhone').value || '';
  $('pToExtra').textContent   = $('invCustomerEmail').value || '';

  renderPreviewItems(rows, sym);

  $('pSubtotal').textContent   = fmt(subtotal, sym);
  $('pTaxLabel').textContent   = `SST (${taxRate}%)`;
  $('pTaxAmt').textContent     = fmt(tax, sym);
  $('pGrandTotal').textContent = fmt(total, sym);
  $('pTotalLabel').textContent = 'Total Due';

  if (dv > 0) {
    $('pDiscountTr').classList.remove('d-none');
    $('pDiscount').textContent = `– ${fmt(discount, sym)}`;
  } else {
    $('pDiscountTr').classList.add('d-none');
  }

  const notes = $('invNotes').value;
  const terms = $('invPaymentTerms').value;
  $('pNotes').innerHTML = notes
    ? `<strong>Note:</strong><br>${escHtml(notes)}`
    : `<strong>Payment Terms:</strong> ${escHtml(terms)}`;

  const bank    = $('invBankName').value;
  const acc     = $('invBankAcc').value;
  const acName  = $('invBankName2').value;
  const duitnow = $('invDuitNow').value;

  if (bank || acc) {
    $('pBankBlock').classList.remove('d-none');
    $('pBankDetails').innerHTML = [
      bank    && `<div>${escHtml(bank)}</div>`,
      acName  && `<div>${escHtml(acName)}</div>`,
      acc     && `<div>Acc: ${escHtml(acc)}</div>`,
      duitnow && `<div>DuitNow: ${escHtml(duitnow)}</div>`,
    ].filter(Boolean).join('');
  } else {
    $('pBankBlock').classList.add('d-none');
  }

  $('pTerms').textContent    = '';
  $('pSigLabel1').textContent = 'Authorised — Karipap Bonda';
  $('pSigLabel2').textContent = 'Customer Signature';
  $('pFooterNote').textContent =
    'Karipap Bonda Enterprise (002345678-K) • hello@karipapbonda.my • +60 12-345 6789';
}

function renderPreviewItems(rows, sym) {
  const tbody  = $('pItemsBody');
  const filled = rows.filter(r => r.desc || r.qty || r.price);
  if (!filled.length) {
    tbody.innerHTML = `<tr class="pdoc-empty-row"><td colspan="6">No items added yet</td></tr>`;
    return;
  }
  tbody.innerHTML = filled.map((r, i) => `
    <tr>
      <td class="col-no">${i + 1}</td>
      <td class="col-desc">${escHtml(r.desc) || '<em style="color:#ccc">—</em>'}</td>
      <td class="col-unit" style="text-align:center">${escHtml(r.unit)}</td>
      <td class="col-qty" style="text-align:center">${r.qty}</td>
      <td class="col-price" style="text-align:right">${sym} ${r.price.toFixed(2)}</td>
      <td class="col-amount" style="text-align:right">${sym} ${r.amount.toFixed(2)}</td>
    </tr>
  `).join('');
}

function setStatusBadge(val) {
  const el = $('pDocStatus');
  el.textContent = val.charAt(0).toUpperCase() + val.slice(1).replace('-', ' ');
  el.className = `pdoc-status-badge status-${val}`;
}

// ===== ZOOM =====
function setZoom(z) {
  state.zoom = Math.min(Math.max(z, 0.4), 1.4);
  $('printableDoc').style.transform       = `scale(${state.zoom})`;
  $('printableDoc').style.transformOrigin = 'top center';
  $('previewScaler').style.minHeight      = `${Math.round(900 * state.zoom)}px`;
}

// ===== SAVE =====
function saveDoc() {
  const t      = state.activeTab;
  const rows   = getRows(t);
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);

  const party = t === 'po'
    ? ($('poSupplierName').value || $('poBuyerName').value)
    : $('invCustomerName').value;

  const doc = {
    id:      Date.now(),
    type:    t,
    number:  t === 'po' ? $('poNumber').value : $('invNumber').value,
    date:    t === 'po' ? $('poDate').value   : $('invDate').value,
    party,
    total:   subtotal,
    status:  t === 'po' ? $('poStatus').value : $('invStatus').value,
    savedAt: new Date().toISOString(),
    savedBy: Auth.session()?.displayName || 'Unknown',
  };

  state.saved.unshift(doc);
  localStorage.setItem('kb_docs', JSON.stringify(state.saved));

  if (t === 'po') $('poNumber').value  = genDocNum('PO');
  else            $('invNumber').value = genDocNum('INV');

  showToast(`<i class="bi bi-check-circle-fill me-2"></i>${doc.number} saved!`);
}

// ===== RESET =====
function resetForm() {
  const t = state.activeTab;
  if (t === 'po') {
    [
      'poSupplierName','poSupplierAddress','poSupplierContact',
      'poSupplierPhone','poSupplierEmail','poSupplierSST',
      'poBuyerName','poBuyerCompany','poBuyerAddress','poBuyerPhone','poBuyerEmail',
      'poDeliveryNotes','poTerms',
    ].forEach(id => $(id).value = '');
    $('poItemsBody').innerHTML = '';
    addRow('po'); addRow('po');
    $('poDate').value         = today();
    $('poDeliveryDate').value = addDays(today(), 7);
    $('poStatus').value       = 'draft';
  } else {
    [
      'invCustomerName','invCustomerCompany','invCustomerAddress',
      'invCustomerPhone','invCustomerEmail','invNotes',
    ].forEach(id => $(id).value = '');
    $('invDiscountValue').value = 0;
    $('invItemsBody').innerHTML = '';
    addRow('inv'); addRow('inv');
    $('invDate').value    = today();
    $('invDueDate').value = addDays(today(), 14);
    $('invStatus').value  = 'draft';
  }
  calcTotals(t);
  updatePreview();
}

// ===== HISTORY =====
function openHistory() {
  const body = $('historyBody');
  if (!state.saved.length) {
    body.innerHTML = '<p class="text-muted text-center py-4">No saved documents yet.</p>';
  } else {
    body.innerHTML = state.saved.map(doc => `
      <div class="history-item">
        <div class="d-flex align-items-center gap-3">
          <span class="history-badge ${doc.type}">${doc.type === 'po' ? 'PO' : 'INV'}</span>
          <div>
            <div class="fw-semibold small">${escHtml(doc.number)}</div>
            <div class="text-muted" style="font-size:.75rem">
              ${escHtml(doc.party || '—')} &bull; ${fmtDate(doc.date)}
              ${doc.savedBy ? `<span class="ms-2 text-gold-muted">by ${escHtml(doc.savedBy)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-3">
          <span class="history-status status-${doc.status}">${escHtml(doc.status)}</span>
          <div class="fw-bold small">RM ${doc.total.toFixed(2)}</div>
          <button class="btn btn-sm btn-outline-danger btn-delete-hist" data-id="${doc.id}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    body.querySelectorAll('.btn-delete-hist').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        state.saved = state.saved.filter(d => d.id !== id);
        localStorage.setItem('kb_docs', JSON.stringify(state.saved));
        openHistory();
      });
    });
  }
  new bootstrap.Modal($('historyModal')).show();
}

// ===== TOAST =====
function showToast(msg) {
  $('toastMsg').innerHTML = msg;
  bootstrap.Toast.getOrCreateInstance($('saveToast')).show();
}

// ===== SECURITY: HTML ESCAPE =====
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
