/* Shelf Counter v2 — script.js */

(() => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');
  const strictToggle = document.getElementById('strictToggle');

  const barcodeInput = document.getElementById('barcodeInput');
  const qtyInput = document.getElementById('qtyInput');
  const descInput = document.getElementById('descInput');
  const locInput = document.getElementById('locInput');
  const defaultLocInput = document.getElementById('defaultLocInput');

  const addBtn = document.getElementById('addBtn');
  const clearInputsBtn = document.getElementById('clearInputsBtn');
  const dataTable = document.getElementById('dataTable').querySelector('tbody');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportXlsxBtn = document.getElementById('exportXlsxBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  const webhookUrlInput = document.getElementById('webhookUrl');
  const sendSheetsBtn = document.getElementById('sendSheetsBtn');
  const sendStatus = document.getElementById('sendStatus');
  const helpBtn = document.getElementById('helpBtn');

  const yearSpan = document.getElementById('year');
  yearSpan.textContent = new Date().getFullYear();

  // Storage
  const STORAGE_KEY = 'shelf_counter_rows_v2';
  const PREFS_KEY = 'shelf_counter_prefs_v2';
  let rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{"defaultLoc": "", "strict": false, "webhook": ""}');

  // Apply prefs
  defaultLocInput.value = prefs.defaultLoc || '';
  strictToggle.checked = !!prefs.strict;
  webhookUrlInput.value = prefs.webhook || '';

  let scanning = false;
  let useNativeDetector = false;
  let zxingReader = null;
  let animationHandle = null;
  let mediaStream = null;

  function saveRows() { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }
  function savePrefs() {
    prefs.defaultLoc = defaultLocInput.value || '';
    prefs.strict = !!strictToggle.checked;
    prefs.webhook = webhookUrlInput.value || '';
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  defaultLocInput.addEventListener('change', savePrefs);
  strictToggle.addEventListener('change', savePrefs);
  webhookUrlInput.addEventListener('change', savePrefs);

  function humanTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function render() {
    dataTable.innerHTML = '';
    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${humanTime(r.ts)}</td>
        <td>${r.barcode}</td>
        <td>${r.qty}</td>
        <td>${r.desc || ''}</td>
        <td>${r.loc || ''}</td>
        <td>
          <div class="row-buttons">
            <button class="action-btn" data-action="edit" data-idx="${idx}">Edit</button>
            <button class="action-btn" data-action="del" data-idx="${idx}">Delete</button>
          </div>
        </td>
      `;
      dataTable.appendChild(tr);
    });
  }

  function addRow() {
    const code = (barcodeInput.value || '').trim();
    const qty = parseInt(qtyInput.value || '0', 10);
    const desc = (descInput.value || '').trim();
    const loc = (locInput.value || defaultLocInput.value || '').trim();

    if (!code) { alert('Please scan or enter a barcode first.'); return; }
    if (Number.isNaN(qty) || qty < 0) { alert('Please enter a valid non-negative quantity.'); return; }
    if (strictToggle.checked) {
      const err = validateEANUPC(code);
      if (err) { alert(err); return; }
    }

    rows.push({ ts: Date.now(), barcode: code, qty, desc, loc });
    saveRows(); render();
    barcodeInput.value = '';
    qtyInput.value = '';
    descInput.value = '';
    locInput.value = '';
    barcodeInput.focus();
  }

  function onTableClick(e) {
    const btn = e.target.closest('button.action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx, 10);
    if (action === 'del') {
      rows.splice(idx, 1);
      saveRows(); render();
    } else if (action === 'edit') {
      const r = rows[idx];
      const newQtyStr = prompt(`Update quantity for ${r.barcode}`, String(r.qty));
      if (newQtyStr == null) return;
      const newQty = parseInt(newQtyStr, 10);
      if (Number.isNaN(newQty) || newQty < 0) { alert('Invalid quantity.'); return; }
      const newDesc = prompt(`Update description for ${r.barcode}`, r.desc || '');
      const newLoc = prompt(`Update location for ${r.barcode}`, r.loc || '');
      rows[idx] = { ...r, qty: newQty, desc: newDesc, loc: newLoc };
      saveRows(); render();
    }
  }

  function toCSV() {
    const header = ['timestamp','barcode','qty','description','location'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      const values = [
        new Date(r.ts).toISOString().replace('T',' ').replace('Z',''),
        csvEscape(r.barcode),
        r.qty,
        csvEscape(r.desc || ''),
        csvEscape(r.loc || '')
      ];
      lines.push(values.join(','));
    });
    return lines.join('\n');
  }

  function csvEscape(s) {
    if (s == null) return '';
    const needs = /[",\n]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  exportCsvBtn.addEventListener('click', () => {
    const csv = toCSV();
    download(`shelf_counts_${new Date().toISOString().slice(0,10)}.csv`, new Blob([csv], {type:'text/csv'}));
  });

  exportXlsxBtn.addEventListener('click', () => {
    const wsData = [
      ['Timestamp','Barcode','Qty','Description','Location'],
      ...rows.map(r => [ new Date(r.ts).toLocaleString(), r.barcode, r.qty, r.desc || '', r.loc || '' ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Counts');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(`shelf_counts_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  });

  clearAllBtn.addEventListener('click', () => {
    if (!rows.length) return;
    if (confirm('Clear all entries? This cannot be undone.')) {
      rows = [];
      saveRows(); render();
    }
  });

  addBtn.addEventListener('click', addRow);
  clearInputsBtn.addEventListener('click', () => {
    barcodeInput.value = '';
    qtyInput.value = '';
    descInput.value = '';
    locInput.value = '';
    barcodeInput.focus();
  });
  dataTable.addEventListener('click', onTableClick);

  // Google Sheets webhook sender
  sendSheetsBtn.addEventListener('click', async () => {
    const url = webhookUrlInput.value.trim();
    if (!url) { alert('Please paste your Apps Script Web App URL first.'); return; }
    const payload = { entries: rows };
    sendStatus.textContent = 'Sending…';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      sendStatus.textContent = 'Sent successfully.' + (text ? ' Response: ' + text : '');
    } catch (e) {
      sendStatus.textContent = 'Send failed: ' + e.message;
    }
  });

  // Help Modal
  const helpModal = createHelpModal();
  helpBtn.addEventListener('click', () => { helpModal.open(); });

  // Scanner --------------------------------------------------------------
  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter(d => d.kind === 'videoinput');
      cameraSelect.innerHTML = '';
      videos.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i+1}`;
        cameraSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn('enumerateDevices failed:', e);
    }
  }

  async function startScanner() {
    if (scanning) return;
    scanning = true;
    stopBtn.disabled = false;
    startBtn.disabled = true;
    statusEl.textContent = 'Starting camera…';

    const deviceId = cameraSelect.value || undefined;
    const constraints = {
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : 'environment',
        width: { ideal: 1280 }, height: { ideal: 720 }
      }
    };
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = mediaStream;
      await video.play();
      statusEl.textContent = 'Camera started. Initializing scanner…';
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      useNativeDetector = 'BarcodeDetector' in window;
      if (useNativeDetector) {
        await runNativeDetector();
      } else {
        await runZXing();
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Camera error. Check permissions and HTTPS.';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      scanning = false;
    }
  }

  async function stopScanner() {
    scanning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (animationHandle) cancelAnimationFrame(animationHandle);
    if (zxingReader && zxingReader.reset) zxingReader.reset();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    statusEl.textContent = 'Scanner stopped.';
  }

  startBtn.addEventListener('click', startScanner);
  stopBtn.addEventListener('click', stopScanner);

  async function runNativeDetector() {
    statusEl.textContent = 'Using native BarcodeDetector.';
    const formats = [
      'qr_code','ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'
    ].filter(f => (window.BarcodeDetector.getSupportedFormats
                   ? window.BarcodeDetector.getSupportedFormats().includes(f)
                   : true));
    const detector = new window.BarcodeDetector({ formats });

    const tick = async () => {
      if (!scanning) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const barcodes = await detector.detect(canvas);
        if (barcodes && barcodes.length) {
          const code = barcodes[0].rawValue || barcodes[0].rawData || '';
          if (code) handleDetect(code);
        }
      } catch (e) {}
      animationHandle = requestAnimationFrame(tick);
    };
    tick();
  }

  async function runZXing() {
    statusEl.textContent = 'Loading ZXing fallback…';
    await ensureZXingLoaded();
    const { BrowserMultiFormatReader } = window.ZXing;
    zxingReader = new BrowserMultiFormatReader();

    const tick = async () => {
      if (!scanning) return;
      try {
        const result = await zxingReader.decodeOnceFromVideoDevice(
          cameraSelect.value || undefined,
          'video'
        );
        if (result && result.text) handleDetect(result.text);
      } catch (e) {
        // ignore and keep scanning
      } finally {
        if (scanning) animationHandle = requestAnimationFrame(tick);
      }
    };
    tick();
    statusEl.textContent = 'ZXing scanner running.';
  }

  function handleDetect(code) {
    // Debounce repeated reads
    if (barcodeInput.dataset.last === code && (Date.now() - (parseInt(barcodeInput.dataset.lastTs||'0',10))) < 1500) {
      return;
    }
    barcodeInput.value = code;
    barcodeInput.dataset.last = code;
    barcodeInput.dataset.lastTs = String(Date.now());
    statusEl.textContent = `Scanned: ${code}`;
    qtyInput.focus();
  }

  async function ensureZXingLoaded() {
    const s = document.getElementById('zxingScript');
    if (s.dataset.loaded === 'true') return;
    await new Promise((resolve, reject) => {
      s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); }, { once:true });
      s.addEventListener('error', reject, { once:true });
      if (s.readyState === 'complete') { s.dataset.loaded = 'true'; resolve(); }
    });
  }

  // Validation (EAN-8, UPC-A (12), EAN-13) --------------------------------
  function validateEANUPC(code) {
    if (!/^\d+$/.test(code)) return 'Strict mode: barcode must be numeric.';
    if (![8,12,13].includes(code.length)) return 'Strict mode: length must be 8, 12, or 13 digits.';
    const ok =
      (code.length === 8 && validateEAN8(code)) ||
      (code.length === 12 && validateUPCA(code)) ||
      (code.length === 13 && validateEAN13(code));
    return ok ? '' : 'Strict mode: checksum failed for EAN/UPC.';
  }

  function validateEAN13(s) {
    // 12 data + 1 check
    const digits = s.split('').map(d => +d);
    const check = digits.pop();
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const calc = (10 - (sum % 10)) % 10;
    return calc === check;
  }

  function validateUPCA(s) {
    // UPC-A is EAN-13 with a leading 0, but checksum formula same as EAN-13 for 12 digits
    const digits = s.split('').map(d => +d);
    const check = digits.pop();
    // weights: odd positions *3, even positions *1 (from left, 1-indexed)
    const sum = digits.reduce((acc, d, i) => acc + d * ((i % 2 === 0) ? 3 : 1), 0);
    const calc = (10 - (sum % 10)) % 10;
    return calc === check;
  }

  function validateEAN8(s) {
    const digits = s.split('').map(d => +d);
    const check = digits.pop();
    // weights: 3,1 alternating from the right
    const sum = digits.reduceRight((acc, d, idxFromRight) => {
      const weight = (idxFromRight % 2 === 0) ? 3 : 1;
      return acc + d * weight;
    }, 0);
    const calc = (10 - (sum % 10)) % 10;
    return calc === check;
  }

  // Modal helper ----------------------------------------------------------
  function createHelpModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <header>
        <h3>Google Sheets Setup (Apps Script)</h3>
        <button id="modalClose" class="ghost">Close</button>
      </header>
      <div class="content">
        <ol>
          <li>Create a new Google Sheet and name it however you like.</li>
          <li>Open <strong>Extensions → Apps Script</strong>.</li>
          <li>Paste the script below, update the <code>SHEET_ID</code> to your sheet’s ID, then click <strong>Deploy → New deployment</strong> and choose <strong>Web app</strong>. Set <strong>Who has access</strong> to “Anyone with the link” (or your Google account) and copy the Web App URL.</li>
          <li>Paste that URL into the “Apps Script Web App URL” box in this app. Click “Send to Sheets”.</li>
        </ol>
        <p><strong>Apps Script:</strong></p>
        <pre class="code" id="scriptBlock"></pre>
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const close = () => { backdrop.style.display = 'none'; modal.style.display = 'none'; };
    modal.querySelector('#modalClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);

    const code = `
const SHEET_ID = 'PUT_YOUR_SHEET_ID_HERE'; // The long ID in the Sheet URL
const SHEET_NAME = 'Counts'; // tab name; will be created if missing

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const entries = body.entries || [];
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp','Barcode','Qty','Description','Location']);
    }
    const rows = entries.map(r => [
      new Date(r.ts), r.barcode, r.qty, r.desc || '', r.loc || ''
    ]);
    if (rows.length) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('ERROR: ' + err).setMimeType(ContentService.MimeType.TEXT);
  }
}
`.trim();
    modal.querySelector('#scriptBlock').textContent = code;

    return {
      open() {
        backdrop.style.display = 'block';
        modal.style.display = 'block';
      }
    };
  }

  // init
  (async function init() {
    render();
    if (prefs.defaultLoc) locInput.value = prefs.defaultLoc;
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      await enumerateCameras();
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateCameras);
  })();
})();
