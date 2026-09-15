/* Equal printed area by default. Per-image weights explicitly enlarge area.
   Binary search finds the largest shared scale; dynamic programming checks
   every row break/page split for a fixed order and scale. Units: millimeters. */
(function (root) {
  function* evaluate(order, ratios, c) {
    const n = order.length;
    if (!n || n < c.pages*c.minRow) return null;
    const weights = c.weights || ratios.map(()=>1);
    const widths = ratios.map((r,i)=>Math.sqrt(r*weights[i]));
    const heights = ratios.map((r,i)=>Math.sqrt(weights[i]/r));
    if (order.some(i=>!Number.isFinite(widths[i]) || !Number.isFinite(heights[i]) || widths[i]<=0 || heights[i]<=0)) return null;
    // For each prefix and page count, the smallest current-page height dominates:
    // earlier pages already fit and do not constrain the remaining images.
    function* fit(scale) {
      const dp = Array.from({length:c.pages+1},()=>Array(n+1).fill(null));
      dp[1][0] = {height:0,prev:null};
      for (let pos=0; pos<n; pos++) {
        yield null;
        for(let p=1;p<=c.pages;p++) {
          const state = dp[p][pos]; if(!state) continue;
          let width=0, height=0;
          for(let k=1;k<=c.maxRow && pos+k<=n;k++) {
            const id=order[pos+k-1]; width+=widths[id]*scale; height=Math.max(height,heights[id]*scale);
            if(width+c.gap*(k-1)>c.W+1e-9) break;
            if(k<c.minRow) continue;
            const row={ids:order.slice(pos,pos+k),h:height,width:width+c.gap*(k-1)};
            function put(page,y) {
              const end=pos+k;
              if(y>c.H+1e-9) return;
              if(!dp[page][end] || y<dp[page][end].height) dp[page][end]={height:y,prev:state,row,page};
            }
            put(p,state.height+(state.row?c.gap:0)+height);
            if(p<c.pages && state.row) put(p+1,height);
          }
        }
      }
      const end=dp[c.pages][n]; if(!end) return null;
      const pages=Array.from({length:c.pages},()=>({rows:[],height:0}));
      for(let s=end;s && s.row;s=s.prev) pages[s.page-1].rows.unshift(s.row);
      if(pages.some(p=>!p.rows.length))return null;
      for(const page of pages) page.height=page.rows.reduce((sum,r)=>sum+r.h,0)+c.gap*(page.rows.length-1);
      return {score:-scale,scale,pages,order:order.slice()};
    }
    if(!(yield* fit(0)))return null;
    let low=0, high=Math.sqrt(c.W*c.H*c.pages/order.reduce((s,i)=>s+weights[i],0)), best=null;
    for(const id of order) high=Math.min(high,c.W/widths[id],c.H/heights[id]);
    for(let step=0;step<36;step++) {
      const scale=(low+high)/2, candidate=yield* fit(scale);
      if(candidate){low=scale;best=candidate;}else high=scale;
    }
    return best && best.scale>1e-8 ? best : null;
  }
  function* permutations(a, start = 0) {
    if (start === a.length) { yield a.slice(); return; }
    for (let i = start; i < a.length; i++) {
      [a[start], a[i]] = [a[i], a[start]];
      yield* permutations(a, start + 1);
      [a[start], a[i]] = [a[i], a[start]];
    }
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const api = { evaluate, permutations, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LayoutEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
