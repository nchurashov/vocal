"""Имитатор живого голоса для «Шарика» (общий для sim_ball и sim_songball): ballStep с голосом, как с микрофона."""
# голос: [опоздание с, скольжение с, вибрато полутонов, сдвиг всей мелодии, заменить ноту from, на to, в паузах микрофон слышит подсказку пианино]
SIM = """(([lat, glide, vib, shift, subFrom, subTo, leak]) => {
  ballReset(true); const lv=B.lv, b=60/lv.bpm, ons=[]; let t=0;
  lv.walls.forEach(([s,len,gap])=>{ons.push({s:(s===subFrom?subTo:s),t0:t,t1:t+len*b}); t+=(len+gap)*b;});
  let now=-1.5; const dt=1/60, h=[];
  while(now < B.D+.6){ let v=null;
    for(let i=0;i<ons.length;i++){const o=ons[i],n=ons[i+1],end=n&&n.t0-o.t1<.01?n.t0:o.t1;
      if(now>=o.t0-.3+lat&&now<end+lat){const from=(i>0&&ons[i-1].t1>=o.t0-.01)?ons[i-1].s:o.s,k=Math.min(1,Math.max(0,(now-(o.t0+lat))/glide));
        v=from+(o.s-from)*k+vib*Math.sin(now*2*Math.PI*5.5)+shift;break;}}
    if(v==null&&leak){const nx=ons.find(o=>o.t0>now);if(nx&&nx.t0-now<1.6&&nx.t0-now>.9)v=nx.s;}
    h.push(v); ballStep(now, dt, h.length>6?h[h.length-6]:null); now+=dt; }
  return B.walls.map(w=>w.passed?'P':w.crashed?'X':'.').join(''); })"""
