const assert = require('node:assert/strict');
const {evaluate, permutations} = require('./layout.js');
function finish(g) { let r; do {r = g.next();} while(!r.done); return r.value; }
const c = {W:195.9,H:259.4,gap:2,minRow:1,maxRow:5,pages:2};
function verify(sol,ratios,cfg) {
  assert(sol);
  assert.deepEqual(sol.pages.flatMap(p=>p.rows.flatMap(r=>r.ids)),sol.order);
  for(const page of sol.pages) {
    assert(page.height<=cfg.H+1e-7);
    for(const row of page.rows) {
      assert(row.ids.length>=cfg.minRow && row.ids.length<=cfg.maxRow);
      const widths=row.ids.map(id=>sol.scale*Math.sqrt(ratios[id]*(cfg.weights?.[id]||1)));
      const heights=row.ids.map(id=>sol.scale*Math.sqrt((cfg.weights?.[id]||1)/ratios[id]));
      assert(widths.reduce((a,b)=>a+b,0)+cfg.gap*(row.ids.length-1)<=cfg.W+1e-7);
      row.ids.forEach((id,j)=>{
        assert(Math.abs(widths[j]/heights[j]-ratios[id])<1e-7);
        assert(Math.abs(widths[j]*heights[j]/(cfg.weights?.[id]||1)-sol.scale**2)<1e-7);
      });
    }
  }
}
for(let n=2;n<=20;n++) {
 const ratios=Array.from({length:n},(_,i)=>0.3+(i%7)*0.6),ids=ratios.map((_,i)=>i);
 verify(finish(evaluate(ids,ratios,c)),ratios,c);
}
verify(finish(evaluate([0],[0.01],{...c,pages:1})),[0.01],{...c,pages:1});
assert.equal(finish(evaluate([0],[1],c)),null);
assert.equal(finish(evaluate([0,1,2],[1,1,1],{...c,minRow:2,maxRow:2})),null);
const orders=[...permutations([0,1,2,3,4])];assert.equal(orders.length,120);assert.equal(new Set(orders.map(a=>a.join(','))).size,120);
// Independent enumeration computes exact scale for every partition and split.
function brute(order,ratios,cfg) {
 let best=0;
 for(let mask=0;mask<2**(order.length-1);mask++) {
  const rows=[[]];order.forEach((id,i)=>{rows.at(-1).push(id);if(i<order.length-1 && mask&(1<<i))rows.push([]);});
  if(rows.some(r=>r.length<cfg.minRow||r.length>cfg.maxRow))continue;
  for(let split=1;split<rows.length;split++) {
   const groups=[rows.slice(0,split),rows.slice(split)];let scale=Infinity;
   for(const group of groups) {
    let normalizedHeight=0;
    for(const row of group) {
     const width=row.reduce((s,id)=>s+Math.sqrt(ratios[id]*(cfg.weights?.[id]||1)),0);
     normalizedHeight+=Math.max(...row.map(id=>Math.sqrt((cfg.weights?.[id]||1)/ratios[id])));
     scale=Math.min(scale,(cfg.W-cfg.gap*(row.length-1))/width);
    }
    scale=Math.min(scale,(cfg.H-cfg.gap*(group.length-1))/normalizedHeight);
   }
   best=Math.max(best,scale);
  }
 }return best;
}
const ratios=[0.25,1.3,3,0.9,1.6];
for(const pages of [3,4,6,12]) {
 const r=Array.from({length:12},(_,i)=>0.5+(i%4)*0.6);
 const cfg={...c,pages,weights:r.map((_,i)=>i===3?4.25:1)};
 const sol=finish(evaluate(r.map((_,i)=>i),r,cfg));verify(sol,r,cfg);
 assert.equal(sol.pages.length,pages);assert(sol.pages.every(p=>p.rows.length>0));
}
for(const weights of [[1,1,1,1,1],[1,2,1,3,1.5]]) {
 const cfg={...c,weights};
 for(const order of orders) {const sol=finish(evaluate(order,ratios,cfg));verify(sol,ratios,cfg);assert(Math.abs(sol.scale-brute(order,ratios,cfg))<1e-6);}
}
console.log('PASS: equal area across rows/pages, exact enlargement ratios, aspect ratios, 2–20 image coverage, bounds, tall images, impossible constraints, and 240 order/weight combinations against independent exhaustive enumeration.');
