/* ================================================
   KARIPAP BONDA — Documents Module (PO & Invoice)
   ================================================ */

'use strict';

// ===== STATE =====
const state = {
  activeTab: 'po',
  zoom: 1,
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
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(DB.countByType(prefix) + 1).padStart(4, '0');
  return `${prefix}-${yy}${mm}-${seq}`;
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  DB.init();

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

  // Try to auto-reconnect to previously selected file
  const ac = await DB.autoConnect();
  if (ac.needsGesture) {
    $('reconnectMsg').textContent = `"${ac.name}" found — tap to reconnect.`;
    $('reconnectBanner').classList.remove('d-none');
    $('btnReconnect').addEventListener('click', async () => {
      const r = await DB.reconnect();
      if (r.ok) {
        $('reconnectBanner').classList.add('d-none');
        showToast(`<i class="bi bi-hdd-fill me-2"></i>Reconnected to <strong>${r.name}</strong>`);
        refreshRecords();
      }
    }, { once: true });
  }

  refreshRecords();
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

  $('btnConnectDb').addEventListener('click', async () => {
    const result = await DB.connect();
    if (result.ok) {
      showToast(`<i class="bi bi-hdd-fill me-2"></i>Connected to <strong>${result.name}</strong>`);
      $('reconnectBanner').classList.add('d-none');
      refreshRecords();
    } else if (result.msg !== 'cancelled') {
      showToast(`<i class="bi bi-exclamation-triangle-fill me-2"></i>${result.msg}`);
    }
  });

  $('recordsSearch').addEventListener('input', e => refreshRecords(e.target.value));
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
async function saveDoc() {
  const t    = state.activeTab;
  const rows = getRows(t);
  const user = Auth.session()?.displayName || 'Unknown';

  if (t === 'po') {
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const taxRate  = parseFloat($('poTaxRate').value) || 0;
    const tax      = subtotal * (taxRate / 100);

    const po = {
      number:          $('poNumber').value,
      date:            $('poDate').value,
      deliveryDate:    $('poDeliveryDate').value,
      status:          $('poStatus').value,
      supplierName:    $('poSupplierName').value,
      supplierAddress: $('poSupplierAddress').value,
      supplierContact: $('poSupplierContact').value,
      supplierPhone:   $('poSupplierPhone').value,
      supplierEmail:   $('poSupplierEmail').value,
      supplierSST:     $('poSupplierSST').value,
      buyerName:       $('poBuyerName').value,
      buyerCompany:    $('poBuyerCompany').value,
      buyerAddress:    $('poBuyerAddress').value,
      buyerPhone:      $('poBuyerPhone').value,
      buyerEmail:      $('poBuyerEmail').value,
      items:           rows,
      subtotal,
      taxRate,
      tax,
      total:           subtotal - 0 + tax,
      deliveryNotes:   $('poDeliveryNotes').value,
      terms:           $('poTerms').value,
      savedBy:         user,
    };

    const { po: saved, invoice } = await DB.savePO(po);
    $('poNumber').value = genDocNum('PO');
    showToast(
      `<i class="bi bi-check-circle-fill me-2"></i>${saved.number} saved! ` +
      `Invoice <strong>${invoice.number}</strong> auto-generated.`
    );
    refreshRecords();
  } else {
    const subtotal      = rows.reduce((s, r) => s + r.amount, 0);
    const taxRate       = parseFloat($('invTaxRate').value) || 0;
    const dv            = parseFloat($('invDiscountValue').value) || 0;
    const dt            = $('invDiscountType').value;
    const discountAmount = dt === 'pct' ? subtotal * (dv / 100) : Math.min(dv, subtotal);
    const taxable       = subtotal - discountAmount;
    const tax           = taxable * (taxRate / 100);

    const inv = {
      number:          $('invNumber').value,
      date:            $('invDate').value,
      dueDate:         $('invDueDate').value,
      status:          $('invStatus').value,
      paymentTerms:    $('invPaymentTerms').value,
      currency:        $('invCurrency').value,
      customerName:    $('invCustomerName').value,
      customerCompany: $('invCustomerCompany').value,
      customerAddress: $('invCustomerAddress').value,
      customerPhone:   $('invCustomerPhone').value,
      customerEmail:   $('invCustomerEmail').value,
      items:           rows,
      subtotal,
      discountValue:   dv,
      discountType:    dt,
      discountAmount,
      taxRate,
      tax,
      total:           taxable + tax,
      bankName:        $('invBankName').value,
      bankAcc:         $('invBankAcc').value,
      bankAccountName: $('invBankName2').value,
      duitNow:         $('invDuitNow').value,
      notes:           $('invNotes').value,
      linkedPOId:      null,
      linkedPONumber:  null,
      savedBy:         user,
    };

    const saved = await DB.saveInvoice(inv);
    $('invNumber').value = genDocNum('INV');
    showToast(`<i class="bi bi-check-circle-fill me-2"></i>${saved.number} saved!`);
    refreshRecords();
  }
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
  const body    = $('historyBody');
  const records = DB.getHistory();

  if (!records.length) {
    body.innerHTML = '<p class="text-muted text-center py-4">No saved documents yet.</p>';
  } else {
    body.innerHTML = records.map(doc => {
      const isPO  = doc._type === 'po';
      const party = isPO ? (doc.supplierName || doc.buyerName) : doc.customerName;
      const linked = isPO && doc.linkedInvoiceNumber
        ? `<span class="linked-badge ms-2"><i class="bi bi-link-45deg"></i> ${escHtml(doc.linkedInvoiceNumber)}</span>`
        : (!isPO && doc.linkedPONumber
          ? `<span class="linked-badge ms-2"><i class="bi bi-link-45deg"></i> ${escHtml(doc.linkedPONumber)}</span>`
          : '');

      return `
        <div class="history-item">
          <div class="d-flex align-items-center gap-3">
            <span class="history-badge ${doc._type}">${isPO ? 'PO' : 'INV'}</span>
            <div>
              <div class="fw-semibold small">${escHtml(doc.number)}${linked}</div>
              <div class="text-muted" style="font-size:.75rem">
                ${escHtml(party || '—')} &bull; ${fmtDate(doc.date)}
                ${doc.savedBy ? `<span class="ms-2 text-gold-muted">by ${escHtml(doc.savedBy)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-3">
            <span class="history-status status-${doc.status}">${escHtml(doc.status)}</span>
            <div class="fw-bold small">RM ${(doc.total || 0).toFixed(2)}</div>
            <button class="btn btn-sm btn-outline-warning btn-print-hist"
              data-type="${doc._type}" data-id="${doc.id}" title="Open as PDF">
              <i class="bi bi-printer-fill"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete-hist"
              data-type="${doc._type}" data-id="${doc.id}" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    body.querySelectorAll('.btn-print-hist').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const doc = DB.getHistory().find(
          d => d._type === btn.dataset.type && d.id === parseInt(btn.dataset.id)
        );
        if (doc) loadAndPrint(doc);
      });
    });

    body.querySelectorAll('.btn-delete-hist').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await DB.remove(btn.dataset.type, parseInt(btn.dataset.id));
        openHistory();
        refreshRecords();
      });
    });
  }
  new bootstrap.Modal($('historyModal')).show();
}

// ===== RECORDS LISTING =====
function refreshRecords(query = '') {
  const wrap = $('recordsTableWrap');
  let records = DB.getHistory();

  if (query) {
    const q = query.toLowerCase();
    records = records.filter(d => {
      const party = d._type === 'po'
        ? (d.supplierName || d.buyerName || '')
        : (d.customerName || '');
      return (d.number || '').toLowerCase().includes(q)  ||
             party.toLowerCase().includes(q)              ||
             (d.status || '').toLowerCase().includes(q)  ||
             d._type.includes(q);
    });
  }

  if (!records.length) {
    wrap.innerHTML = '<p class="text-muted text-center py-3 small">No records found.</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="records-table-scroll">
      <table class="records-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Number</th>
            <th>Date</th>
            <th>Party / Name</th>
            <th class="text-end">Total (RM)</th>
            <th>Status</th>
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(doc => {
            const isPO  = doc._type === 'po';
            const party = isPO ? (doc.supplierName || doc.buyerName) : doc.customerName;
            const linked = isPO && doc.linkedInvoiceNumber
              ? `<span class="linked-badge ms-1"><i class="bi bi-link-45deg"></i>${escHtml(doc.linkedInvoiceNumber)}</span>`
              : (!isPO && doc.linkedPONumber
                ? `<span class="linked-badge ms-1"><i class="bi bi-link-45deg"></i>${escHtml(doc.linkedPONumber)}</span>`
                : '');
            return `
              <tr>
                <td><span class="history-badge ${doc._type}">${isPO ? 'PO' : 'INV'}</span></td>
                <td class="fw-semibold small">${escHtml(doc.number)}${linked}</td>
                <td class="small text-muted">${fmtDate(doc.date)}</td>
                <td class="small">${escHtml(party || '—')}</td>
                <td class="small fw-bold text-end">${(doc.total || 0).toFixed(2)}</td>
                <td><span class="history-status status-${escHtml(doc.status)}">${escHtml(doc.status)}</span></td>
                <td class="text-center">
                  <button class="btn btn-sm btn-outline-warning btn-rec-print"
                    data-type="${doc._type}" data-id="${doc.id}" title="Print / PDF">
                    <i class="bi bi-printer-fill"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger btn-rec-delete ms-1"
                    data-type="${doc._type}" data-id="${doc.id}" title="Delete">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('.btn-rec-print').forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = DB.getHistory().find(
        d => d._type === btn.dataset.type && d.id === parseInt(btn.dataset.id)
      );
      if (doc) loadAndPrint(doc);
    });
  });

  wrap.querySelectorAll('.btn-rec-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await DB.remove(btn.dataset.type, parseInt(btn.dataset.id));
      refreshRecords($('recordsSearch').value);
    });
  });
}

// ===== LOAD SAVED DOC INTO FORM & PRINT =====
function loadAndPrint(doc) {
  bootstrap.Modal.getInstance($('historyModal'))?.hide();

  const t = doc._type;
  switchTab(t);

  if (t === 'po') {
    $('poNumber').value          = doc.number          || '';
    $('poDate').value            = doc.date            || '';
    $('poDeliveryDate').value    = doc.deliveryDate     || '';
    $('poStatus').value          = doc.status          || 'draft';
    $('poSupplierName').value    = doc.supplierName     || '';
    $('poSupplierAddress').value = doc.supplierAddress  || '';
    $('poSupplierContact').value = doc.supplierContact  || '';
    $('poSupplierPhone').value   = doc.supplierPhone    || '';
    $('poSupplierEmail').value   = doc.supplierEmail    || '';
    $('poSupplierSST').value     = doc.supplierSST      || '';
    $('poBuyerName').value       = doc.buyerName        || '';
    $('poBuyerCompany').value    = doc.buyerCompany     || '';
    $('poBuyerAddress').value    = doc.buyerAddress     || '';
    $('poBuyerPhone').value      = doc.buyerPhone       || '';
    $('poBuyerEmail').value      = doc.buyerEmail       || '';
    $('poDeliveryNotes').value   = doc.deliveryNotes    || '';
    $('poTerms').value           = doc.terms            || '';
    $('poTaxRate').value         = doc.taxRate          || 0;

    $('poItemsBody').innerHTML = '';
    (doc.items || []).forEach(item => {
      addRow('po');
      const tr = $('poItemsBody').lastElementChild;
      tr.querySelector('.item-desc').value  = item.desc  || '';
      tr.querySelector('.item-unit').value  = item.unit  || '';
      tr.querySelector('.item-qty').value   = item.qty   || 0;
      tr.querySelector('.item-price').value = item.price || 0;
    });
    if (!$('poItemsBody').children.length) { addRow('po'); addRow('po'); }
  } else {
    $('invNumber').value          = doc.number          || '';
    $('invDate').value            = doc.date            || '';
    $('invDueDate').value         = doc.dueDate         || '';
    $('invStatus').value          = doc.status          || 'draft';
    $('invPaymentTerms').value    = doc.paymentTerms    || '';
    $('invCurrency').value        = doc.currency        || 'RM';
    $('invCustomerName').value    = doc.customerName    || '';
    $('invCustomerCompany').value = doc.customerCompany || '';
    $('invCustomerAddress').value = doc.customerAddress || '';
    $('invCustomerPhone').value   = doc.customerPhone   || '';
    $('invCustomerEmail').value   = doc.customerEmail   || '';
    $('invDiscountValue').value   = doc.discountValue   || 0;
    $('invDiscountType').value    = doc.discountType    || 'pct';
    $('invTaxRate').value         = doc.taxRate         || 0;
    $('invBankName').value        = doc.bankName        || '';
    $('invBankAcc').value         = doc.bankAcc         || '';
    $('invBankName2').value       = doc.bankAccountName || '';
    $('invDuitNow').value         = doc.duitNow         || '';
    $('invNotes').value           = doc.notes           || '';

    $('invItemsBody').innerHTML = '';
    (doc.items || []).forEach(item => {
      addRow('inv');
      const tr = $('invItemsBody').lastElementChild;
      tr.querySelector('.item-desc').value  = item.desc  || '';
      tr.querySelector('.item-unit').value  = item.unit  || '';
      tr.querySelector('.item-qty').value   = item.qty   || 0;
      tr.querySelector('.item-price').value = item.price || 0;
    });
    if (!$('invItemsBody').children.length) { addRow('inv'); addRow('inv'); }
  }

  calcTotals(t);
  updatePreview();

  // Wait for modal close animation before opening print dialog
  setTimeout(() => window.print(), 400);
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
