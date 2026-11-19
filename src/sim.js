'use strict';
const G0=9.81, RE=6371000, TARGET_ALT=100000, DT=0.05;
const WORLDS={earth:{n:'Earth',g:9.81,R:6371000,rho:1.225,H:8500},moon:{n:'Moon',g:1.62,R:1737400,rho:0,H:1000},mars:{n:'Mars',g:3.71,R:3389500,rho:.02,H:11100}};
const DEFAULT_BUDGET=10000000;
const LIM={twr:1.2,budget:DEFAULT_BUDGET,mass:5000};
const MATS={
 'al-standard':{n:'Aluminium',m:1,c:1,t:1,s:1,h:1,note:'Baseline. No surprises.'},
 'al-lithium':{n:'Aluminium-lithium',m:.88,c:1.25,t:1.10,s:1.1,h:1,note:'Lighter, costs more.'},
 'steel':{n:'Stainless steel',m:1.35,c:.70,t:.85,s:1.3,h:1.8,note:'Cheap and tough, but heavy.'},
 'titanium':{n:'Titanium',m:1.05,c:2.10,t:1.50,s:1.6,h:1.7,note:'Strongest, slow and expensive.'},
 'cfrp':{n:'Carbon composite',m:.70,c:1.80,t:1.70,s:1.4,h:.8,note:'Lightest, slowest to build.'},
 'printed':{n:'3D-printed alloy',m:.95,c:1.10,t:.55,s:1.1,h:1.1,note:'Fastest build. Core stage stays aluminium.'},
 'reclaimed':{n:'Reclaimed parts',m:1,c:.45,t:.60,s:.9,h:.9,note:'Cheap and quick, weaker structure.'}
};
const PARTS=[
 {id:'capsule',name:'Avionics Capsule',cat:'core',dry:400,prop:0,cost:120000,thrust:0,power:-0.5,hours:120,struct:true,fixed:true,max:1,isp:0},
 {id:'core-stage',name:'Core Stage',cat:'core',dry:450,prop:1350,cost:250000,thrust:30000,power:0,hours:400,struct:true,fixed:true,max:1,isp:360},
 {id:'booster-side',name:'Side Booster (SRB)',cat:'propulsion',dry:120,prop:380,cost:90000,thrust:15000,power:0,hours:100,struct:true,max:2,isp:270,booster:true},
 {id:'booster-heavy',name:'Heavy Booster',cat:'propulsion',dry:200,prop:600,cost:150000,thrust:28000,power:0,hours:180,struct:true,max:2,isp:290,booster:true},
 {id:'solar-wing',name:'Solar Wing',cat:'power',dry:120,prop:0,cost:60000,thrust:0,power:3,hours:40,max:2},
 {id:'rtg',name:'RTG',cat:'power',dry:200,prop:0,cost:140000,thrust:0,power:1,hours:90,max:1},
 {id:'camera',name:'Camera',cat:'payload',dry:80,prop:0,cost:70000,thrust:0,power:-1,hours:30,max:1,payload:true},
 {id:'spectrometer',name:'Spectrometer',cat:'payload',dry:150,prop:0,cost:110000,thrust:0,power:-1.5,hours:60,max:1,payload:true},
 {id:'radar',name:'Radar',cat:'payload',dry:300,prop:0,cost:180000,thrust:0,power:-2.5,hours:90,max:1,payload:true}
];

const DEF_COMP={al:60,steel:0,ti:20,cf:20,cer:0};
const CONST={al:{n:'Aluminium',m:1,c:1,t:1,s:1,h:1,col:'#9fb3c8'},steel:{n:'Stainless steel',m:1.35,c:.70,t:.85,s:1.3,h:1.8,col:'#d5dce5'},ti:{n:'Titanium',m:1.05,c:2.10,t:1.50,s:1.6,h:1.7,col:'#7a8496'},cf:{n:'Carbon fibre',m:.70,c:1.80,t:1.70,s:1.4,h:.8,col:'#4a5262'},cer:{n:'Ceramic',m:1.10,c:2.40,t:1.80,s:.8,h:3.0,col:'#e0a06a'}};
function blend(comp){let tot=0;for(const k in CONST)tot+=Math.max(0,comp[k]||0);if(!tot){comp={al:100};tot=100;}
 const r={m:0,c:0,t:0,s:0,h:0};let n=0;for(const k in CONST){const w=Math.max(0,comp[k]||0)/tot;for(const p in r)r[p]+=w*CONST[k][p];if(w>=.05)n++;}
 r.c*=1+.06*Math.max(0,n-1);r.t*=1+.12*Math.max(0,n-1);
 const parts=Object.keys(CONST).filter(k=>(comp[k]||0)>0).map(k=>[CONST[k].n,Math.round(1000*Math.max(0,comp[k])/tot)/10]);
 return Object.assign(r,{n:'Custom blend',note:'Your own mix. Joining different metals adds cost and build time.',comp:parts,custom:true});}
function setCustom(comp){MATS.custom=blend(comp||DEF_COMP);}
const COMPS={'al-standard':[['Aluminium',97.9],['Magnesium',1.0],['Silicon',.6],['Copper, chromium',.5]],
 'al-lithium':[['Aluminium',94.1],['Copper',4.0],['Lithium',1.0],['Magnesium, silver, zirconium',.9]],
 'steel':[['Iron',71],['Chromium',18],['Nickel',9],['Manganese, silicon',2]],
 'titanium':[['Titanium',90],['Aluminium',6],['Vanadium',4]],
 'cfrp':[['Carbon fibre',60],['Epoxy resin',38],['Fillers',2]],
 'printed':[['Aluminium',89.6],['Silicon',10],['Magnesium',.4]],
 'reclaimed':[['Aluminium',92],['Silicon',3],['Magnesium',2],['Iron',2],['Other',1]]};
for(const k in COMPS)MATS[k].comp=COMPS[k];
setCustom(DEF_COMP);
const USES=[
 {use:'Primary structure and tanks',pick:['al-lithium','al-standard','steel'],why:'Large surfaces need low mass per dollar. Aluminium-lithium saves mass, steel saves money, plain aluminium is the safe baseline.'},
 {use:'Side boosters',pick:['steel','al-standard','reclaimed'],why:'Boosters are dropped after burnout, so cheap and tough beats light.'},
 {use:'Crew and avionics capsule',pick:['titanium','al-lithium'],why:'Small and critical. Strength and heat tolerance matter more than price.'},
 {use:'Engine section and nozzles',pick:['titanium','steel'],why:'Hot parts need high heat tolerance. Ceramic-rich custom blends also work.'},
 {use:'Solar wing frames and payload bay',pick:['cfrp','al-lithium'],why:'Stiff and very light, and they see little heat.'},
 {use:'Prototypes and test articles',pick:['printed','reclaimed'],why:'Fastest and cheapest to build, but not for maximum load.'}
];
const WORLD_TIP={earth:'Thick air heats the vehicle at max-Q, so heat tolerance matters. Avoid composites on hot sections.',moon:'No air means no aerodynamic heating. Favour the lightest materials and spend the savings on payload.',mars:'Thin air gives mild heating and low drag. Light, cheap structure works well.'};
function suitability(key,b){
 const bb=clone(b);bb.mat=key;const f=runHeadless(bb);const d=f.d,m=MATS[key];const budget=d.gates.budget.limit;const R=[];
 const heatReq=.6+f.maxQ/40000;
 R.push(d.gates.struct.pass?{k:'ok',t:'Strength: holds '+d.limit.toFixed(1)+' g, the design needs '+d.loadG.toFixed(1)+' g.'}:{k:'bad',t:'Strength: only holds '+d.limit.toFixed(1)+' g but the design loads '+d.loadG.toFixed(1)+' g.'});
 R.push(m.h>=heatReq?{k:'ok',t:'Heat: tolerance x'+m.h.toFixed(2)+' covers the x'+heatReq.toFixed(2)+' needed here.'}:(m.h>=heatReq*.85?{k:'warn',t:'Heat: tolerance x'+m.h.toFixed(2)+' is close to the x'+heatReq.toFixed(2)+' needed. Watch hot sections.'}:{k:'bad',t:'Heat: tolerance x'+m.h.toFixed(2)+' is below the x'+heatReq.toFixed(2)+' needed.'}));
 const share=d.cost/budget;
 R.push(share<=.6?{k:'ok',t:'Cost: uses '+Math.round(share*100)+'% of the budget.'}:share<=1?{k:'warn',t:'Cost: uses '+Math.round(share*100)+'% of the budget, little headroom.'}:{k:'bad',t:'Cost: '+Math.round(share*100)+'% of the budget. Over budget.'});
 R.push(d.gates.twr.pass&&d.gates.mass.pass?{k:'ok',t:'Mass: '+Math.round(d.mass)+' kg, thrust-to-weight '+d.twr.toFixed(2)+'.'}:{k:'bad',t:'Mass: '+Math.round(d.mass)+' kg gives thrust-to-weight '+d.twr.toFixed(2)+'. Fails the pad rules.'});
 R.push(f.outcome==='SUBORBITAL'?{k:'bad',t:'Ascent: runs out of delta-v at '+(f.maxY/1000).toFixed(0)+' km.'}:{k:'ok',t:'Ascent: reaches '+(f.maxY/1000).toFixed(0)+' km.'});
 R.push(d.days<=30?{k:'ok',t:'Build time: '+d.days.toFixed(0)+' days.'}:d.days<=45?{k:'warn',t:'Build time: '+d.days.toFixed(0)+' days, slow.'}:{k:'bad',t:'Build time: '+d.days.toFixed(0)+' days, too slow.'});
 const bad=R.filter(x=>x.k==='bad').length,warn=R.filter(x=>x.k==='warn').length;
 return {verdict:bad?'no':warn?'maybe':'yes',score:100-bad*30-warn*10,reasons:R,d,f};
}
const PBY={}; PARTS.forEach(p=>PBY[p.id]=p);
function matFor(b,p){ if(!p.struct) return MATS['al-standard']; if(p.id==='core-stage'&&b.mat==='printed') return MATS['al-standard']; return MATS[b.mat]; }
function count(b,id){ const p=PBY[id]; return p.fixed?1:(b.counts[id]||0); }
function evalBuild(b){
 let mass=0,cost=0,thrust=0,power=0,hours=0,payload=0,types=0;
 for(const p of PARTS){
  const n=count(b,p.id); if(!n) continue; types++;
  const mm=matFor(b,p);
  mass+=n*(p.dry*mm.m+p.prop); cost+=n*p.cost*mm.c; thrust+=n*p.thrust; power+=n*p.power;
  let h=0; for(let i=0;i<n;i++) h+=p.hours*mm.t*Math.max(.6,1-.08*i); hours+=h;
  if(p.payload) payload+=n*p.dry;
 }
 cost+=(b.crew-4)*30000;
 const W=WORLDS[b.world||'earth'];const twr=thrust/(mass*W.g);const loadG=thrust/(mass*G0);
 const days=hours*(1+.04*(types-1))/(b.crew*8);
 const limit=3*MATS[b.mat].s;
 const E=1e-9; const budget=b.budget||DEFAULT_BUDGET;
 const gates={
  twr:{id:'TWR',pass:twr>=LIM.twr-E,value:twr,limit:LIM.twr},
  budget:{id:'BUDGET',pass:cost<=budget+E,value:cost,limit:budget},
  mass:{id:'MASS',pass:mass<=LIM.mass+E,value:mass,limit:LIM.mass},
  power:{id:'POWER',pass:power>E,value:power,limit:0},
  struct:{id:'STRUCT',pass:loadG<=limit+E,value:loadG,limit}
 };
 const allPass=Object.values(gates).every(g=>g.pass);
 return {mass,cost,thrust,power,twr,loadG,world:b.world||'earth',hours,days,payload,limit,gates,allPass};
}
function newFlight(b){
 const d=evalBuild(b); const mmc=matFor(b,PBY['core-stage']);
 let staticDry=0; const boosters=[];
 for(const p of PARTS){ const n=count(b,p.id); const mm=matFor(b,p);
  for(let i=0;i<n;i++){
   if(p.booster) boosters.push({id:p.id,dry:p.dry*mm.m,prop:p.prop,thrust:p.thrust,isp:p.isp,attached:true});
   else if(p.id!=='core-stage') staticDry+=p.dry*mm.m;
  }}
 return {W:WORLDS[b.world||'earth'],d,t:0,y:0,v:0,maxY:0,maxQ:0,q:0,a:0,staticDry,
  core:{dry:450*mmc.m,prop:1350,thrust:30000,isp:360},boosters,
  phase:d.gates.twr.pass?'burn':'shake',events:[],outcome:null,mq:false,liftoff:false,meco:false,thrusting:false,jett:[]};
}
function fmass(f){ let m=f.staticDry+f.core.dry+f.core.prop; for(const b of f.boosters) if(b.attached) m+=b.dry+b.prop; return m; }
function ev(f,s){ f.events.push({t:f.t,s}); f.newEvents=(f.newEvents||[]); f.newEvents.push(s); }
function stepFlight(f){
 const dt=DT;
 if(f.phase==='done'||f.phase==='crash'||f.phase==='breakup') return;
 if(f.phase==='shake'){ f.t+=dt; if(f.t>2.8){ f.phase='crash'; f.outcome='PAD_CRASH'; ev(f,'Thrust below weight margin. Vehicle lost on the pad.'); } return; }
 let F=0;
 if(f.core.prop>0){ const dm=Math.min(f.core.prop,f.core.thrust/(f.core.isp*G0)*dt); F+=f.core.thrust*dm/(f.core.thrust/(f.core.isp*G0)*dt); f.core.prop-=dm; }
 for(const b of f.boosters){ if(b.attached&&b.prop>0){ const full=b.thrust/(b.isp*G0)*dt; const dm=Math.min(b.prop,full); F+=b.thrust*dm/full; b.prop-=dm; if(b.prop<=0){ b.attached=false; f.jett.push(b); ev(f,'Booster separation at '+(f.y/1000).toFixed(1)+' km'); } } }
 f.thrusting=F>0;
 const m=fmass(f);
 const W=f.W;const rho=W.rho*Math.exp(-f.y/W.H);
 const drag=0.5*rho*f.v*Math.abs(f.v)*1.0;
 const g=W.g*Math.pow(W.R/(W.R+f.y),2);
 const a=(F-drag)/m-g;
 f.a=a; f.v+=a*dt; f.y+=f.v*dt; if(f.y<0){f.y=0; if(f.v<0) f.v=0;}
 f.t+=dt; if(f.y>f.maxY) f.maxY=f.y;
 const q=0.5*rho*f.v*f.v; f.q=q;
 if(!f.liftoff&&f.y>5){f.liftoff=true; ev(f,'Liftoff');}
 if(!f.strc&&f.y>150){f.strc=true; if(!f.d.gates.struct.pass){ f.phase='breakup'; f.outcome='BREAKUP'; ev(f,'Structure failed under '+f.d.loadG.toFixed(2)+' g load'); return; } }
 if(q>f.maxQ) f.maxQ=q; else if(!f.mq&&f.maxQ>1000&&q<f.maxQ*.97){ f.mq=true; ev(f,'Max-Q passed ('+(f.maxQ/1000).toFixed(1)+' kPa)'); }
 if(!f.meco&&f.core.prop<=0){ f.meco=true; ev(f,'Core engine cutoff at '+(f.y/1000).toFixed(1)+' km'); f.mecoT=f.t; }
 if(f.meco&&!f.sep&&f.t>=f.mecoT+.5){ f.sep=true; f.coreDrop=true; f.core.dry*=.45; ev(f,'Stage separation: engine section jettisoned at '+(f.y/1000).toFixed(1)+' km'); }
 if(!f.fair&&f.y>=70000){ f.fair=true; f.fairDrop=true; ev(f,'Fairing jettison at 70 km'); }
 if(f.meco&&f.sep&&F===0&&(f.v<=0||f.y>=TARGET_ALT)){
  if(f.v>0) f.maxY=Math.max(f.maxY,f.y+f.v*f.v/(2*g));
  f.phase='done';
  if(f.maxY>=TARGET_ALT) f.outcome=f.d.power>1e-9?'ORBIT':'POWER'; else f.outcome='SUBORBITAL';
  ev(f,(f.v>0?'Reached ':'Apogee ')+(f.maxY/1000).toFixed(1)+' km');
 }
 if(f.t>3000){ f.phase='done'; f.outcome='SUBORBITAL'; }
}
function runHeadless(b){ const f=newFlight(b); let n=0; while(f.phase==='burn'&&n++<80000) stepFlight(f); if(f.phase==='shake'){ f.outcome='PAD_CRASH'; } return f; }
function clone(b){ return {counts:Object.assign({},b.counts),mat:b.mat,crew:b.crew,world:b.world||'earth',budget:b.budget||DEFAULT_BUDGET,comp:Object.assign({},b.comp||DEF_COMP)}; }
function boosterTotal(b){ return (b.counts['booster-side']||0)+(b.counts['booster-heavy']||0); }
function canAdd(b,id){ const p=PBY[id]; if(p.fixed) return false; if((b.counts[id]||0)>=p.max) return false; if(p.booster&&boosterTotal(b)>=2) return false; return true; }
function efficiency(d,f){
 const mf=Math.min(1,(d.payload/d.mass)/.2);
 const ce=Math.max(0,1-d.cost/d.gates.budget.limit);
 const te=Math.max(0,1-d.days/45);
 const tw=d.loadG>=1.2&&d.loadG<=2.2?1:Math.max(0,1-Math.abs(d.loadG-1.7)/1.5);
 const pu=d.power>0?1:0;
 return Math.round(100*(.3*mf+.25*ce+.2*te+.15*tw+.1*pu));
}
const FAIL_TXT=g=>({TWR:'Not enough thrust',BUDGET:'Over budget',MASS:'Over mass limit',POWER:'Power deficit',STRUCT:'Structure overloaded',DELTAV:'Not enough delta-v'}[g]);
function failures(b){ const f=runHeadless(b); const d=f.d; const list=[]; for(const k in d.gates) if(!d.gates[k].pass) list.push(k);
 if(!list.length&&f.outcome==='SUBORBITAL') list.push('DELTAV'); return {f,list,score:list.length}; }
function neighbors(b){
 const cands=[];
 for(const p of PARTS){ if(p.fixed) continue;
  if(canAdd(b,p.id)){ const c=clone(b); c.counts[p.id]=(c.counts[p.id]||0)+1; cands.push({b:c,label:'Add '+p.name}); }
  if((b.counts[p.id]||0)>0){ const c=clone(b); c.counts[p.id]--; cands.push({b:c,label:'Remove '+p.name}); } }
 for(const k in MATS){ if(k!==b.mat){ const c=clone(b); c.mat=k; cands.push({b:c,label:'Switch structure to '+MATS[k].n}); } }
 if(b.crew<10){ const c=clone(b); c.crew++; cands.push({b:c,label:'Hire one more crew member'}); }
 if(b.crew>4){ const c=clone(b); c.crew--; cands.push({b:c,label:'Release one crew member'}); }
 return cands;
}
function advise(b){
 const base=failures(b); if(!base.list.length) return [];
 const out=[];
 for(const c of neighbors(b)){ const r=failures(c.b); const fixed=base.list.filter(x=>!r.list.includes(x)); const added=r.list.filter(x=>!base.list.includes(x));
  if(r.score<base.score||(r.score===base.score&&fixed.length&&!added.length)){ out.push({label:c.label,b:c.b,fixed,left:r.list,d:r.f.d,score:r.score,added}); } }
 out.sort((a,b)=>a.score-b.score||a.added.length-b.added.length||a.d.cost-b.d.cost);
 return out.slice(0,3);
}
function improve(b){
 const cur=failures(b); if(cur.list.length) return [];
 const e0=efficiency(cur.f.d); const out=[];
 for(const c of neighbors(b)){ const r=failures(c.b); if(r.list.length) continue; const e=efficiency(r.f.d); if(e>e0) out.push({label:c.label,b:c.b,d:r.f.d,eff:e,gain:e-e0}); }
 out.sort((a,b)=>b.gain-a.gain); return out.slice(0,3);
}
const EXAMPLES={
 A:{name:'A · Underpowered',counts:{radar:1,spectrometer:1,'solar-wing':1},mat:'al-standard',crew:4},
 B:{name:'B · Clean orbit',counts:{camera:1,'solar-wing':1,'booster-side':1},mat:'al-standard',crew:4},
 C:{name:'C · Heavy hauler',counts:{'booster-heavy':2,radar:1,spectrometer:1,'solar-wing':1,rtg:1},mat:'al-standard',crew:4}
};
if(typeof module!=='undefined') module.exports={suitability,blend,setCustom,USES,WORLD_TIP,CONST,DEF_COMP,DEFAULT_BUDGET,WORLDS,improve,neighbors,evalBuild,runHeadless,advise,EXAMPLES,MATS,PARTS,efficiency,failures,newFlight,stepFlight};
