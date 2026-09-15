/**
 * UnirPDF - Aplicacion para unir archivos PDF
 * Funciona 100% en el navegador usando pdf-lib
 */

// ====== STATE ======
let pdfFiles = [];  // Array de { id, file, name, size, pageCount }
let nextId = 0;

// ====== ELEMENTOS DOM ======
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const selectBtn   = document.getElementById('selectBtn');
const addMoreBtn  = document.getElementById('addMoreBtn');
const fileSection = document.getElementById('fileSection');
const fileList    = document.getElementById('fileList');
const fileCountLabel = document.getElementById('fileCountLabel');
const mergeBtn    = document.getElementById('mergeBtn');
const mergeBtnText = document.getElementById('mergeBtnText');
const progressOverlay = document.getElementById('progressOverlay');
const progressBar = document.getElementById('progressBar');
const progressSub = document.getElementById('progressSub');
const toastContainer = document.getElementById('toastContainer');

// ====== DRAG & DROP (zona de carga) ======
dropZone.addEventListener('click', () => fileInput.click());
selectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
addMoreBtn.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
  if (files.length === 0) { showToast('Solo se aceptan archivos PDF', 'error'); return; }
  addFiles(files);
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  addFiles(files);
  fileInput.value = '';
});

// ====== AGREGAR ARCHIVOS ======
async function addFiles(files) {
  for (const file of files) {
    const exists = pdfFiles.some(f => f.name === file.name && f.size === file.size);
    if (exists) { showToast(`"${file.name}" ya fue agregado`, 'error'); continue; }

    const pageCount = await getPdfPageCount(file);
    const item = { id: nextId++, file, name: file.name, size: file.size, pageCount };
    pdfFiles.push(item);
  }
  renderFileList();
}

async function getPdfPageCount(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch { return '?'; }
}

// ====== RENDER LISTA ======
function renderFileList() {
  if (pdfFiles.length === 0) {
    fileSection.style.display = 'none';
    return;
  }
  fileSection.style.display = 'block';

  const totalPages = pdfFiles.reduce((sum, f) => sum + (typeof f.pageCount === 'number' ? f.pageCount : 0), 0);
  fileCountLabel.textContent = `${pdfFiles.length} archivo${pdfFiles.length !== 1 ? 's' : ''}` +
    (totalPages > 0 ? ` · ${totalPages} paginas en total` : '');
  mergeBtnText.textContent = `Unir ${pdfFiles.length} PDF${pdfFiles.length !== 1 ? 's' : ''}`;

  fileList.innerHTML = '';
  pdfFiles.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.dataset.id = item.id;
    li.draggable = true;

    li.innerHTML = `
      <div class="drag-handle" title="Arrastra para reordenar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
          <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
          <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
        </svg>
      </div>
      <div class="file-icon">PDF</div>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="file-meta">${formatSize(item.size)} · ${item.pageCount} pagina${item.pageCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="file-order">${index + 1}</div>
      <button class="file-remove" data-id="${item.id}" title="Eliminar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Boton eliminar
    li.querySelector('.file-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(item.id);
    });

    // Drag events para reordenar
    setupDragSort(li);

    fileList.appendChild(li);
  });
}

function removeFile(id) {
  pdfFiles = pdfFiles.filter(f => f.id !== id);
  renderFileList();
}

// ====== DRAG & DROP PARA REORDENAR ======
let dragSrc = null;

function setupDragSort(el) {
  el.addEventListener('dragstart', (e) => {
    dragSrc = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.id);
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.file-item').forEach(i => i.classList.remove('drag-target'));
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragSrc !== el) el.classList.add('drag-target');
    e.dataTransfer.dropEffect = 'move';
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-target'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-target');
    if (dragSrc === el) return;

    const srcId = parseInt(dragSrc.dataset.id);
    const dstId = parseInt(el.dataset.id);
    const srcIdx = pdfFiles.findIndex(f => f.id === srcId);
    const dstIdx = pdfFiles.findIndex(f => f.id === dstId);
    if (srcIdx === -1 || dstIdx === -1) return;

    const [moved] = pdfFiles.splice(srcIdx, 1);
    pdfFiles.splice(dstIdx, 0, moved);
    renderFileList();
  });
}

// ====== UNIR PDFs ======
mergeBtn.addEventListener('click', mergePdfs);

async function mergePdfs() {
  if (pdfFiles.length < 2) { showToast('Necesitas al menos 2 archivos PDF', 'error'); return; }

  showProgress(true);
  setProgress(5, 'Iniciando...');

  try {
    const merged = await PDFLib.PDFDocument.create();
    const step = 80 / pdfFiles.length;

    for (let i = 0; i < pdfFiles.length; i++) {
      const item = pdfFiles[i];
      setProgress(5 + i * step, `Procesando "${item.name}"...`);
      await new Promise(r => setTimeout(r, 50)); // yield para actualizar UI

      const buf = await item.file.arrayBuffer();
      const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }

    setProgress(90, 'Generando archivo final...');
    await new Promise(r => setTimeout(r, 80));

    const pdfBytes = await merged.save();
    setProgress(100, 'Listo!');
    await new Promise(r => setTimeout(r, 400));

    // Descargar
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documentos_unidos.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    showProgress(false);
    showToast(`PDF creado con exito (${pdfFiles.length} archivos unidos)`, 'success');

  } catch (err) {
    showProgress(false);
    console.error(err);
    showToast('Error al unir los PDFs. Verifica que los archivos no esten protegidos.', 'error');
  }
}

// ====== UTILIDADES ======
function showProgress(visible) {
  progressOverlay.style.display = visible ? 'flex' : 'none';
  mergeBtn.disabled = visible;
}

function setProgress(pct, text) {
  progressBar.style.width = pct + '%';
  progressSub.textContent = text;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info') {
  const icons = {
    success: `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = (icons[type] || '') + `<span>${escapeHtml(msg)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

// ====== EASTER EGG: KONAMI CODE ======
// Secuencia: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      showEasterEgg();
    }
  } else {
    konamiIdx = e.key === KONAMI[0] ? 1 : 0;
  }
});

const easterEgg = document.getElementById('easterEgg');
const eeClose   = document.getElementById('eeClose');

function showEasterEgg() {
  easterEgg.classList.add('active');
}
eeClose.addEventListener('click', () => easterEgg.classList.remove('active'));
easterEgg.addEventListener('click', (e) => {
  if (e.target === easterEgg) easterEgg.classList.remove('active');
});

