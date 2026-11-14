(function(){
'use strict';
const $=(s,r)=>(r||document).querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const money=v=>v>=1e6?'$'+(v/1e6).toFixed(2)+'M':'$'+Math.round(v/1e3)+'k';
const tfmt=t=>{t=Math.max(0,t|0);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const START={counts:{camera:1,'solar-wing':1},mat:'al-standard',crew:4,fuel:'liquid',load:1};
let build=clone(START), hist=[], redo=[], tab='propulsion', lastRun=null;
let mode='build', fl=null, simAcc=0, speed=6, paused=false, cdT=0, visAlt=0, samples=[], lastSample=0, debTimer=null, prop0=1;
const cache=new Map();
function key(b){return JSON.stringify([Object.keys(b.counts).sort().map(k=>[k,b.counts[k]]),b.mat,b.crew,b.fuel,b.load,LIM.budget,LIM.mass,TARGET_ALT]);}
function sim(b){const k=key(b);if(!cache.has(k))cache.set(k,runHeadless(b));return cache.get(k);}
function announce(m){$('#live').textContent=m;}

/* ---------- audio ---------- */
let AC=null,muted=false,rumble=null;
function actx(){if(muted)return null;if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}if(AC.state==='suspended')AC.resume();return AC;}
function blip(f,d,type,vol){const a=actx();if(!a)return;try{const o=a.createOscillator(),g=a.createGain();o.type=type||'square';o.frequency.value=f;g.gain.value=vol||.04;g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+d);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+d);}catch(e){}}
function startRumble(){const a=actx();if(!a||rumble)return;try{const n=a.sampleRate*2,buf=a.createBuffer(1,n,a.sampleRate),d=buf.getChannelData(0);let l=0;for(let i=0;i<n;i++){l=(l+.02*(Math.random()*2-1))/1.02;d[i]=l*3.5;}const s=a.createBufferSource();s.buffer=buf;s.loop=true;const g=a.createGain();g.gain.value=0;const f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=380;s.connect(f);f.connect(g);g.connect(a.destination);s.start();rumble={s,g};}catch(e){rumble=null;}}
function setRumble(v){if(rumble){try{rumble.g.gain.value=v*.5;}catch(e){}}}
function stopRumble(){if(rumble){try{rumble.s.stop();}catch(e){}rumble=null;}}

/* ---------- 3D ---------- */
const cv=$('#gl');
let R=null,scene,camera,rocketRoot,rkGroup,rk=null,planet,atmo,stars,points,sunL;
const cam={az:.7,pol:1.32,dist:14.5,tx:0,ty:3.0,tz:0,user:0,dragging:false};
const tweens=[],debris=[];
const NP=800,P={pos:new Float32Array(NP*3),col:new Float32Array(NP*3),vel:new Float32Array(NP*3),base:new Float32Array(NP*3),life:new Float32Array(NP),max:new Float32Array(NP),i:0};
let rkx=0,rky=0,rkz=0,exploded=false,shake=0,geoP=null;
const MATCOL={'al-standard':0xc9d3e0,'al-lithium':0x9fe3d6,'steel':0xeef1f4,'titanium':0x6d7686,'cfrp':0x20262e,'printed':0xd9985f,'reclaimed':0xa9a47c};
function M(color,o){return new THREE.MeshStandardMaterial(Object.assign({color:color,roughness:.5,metalness:.35},o||{}));}
function panelTex(){const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.fillStyle='#0c2a58';x.fillRect(0,0,128,256);x.strokeStyle='#5f8fd0';x.lineWidth=2;for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*32,0);x.lineTo(i*32,256);x.stroke();}for(let j=0;j<=8;j++){x.beginPath();x.moveTo(0,j*32);x.lineTo(128,j*32);x.stroke();}return new THREE.CanvasTexture(c);}
let _ptex=null;
function mesh(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);return m;}
function flameMesh(r,h){const g=new THREE.Group();const o=new THREE.Mesh(new THREE.ConeGeometry(r,h,16),new THREE.MeshBasicMaterial({color:0xff8a3d,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));o.rotation.x=Math.PI;o.position.y=-h/2;const i=new THREE.Mesh(new THREE.ConeGeometry(r*.5,h*.6,16),new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));i.rotation.x=Math.PI;i.position.y=-h*.3;g.add(o);g.add(i);g.visible=false;return g;}
function lathe(pts,mat,seg){return new THREE.Mesh(new THREE.LatheGeometry(pts.map(q=>new THREE.Vector2(q[0],q[1])),seg||40),mat);}
function bodyTex(){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,256,512);
 for(let j=1;j<8;j++){x.fillStyle='#c9ced6';x.fillRect(0,j*64-1,256,2);}
 for(let i=0;i<8;i++){x.fillStyle='#e3e6eb';x.fillRect(i*32,0,1,512);}
 x.fillStyle='#1b2029';x.fillRect(0,0,256,34);x.fillRect(0,478,256,34);
 x.fillStyle='#ff6b3d';x.fillRect(0,300,256,16);x.fillStyle='#f3f5f8';x.fillRect(0,316,256,6);
 const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;t.anisotropy=4;return t;}
let _btex=null;
function nozzle(r,h,dark,glow){const g=new THREE.Group();const bell=new THREE.Mesh(new THREE.CylinderGeometry(r*.55,r,h,28,1,true),new THREE.MeshStandardMaterial({color:0x3a414d,metalness:.9,roughness:.3,side:THREE.DoubleSide}));g.add(bell);
 const th=new THREE.Mesh(new THREE.TorusGeometry(r*.97,r*.07,8,28),dark);th.rotation.x=Math.PI/2;th.position.y=-h/2;g.add(th);
 const inner=new THREE.Mesh(new THREE.CircleGeometry(r*.5,24),new THREE.MeshBasicMaterial({color:glow||0x2a1208}));inner.rotation.x=Math.PI/2;inner.position.y=h/2-.01;g.add(inner);return g;}
function buildRocket(b){
 const g=new THREE.Group();const o={group:g,parts:{},boosters:[],flame:null,lights:[]};
 if(!_btex)_btex=bodyTex();
 const sm=M(MATCOL[b.mat]||0xc9d3e0,{metalness:b.mat==='cfrp'?.2:.55,roughness:b.mat==='cfrp'?.32:.38,map:_btex});
 const plain=M(MATCOL[b.mat]||0xc9d3e0,{metalness:.55,roughness:.4});
 const dark=M(0x262c36,{metalness:.6,roughness:.4}),accent=M(0xff6b3d,{metalness:.25,roughness:.45}),gold=M(0xd4a84a,{metalness:.9,roughness:.28});
 const tag=(id,grp)=>{(o.parts[id]=o.parts[id]||[]).push(grp);g.add(grp);return grp;};
 // ---- core stage: tank barrel, interstage, engine cluster, fins, umbilical ----
 const core=tag('core-stage',new THREE.Group());
 core.add(mesh(new THREE.CylinderGeometry(.55,.55,4.4,48),sm,0,2.9,0));
 core.add(lathe([[.3,0],[.42,.15],[.52,.5],[.55,.7]],dark,40).translateY(0));
 [0.72,5.06].forEach(y=>{const t=mesh(new THREE.TorusGeometry(.555,.025,8,48),accent,0,y,0);t.rotation.x=Math.PI/2;core.add(t);});
 [2.0,3.3,4.2].forEach(y=>{const t=mesh(new THREE.TorusGeometry(.556,.012,6,48),dark,0,y,0);t.rotation.x=Math.PI/2;core.add(t);});
 const ns=[[0,0],[.26,0],[-.13,.225],[-.13,-.225]];ns.forEach(q=>{const n=nozzle(q[0]===0&&q[1]===0?.3:.2,.6,dark);n.position.set(q[0],.3,q[1]);core.add(n);});
 core.children.forEach(c=>{}); 
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;const f=new THREE.Mesh(new THREE.BoxGeometry(.05,1.15,.62),plain);f.position.set(Math.cos(a)*.78,1.15,Math.sin(a)*.78);f.rotation.y=-a;f.rotation.z=0;core.add(f);
  const tip=mesh(new THREE.BoxGeometry(.07,.12,.5),accent,Math.cos(a)*.78,.58,Math.sin(a)*.78);tip.rotation.y=-a;core.add(tip);}
 const um=mesh(new THREE.CylinderGeometry(.025,.025,4.2,8),dark,.0,2.9,.58);core.add(um);
 // ---- fairing / capsule: ogive nose, gold service collar, window, escape tower ----
 const cap=tag('capsule',new THREE.Group());
 const og=[];for(let i=0;i<=14;i++){const t=i/14;og.push([.55*Math.pow(Math.cos(t*Math.PI/2),.72)+.002,5.1+1.5*t]);}
 cap.add(lathe(og,M(0xf3f5f8,{metalness:.25,roughness:.35}),48));
 const col=mesh(new THREE.CylinderGeometry(.56,.56,.14,48),gold,0,5.17,0);cap.add(col);
 const win=mesh(new THREE.SphereGeometry(.11,20,14),new THREE.MeshBasicMaterial({color:0x58d0f5}),0,5.55,.46);win.scale.set(1,1.2,.5);cap.add(win);
 const wr=new THREE.Mesh(new THREE.TorusGeometry(.12,.02,8,24),dark);wr.position.set(0,5.55,.47);wr.scale.set(1,1.2,.6);cap.add(wr);
 cap.add(mesh(new THREE.CylinderGeometry(.012,.012,.55,6),dark,0,6.85,0));
 // ---- boosters ----
 const nb=(b.counts['booster-side']||0),nh=(b.counts['booster-heavy']||0);
 const list=[];for(let i=0;i<nb;i++)list.push(false);for(let i=0;i<nh;i++)list.push(true);
 list.forEach((heavy,i)=>{
  const x=(i%2===0?-1:1)*(heavy?1.05:.95),r=heavy?.38:.27,h=heavy?3.8:3.2,sg=Math.sign(x);
  const bg=new THREE.Group();bg.position.set(x,0,0);
  bg.add(mesh(new THREE.CylinderGeometry(r,r,h,32),sm,0,h/2+.4,0));
  const np=[];for(let k=0;k<=10;k++){const t=k/10;np.push([r*Math.pow(Math.cos(t*Math.PI/2),.8)+.002,h+.4+.95*t]);}
  bg.add(lathe(np,accent,32));
  const nz=nozzle(r*.62,.5,dark);nz.position.set(0,.32,0);bg.add(nz);
  [h*.35+.4,h*.8+.4].forEach(y=>{const t=mesh(new THREE.TorusGeometry(r+.004,.012,6,32),dark,0,y,0);t.rotation.x=Math.PI/2;bg.add(t);});
  for(let k=0;k<2;k++){const f=mesh(new THREE.BoxGeometry(.04,.7,.34),plain,sg*(r+.1)*(k?0:1)+(k?0:0),.8,(k?1:0)*(r+.12));if(k){f.position.set(0,.8,r+.1);}else{f.position.set(sg*(r+.1),.8,0);f.scale.set(1,1,1);}bg.add(f);}
  [1.2,h-.3].forEach(y=>bg.add(mesh(new THREE.BoxGeometry(.55,.08,.08),dark,-sg*.38,y,0)));
  const fl=flameMesh(r*.9,2.2);fl.position.y=0;bg.add(fl);
  tag(heavy?'booster-heavy':'booster-side',bg);o.boosters.push({g:bg,x:x,flame:fl});
 });
 // ---- solar wings: hinge arm, framed cells ----
 const nsw=b.counts['solar-wing']||0;
 for(let j=0;j<nsw;j++){const s=j===0?1:-1;const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.08,.08,.9),dark,0,3.3,s*.85));
  if(!_ptex)_ptex=panelTex();
  w.add(mesh(new THREE.BoxGeometry(1.0,.035,2.0),new THREE.MeshStandardMaterial({map:_ptex,roughness:.3,metalness:.7,emissive:0x061a33}),0,3.3,s*1.85));
  const fm=M(0xdfe5ee,{metalness:.7,roughness:.35});
  [[1.04,.05,.05,0,-1],[1.04,.05,.05,0,1]].forEach(q=>w.add(mesh(new THREE.BoxGeometry(q[0],.05,.05),fm,0,3.3,s*(1.85+q[4]*1.0))));
  [-.5,.5].forEach(px=>w.add(mesh(new THREE.BoxGeometry(.05,.05,2.05),fm,px,3.3,s*1.85)));
  w.add(mesh(new THREE.BoxGeometry(.05,.05,2.0),fm,0,3.3,s*1.85));
  tag('solar-wing',w);}
 // ---- RTG ----
 if(b.counts.rtg){const w=new THREE.Group();w.add(mesh(new THREE.CylinderGeometry(.16,.16,1.0,20),M(0x7c6c3a,{metalness:.75,roughness:.35}),.42,1.7,.42));for(let i=0;i<5;i++)w.add(mesh(new THREE.CylinderGeometry(.22,.22,.025,20),dark,.42,1.3+i*.2,.42));w.add(mesh(new THREE.CylinderGeometry(.04,.04,.4,8),dark,.42,2.4,.42));tag('rtg',w);}
 const ok=(evalBuild(b).power>0);
 const led=()=>new THREE.MeshBasicMaterial({color:ok?0x5ee6a8:0x553a3a});
 if(b.counts.camera){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.28,.26,.3),dark,-.46,4.3,.46));const l=mesh(new THREE.CylinderGeometry(.1,.12,.2,20),M(0x0a0a0c,{metalness:.8,roughness:.2}),-.58,4.3,.58);l.rotation.z=Math.PI/2;l.rotation.y=Math.PI/4;w.add(l);w.add(mesh(new THREE.SphereGeometry(.07,12,10),new THREE.MeshStandardMaterial({color:0x2a6bd8,emissive:0x0b2a66,metalness:.9,roughness:.1}),-.64,4.3,.64));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.4,4.47,.5));tag('camera',w);}
 if(b.counts.spectrometer){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.3,.55,.3),M(0x3d6fa8,{metalness:.6,roughness:.35}),.45,3.8,.45));w.add(mesh(new THREE.CylinderGeometry(.07,.09,.2,16),dark,.55,3.55,.55));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),.45,4.12,.45));tag('spectrometer',w);}
 if(b.counts.radar){const w=new THREE.Group();const d=mesh(new THREE.CylinderGeometry(.44,.06,.14,32),M(0xd8dde6,{metalness:.7,roughness:.3}),-.52,3.6,-.52);d.rotation.z=Math.PI/2;d.rotation.y=Math.PI/4;w.add(d);w.add(mesh(new THREE.CylinderGeometry(.03,.03,.38,8),dark,-.46,3.6,-.46));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.4,3.95,-.4));tag('radar',w);}
 o.flame=flameMesh(.5,4);o.flame.position.y=.1;g.add(o.flame);
 const FU=FUELS[b.fuel]||FUELS.liquid;const tint=gp=>{gp.children[0].material.color.setHex(FU.f1);gp.children[1].material.color.setHex(FU.f2);};tint(o.flame);o.boosters.forEach(bb=>tint(bb.flame));
 return o;
}
function tween(obj){tweens.push({o:obj,t:0,d:.6,from:6});obj.position.y=6;}
function rebuildRocket(addedId){
 if(!R)return;
 if(rkGroup)rocketRoot.remove(rkGroup);
 rk=buildRocket(build);rkGroup=rk.group;rocketRoot.add(rkGroup);
 if(addedId&&rk.parts[addedId]){tween(rk.parts[addedId][rk.parts[addedId].length-1]);}
}
function emit(x,y,z,vx,vy,vz,life,r,g,b){const i=P.i++%NP,k=i*3;P.pos[k]=x;P.pos[k+1]=y;P.pos[k+2]=z;P.vel[k]=vx;P.vel[k+1]=vy;P.vel[k+2]=vz;P.base[k]=r;P.base[k+1]=g;P.base[k+2]=b;P.life[i]=P.max[i]=life;}
function updParticles(dt){for(let i=0;i<NP;i++){const k=i*3;if(P.life[i]>0){P.life[i]-=dt;P.pos[k]+=P.vel[k]*dt;P.pos[k+1]+=P.vel[k+1]*dt;P.pos[k+2]+=P.vel[k+2]*dt;const f=Math.max(0,P.life[i]/P.max[i]);P.col[k]=P.base[k]*f;P.col[k+1]=P.base[k+1]*f;P.col[k+2]=P.base[k+2]*f;}else{P.col[k]=P.col[k+1]=P.col[k+2]=0;}}
 geoP.attributes.position.needsUpdate=true;geoP.attributes.color.needsUpdate=true;}
function explode(x,y,z,n){for(let i=0;i<n;i++){const a=Math.random()*6.283,e=Math.random()*3.14-1.57,s=6+Math.random()*26;emit(x,y+2,z,Math.cos(a)*Math.cos(e)*s,Math.sin(e)*s*.9+6,Math.sin(a)*Math.cos(e)*s,.8+Math.random()*1.8,1,.45+Math.random()*.4,.12);}}
function init3D(){
 try{R=new THREE.WebGLRenderer({canvas:cv,antialias:true});}catch(e){R=null;$('#nogl').hidden=false;return;}
 R.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 scene=new THREE.Scene();scene.background=new THREE.Color(0x16233b);
 camera=new THREE.PerspectiveCamera(36,1,.1,300000);
 scene.add(new THREE.HemisphereLight(0x9bbcff,0x1b1d2b,.65));
 sunL=new THREE.DirectionalLight(0xfff0dc,1.25);sunL.position.set(-30,40,25);scene.add(sunL);
 const rim=new THREE.DirectionalLight(0x58d0f5,.55);rim.position.set(30,12,-30);scene.add(rim);
 const gnd=new THREE.Mesh(new THREE.CircleGeometry(70,64),new THREE.MeshStandardMaterial({color:0x101a2a,roughness:.9}));gnd.rotation.x=-Math.PI/2;gnd.position.y=.02;scene.add(gnd);
 const grid=new THREE.GridHelper(140,70,0x2f5a93,0x172a45);grid.position.y=.05;scene.add(grid);
 const ring=new THREE.Mesh(new THREE.RingGeometry(3.4,3.8,64),new THREE.MeshBasicMaterial({color:0xff8a3d,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.07;scene.add(ring);
 const tm=new THREE.MeshStandardMaterial({color:0x56637a,metalness:.7,roughness:.45});
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(4.6,5,.35,48),new THREE.MeshStandardMaterial({color:0x2a3446,roughness:.8,metalness:.2}));pad.position.y=.17;scene.add(pad);
 const trench=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.4,32),new THREE.MeshBasicMaterial({color:0x05070b}));trench.position.y=.19;scene.add(trench);
 const tw=new THREE.Group();
 [[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]].forEach(q=>tw.add(mesh(new THREE.BoxGeometry(.12,14,.12),tm,q[0],7,q[1])));
 for(let y=1;y<=13;y+=1.5){tw.add(mesh(new THREE.BoxGeometry(.9,.07,.07),tm,0,y,.4));tw.add(mesh(new THREE.BoxGeometry(.9,.07,.07),tm,0,y,-.4));const d=mesh(new THREE.BoxGeometry(.07,1.6,.07),tm,0,y+.75,.4);d.rotation.x=0;d.rotation.z=.5;tw.add(d);}
 [4,7.5,11].forEach(y=>{const arm=mesh(new THREE.BoxGeometry(2.7,.18,.22),tm,1.55,y,0);tw.add(arm);tw.add(mesh(new THREE.BoxGeometry(.2,.2,.5),M(0xffcf5a,{metalness:.3}),2.8,y,0));});
 tw.add(mesh(new THREE.ConeGeometry(.35,.9,4),tm,0,14.4,0));
 const beacon=mesh(new THREE.SphereGeometry(.16,12,10),new THREE.MeshBasicMaterial({color:0xff4050}),0,15.1,0);tw.add(beacon);window.__beacon=beacon;
 tw.position.set(-4.6,0,0);scene.add(tw);
 [[12,12],[-14,10],[10,-14]].forEach(q=>{const lp=new THREE.Group();lp.add(mesh(new THREE.CylinderGeometry(.08,.1,4.5,8),tm,0,2.25,0));lp.add(mesh(new THREE.BoxGeometry(.9,.25,.25),new THREE.MeshBasicMaterial({color:0xfff2c8}),0,4.6,0));lp.position.set(q[0],0,q[1]);lp.lookAt(0,4.6,0);scene.add(lp);});
 const fl1=new THREE.PointLight(0xffe2b0,1.1,40);fl1.position.set(8,6,8);scene.add(fl1);
 // Earth with procedural texture, fresnel atmosphere, distant Moon
 const ec=document.createElement('canvas');ec.width=1024;ec.height=512;const ex=ec.getContext('2d');
 const og=ex.createLinearGradient(0,0,0,512);og.addColorStop(0,'#0d4a8f');og.addColorStop(.5,'#0b5fb0');og.addColorStop(1,'#0d4a8f');ex.fillStyle=og;ex.fillRect(0,0,1024,512);
 let sd=7;const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;};
 for(let n=0;n<70;n++){const cx=rnd()*1024,cy=60+rnd()*392,rr=14+rnd()*58;ex.fillStyle=rnd()>.3?'#2f7d4a':'#a98a52';for(let k=0;k<7;k++){ex.beginPath();ex.ellipse(cx+(rnd()-.5)*rr*1.4,cy+(rnd()-.5)*rr*.9,rr*(.4+rnd()*.7),rr*(.3+rnd()*.5),rnd()*3,0,6.3);ex.fill();}}
 ex.fillStyle='#eef3f8';ex.fillRect(0,0,1024,22);ex.fillRect(0,490,1024,22);
 ex.globalAlpha=.35;ex.fillStyle='#fff';for(let n=0;n<160;n++){ex.beginPath();ex.ellipse(rnd()*1024,rnd()*512,20+rnd()*70,4+rnd()*10,rnd()*.6-.3,0,6.3);ex.fill();}ex.globalAlpha=1;
 const etex=new THREE.CanvasTexture(ec);etex.anisotropy=4;
 planet=new THREE.Mesh(new THREE.SphereGeometry(40000,128,96),new THREE.MeshStandardMaterial({map:etex,roughness:1,metalness:0}));planet.position.y=-40000;scene.add(planet);
 atmo=new THREE.Mesh(new THREE.SphereGeometry(42600,96,64),new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,
  vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec3 vN;void main(){float i=pow(max(0.0,0.74-dot(vN,vec3(0.0,0.0,1.0))),3.0);gl_FragColor=vec4(0.32,0.62,1.0,1.0)*i*1.9;}'}));atmo.position.y=-40000;atmo.visible=false;scene.add(atmo);
 const mc=document.createElement('canvas');mc.width=512;mc.height=256;const mx=mc.getContext('2d');mx.fillStyle='#b9b6b0';mx.fillRect(0,0,512,256);
 for(let n=0;n<130;n++){const cx=rnd()*512,cy=rnd()*256,rr=3+rnd()*18;mx.fillStyle='rgba(60,58,56,'+(.15+rnd()*.3)+')';mx.beginPath();mx.arc(cx,cy,rr,0,6.3);mx.fill();mx.fillStyle='rgba(235,232,225,.35)';mx.beginPath();mx.arc(cx-rr*.2,cy-rr*.2,rr*.7,0,6.3);mx.fill();}
 const moon=new THREE.Mesh(new THREE.SphereGeometry(7000,48,32),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(mc),roughness:1}));moon.position.set(-70000,55000,-110000);scene.add(moon);
 const sp=new Float32Array(1800*3);for(let i=0;i<1800;i++){const u=Math.random()*2-1,a=Math.random()*6.283,s=Math.sqrt(1-u*u);sp[i*3]=Math.cos(a)*s*100000;sp[i*3+1]=Math.abs(u)*100000;sp[i*3+2]=Math.sin(a)*s*100000;}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
 stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,color:0xffffff,transparent:true,opacity:.3,depthWrite:false}));stars.frustumCulled=false;scene.add(stars);
 geoP=new THREE.BufferGeometry();geoP.setAttribute('position',new THREE.BufferAttribute(P.pos,3));geoP.setAttribute('color',new THREE.BufferAttribute(P.col,3));
 points=new THREE.Points(geoP,new THREE.PointsMaterial({size:1.2,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));points.frustumCulled=false;scene.add(points);
 rocketRoot=new THREE.Group();scene.add(rocketRoot);rebuildRocket();
 const ro=new ResizeObserver(resize);ro.observe($('#stage'));resize();
 // camera input
 const ptrs=new Map();let pinch=0;
 cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);cam.dragging=true;cam.user=4;});
 cv.addEventListener('pointermove',e=>{const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p[0],dy=e.clientY-p[1];p[0]=e.clientX;p[1]=e.clientY;
  if(ptrs.size===2){const a=[...ptrs.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinch)cam.dist=clamp(cam.dist*(pinch/d),6,80);pinch=d;}
  else{cam.az-=dx*.007;cam.pol=clamp(cam.pol-dy*.006,.25,2.2);}cam.user=4;});
 const up=e=>{ptrs.delete(e.pointerId);pinch=0;if(!ptrs.size)cam.dragging=false;};
 cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
 cv.addEventListener('wheel',e=>{e.preventDefault();cam.dist=clamp(cam.dist*(1+Math.sign(e.deltaY)*.08),6,80);cam.user=4;},{passive:false});
}
function resize(){if(!R)return;const s=$('#stage');const w=s.clientWidth||600,h=s.clientHeight||400;R.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
const vis=a=>9*Math.pow(Math.max(a,0),.6);
function skyFor(alt){const t=clamp(alt/70000,0,1);const r=(22+(2-22)*t)/255,g=(35+(4-35)*t)/255,b=(59+(10-59)*t)/255;scene.background.setRGB(r,g,b);
 stars.material.opacity=.3+.7*clamp((alt-6000)/40000,0,1);
 const a=clamp(alt/30000,0,1);planet.material.color.setScalar(.12+.88*a);atmo.visible=alt>4000;}
function frame3D(dt){
 // tweens
 for(let i=tweens.length-1;i>=0;i--){const t=tweens[i];t.t+=dt;const u=clamp(t.t/t.d,0,1),k=1-Math.pow(1-u,3);t.o.position.y=t.from*(1-k);if(u>=1){t.o.position.y=0;tweens.splice(i,1);}}
 // debris
 for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.t+=dt;d.vy-=9.8*dt*3;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.g.position.set(d.x,d.y,d.z);d.g.rotation.z+=d.rz*dt;d.g.rotation.x+=d.rx*dt;if(d.t>7){scene.remove(d.g);debris.splice(i,1);}}
 if(window.__beacon)window.__beacon.visible=((performance.now()/600)|0)%2===0;
 // rocket pose
 let jx=0,jz=0;
 if(mode==='flight'&&fl&&fl.phase==='shake'&&!RM){const amp=.12+.5*clamp((1.2-fl.d.twr)/.3,0,1);jx=(Math.random()-.5)*amp;jz=(Math.random()-.5)*amp;shake=amp;}else shake=0;
 rkx=jx;rkz=jz;
 if(mode==='flight'||mode==='ended'||mode==='countdown'){
  const a=fl?fl.y:0;visAlt+=(a-visAlt)*Math.min(1,dt*14);rky=vis(visAlt);
 }else rky=0;
 rocketRoot.position.set(rkx,rky,rkz);
 // flames
 if(rk){
  const live=mode==='flight'&&fl&&(fl.phase==='burn'||fl.phase==='shake')&&!exploded;
  const fk=.85+Math.random()*.3;
  const coreOn=live&&fl.core.prop>0&&(fl.phase==='burn'||Math.random()<.5);
  rk.flame.visible=!!coreOn;if(coreOn){rk.flame.scale.set(fk,fk*(fl.phase==='shake'?.5:1),fk);}
  rk.boosters.forEach((b,i)=>{const fb=fl&&fl.boosters[i];b.flame.visible=!!(live&&fb&&fb.attached&&fb.prop>0&&fl.phase==='burn');if(b.flame.visible)b.flame.scale.set(fk,fk,fk);});
  if(coreOn&&fl.phase==='burn'){for(let n=0;n<3;n++)emit(rkx+(Math.random()-.5)*.4,rky,rkz+(Math.random()-.5)*.4,(Math.random()-.5)*3,-10-Math.random()*8,(Math.random()-.5)*3,.45,1,.62,.2);
   emit(rkx,rky-1,rkz,(Math.random()-.5)*2,-3,(Math.random()-.5)*2,2.4,.34,.34,.4);
   rk.boosters.forEach((b,i)=>{const fb=fl.boosters[i];if(fb&&fb.attached&&fb.prop>0){emit(rkx+b.x,rky,rkz,(Math.random()-.5)*2,-9,(Math.random()-.5)*2,.4,1,.55,.15);emit(rkx+b.x,rky-.5,rkz,0,-2,0,1.8,.32,.32,.36);}});}
 }
 // jettison
 if(fl&&rk&&fl.jett.length){while(fl.jett.length){const b=fl.jett.shift();const i=fl.boosters.indexOf(b);const rb=rk.boosters[i];if(rb&&R){scene.add(rb.g);const sg=Math.sign(rb.x)||1;debris.push({g:rb.g,x:rkx+rb.x,y:rky,z:rkz,vx:sg*3,vy:-2,vz:(Math.random()-.5)*2,rx:(Math.random()-.5)*3,rz:-sg*(1+Math.random()*2),t:0});rb.flame.visible=false;}}}
 updParticles(dt);
 skyFor(visAlt);
 // camera
 let tx=0,ty=3.0,tz=0,dist=cam.dist;
 if(mode==='flight'||mode==='countdown'){tx=rkx;ty=rky+3.2;tz=rkz;}
 else if(mode==='ended'){tx=rkx;ty=rky+3.2;tz=rkz;if(fl&&fl.outcome==='ORBIT'||fl&&fl.outcome==='POWER'){if(cam.user<=0){cam.az+=dt*.12;dist=Math.min(cam.dist+dt*4,60);cam.dist=dist;}}}
 if(mode==='build'&&cam.user<=0&&!RM){cam.az+=dt*.14;}
 if(cam.user>0)cam.user-=dt;
 const sx=shake&&!RM?(Math.random()-.5)*shake:0,sy=shake&&!RM?(Math.random()-.5)*shake:0;
 camera.position.set(tx+dist*Math.sin(cam.pol)*Math.sin(cam.az)+sx,ty+dist*Math.cos(cam.pol)+sy,tz+dist*Math.sin(cam.pol)*Math.cos(cam.az));
 camera.lookAt(tx,ty,tz);
 stars.position.set(camera.position.x,camera.position.y,camera.position.z);
 R.render(scene,camera);
}

/* ---------- build state ---------- */
function setBuild(nb,addedId,msg){hist.push(clone(build));if(hist.length>60)hist.shift();redo.length=0;build=nb;onChange(addedId,msg);}
function onChange(addedId,msg){rebuildRocket(addedId);renderAll();if(msg){logEv(msg,'');announce(msg+'. Thrust to weight '+evalBuild(build).twr.toFixed(2)+'.');}}
function addPart(id){if(mode!=='build'||!canAdd(build,id))return;const nb=clone(build);nb.counts[id]=(nb.counts[id]||0)+1;blip(520+nb.counts[id]*60,.09,'square',.035);setBuild(nb,id,PBY[id].name+' attached to rocket');}
function rmPart(id){if(mode!=='build'||!(build.counts[id]>0))return;const nb=clone(build);nb.counts[id]--;if(!nb.counts[id])delete nb.counts[id];blip(260,.08,'triangle',.04);setBuild(nb,null,PBY[id].name+' removed');}
function setMat(m){if(mode!=='build'||m===build.mat)return;const nb=clone(build);nb.mat=m;blip(420,.1,'sine',.04);setBuild(nb,null,'Structure switched to '+MATS[m].n);}
let crewPending=false;
function setCrew(n){if(mode!=='build'||n===build.crew)return;if(!crewPending){hist.push(clone(build));redo.length=0;crewPending=true;}build.crew=n;renderGauges();renderExamples();}
function loadBuild(b,label){if(mode!=='build')return;hist.push(clone(build));redo.length=0;const f0=build.fuel,l0=build.load;build=clone(b);build.fuel=b.fuel||f0||'liquid';build.load=b.load==null?(l0==null?1:l0):b.load;onChange(null,label);}

/* ---------- UI render ---------- */
function gate(id,ok,label,val,sub,frac,mark,stat){return '<div class="g '+(ok===null?'neutral':ok?'':'bad')+'"><div class="gl">'+label+'</div><div class="gv">'+val+'</div><div class="bar"><i style="width:'+clamp(frac*100,0,100)+'%"></i>'+(mark!=null?'<b style="left:'+mark*100+'%"></b>':'')+'</div><div class="gs"><span class="chip">'+(ok===null?'·':ok?'✓':'✕')+' '+stat+'</span><span>'+sub+'</span></div></div>';}
function renderGauges(){
 const d=evalBuild(build),G=d.gates;let gen=0,draw=0;for(const p of PARTS){const n=count(build,p.id);if(p.power>0)gen+=n*p.power;else draw-=n*p.power;}
 const f=sim(build);const ap=G.twr.pass?f.maxY/1000:0;
 const eff=efficiency(d);
 const rows=[
  gate('twr',G.twr.pass&&G.struct.pass,'Thrust / weight',d.twr.toFixed(2),'min 1.20 · max '+d.limit.toFixed(1),d.twr/3,1.2/3,G.twr.pass?(G.struct.pass?'OK':'TOO HIGH'):'TOO LOW'),
  gate('bud',G.budget.pass,'Budget',money(d.cost),'ceiling '+money(LIM.budget),d.cost/(LIM.budget*1.2),1/1.2,G.budget.pass?'OK':'OVER'),
  gate('mass',G.mass.pass,'Mass',Math.round(d.mass).toLocaleString('en-US')+' kg','limit '+Math.round(LIM.mass).toLocaleString('en-US')+' kg',d.mass/(LIM.mass*1.2),1/1.2,G.mass.pass?'OK':'OVER'),
  gate('pow',G.power.pass,'Net power',(d.power>=0?'+':'')+d.power.toFixed(1)+' kW','gen '+gen.toFixed(1)+' · draw '+draw.toFixed(1),gen>0?draw/gen:1,null,G.power.pass?'SURPLUS':'DEFICIT'),
  gate('days',null,'Build time',d.days.toFixed(1)+' days','crew '+build.crew+' · '+Math.round(d.hours)+' work hours',d.days/60,null,'INFO'),
  gate('apo',G.twr.pass?ap>=TARGET_ALT/1000:false,'Est. apogee',G.twr.pass?ap.toFixed(0)+' km':'crash','target '+(TARGET_ALT/1000)+' km',ap/(TARGET_ALT/1000*1.2),1/1.2,G.twr.pass?(ap>=TARGET_ALT/1000?'ORBIT':'SHORT'):'NO LIFT')
 ];
 $('#gauges').innerHTML=rows.join('')+gate('eff',null,'Efficiency index',String(eff),'$'+Math.round(d.cost/Math.max(1,d.payload)).toLocaleString('en-US')+' per kg payload',eff/100,null,'SCORE');
 const fails=Object.values(G).filter(g=>!g.pass).length+(G.twr.pass&&ap<TARGET_ALT/1000?1:0);
 const lb=$('#launch');lb.textContent=fails?'Launch anyway ('+fails+' failing)':'Launch';
}
const TABS=[['propulsion','Propulsion'],['power','Power'],['payload','Payload']];
function renderTabs(){$('#tabs').innerHTML=TABS.map(t=>'<button role="tab" id="tab-'+t[0]+'" aria-selected="'+(tab===t[0])+'" data-tab="'+t[0]+'">'+t[1]+'</button>').join('');}
function chips(p){const mm=matFor(build,p),F=fxOf(build),pr=p.thrust>0;const m=p.dry*mm.m*(pr?F.dry:1)+p.prop*(pr?F.load:1);let h='<span>'+Math.round(m)+' kg</span><span>'+money(p.cost*mm.c*(pr?F.cost:1))+'</span>';if(p.thrust)h+='<span class="pos">'+(+(p.thrust*F.thrust/1000).toFixed(1))+' kN</span>';if(p.power)h+='<span class="'+(p.power>0?'pos':'neg')+'">'+(p.power>0?'+':'')+p.power+' kW</span>';h+='<span>'+p.hours+' h</span>';return h;}
function renderCatalog(){
 const L=$('#catalog');L.setAttribute('aria-labelledby','tab-'+tab);
 const cats=tab==='propulsion'?['core','propulsion']:[tab];
 L.innerHTML=PARTS.filter(p=>cats.includes(p.cat)).map(p=>{const n=count(build,p.id);const can=canAdd(build,p.id);
  const why=p.booster&&boosterTotal(build)>=2?'Two booster slots are full':(n>=p.max?'Slot full':'');
  return '<div class="card"'+(p.fixed?'':' data-drag="'+p.id+'"')+'><div class="ct">'+(p.fixed?'':'<span class="grip" aria-hidden="true">⋮⋮</span>')+'<b>'+p.name+'</b><span class="cnt">'+(p.fixed?'included':n+' / '+p.max)+'</span></div><div class="chips">'+chips(p)+'</div><div class="act">'+(p.fixed?'<button class="btn" disabled>Required</button>':'<button class="btn" data-rm="'+p.id+'" '+(n?'':'disabled')+' aria-label="Remove one '+p.name+'">−</button><button class="btn pri" data-add="'+p.id+'" '+(can?'':'disabled')+' title="'+why+'" aria-label="Add '+p.name+'">+ Add</button>')+'</div></div>';}).join('');
}
function renderExamples(){$('#examples').innerHTML=Object.keys(EXAMPLES).map(k=>'<button class="btn" data-ex="'+k+'">'+EXAMPLES[k].name+'</button>').join('');$('#undo').disabled=!hist.length||mode!=='build';$('#redo').disabled=!redo.length||mode!=='build';}
function renderAll(){renderGauges();renderTabs();renderCatalog();renderExamples();renderInstalled();syncCfg();}

/* ---------- log & HUD ---------- */
function logEv(s,cls,t){const L=$('#log');const d=document.createElement('div');d.className=cls||'';d.textContent=(t!=null?'T+'+tfmt(t)+'  ':'')+s;L.appendChild(d);while(L.children.length>5)L.removeChild(L.firstChild);if(mode==='build')setTimeout(()=>{if(d.parentNode&&mode==='build')d.remove();},6000);}
function setStatus(s){$('#status').textContent=s;}
function updHUD(){if(!fl)return;const stage=fl.boosters.some(b=>b.attached&&b.prop>0)?'1 · core + boosters':fl.core.prop>0?'2 · core':'coast';
 let p=fl.core.prop;fl.boosters.forEach(b=>{if(b.attached)p+=b.prop;});
 const spd=Math.abs(fl.v);$('#tele').innerHTML='<span>T+</span><div>'+tfmt(fl.t)+'</div><span>Altitude</span><div>'+(fl.y>=1000?(fl.y/1000).toFixed(1)+' km':Math.round(fl.y)+' m')+'</div><span>Velocity</span><div>'+Math.round(spd)+' m/s</div><span>Throttle</span><div>'+(fl.core.prop>0?'100%':'0%')+'</div><span>Stage</span><div>'+stage+'</div><span>Fuel</span><div>'+Math.round(100*p/prop0)+'%</div><span>Max-Q</span><div>'+(fl.q/1000).toFixed(1)+' kPa</div>';}

/* ---------- flight ---------- */
function setLocked(l){document.querySelectorAll('#top button,#parts button,#mission button,#mission input').forEach(b=>{if(b.id==='mute')return;b.disabled=l;});if(!l){renderAll();$('#reset').disabled=false;}}
function launch(){
 if(mode!=='build')return;closeDeb();actx();
 fl=newFlight(build);prop0=fl.core.prop+fl.boosters.reduce((s,b)=>s+b.prop,0);samples=[];lastSample=-1;simAcc=0;paused=false;visAlt=0;exploded=false;
 rebuildRocket();debris.forEach(d=>scene&&scene.remove(d.g));debris.length=0;
 mode='countdown';cdT=3.2;setLocked(true);$('#launch').hidden=true;$('#log').innerHTML='';
 $('#tele').hidden=false;$('#speedRow').hidden=false;renderSpeed();$('#hint').textContent='Drag to orbit · Scroll to zoom';setStatus('Countdown');
 cam.dist=15.5;cam.pol=1.3;announce('Launch sequence started');startRumble();
}
function renderSpeed(){$('#speedRow').innerHTML=[1,6,20,60].map(s=>'<button class="btn" data-speed="'+s+'" aria-pressed="'+(speed===s)+'" style="min-height:32px;padding:5px 10px'+(speed===s?';border-color:var(--thrust)':'')+'">'+s+'×</button>').join('')+'<button class="btn" data-pause="1" style="min-height:32px;padding:5px 10px">'+(paused?'Resume':'Pause')+'</button>';}
function tick(dt){
 if(mode==='countdown'){cdT-=dt;const n=Math.ceil(cdT);const c=$('#count');c.hidden=cdT<=0;if(n>=1)c.textContent=n;if(cdT<=0){c.hidden=true;mode='flight';setStatus('Ascent');ev(fl,'Ignition');flushEv();blip(90,.5,'sawtooth',.06);}return;}
 if(mode!=='flight')return;
 if(!paused){simAcc+=dt*speed;let n=0;while(simAcc>=DT&&n++<400){stepFlight(fl);simAcc-=DT;
  if(fl.t-lastSample>=1){lastSample=fl.t;samples.push({t:fl.t,alt:fl.y/1000,v:fl.v});}
  if(fl.phase==='done'||fl.phase==='crash'||fl.phase==='breakup'){break;}}}
 flushEv();updHUD();
 let th=0;if(fl.phase==='burn'&&fl.thrusting)th=.7;if(fl.phase==='shake')th=.45;setRumble(th);
 if(fl.phase==='crash'||fl.phase==='breakup'){if(!exploded){exploded=true;if(rkGroup)rkGroup.visible=false;explode(rkx,rky,rkz,260);blip(70,.9,'sawtooth',.08);}}
 if(fl.phase==='done'||fl.phase==='crash'||fl.phase==='breakup')endFlight();
}
function flushEv(){if(!fl||!fl.newEvents)return;fl.newEvents.forEach(s=>{const cls=/lost|fail|crash|below/i.test(s)?'bad':/Apogee|Liftoff/.test(s)?'ok':'';logEv(s,cls,fl.t);announce(s);});fl.newEvents.length=0;}
function endFlight(){
 if(mode==='ended')return;mode='ended';samples.push({t:fl.t,alt:fl.y/1000,v:fl.v});stopRumble();$('#speedRow').hidden=true;
 const o=fl.outcome;setStatus(o==='ORBIT'?'Orbit reached':o==='PAD_CRASH'?'Lost on pad':o==='BREAKUP'?'Structural failure':o==='POWER'?'Power failure':'Suborbital');
 if(o==='ORBIT'){blip(660,.2,'sine',.05);setTimeout(()=>blip(880,.3,'sine',.05),180);}
 const wait=o==='ORBIT'||o==='POWER'?2600:1500;
 debTimer=setTimeout(showDeb,wait);
}

/* ---------- debrief ---------- */
function gateText(k,g,d,b){
 const m=MATS[b.mat].n;
 if(k==='twr')return g.pass?'Thrust is '+g.value.toFixed(2)+'× the rocket’s weight. The minimum is 1.20.':'Thrust is only '+g.value.toFixed(2)+'× the rocket’s weight. It must be at least 1.20 to leave the pad.';
 if(k==='budget')return g.pass?'Hardware and crew cost '+money(g.value)+', under the '+money(g.limit)+' ceiling.':'Hardware and crew cost '+money(g.value)+', which is '+money(g.value-g.limit)+' over the '+money(g.limit)+' ceiling.';
 if(k==='mass')return g.pass?'Launch mass is '+Math.round(g.value)+' kg, within the '+Math.round(g.limit).toLocaleString('en-US')+' kg pad limit.':'Launch mass is '+Math.round(g.value)+' kg, which is '+Math.round(g.value-g.limit)+' kg over the pad limit.';
 if(k==='power')return g.pass?'Generation beats consumption by '+g.value.toFixed(1)+' kW.':'Consumption exceeds generation by '+(-g.value).toFixed(1)+' kW. Payloads go dark in orbit.';
 return g.pass?'Liftoff load is '+g.value.toFixed(2)+' g. '+m+' holds up to '+g.limit.toFixed(1)+' g.':'Liftoff load is '+g.value.toFixed(2)+' g but '+m+' only holds '+g.limit.toFixed(1)+' g. The structure breaks at max-Q.';
}
const GN={twr:'Thrust-to-weight',budget:'Budget',mass:'Pad mass',power:'Net power',struct:'Structure'};
function chart(label,unit,key,col){
 const W=320,H=130,l=38,b=20,t=8,r=10;const S=samples;const mt=Math.max(1,S[S.length-1].t);let mv=1;S.forEach(s=>{mv=Math.max(mv,s[key]);});
 const X=v=>l+(W-l-r)*v/mt,Y=v=>H-b-(H-b-t)*Math.max(0,v)/mv;
 const pts=S.map(s=>X(s.t).toFixed(1)+','+Y(s[key]).toFixed(1)).join(' ');const e=S[S.length-1];
 const evs=fl.events.filter(x=>/separation|cutoff/.test(x.s)).map(x=>'<line class="ev" x1="'+X(x.t)+'" x2="'+X(x.t)+'" y1="'+t+'" y2="'+(H-b)+'"/>').join('');
 return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+label+' over time, peak '+mv.toFixed(key==='alt'?0:0)+' '+unit+'"><line class="ax" x1="'+l+'" x2="'+l+'" y1="'+t+'" y2="'+(H-b)+'"/><line class="ax" x1="'+l+'" x2="'+(W-r)+'" y1="'+(H-b)+'" y2="'+(H-b)+'"/>'+evs+'<polyline class="ln" points="'+pts+'"/><circle cx="'+X(e.t)+'" cy="'+Y(e[key])+'" r="3"/><text x="4" y="'+(t+8)+'">'+Math.round(mv)+'</text><text x="4" y="'+(H-b)+'">0</text><text x="'+l+'" y="'+(H-5)+'">0 s</text><text x="'+(W-r)+'" y="'+(H-5)+'" text-anchor="end">'+Math.round(mt)+' s</text><text x="'+(l+6)+'" y="'+(t+8)+'">'+label+' ('+unit+')</text></svg>';
}
function showDeb(){
 const d=fl.d,o=fl.outcome,G=d.gates,eff=efficiency(d);const allOk=d.allPass&&o==='ORBIT';
 let head,cls,sub;
 if(allOk){head='Orbit reached. Payload online.';cls='ok';sub='Mission success';}
 else if(o==='ORBIT'||o==='POWER'){head=o==='POWER'?'Mission lost: power starvation.':'Reached orbit, but the design broke the rules.';cls=o==='POWER'?'bad':'warn';sub=o==='POWER'?'Failed in orbit':'Rule violation';}
 else if(o==='PAD_CRASH'){head='Liftoff failed: not enough thrust.';cls='bad';sub='Lost on the pad';}
 else if(o==='BREAKUP'){head='Structure failed at max-Q.';cls='bad';sub='Lost in flight';}
 else{head='Ran out of delta-v at '+(fl.maxY/1000).toFixed(0)+' km.';cls='bad';sub='Suborbital';}
 const gates=Object.keys(G).map(k=>'<div class="gc'+(G[k].pass?'':' fail')+'"><div class="t"><span>'+GN[k]+'</span><em>'+(G[k].pass?'✓ Pass':'✕ Fail')+'</em></div><div class="v">'+({twr:G[k].value.toFixed(2),budget:money(G[k].value),mass:Math.round(G[k].value)+' kg',power:(G[k].value>=0?'+':'')+G[k].value.toFixed(1)+' kW',struct:G[k].value.toFixed(2)+' g'})[k]+'</div><p>'+gateText(k,G[k],d,build)+'</p></div>').join('');
 const asc=G.twr.pass?'<div class="gc'+(fl.maxY>=TARGET_ALT?'':' fail')+'"><div class="t"><span>Ascent</span><em>'+(fl.maxY>=TARGET_ALT?'✓ Reached '+(TARGET_ALT/1000)+' km':'✕ Short')+'</em></div><div class="v">'+(fl.maxY/1000).toFixed(1)+' km apogee</div><p>'+(fl.maxY>=TARGET_ALT?'Enough delta-v to reach orbital altitude.':'The propellant ran out too early. Cut mass or add thrust and fuel.')+'</p></div>':'';
 const cmp=lastRun?['cost','days','eff'].map(k=>{const dv=({cost:d.cost-lastRun.cost,days:d.days-lastRun.days,eff:eff-lastRun.eff})[k];const good=k==='eff'?dv>0:dv<0;const name={cost:'Cost',days:'Build time',eff:'Efficiency'}[k];const txt=k==='cost'?(dv>=0?'+':'−')+money(Math.abs(dv)):k==='days'?(dv>=0?'+':'−')+Math.abs(dv).toFixed(1)+' d':(dv>=0?'+':'')+dv;return '<span class="d '+(dv===0?'':good?'up':'dn')+'">'+name+' '+txt+'</span>';}).join(''):'<span class="d">First attempt</span>';
 let fixes='';
 if(!allOk){const adv=advise(build);fixes=adv.length?adv.map((a,i)=>'<div class="fix"><div><b>'+a.label+'</b><p>'+(a.fixed.length?'Fixes '+a.fixed.map(x=>x.toLowerCase()).join(', ')+'. ':'')+(a.left.length?'Still failing: '+a.left.map(x=>x.toLowerCase()).join(', ')+'. ':'Clears every check. ')+'New thrust-to-weight '+a.d.twr.toFixed(2)+', cost '+money(a.d.cost)+'.</p></div><button class="btn pri" data-apply="'+i+'">Apply</button></div>').join(''):'<p class="fine">No single change fixes this. Try an example design or reset.</p>';}
 else{const imp=improve(build);fixes=imp.length?imp.map((a,i)=>'<div class="fix"><div><b>'+a.label+'</b><p>Efficiency '+eff+' → '+a.eff+'. Cost '+money(a.d.cost)+', build time '+a.d.days.toFixed(1)+' days.</p></div><button class="btn pri" data-apply="'+i+'">Apply</button></div>').join(''):'<p class="fine">No single swap beats this design. Strong build.</p>';window._imp=imp;}
 window._adv=allOk?window._imp:advise(build);
 lastRun={cost:d.cost,days:d.days,eff:eff};
 const el=$('#deb');
 el.innerHTML='<div class="sheet"><div class="head '+cls+'"><small>'+sub+' · Mission debrief</small><h2 id="debT">'+head+'</h2></div>'
  +'<div class="deltas"><span class="d">Efficiency index '+eff+'</span><span class="d">'+money(d.cost)+'</span><span class="d">'+d.days.toFixed(1)+' days to build</span><span class="d">'+Math.round(d.mass)+' kg</span>'+cmp+'</div>'
  +'<div class="grid2">'+gates+asc+'</div>'
  +(samples.length>2?'<div class="charts">'+chart('Altitude','km','alt')+chart('Velocity','m/s','v')+'</div>':'')
  +'<div><h3 style="font:600 12px var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 8px">'+(allOk?'Make it cheaper, faster or more efficient':'What to change')+'</h3><div class="list">'+fixes+'</div></div>'
  +'<div class="row"><button class="btn pri" data-deb="rebuild">Rebuild this design</button><button class="btn" data-deb="reset">Reset to starter</button><button class="btn" data-deb="replay">Launch again</button></div></div>';
 el.hidden=false;el.scrollTop=0;const f=$('[data-deb=rebuild]',el);if(f)f.focus();announce(head);
}
function closeDeb(){clearTimeout(debTimer);$('#deb').hidden=true;}
function backToBuild(){closeDeb();mode='build';fl=null;exploded=false;visAlt=0;rky=0;if(R){debris.forEach(d=>scene.remove(d.g));debris.length=0;P.life.fill(0);rebuildRocket();rkGroup.visible=true;}
 $('#log').innerHTML='';$('#tele').hidden=true;$('#speedRow').hidden=true;$('#count').hidden=true;$('#launch').hidden=false;$('#hint').textContent='Drag parts onto the rocket · Drag empty space to orbit · L to launch';setStatus('Build');cam.dist=14.5;cam.pol=1.32;cam.user=0;stopRumble();setLocked(false);}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 const t=e.target.closest('button,[data-tab]');if(!t)return;
 if(t.dataset.mtab){const fm=t.closest('.form');if(fm)fm.dataset.tab=t.dataset.mtab;return;}
 if(t.dataset.tab){tab=t.dataset.tab;renderTabs();renderCatalog();return;}
 if(t.dataset.cfg&&t.dataset.val!==undefined)return setCfg(t.dataset.cfg,t.dataset.val);
 if(t.dataset.add)return addPart(t.dataset.add);
 if(t.dataset.rm)return rmPart(t.dataset.rm);
 if(t.dataset.mat)return setMat(t.dataset.mat);
 if(t.dataset.ex){return loadBuild(EXAMPLES[t.dataset.ex],'Loaded example '+EXAMPLES[t.dataset.ex].name);}
 if(t.dataset.speed){speed=+t.dataset.speed;renderSpeed();return;}
 if(t.dataset.pause){paused=!paused;renderSpeed();return;}
 if(t.dataset.apply!==undefined){const a=(window._adv||[])[+t.dataset.apply];if(a){backToBuild();setBuild(clone(a.b),null,a.label);}return;}
 if(t.dataset.deb==='rebuild'){backToBuild();return;}
 if(t.dataset.deb==='reset'){backToBuild();setBuild(clone(START),null,'Reset to starter build');return;}
 if(t.dataset.deb==='replay'){backToBuild();launch();return;}
 if(t.id==='launch')return launch();
 if(t.id==='undo'&&hist.length&&mode==='build'){redo.push(clone(build));build=hist.pop();onChange(null,'Undo');return;}
 if(t.id==='redo'&&redo.length&&mode==='build'){hist.push(clone(build));build=redo.pop();onChange(null,'Redo');return;}
 if(t.id==='reset'&&mode==='build'){setBuild(clone(START),null,'Reset to starter build');return;}
 if(t.id==='mute'){muted=!muted;t.textContent=muted?'Sound off':'Sound on';t.setAttribute('aria-pressed',String(muted));if(muted)stopRumble();return;}
});
document.addEventListener('change',e=>{if(e.target.id==='crew')crewPending=false;});
document.addEventListener('input',e=>{if(e.target.id==='crew'){setCrew(+e.target.value);const d=evalBuild(build);const c=$('#crew');if(c){const ch=c.parentNode.querySelector('.chips');if(ch)ch.innerHTML='<span>'+d.days.toFixed(1)+' days</span><span>'+money(Math.max(0,(build.crew-4)*30000))+' extra</span><span>'+Math.round(d.hours)+' work hours</span>';const ct=c.parentNode.querySelector('.cnt');if(ct)ct.textContent=build.crew+' people';}}});
document.addEventListener('keydown',e=>{if(e.target.matches&&e.target.matches('input,textarea,select'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(!$('#intro').classList.contains('gone')){if(['enter',' ','escape'].includes(e.key.toLowerCase())){e.preventDefault();introNext();}return;}
 const k=e.key.toLowerCase();
 if(k==='escape'&&!$('#deb').hidden){backToBuild();return;}
 if(!$('#deb').hidden)return;
 if(k==='l'&&mode==='build'){launch();}
 else if(k==='r'&&mode==='build'){setBuild(clone(START),null,'Reset to starter build');}
 else if(k==='z'&&mode==='build'){if(e.shiftKey){$('#redo').click();}else{$('#undo').click();}}
});

/* ---------- mission data: budget, mass, altitude, propellant, material, crew ---------- */
const cfg={name:'Aurora-1',budget:1000000,mass:5000,alt:100};
const FIELDS=[['budget','Total budget',250000,3000000,25000],['mass','Launch mass limit',2000,12000,250],['alt','Target altitude',50,400,10],['crew','Assembly crew',4,10,1],['load','Propellant load',60,100,5]];
function fmtOut(k,v){return k==='budget'?money(v):k==='mass'?Math.round(v).toLocaleString('en-US')+' kg':k==='alt'?v+' km':k==='crew'?v+' people':v+' %';}
function cfgVal(k){return k==='name'?cfg.name:(k==='budget'||k==='mass'||k==='alt')?cfg[k]:k==='crew'?build.crew:k==='load'?Math.round((build.load==null?1:build.load)*100):k==='fuel'?(build.fuel||'liquid'):build.mat;}
const MT=[['req','Requirements'],['fuel','Propellant'],['mat','Materials']];
function rng(k){const f=FIELDS.find(x=>x[0]===k);return '<label class="fld"><span>'+f[1]+'<output data-out="'+k+'"></output></span><input type="range" data-cfg="'+k+'" min="'+f[2]+'" max="'+f[3]+'" step="'+f[4]+'"></label>';}
function formHTML(inst){
 const tabs=MT.concat(inst?[['rkt','On rocket']]:[]);
 let h='<div class="tabs mt" role="tablist">'+tabs.map(t=>'<button type="button" role="tab" data-mtab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
 h+='<div class="pane" data-pane="req"><label class="fld"><span>Mission name</span><input type="text" maxlength="28" data-cfg="name" autocomplete="off"></label>'+['budget','mass','alt','crew'].map(rng).join('')+'</div>';
 h+='<div class="pane" data-pane="fuel"><div class="fld wide"><span>Propellant type</span><div class="opts">'+Object.keys(FUELS).map(k=>'<button type="button" class="opt" data-cfg="fuel" data-val="'+k+'" aria-pressed="false"><b>'+FUELS[k].n+'</b><small>'+FUELS[k].sub+'</small><small class="st">Isp ×'+FUELS[k].isp+' · cost ×'+FUELS[k].cost+' · thrust ×'+FUELS[k].thrust+'</small></button>').join('')+'</div></div>'+rng('load')+'</div>';
 h+='<div class="pane" data-pane="mat"><div class="fld wide"><span>Structure material</span><div class="opts">'+Object.keys(MATS).map(k=>'<button type="button" class="opt" data-cfg="mat" data-val="'+k+'" aria-pressed="false"><b>'+MATS[k].n+'</b><small>'+MATS[k].note+'</small><small class="st">mass ×'+MATS[k].m+' · cost ×'+MATS[k].c+' · '+(3*MATS[k].s).toFixed(1)+' g</small></button>').join('')+'</div></div></div>';
 if(inst)h+='<div class="pane" data-pane="rkt"><div class="list" id="installed"></div><p class="fine">Drag a part back to the parts bay to remove it.</p></div>';
 return h;}
function buildForms(){$('#setupForm').innerHTML=formHTML(false);$('#missionForm').innerHTML=formHTML(true);$('#setupForm').dataset.tab='req';$('#missionForm').dataset.tab='req';}
function syncCfg(){
 document.querySelectorAll('[data-cfg]').forEach(el=>{const k=el.dataset.cfg;
  if(el.classList.contains('opt')){const on=cfgVal(k)===el.dataset.val;el.classList.toggle('sel',on);el.setAttribute('aria-pressed',String(on));}
  else if(document.activeElement!==el){el.value=cfgVal(k);}});
 document.querySelectorAll('[data-out]').forEach(o=>{o.textContent=fmtOut(o.dataset.out,cfgVal(o.dataset.out));});}
function applyCfg(){LIM.budget=cfg.budget;LIM.mass=cfg.mass;TARGET_ALT=cfg.alt*1000;cache.clear();
 const s=(i,t)=>{const e=$('#'+i);if(e)e.textContent=t;};s('sAlt',cfg.alt);s('sBud',(cfg.budget/1e6).toFixed(2));s('sMass',Math.round(cfg.mass).toLocaleString('en-US'));s('mname',cfg.name||'Unnamed mission');}
let pend=false;
function setCfg(k,v){
 if(k==='name'){cfg.name=String(v).slice(0,28);s0('mname',cfg.name||'Unnamed mission');return syncCfg();}
 if(mode!=='build')return;
 if(k==='budget'||k==='mass'||k==='alt'){cfg[k]=+v;applyCfg();renderGauges();syncCfg();return;}
 if(k==='fuel'){if(v===(build.fuel||'liquid'))return;const nb=clone(build);nb.fuel=v;blip(300,.1,'sine',.04);setBuild(nb,null,'Propellant switched to '+FUELS[v].n);return;}
 if(k==='mat')return setMat(v);
 if(!pend){hist.push(clone(build));redo.length=0;pend=true;}
 if(k==='crew')build.crew=+v; if(k==='load')build.load=+v/100;
 renderGauges();renderCatalog();renderExamples();syncCfg();}
function s0(i,t){const e=$('#'+i);if(e)e.textContent=t;}
document.addEventListener('input',e=>{const el=e.target;if(el.dataset&&el.dataset.cfg&&!el.classList.contains('opt'))setCfg(el.dataset.cfg,el.value);});
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.cfg)pend=false;});
function renderInstalled(){
 $('#installed').innerHTML=PARTS.filter(p=>count(build,p.id)>0).map(p=>{const n=count(build,p.id);
  return '<div class="inst'+(p.fixed?' lock':'')+'"'+(p.fixed?'':' data-drag-rm="'+p.id+'"')+'>'+(p.fixed?'<span class="grip">·</span>':'<span class="grip" aria-hidden="true">⋮⋮</span>')+'<b>'+p.name+'</b><span class="cnt">×'+n+'</span>'+(p.fixed?'':'<button class="btn" data-rm="'+p.id+'" aria-label="Remove one '+p.name+'">×</button>')+'</div>';}).join('');}

/* ---------- drag and drop (pointer events: mouse, pen and touch) ---------- */
let dg=null;
function hit(e,sel){const r=$(sel).getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;}
document.addEventListener('pointerdown',e=>{
 if(mode!=='build'||(e.pointerType==='mouse'&&e.button!==0))return;
 if(e.target.closest('button,input,label,select'))return;
 const src=e.target.closest('[data-drag],[data-drag-rm]');if(!src)return;
 if(e.pointerType!=='mouse'&&!e.target.closest('.grip'))return;
 dg={id:src.dataset.drag||src.dataset.dragRm,rm:!!src.dataset.dragRm,x:e.clientX,y:e.clientY,on:false,pid:e.pointerId,el:null};});
document.addEventListener('pointermove',e=>{if(!dg||e.pointerId!==dg.pid)return;
 if(!dg.on){if(Math.hypot(e.clientX-dg.x,e.clientY-dg.y)<6)return;dg.on=true;const g=document.createElement('div');g.className='ghost';g.textContent=(dg.rm?'Remove ':'+ ')+PBY[dg.id].name;document.body.appendChild(g);dg.el=g;document.body.classList.add(dg.rm?'drag-rm':'drag-add');}
 dg.el.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)';
 const t=dg.rm?'#parts':'#stage';$(t).classList.toggle('over',hit(e,t));e.preventDefault();},{passive:false});
function endDrag(e,drop){if(!dg)return;const d=dg;dg=null;if(d.el)d.el.remove();document.body.classList.remove('drag-add','drag-rm');$('#stage').classList.remove('over');$('#parts').classList.remove('over');
 if(!drop||!d.on)return;
 if(!d.rm&&hit(e,'#stage')){if(canAdd(build,d.id))addPart(d.id);else logEv(PBY[d.id].name+': no free slot','warn');}
 else if(d.rm&&hit(e,'#parts'))rmPart(d.id);}
document.addEventListener('pointerup',e=>{if(dg&&e.pointerId===dg.pid)endDrag(e,true);});
document.addEventListener('pointercancel',e=>{if(dg&&e.pointerId===dg.pid)endDrag(e,false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dg)endDrag(e,false);});
if(window.ResizeObserver){new ResizeObserver(()=>{$('#stage').style.setProperty('--gh',$('#gstrip').offsetHeight+'px');}).observe($('#gstrip'));}

/* ---------- intro: hero, then mission brief ---------- */
function introNext(){const i=$('#intro');if(!i.classList.contains('step2')){i.classList.add('step2');i.scrollTop=0;const f=$('#setupForm input');if(f)f.focus({preventScroll:true});}else closeIntro();}
function closeIntro(){const i=$('#intro');i.classList.add('gone');setTimeout(()=>{i.hidden=true;},800);cam.user=0;actx();const l=$('#launch');if(l)l.focus({preventScroll:true});}
$('#begin').addEventListener('click',introNext);$('#enter').addEventListener('click',closeIntro);
setTimeout(()=>{const b=$('#begin');if(b)b.focus({preventScroll:true});},50);

/* ---------- main loop ---------- */
let last=performance.now();
function loop(now){const dt=Math.min(.1,(now-last)/1000);last=now;try{tick(dt);if(R)frame3D(dt);}catch(err){console.error(err);}requestAnimationFrame(loop);}
init3D();buildForms();applyCfg();renderAll();logEv('Starter build loaded. Add parts, then launch.','');
window.__ng={get mode(){return mode;},get fl(){return fl;},launch,get build(){return build;}};
requestAnimationFrame(loop);
})();
