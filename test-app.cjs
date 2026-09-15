// Code-level integration checks with a minimal DOM; this does not replace visual browser QA.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
class Element {
  constructor() {this.value='';this.style={setProperty(){}};this.dataset={};this.children=[];this.textContent='';this.innerHTML='';this.files=[];this.classList={add(){},remove(){}};}
  querySelectorAll(){return [];}
  querySelector(s){this.selectors??={};return this.selectors[s]??=new Element();}
  append(...e){this.children.push(...e);}
  replaceChildren(...e){this.children=e;this.innerHTML='';}
  checkValidity(){return this.value!=='';}
  closest(){return null;}
  click(){}
  remove(){}
  showModal(){}
  close(){}
}
const elements = new Map();
for(const match of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g)) elements.set(match[1],new Element());
for(const [id,value] of Object.entries({paper:'letter',orientation:'portrait',margin:'10',gap:'2',minRow:'1',maxRow:'5',pageCount:'2',mode:'keep',iterations:'10',sort:'manual'}))elements.get(id).value=value;
const objects=new Map();let next=0;
class FakeImage {set src(url){const f=objects.get(url);queueMicrotask(()=>{if(f?.bad)this.onerror();else{this.naturalWidth=f?.width||100;this.naturalHeight=f?.height||100;this.onload();}});}}
class Reader{readAsDataURL(blob){blob.arrayBuffer().then(a=>{this.result='data:'+blob.type+';base64,'+Buffer.from(a).toString('base64');this.onload();});}}
let lastDraw;
class Canvas extends Element {
 getContext(){return {drawImage:(...args)=>{lastDraw=args.slice(1);}};}
 toBlob(callback){callback(new Blob([`clipped-${this.width}x${this.height}`],{type:'image/png'}));}
}
const context=vm.createContext({console,Blob,performance,Image:FakeImage,FileReader:Reader,URL:{createObjectURL(blob){const u='blob:test-'+next++;objects.set(u,blob);return u;},revokeObjectURL(u){objects.delete(u);}},fetch:async u=>({blob:async()=>objects.get(u)}),setTimeout:(f,n)=>setTimeout(f,n===60000?0:n),document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[],createElement:()=>new Element(),head:new Element(),body:new Element(),documentElement:new Element()},window:{addEventListener(){},print(){}},LayoutEngine:require('./layout.js')});
vm.runInContext(fs.readFileSync('app.js','utf8'),context);
context.document.createElement=tag=>tag==='canvas'?new Canvas():new Element();
const run = code=>vm.runInContext(code,context);
const file=(name,width,height,bad=false)=>Object.assign(new Blob(['test-image'],{type:'image/png'}),{name,width,height,bad,lastModified:0});
(async()=>{
 context.batch=[file('folder-one.png',1200,800),file('broken.png',0,0,true)];await run('readFiles(batch)');assert.equal(run('images.length'),1);assert.match(elements.get('status').textContent,/Could not open 1/);
 context.batch=[file('folder-two.png',800,900),file('quoted-<name>.png',1100,800)];await run('readFiles(batch)');assert.equal(run('images.length'),3);
 const weightControl=elements.get('gallery').children[0].children[0].children[0];weightControl.value='4.25';weightControl.onchange();assert.equal(run('images[0].weight'),4.25);
 weightControl.value='0';weightControl.onchange();assert.equal(run('images[0].weight'),4.25);assert.match(elements.get('status').textContent,/0.1 to 100/);
 weightControl.value='1';weightControl.onchange();
 await run('arrange()');assert(run('best'));const markup=elements.get('pages').innerHTML;
 assert.equal((markup.match(/class="print-image"/g)||[]).length,3);assert.equal((markup.match(/class="sheet"/g)||[]).length,2);assert(markup.includes('quoted-&lt;name&gt;.png'));
 assert.deepEqual(Array.from(run('best.order')),[0,1,2]);
 elements.get('mode').value='all';await run('arrange()');assert.match(elements.get('status').textContent,/Exhaustive search complete · 6 orders checked/);
 assert.match(elements.get('searchProgress').textContent,/100% · 6 \/ 6 orders checked/);assert.equal(elements.get('progress').value,6);assert.equal(elements.get('progress').hidden,false);
 await elements.get('useOrder').onclick();assert.deepEqual(Array.from(run('best.pages.flatMap(p=>p.rows.flatMap(r=>r.ids))')),[0,1,2]);
 await elements.get('export').onclick();const exported=[...objects.values()].find(b=>b.type==='text/html');assert(exported);const html=await exported.text();assert(!html.includes('blob:test-'));assert.equal((html.match(/src="data:image\/png;base64,/g)||[]).length,3);assert(html.includes('break-after:page'));assert(html.includes('size:215.9mm 279.4mm'));
 assert.equal(run('validCrop({l:60,r:50,t:0,b:0})'),false);assert.equal(run('validCrop({l:10,r:10,t:0,b:20})'),true);
 // Apply a real crop operation through the editor handler; check canvas input,
 // saved source, geometry and the bytes selected for export.
 const original=run('images[0]');const originalURL=original.url;
 run('openEditor(images[0]);setCrop({l:25,r:25,t:10,b:10})');elements.get('imageSize').value='2';
 await elements.get('saveCrop').onclick();
 const cropped=run('images[0]');assert.equal(cropped.weight,2);assert.notEqual(cropped.display,originalURL);assert.equal(cropped.url,originalURL);
 assert.equal(cropped.clippedWidth,Math.round(cropped.width*0.5));assert.equal(cropped.clippedHeight,Math.round(cropped.height*0.8));
 assert.deepEqual(lastDraw,[cropped.width*.25,cropped.height*.1,cropped.width*.5,cropped.height*.8,0,0,cropped.clippedWidth,cropped.clippedHeight]);
 assert.equal(cropped.ratio,cropped.clippedWidth/cropped.clippedHeight);assert.equal(elements.get('clippedPreview').src,cropped.display);
 await run('arrange()');assert.equal(run('best.config.weights[0]'),2);assert(elements.get('pages').innerHTML.includes(`src="${cropped.display}"`));
 const embeddedCrop=await run('asDataURL(images[0].display)');assert.equal(Buffer.from(embeddedCrop.split(',')[1],'base64').toString(),`clipped-${cropped.clippedWidth}x${cropped.clippedHeight}`);
 await elements.get('export').onclick();
 const cropExports=await Promise.all([...objects.values()].filter(b=>b.type==='text/html').map(b=>b.text()));assert(cropExports.some(h=>h.includes(embeddedCrop)));
 await elements.get('useOrder').onclick();assert.deepEqual(Array.from(run('best.config.weights')),Array.from(run('images.map(im=>im.weight)')));
 run('openEditor(images.find(im=>im.weight===2));setCrop({l:0,r:0,t:0,b:0})');elements.get('imageSize').value='1';await elements.get('saveCrop').onclick();
 assert.equal(run('editing.display'),originalURL);assert.equal(run('editing.ratio'),run('editing.width/editing.height'));
 run('move(0,2)');assert.equal(run('best'),null);assert.equal(elements.get('print').disabled,true);
 // Cancellation must leave a result explicitly incomplete.
 elements.get('mode').value='optimize';elements.get('iterations').value='20000';
 const search=run('arrange()');setTimeout(()=>elements.get('cancel').onclick(),0);await search;assert.match(elements.get('status').textContent,/Stopped early/);assert.equal(run('busy'),false);
 run("images.push(...Array.from({length:5},()=>images[0]))");elements.get('mode').value='all';
 const exhaustive=run('arrange()');
 assert.equal(elements.get('cancel').hidden,false);assert.equal(elements.get('progress').hidden,false);assert.equal(elements.get('progress').max,40320);
 setTimeout(()=>elements.get('cancel').onclick(),0);await exhaustive;
 assert.match(elements.get('status').textContent,/Stopped early/);assert.match(elements.get('searchProgress').textContent,/40,320 orders checked.*elapsed/);
 assert(elements.get('progress').value<40320);assert.equal(elements.get('progress').hidden,false);assert.equal(elements.get('cancel').hidden,true);assert.equal(elements.get('print').disabled,false);
 assert.equal((elements.get('pages').innerHTML.match(/class="print-image"/g)||[]).length,8);
 elements.get('pageCount').value='3';elements.get('mode').value='keep';await run('arrange()');
 assert.equal(run('best.pages.length'),3);assert.equal((elements.get('pages').innerHTML.match(/class="sheet"/g)||[]).length,3);
 await elements.get('export').onclick();const multiplePageExports=await Promise.all([...objects.values()].filter(b=>b.type==='text/html').map(b=>b.text()));
 assert(multiplePageExports.some(h=>(h.match(/class="sheet"/g)||[]).length===3));
 elements.get('pageCount').value='2.5';await run('arrange()');assert.match(elements.get('status').textContent,/whole number/);
 elements.get('pageCount').value='9';await run('arrange()');assert.match(elements.get('status').textContent,/Not enough images/);
 elements.get('pageCount').value='2';elements.get('mode').value='all';
 run('images.push(images[0])');await run('arrange()');assert.match(elements.get('status').textContent,/up to 8 images/);
 const single=fs.readFileSync('Image Layout Studio.html','utf8');assert(!/<script src=|<link rel="stylesheet"/.test(single));const scripts=[...single.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);scripts.forEach(s=>new vm.Script(s[1]));
 console.log('PASS: additive imports, corrupt-file recovery, complete preview image coverage, escaped filenames, keep/exhaustive modes, use-order remapping, self-contained print export, crop validation, stale-preview invalidation, cancellation, exhaustive limit, standalone script parsing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
