'use strict';
const $ = id => document.getElementById(id);
let images = [], best = null, sequence = 0, busy = false, searching = false, cancelled = false, editing = null, dragId = null;
const status = message => { $('status').textContent = message; };
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function invalidate(message = 'Collection or settings changed. Arrange images to update the preview.') {
  best = null;
  $('progress').hidden = true; $('searchProgress').hidden = true;
  $('pages').innerHTML = '<div class="empty">Arrange your images to preview the pages.</div>';
  $('summary').textContent = 'Your arranged pages will appear here.';
  status(message); updateButtons();
}
function updateButtons() {
  $('run').disabled = busy || !images.length;
  for (const id of ['print','export','useOrder']) $(id).disabled = busy || !best;
  for (const id of ['addFiles','addFolder','clear','sort']) $(id).disabled = busy;
  $('settings').disabled = busy;
  $('cancel').hidden = !searching;
  $('gallery').querySelectorAll('button, input').forEach(b => { b.disabled = busy || b.dataset.boundary === 'true'; });
}
function loadImage(src) { return new Promise((resolve,reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('This image format could not be opened.')); im.src = src; }); }
async function readFiles(list) {
  if (busy) return;
  const files = Array.from(list).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|svg|heic|heif)$/i.test(f.name));
  if (!files.length) { status('No image files found. Use Add folder for a directory.'); return; }
  busy = true; updateButtons(); status(`Opening ${files.length} images…`);
  let loaded = 0, failed = [];
  try {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const im = await loadImage(url);
        if (!im.naturalWidth || !im.naturalHeight) throw new Error('Empty image');
        images.push({ id: sequence++, file, url, display: url, width: im.naturalWidth, height: im.naturalHeight, clippedWidth:im.naturalWidth, clippedHeight:im.naturalHeight, weight:1, ratio: im.naturalWidth / im.naturalHeight, crop: {l:0,t:0,r:0,b:0} }); loaded++;
      } catch { URL.revokeObjectURL(url); failed.push(file.name); }
    }
    $('sort').value = 'manual'; renderGallery();
    invalidate(`${loaded} added · ${images.length} images total.${failed.length ? ` Could not open ${failed.length}: ${failed.slice(0,3).join(', ')}. Try converting these to JPG or PNG.` : ' Add more images or arrange your pages.'}`);
  } finally { busy = false; updateButtons(); }
}
for (const [button,input] of [['addFiles','files'],['addFolder','folder']]) {
  $(button).onclick = () => $(input).click();
  $(input).onchange = e => { readFiles(e.target.files); e.target.value = ''; };
}
$('dropzone').ondragover = e => { e.preventDefault(); if (!busy) $('dropzone').classList.add('drag'); };
$('dropzone').ondragleave = () => $('dropzone').classList.remove('drag');
$('dropzone').ondrop = e => { e.preventDefault(); $('dropzone').classList.remove('drag'); readFiles(e.dataTransfer.files); };
// Prevent accidentally navigating away when a file misses the drop area.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
function release(im) { URL.revokeObjectURL(im.url); if (im.display !== im.url) URL.revokeObjectURL(im.display); }
$('clear').onclick = () => { images.forEach(release); images = []; renderGallery(); invalidate('Add images to get started.'); };
function move(from,to) {
  if (busy || from === to || to < 0 || to >= images.length) return;
  images.splice(to,0,images.splice(from,1)[0]); $('sort').value = 'manual'; renderGallery(); invalidate();
}
function renderGallery() {
  $('count').textContent = `${images.length} image${images.length === 1 ? '' : 's'}`;
  $('gallery').replaceChildren();
  if (!images.length) $('gallery').innerHTML = '<div class="empty">Your collection starts here.<br><small>Add image files from any folder.</small></div>';
  images.forEach((im,index) => {
    const card = document.createElement('article'); card.className = 'card'; card.draggable = true;
    card.innerHTML = `<button class="thumb" aria-label="Preview and crop ${escapeHTML(im.file.name)}"><img src="${im.display}" alt="${escapeHTML(im.file.name)}" draggable="false"><span class="badge">${index+1}</span></button><div class="card-name" title="${escapeHTML(im.file.webkitRelativePath || im.file.name)}">${escapeHTML(im.file.name)}</div><small>${im.width} × ${im.height}${Object.values(im.crop).some(Boolean) ? ' · cropped' : ''}</small><div class="card-actions"><button data-action="left" aria-label="Move ${escapeHTML(im.file.name)} earlier">←</button><button data-action="right" aria-label="Move ${escapeHTML(im.file.name)} later">→</button><button data-action="remove" aria-label="Remove ${escapeHTML(im.file.name)}">×</button></div>`;
    card.querySelector('.thumb').onclick = () => openEditor(im);
    card.querySelector('small').textContent = `${im.clippedWidth} × ${im.clippedHeight}${Object.values(im.crop).some(Boolean) ? ' · clipped' : ''} · ${im.weight===1 ? 'Normal size' : im.weight+'× area'}`;
    const weightLabel = document.createElement('label'); weightLabel.className = 'image-weight';
    weightLabel.textContent = 'Size weight';
    const weightInput = document.createElement('input');
    weightInput.type = 'number'; weightInput.min = '0.1'; weightInput.max = '100'; weightInput.step = 'any'; weightInput.required = true;
    weightInput.value = String(im.weight); weightInput.title = 'Relative printed area: 2 gives twice the area of weight 1.';
    weightInput.onchange = () => {
      if (busy) return;
      const weight = Number(weightInput.value);
      if (!validWeight(weight)) { weightInput.value = String(im.weight); status('Enter a size weight from 0.1 to 100.'); return; }
      im.weight = weight; renderGallery(); invalidate('Image weight saved. Arrange images to update the printed sizes.');
    };
    weightInput.ondragstart = e => e.stopPropagation();
    weightLabel.append(weightInput); card.append(weightLabel);
    for (const [action,delta] of [['left',-1],['right',1]]) {
      const b = card.querySelector(`[data-action="${action}"]`); b.dataset.boundary = String(index+delta < 0 || index+delta >= images.length); b.onclick = () => move(index,index+delta);
    }
    card.querySelector('[data-action="remove"]').onclick = () => { release(im); images.splice(index,1); renderGallery(); invalidate(); };
    card.ondragstart = e => { if (busy) { e.preventDefault(); return; } dragId = im.id; e.dataTransfer.setData('text/plain',String(im.id)); e.dataTransfer.effectAllowed = 'move'; };
    card.ondragover = e => e.preventDefault();
    card.ondrop = e => { e.preventDefault(); e.stopPropagation(); if (dragId !== null) move(images.findIndex(x => x.id === dragId),index); dragId = null; };
    card.ondragend = () => { dragId = null; };
    $('gallery').append(card);
  }); updateButtons();
}
$('sort').onchange = () => {
  const cmp = {name:(a,b)=>a.file.name.localeCompare(b.file.name,undefined,{numeric:true}),newest:(a,b)=>b.file.lastModified-a.file.lastModified,wide:(a,b)=>b.ratio-a.ratio,tall:(a,b)=>a.ratio-b.ratio,added:(a,b)=>a.id-b.id}[$('sort').value];
  if (cmp) { images.sort(cmp); renderGallery(); invalidate(); }
};
const cropIds = ['cropLeft','cropTop','cropRight','cropBottom'];
function getCrop() { const [l,t,r,b] = cropIds.map(id => $(id).value.trim() === '' ? NaN : Number($(id).value)); return {l,t,r,b}; }
function validCrop(c) { return Object.values(c).every(v => Number.isFinite(v) && v >= 0 && v <= 99) && c.l+c.r < 99.9 && c.t+c.b < 99.9; }
function validWeight(value) { return Number.isFinite(value) && value >= 0.1 && value <= 100; }
function setCrop(c) { cropIds.forEach((id,i) => { $(id).value = [c.l,c.t,c.r,c.b][i].toFixed(1); }); drawCrop(); }
function drawCrop() {
  const c = getCrop(), valid = validCrop(c), weightOK = validWeight(Number($('imageSize').value)); $('saveCrop').disabled = busy || !valid || !weightOK;
  $('cropStatus').textContent = !valid ? 'Keep a non-empty area. Opposing trims must total less than 100%.' : !weightOK ? 'Enter a size weight from 0.1 to 100.' : '';
  if (valid) Object.assign($('cropBox').style,{left:c.l+'%',top:c.t+'%',width:(100-c.l-c.r)+'%',height:(100-c.t-c.b)+'%'});
}
function openEditor(im) {
  if (busy) return;
  editing = im; $('editorTitle').textContent = im.file.name; $('imageInfo').textContent = `${im.width} × ${im.height} pixels · original image`;
  $('imageSize').value = String(im.weight); $('clippedPreview').src = im.display;
  $('cropImage').src = im.url; setCrop(im.crop); $('editor').showModal();
}
cropIds.forEach(id => { $(id).oninput = drawCrop; });
$('imageSize').oninput = drawCrop;
$('cropImage').ondragstart = e => e.preventDefault();
let cropStart = null;
function point(e) { const r = $('cropStage').getBoundingClientRect(); return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))}; }
$('cropStage').onpointerdown = e => { if(e.button !== 0) return; cropStart = point(e); $('cropStage').setPointerCapture(e.pointerId); };
$('cropStage').onpointermove = e => { if (!cropStart) return; const p = point(e); if (Math.abs(p.x-cropStart.x) < 1 || Math.abs(p.y-cropStart.y) < 1) return; setCrop({l:Math.min(p.x,cropStart.x),t:Math.min(p.y,cropStart.y),r:100-Math.max(p.x,cropStart.x),b:100-Math.max(p.y,cropStart.y)}); };
$('cropStage').onpointerup = $('cropStage').onpointercancel = () => { cropStart = null; };
$('resetCrop').onclick = () => setCrop({l:0,t:0,r:0,b:0});
$('saveCrop').onclick = async () => {
  const c = getCrop(); if (busy || !editing || !validCrop(c) || !validWeight(Number($('imageSize').value))) return;
  const im = editing; $('saveCrop').disabled = true; busy = true; updateButtons();
  try {
    const source = await loadImage(im.url);
    let display = im.url;
    const w = Math.max(1,Math.round(im.width*(100-c.l-c.r)/100)), h = Math.max(1,Math.round(im.height*(100-c.t-c.b)/100));
    if (Object.values(c).some(Boolean)) {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(source,im.width*c.l/100,im.height*c.t/100,im.width*(100-c.l-c.r)/100,im.height*(100-c.t-c.b)/100,0,0,w,h);
      const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      if (!blob) throw new Error('Image is too large to crop in this browser.');
      display = URL.createObjectURL(blob);
    }
    if (im.display !== im.url) URL.revokeObjectURL(im.display);
    im.display = display; im.crop = c; im.ratio = w/h; im.clippedWidth=w; im.clippedHeight=h;
    im.weight = Number($('imageSize').value);
    $('clippedPreview').src = display;
    renderGallery(); invalidate('Clipped image and size saved. The layout and print export will use this clipped image. Arrange images to update the pages.');
    $('cropStatus').textContent = 'Saved. The preview below is the image that will be used in the layout.';
  } catch(e) { $('cropStatus').textContent = e.message; }
  finally { busy = false; updateButtons(); $('saveCrop').disabled = false; }
};
function modeHint() {
  const mode = $('mode').value;
  $('iterationsLabel').hidden = mode !== 'optimize';
  $('modeHint').textContent = mode === 'all' ? 'Tests every order for up to 8 images (8! = 40,320 orders). Stop anytime to keep the best result so far.' : mode === 'keep' ? 'Keep the exact collection order and find the best row breaks and page split.' : 'Search multiple orders for a well-filled layout. More trials can improve the result.';
}
$('settings').oninput = () => { modeHint(); invalidate('Page settings changed. Arrange images to update the preview.'); };
function config() {
  for (const input of $('settings').querySelectorAll('input')) if (!input.checkValidity() && !input.closest('[hidden]')) throw new Error('Check the page settings: use values within the shown limits.');
  let [pw,ph] = $('paper').value === 'a4' ? [210,297] : [215.9,279.4];
  if ($('orientation').value === 'landscape') [pw,ph] = [ph,pw];
  const c = {pw,ph,margin:Number($('margin').value),gap:Number($('gap').value),minRow:Number($('minRow').value),maxRow:Number($('maxRow').value),pages:Number($('pageCount').value),weights:images.map(im=>im.weight)};
  c.W = pw-2*c.margin; c.H = ph-2*c.margin;
  if (!Number.isInteger(c.pages) || c.pages < 1) throw new Error('Enter a whole number of pages, at least 1.');
  if (!c.weights.every(validWeight)) throw new Error('Each image needs a size weight from 0.1 to 100.');
  if (c.minRow > c.maxRow) throw new Error('Minimum images per row must not exceed the maximum.');
  if (images.length < c.pages*c.minRow) throw new Error(`Not enough images for ${c.pages} pages with at least ${c.minRow} images per row. Reduce the page count or minimum images per row.`);
  if (c.W <= c.gap*(c.maxRow-1)) throw new Error('Reduce the gap or maximum images per row.');
  return c;
}
async function arrange() {
  if (busy || !images.length) return;
  let c;
  try { c = config(); if ($('mode').value === 'all' && images.length > 8) throw new Error('Exhaustive search supports up to 8 images. Choose fast search for this collection.'); }
  catch(e) { status(e.message); return; }
  const mode = $('mode').value, base = images.map((_,i)=>i), ratios = images.map(im=>im.ratio);
  const total = mode === 'keep' ? 1 : mode === 'all' ? base.reduce((v,_,i)=>v*(i+1),1) : Number($('iterations').value);
  const orders = mode === 'all' ? LayoutEngine.permutations(base.slice()) : null;
  best = null; busy = true; searching = true; cancelled = false; updateButtons(); $('progress').max = total; $('progress').value = 0;
  $('progress').hidden = false; $('searchProgress').hidden = false;
  $('cancel').disabled = false; $('cancel').textContent = 'Stop search';
  $('pages').innerHTML = '<div class="empty">Searching for a fitting layout…</div>';
  $('summary').textContent = 'The best layout found will appear here while the search runs.';
  const started = performance.now();
  let tried = 0, deadline = started+20, lastUpdate = -Infinity, shownBest = null;
  function showProgress(force = false) {
    const now = performance.now();
    if (!force && now-lastUpdate < 200) return;
    lastUpdate = now;
    const seconds = Math.floor((now-started)/1000);
    const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds/60)}m ${seconds%60}s`;
    const percent = tried === total ? '100' : (Math.floor(tried/total*1000)/10).toFixed(1);
    $('progress').value = tried;
    $('searchProgress').textContent = `${percent}% · ${tried.toLocaleString()} / ${total.toLocaleString()} orders checked · ${elapsed} elapsed`;
    if (best && best !== shownBest) {
      renderPages(); shownBest = best;
      $('summary').textContent += ' · Best so far; search in progress';
    }
  }
  status(mode === 'all' ? 'Exhaustive search running. Stop anytime to keep the best layout found.' : 'Searching. Stop anytime to keep the best layout found.');
  showProgress(true);
  try {
    for (; tried < total && !cancelled; tried++) {
      let order;
      if (orders) order = orders.next().value;
      else if (tried === 0) order = base;
      else if (tried === 1) order = base.slice().sort((a,b)=>ratios[b]-ratios[a]);
      else if (tried === 2) order = base.slice().sort((a,b)=>ratios[a]-ratios[b]);
      else if (best && tried%3 !== 0 && base.length > 1) {
        order = best.order.slice(); const i = Math.floor(Math.random()*order.length), j = Math.floor(Math.random()*order.length); [order[i],order[j]] = [order[j],order[i]];
      } else order = LayoutEngine.shuffle(base);
      const evaluator = LayoutEngine.evaluate(order,ratios,c);
      let step = evaluator.next();
      while (!step.done && !cancelled) {
        if (performance.now() > deadline) {
          showProgress();
          await new Promise(resolve => setTimeout(resolve,0)); deadline = performance.now()+20;
        }
        step = evaluator.next();
      }
      if (cancelled) break;
      if (step.value && (!best || step.value.score < best.score)) best = {...step.value,config:c};
    }
    showProgress(true);
    if (best) {
      renderPages(); status(`${cancelled ? 'Stopped early; best so far' : mode === 'all' ? 'Exhaustive search complete' : 'Layout ready'} · ${tried.toLocaleString()} orders checked.`);
    } else { $('pages').innerHTML = '<div class="empty">No fitting layout found.</div>'; $('summary').textContent = 'Try more images per row, smaller margins, or a different page count.'; status(cancelled ? 'Search stopped before a fitting layout was found.' : 'No fitting layout found. Increase max images per row, reduce margins/gap, change orientation or page count.'); }
  } catch(e) { best = null; status('Could not arrange images: '+e.message); }
  finally { busy = false; searching = false; updateButtons(); }
}
$('run').onclick = arrange; $('cancel').onclick = () => {
  if (!searching) return;
  cancelled = true; $('cancel').disabled = true; $('cancel').textContent = 'Stopping…';
  status('Stopping search and preparing the best layout found…');
};
function pageMarkup(sol, sources) {
  const c = sol.config;
  return sol.pages.map((page,index) => {
    let y = c.margin;
    const tiles = page.rows.map(row => {
      let x = c.margin+(c.W-row.width)/2;
      const html = row.ids.map(id => {
        const width = sol.scale*Math.sqrt(images[id].ratio*c.weights[id]);
        const height = sol.scale*Math.sqrt(c.weights[id]/images[id].ratio);
        const top = y+(row.h-height)/2;
        const tile = `<img class="print-image" src="${sources[id]}" alt="${escapeHTML(images[id].file.name)}" style="left:${x/c.pw*100}%;top:${top/c.ph*100}%;width:${width/c.pw*100}%;height:${height/c.ph*100}%">`;
        x += width+c.gap; return tile;
      }).join(''); y += row.h+c.gap; return html;
    }).join('');
    return `<div class="sheet-wrap"><p class="sheet-label">Page ${index+1} · ${Math.round(page.height/c.H*100)}% height filled</p><div class="sheet" style="aspect-ratio:${c.pw}/${c.ph}">${tiles}</div></div>`;
  }).join('');
}
function renderPages() {
  const c = best.config;
  $('pages').innerHTML = pageMarkup(best,images.map(im=>im.display));
  $('summary').textContent = `${images.length} images · ${c.pages} ${c.pages===1?'page':'pages'} · ${c.pw} × ${c.ph} mm · ${c.margin} mm margins`;
  document.documentElement.style.setProperty('--paper-w',c.pw+'mm'); document.documentElement.style.setProperty('--paper-h',c.ph+'mm');
  let style = $('printSize'); if (!style) { style = document.createElement('style'); style.id = 'printSize'; document.head.append(style); }
  style.textContent = `@page { size: ${c.pw}mm ${c.ph}mm; margin: 0; }`;
}
$('useOrder').onclick = () => {
  const sol = best, reordered = sol.order.map(i=>images[i]);
  const remap = new Map(sol.order.map((old,i)=>[old,i]));
  sol.pages.forEach(p=>p.rows.forEach(r=>{r.ids = r.ids.map(id=>remap.get(id));}));
  sol.config.weights = sol.order.map(i=>sol.config.weights[i]);
  sol.order = reordered.map((_,i)=>i); images = reordered; $('sort').value = 'manual'; renderGallery(); status('Collection now follows the arranged page order.');
};
async function readyForPrint() { await Promise.all(Array.from($('pages').querySelectorAll('img')).map(im=>im.decode())); }
$('print').onclick = async () => { if (!best || busy) return; try { await readyForPrint(); window.print(); } catch { status('An image could not be prepared for printing. Arrange again.'); } };
async function asDataURL(url) { const blob = await (await fetch(url)).blob(); return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
$('export').onclick = async () => {
  if (!best || busy) return;
  busy = true; updateButtons(); status('Embedding full-resolution images into your print file…');
  try {
    const sources = await Promise.all(images.map(im=>asDataURL(im.display))), c = best.config;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image layout — print</title><style>@page{size:${c.pw}mm ${c.ph}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9ede7;font-family:system-ui}.toolbar{padding:20px;text-align:center}button{padding:12px 20px;cursor:pointer}.sheet-wrap{margin:24px auto;width:${c.pw}mm;max-width:95vw}.sheet-label{font-size:12px;color:#526455}.sheet{position:relative;background:white;overflow:hidden;width:100%}.print-image{position:absolute;display:block}@media print{body{background:white}.toolbar,.sheet-label{display:none}.sheet-wrap{margin:0;width:${c.pw}mm;max-width:none;break-after:page;page-break-after:always}.sheet-wrap:last-child{break-after:auto;page-break-after:auto}.sheet{width:${c.pw}mm;height:${c.ph}mm}}</style></head><body><div class="toolbar"><button id="print" disabled>Preparing images…</button><p>Use matching paper size, 100% scale, no margins, and turn off headers and footers. Choose Save as PDF to save a PDF.</p></div>${pageMarkup(best,sources)}<script>const b=document.getElementById('print');Promise.all(Array.from(document.images).map(i=>i.decode())).then(()=>{b.disabled=false;b.textContent='Print / Save PDF';b.onclick=()=>window.print();}).catch(()=>{b.textContent='An image could not load. Reopen this file.';});</script></body></html>`;
    const url = URL.createObjectURL(new Blob([html],{type:'text/html'})); const a = document.createElement('a'); a.href = url; a.download = 'image-layout-print.html'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('Print file exported. Open it on any computer, then Print / Save PDF. Use matching paper size, 100% scale, no margins, and disable headers/footers.');
  } catch(e) { status('Export failed: '+(e.message || 'Could not read an image.')); }
  finally { busy = false; updateButtons(); }
};
document.querySelectorAll('#settings input, .crop-fields input').forEach(input => { input.required = true; });
modeHint();
