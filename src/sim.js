'use strict';
let TARGET_ALT=100000; const G0=9.81, RE=6371000, DT=0.05;
const LIM={twr:1.2,budget:1000000,mass:5000};
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
const FUELS={
 solid:{n:'Solid',sub:'Simple and cheap. Strong kick, lower efficiency.',isp:.78,thrust:1.15,cost:.6,dry:1,f1:0xff7a2a,f2:0xffe6a0},
 liquid:{n:'Liquid · kerolox',sub:'Balanced RP-1 and liquid oxygen.',isp:1,thrust:1,cost:1,dry:1,f1:0xff8a3d,f2:0xfff2c8},
 cryo:{n:'Cryogenic · LH2/LOX',sub:'Best efficiency. Costly, bulky insulated tanks.',isp:1.22,thrust:.92,cost:1.55,dry:1.14,f1:0x6fa8ff,f2:0xe8f2ff},
 hybrid:{n:'Hybrid',sub:'Safer and throttleable. Moderate performance.',isp:.9,thrust:.95,cost:.8,dry:1.04,f1:0xff5a2e,f2:0xffd29a}
};
function fxOf(b){return Object.assign({},FUELS[b.fuel]||FUELS.liquid,{load:b.load==null?1:b.load});}
const PBY={}; PARTS.forEach(p=>PBY[p.id]=p);
function matFor(b,p){ if(!p.struct) return MATS['al-standard']; if(p.id==='core-stage'&&b.mat==='printed') return MATS['al-standard']; return MATS[b.mat]; }
function count(b,id){ const p=PBY[id]; return p.fixed?1:(b.counts[id]||0); }
function evalBuild(b){
 let mass=0,cost=0,thrust=0,power=0,hours=0,payload=0,types=0; const F=fxOf(b);
 for(const p of PARTS){
  const n=count(b,p.id); if(!n) continue; types++;
  const mm=matFor(b,p);
  const pr=p.thrust>0; mass+=n*(p.dry*mm.m*(pr?F.dry:1)+p.prop*(pr?F.load:1)); cost+=n*p.cost*mm.c*(pr?F.cost:1); thrust+=n*p.thrust*(pr?F.thrust:1); power+=n*p.power;
  let h=0; for(let i=0;i<n;i++) h+=p.hours*mm.t*Math.max(.6,1-.08*i); hours+=h;
  if(p.payload) payload+=n*p.dry;
 }
 cost+=(b.crew-4)*30000;
 const twr=thrust/(mass*G0);
 const days=hours*(1+.04*(types-1))/(b.crew*8);
 const limit=3*MATS[b.mat].s;
 const E=1e-9;
 const gates={
  twr:{id:'TWR',pass:twr>=LIM.twr-E,value:twr,limit:LIM.twr},
  budget:{id:'BUDGET',pass:cost<=LIM.budget+E,value:cost,limit:LIM.budget},
  mass:{id:'MASS',pass:mass<=LIM.mass+E,value:mass,limit:LIM.mass},
  power:{id:'POWER',pass:power>E,value:power,limit:0},
  struct:{id:'STRUCT',pass:twr<=limit+E,value:twr,limit}
 };
 const allPass=Object.values(gates).every(g=>g.pass);
 return {mass,cost,thrust,power,twr,hours,days,payload,limit,gates,allPass};
}
function newFlight(b){
 const d=evalBuild(b); const mmc=matFor(b,PBY['core-stage']); const F=fxOf(b);
 let staticDry=0; const boosters=[];
 for(const p of PARTS){ const n=count(b,p.id); const mm=matFor(b,p);
  for(let i=0;i<n;i++){
   if(p.booster) boosters.push({id:p.id,dry:p.dry*mm.m*F.dry,prop:p.prop*F.load,thrust:p.thrust*F.thrust,isp:p.isp*F.isp,attached:true});
   else if(p.id!=='core-stage') staticDry+=p.dry*mm.m;
  }}
 return {d,t:0,y:0,v:0,maxY:0,maxQ:0,q:0,a:0,staticDry,
  core:{dry:450*mmc.m*F.dry,prop:1350*F.load,thrust:30000*F.thrust,isp:360*F.isp},boosters,
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
 for(const b of f.boosters){ if(b.attached&&b.prop>0){ const full=b.thrust/(b.isp*G0)*dt; const dm=Math.min(b.prop,full); F+=b.thrust*dm/full; b.prop-=dm; if(b.prop<=0){ b.attached=false; f.jett.push(b); ev(f,'Booster burnout and separation'); } } }
 f.thrusting=F>0;
 const m=fmass(f);
 const rho=1.225*Math.exp(-f.y/8500);
 const drag=0.5*rho*f.v*Math.abs(f.v)*1.0;
 const g=G0*Math.pow(RE/(RE+f.y),2);
 const a=(F-drag)/m-g;
 f.a=a; f.v+=a*dt; f.y+=f.v*dt; if(f.y<0){f.y=0; if(f.v<0) f.v=0;}
 f.t+=dt; if(f.y>f.maxY) f.maxY=f.y;
 const q=0.5*rho*f.v*f.v; f.q=q;
 if(!f.liftoff&&f.y>5){f.liftoff=true; ev(f,'Liftoff');}
 if(q>f.maxQ) f.maxQ=q; else if(!f.mq&&f.maxQ>1000&&q<f.maxQ*.97){ f.mq=true; ev(f,'Max-Q passed ('+(f.maxQ/1000).toFixed(1)+' kPa)');
   if(!f.d.gates.struct.pass){ f.phase='breakup'; f.outcome='BREAKUP'; ev(f,'Structure failed under '+f.d.twr.toFixed(2)+' g load'); return; } }
 if(!f.meco&&f.core.prop<=0){ f.meco=true; ev(f,'Core engine cutoff at '+(f.y/1000).toFixed(1)+' km'); }
 if(f.meco&&F===0&&f.v<=0){
  f.phase='done';
  if(f.maxY>=TARGET_ALT) f.outcome=f.d.power>1e-9?'ORBIT':'POWER'; else f.outcome='SUBORBITAL';
  ev(f,'Apogee '+(f.maxY/1000).toFixed(1)+' km');
 }
 if(f.t>3000){ f.phase='done'; f.outcome='SUBORBITAL'; }
}
function runHeadless(b){ const f=newFlight(b); let n=0; while(f.phase==='burn'&&n++<80000) stepFlight(f); if(f.phase==='shake'){ f.outcome='PAD_CRASH'; } return f; }
function clone(b){ return {counts:Object.assign({},b.counts),mat:b.mat,crew:b.crew,fuel:b.fuel,load:b.load}; }
function boosterTotal(b){ return (b.counts['booster-side']||0)+(b.counts['booster-heavy']||0); }
function canAdd(b,id){ const p=PBY[id]; if(p.fixed) return false; if((b.counts[id]||0)>=p.max) return false; if(p.booster&&boosterTotal(b)>=2) return false; return true; }
function efficiency(d,f){
 const mf=Math.min(1,(d.payload/d.mass)/.2);
 const ce=Math.max(0,1-d.cost/LIM.budget);
 const te=Math.max(0,1-d.days/45);
 const tw=d.twr>=1.2&&d.twr<=2.2?1:Math.max(0,1-Math.abs(d.twr-1.7)/1.5);
 const pu=d.power>0?1:0;
 return Math.round(100*(.3*mf+.25*ce+.2*te+.15*tw+.1*pu));
}
const FAIL_TXT=g=>({TWR:'Not enough thrust',BUDGET:'Over budget',MASS:'Over mass limit',POWER:'Power deficit',STRUCT:'Structure overloaded'}[g]);
function failures(b){ const f=runHeadless(b); const d=f.d; const list=[]; for(const k in d.gates) if(!d.gates[k].pass) list.push(k);
 if(!list.length&&f.outcome==='SUBORBITAL') list.push('DELTAV'); return {f,list,score:list.length}; }
function neighbors(b){
 const cands=[];
 for(const p of PARTS){ if(p.fixed) continue;
  if(canAdd(b,p.id)){ const c=clone(b); c.counts[p.id]=(c.counts[p.id]||0)+1; cands.push({b:c,label:'Add '+p.name}); }
  if((b.counts[p.id]||0)>0){ const c=clone(b); c.counts[p.id]--; cands.push({b:c,label:'Remove '+p.name}); } }
 for(const k in MATS){ if(k!==b.mat){ const c=clone(b); c.mat=k; cands.push({b:c,label:'Switch structure to '+MATS[k].n}); } }
 for(const k in FUELS){ if(k!==(b.fuel||'liquid')){ const c=clone(b); c.fuel=k; cands.push({b:c,label:'Switch propellant to '+FUELS[k].n}); } }
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
if(typeof module!=='undefined') module.exports={FUELS,improve,neighbors,evalBuild,runHeadless,advise,EXAMPLES,MATS,PARTS,efficiency,failures,newFlight,stepFlight};
