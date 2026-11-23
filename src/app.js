(function(){
'use strict';
const $=(s,r)=>(r||document).querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const money=v=>v>=1e6?'$'+(v/1e6).toFixed(2)+'M':'$'+Math.round(v/1e3)+'k';
const tfmt=t=>{t=Math.max(0,t|0);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const START={counts:{camera:1,'solar-wing':1},mat:'al-standard',crew:4,world:'earth',budget:DEFAULT_BUDGET,comp:Object.assign({},DEF_COMP)};
let view='hero';
const fresh=()=>{const n=clone(START);n.world=build.world;n.budget=build.budget;n.comp=Object.assign({},build.comp);return n;};
let build=clone(START), hist=[], redo=[], tab='propulsion', lastRun=null;
let mode='build', fl=null, simAcc=0, speed=1, paused=false, cdT=0, visAlt=0, samples=[], lastSample=0, debTimer=null, prop0=1;
const cache=new Map();
function key(b){return JSON.stringify([Object.keys(b.counts).sort().map(k=>[k,b.counts[k]]),b.mat,b.crew,b.world||'earth',b.budget,b.mat==='custom'?b.comp:0]);}
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
const cam={az:.7,pol:1.32,dist:17,tx:0,ty:3.2,tz:0,user:0,dragging:false};
const tweens=[],debris=[];let coreDone=false,fairDone=false,deployT=-1,banT=null;
function shed(g,x,y,z,vx,vy,vz,rx,rz){scene.add(g);debris.push({g:g,x:x,y:y,z:z,vx:vx,vy:vy,vz:vz,rx:rx,rz:rz,t:0});}
function banner(t){const b=$('#banner');b.textContent=t;b.hidden=false;b.classList.remove('show');void b.offsetWidth;b.classList.add('show');clearTimeout(banT);banT=setTimeout(()=>{b.hidden=true;},3200);}
const NP=800,P={pos:new Float32Array(NP*3),col:new Float32Array(NP*3),vel:new Float32Array(NP*3),base:new Float32Array(NP*3),life:new Float32Array(NP),max:new Float32Array(NP),i:0};
let rkx=0,rky=0,rkz=0,exploded=false,shake=0,geoP=null;
const MATCOL={'al-standard':0xc9d3e0,'al-lithium':0x9fe3d6,'steel':0xeef1f4,'titanium':0x6d7686,'cfrp':0x20262e,'printed':0xd9985f,'reclaimed':0xa9a47c};
function M(color,o){return new THREE.MeshStandardMaterial(Object.assign({color:color,roughness:.5,metalness:.35},o||{}));}
function panelTex(){const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.fillStyle='#0c2a58';x.fillRect(0,0,128,256);x.strokeStyle='#5f8fd0';x.lineWidth=2;for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*32,0);x.lineTo(i*32,256);x.stroke();}for(let j=0;j<=8;j++){x.beginPath();x.moveTo(0,j*32);x.lineTo(128,j*32);x.stroke();}return new THREE.CanvasTexture(c);}
let _ptex=null;
function mesh(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);return m;}
function flameMesh(r,h){const g=new THREE.Group();const o=new THREE.Mesh(new THREE.ConeGeometry(r,h,16),new THREE.MeshBasicMaterial({color:0xff8a3d,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));o.rotation.x=Math.PI;o.position.y=-h/2;const i=new THREE.Mesh(new THREE.ConeGeometry(r*.5,h*.6,16),new THREE.MeshBasicMaterial({color:0xfff2c8,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));i.rotation.x=Math.PI;i.position.y=-h*.3;g.add(o);g.add(i);g.visible=false;return g;}
function lathe(pts,seg){return new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),seg||40);}
function ogive(r,h,n){const a=[];for(let i=0;i<=n;i++){const t=i/n;a.push([Math.max(.002,r*Math.pow(1-Math.pow(t,1.7),.62)),t*h]);}return a;}
function bellPts(r0,r1,h){return [[r1,0],[r1*.74,h*.42],[r0*1.12,h*.86],[r0,h]];}
function decalTex(){const c=document.createElement('canvas');c.width=128;c.height=512;const x=c.getContext('2d');x.clearRect(0,0,128,512);x.save();x.translate(64,256);x.rotate(-Math.PI/2);x.fillStyle='#10151f';x.font='800 64px Inter, Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('NITRO GRAVITY',0,0);x.restore();x.fillStyle='#ff8a3d';x.fillRect(8,20,6,472);x.fillRect(114,20,6,472);return new THREE.CanvasTexture(c);}

function panelTex(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='#f2f2f2';x.fillRect(0,0,512,512);
 for(let i=0;i<8;i++){const sh=232+((i*37)%18);x.fillStyle='rgb('+sh+','+sh+','+sh+')';x.fillRect(0,i*64+2,512,60);}
 x.fillStyle='rgba(0,0,0,.28)';for(let i=0;i<=8;i++)x.fillRect(0,i*64,512,2);for(let i=0;i<4;i++)x.fillRect(i*128+((i%2)*40),0,2,512);
 x.fillStyle='rgba(0,0,0,.22)';for(let i=0;i<8;i++)for(let j=0;j<32;j++){x.fillRect(j*16+4,i*64+6,2,2);x.fillRect(j*16+4,i*64+54,2,2);}
 for(let n=0;n<1400;n++){x.fillStyle='rgba(0,0,0,'+(Math.random()*.05)+')';x.fillRect(Math.random()*512,Math.random()*512,2+Math.random()*10,1);}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,2);try{t.anisotropy=4;}catch(e){}return t;}
function boosterTex(){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');x.fillStyle='#f4f4f4';x.fillRect(0,0,256,512);
 x.fillStyle='rgba(0,0,0,.25)';for(let i=0;i<=8;i++)x.fillRect(0,i*64,256,2);
 x.fillStyle='#e8741c';x.fillRect(0,40,256,22);x.fillRect(0,450,256,14);
 x.save();x.translate(128,260);x.rotate(-Math.PI/2);x.fillStyle='#14171d';x.font='800 64px Inter,Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('NITRO',0,0);x.restore();
 const t=new THREE.CanvasTexture(c);try{t.anisotropy=4;}catch(e){}return t;}
function buildRocket(b){
 const g=new THREE.Group();const o={group:g,parts:{},boosters:[],flame:null};
 const metalness=b.mat==='cfrp'?.15:.7,rough=b.mat==='cfrp'?.32:.38;
 const sm=M(MATCOL[b.mat]||0xc9d3e0,{metalness:metalness,roughness:rough});
 if(!PT)PT=panelTex();sm.map=PT;sm.needsUpdate=true;if(!BT)BT=boosterTex();const bwhite=M(0xffffff,{metalness:.2,roughness:.38,map:BT});
 const dark=M(0x1d222c,{metalness:.7,roughness:.4}),accent=M(0xff8a3d,{metalness:.3,roughness:.45}),white=M(0xf4f6fa,{metalness:.25,roughness:.35}),gold=M(0xb8933f,{metalness:.9,roughness:.3});
 const bellM=M(0x3a3f4a,{metalness:.9,roughness:.35,side:THREE.DoubleSide});
 const tag=(id,grp)=>{(o.parts[id]=o.parts[id]||[]).push(grp);g.add(grp);return grp;};
 const core=tag('core-stage',new THREE.Group());
 core.add(mesh(lathe([[.56,2.2],[.56,4.4],[.52,5.1]],48),sm,0,0,0));
 for(let i=3;i<8;i++){const t=mesh(new THREE.TorusGeometry(.562,.008,6,48),dark,0,1.15+i*.5,0);t.rotation.x=Math.PI/2;core.add(t);}
 {const t=mesh(new THREE.TorusGeometry(.568,.03,8,48),accent,0,4.55,0);t.rotation.x=Math.PI/2;core.add(t);}
 core.add(mesh(new THREE.CylinderGeometry(.56,.56,.32,48),dark,0,4.78,0));
 const dec=new THREE.Mesh(new THREE.CylinderGeometry(.567,.567,3.0,32,1,true,-.6,1.2),new THREE.MeshBasicMaterial({map:decalTex(),transparent:true,depthWrite:false}));dec.position.y=2.75;core.add(dec);
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;const f=mesh(new THREE.BoxGeometry(.34,.03,.26),dark,Math.cos(a)*.7,4.5,Math.sin(a)*.7);f.rotation.y=-a;core.add(f);}
 const low=new THREE.Group();core.add(low);o.low=low;
 low.add(mesh(lathe([[.5,.7],[.55,1.1],[.56,2.2]],48),sm,0,0,0));
 for(let i=0;i<3;i++){const t=mesh(new THREE.TorusGeometry(.562,.008,6,48),dark,0,1.15+i*.5,0);t.rotation.x=Math.PI/2;low.add(t);}
 {const t=mesh(new THREE.TorusGeometry(.568,.03,8,48),accent,0,1.4,0);t.rotation.x=Math.PI/2;low.add(t);}
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3+Math.PI/6;low.add(mesh(new THREE.CylinderGeometry(.19,.19,.05,16),dark,Math.cos(a)*.26,.7,Math.sin(a)*.26));low.add(mesh(lathe(bellPts(.07,.17,.55),20),bellM,Math.cos(a)*.26,.15,Math.sin(a)*.26));}
 low.add(mesh(lathe(bellPts(.08,.19,.6),20),bellM,0,.1,0));
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3+Math.PI/6;const f=mesh(new THREE.BoxGeometry(.05,.95,.55),sm,Math.cos(a)*.78,1.0,Math.sin(a)*.78);f.rotation.y=-a;low.add(f);}
 const fp=ogive(.6,2.3,16).map(p=>new THREE.Vector2(p[0],p[1])),fm=M(0xffffff,{metalness:.2,roughness:.4,side:THREE.DoubleSide});
 o.fair=[];[0,Math.PI].forEach((ph,i)=>{const w=new THREE.Group();w.position.y=6.1;w.add(mesh(new THREE.LatheGeometry(fp,24,ph,Math.PI),fm,0,-1.1,0));g.add(w);o.fair.push({g:w,s:i?-1:1});});
 const cap=tag('capsule',new THREE.Group());
 cap.add(mesh(lathe(ogive(.52,1.95,16),40),white,0,5.1,0));
 const wr=mesh(new THREE.TorusGeometry(.52,.02,6,40),dark,0,5.12,0);wr.rotation.x=Math.PI/2;cap.add(wr);
 cap.add(mesh(new THREE.SphereGeometry(.11,16,12),new THREE.MeshBasicMaterial({color:0x58d0f5}),0,5.5,.47));
 cap.add(mesh(new THREE.CylinderGeometry(.012,.012,.45,6),dark,0,7.2,0));
 const nb=(b.counts['booster-side']||0),nh=(b.counts['booster-heavy']||0);
 const list=[];for(let i=0;i<nb;i++)list.push(false);for(let i=0;i<nh;i++)list.push(true);
 list.forEach((heavy,i)=>{
  const x=(i%2===0?-1:1)*(heavy?1.05:.95),r=heavy?.38:.27,h=heavy?3.8:3.2;
  const bg=new THREE.Group();bg.position.set(x,0,0);
  bg.add(mesh(new THREE.CylinderGeometry(r,r,h,32),bwhite,0,h/2+.4,0));
  bg.add(mesh(lathe(ogive(r,heavy?1.1:.95,12),32),accent,0,h+.4,0));
  bg.add(mesh(lathe(bellPts(r*.3,r*.62,.5),20),bellM,0,.05,0));
  [.9,h-.5].forEach(y=>{const t=mesh(new THREE.TorusGeometry(r+.004,.018,6,32),white,0,y,0);t.rotation.x=Math.PI/2;bg.add(t);});
  [1.2,h-.2].forEach(y=>bg.add(mesh(new THREE.BoxGeometry(.5,.07,.07),dark,-Math.sign(x)*.4,y,0)));
  const fl=flameMesh(r*.9,2.2);fl.position.y=0;bg.add(fl);
  tag(heavy?'booster-heavy':'booster-side',bg);o.boosters.push({g:bg,x:x,flame:fl});
 });
 const ns=b.counts['solar-wing']||0;
 for(let j=0;j<ns;j++){const s=j===0?1:-1;const w=new THREE.Group();w.add(mesh(new THREE.CylinderGeometry(.05,.05,.55,10),dark,0,3.3,s*.82)).rotation.x=Math.PI/2;
  if(!_ptex){_ptex=panelTex();_ptex.encoding=THREE.sRGBEncoding;}
  for(let i=0;i<3;i++){const zc=s*(1.45+i*.7);w.add(mesh(new THREE.BoxGeometry(1.06,.03,.66),gold,0,3.29,zc));w.add(mesh(new THREE.BoxGeometry(.98,.04,.58),new THREE.MeshStandardMaterial({map:_ptex,roughness:.25,metalness:.7,emissive:0x061a33}),0,3.31,zc));}
  tag('solar-wing',w);}
 if(b.counts.rtg){const w=new THREE.Group();w.add(mesh(new THREE.CylinderGeometry(.14,.14,1.0,20),gold,.42,1.7,.42));for(let i=0;i<5;i++)w.add(mesh(new THREE.CylinderGeometry(.22,.22,.03,20),dark,.42,1.3+i*.2,.42));w.add(mesh(new THREE.CylinderGeometry(.04,.04,.4,8),dark,.3,1.7,.3));tag('rtg',w);}
 const ok=(evalBuild(b).power>0);
 const led=()=>new THREE.MeshBasicMaterial({color:ok?0x5ee6a8:0x553a3a});
 if(b.counts.camera){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.28,.28,.28),dark,-.46,4.3,.46));const l=mesh(new THREE.CylinderGeometry(.1,.12,.2,20),M(0x0c0d10),-.57,4.3,.57);l.rotation.z=Math.PI/2;l.rotation.y=Math.PI/4;w.add(l);w.add(mesh(new THREE.SphereGeometry(.07,12,10),new THREE.MeshBasicMaterial({color:0x58d0f5}),-.63,4.3,.63));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.4,4.48,.5));tag('camera',w);}
 if(b.counts.spectrometer){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.3,.55,.3),M(0x3d6fa8,{metalness:.5}),.46,3.85,.46));w.add(mesh(new THREE.CylinderGeometry(.05,.05,.35,10),dark,.62,3.85,.62));w.add(mesh(new THREE.CylinderGeometry(.008,.008,.7,6),dark,.4,4.45,.4));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),.46,4.17,.46));tag('spectrometer',w);}
 if(b.counts.radar){const w=new THREE.Group();const pts=[];for(let i=0;i<=8;i++){const r=i*.055;pts.push([Math.max(.002,r),r*r*1.9]);}const d=mesh(lathe(pts,28),M(0xdfe3ea,{metalness:.6,roughness:.3,side:THREE.DoubleSide}),-.62,3.6,-.62);d.rotation.z=Math.PI/2;d.rotation.y=Math.PI/4;w.add(d);w.add(mesh(new THREE.CylinderGeometry(.03,.03,.34,8),dark,-.5,3.6,-.5));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.42,3.95,-.42));tag('radar',w);}
 o.flame=flameMesh(.5,4);o.flame.position.y=.1;g.add(o.flame);
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
const LOOK={earth:{sky:[104,160,222],gnd:[62,104,46],orb:[34,96,170],atm:0x58d0f5,pad:0x70747d,sun:0xfff0dc,star:.3},moon:{sky:[3,4,8],gnd:[78,78,86],orb:[135,135,145],atm:null,pad:0x4a4b55,sun:0xffffff,star:1},mars:{sky:[104,58,36],gnd:[92,42,24],orb:[172,80,46],atm:0xff8a3d,pad:0x4d2719,sun:0xffd9b0,star:.25}};
let PT=null,BT=null,camD=0,camP=0,padArms=[],padTower=null,gndMesh=null,padMesh=null,earthBall=null,sunSprite=null,exLight=null,curWorld='earth';
function glowTex(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const gr=x.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
function glow(color,size,x,y,z,tex){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));s.scale.set(size,size,1);s.position.set(x,y,z);return s;}
function applyWorld(w){curWorld=w;if(!R)return;const L=LOOK[w];gndMesh.material.color.setRGB(L.gnd[0]/255,L.gnd[1]/255,L.gnd[2]/255);padMesh.material.color.setHex(L.pad);sunSprite.material.color.setHex(L.sun);sunL.color.setHex(L.sun);earthBall.visible=(w==='moon');atmo.material.color.setHex(L.atm||0x58d0f5);}
const dark0=()=>M(0x14171d,{metalness:.5,roughness:.6});
function init3D(){
 try{R=new THREE.WebGLRenderer({canvas:cv,antialias:true});}catch(e){R=null;$('#nogl').hidden=false;return;}
 R.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 try{R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.1;}catch(e){}
 scene=new THREE.Scene();scene.background=new THREE.Color(0x68a0de);
 camera=new THREE.PerspectiveCamera(40,1,.1,300000);
 try{const pm=new THREE.PMREMGenerator(R);const es=new THREE.Scene();const c=document.createElement('canvas');c.width=4;c.height=256;const x=c.getContext('2d');const gr=x.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#a9c3f0');gr.addColorStop(.48,'#2b3556');gr.addColorStop(.5,'#0b0e16');gr.addColorStop(1,'#1d2331');x.fillStyle=gr;x.fillRect(0,0,4,256);es.add(new THREE.Mesh(new THREE.SphereGeometry(10,32,16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.BackSide})));const lt=new THREE.Mesh(new THREE.PlaneGeometry(7,3),new THREE.MeshBasicMaterial({color:0xfff4e0}));lt.position.set(-5,4,4);lt.lookAt(0,0,0);es.add(lt);scene.environment=pm.fromScene(es,.04).texture;}catch(e){}
 scene.add(new THREE.HemisphereLight(0x9bbcff,0x1b1d2b,.4));
 sunL=new THREE.DirectionalLight(0xfff0dc,1.2);sunL.position.set(-30,40,25);scene.add(sunL);
 const rim=new THREE.DirectionalLight(0x58d0f5,.6);rim.position.set(30,12,-30);scene.add(rim);
 exLight=new THREE.PointLight(0xff8a3d,0,70,2);scene.add(exLight);
 const warm=new THREE.DirectionalLight(0xff9a6b,.55);warm.position.set(40,6,-25);scene.add(warm);
 const gc=document.createElement('canvas');gc.width=gc.height=256;{const x=gc.getContext('2d');x.fillStyle='#e6e6e6';x.fillRect(0,0,256,256);for(let n=0;n<5000;n++){const v=170+Math.random()*85|0;x.fillStyle='rgb('+v+','+v+','+v+')';x.fillRect(Math.random()*256,Math.random()*256,1+Math.random()*3,1+Math.random()*3);}}
 const gtx=new THREE.CanvasTexture(gc);gtx.wrapS=gtx.wrapT=THREE.RepeatWrapping;gtx.repeat.set(28,28);
 gndMesh=new THREE.Mesh(new THREE.CircleGeometry(150,64),new THREE.MeshStandardMaterial({color:0x3e682e,map:gtx,roughness:.98,metalness:0}));gndMesh.rotation.x=-Math.PI/2;gndMesh.position.y=.02;scene.add(gndMesh);
 const grid=new THREE.GridHelper(140,70,0x2f5a93,0x172a45);grid.position.y=.05;grid.material.transparent=true;grid.material.opacity=.3;grid.visible=false;scene.add(grid);
 padMesh=new THREE.Mesh(new THREE.CircleGeometry(5.4,64),new THREE.MeshStandardMaterial({color:0x172236,roughness:.6,metalness:.4}));padMesh.rotation.x=-Math.PI/2;padMesh.position.y=.06;scene.add(padMesh);
 const ring=new THREE.Mesh(new THREE.RingGeometry(3.5,3.8,64),new THREE.MeshBasicMaterial({color:0xff8a3d,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;scene.add(ring);
 const tm=new THREE.MeshStandardMaterial({color:0x56637a,metalness:.7,roughness:.45});
 const conc=M(0x70747d,{roughness:.95,metalness:.05}),orng=M(0xe8741c,{roughness:.5,metalness:.3}),wht=M(0xe9edf3,{roughness:.6,metalness:.1}),steel=M(0x8a93a3,{roughness:.5,metalness:.6});
 // concrete apron and flame trench
 scene.add(mesh(new THREE.BoxGeometry(30,.1,26),conc,2,.03,2));
 scene.add(mesh(new THREE.BoxGeometry(1.8,.12,12),M(0x0a0b0e,{roughness:1}),0,.1,6.5));
 [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]].forEach(p=>scene.add(mesh(new THREE.CylinderGeometry(.14,.18,.35,12),steel,p[0],.2,p[1])));
 // service tower with crane and swing arms
 const tw=new THREE.Group();padArms=[];
 [[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]].forEach(p=>tw.add(mesh(new THREE.BoxGeometry(.16,21,.16),tm,p[0],10.5,p[1])));
 for(let y=1;y<21;y+=1.4){[[0,.7,.6],[0,-.7,-.6],[.7,0,0],[-.7,0,0]].forEach((s,k)=>{const d=mesh(new THREE.BoxGeometry(k<2?1.5:.05,.05,k<2?.05:1.5),tm,s[0],y,s[1]);if(k<2)d.rotation.z=s[2];else d.rotation.x=.6;tw.add(d);});}
 tw.add(mesh(new THREE.BoxGeometry(1.7,.35,1.7),steel,0,21.1,0));
 tw.add(mesh(new THREE.BoxGeometry(5.5,.4,.7),orng,1.2,22,0));tw.add(mesh(new THREE.BoxGeometry(.7,1.1,.9),orng,-1.2,21.6,0));tw.add(mesh(new THREE.CylinderGeometry(.02,.02,2,6),dark0(),3.6,21,0));
 [3.5,7,10.5,14,17.5].forEach((y,n)=>{const arm=new THREE.Group();arm.position.set(0,y,0);
  arm.add(mesh(new THREE.BoxGeometry(3.4,.16,.9),n%2?orng:steel,1.9,0,0));
  arm.add(mesh(new THREE.BoxGeometry(3.4,.5,.04),tm,1.9,.3,.44));arm.add(mesh(new THREE.BoxGeometry(3.4,.5,.04),tm,1.9,.3,-.44));
  arm.add(mesh(new THREE.BoxGeometry(.4,.6,.7),wht,3.5,.1,0));
  tw.add(arm);padArms.push({g:arm,k:n%2?1:-1,d:n*.18});});
 tw.position.set(-3.4,0,0);scene.add(tw);padTower=tw;
 // water tower, hangar, tank farm
 {const wt=new THREE.Group();[[-.8,-.8],[.8,-.8],[-.8,.8],[.8,.8]].forEach(p=>wt.add(mesh(new THREE.CylinderGeometry(.07,.07,7,6),wht,p[0],3.5,p[1])));wt.add(mesh(new THREE.SphereGeometry(1.7,20,14),wht,0,8.2,0));wt.add(mesh(new THREE.CylinderGeometry(.5,.5,.6,12),wht,0,6.8,0));wt.position.set(17,0,-16);scene.add(wt);}
 {const hg=new THREE.Group();hg.add(mesh(new THREE.BoxGeometry(16,7,8),M(0xd8dde6,{roughness:.7,metalness:.2}),0,3.5,0));hg.add(mesh(new THREE.BoxGeometry(16.1,.5,8.1),M(0x2d5da8,{roughness:.6}),0,6.6,0));hg.add(mesh(new THREE.BoxGeometry(6,4.6,.1),dark0(),0,2.3,4.05));hg.position.set(-20,0,-17);scene.add(hg);}
 {const tr=M(0x2f5a2a,{roughness:1}),tk=M(0x5a4126,{roughness:1});for(let n=0;n<46;n++){const an=n*2.399,rr=34+(n*7%38);const x=Math.cos(an)*rr,z=Math.sin(an)*rr,s=.8+(n%5)*.25;const t=new THREE.Group();t.add(mesh(new THREE.CylinderGeometry(.12*s,.16*s,1.4*s,6),tk,0,.7*s,0));t.add(mesh(new THREE.ConeGeometry(1.1*s,3.2*s,8),tr,0,2.6*s,0));t.position.set(x,0,z);scene.add(t);}}
 scene.add(mesh(new THREE.BoxGeometry(4,.05,80),M(0x8a7a63,{roughness:1}),12,.05,10));
 [[20,9],[22.5,9],[21.2,12]].forEach(p=>{scene.add(mesh(new THREE.CylinderGeometry(1.2,1.2,5,20),wht,p[0],2.5,p[1]));scene.add(mesh(new THREE.SphereGeometry(1.2,16,8,0,Math.PI*2,0,Math.PI/2),wht,p[0],5,p[1]));});
 const gt=glowTex();
 [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(p=>{scene.add(mesh(new THREE.CylinderGeometry(.08,.08,6,8),tm,p[0],3,p[1]));scene.add(glow(0xfff0cc,5,p[0],6.2,p[1],gt));});
 scene.add(glow(0xff4d4d,1.4,-4.4,15.3,0,gt));
 sunSprite=glow(0xfff0dc,26000,-36000,48000,29000,gt);scene.add(sunSprite);
 planet=new THREE.Mesh(new THREE.SphereGeometry(40000,96,64),new THREE.MeshStandardMaterial({color:0x0e1624,roughness:1}));planet.position.y=-40000;scene.add(planet);
 atmo=new THREE.Mesh(new THREE.SphereGeometry(40800,96,64),new THREE.MeshBasicMaterial({color:0x58d0f5,transparent:true,opacity:.16,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));atmo.position.y=-40000;atmo.visible=false;scene.add(atmo);
 earthBall=new THREE.Mesh(new THREE.SphereGeometry(2800,48,32),new THREE.MeshStandardMaterial({color:0x2d6fc4,emissive:0x0b2d5c,roughness:.8}));earthBall.position.set(-15000,7000,-34000);earthBall.visible=false;scene.add(earthBall);
 const sp=new Float32Array(2200*3);for(let i=0;i<2200;i++){const u=Math.random()*2-1,a=Math.random()*6.283,s=Math.sqrt(1-u*u);sp[i*3]=Math.cos(a)*s*100000;sp[i*3+1]=Math.abs(u)*100000;sp[i*3+2]=Math.sin(a)*s*100000;}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
 stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,color:0xffffff,transparent:true,opacity:.3,depthWrite:false}));stars.frustumCulled=false;scene.add(stars);
 geoP=new THREE.BufferGeometry();geoP.setAttribute('position',new THREE.BufferAttribute(P.pos,3));geoP.setAttribute('color',new THREE.BufferAttribute(P.col,3));
 points=new THREE.Points(geoP,new THREE.PointsMaterial({size:1.2,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));points.frustumCulled=false;scene.add(points);
 rocketRoot=new THREE.Group();scene.add(rocketRoot);rebuildRocket();applyWorld(curWorld);
 const ro=new ResizeObserver(resize);ro.observe($('#stage'));resize();
 const ptrs=new Map();let pinch=0;
 cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);cam.dragging=true;cam.user=4;});
 cv.addEventListener('pointermove',e=>{const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p[0],dy=e.clientY-p[1];p[0]=e.clientX;p[1]=e.clientY;
  if(ptrs.size===2){const a=[...ptrs.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinch)cam.dist=clamp(cam.dist*(pinch/d),7,80);pinch=d;}
  else{cam.az-=dx*.007;cam.pol=clamp(cam.pol-dy*.006,.25,2.2);}cam.user=4;});
 const up=e=>{ptrs.delete(e.pointerId);pinch=0;if(!ptrs.size)cam.dragging=false;};
 cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
 cv.addEventListener('wheel',e=>{e.preventDefault();cam.dist=clamp(cam.dist*(1+Math.sign(e.deltaY)*.08),7,80);cam.user=4;},{passive:false});
}
function resize(){if(!R)return;const s=$('#stage');const w=s.clientWidth||600,h=s.clientHeight||400;R.setSize(w,h,false);camera.aspect=w/h;if(view==='hero'&&mode==='build'){if(w>900)camera.setViewOffset(w,h,-w*.2,0,w,h);else camera.setViewOffset(w,h,0,h*.2,w,h);}else camera.clearViewOffset();camera.updateProjectionMatrix();}
const vis=a=>9*Math.pow(Math.max(a,0),.6);
function skyFor(alt){const L=LOOK[curWorld];const t=clamp(alt/70000,0,1);const k=curWorld==='moon'?0:t;scene.background.setRGB((L.sky[0]+(2-L.sky[0])*k)/255,(L.sky[1]+(4-L.sky[1])*k)/255,(L.sky[2]+(10-L.sky[2])*k)/255);
 stars.material.opacity=curWorld==='moon'?1:L.star+(1-L.star)*clamp((alt-6000)/40000,0,1);
 const a=clamp(alt/30000,0,1);planet.material.color.setRGB((L.gnd[0]+(L.orb[0]-L.gnd[0])*a)/255,(L.gnd[1]+(L.orb[1]-L.gnd[1])*a)/255,(L.gnd[2]+(L.orb[2]-L.gnd[2])*a)/255);atmo.visible=!!L.atm&&alt>4000;}
function frame3D(dt){
 // tweens
 for(let i=tweens.length-1;i>=0;i--){const t=tweens[i];t.t+=dt;const u=clamp(t.t/t.d,0,1),k=1-Math.pow(1-u,3);t.o.position.y=t.from*(1-k);if(u>=1){t.o.position.y=0;tweens.splice(i,1);}}
 // debris
 for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.t+=dt;d.vy-=9.8*dt*3;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.g.position.set(d.x,d.y,d.z);d.g.rotation.z+=d.rz*dt;d.g.rotation.x+=d.rx*dt;if(d.t>7){scene.remove(d.g);debris.splice(i,1);}}
 // rocket pose
 let jx=0,jz=0;
 if(mode==='flight'&&fl&&fl.phase==='shake'&&!RM){const amp=.12+.5*clamp((1.2-fl.d.twr)/.3,0,1);jx=(Math.random()-.5)*amp;jz=(Math.random()-.5)*amp;shake=amp;}else shake=0;
 rkx=jx;rkz=jz;
 if(mode==='flight'||mode==='ended'||mode==='countdown'){
  const a=fl?fl.y:0;visAlt+=(a-visAlt)*Math.min(1,dt*14);rky=vis(visAlt);
 }else rky=0;
 rocketRoot.position.set(rkx,rky,rkz);
 {const open=(mode==='countdown'&&cdT<2.4)||mode==='flight'||mode==='ended';
  padArms.forEach(w=>{const tg=open?w.k*1.35:0;w.g.rotation.y+=(tg-w.g.rotation.y)*Math.min(1,dt*(open?2.2:1.2));});
  if(mode==='countdown'&&cdT>0&&cdT<2.8&&R){for(let n=0;n<3;n++){const an=Math.random()*6.28;emit(Math.cos(an)*1.4,.3,Math.sin(an)*1.4,Math.cos(an)*3,2.5+Math.random()*3,Math.sin(an)*3,2.2,.8,.84,.9);}}
  if(mode==='flight'&&rky<45&&R){const f=1-rky/45;for(let n=0;n<Math.ceil(8*f);n++){const an=Math.random()*6.28,sp=5+Math.random()*11;emit(Math.cos(an)*1.5,.4,Math.sin(an)*1.5,Math.cos(an)*sp,.6+Math.random()*2.2,Math.sin(an)*sp,3.2,.78,.74,.7);}
   for(let n=0;n<2;n++)emit((Math.random()-.5)*2,.3,6+Math.random()*5,(Math.random()-.5)*2,1,9+Math.random()*6,2.4,1,.55,.2);}}
 // flames
 if(rk){
  const live=mode==='flight'&&fl&&(fl.phase==='burn'||fl.phase==='shake')&&!exploded;
  const fk=.85+Math.random()*.3;
  const coreOn=live&&fl.core.prop>0&&(fl.phase==='burn'||Math.random()<.5);
  const fq=RM?1:1+(Math.random()-.5)*.18+Math.sin(performance.now()/38)*.04;rk.flame.visible=!!coreOn;if(coreOn){rk.flame.scale.set(fk*fq,fk*fq*(fl.phase==='shake'?.5:1),fk);}
  rk.boosters.forEach((b,i)=>{const fb=fl&&fl.boosters[i];b.flame.visible=!!(live&&fb&&fb.attached&&fb.prop>0&&fl.phase==='burn');if(b.flame.visible)b.flame.scale.set(fk*fq,fk*fq,fk*fq);});
  if(coreOn&&fl.phase==='burn'){for(let n=0;n<3;n++)emit(rkx+(Math.random()-.5)*.4,rky,rkz+(Math.random()-.5)*.4,(Math.random()-.5)*3,-10-Math.random()*8,(Math.random()-.5)*3,.45,1,.62,.2);
   emit(rkx,rky-1,rkz,(Math.random()-.5)*2,-3,(Math.random()-.5)*2,2.4,.34,.34,.4);
   rk.boosters.forEach((b,i)=>{const fb=fl.boosters[i];if(fb&&fb.attached&&fb.prop>0){emit(rkx+b.x,rky,rkz,(Math.random()-.5)*2,-9,(Math.random()-.5)*2,.4,1,.55,.15);emit(rkx+b.x,rky-.5,rkz,0,-2,0,1.8,.32,.32,.36);}});}
 }
 if(exLight){const burn=rk&&mode==='flight'&&fl&&fl.phase==='burn'&&fl.core.prop>0&&!exploded;exLight.intensity=burn?3+Math.random()*1.5:(shake?1.2:0);exLight.position.set(rkx,rky-1.5,rkz);}
 if(fl&&rk&&R){
  if(fl.coreDrop&&!coreDone){coreDone=true;scene.add(rk.low);shed(rk.low,rkx,rky,rkz,0,-3,0,.6,.4);}
  if(fl.fairDrop&&!fairDone){fairDone=true;rk.fair.forEach(f=>shed(f.g,rkx,rky+6.1,rkz,f.s*5,2,0,0,-f.s*1.6));}
 }
 if(deployT>=0&&rk&&rk.parts['solar-wing']){deployT+=dt;const k=1-Math.pow(1-clamp(deployT/2.2,0,1),3);rk.parts['solar-wing'].forEach(w=>{w.visible=true;w.scale.set(1,1,Math.max(.05,k));});}
 // jettison
 if(fl&&rk&&fl.jett.length){while(fl.jett.length){const b=fl.jett.shift();const i=fl.boosters.indexOf(b);const rb=rk.boosters[i];if(rb&&R){scene.add(rb.g);const sg=Math.sign(rb.x)||1;debris.push({g:rb.g,x:rkx+rb.x,y:rky,z:rkz,vx:sg*6,vy:-2,vz:(Math.random()-.5)*2,rx:(Math.random()-.5)*3,rz:-sg*(1+Math.random()*2),t:0});rb.flame.visible=false;}}}
 updParticles(dt);
 skyFor(visAlt);
 // camera
 if(!camD){camD=cam.dist;camP=cam.pol;}
 camD+=(cam.dist-camD)*Math.min(1,dt*(RM?30:5));camP+=(cam.pol-camP)*Math.min(1,dt*(RM?30:9));
 let tx=0,ty=3.2,tz=0,dist=camD;
 if(mode==='flight'||mode==='countdown'){tx=rkx;ty=rky+3.2;tz=rkz;}
 else if(mode==='ended'){tx=rkx;ty=rky+3.2;tz=rkz;if(fl&&fl.outcome==='ORBIT'||fl&&fl.outcome==='POWER'){if(cam.user<=0){cam.az+=dt*.12;cam.dist=Math.min(cam.dist+dt*4,60);dist=camD;}}}
 if(mode==='build'&&cam.user<=0&&!RM){cam.az+=dt*(view==='hero'?.06:.14);}
 if(cam.user>0)cam.user-=dt;
 const lo=(mode==='flight'&&rky<30&&!RM)?.07*(1-rky/30):0,sh=shake+lo;const sx=sh&&!RM?(Math.random()-.5)*sh:0,sy=sh&&!RM?(Math.random()-.5)*sh:0;
 camera.position.set(tx+dist*Math.sin(camP)*Math.sin(cam.az)+sx,ty+dist*Math.cos(camP)+sy,tz+dist*Math.sin(camP)*Math.cos(cam.az));
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
function loadBuild(b,label){if(mode!=='build')return;const w=build.world;hist.push(clone(build));redo.length=0;const bu=build.budget,cp=build.comp;build=clone(b);build.world=w;build.budget=bu;build.comp=cp;onChange(null,label);}

/* ---------- UI render ---------- */
function gate(id,ok,label,val,sub,frac,mark,stat){return '<div class="g '+(ok===null?'neutral':ok?'':'bad')+'"><div class="gl">'+label+'</div><div class="gv">'+val+'</div><div class="bar"><i style="width:'+clamp(frac*100,0,100)+'%"></i>'+(mark!=null?'<b style="left:'+mark*100+'%"></b>':'')+'</div><div class="gs"><span class="chip">'+(ok===null?'·':ok?'✓':'✕')+' '+stat+'</span><span>'+sub+'</span></div></div>';}
function renderGauges(){
 const d=evalBuild(build),G=d.gates;let gen=0,draw=0;for(const p of PARTS){const n=count(build,p.id);if(p.power>0)gen+=n*p.power;else draw-=n*p.power;}
 const f=sim(build);const ap=G.twr.pass?f.maxY/1000:0;
 const eff=efficiency(d);
 const rows=[
  gate('twr',G.twr.pass&&G.struct.pass,'Thrust / weight',d.twr.toFixed(2),'min 1.20 · load '+d.loadG.toFixed(1)+' g of '+d.limit.toFixed(1),d.twr/3,1.2/3,G.twr.pass?(G.struct.pass?'OK':'TOO HIGH'):'TOO LOW'),
  gate('bud',G.budget.pass,'Budget',money(d.cost),'ceiling '+money(G.budget.limit),d.cost/(G.budget.limit*1.2),1/1.2,G.budget.pass?'OK':'OVER'),
  gate('mass',G.mass.pass,'Mass',Math.round(d.mass).toLocaleString('en-US')+' kg','limit 5,000 kg',d.mass/6000,5000/6000,G.mass.pass?'OK':'OVER'),
  gate('pow',G.power.pass,'Net power',(d.power>=0?'+':'')+d.power.toFixed(1)+' kW','gen '+gen.toFixed(1)+' · draw '+draw.toFixed(1),gen>0?draw/gen:1,null,G.power.pass?'SURPLUS':'DEFICIT'),
  gate('days',null,'Build time',d.days.toFixed(1)+' days','crew '+build.crew+' · '+Math.round(d.hours)+' work hours',d.days/60,null,'INFO'),
  gate('apo',G.twr.pass?ap>=100:false,'Est. apogee',G.twr.pass?ap.toFixed(0)+' km':'crash','target 100 km',ap/120,100/120,G.twr.pass?(ap>=100?'ORBIT':'SHORT'):'NO LIFT')
 ];
 $('#gauges').innerHTML=rows.join('')+gate('eff',null,'Efficiency index',String(eff),'$'+Math.round(d.cost/Math.max(1,d.payload)).toLocaleString('en-US')+' per kg payload',eff/100,null,'SCORE').replace('<div class="g neutral">','<div class="g neutral" style="grid-column:1/-1">');
 const fails=Object.values(G).filter(g=>!g.pass).length+(G.twr.pass&&ap<100?1:0);
 const lb=$('#launch');lb.textContent=fails?'Launch anyway ('+fails+' failing)':'Launch';
}
const TABS=[['propulsion','Propulsion'],['power','Power'],['payload','Payload'],['structure','Structure'],['crew','Crew']];
function renderTabs(){$('#tabs').innerHTML=TABS.map(t=>'<button role="tab" id="tab-'+t[0]+'" aria-selected="'+(tab===t[0])+'" data-tab="'+t[0]+'">'+t[1]+'</button>').join('');}
function chips(p){const mm=matFor(build,p);const m=p.dry*mm.m+p.prop;let h='<span>'+Math.round(m)+' kg</span><span>'+money(p.cost*mm.c)+'</span>';if(p.thrust)h+='<span class="pos">'+(p.thrust/1000)+' kN</span>';if(p.power)h+='<span class="'+(p.power>0?'pos':'neg')+'">'+(p.power>0?'+':'')+p.power+' kW</span>';h+='<span>'+p.hours+' h</span>';return h;}
function renderCatalog(){
 const L=$('#catalog');L.setAttribute('aria-labelledby','tab-'+tab);
 if(tab==='structure'){L.innerHTML=Object.keys(MATS).map(k=>{const m=MATS[k];const sel=k===build.mat;return '<div class="card'+(sel?' sel':'')+'"><div class="ct"><b>'+m.n+'</b><span class="cnt">'+(sel?'✓ selected':'')+'</span></div><div class="chips"><span>mass ×'+m.m+'</span><span>cost ×'+m.c+'</span><span>time ×'+m.t+'</span><span>limit '+(3*m.s).toFixed(1)+' g</span><span>heat ×'+m.h+'</span></div><p class="note">'+m.note+'</p><div class="act"><button class="btn" data-mat="'+k+'" '+(sel?'disabled':'')+'>'+(sel?'In use':'Use this')+'</button></div></div>';}).join('')+'<p class="fine">Material changes the dry mass, cost and build time of the capsule, core stage and boosters. Strength sets how many g the structure survives on ascent.</p>';return;}
 if(tab==='crew'){const d=evalBuild(build);L.innerHTML='<div class="card"><div class="ct"><b>Assembly crew</b><span class="cnt">'+build.crew+' people</span></div><label for="crew" class="note">More crew builds faster. Each person above 4 costs $30k.</label><input id="crew" type="range" min="4" max="10" step="1" value="'+build.crew+'"><div class="chips"><span>'+d.days.toFixed(1)+' days</span><span>'+money(Math.max(0,(build.crew-4)*30000))+' extra</span><span>'+Math.round(d.hours)+' work hours</span></div><p class="note">Repeating a part type gets 8% faster each time. Mixing many part types adds 4% integration time each.</p></div>';return;}
 const cats=tab==='propulsion'?['core','propulsion']:[tab];
 L.innerHTML=PARTS.filter(p=>cats.includes(p.cat)).map(p=>{const n=count(build,p.id);const can=canAdd(build,p.id);
  const why=p.booster&&boosterTotal(build)>=2?'Two booster slots are full':(n>=p.max?'Slot full':'');
  return '<div class="card"><div class="ct"><b>'+p.name+'</b><span class="cnt">'+(p.fixed?'included':n+' / '+p.max)+'</span></div><div class="chips">'+chips(p)+'</div><div class="act">'+(p.fixed?'<button class="btn" disabled>Required</button>':'<button class="btn" data-rm="'+p.id+'" '+(n?'':'disabled')+' aria-label="Remove one '+p.name+'">−</button><button class="btn pri" data-add="'+p.id+'" '+(can?'':'disabled')+' title="'+why+'" aria-label="Add '+p.name+'">+ Add</button>')+'</div></div>';}).join('');
}
function renderExamples(){$('#examples').innerHTML=Object.keys(EXAMPLES).map(k=>'<button class="btn" data-ex="'+k+'">'+EXAMPLES[k].name+'</button>').join('');$('#undo').disabled=!hist.length||mode!=='build';$('#redo').disabled=!redo.length||mode!=='build';}
function renderAll(){renderGauges();renderTabs();renderCatalog();renderExamples();}

/* ---------- log & HUD ---------- */
function logEv(s,cls,t){const L=$('#log');const d=document.createElement('div');d.className=cls||'';d.textContent=(t!=null?'T+'+tfmt(t)+'  ':'')+s;L.appendChild(d);while(L.children.length>5)L.removeChild(L.firstChild);if(mode==='build')setTimeout(()=>{if(d.parentNode&&mode==='build')d.remove();},6000);}
function setStatus(s){$('#status').textContent=s;}
function updHUD(){if(!fl)return;const stage=fl.boosters.some(b=>b.attached&&b.prop>0)?'1 · core + boosters':fl.core.prop>0?'2 · core':'coast';
 let p=fl.core.prop;fl.boosters.forEach(b=>{if(b.attached)p+=b.prop;});
 const spd=Math.abs(fl.v);$('#tele').innerHTML='<span>T+</span><div>'+tfmt(fl.t)+'</div><span>Altitude</span><div>'+(fl.y>=1000?(fl.y/1000).toFixed(1)+' km':Math.round(fl.y)+' m')+'</div><span>Velocity</span><div>'+Math.round(spd)+' m/s</div><span>Throttle</span><div>'+(fl.core.prop>0?'100%':'0%')+'</div><span>Stage</span><div>'+stage+'</div><span>Fuel</span><div>'+Math.round(100*p/prop0)+'%</div><span>Max-Q</span><div>'+(fl.q/1000).toFixed(1)+' kPa</div>';}

/* ---------- flight ---------- */
function setLocked(l){document.querySelectorAll('#bay button,#bay input').forEach(b=>{if(b.id==='mute')return;b.disabled=l;});if(!l){renderAll();$('#reset').disabled=false;}}
function launch(){
 if(mode!=='build'||view!=='build')return;closeDeb();actx();
 fl=newFlight(build);prop0=fl.core.prop+fl.boosters.reduce((s,b)=>s+b.prop,0);samples=[];lastSample=-1;simAcc=0;paused=false;visAlt=0;exploded=false;
 debris.forEach(d=>scene&&scene.remove(d.g));debris.length=0;rebuildRocket();coreDone=false;fairDone=false;deployT=-1;if(rk&&rk.parts['solar-wing'])rk.parts['solar-wing'].forEach(w=>{w.visible=false;});
 mode='countdown';cdT=5.2;setLocked(true);$('#launch').hidden=true;$('#log').innerHTML='';
 $('#tele').hidden=false;$('#speedRow').hidden=false;renderSpeed();$('#hint').textContent='Drag to orbit · Scroll to zoom';setStatus('Countdown');
 cam.dist=17;cam.pol=1.3;announce('Launch sequence started');startRumble();
}
function renderSpeed(){$('#speedRow').innerHTML=[1,6,20,60].map(s=>'<button class="btn" data-speed="'+s+'" aria-pressed="'+(speed===s)+'" style="min-height:32px;padding:5px 10px'+(speed===s?';border-color:var(--thrust)':'')+'">'+s+'× '+(s===1?'real time':'')+'</button>').join('')+'<button class="btn" data-pause="1" style="min-height:32px;padding:5px 10px">'+(paused?'Resume':'Pause')+'</button>';}
function tick(dt){
 if(mode==='countdown'){cdT-=dt;const n=Math.ceil(cdT);const c=$('#count');c.hidden=cdT<=0;if(n>=1&&c.textContent!==String(n)){c.textContent=n;c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop');blip(520-n*60,.12,'sine',.04);};if(cdT<=0){c.hidden=true;mode='flight';setStatus('Ascent');ev(fl,'Ignition');flushEv();blip(90,.5,'sawtooth',.06);}return;}
 if(mode!=='flight')return;
 if(!paused){simAcc+=dt*speed;let n=0;while(simAcc>=DT&&n++<400){stepFlight(fl);simAcc-=DT;
  if(fl.t-lastSample>=1){lastSample=fl.t;samples.push({t:fl.t,alt:fl.y/1000,v:fl.v});}
  if(fl.phase==='done'||fl.phase==='crash'||fl.phase==='breakup'){break;}}}
 flushEv();updHUD();
 let th=0;if(fl.phase==='burn'&&fl.thrusting)th=.7;if(fl.phase==='shake')th=.45;setRumble(th);
 if(fl.phase==='crash'||fl.phase==='breakup'){if(!exploded){exploded=true;if(rkGroup)rkGroup.visible=false;explode(rkx,rky,rkz,260);blip(70,.9,'sawtooth',.08);}}
 if(fl.phase==='done'||fl.phase==='crash'||fl.phase==='breakup')endFlight();
}
function flushEv(){if(!fl||!fl.newEvents)return;fl.newEvents.forEach(s=>{const cls=/lost|fail|crash|below/i.test(s)?'bad':/Apogee|Liftoff/.test(s)?'ok':'';logEv(s,cls,fl.t);announce(s);if(/separation|jettison|cutoff|Max-Q/i.test(s))banner(s);});fl.newEvents.length=0;}
function endFlight(){
 if(mode==='ended')return;mode='ended';samples.push({t:fl.t,alt:fl.y/1000,v:fl.v});stopRumble();$('#speedRow').hidden=true;
 const o=fl.outcome;setStatus(o==='ORBIT'?'Orbit reached':o==='PAD_CRASH'?'Lost on pad':o==='BREAKUP'?'Structural failure':o==='POWER'?'Power failure':'Suborbital');
 if(o==='ORBIT'){blip(660,.2,'sine',.05);setTimeout(()=>blip(880,.3,'sine',.05),180);}
 if((o==='ORBIT'||o==='POWER')&&build.counts['solar-wing']){deployT=0;logEv('Solar arrays deployed','ok',fl.t);banner('Solar arrays deployed');}
 const wait=o==='ORBIT'||o==='POWER'?3600:1500;
 debTimer=setTimeout(showDeb,wait);
}

/* ---------- debrief ---------- */
function gateText(k,g,d,b){
 const m=MATS[b.mat].n;
 if(k==='twr')return g.pass?'Thrust is '+g.value.toFixed(2)+'× the rocket’s weight. The minimum is 1.20.':'Thrust is only '+g.value.toFixed(2)+'× the rocket’s weight. It must be at least 1.20 to leave the pad.';
 if(k==='budget')return g.pass?'Hardware and crew cost '+money(g.value)+', under the '+money(g.limit)+' ceiling.':'Hardware and crew cost '+money(g.value)+', which is '+money(g.value-g.limit)+' over the '+money(g.limit)+' ceiling.';
 if(k==='mass')return g.pass?'Launch mass is '+Math.round(g.value)+' kg, within the 5,000 kg pad limit.':'Launch mass is '+Math.round(g.value)+' kg, which is '+Math.round(g.value-g.limit)+' kg over the pad limit.';
 if(k==='power')return g.pass?'Generation beats consumption by '+g.value.toFixed(1)+' kW.':'Consumption exceeds generation by '+(-g.value).toFixed(1)+' kW. Payloads go dark in orbit.';
 return g.pass?'Liftoff load is '+g.value.toFixed(2)+' g. '+m+' holds up to '+g.limit.toFixed(1)+' g.':'Liftoff load is '+g.value.toFixed(2)+' g but '+m+' only holds '+g.limit.toFixed(1)+' g. The structure breaks on ascent.';
}
const GN={twr:'Thrust-to-weight',budget:'Budget',mass:'Pad mass',power:'Net power',struct:'Structure'};
function chart(label,unit,key,col){
 const W=320,H=130,l=38,b=20,t=8,r=10;const S=samples;const mt=Math.max(1,S[S.length-1].t);let mv=1;S.forEach(s=>{mv=Math.max(mv,s[key]);});
 const X=v=>l+(W-l-r)*v/mt,Y=v=>H-b-(H-b-t)*Math.max(0,v)/mv;
 const pts=S.map(s=>X(s.t).toFixed(1)+','+Y(s[key]).toFixed(1)).join(' ');const e=S[S.length-1];
 const evs=fl.events.filter(x=>/separation|cutoff|jettison/.test(x.s)).map(x=>'<line class="ev" x1="'+X(x.t)+'" x2="'+X(x.t)+'" y1="'+t+'" y2="'+(H-b)+'"/>').join('');
 return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+label+' over time, peak '+mv.toFixed(key==='alt'?0:0)+' '+unit+'"><line class="ax" x1="'+l+'" x2="'+l+'" y1="'+t+'" y2="'+(H-b)+'"/><line class="ax" x1="'+l+'" x2="'+(W-r)+'" y1="'+(H-b)+'" y2="'+(H-b)+'"/>'+evs+'<polyline class="ln" points="'+pts+'"/><circle cx="'+X(e.t)+'" cy="'+Y(e[key])+'" r="3"/><text x="4" y="'+(t+8)+'">'+Math.round(mv)+'</text><text x="4" y="'+(H-b)+'">0</text><text x="'+l+'" y="'+(H-5)+'">0 s</text><text x="'+(W-r)+'" y="'+(H-5)+'" text-anchor="end">'+Math.round(mt)+' s</text><text x="'+(l+6)+'" y="'+(t+8)+'">'+label+' ('+unit+')</text></svg>';
}
function showDeb(){
 const d=fl.d,o=fl.outcome,G=d.gates,eff=efficiency(d);const allOk=d.allPass&&o==='ORBIT';
 let head,cls,sub;
 if(allOk){head='Orbit reached. Payload online.';cls='ok';sub='Mission success';}
 else if(o==='ORBIT'||o==='POWER'){head=o==='POWER'?'Mission lost: power starvation.':'Reached orbit, but the design broke the rules.';cls=o==='POWER'?'bad':'warn';sub=o==='POWER'?'Failed in orbit':'Rule violation';}
 else if(o==='PAD_CRASH'){head='Liftoff failed: not enough thrust.';cls='bad';sub='Lost on the pad';}
 else if(o==='BREAKUP'){head='Structure failed under load.';cls='bad';sub='Lost in flight';}
 else{head='Ran out of delta-v at '+(fl.maxY/1000).toFixed(0)+' km.';cls='bad';sub='Suborbital';}
 const gates=Object.keys(G).map(k=>'<div class="gc'+(G[k].pass?'':' fail')+'"><div class="t"><span>'+GN[k]+'</span><em>'+(G[k].pass?'✓ Pass':'✕ Fail')+'</em></div><div class="v">'+({twr:G[k].value.toFixed(2),budget:money(G[k].value),mass:Math.round(G[k].value)+' kg',power:(G[k].value>=0?'+':'')+G[k].value.toFixed(1)+' kW',struct:G[k].value.toFixed(2)+' g'})[k]+'</div><p>'+gateText(k,G[k],d,build)+'</p></div>').join('');
 const asc=G.twr.pass?'<div class="gc'+(fl.maxY>=100000?'':' fail')+'"><div class="t"><span>Ascent</span><em>'+(fl.maxY>=100000?'✓ Reached 100 km':'✕ Short')+'</em></div><div class="v">'+(fl.maxY/1000).toFixed(1)+' km apogee</div><p>'+(fl.maxY>=100000?'Enough delta-v to reach orbital altitude.':'The propellant ran out too early. Cut mass or add thrust and fuel.')+'</p></div>':'';
 const cmp=lastRun?['cost','days','eff'].map(k=>{const dv=({cost:d.cost-lastRun.cost,days:d.days-lastRun.days,eff:eff-lastRun.eff})[k];const good=k==='eff'?dv>0:dv<0;const name={cost:'Cost',days:'Build time',eff:'Efficiency'}[k];const txt=k==='cost'?(dv>=0?'+':'−')+money(Math.abs(dv)):k==='days'?(dv>=0?'+':'−')+Math.abs(dv).toFixed(1)+' d':(dv>=0?'+':'')+dv;return '<span class="d '+(dv===0?'':good?'up':'dn')+'">'+name+' '+txt+'</span>';}).join(''):'<span class="d">First attempt</span>';
 let fixes='';
 if(!allOk){const adv=advise(build);fixes=adv.length?adv.map((a,i)=>'<div class="fix"><div><b>'+a.label+'</b><p>'+(a.fixed.length?'Fixes '+a.fixed.map(x=>(FAIL_TXT(x)||x).toLowerCase()).join(', ')+'. ':'')+(a.left.length?'Still failing: '+a.left.map(x=>(FAIL_TXT(x)||x).toLowerCase()).join(', ')+'. ':'Clears every check. ')+'New thrust-to-weight '+a.d.twr.toFixed(2)+', cost '+money(a.d.cost)+'.</p></div><button class="btn pri" data-apply="'+i+'">Apply</button></div>').join(''):'<p class="fine">No single change fixes this. Try an example design or reset.</p>';}
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
function backToBuild(){closeDeb();mode='build';fl=null;exploded=false;visAlt=0;rky=0;if(R){debris.forEach(d=>scene.remove(d.g));debris.length=0;P.life.fill(0);rebuildRocket();rkGroup.visible=true;coreDone=fairDone=false;deployT=-1;}
 $('#log').innerHTML='';$('#tele').hidden=true;$('#speedRow').hidden=true;$('#count').hidden=true;$('#launch').hidden=false;$('#hint').textContent='Drag to orbit · Scroll to zoom · L to launch';setStatus('Build');cam.dist=17;cam.pol=1.32;cam.user=0;stopRumble();setLocked(false);}

/* ---------- Mission Planner - NEW ---------- */
const MISSION_DB={
 'low earth orbit':{dv:9400,atm:true,g:9.81,typicalAlt:400},
 'geo':{dv:11900,atm:true,g:9.81,typicalAlt:35786},
 'moon':{dv:6400,atm:false,g:1.62,typicalAlt:100},
 'mars':{dv:7800,atm:true,g:3.71,typicalAlt:400},
 'leonardo':{dv:9700,atm:true,g:9.81,typicalAlt:550},
 'iss':{dv:9500,atm:true,g:9.81,typicalAlt:408},
 'polar':{dv:9700,atm:true,g:9.81,typicalAlt:800},
 'sun-synchronous':{dv:9700,atm:true,g:9.81,typicalAlt:700},
 'deep space':{dv:12000,atm:true,g:9.81,typicalAlt:1000},
 'venus':{dv:10500,atm:true,g:8.87,typicalAlt:300},
 'jupiter':{dv:20000,atm:true,g:24.79,typicalAlt:1000},
 'saturn':{dv:15000,atm:true,g:10.44,typicalAlt:1000}
};
const PURPOSE_SPECS={
 'weather':{power:4,comm:true,radar:true,lifetime:5,desc:'Weather satellites need radar, high power, and reliable comms'},
 'communication':{power:3,comm:true,antenna:true,lifetime:15,desc:'Comms sats need high power, large antennas, long life'},
 'earth observation':{power:3,camera:true,spectrometer:true,lifetime:7,desc:'EO sats need cameras, spectrometers, moderate power'},
 'scientific':{power:2,camera:true,spectrometer:true,radar:true,lifetime:10,desc:'Science missions need diverse instruments'},
 'navigation':{power:3,comm:true,atomic_clock:true,lifetime:12,desc:'Navigation sats need atomic clocks, comms'},
 'technology demo':{power:1,camera:true,lifetime:2,desc:'Tech demos are small, short-lived'},
 'crew':{power:5,life_support:true,comm:true,lifetime:10,desc:'Crewed missions need life support, high power'},
 'cargo':{power:1,comm:true,lifetime:1,desc:'Cargo missions are simple, one-way'},
 'sample return':{power:2,camera:true,spectrometer:true,comm:true,lifetime:3,desc:'Sample return needs science + comms for return'}
};
function inferMission(destInput,purposeInput){
 const dest=destInput.toLowerCase().trim();
 const purp=purposeInput.toLowerCase().trim();
 let m=null;for(const k in MISSION_DB){if(dest.includes(k)||k.includes(dest)){m=MISSION_DB[k];break;}}
 if(!m)m=MISSION_DB['low earth orbit'];
 let p=null;for(const k in PURPOSE_SPECS){if(purp.includes(k)||k.includes(purp)){p=PURPOSE_SPECS[k];break;}}
 if(!p)p={power:2,camera:true,lifetime:5,desc:'General purpose mission'};
 return {dest:m,purpose:p,rawDest:destInput,rawPurpose:purposeInput};
}
function calcRocketSpecs(mission,payloadKg,targetAlt){
 const {dest,purpose}=mission;
 const g=dest.g;
 const dv=dest.dv;
 const isp=360;
 const propMass=payloadKg*(Math.exp(dv/(isp*g))-1);
 const totalMass=payloadKg+propMass;
 const thrust=totalMass*g*1.5;
 const structureMass=totalMass*0.15;
 const dryMass=payloadKg+structureMass;
 const wetMass=dryMass+propMass;
 const stages=propMass>1500?2:1;
 const coreDiameter=Math.max(2,Math.ceil(Math.pow(wetMass/1000,1/3)*1.5));
 const length=coreDiameter*12;
 const fuelType=dest.atm?'RP-1/LOX':'LH2/LOX';
 const chamberPressure=dest.atm?100:70;
 const nozzleExpansion=dest.atm?40:200;
 const twr=thrust/(wetMass*g);
 const buildTime=Math.max(180,Math.ceil(wetMass/100)*30);
 const cost=Math.ceil(wetMass*8000+payloadKg*50000+buildTime*5000);
 const materials={
  structure:'Al-Li 2195 (primary), Ti-6Al-4V (high-stress), CFRP (fairings)',
  tank:'Al-Li 2195 friction stir welded',
  engine:'Inconel 718 (combustion chamber), Copper alloy (liner)',
  tps:'PICA-X (if reentry), MLI (cryogenic)'
 };
 const physProps={
  density:2700,
  yieldStrength:450,
  ultimateStrength:520,
  youngModulus:73,
  cte:22,
  thermalCond:160,
  meltingPoint:630
 };
 const chemProps={
  fuel:fuelType.split('/')[0],
  oxidizer:fuelType.split('/')[1],
  mixtureRatio:fuelType.includes('RP-1')?2.56:6.0,
  specificImpulse:isp,
  combustionTemp:dest.atm?3700:3300,
  cStar:dest.atm?1800:2400
 };
 return{
  payload:payloadKg,
  targetAlt,
  dv:Math.round(dv),
  propMass:Math.round(propMass),
  dryMass:Math.round(dryMass),
  wetMass:Math.round(wetMass),
  thrust:Math.round(thrust/1000)+' kN',
  twr:twr.toFixed(2),
  stages,
  coreDiameter:coreDiameter.toFixed(1)+' m',
  length:length.toFixed(1)+' m',
  fuelType,
  chamberPressure:chamberPressure+' bar',
  nozzleExpansion:nozzleExpansion+':1',
  buildTime:buildTime+' days',
  cost:'$'+cost.toLocaleString(),
  materials,
  physProps,
  chemProps,
  purposeDesc:purpose.desc,
  requiredParts:{
    power:purpose.power||0,
    comm:purpose.comm||false,
    camera:purpose.camera||false,
    spectrometer:purpose.spectrometer||false,
    radar:purpose.radar||false,
    antenna:purpose.antenna||false,
    lifeSupport:purpose.life_support||false,
    atomicClock:purpose.atomic_clock||false
  }
 };
}
function renderMissionSuggestions(specs){
 const s=$('#mission-suggestions');
 s.hidden=false;
 s.innerHTML=`
  <div class="suggestion-card">
   <h4>📋 Mission Analysis: ${specs.payload} kg to ${specs.targetAlt} km</h4>
   <div class="spec-row"><b>Delta-V required</b><span>${specs.dv.toLocaleString()} m/s</span></div>
   <div class="spec-row"><b>Propellant mass</b><span>${specs.propMass.toLocaleString()} kg</span></div>
   <div class="spec-row"><b>Total wet mass</b><span>${specs.wetMass.toLocaleString()} kg</span></div>
   <div class="spec-row"><b>Thrust required</b><span>${specs.thrust}</span></div>
   <div class="spec-row"><b>TWR at liftoff</b><span>${specs.twr}</span></div>
   <div class="spec-row"><b>Stages</b><span>${specs.stages}</span></div>
   <div class="spec-row"><b>Core diameter</b><span>${specs.coreDiameter}</span></div>
   <div class="spec-row"><b>Length</b><span>${specs.length}</span></div>
   <div class="spec-row"><b>Fuel type</b><span>${specs.fuelType}</span></div>
   <div class="spec-row"><b>Chamber pressure</b><span>${specs.chamberPressure}</span></div>
   <div class="spec-row"><b>Nozzle expansion</b><span>${specs.nozzleExpansion}</span></div>
   <div class="spec-row"><b>Build time</b><span>${specs.buildTime}</span></div>
   <div class="spec-row"><b>Estimated cost</b><span>${specs.cost}</span></div>
  </div>
  <div class="suggestion-card">
   <h4>🔬 Materials & Composition</h4>
   <div class="prop-grid">
    <div class="prop-item"><div class="prop-label">Structure</div><div class="prop-value">${specs.materials.structure}</div></div>
    <div class="prop-item"><div class="prop-label">Tanks</div><div class="prop-value">${specs.materials.tank}</div></div>
    <div class="prop-item"><div class="prop-label">Engine</div><div class="prop-value">${specs.materials.engine}</div></div>
    <div class="prop-item"><div class="prop-label">TPS</div><div class="prop-value">${specs.materials.tps}</div></div>
   </div>
  </div>
  <div class="suggestion-card">
   <h4>⚗️ Physical Properties (Al-Li 2195 baseline)</h4>
   <div class="prop-grid">
    <div class="prop-item"><div class="prop-label">Density</div><div class="prop-value">${specs.physProps.density} kg/m³</div></div>
    <div class="prop-item"><div class="prop-label">Yield Strength</div><div class="prop-value">${specs.physProps.yieldStrength} MPa</div></div>
    <div class="prop-item"><div class="prop-label">Ultimate Strength</div><div class="prop-value">${specs.physProps.ultimateStrength} MPa</div></div>
    <div class="prop-item"><div class="prop-label">Young's Modulus</div><div class="prop-value">${specs.physProps.youngModulus} GPa</div></div>
    <div class="prop-item"><div class="prop-label">CTE</div><div class="prop-value">${specs.physProps.cte} ×10⁻⁶/K</div></div>
    <div class="prop-item"><div class="prop-label">Thermal Conductivity</div><div class="prop-value">${specs.physProps.thermalCond} W/m·K</div></div>
    <div class="prop-item"><div class="prop-label">Melting Point</div><div class="prop-value">${specs.physProps.meltingPoint}°C</div></div>
   </div>
  </div>
  <div class="suggestion-card">
   <h4>🧪 Chemical / Propulsion Properties</h4>
   <div class="prop-grid">
    <div class="prop-item"><div class="prop-label">Fuel</div><div class="prop-value">${specs.chemProps.fuel}</div></div>
    <div class="prop-item"><div class="prop-label">Oxidizer</div><div class="prop-value">${specs.chemProps.oxidizer}</div></div>
    <div class="prop-item"><div class="prop-label">Mixture Ratio (O/F)</div><div class="prop-value">${specs.chemProps.mixtureRatio}</div></div>
    <div class="prop-item"><div class="prop-label">Specific Impulse</div><div class="prop-value">${specs.chemProps.specificImpulse} s</div></div>
    <div class="prop-item"><div class="prop-label">Combustion Temp</div><div class="prop-value">${specs.chemProps.combustionTemp} K</div></div>
    <div class="prop-item"><div class="prop-label">c* Efficiency</div><div class="prop-value">${specs.chemProps.cStar} m/s</div></div>
   </div>
  </div>
  <div class="suggestion-card">
   <h4>🎯 Mission Purpose Requirements</h4>
   <div class="prop-grid">
    <div class="prop-item"><div class="prop-label">Description</div><div class="prop-value" style="font-size:11px;color:var(--muted)">${specs.purposeDesc}</div></div>
    <div class="prop-item"><div class="prop-label">Power Required</div><div class="prop-value">${specs.requiredParts.power} kW</div></div>
    <div class="prop-item"><div class="prop-label">Comms</div><div class="prop-value">${specs.requiredParts.comm?'Yes':'No'}</div></div>
    <div class="prop-item"><div class="prop-label">Camera</div><div class="prop-value">${specs.requiredParts.camera?'Yes':'No'}</div></div>
    <div class="prop-item"><div class="prop-label">Spectrometer</div><div class="prop-value">${specs.requiredParts.spectrometer?'Yes':'No'}</div></div>
    <div class="prop-item"><div class="prop-label">Radar</div><div class="prop-value">${specs.requiredParts.radar?'Yes':'No'}</div></div>
    <div class="prop-item"><div class="prop-label">Life Support</div><div class="prop-value">${specs.requiredParts.lifeSupport?'Yes':'No'}</div></div>
   </div>
  </div>
 `;
}
function renderRocketSpecs(specs){
 const s=$('#rocket-specs');
 s.innerHTML=`
  <div class="spec-group">
   <h4>📐 Vehicle Geometry</h4>
   <div class="spec-grid">
    <div class="spec-item"><div class="spec-label">Core Diameter</div><div class="spec-value">${specs.coreDiameter}</div></div>
    <div class="spec-item"><div class="spec-label">Total Length</div><div class="spec-value">${specs.length}</div></div>
    <div class="spec-item"><div class="spec-label">Stages</div><div class="spec-value">${specs.stages}</div></div>
    <div class="spec-item"><div class="spec-label">Wet Mass</div><div class="spec-value">${specs.wetMass.toLocaleString()} kg</div></div>
    <div class="spec-item"><div class="spec-label">Dry Mass</div><div class="spec-value">${specs.dryMass.toLocaleString()} kg</div></div>
    <div class="spec-item"><div class="spec-label">Propellant</div><div class="spec-value">${specs.propMass.toLocaleString()} kg</div></div>
   </div>
  </div>
  <div class="spec-group">
   <h4>🚀 Propulsion</h4>
   <div class="spec-grid">
    <div class="spec-item"><div class="spec-label">Thrust (SL)</div><div class="spec-value">${specs.thrust}</div></div>
    <div class="spec-item"><div class="spec-label">TWR</div><div class="spec-value">${specs.twr}</div></div>
    <div class="spec-item"><div class="spec-label">Fuel</div><div class="spec-value">${specs.fuelType}</div></div>
    <div class="spec-item"><div class="spec-label">Chamber Pressure</div><div class="spec-value">${specs.chamberPressure}</div></div>
    <div class="spec-item"><div class="spec-label">Nozzle Expansion</div><div class="spec-value">${specs.nozzleExpansion}</div></div>
    <div class="spec-item"><div class="spec-label">Delta-V</div><div class="spec-value">${specs.dv.toLocaleString()} m/s</div></div>
   </div>
  </div>
  <div class="spec-group">
   <h4>💰 Program</h4>
   <div class="spec-grid">
    <div class="spec-item"><div class="spec-label">Build Time</div><div class="spec-value">${specs.buildTime}</div></div>
    <div class="spec-item"><div class="spec-label">Estimated Cost</div><div class="spec-value">${specs.cost}</div></div>
   </div>
  </div>
 `;
}

/* ---------- hero, nav, worlds ---------- */
const COPY={
 earth:{eye:'Mission : <b>Reach orbit</b>',t:'Earth',c:'Our home world pulls hard: 9.81 m/s² and a thick atmosphere that fights every metre of the climb. Design a rocket that beats gravity, drag and the budget, then fly it.',s:[['Surface gravity','9.81','m/s²'],['Air density','1.225','kg/m³'],['Planet radius','6,371','km'],['Planet type','Terrestrial','']]},
 moon:{eye:'Mission : <b>Lunar ascent</b>',t:'Moon',c:'One sixth of Earth’s gravity and no air at all. Thrust is easy here, so the real test is building light, cheap and fast. Watch the Earth hang in the black sky.',s:[['Surface gravity','1.62','m/s²'],['Air density','Vacuum',''],['Planet radius','1,737','km'],['Body type','Satellite','']]},
 mars:{eye:'Mission : <b>The red frontier</b>',t:'Mars',c:'A dusty, cold world with a very thin atmosphere and 38% of Earth’s gravity. Fewer drag losses, but every kilogram you carry still counts against the budget.',s:[['Surface gravity','3.71','m/s²'],['Air density','0.020','kg/m³'],['Planet radius','3,390','km'],['Planet type','Terrestrial','']]}
};
const WN={earth:'Earth',moon:'Moon',mars:'Mars'};
function renderHero(){const w='earth',c=COPY[w];
 $('#wtabs').innerHTML='';
 $('#hEye').innerHTML=c.eye;$('#hTitle').textContent=c.t;$('#hCopy').textContent=c.c;
 $('#hStrip').innerHTML=c.s.map(x=>'<div><small>'+x[0]+'</small><b>'+x[1]+(x[2]?'<span>'+x[2]+'</span>':'')+'</b></div>').join('');
 $('#wsel').innerHTML='';}
function setWorld(w){if(mode!=='build')return;document.body.dataset.world='earth';applyWorld('earth');renderHero();renderAll();}
function setView(v){if(mode!=='build'&&v==='hero')return;view=v;$('#app').classList.toggle('hero',v==='hero');$('#nv-hero').setAttribute('aria-current',String(v==='hero'));$('#nv-build').setAttribute('aria-current',String(v==='build'));
 cam.user=0;cam.pol=v==='hero'?1.42:1.32;cam.dist=v==='hero'?(innerWidth<900?34:24):17;if(v==='build')renderAll();
 setTimeout(resize,30);}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 const t=e.target.closest('button,[data-tab]');if(!t)return;
 if(t.dataset.pk){pkAct(t.dataset.pk);return;}
 if(t.dataset.pkd){mission.dest=DESTS[t.dataset.pkd].n.toLowerCase();renderPeek();return;}
 if(t.dataset.pkp){const P=PURPS[t.dataset.pkp];mission.purp=P.n.toLowerCase();mission.dest=DESTS[P.dest].n.toLowerCase();renderPeek();return;}
 if(t.dataset.pkm){setMat(t.dataset.pkm);cache.clear();renderPeek();return;}
 if(t.dataset.view){setView(t.dataset.view);return;}
 if(t.dataset.world){setWorld(t.dataset.world);return;}
 if(t.dataset.tab){tab=t.dataset.tab;renderTabs();renderCatalog();return;}
 if(t.dataset.add)return addPart(t.dataset.add);
 if(t.dataset.rm)return rmPart(t.dataset.rm);
 if(t.dataset.mat)return setMat(t.dataset.mat);
 if(t.dataset.ex){return loadBuild(EXAMPLES[t.dataset.ex],'Loaded example '+EXAMPLES[t.dataset.ex].name);}
 if(t.dataset.speed){speed=+t.dataset.speed;renderSpeed();return;}
 if(t.dataset.pause){paused=!paused;renderSpeed();return;}
 if(t.dataset.apply!==undefined){const a=(window._adv||[])[+t.dataset.apply];if(a){backToBuild();setBuild(clone(a.b),null,a.label);}return;}
 if(t.dataset.deb==='rebuild'){backToBuild();return;}
 if(t.dataset.deb==='reset'){backToBuild();setBuild(fresh(),null,'Reset to starter build');return;}
 if(t.dataset.deb==='replay'){backToBuild();launch();return;}
 if(t.id==='launch')return launch();
 if(t.id==='undo'&&hist.length&&mode==='build'){redo.push(clone(build));build=hist.pop();onChange(null,'Undo');return;}
 if(t.id==='redo'&&redo.length&&mode==='build'){hist.push(clone(build));build=redo.pop();onChange(null,'Redo');return;}
 if(t.id==='reset'&&mode==='build'){setBuild(fresh(),null,'Reset to starter build');return;}
 if(t.id==='mute'){muted=!muted;t.textContent=muted?'Sound off':'Sound on';t.setAttribute('aria-pressed',String(muted));if(muted)stopRumble();return;}
 if(t.id==='generate-specs'){
  const dest=$('#mission-destination').value.trim();
  const purp=$('#mission-purpose').value.trim();
  const payload=+$('#mission-payload-mass').value||500;
  const alt=+$('#mission-orbit-alt').value||400;
  if(!dest||!purp){alert('Please enter destination and purpose');return;}
  const mission=inferMission(dest,purp);
  const specs=calcRocketSpecs(mission,payload,alt);
  renderMissionSuggestions(specs);
  renderRocketSpecs(specs);
  announce('Specifications generated for '+payload+' kg to '+alt+' km');
  return;
 }
});
document.addEventListener('change',e=>{if(e.target.id==='crew')crewPending=false;});
document.addEventListener('input',e=>{if(e.target.id==='crew'){setCrew(+e.target.value);const d=evalBuild(build);const c=$('#crew');if(c){const ch=c.parentNode.querySelector('.chips');if(ch)ch.innerHTML='<span>'+d.days.toFixed(1)+' days</span><span>'+money(Math.max(0,(build.crew-4)*30000))+' extra</span><span>'+Math.round(d.hours)+' work hours</span>';const ct=c.parentNode.querySelector('.cnt');if(ct)ct.textContent=build.crew+' people';}}});
document.addEventListener('keydown',e=>{if(e.target.matches&&e.target.matches('input,textarea,select'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key.toLowerCase();
 if(k==='escape'&&!$('#deb').hidden){backToBuild();return;}
 if(!$('#deb').hidden)return;
 if(view!=='build')return;
 if(k==='l'&&mode==='build'){launch();}
 else if(k==='r'&&mode==='build'){setBuild(fresh(),null,'Reset to starter build');}
 else if(k==='z'&&mode==='build'){if(e.shiftKey){$('#redo').click();}else{$('#undo').click();}}
});


/* ---------- mission setup side peek ---------- */
build.world='earth';
const mission={name:'Aurora-1',dest:'low earth orbit',purp:'',payload:''};
const IM=window.NG_IMGS||[];
const STEPS=['Mission','Limits','Materials','Plan'];let pkStep=0;
function parseDest(t){t=(t||'').toLowerCase();return /geo|gto|stationary|35/.test(t)?'gto':/sun|sso|polar/.test(t)?'sso':/moon|lunar/.test(t)?'moon':/mars/.test(t)?'mars':'leo';}
function parsePurp(t){t=(t||'').toLowerCase();return /weather|climate|forecast|storm|monsoon/.test(t)?'weather':/comm|tv|internet|broadcast|telecom/.test(t)?'comms':/earth|imag|survey|map|agri|ocean/.test(t)?'earth':/crew|human|astronaut|passenger/.test(t)?'crew':/nav|gps|position/.test(t)?'nav':/science|astro|telescope|research|space/.test(t)?'science':t.trim()?'tech':null;}
const MCOL={'Aluminium':'#9fb3c8','Iron':'#d5dce5','Chromium':'#7fb6c9','Nickel':'#b8c2a6','Titanium':'#7a8496','Carbon fibre':'#4a5262','Epoxy resin':'#c28f5a','Copper':'#d98b5f','Lithium':'#c084fc','Silicon':'#e0c870','Vanadium':'#86efac','Ceramic':'#e0a06a','Stainless steel':'#d5dce5','Magnesium':'#fca5a5'};
const colOf=n=>MCOL[n]||'#64748b';
const VT={yes:'Suits',maybe:'Maybe',no:'Poor fit'};
const fmt=n=>Math.round(n).toLocaleString('en-US');
function plan(){return recommend({dest:parseDest(mission.dest),purp:parsePurp(mission.purp),payload:mission.payload,budget:build.budget});}
function parseMat(t){t=(t||'').toLowerCase();return /lith/.test(t)?'al-lithium':/custom|blend|mix/.test(t)?'custom':/steel|iron/.test(t)?'steel':/titan/.test(t)?'titanium':/carbon|compos|cfrp|fib/.test(t)?'cfrp':/print|3d|additive/.test(t)?'printed':/reclaim|scrap|recycl|reuse/.test(t)?'reclaimed':/alum/.test(t)?'al-standard':null;}
function setBudget(v){build.budget=clamp(Math.round(v),1e6,500e6);cache.clear();renderAll();}
function pkPhotos(){const P=$('.pk-ph');if(P&&!P.querySelector('img')&&IM.length){IM.forEach(b=>{const i=new Image();i.alt='';i.src='data:image/jpeg;base64,'+b;P.insertBefore(i,P.firstChild);});}}
function pkAct(a){const P=$('#peek');
 if(a==='open'){pkStep=0;P.hidden=false;pkPhotos();renderPeek();setTimeout(()=>{const x=$('#f-name');if(x)x.focus();},60);return;}
 if(a==='close'){P.hidden=true;return;}
 if(a==='back'){pkStep=Math.max(0,pkStep-1);renderPeek();return;}
 if(a==='next'){if(pkStep<STEPS.length-1){pkStep++;renderPeek();}else{P.hidden=true;setView('build');renderAll();logEv('Mission '+mission.name+': '+mission.dest+', budget '+money(build.budget),'');}return;}
 if(typeof a==='string'&&a.indexOf('step')===0){pkStep=+a.slice(4);renderPeek();}}
function compBar(c){return '<div class="cbar" role="img" aria-label="Composition">'+c.map(x=>'<i style="width:'+x[1]+'%;background:'+colOf(x[0])+'"></i>').join('')+'</div><div class="cl">'+c.map(x=>'<span><b style="color:'+colOf(x[0])+'">●</b> '+x[0]+' '+x[1]+'%</span>').join('')+'</div>';}
function propRows(k){const p=PROPS[k];if(!p){const m=MATS[k];return '<p class="note">'+(m.note||'')+'</p>';}
 return '<div class="tbw"><table class="tb"><tr><th>Density</th><td>'+p.rho+' g/cm³</td></tr><tr><th>Yield strength</th><td>'+p.ys+' MPa</td></tr><tr><th>Melting range</th><td>'+p.melt+'</td></tr><tr><th>Thermal conductivity</th><td>'+p.k+' W/m·K</td></tr><tr><th>Composition</th><td>'+p.alloy+'</td></tr></table></div><p class="note">'+p.why+'</p>';}
function renderPeek(){if($('#peek').hidden)return;
 $('#pkSteps').innerHTML=STEPS.map((s,i)=>'<button data-pk="step'+i+'" aria-current="'+(i===pkStep)+'" class="'+(i<pkStep?'done':'')+'">'+(i+1)+' '+s+'</button>').join('');
 $('#pkS').textContent='Step '+(pkStep+1)+' of '+STEPS.length+'. All rockets launch from Earth.';
 $('#pkBack').disabled=pkStep===0;$('#pkNext').textContent=pkStep===STEPS.length-1?'Start building':'Next';
 let h='';const B=$('#pkBody');
 if(pkStep===0){
  const dk=parseDest(mission.dest),pk=parsePurp(mission.purp);
  h+='<div class="fld"><label for="f-name">Mission name</label><input id="f-name" data-f="name" type="text" value="'+mission.name+'" autocomplete="off"></div>'
   +'<div class="fld"><label for="f-dest">Destination</label><input id="f-dest" data-f="dest" type="text" value="'+mission.dest+'" placeholder="e.g. orbit, geostationary, Moon" autocomplete="off"><small>Read as <b>'+DESTS[dk].n+'</b> · '+DESTS[dk].alt+'. '+DESTS[dk].note+'</small></div>'
   +'<div class="fld"><label for="f-purp">Purpose of the launch</label><input id="f-purp" data-f="purp" type="text" value="'+mission.purp+'" placeholder="e.g. weather prediction" autocomplete="off"><small>'+(pk?'Read as <b>'+(PURPS[pk]?PURPS[pk].n:'Technology demo')+'</b>. '+(PURPS[pk]?PURPS[pk].tip:'Treated as a technology demo.'):'Type a purpose, for example weather prediction, communications, earth observation, crew transport or navigation.')+'</small></div>';}
 else if(pkStep===1){
  const pk=PURPS[parsePurp(mission.purp)];const d=evalBuild(build);
  h+='<div class="fld"><label for="f-pl">Payload mass (kg)</label><input id="f-pl" data-f="payload" type="text" inputmode="decimal" value="'+mission.payload+'" placeholder="'+(pk?pk.pl:'500')+' suggested" autocomplete="off"><small>Satellite or capsule mass the rocket must deliver. Leave blank to use the suggestion.</small></div>'
   +'<div class="fld"><label for="f-bud">Total budget (US dollars)</label><input id="f-bud" data-f="budget" type="text" inputmode="numeric" value="'+Math.round(build.budget)+'" autocomplete="off"><small>Default is $10,000,000. Currently <b>'+money(build.budget)+'</b>.</small></div>'
   +'<div class="fld"><label for="f-crew">Assembly crew (people)</label><input id="f-crew" data-f="crew" type="text" inputmode="numeric" value="'+build.crew+'" autocomplete="off"><small>4 to 10. More people build faster. Each person above 4 costs $30,000.</small></div>'
   +'<div class="use"><b>Starter build right now</b><p>'+money(d.cost)+', '+fmt(d.mass)+' kg, '+d.days.toFixed(0)+' days. This updates as you type.</p></div>';}
 else if(pkStep===2){
  const sel=build.mat,P=PURPS[parsePurp(mission.purp)];
  h+='<div class="fld"><label for="f-mat">Structure material</label><input id="f-mat" data-f="mat" type="text" value="'+(MATS[sel].n||sel)+'" placeholder="e.g. titanium, carbon fibre, custom" autocomplete="off"><small>Read as <b>'+(MATS[sel].n||sel)+'</b>. Type any material below. The cards test each one against your design.</small></div>';
  h+=Object.keys(MATS).map(k=>{const m=MATS[k],r=suitability(k,build);
   return '<div class="opt" role="group"><b>'+(m.n||k)+'<span class="vd '+r.verdict+'">'+VT[r.verdict]+'</span>'+(P&&P.mat===k?'<span class="vd yes">Best for purpose</span>':'')+'</b>'+compBar(m.comp||[])+'<div class="cl"><span>Mass x'+m.m.toFixed(2)+'</span><span>Cost x'+m.c.toFixed(2)+'</span><span>Time x'+m.t.toFixed(2)+'</span><span>Strength x'+m.s.toFixed(2)+'</span><span>Heat x'+m.h.toFixed(2)+'</span></div>'+propRows(k)+'<ul class="rs">'+r.reasons.map(x=>'<li class="'+x.k+'">'+x.t+'</li>').join('')+'</ul></div>';}).join('');
  h+='<h4>Custom blend</h4><p class="note">Type a share for each ingredient. Totals are scaled to 100%.</p>'+Object.keys(CONST).map(k=>'<div class="cmrow"><label for="cm-'+k+'">'+CONST[k].n+' %</label><input id="cm-'+k+'" data-cm="'+k+'" type="text" inputmode="decimal" value="'+(build.comp[k]||0)+'"></div>').join('');
  h+='<h4>What to use where</h4>'+USES.map(u=>'<div class="use"><b>'+u.use+'</b><p>'+u.why+'</p><div class="pk">'+u.pick.map(p=>'<span>'+(MATS[p].n||p)+'</span>').join('')+'</div></div>').join('');}
 else{
  const R=plan();
  if(R.error){h+='<div class="use"><b>Not reachable</b><p>'+R.error+'</p></div>';}
  else{const P=R.purp,pr=PROPS[R.mat];
   h+='<h4>Suggested design for '+R.dest.n+(P?' · '+P.n:'')+'</h4><div class="kp"><div><small>Liftoff mass</small><b>'+fmt(R.liftoff/1000)+' t</b><em>payload '+fmt(R.payload)+' kg ('+R.mpl+'%)</em></div><div><small>Liftoff thrust</small><b>'+fmt(R.thrustKN)+' kN</b><em>thrust to weight 1.35</em></div><div><small>Build time</small><b>'+R.days+' days</b><em>with a crew of '+build.crew+'</em></div><div><small>Estimated cost</small><b>'+money(R.cost)+'</b><em>'+(R.fits?'within your '+money(R.budget):'over your '+money(R.budget)+' by '+money(R.cost-R.budget))+'</em></div><div><small>Power on board</small><b>'+R.power+' kW</b><em>solar arrays plus battery</em></div><div><small>Delta-v needed</small><b>'+(R.dv/1000).toFixed(1)+' km/s</b><em>includes 1.5 km/s losses</em></div></div>'
    +(R.fits?'':'<div class="use"><b>Over budget</b><p>Raise the budget to at least '+money(R.cost)+', reduce the payload, or choose a nearer destination.</p></div>')
    +'<h4>Stages and fuel</h4><div class="tbw"><table class="tb"><tr><th>Stage</th><th>Fuel</th><th>Propellant</th><th>Dry</th></tr>'+R.rows.map(x=>'<tr><td>'+x.stage+'</td><td>'+x.fuel+'</td><td>'+fmt(x.prop)+' kg</td><td>'+fmt(x.dry)+' kg</td></tr>').join('')+'</table></div>'
    +R.fuels.map(f=>{const F=FUELS[f];return '<div class="use"><b>'+F.n+' · Isp '+F.isp+' s</b><p>'+F.note+'</p><p>Composition: '+F.form+'.</p><p>Reaction: '+F.burn+'.</p><p>Density '+F.rho+' g/cm³. '+F.temp+'</p></div>';}).join('')
    +'<h4>Best material: '+(MATS[R.mat].n||R.mat)+'</h4><div class="use">'+(P?'<p>'+P.tip+'</p>':'')+propRows(R.mat)+'<div class="pk"><button class="btn pri" data-pkm="'+R.mat+'">Use this material</button></div></div>'
    +(P?'<div class="use"><b>Payload instruments</b><p>'+P.inst+'</p></div>':'')
    +'<p class="fine">Planning estimates from the rocket equation with typical stage structure fractions. The simulator launch checks are stricter.</p>';}}
 B.innerHTML=h;B.scrollTop=0;}
function rePeek(){setTimeout(()=>{const ae=document.activeElement,id=ae&&ae.id;renderPeek();if(id){const el=document.getElementById(id);if(el)el.focus();}},0);}
document.addEventListener('change',e=>{const t=e.target;if(!t.dataset)return;
 if(t.dataset.f){const f=t.dataset.f;
  if(f==='budget'){setBudget(numOr(t.value,DEFAULT_BUDGET));}
  else if(f==='mat'){const k=parseMat(t.value);if(k)setMat(k);}
  else if(f==='crew'){setCrew(clamp(Math.round(numOr(t.value,4)),4,10));}
  else{mission[f]=t.value;if(f==='purp'){const pk=PURPS[parsePurp(t.value)];if(pk&&!mission.payload&&false){}}}
  if(f!=='name'&&f!=='payload')rePeek();return;}
 if(t.dataset.cm){build.comp[t.dataset.cm]=clamp(numOr(t.value,0),0,100);setCustom(build.comp);cache.clear();if(build.mat==='custom')renderAll();rePeek();}});
document.addEventListener('keydown',e=>{if(e.target.matches&&e.target.closest&&e.target.closest('#peek')&&e.key==='Enter'&&e.target.tagName==='INPUT'){e.target.blur();e.stopPropagation();}
 if(e.key==='Escape'&&!$('#peek').hidden){$('#peek').hidden=true;e.stopPropagation();}},true);

/* ---------- main loop ---------- */
let last=performance.now();
function loop(now){const dt=Math.min(.1,(now-last)/1000);last=now;try{tick(dt);if(R)frame3D(dt);}catch(err){console.error(err);}requestAnimationFrame(loop);}
init3D();renderAll();renderHero();document.body.dataset.world='earth';setView('hero');logEv('Starter build loaded. Add parts, then launch.','');
window.__ng={get mode(){return mode;},get fl(){return fl;},launch,get build(){return build;}};
requestAnimationFrame(loop);
})();
