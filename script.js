/* Shelf Counter v3 — script.js (robust ZXing fallback) */

(() => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');
  const zxHint = document.getElementById('zxHint');
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

  const STORAGE_KEY = 'shelf_counter_rows_v3';
  const PREFS_KEY = 'shelf_counter_prefs_v3';
  let rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{"defaultLoc": "", "strict": false, "webhook": ""}');

  defaultLocInput.value = prefs.defaultLoc || '';
  strictToggle.checked = !!prefs.strict;
  webhookUrlInput.value = prefs.webhook || '';

  let scanning = false;
  let useNativeDetector = false;
  let zxingReader = null;
  let zxingControls = null;
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

  function humanTime(ts) { return new Date(ts).toLocaleString(); }

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
    barcodeInput.value = ''; qtyInput.value = ''; descInput.value = ''; locInput.value = '';
    barcodeInput.focus();
  }

  function onTableClick(e) {
    const btn = e.target.closest('button.action-btn'); if (!btn) return;
    const action = btn.dataset.action; const idx = parseInt(btn.dataset.idx, 10);
    if (action === 'del') { rows.splice(idx, 1); saveRows(); render(); }
    else if (action === 'edit') {
      const r = rows[idx];
      const newQtyStr = prompt(`Update quantity for ${r.barcode}`, String(r.qty)); if (newQtyStr == null) return;
      const newQty = parseInt(newQtyStr, 10); if (Number.isNaN(newQty) || newQty < 0) { alert('Invalid quantity.'); return; }
      const newDesc = prompt(`Update description for ${r.barcode}`, r.desc || '');
      const newLoc = prompt(`Update location for ${r.barcode}`, r.loc || '');
      rows[idx] = { ...r, qty: newQty, desc: newDesc, loc: newLoc }; saveRows(); render();
    }
  }

  function toCSV() {
    const header = ['timestamp','barcode','qty','description','location'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      const values = [
        new Date(r.ts).toISOString().replace('T',' ').replace('Z',''),
        csvEscape(r.barcode), r.qty, csvEscape(r.desc || ''), csvEscape(r.loc || '')
      ]; lines.push(values.join(','));
    }); return lines.join('\n');
  }
  function csvEscape(s) { if (s == null) return ''; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function download(filename, blob) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  exportCsvBtn.addEventListener('click', () => download(`shelf_counts_${new Date().toISOString().slice(0,10)}.csv`, new Blob([toCSV()], {type:'text/csv'})));
  exportXlsxBtn.addEventListener('click', () => {
    const wsData = [['Timestamp','Barcode','Qty','Description','Location'], ...rows.map(r => [ new Date(r.ts).toLocaleString(), r.barcode, r.qty, r.desc || '', r.loc || '' ])];
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(wsData); XLSX.utils.book_append_sheet(wb, ws, 'Counts');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(`shelf_counts_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  });
  clearAllBtn.addEventListener('click', () => { if (!rows.length) return; if (confirm('Clear all entries?')) { rows = []; saveRows(); render(); } });

  addBtn.addEventListener('click', addRow);
  clearInputsBtn.addEventListener('click', () => { barcodeInput.value=''; qtyInput.value=''; descInput.value=''; locInput.value=''; barcodeInput.focus(); });
  dataTable.addEventListener('click', onTableClick);

  sendSheetsBtn?.addEventListener('click', async () => {
    const url = webhookUrlInput.value.trim(); if (!url) { alert('Please paste your Apps Script Web App URL first.'); return; }
    const payload = { entries: rows }; sendStatus.textContent = 'Sending…';
    try {
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`); const text = await res.text();
      sendStatus.textContent = 'Sent successfully.' + (text ? ' Response: ' + text : '');
    } catch (e) { sendStatus.textContent = 'Send failed: ' + e.message; }
  });

  async function enumerateCameras() {
    try { const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter(d => d.kind === 'videoinput');
      cameraSelect.innerHTML = ''; videos.forEach((d,i) => {
        const opt = document.createElement('option'); opt.value = d.deviceId; opt.textContent = d.label || `Camera ${i+1}`; cameraSelect.appendChild(opt);
      }); } catch (e) { console.warn('enumerateDevices failed:', e); }
  }

  async function startScanner() {
    if (scanning) return; scanning = true; stopBtn.disabled = false; startBtn.disabled = true; statusEl.textContent = 'Starting camera…';
    const deviceId = cameraSelect.value || undefined;
    const constraints = { audio:false, video:{ deviceId: deviceId ? { exact: deviceId } : undefined, facingMode: deviceId ? undefined : 'environment', width:{ideal:1280}, height:{ideal:720} } };
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints); video.srcObject = mediaStream; await video.play();
      statusEl.textContent = 'Camera started. Initializing scanner…'; canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
      useNativeDetector = 'BarcodeDetector' in window; if (useNativeDetector) { await runNativeDetector(); } else { await runZXing(); }
    } catch (err) {
      console.error(err); statusEl.textContent = 'Camera error. Check permissions and HTTPS.'; startBtn.disabled = false; stopBtn.disabled = true; scanning = false;
    }
  }
  async function stopScanner() {
    scanning = false; startBtn.disabled = false; stopBtn.disabled = true;
    try { if (zxingControls?.stop) { zxingControls.stop(); zxingControls = null; } if (zxingReader?.reset) { zxingReader.reset(); zxingReader = null; } } catch {}
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    statusEl.textContent = 'Scanner stopped.';
  }
  startBtn.addEventListener('click', startScanner); stopBtn.addEventListener('click', stopScanner);

  async function runNativeDetector() {
    statusEl.textContent = 'Using native BarcodeDetector.';
    const formats = ['qr_code','ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'].filter(f => (window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats().includes(f) : true));
    const detector = new window.BarcodeDetector({ formats });
    const tick = async () => {
      if (!scanning) return;
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const barcodes = await detector.detect(canvas); if (barcodes?.length) { const code = barcodes[0].rawValue || barcodes[0].rawData || ''; if (code) handleDetect(code); }
      } catch {}
      requestAnimationFrame(tick);
    }; tick();
  }

  async function runZXing() {
    statusEl.textContent = 'Loading ZXing fallback…';
    try {
      await ensureZXingLoaded(); console.log('ZXing version', window.ZXing?.ZXingVersion || 'unknown');
      const { BrowserMultiFormatReader } = window.ZXing; if (!BrowserMultiFormatReader) throw new Error('ZXing BrowserMultiFormatReader missing.');
      zxingReader = new BrowserMultiFormatReader();
      const selectedDeviceId = cameraSelect.value || undefined;
      zxingControls = await zxingReader.decodeFromVideoDevice(selectedDeviceId, video, (result, err) => {
        if (!scanning) return; if (result?.text) { handleDetect(result.text); }
      });
      statusEl.textContent = 'ZXing scanner running.'; zxHint.textContent = '';
    } catch (e) {
      console.error('ZXing load/run error', e);
      zxHint.textContent = 'ZXing fallback failed to load. You can still enter barcodes manually. Try clearing cache or updating your browser.';
      statusEl.textContent = 'Scanner ready (manual entry).';
    }
  }

  function handleDetect(code) {
    if (barcodeInput.dataset.last === code && (Date.now() - (parseInt(barcodeInput.dataset.lastTs||'0',10))) < 1500) return;
    barcodeInput.value = code; barcodeInput.dataset.last = code; barcodeInput.dataset.lastTs = String(Date.now());
    statusEl.textContent = `Scanned: ${code}`; qtyInput.focus();
  }

  async function ensureZXingLoaded() {
    const s = document.getElementById('zxingScript'); if (s.dataset.loaded === 'true') return;
    await new Promise((resolve, reject) => {
      s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); }, { once:true });
      s.addEventListener('error', reject, { once:true });
      if (s.readyState === 'complete') { s.dataset.loaded = 'true'; resolve(); }
    });
  }

  function validateEANUPC(code) {
    if (!/^\d+$/.test(code)) return 'Strict mode: barcode must be numeric.';
    if (![8,12,13].includes(code.length)) return 'Strict mode: length must be 8, 12, or 13 digits.';
    const ok = (code.length === 8 && validateEAN8(code)) || (code.length === 12 && validateUPCA(code)) || (code.length === 13 && validateEAN13(code));
    return ok ? '' : 'Strict mode: checksum failed for EAN/UPC.';
  }
  function validateEAN13(s) { const d = s.split('').map(Number); const check = d.pop(); const sum = d.reduce((a,v,i)=>a+v*(i%2===0?1:3),0); return ((10-(sum%10))%10)===check; }
  function validateUPCA(s) { const d = s.split('').map(Number); const check = d.pop(); const sum = d.reduce((a,v,i)=>a+v*((i%2===0)?3:1),0); return ((10-(sum%10))%10)===check; }
  function validateEAN8(s) { const d = s.split('').map(Number); const check = d.pop(); const sum = d.reduceRight((a,v,i)=>a+v*((i%2===0)?3:1),0); return ((10-(sum%10))%10)===check; }

  (async function init() {
    render(); if (prefs.defaultLoc) locInput.value = prefs.defaultLoc;
    if (navigator.mediaDevices?.enumerateDevices) { await enumerateCameras(); }
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateCameras);
  })();
})();
