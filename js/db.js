/* ================================================
   KARIPAP BONDA — JSON / Excel Database Module
   Reads & writes via File System Access API.
   Supports .json and .xlsx file formats.
   Persists the file handle in IndexedDB so the
   app auto-reconnects on next page load.
   Falls back to localStorage on unsupported browsers.
   ================================================ */

'use strict';

const DB = (() => {
  const LS_KEY    = 'kb_db';
  const IDB_NAME  = 'kb_fs';
  const IDB_STORE = 'handles';

  let _fileHandle    = null; // active FileSystemFileHandle
  let _pendingHandle = null; // needs user gesture to re-grant
  let _cache         = null; // in-memory mirror

  const _empty = () => ({ purchase_orders: [], invoices: [] });

  // ── IndexedDB helpers ─────────────────────────────
  function _openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _storeHandle(handle) {
    try {
      const idb = await _openIDB();
      const tx  = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, 'db');
      idb.close();
    } catch (e) { console.warn('IDB store failed', e); }
  }

  async function _retrieveHandle() {
    try {
      const idb = await _openIDB();
      const tx  = idb.transaction(IDB_STORE, 'readonly');
      const handle = await new Promise((res, rej) => {
        const req = tx.objectStore(IDB_STORE).get('db');
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
      });
      idb.close();
      return handle || null;
    } catch { return null; }
  }

  // ── File read helpers ─────────────────────────────
  function _isXlsx(handle) {
    return handle.name.toLowerCase().endsWith('.xlsx');
  }

  function _parseJsonSafe(str, fallback = []) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  async function _readFromHandle(handle) {
    const file = await handle.getFile();
    if (_isXlsx(handle)) {
      if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
      const buf = await file.arrayBuffer();
      // Empty xlsx file — treat as blank db
      if (!buf.byteLength) return _empty();
      const wb = XLSX.read(buf, { type: 'array' });
      return _xlsxToDb(wb);
    }
    const text = (await file.text()).trim();
    // Blank file — will be initialised on first save
    if (!text) return _empty();
    try {
      const parsed = JSON.parse(text);
      return {
        purchase_orders: Array.isArray(parsed.purchase_orders) ? parsed.purchase_orders : [],
        invoices:        Array.isArray(parsed.invoices)        ? parsed.invoices        : [],
      };
    } catch {
      // Unreadable content — start fresh
      return _empty();
    }
  }

  function _xlsxToDb(wb) {
    const db      = _empty();
    const poSheet  = wb.Sheets['Purchase Orders'] || wb.Sheets['purchase_orders'];
    const invSheet = wb.Sheets['Invoices']        || wb.Sheets['invoices'];
    if (poSheet)  db.purchase_orders = XLSX.utils.sheet_to_json(poSheet).map(r => ({ ...r, items: _parseJsonSafe(r.items) }));
    if (invSheet) db.invoices        = XLSX.utils.sheet_to_json(invSheet).map(r => ({ ...r, items: _parseJsonSafe(r.items) }));
    return db;
  }

  // ── File write helpers ────────────────────────────
  async function _writeToHandle(handle, data) {
    const writable = await handle.createWritable();
    if (_isXlsx(handle)) {
      if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
      const wb = XLSX.utils.book_new();
      const poRows  = data.purchase_orders.map(r => ({ ...r, items: JSON.stringify(r.items || []) }));
      const invRows = data.invoices.map(r =>        ({ ...r, items: JSON.stringify(r.items || []) }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(poRows),  'Purchase Orders');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), 'Invoices');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      await writable.write(new Blob([buf], { type: 'application/octet-stream' }));
    } else {
      await writable.write(JSON.stringify(data, null, 2));
    }
    await writable.close();
  }

  // ── Load / persist ────────────────────────────────
  function _load() {
    if (_cache) return _cache;
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || _empty(); }
    catch { return _empty(); }
  }

  async function _persist(data) {
    _cache = data;
    if (_fileHandle) {
      try {
        await _writeToHandle(_fileHandle, data);
        return;
      } catch (e) {
        console.warn('File write failed — falling back to localStorage', e);
        _fileHandle = null;
        _updateStatus();
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  // ── Activate a handle once permission is granted ──
  async function _activateHandle(handle) {
    const data  = await _readFromHandle(handle);
    _fileHandle    = handle;
    _pendingHandle = null;
    const hasRecords = data.purchase_orders.length || data.invoices.length;
    _cache = hasRecords ? data : _load();
    _updateStatus();
    await _storeHandle(handle);
    // Write proper structure into a blank file right away
    if (!hasRecords) await _persist(_cache);
  }

  // ── UI status badge ────────────────────────────────
  function _updateStatus() {
    const el = document.getElementById('dbStatus');
    if (!el) return;
    if (_fileHandle) {
      el.innerHTML = `<i class="bi bi-hdd-fill me-1"></i>${_fileHandle.name}`;
      el.classList.add('connected');
    } else {
      el.innerHTML = `<i class="bi bi-hdd me-1"></i>Local storage`;
      el.classList.remove('connected');
    }
  }

  // ── Utilities ─────────────────────────────────────
  function _addDays(dateStr, n) {
    const d = new Date(dateStr || new Date());
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  function _nextNum(arr, prefix) {
    const now = new Date();
    const yy  = String(now.getFullYear()).slice(2);
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const seq = String(arr.length + 1).padStart(4, '0');
    return `${prefix}-${yy}${mm}-${seq}`;
  }

  // ── Migration: old flat kb_docs → new structure ───
  function init() {
    if (localStorage.getItem(LS_KEY)) return;
    const old = localStorage.getItem('kb_docs');
    if (!old) { localStorage.setItem(LS_KEY, JSON.stringify(_empty())); return; }
    try {
      const docs = JSON.parse(old);
      const db   = _empty();
      docs.forEach(d => {
        if (d.type === 'po') db.purchase_orders.push(d);
        else                 db.invoices.push(d);
      });
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch {
      localStorage.setItem(LS_KEY, JSON.stringify(_empty()));
    }
  }

  // ── Auto-connect on page load (from IDB) ─────────
  async function autoConnect() {
    if (!window.showOpenFilePicker) return { ok: false };
    const handle = await _retrieveHandle();
    if (!handle) return { ok: false };
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        await _activateHandle(handle);
        return { ok: true };
      }
      if (perm === 'prompt') {
        _pendingHandle = handle;
        return { ok: false, needsGesture: true, name: handle.name };
      }
    } catch (e) { console.warn('autoConnect failed', e); }
    return { ok: false };
  }

  // ── One-tap reconnect (needs user gesture) ────────
  async function reconnect() {
    if (!_pendingHandle) return { ok: false };
    try {
      const perm = await _pendingHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return { ok: false, msg: 'Permission denied.' };
      await _activateHandle(_pendingHandle);
      return { ok: true, name: _fileHandle.name };
    } catch (e) { return { ok: false, msg: e.message }; }
  }

  // ── Manual connect via file picker ────────────────
  async function connect() {
    if (!window.showOpenFilePicker) {
      return { ok: false, msg: 'File System API not supported. Use Chrome or Edge.' };
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: 'JSON Database (.json)', accept: { 'application/json': ['.json'] } },
          { description: 'Excel Spreadsheet (.xlsx)', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } },
        ],
      });
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return { ok: false, msg: 'Write permission denied.' };
      await _activateHandle(handle);
      return { ok: true, name: handle.name };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, msg: 'cancelled' };
      return { ok: false, msg: e.message };
    }
  }

  function isConnected() { return _fileHandle !== null; }

  // ── CRUD ──────────────────────────────────────────
  async function savePO(po) {
    const db  = _load();
    po.id      = Date.now();
    po.savedAt = new Date().toISOString();

    const invNumber = _nextNum(db.invoices, 'INV');
    const invoice = {
      id:              po.id + 1,
      number:          invNumber,
      date:            po.date,
      dueDate:         _addDays(po.date, 14),
      status:          'draft',
      paymentTerms:    po.terms || 'Net 14',
      currency:        'RM',
      customerName:    po.buyerName,
      customerCompany: po.buyerCompany,
      customerAddress: po.buyerAddress,
      customerPhone:   po.buyerPhone,
      customerEmail:   po.buyerEmail,
      items:           po.items,
      subtotal:        po.subtotal,
      discountValue:   0,
      discountType:    'pct',
      discountAmount:  0,
      taxRate:         po.taxRate,
      tax:             po.tax,
      total:           po.total,
      bankName:        '',
      bankAcc:         '',
      bankAccountName: '',
      duitNow:         '',
      notes:           `Ref: ${po.number}`,
      linkedPOId:      po.id,
      linkedPONumber:  po.number,
      savedAt:         new Date().toISOString(),
      savedBy:         po.savedBy,
    };

    po.linkedInvoiceId     = invoice.id;
    po.linkedInvoiceNumber = invNumber;

    db.purchase_orders.unshift(po);
    db.invoices.unshift(invoice);
    await _persist(db);
    return { po, invoice };
  }

  async function saveInvoice(inv) {
    const db  = _load();
    inv.id     = Date.now();
    inv.savedAt = new Date().toISOString();
    db.invoices.unshift(inv);
    await _persist(db);
    return inv;
  }

  async function remove(type, id) {
    const db = _load();
    if (type === 'po') db.purchase_orders = db.purchase_orders.filter(r => r.id !== id);
    else               db.invoices        = db.invoices.filter(r => r.id !== id);
    await _persist(db);
  }

  function getAll() { return _load(); }

  // ── Orders (from index.html contact form) ────────
  function getOrders() {
    return JSON.parse(localStorage.getItem('kb_orders') || '[]');
  }

  async function updateOrderStatus(id, status) {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      orders[idx].status = status;
      localStorage.setItem('kb_orders', JSON.stringify(orders));
    }
  }

  async function deleteOrder(id) {
    const orders = getOrders().filter(o => o.id !== id);
    localStorage.setItem('kb_orders', JSON.stringify(orders));
  }

  function getHistory() {
    const db   = _load();
    const pos  = db.purchase_orders.map(d => ({ ...d, _type: 'po'  }));
    const invs = db.invoices.map(d =>        ({ ...d, _type: 'inv' }));
    return [...pos, ...invs].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  function countByType(prefix) {
    const db = _load();
    return prefix === 'PO' ? db.purchase_orders.length : db.invoices.length;
  }

  return {
    init, autoConnect, reconnect, connect, isConnected,
    savePO, saveInvoice, remove, getAll, getHistory, countByType,
    getOrders, updateOrderStatus, deleteOrder,
  };
})();
