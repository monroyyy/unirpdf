/**
 * PDFusion — Suite de herramientas PDF
 * Hecho por SystemMp · 2026
 */

// ====== STATE ======
let mergeFiles = [], imageFiles = [];
let splitFile = null, splitPageCount = 0;
let rotateFile = null, rotatePageCount = 0;
let deleteFile = null, deletePageCount = 0;
let nextId = 0;
let dragSrc = null;

// ====== DOM REFS ======
const toolHome        = document.getElementById('toolHome');
const progressOverlay = document.getElementById('progressOverlay');
const progressBar     = document.getElementById('progressBar');
const progressSub     = document.getElementById('progressSub');
const progressTitle   = document.getElementById('progressTitle');
const toastContainer  = document.getElementById('toastContainer');

// ====== NAVIGATION ======
document.getElementById('logoHome').addEventListener('click', backToHome);
document.querySelectorAll('.tool-card').forEach(card => {
  card.addEventListener('click', () => showTool(card.dataset.tool));
});
['Merge','Split','Images','Rotate','Delete'].forEach(n => {
  document.getElementById('back' + n).addEventListener('click', backToHome);
});

function showTool(id) {
  toolHome.style.display = 'none';
  document.querySelectorAll('.tool-panel').forEach(p => p.style.display = 'none');
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  document.getElementById('panel' + name).style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function backToHome() {
  document.querySelectorAll('.tool-panel').forEach(p => p.style.display = 'none');
  toolHome.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ====== SHARED UTILS ======
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function parseRange(input, max) {
  const pages = new Set();
  for (const part of input.split(',')) {
    const t = part.trim();
    const r = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (r) {
      const a = Math.max(1,+r[1]), b = Math.min(max,+r[2]);
      for (let i = a; i <= b; i++) pages.add(i-1);
    } else {
      const p = +t;
      if (p >= 1 && p <= max) pages.add(p-1);
    }
  }
  return [...pages].sort((a,b) => a-b);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function getPageCount(file) {
  try {
    const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption:true});
    return pdf.getPageCount();
  } catch { return 0; }
}

// Progress
function showProg(title) {
  progressTitle.textContent = title || 'Procesando...';
  progressBar.style.width = '0%';
  progressSub.textContent = 'Preparando...';
  progressOverlay.style.display = 'flex';
}
function setProg(pct, sub) {
  progressBar.style.width = pct + '%';
  if (sub) progressSub.textContent = sub;
}
function hideProg() { progressOverlay.style.display = 'none'; }

// Toast
function toast(msg, type = 'info') {
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = (icons[type]||'') + '<span>' + esc(msg) + '</span>';
  toastContainer.appendChild(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(()=>t.remove(),350); }, 4000);
}

// Drop zone setup (drag events + file input)
function setupDrop(zone, input, onFiles) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', e => { if(!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files);
    if (files.length) onFiles(files);
    input.value = '';
  });
}

// Drag-sort list items
function setupDragItem(li, onSwap) {
  li.draggable = true;
  li.addEventListener('dragstart', e => {
    dragSrc = li; li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('.file-item').forEach(i => i.classList.remove('drag-target'));
  });
  li.addEventListener('dragover', e => { e.preventDefault(); if(dragSrc!==li) li.classList.add('drag-target'); });
  li.addEventListener('dragleave', () => li.classList.remove('drag-target'));
  li.addEventListener('drop', e => {
    e.preventDefault(); li.classList.remove('drag-target');
    if (dragSrc===li) return;
    onSwap(+dragSrc.dataset.id, +li.dataset.id);
  });
}

// Loaded file info card
function renderFileCard(container, file, pageCount, onClear) {
  container.innerHTML =
    '<div class="lfi-icon">PDF</div>' +
    '<div class="lfi-info"><div class="lfi-name">' + esc(file.name) + '</div>' +
    '<div class="lfi-meta">' + fmtSize(file.size) + ' &middot; ' + pageCount + ' p&aacute;gina' + (pageCount!==1?'s':'') + '</div></div>' +
    '<button class="lfi-change">Cambiar</button>';
  container.querySelector('.lfi-change').addEventListener('click', onClear);
}

// Drag handle SVG
const HANDLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>';
const REMOVE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// ============================================================
// TOOL 1: FUSIONAR
// ============================================================
const mDropZone  = document.getElementById('mergeDropZone');
const mFileInput = document.getElementById('mergeFileInput');
const mSection   = document.getElementById('mergeFileSection');
const mList      = document.getElementById('mergeFileList');
const mLabel     = document.getElementById('mergeCountLabel');
const mBtn       = document.getElementById('mergeMergeBtn');
const mBtnTxt    = document.getElementById('mergeBtnText');

document.getElementById('mergeSelectBtn').addEventListener('click', e => { e.stopPropagation(); mFileInput.click(); });
document.getElementById('mergeAddMore').addEventListener('click', () => mFileInput.click());
mDropZone.addEventListener('click', e => { if(!e.target.closest('button')) mFileInput.click(); });
setupDrop(mDropZone, mFileInput, files => mergeAdd(files.filter(f=>f.type==='application/pdf'||f.name.endsWith('.pdf'))));

async function mergeAdd(files) {
  for (const f of files) {
    if (mergeFiles.some(x=>x.name===f.name&&x.size===f.size)) { toast('"'+f.name+'" ya fue agregado','error'); continue; }
    const n = await getPageCount(f);
    mergeFiles.push({ id: nextId++, file:f, name:f.name, size:f.size, pageCount:n });
  }
  mergeRender();
}
function mergeRender() {
  if (!mergeFiles.length) { mSection.style.display='none'; return; }
  mSection.style.display = 'block';
  const total = mergeFiles.reduce((s,f)=>s+(+f.pageCount||0),0);
  mLabel.textContent = mergeFiles.length + ' archivo' + (mergeFiles.length!==1?'s':'') + ' · ' + total + ' pags.';
  mBtnTxt.textContent = 'Fusionar ' + mergeFiles.length + ' PDF' + (mergeFiles.length!==1?'s':'');
  mList.innerHTML = '';
  mergeFiles.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'file-item'; li.dataset.id = item.id;
    li.innerHTML =
      '<div class="drag-handle">' + HANDLE_SVG + '</div>' +
      '<div class="file-icon">PDF</div>' +
      '<div class="file-info"><div class="file-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
      '<div class="file-meta">' + fmtSize(item.size) + ' &middot; ' + item.pageCount + ' p&aacute;g.</div></div>' +
      '<div class="file-order">' + (idx+1) + '</div>' +
      '<button class="file-remove" data-id="' + item.id + '">' + REMOVE_SVG + '</button>';
    li.querySelector('.file-remove').addEventListener('click', e => {
      e.stopPropagation();
      mergeFiles = mergeFiles.filter(f=>f.id!==item.id);
      mergeRender();
    });
    setupDragItem(li, (src, dst) => {
      const si=mergeFiles.findIndex(f=>f.id===src), di=mergeFiles.findIndex(f=>f.id===dst);
      if(si<0||di<0) return;
      const [m]=mergeFiles.splice(si,1); mergeFiles.splice(di,0,m); mergeRender();
    });
    mList.appendChild(li);
  });
}
mBtn.addEventListener('click', async () => {
  if (mergeFiles.length < 2) { toast('Necesitas al menos 2 PDFs','error'); return; }
  showProg('Fusionando PDFs...');
  try {
    const merged = await PDFLib.PDFDocument.create();
    for (let i=0; i<mergeFiles.length; i++) {
      setProg(5+i*(85/mergeFiles.length), 'Procesando "'+mergeFiles[i].name+'"...');
      await new Promise(r=>setTimeout(r,30));
      const src = await PDFLib.PDFDocument.load(await mergeFiles[i].file.arrayBuffer(),{ignoreEncryption:true});
      (await merged.copyPages(src,src.getPageIndices())).forEach(p=>merged.addPage(p));
    }
    setProg(95,'Generando PDF...'); await new Promise(r=>setTimeout(r,50));
    const bytes = await merged.save();
    setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
    hideProg();
    download(new Blob([bytes],{type:'application/pdf'}), 'fusion.pdf');
    toast(mergeFiles.length + ' archivos fusionados con exito','success');
  } catch(e) { hideProg(); toast('Error al fusionar los PDFs','error'); console.error(e); }
});

// ============================================================
// TOOL 2: DIVIDIR
// ============================================================
const sDropZone  = document.getElementById('splitDropZone');
const sFileInput = document.getElementById('splitFileInput');
const sOptions   = document.getElementById('splitOptions');
const sFileInfo  = document.getElementById('splitFileInfo');
const sBtn       = document.getElementById('splitBtn');

document.getElementById('splitSelectBtn').addEventListener('click', e => { e.stopPropagation(); sFileInput.click(); });
sDropZone.addEventListener('click', e => { if(!e.target.closest('button')) sFileInput.click(); });
setupDrop(sDropZone, sFileInput, files => {
  const f = files.find(f=>f.type==='application/pdf'||f.name.endsWith('.pdf'));
  if(f) splitLoad(f);
});
async function splitLoad(file) {
  const n = await getPageCount(file);
  if (!n) { toast('No se pudo leer el PDF','error'); return; }
  splitFile=file; splitPageCount=n;
  sOptions.style.display='block'; sDropZone.style.display='none';
  renderFileCard(sFileInfo, file, n, () => { splitFile=null; sOptions.style.display='none'; sDropZone.style.display='block'; });
}

// Mode toggle
document.querySelectorAll('#splitModeToggle .mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#splitModeToggle .mode-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('splitExtract').style.display = btn.dataset.mode==='extract'?'block':'none';
    document.getElementById('splitEvery').style.display   = btn.dataset.mode==='every'?'block':'none';
  });
});

sBtn.addEventListener('click', async () => {
  if (!splitFile) return;
  const mode = document.querySelector('#splitModeToggle .mode-btn.active').dataset.mode;
  if (mode === 'extract') {
    const input = document.getElementById('splitExtractInput').value.trim();
    if (!input) { toast('Ingresa las paginas a extraer','error'); return; }
    const pages = parseRange(input, splitPageCount);
    if (!pages.length) { toast('Paginas no validas (rango: 1-'+splitPageCount+')','error'); return; }
    showProg('Extrayendo paginas...');
    try {
      const src = await PDFLib.PDFDocument.load(await splitFile.arrayBuffer(),{ignoreEncryption:true});
      const out = await PDFLib.PDFDocument.create();
      setProg(40,'Copiando '+pages.length+' paginas...');
      (await out.copyPages(src,pages)).forEach(p=>out.addPage(p));
      setProg(85,'Generando PDF...'); await new Promise(r=>setTimeout(r,50));
      const bytes = await out.save();
      setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
      hideProg();
      download(new Blob([bytes],{type:'application/pdf'}), 'paginas-extraidas.pdf');
      toast(pages.length + ' paginas extraidas','success');
    } catch(e) { hideProg(); toast('Error al procesar','error'); console.error(e); }
  } else {
    const n = Math.max(1, parseInt(document.getElementById('splitEveryInput').value)||1);
    showProg('Dividiendo PDF...');
    try {
      const src = await PDFLib.PDFDocument.load(await splitFile.arrayBuffer(),{ignoreEncryption:true});
      const total = src.getPageCount();
      const parts = Math.ceil(total/n);
      const zip = new JSZip();
      for (let i=0; i<parts; i++) {
        setProg(5+(i/parts)*85, 'Generando parte '+(i+1)+' de '+parts+'...');
        await new Promise(r=>setTimeout(r,20));
        const out = await PDFLib.PDFDocument.create();
        const from=i*n, to=Math.min(from+n,total);
        const idxs = Array.from({length:to-from},(_,j)=>from+j);
        (await out.copyPages(src,idxs)).forEach(p=>out.addPage(p));
        zip.file('parte-'+String(i+1).padStart(3,'0')+'.pdf', await out.save());
      }
      setProg(95,'Comprimiendo ZIP...');
      const blob = await zip.generateAsync({type:'blob'});
      setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
      hideProg();
      download(blob,'partes.zip');
      toast('PDF dividido en '+parts+' partes','success');
    } catch(e) { hideProg(); toast('Error al dividir','error'); console.error(e); }
  }
});

// ============================================================
// TOOL 3: IMAGENES → PDF
// ============================================================
const iDropZone  = document.getElementById('imagesDropZone');
const iFileInput = document.getElementById('imagesFileInput');
const iSection   = document.getElementById('imagesSection');
const iList      = document.getElementById('imagesFileList');
const iLabel     = document.getElementById('imagesCountLabel');
const iConvBtn   = document.getElementById('imagesConvertBtn');

document.getElementById('imagesSelectBtn').addEventListener('click', e => { e.stopPropagation(); iFileInput.click(); });
document.getElementById('imagesAddMore').addEventListener('click', () => iFileInput.click());
iDropZone.addEventListener('click', e => { if(!e.target.closest('button')) iFileInput.click(); });
setupDrop(iDropZone, iFileInput, files => imagesAdd(files.filter(f=>f.type.startsWith('image/'))));

function imagesAdd(files) {
  for (const f of files) {
    if (imageFiles.some(x=>x.name===f.name&&x.size===f.size)) { toast('"'+f.name+'" ya agregado','error'); continue; }
    imageFiles.push({ id:nextId++, file:f, name:f.name, size:f.size, url:URL.createObjectURL(f) });
  }
  imagesRender();
}
function imagesRender() {
  if (!imageFiles.length) { iSection.style.display='none'; return; }
  iSection.style.display='block';
  iLabel.textContent = imageFiles.length + ' imagen' + (imageFiles.length!==1?'es':'');
  iList.innerHTML='';
  imageFiles.forEach((item,idx) => {
    const li = document.createElement('li');
    li.className='file-item'; li.dataset.id=item.id;
    li.innerHTML =
      '<div class="drag-handle">'+HANDLE_SVG+'</div>'+
      '<img class="file-thumb" src="'+item.url+'" alt="'+esc(item.name)+'" />'+
      '<div class="file-info"><div class="file-name" title="'+esc(item.name)+'">'+esc(item.name)+'</div>'+
      '<div class="file-meta">'+fmtSize(item.size)+'</div></div>'+
      '<div class="file-order">'+(idx+1)+'</div>'+
      '<button class="file-remove">'+REMOVE_SVG+'</button>';
    li.querySelector('.file-remove').addEventListener('click', e => {
      e.stopPropagation();
      URL.revokeObjectURL(item.url);
      imageFiles=imageFiles.filter(f=>f.id!==item.id);
      imagesRender();
    });
    setupDragItem(li, (src,dst) => {
      const si=imageFiles.findIndex(f=>f.id===src), di=imageFiles.findIndex(f=>f.id===dst);
      if(si<0||di<0) return;
      const [m]=imageFiles.splice(si,1); imageFiles.splice(di,0,m); imagesRender();
    });
    iList.appendChild(li);
  });
}

async function embedImg(pdfDoc, file) {
  if (file.type==='image/jpeg') return pdfDoc.embedJpg(await file.arrayBuffer());
  return new Promise((resolve,reject) => {
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload = () => {
      const c=document.createElement('canvas');
      c.width=img.naturalWidth; c.height=img.naturalHeight;
      c.getContext('2d').drawImage(img,0,0);
      URL.revokeObjectURL(url);
      c.toBlob(async blob => {
        try { resolve(await pdfDoc.embedPng(await blob.arrayBuffer())); } catch(e){reject(e);}
      },'image/png');
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('img load'));};
    img.src=url;
  });
}

iConvBtn.addEventListener('click', async () => {
  if (!imageFiles.length) { toast('Agrega al menos una imagen','error'); return; }
  const sz  = document.getElementById('imagePageSize').value;
  const ori = document.getElementById('imageOrientation').value;
  const SIZES = { A4:[595.28,841.89], Letter:[612,792] };
  showProg('Convirtiendo imagenes a PDF...');
  try {
    const pdf = await PDFLib.PDFDocument.create();
    for (let i=0; i<imageFiles.length; i++) {
      setProg(5+(i/imageFiles.length)*85,'Procesando imagen '+(i+1)+'/'+imageFiles.length+'...');
      await new Promise(r=>setTimeout(r,20));
      const emb = await embedImg(pdf, imageFiles[i].file);
      const {width:iw,height:ih} = emb.scale(1);
      let pw,ph;
      if (sz==='fit') { pw=iw; ph=ih; }
      else {
        [pw,ph]=SIZES[sz];
        if (ori==='landscape') [pw,ph]=[ph,pw];
      }
      const page=pdf.addPage([pw,ph]);
      const mg=sz==='fit'?0:24;
      const aw=pw-2*mg, ah=ph-2*mg;
      const sc=Math.min(aw/iw,ah/ih);
      page.drawImage(emb,{x:(pw-iw*sc)/2,y:(ph-ih*sc)/2,width:iw*sc,height:ih*sc});
    }
    setProg(95,'Generando PDF...'); await new Promise(r=>setTimeout(r,50));
    const bytes=await pdf.save();
    setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
    hideProg();
    download(new Blob([bytes],{type:'application/pdf'}),'imagenes.pdf');
    toast(imageFiles.length+' imagen'+(imageFiles.length!==1?'es':'')+' convertida'+(imageFiles.length!==1?'s':'')+' a PDF','success');
  } catch(e) { hideProg(); toast('Error al convertir imagenes','error'); console.error(e); }
});

// ============================================================
// TOOL 4: ROTAR
// ============================================================
const rDropZone  = document.getElementById('rotateDropZone');
const rFileInput = document.getElementById('rotateFileInput');
const rOptions   = document.getElementById('rotateOptions');
const rFileInfo  = document.getElementById('rotateFileInfo');
const rBtn       = document.getElementById('rotateBtn');

document.getElementById('rotateSelectBtn').addEventListener('click', e => { e.stopPropagation(); rFileInput.click(); });
rDropZone.addEventListener('click', e => { if(!e.target.closest('button')) rFileInput.click(); });
setupDrop(rDropZone, rFileInput, files => {
  const f=files.find(f=>f.type==='application/pdf'||f.name.endsWith('.pdf'));
  if(f) rotateLoad(f);
});
async function rotateLoad(file) {
  const n=await getPageCount(file);
  if(!n){toast('No se pudo leer el PDF','error');return;}
  rotateFile=file; rotatePageCount=n;
  rOptions.style.display='block'; rDropZone.style.display='none';
  renderFileCard(rFileInfo,file,n,()=>{rotateFile=null;rOptions.style.display='none';rDropZone.style.display='block';});
}
document.querySelectorAll('input[name="rotatePages"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('rotateSpecificInput').style.display = radio.value==='specific'?'block':'none';
  });
});
document.querySelectorAll('.angle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.angle-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});
rBtn.addEventListener('click', async () => {
  if(!rotateFile) return;
  const pMode = document.querySelector('input[name="rotatePages"]:checked').value;
  const angle = +document.querySelector('.angle-btn.active').dataset.angle;
  let pagesToRot;
  if (pMode==='all') {
    pagesToRot=Array.from({length:rotatePageCount},(_,i)=>i);
  } else {
    const input=document.getElementById('rotatePagesInput').value.trim();
    if(!input){toast('Ingresa las paginas a rotar','error');return;}
    pagesToRot=parseRange(input,rotatePageCount);
    if(!pagesToRot.length){toast('Paginas no validas','error');return;}
  }
  showProg('Rotando paginas...');
  try {
    const pdf=await PDFLib.PDFDocument.load(await rotateFile.arrayBuffer(),{ignoreEncryption:true});
    setProg(40,'Rotando '+pagesToRot.length+' paginas...');
    const pages=pdf.getPages();
    for (const idx of pagesToRot) {
      const cur=pages[idx].getRotation().angle;
      pages[idx].setRotation(PDFLib.degrees((cur+angle)%360));
    }
    setProg(85,'Guardando...'); await new Promise(r=>setTimeout(r,50));
    const bytes=await pdf.save();
    setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
    hideProg();
    download(new Blob([bytes],{type:'application/pdf'}),'rotado.pdf');
    toast(pagesToRot.length+' pagina'+(pagesToRot.length!==1?'s':'')+' rotada'+(pagesToRot.length!==1?'s':''),'success');
  } catch(e){hideProg();toast('Error al rotar','error');console.error(e);}
});

// ============================================================
// TOOL 5: ELIMINAR PAGINAS
// ============================================================
const dDropZone  = document.getElementById('deleteDropZone');
const dFileInput = document.getElementById('deleteFileInput');
const dOptions   = document.getElementById('deleteOptions');
const dFileInfo  = document.getElementById('deleteFileInfo');
const dBtn       = document.getElementById('deleteBtn');

document.getElementById('deleteSelectBtn').addEventListener('click', e => { e.stopPropagation(); dFileInput.click(); });
dDropZone.addEventListener('click', e => { if(!e.target.closest('button')) dFileInput.click(); });
setupDrop(dDropZone, dFileInput, files => {
  const f=files.find(f=>f.type==='application/pdf'||f.name.endsWith('.pdf'));
  if(f) deleteLoad(f);
});
async function deleteLoad(file) {
  const n=await getPageCount(file);
  if(!n){toast('No se pudo leer el PDF','error');return;}
  deleteFile=file; deletePageCount=n;
  dOptions.style.display='block'; dDropZone.style.display='none';
  renderFileCard(dFileInfo,file,n,()=>{deleteFile=null;dOptions.style.display='none';dDropZone.style.display='block';});
}
dBtn.addEventListener('click', async () => {
  if(!deleteFile) return;
  const input=document.getElementById('deletePagesInput').value.trim();
  if(!input){toast('Ingresa las paginas a eliminar','error');return;}
  const toDelete=parseRange(input,deletePageCount);
  if(!toDelete.length){toast('Paginas no validas','error');return;}
  if(toDelete.length>=deletePageCount){toast('No puedes eliminar todas las paginas','error');return;}
  showProg('Eliminando paginas...');
  try {
    const src=await PDFLib.PDFDocument.load(await deleteFile.arrayBuffer(),{ignoreEncryption:true});
    const toDelSet=new Set(toDelete);
    const toKeep=Array.from({length:deletePageCount},(_,i)=>i).filter(i=>!toDelSet.has(i));
    const out=await PDFLib.PDFDocument.create();
    setProg(40,'Procesando...');
    (await out.copyPages(src,toKeep)).forEach(p=>out.addPage(p));
    setProg(85,'Guardando...'); await new Promise(r=>setTimeout(r,50));
    const bytes=await out.save();
    setProg(100,'Listo!'); await new Promise(r=>setTimeout(r,300));
    hideProg();
    download(new Blob([bytes],{type:'application/pdf'}),'resultado.pdf');
    toast(toDelete.length+' pagina'+(toDelete.length!==1?'s':'')+' eliminada'+(toDelete.length!==1?'s':''),'success');
  } catch(e){hideProg();toast('Error al procesar','error');console.error(e);}
});

// ============================================================
// EASTER EGG: KONAMI CODE
// ============================================================
const KONAMI=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let ki=0;
document.addEventListener('keydown', e => {
  ki = e.key===KONAMI[ki] ? ki+1 : (e.key===KONAMI[0]?1:0);
  if(ki===KONAMI.length){ki=0;document.getElementById('easterEgg').classList.add('active');}
});
document.getElementById('eeClose').addEventListener('click', () => document.getElementById('easterEgg').classList.remove('active'));
document.getElementById('easterEgg').addEventListener('click', e => {
  if(e.target===document.getElementById('easterEgg')) document.getElementById('easterEgg').classList.remove('active');
});

// ============================================================
// TOOL 6: QUITAR FONDO (IA — @imgly/background-removal)
// ============================================================
let bgFile = null;
let bgResultBlob = null;
const BG_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';
const BG_DATA_URL = 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/';

const bgDropZone   = document.getElementById('bgDropZone');
const bgFileInput  = document.getElementById('bgFileInput');
const bgSection    = document.getElementById('bgSection');
const bgProcessBtn = document.getElementById('bgProcessBtn');
const bgDownloadBtn= document.getElementById('bgDownloadBtn');
const bgResetBtn   = document.getElementById('bgResetBtn');
const bgOriginalImg= document.getElementById('bgOriginalImg');
const bgResultImg  = document.getElementById('bgResultImg');
const bgResultPane = document.getElementById('bgResultPane');

// Navigation
document.getElementById('backBgremove').addEventListener('click', backToHome);

// Drop zone
document.getElementById('bgSelectBtn').addEventListener('click', e => { e.stopPropagation(); bgFileInput.click(); });
bgDropZone.addEventListener('click', e => { if(!e.target.closest('button')) bgFileInput.click(); });
setupDrop(bgDropZone, bgFileInput, files => {
  const f = files.find(f => f.type.startsWith('image/'));
  if (f) bgLoad(f);
});

function bgLoad(file) {
  bgFile = file;
  bgResultBlob = null;

  // Reset UI
  bgResultPane.style.display = 'none';
  bgDownloadBtn.style.display = 'none';
  bgResetBtn.style.display = 'none';
  bgProcessBtn.style.display = 'flex';

  // Show original preview
  const url = URL.createObjectURL(file);
  bgOriginalImg.src = url;
  bgOriginalImg.onload = () => URL.revokeObjectURL(url);

  bgDropZone.style.display = 'none';
  bgSection.style.display = 'block';
}

bgProcessBtn.addEventListener('click', async () => {
  if (!bgFile) return;
  showProg('Preparando modelo de IA...');
  try {
    if (!window.imglyRemoveBackground) {
      toast('Cargando libreria... intenta de nuevo en unos segundos', 'info');
      hideProg();
      return;
    }
    const removeBackground = window.imglyRemoveBackground;

    setProg(15, 'Descargando modelo (primera vez ~50 MB)...');
    progressTitle.textContent = 'Quitando fondo...';

    bgResultBlob = await removeBackground(bgFile, {
      publicPath: BG_DATA_URL,
      progress: (key, cur, total) => {
        if (total > 0) {
          const pct = 15 + Math.round((cur / total) * 75);
          setProg(Math.min(pct, 90), 'Procesando modelo...');
        }
      },
    });

    setProg(95, 'Generando resultado...');
    await new Promise(r => setTimeout(r, 200));

    // Show result
    const resUrl = URL.createObjectURL(bgResultBlob);
    bgResultImg.src = resUrl;
    bgResultImg.onload = () => URL.revokeObjectURL(resUrl);
    bgResultPane.style.display = 'block';

    // Swap buttons
    bgProcessBtn.style.display = 'none';
    bgDownloadBtn.style.display = 'flex';
    bgResetBtn.style.display = 'flex';

    setProg(100, 'Listo!');
    await new Promise(r => setTimeout(r, 300));
    hideProg();
    toast('Fondo eliminado con exito', 'success');
  } catch (e) {
    hideProg();
    console.error(e);
    if (e.message && e.message.includes('import')) {
      toast('Error de conexion: necesitas internet para cargar el modelo la primera vez', 'error');
    } else {
      toast('Error al quitar el fondo. Prueba con otra imagen.', 'error');
    }
  }
});

bgDownloadBtn.addEventListener('click', () => {
  if (!bgResultBlob) return;
  const base = bgFile.name.replace(/\.[^.]+$/, '');
  download(bgResultBlob, base + '-sin-fondo.png');
  toast('Imagen descargada como PNG', 'success');
});

bgResetBtn.addEventListener('click', () => {
  bgFile = null; bgResultBlob = null;
  bgOriginalImg.src = '';
  bgResultImg.src = '';
  bgResultPane.style.display = 'none';
  bgDownloadBtn.style.display = 'none';
  bgResetBtn.style.display = 'none';
  bgProcessBtn.style.display = 'flex';
  bgSection.style.display = 'none';
  bgDropZone.style.display = 'block';
});
