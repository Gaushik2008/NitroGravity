(function(){
'use strict';
const $=(s,r)=>(r||document).querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const money=v=>v>=1e6?'$'+(v/1e6).toFixed(2)+'M':'$'+Math.round(v/1e3)+'k';
const tfmt=t=>{t=Math.max(0,t|0);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const START={counts:{camera:1,'solar-wing':1},mat:'al-standard',crew:4,world:'earth'};
let view='hero';
const fresh=()=>{const n=clone(START);n.world=build.world;return n;};
let build=clone(START), hist=[], redo=[], tab='propulsion', lastRun=null;
let mode='build', fl=null, simAcc=0, speed=6, paused=false, cdT=0, visAlt=0, samples=[], lastSample=0, debTimer=null, prop0=1;
const cache=new Map();
function key(b){return JSON.stringify([Object.keys(b.counts).sort().map(k=>[k,b.counts[k]]),b.mat,b.crew,b.world||'earth']);}
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
const tweens=[],debris=[];
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
function buildRocket(b){
 const g=new THREE.Group();const o={group:g,parts:{},boosters:[],flame:null};
 const metalness=b.mat==='cfrp'?.15:.7,rough=b.mat==='cfrp'?.32:.38;
 const sm=M(MATCOL[b.mat]||0xc9d3e0,{metalness:metalness,roughness:rough});
 const dark=M(0x1d222c,{metalness:.7,roughness:.4}),accent=M(0xff8a3d,{metalness:.3,roughness:.45}),white=M(0xf4f6fa,{metalness:.25,roughness:.35}),gold=M(0xb8933f,{metalness:.9,roughness:.3});
 const bellM=M(0x3a3f4a,{metalness:.9,roughness:.35,side:THREE.DoubleSide});
 const tag=(id,grp)=>{(o.parts[id]=o.parts[id]||[]).push(grp);g.add(grp);return grp;};
 const core=tag('core-stage',new THREE.Group());
 core.add(mesh(lathe([[.5,.7],[.55,1.1],[.56,2.2],[.56,4.4],[.52,5.1]],48),sm,0,0,0));
 for(let i=0;i<8;i++){const t=mesh(new THREE.TorusGeometry(.562,.008,6,48),dark,0,1.15+i*.5,0);t.rotation.x=Math.PI/2;core.add(t);}
 [1.4,4.55].forEach(y=>{const t=mesh(new THREE.TorusGeometry(.568,.03,8,48),accent,0,y,0);t.rotation.x=Math.PI/2;core.add(t);});
 core.add(mesh(new THREE.CylinderGeometry(.56,.56,.32,48),dark,0,4.78,0));
 const dec=new THREE.Mesh(new THREE.CylinderGeometry(.567,.567,3.0,32,1,true,-.6,1.2),new THREE.MeshBasicMaterial({map:decalTex(),transparent:true,depthWrite:false}));dec.position.y=2.75;core.add(dec);
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3+Math.PI/6;core.add(mesh(new THREE.CylinderGeometry(.19,.19,.05,16),dark,Math.cos(a)*.26,.7,Math.sin(a)*.26));const bl=mesh(lathe(bellPts(.07,.17,.55),20),bellM,Math.cos(a)*.26,.15,Math.sin(a)*.26);core.add(bl);}
 core.add(mesh(lathe(bellPts(.08,.19,.6),20),bellM,0,.1,0));
 for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;const f=mesh(new THREE.BoxGeometry(.34,.03,.26),dark,Math.cos(a)*.7,4.5,Math.sin(a)*.7);f.rotation.y=-a;core.add(f);}
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3+Math.PI/6;const f=mesh(new THREE.BoxGeometry(.05,.95,.55),sm,Math.cos(a)*.78,1.0,Math.sin(a)*.78);f.rotation.y=-a;core.add(f);}
 const cap=tag('capsule',new THREE.Group());
 const ogp=ogive(.52,1.95,16).map(p=>new THREE.Vector2(p[0],p[1])),fm=white.clone();fm.side=THREE.DoubleSide;
 const fA=new THREE.Group(),fB=new THREE.Group();fA.position.y=fB.position.y=5.1;
 fA.add(new THREE.Mesh(new THREE.LatheGeometry(ogp,24,0,Math.PI),fm));fB.add(new THREE.Mesh(new THREE.LatheGeometry(ogp,24,Math.PI,Math.PI),fm));
 fA.add(mesh(new THREE.SphereGeometry(.11,16,12),new THREE.MeshBasicMaterial({color:0x58d0f5}),.33,.4,.33));fB.add(mesh(new THREE.CylinderGeometry(.012,.012,.45,6),dark,0,2.1,0));
 cap.add(fA);cap.add(fB);o.fair=[fA,fB];o.coreG=core;
 const wr=mesh(new THREE.TorusGeometry(.52,.02,6,40),dark,0,5.12,0);wr.rotation.x=Math.PI/2;cap.add(wr);
 cap.add(mesh(new THREE.CylinderGeometry(.5,.5,2.1,32),M(0x59616f,{metalness:.6,roughness:.5}),0,4.05,0));
 cap.add(mesh(new THREE.CylinderGeometry(.28,.28,.9,24),gold,0,5.55,0));cap.add(mesh(new THREE.ConeGeometry(.28,.6,24),white,0,6.3,0));
 const nb=(b.counts['booster-side']||0),nh=(b.counts['booster-heavy']||0);
 const list=[];for(let i=0;i<nb;i++)list.push(false);for(let i=0;i<nh;i++)list.push(true);
 list.forEach((heavy,i)=>{
  const x=(i%2===0?-1:1)*(heavy?1.05:.95),r=heavy?.38:.27,h=heavy?3.8:3.2;
  const bg=new THREE.Group();bg.position.set(x,0,0);
  bg.add(mesh(new THREE.CylinderGeometry(r,r,h,32),sm,0,h/2+.4,0));
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
 if(b.counts.rtg){const w=new THREE.Group();w.add(mesh(new THREE.CylinderGeometry(.14,.14,1.0,20),gold,-.42,3.1,.42));for(let i=0;i<5;i++)w.add(mesh(new THREE.CylinderGeometry(.22,.22,.03,20),dark,-.42,2.7+i*.2,.42));w.add(mesh(new THREE.CylinderGeometry(.04,.04,.4,8),dark,-.3,3.1,.3));tag('rtg',w);}
 const ok=(evalBuild(b).power>0);
 const led=()=>new THREE.MeshBasicMaterial({color:ok?0x5ee6a8:0x553a3a});
 if(b.counts.camera){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.28,.28,.28),dark,-.46,4.3,.46));const l=mesh(new THREE.CylinderGeometry(.1,.12,.2,20),M(0x0c0d10),-.57,4.3,.57);l.rotation.z=Math.PI/2;l.rotation.y=Math.PI/4;w.add(l);w.add(mesh(new THREE.SphereGeometry(.07,12,10),new THREE.MeshBasicMaterial({color:0x58d0f5}),-.63,4.3,.63));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.4,4.48,.5));tag('camera',w);}
 if(b.counts.spectrometer){const w=new THREE.Group();w.add(mesh(new THREE.BoxGeometry(.3,.55,.3),M(0x3d6fa8,{metalness:.5}),.46,3.85,.46));w.add(mesh(new THREE.CylinderGeometry(.05,.05,.35,10),dark,.62,3.85,.62));w.add(mesh(new THREE.CylinderGeometry(.008,.008,.7,6),dark,.4,4.45,.4));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),.46,4.17,.46));tag('spectrometer',w);}
 if(b.counts.radar){const w=new THREE.Group();const pts=[];for(let i=0;i<=8;i++){const r=i*.055;pts.push([Math.max(.002,r),r*r*1.9]);}const d=mesh(lathe(pts,28),M(0xdfe3ea,{metalness:.6,roughness:.3,side:THREE.DoubleSide}),-.62,3.6,-.62);d.rotation.z=Math.PI/2;d.rotation.y=Math.PI/4;w.add(d);w.add(mesh(new THREE.CylinderGeometry(.03,.03,.34,8),dark,-.5,3.6,-.5));w.add(mesh(new THREE.SphereGeometry(.04,8,8),led(),-.42,3.95,-.42));tag('radar',w);}
 o.flame=flameMesh(.5,4);o.flame.position.y=.1;g.add(o.flame);
 return o;
}
function tween(obj){tweens.push({o:obj,t:0,d:.6,from:6});obj.position.y=6;}
function rebuildRocket(addedId){stg={};
 if(!R)return;
 if(rkGroup)rocketRoot.remove(rkGroup);
 rk=buildRocket(build);rkGroup=rk.group;rocketRoot.add(rkGroup);
 if(addedId&&rk.parts[addedId]){tween(rk.parts[addedId][rk.parts[addedId].length-1]);}
}
function emit(x,y,z,vx,vy,vz,life,r,g,b){const i=P.i++%NP,k=i*3;P.pos[k]=x;P.pos[k+1]=y;P.pos[k+2]=z;P.vel[k]=vx;P.vel[k+1]=vy;P.vel[k+2]=vz;P.base[k]=r;P.base[k+1]=g;P.base[k+2]=b;P.life[i]=P.max[i]=life;}
function updParticles(dt){for(let i=0;i<NP;i++){const k=i*3;if(P.life[i]>0){P.life[i]-=dt;P.pos[k]+=P.vel[k]*dt;P.pos[k+1]+=P.vel[k+1]*dt;P.pos[k+2]+=P.vel[k+2]*dt;const f=Math.max(0,P.life[i]/P.max[i]);P.col[k]=P.base[k]*f;P.col[k+1]=P.base[k+1]*f;P.col[k+2]=P.base[k+2]*f;}else{P.col[k]=P.col[k+1]=P.col[k+2]=0;}}
 geoP.attributes.position.needsUpdate=true;geoP.attributes.color.needsUpdate=true;}
function explode(x,y,z,n){for(let i=0;i<n;i++){const a=Math.random()*6.283,e=Math.random()*3.14-1.57,s=6+Math.random()*26;emit(x,y+2,z,Math.cos(a)*Math.cos(e)*s,Math.sin(e)*s*.9+6,Math.sin(a)*Math.cos(e)*s,.8+Math.random()*1.8,1,.45+Math.random()*.4,.12);}}
const LOOK={earth:{sky:[22,35,59],gnd:[14,22,36],orb:[34,96,170],atm:0x58d0f5,pad:0x172236,sun:0xfff0dc,star:.3},moon:{sky:[3,4,8],gnd:[78,78,86],orb:[135,135,145],atm:null,pad:0x4a4b55,sun:0xffffff,star:1},mars:{sky:[104,58,36],gnd:[92,42,24],orb:[172,80,46],atm:0xff8a3d,pad:0x4d2719,sun:0xffd9b0,star:.25}};
let gndMesh=null,padMesh=null,earthBall=null,sunSprite=null,exLight=null,curWorld='earth';
function glowTex(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const gr=x.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
function glow(color,size,x,y,z,tex){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));s.scale.set(size,size,1);s.position.set(x,y,z);return s;}
let clouds,ground,site,armP=[],hemiL,sunSpr,planets={},stg={},rvy=0,prevY=0,gTex={},wTex={},ap,treesM,mtns=[];
const ER=40000,SUND=new THREE.Vector3(-30,40,25).normalize();
const h3=(x,y,z)=>{const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n)};
function vn(x,y,z){const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),xf=x-a,yf=y-b,zf=z-c,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),L=(p,q,t)=>p+(q-p)*t;
 return L(L(L(h3(a,b,c),h3(a+1,b,c),u),L(h3(a,b+1,c),h3(a+1,b+1,c),u),v),L(L(h3(a,b,c+1),h3(a+1,b,c+1),u),L(h3(a,b+1,c+1),h3(a+1,b+1,c+1),u),v),w);}
function fbm(x,y,z,o){let s=0,a=.5;for(let i=0;i<(o||4);i++){s+=a*vn(x,y,z);x*=2;y*=2;z*=2;a/=2;}return s;}
const hp=(x,y,p)=>h3(((x%p)+p)%p,((y%p)+p)%p,1);
function vp(x,y,p){const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,s=u*u*(3-2*u),t=v*v*(3-2*v);return(hp(a,b,p)*(1-s)+hp(a+1,b,p)*s)*(1-t)+(hp(a,b+1,p)*(1-s)+hp(a+1,b+1,p)*s)*t;}
function fp(x,y,p){let s=0,a=.5;for(let i=0;i<4;i++){s+=a*vp(x,y,p);x*=2;y*=2;p*=2;a/=2;}return s;}
function sphereTex(w,h,fn,post){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),im=x.createImageData(w,h);
 for(let j=0;j<h;j++){const la=(.5-j/h)*Math.PI,cl=Math.cos(la),sl=Math.sin(la);for(let i=0;i<w;i++){const lo=i/w*6.2832,col=fn(cl*Math.cos(lo),sl,cl*Math.sin(lo),la),k=(j*w+i)*4;im.data[k]=col[0];im.data[k+1]=col[1];im.data[k+2]=col[2];im.data[k+3]=col[3]==null?255:col[3];}}
 x.putImageData(im,0,0);if(post)post(x,w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t;}
function mkTex(w,h,f,rep){const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);}t.anisotropy=8;return t;}
function buildSite(){
 site=new THREE.Group();scene.add(site);const tm=new THREE.MeshStandardMaterial({color:0x56637a,metalness:.7,roughness:.45}),St=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r==null?.85:r,metalness:m||0});
 const gen=cf=>mkTex(512,512,(x,w,h)=>{const im=x.createImageData(w,h);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const nn=fp(i/64,j/64,8),m=fp(i/16,j/16,32),q=Math.max(0,Math.min(1,(nn-.38)*2.4)),c=cf(q,m),k=(j*w+i)*4;im.data[k]=c[0];im.data[k+1]=c[1];im.data[k+2]=c[2];im.data[k+3]=255;}x.putImageData(im,0,0);},1);
 gTex.earth=gen((q,m)=>[62+q*70+m*26,92+q*34+m*26,48+q*24+m*10]);gTex.moon=gen((q,m)=>{const g=95+q*45+m*40;return[g,g,g*1.03];});gTex.mars=gen((q,m)=>[120+q*60+m*30,56+q*26+m*16,34+q*14+m*8]);const gt=gTex.earth;
 const cg=new THREE.SphereGeometry(ER,96,36,0,Math.PI*2,0,.05),pa=cg.attributes.position,ua=cg.attributes.uv;for(let i=0;i<pa.count;i++)ua.setXY(i,pa.getX(i)/360,pa.getZ(i)/360);
 ground=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({map:gt,roughness:1}));ground.position.y=-ER;site.add(ground);
 const ct=mkTex(256,256,(x,w,h)=>{x.fillStyle='#a09f9a';x.fillRect(0,0,w,h);for(let i=0;i<5000;i++){x.fillStyle='rgba('+(Math.random()<.5?'0,0,0':'255,255,255')+','+Math.random()*.12+')';x.fillRect(Math.random()*w,Math.random()*h,2,2);}x.strokeStyle='rgba(0,0,0,.3)';x.strokeRect(0,0,w,h);},4);
 ap=new THREE.Mesh(new THREE.CylinderGeometry(15,15.6,.3,64),new THREE.MeshStandardMaterial({map:ct,roughness:.9}));ap.position.y=.15;site.add(ap);
 const tr=new THREE.Mesh(new THREE.CircleGeometry(1.5,32),new THREE.MeshBasicMaterial({color:0x040506}));tr.rotation.x=-Math.PI/2;tr.position.y=.32;site.add(tr);
 const sl=new THREE.Mesh(new THREE.PlaneGeometry(9,2.6),new THREE.MeshBasicMaterial({color:0x050607}));sl.rotation.x=-Math.PI/2;sl.position.set(5.5,.32,0);site.add(sl);
 const rg=new THREE.Mesh(new THREE.TorusGeometry(2.3,.22,10,40),St(0x2d333c,.5,.6));rg.rotation.x=Math.PI/2;rg.position.y=.42;site.add(rg);
 [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(q=>{site.add(mesh(new THREE.BoxGeometry(.35,.8,.35),St(0xc8452d,.5,.4),q[0]*1.7,.7,q[1]*1.7));});
 const tw=new THREE.Group();[[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]].forEach(q=>tw.add(mesh(new THREE.BoxGeometry(.12,14,.12),tm,q[0],7,q[1])));
 for(let y=1;y<=13;y+=1.5){tw.add(mesh(new THREE.BoxGeometry(.9,.07,.07),tm,0,y,.4));tw.add(mesh(new THREE.BoxGeometry(.9,.07,.07),tm,0,y,-.4));[.4,-.4].forEach(z=>{const d=mesh(new THREE.BoxGeometry(.07,1.6,.07),tm,0,y+.75,z);d.rotation.z=.5;tw.add(d);});}
 armP=[];[4,7.5,11].forEach(y=>{const p=new THREE.Group();p.position.y=y;p.add(mesh(new THREE.BoxGeometry(2.7,.18,.22),tm,1.55,0,0));p.add(mesh(new THREE.BoxGeometry(.2,.2,.5),M(0xffcf5a,{metalness:.3}),2.8,0,0));tw.add(p);armP.push(p);});
 tw.add(mesh(new THREE.ConeGeometry(.35,.9,4),tm,0,14.4,0));const bc=mesh(new THREE.SphereGeometry(.16,12,10),new THREE.MeshBasicMaterial({color:0xff4050}),0,15.1,0);tw.add(bc);window.__beacon=bc;tw.position.set(-4.6,0,0);site.add(tw);
 [[30,25],[-34,22],[28,-30],[-30,-28]].forEach(q=>{site.add(mesh(new THREE.CylinderGeometry(.12,.2,30,8),tm,q[0],15,q[1]));site.add(mesh(new THREE.SphereGeometry(.3,10,8),new THREE.MeshBasicMaterial({color:0xff3030}),q[0],30.2,q[1]));});
 [[12,12],[-14,10],[10,-14]].forEach(q=>{const lp=new THREE.Group();lp.add(mesh(new THREE.CylinderGeometry(.08,.1,4.5,8),tm,0,2.25,0));lp.add(mesh(new THREE.BoxGeometry(.9,.25,.25),new THREE.MeshBasicMaterial({color:0xfff2c8}),0,4.6,0));lp.position.set(q[0],0,q[1]);lp.lookAt(0,4.6,0);site.add(lp);});
 const tk=mesh(new THREE.CylinderGeometry(2.2,2.2,10,24),St(0xf2f2f2,.4,.2),42,2.4,18);tk.rotation.z=Math.PI/2;site.add(tk);site.add(mesh(new THREE.SphereGeometry(3.4,32,24),St(0xf2f2f2,.35,.3),52,3.4,-8));
 site.add(mesh(new THREE.BoxGeometry(40,48,32),St(0xe8e8e6,.7),-100,24,-75));site.add(mesh(new THREE.BoxGeometry(14,36,1),St(0x1a2a55),-100,18,-58.6));site.add(mesh(new THREE.BoxGeometry(40.2,7,32.2),St(0x1a2a55),-100,44,-75));
 site.add(mesh(new THREE.BoxGeometry(24,9,16),St(0xd8d8d6),70,4.5,-70));site.add(mesh(new THREE.BoxGeometry(5,.1,700),St(0x2b2c2e,.95),0,.08,360));site.add(mesh(new THREE.BoxGeometry(260,.1,6),St(0x2b2c2e,.95),-125,.08,-30));
 const tg=new THREE.InstancedMesh(new THREE.ConeGeometry(1.5,6,6),St(0x2d5a34,1),220),dm=new THREE.Object3D();for(let i=0;i<220;i++){const a=Math.random()*6.283,d=40+Math.random()*360,s=.7+Math.random()*.9;dm.position.set(Math.cos(a)*d,3*s,Math.sin(a)*d);dm.scale.set(s,s,s);dm.updateMatrix();tg.setMatrixAt(i,dm.matrix);}site.add(tg);treesM=tg;
 for(let i=0;i<24;i++){const a=i/24*6.283+Math.random()*.2,d=650+Math.random()*450,r=60+Math.random()*90,h=30+Math.random()*80;const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,7),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.28,.16,.27+Math.random()*.1),roughness:1,flatShading:true}));m.position.set(Math.cos(a)*d,h/2-3,Math.sin(a)*d);m.rotation.y=Math.random()*3;site.add(m);mtns.push(m);}
 const fl1=new THREE.PointLight(0xffe2b0,.8,50);fl1.position.set(8,6,8);site.add(fl1);
}
function buildSpace(){
 const et=sphereTex(768,384,(x,y,z)=>{const n=fbm(x*3+5,y*3,z*3,5);if(Math.abs(y)>.9)return[238,244,250];if(n<.52){const d=Math.min(1,(.52-n)*3.2);return[8+(1-d)*46,38+(1-d)*80,92+(1-d)*86];}const m=fbm(x*9,y*9,z*9,3),dry=1-Math.abs(y)*1.1;return m>.52&&dry>.35?[168,140,92]:[42+70*dry*m,86+50*m,44+10*m];});
 planet=new THREE.Mesh(new THREE.SphereGeometry(ER-2,128,96),new THREE.MeshStandardMaterial({map:et,roughness:.9}));planet.position.y=-ER;planet.rotation.z=1.1;scene.add(planet);
 const cl=sphereTex(512,256,(x,y,z)=>{const n=fbm(x*4+9,y*5,z*4,5);return[255,255,255,Math.max(0,Math.min(.9,(n-.48)*5))*255];});
 clouds=new THREE.Mesh(new THREE.SphereGeometry(ER+1500,96,64),new THREE.MeshStandardMaterial({map:cl,transparent:true,depthWrite:false,roughness:1}));clouds.position.y=-ER;scene.add(clouds);
 atmo=new THREE.Mesh(new THREE.SphereGeometry(ER*1.06,96,64),new THREE.ShaderMaterial({uniforms:{fade:{value:0},col:{value:new THREE.Color(0x52a0ff)}},transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,
  vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform float fade;uniform vec3 col;varying vec3 vN;void main(){float i=pow(max(0.0,0.74-dot(vN,vec3(0.0,0.0,1.0))),3.0);gl_FragColor=vec4(col,1.0)*i*1.9*fade;}'}));atmo.position.y=-ER;scene.add(atmo);
 wTex.earth=et;const moonT=sphereTex(512,256,(x,y,z)=>{const n=fbm(x*3,y*3,z*3,4),d=fbm(x*14,y*14,z*14,3),g=150+d*70-(n<.45?55:0);return[g,g,g*.97];},(x,w,h)=>{for(let i=0;i<260;i++){const cx=Math.random()*w,cy=h*.1+Math.random()*h*.8,r=2+Math.random()*Math.random()*16;x.beginPath();x.arc(cx,cy,r,0,6.3);x.fillStyle='rgba(60,60,60,.35)';x.fill();x.lineWidth=1.2;x.strokeStyle='rgba(235,235,235,.45)';x.stroke();}});
 const marsT=sphereTex(512,256,(x,y,z)=>{const n=fbm(x*3,y*3,z*3,5),m=fbm(x*10,y*10,z*10,3);if(Math.abs(y)>.93)return[240,240,245];const d=n<.45?.55:1;return[(170+60*m)*d,(88+40*m)*d,(58+20*m)*d];});
 wTex.moon=moonT;wTex.mars=marsT;const jupT=sphereTex(512,256,(x,y,z,la)=>{const t=Math.sin(la*16+fbm(x*3,y*9,z*3,4)*4)*.5+.5,k=t<.3?60:0;return[196+t*40-k,150+t*50-k,110+t*50-k];});
 const satT=sphereTex(256,128,(x,y,z,la)=>{const b=Math.sin(la*22+fbm(x*2,y*7,z*2,3)*2)*.5+.5;return[214+b*24,186+b*26,130+b*28];});
 const mk=(r,t,p)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,72,48),new THREE.MeshStandardMaterial({map:t,roughness:1}));m.position.set(p[0],p[1],p[2]);scene.add(m);return m;};
 planets.moon=mk(7000,moonT,[-70000,55000,-110000]);planets.mars=mk(3800,marsT,[95000,45000,-150000]);planets.saturn=mk(15000,satT,[175000,95000,-260000]);planets.jupiter=mk(19000,jupT,[-210000,70000,-290000]);
 earthBall=new THREE.Mesh(new THREE.SphereGeometry(2800,48,32),new THREE.MeshStandardMaterial({map:et,roughness:.8}));earthBall.position.set(-15000,7000,-34000);earthBall.visible=false;scene.add(earthBall);
 const rt=mkTex(512,4,(x,w,h)=>{for(let i=0;i<w;i++){const u=i/w,a=u<.08?0:u<.42?.75:u<.46?.05:u<.9?.62:0;x.fillStyle='rgba('+(205-u*50|0)+','+(180-u*50|0)+','+(140-u*40|0)+','+a*(.6+.4*Math.sin(i*.9))+')';x.fillRect(i,0,1,h);}});
 const rgg=new THREE.RingGeometry(19500,35000,128),rp=rgg.attributes.position,ru=rgg.attributes.uv;for(let i=0;i<rp.count;i++)ru.setXY(i,(Math.hypot(rp.getX(i),rp.getY(i))-19500)/15500,.5);
 const ring=new THREE.Mesh(rgg,new THREE.MeshBasicMaterial({map:rt,side:THREE.DoubleSide,transparent:true,depthWrite:false}));ring.rotation.x=-1.25;ring.rotation.y=.3;planets.saturn.add(ring);
 const sp=[],sc=[];for(let i=0;i<9000;i++){const u=Math.random()*2-1,a=Math.random()*6.283,s=Math.sqrt(1-u*u),p=new THREE.Vector3(s*Math.cos(a),u,s*Math.sin(a));if(i>5500){p.y*=.12;p.normalize().applyAxisAngle(new THREE.Vector3(1,0,.3).normalize(),.9);}sp.push(p.x*450000,p.y*450000,p.z*450000);const c=new THREE.Color().setHSL(.58+Math.random()*.12,.4,.6+Math.random()*.4);sc.push(c.r,c.g,c.b);}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));sg.setAttribute('color',new THREE.Float32BufferAttribute(sc,3));
 stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:0,depthWrite:false,fog:false}));stars.frustumCulled=false;scene.add(stars);
 const gl=mkTex(256,256,(x)=>{const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.12,'rgba(255,240,200,.9)');g.addColorStop(.4,'rgba(255,200,120,.18)');g.addColorStop(1,'rgba(255,200,120,0)');x.fillStyle=g;x.fillRect(0,0,256,256);});
 sunSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:gl,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,transparent:true}));sunSpr.scale.set(60000,60000,1);scene.add(sunSpr);
}

const WSKY={earth:[.47,.66,.86],moon:[0,0,0],mars:[.74,.5,.36]},WFOG={earth:[.66,.8,.93],moon:[0,0,0],mars:[.8,.58,.44]},WFD={earth:.0042,moon:0,mars:.003};
function applyWorld(w){curWorld=w;if(!R||!site)return;const m=w==='moon',r=w==='mars';
 ground.material.map=gTex[w];ground.material.needsUpdate=true;planet.material.map=wTex[w];planet.material.needsUpdate=true;planet.rotation.z=w==='earth'?1.1:0;
 clouds.visible=w==='earth';treesM.visible=w==='earth';earthBall.visible=m;planets.moon.visible=!m;planets.mars.visible=!r;
 atmo.material.uniforms.col.value.set(r?0xff8a3d:0x52a0ff);sunL.color.setHex(m?0xffffff:r?0xffd9b0:0xfff0dc);ap.material.color.setHex(r?0xb08070:m?0x9a9aa0:0xffffff);
 mtns.forEach(q=>q.material.color.setHSL(m?.62:r?.04:.28,m?.04:r?.5:.16,m?.3:r?.3:.3));}
function skyFor(alt){const sk=clamp(alt/70000,0,1),dk=Math.pow(1-sk,1.7),S=WSKY[curWorld],F=WFOG[curWorld],mn=curWorld==='moon';
 scene.background.setRGB(S[0]*dk,S[1]*dk,S[2]*dk);scene.fog.color.setRGB(F[0]*dk,F[1]*dk,F[2]*dk);scene.fog.density=WFD[curWorld]*Math.pow(1-clamp(alt/26000,0,1),3);
 stars.material.opacity=mn?1:(curWorld==='mars'?.25:0)+(1-(curWorld==='mars'?.25:0))*clamp((alt-18000)/40000,0,1);hemiL.intensity=mn?.1:.1+.3*dk;sunL.intensity=1.3+.9*sk;
 atmo.material.uniforms.fade.value=mn?0:clamp((alt-12000)/30000,0,1);ground.visible=site.visible=alt<45000;sunSpr.material.opacity=.55+.45*sk;}
const GG=()=>WORLDS[curWorld].g;
function arms_ok(){return armP.length>0;}

function init3D(){
 try{R=new THREE.WebGLRenderer({canvas:cv,antialias:true});}catch(e){R=null;$('#nogl').hidden=false;return;}
 R.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 try{R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.1;}catch(e){}
 scene=new THREE.Scene();scene.background=new THREE.Color(0x78a9d8);scene.fog=new THREE.FogExp2(0xa9cdee,.0042);
 camera=new THREE.PerspectiveCamera(40,1,.1,700000);
 try{const pm=new THREE.PMREMGenerator(R);const es=new THREE.Scene();const c=document.createElement('canvas');c.width=4;c.height=256;const x=c.getContext('2d');const gr=x.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#a9c3f0');gr.addColorStop(.48,'#2b3556');gr.addColorStop(.5,'#0b0e16');gr.addColorStop(1,'#1d2331');x.fillStyle=gr;x.fillRect(0,0,4,256);es.add(new THREE.Mesh(new THREE.SphereGeometry(10,32,16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.BackSide})));const lt=new THREE.Mesh(new THREE.PlaneGeometry(7,3),new THREE.MeshBasicMaterial({color:0xfff4e0}));lt.position.set(-5,4,4);lt.lookAt(0,0,0);es.add(lt);scene.environment=pm.fromScene(es,.04).texture;}catch(e){}
 hemiL=new THREE.HemisphereLight(0x9bbcff,0x3a3a30,.4);scene.add(hemiL);
 sunL=new THREE.DirectionalLight(0xfff0dc,1.2);sunL.position.set(-30,40,25);scene.add(sunL);
 const rim=new THREE.DirectionalLight(0x58d0f5,.6);rim.position.set(30,12,-30);scene.add(rim);
 exLight=new THREE.PointLight(0xff8a3d,0,70,2);scene.add(exLight);
 buildSite();buildSpace();
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
function frame3D(dt){
 // tweens
 for(let i=tweens.length-1;i>=0;i--){const t=tweens[i];t.t+=dt;const u=clamp(t.t/t.d,0,1),k=1-Math.pow(1-u,3);t.o.position.y=t.from*(1-k);if(u>=1){t.o.position.y=0;tweens.splice(i,1);}}
 // debris
 for(const d of debris){if(d.landed)continue;d.t+=dt;d.vy-=GG()*1.4*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.g.rotation.z+=d.rz*dt;d.g.rotation.x+=d.rx*dt;
  if(d.y<=.3){d.y=.3;d.landed=1;d.g.rotation.set(0,d.g.rotation.y,1.5);for(let n=0;n<70;n++){const a=Math.random()*6.28,sp=3+Math.random()*9;emit(d.x,.4,d.z,Math.cos(a)*sp,1+Math.random()*3,Math.sin(a)*sp,2.2,.5,.46,.4);}}
  d.g.position.set(d.x,d.y,d.z);}
 if(arms_ok()){const k=mode==='countdown'?clamp((2.6-cdT)/1.6,0,1):(mode==='flight'||mode==='ended')?1:0;armP.forEach((p,i)=>p.rotation.y=-k*(1.3+i*.1));}
 // rocket pose
 let jx=0,jz=0;
 if(mode==='flight'&&fl&&fl.phase==='shake'&&!RM){const amp=.12+.5*clamp((1.2-fl.d.twr)/.3,0,1);jx=(Math.random()-.5)*amp;jz=(Math.random()-.5)*amp;shake=amp;}else shake=(mode==='countdown'&&cdT<1.6&&!RM)?.08:(mode==='flight'&&fl&&fl.phase==='burn'&&fl.y<400&&!RM?.06:0);
 rkx=jx;rkz=jz;
 if(mode==='flight'||mode==='ended'||mode==='countdown'){
  const a=fl?fl.y:0;visAlt+=(a-visAlt)*Math.min(1,dt*14);rky=vis(visAlt);
 }else rky=0;
 rocketRoot.position.set(rkx,rky,rkz);rvy=dt>0?clamp((rky-prevY)/dt,0,500):0;prevY=rky;
 // flames
 const ign=mode==='countdown'&&cdT<1.6&&!exploded;
 if(rk){
  const live=mode==='flight'&&fl&&(fl.phase==='burn'||fl.phase==='shake')&&!exploded;
  const fk=.85+Math.random()*.3;
  const coreOn=(live&&fl.core.prop>0&&(fl.phase==='burn'||Math.random()<.5))||ign;
  rk.flame.visible=!!coreOn;if(coreOn){rk.flame.scale.set(fk,fk*(fl.phase==='shake'?.5:1),fk);}
  rk.boosters.forEach((b,i)=>{const fb=fl&&fl.boosters[i];b.flame.visible=!!(live&&fb&&fb.attached&&fb.prop>0&&fl.phase==='burn');if(b.flame.visible)b.flame.scale.set(fk,fk,fk);});
  if(coreOn&&rky<14){for(let n=0;n<5;n++){const a=Math.random()*6.28,sp=6+Math.random()*16;emit(rkx,.5,rkz,Math.cos(a)*sp,.5+Math.random()*2,Math.sin(a)*sp,2.6,.55,.52,.48);}}
  if(coreOn&&(ign||fl.phase==='burn')){for(let n=0;n<3;n++)emit(rkx+(Math.random()-.5)*.4,rky,rkz+(Math.random()-.5)*.4,(Math.random()-.5)*3,-10-Math.random()*8,(Math.random()-.5)*3,.45,1,.62,.2);
   emit(rkx,rky-1,rkz,(Math.random()-.5)*2,-3,(Math.random()-.5)*2,2.4,.34,.34,.4);
   rk.boosters.forEach((b,i)=>{const fb=fl.boosters[i];if(fb&&fb.attached&&fb.prop>0){emit(rkx+b.x,rky,rkz,(Math.random()-.5)*2,-9,(Math.random()-.5)*2,.4,1,.55,.15);emit(rkx+b.x,rky-.5,rkz,0,-2,0,1.8,.32,.32,.36);}});}
 }
 if(exLight){const burn=rk&&mode==='flight'&&fl&&fl.phase==='burn'&&fl.core.prop>0&&!exploded;exLight.intensity=(burn||ign)?3+Math.random()*1.5:(shake?1.2:0);exLight.position.set(rkx,rky-1.5,rkz);}
 // jettison
 if(fl&&rk&&fl.jett.length){while(fl.jett.length){const b=fl.jett.shift();const i=fl.boosters.indexOf(b);const rb=rk.boosters[i];if(rb&&R){scene.add(rb.g);const sg=Math.sign(rb.x)||1;debris.push({g:rb.g,x:rkx+rb.x,y:rky,z:rkz,vx:sg*3,vy:rvy*.9,vz:(Math.random()-.5)*2,rx:(Math.random()-.5)*3,rz:-sg*(1+Math.random()*2),t:0});rb.flame.visible=false;}}}
 if(fl&&rk&&R&&mode==='flight'&&!exploded&&fl.phase!=='shake'){
  if(!stg.f&&fl.y>=TARGET_ALT*.7){stg.f=1;rk.fair.forEach((h,i)=>{scene.attach(h);debris.push({g:h,x:h.position.x,y:h.position.y,z:h.position.z,vx:(i?1:-1)*5,vy:rvy*.9,vz:0,rx:i?1.2:-1.2,rz:i?.8:-.8,t:0});});logEv('Fairing separation · payload exposed','ok',fl.t);}
  if(!stg.c&&fl.meco){stg.c=1;const c=rk.coreG;scene.attach(c);debris.push({g:c,x:c.position.x,y:c.position.y,z:c.position.z,vx:1.5,vy:rvy*.6,vz:-1,rx:.3,rz:.2,t:0});logEv('Core stage separation · payload coasting','ok',fl.t);}
 }
 updParticles(dt);
 skyFor(visAlt);
 // camera
 let tx=0,ty=3.2,tz=0,dist=cam.dist;
 if(mode==='flight'||mode==='countdown'){tx=rkx;ty=rky+3.2;tz=rkz;}
 else if(mode==='ended'){tx=rkx;ty=rky+3.2;tz=rkz;if(fl&&fl.outcome==='ORBIT'||fl&&fl.outcome==='POWER'){if(cam.user<=0){cam.az+=dt*.12;dist=Math.min(cam.dist+dt*6,150);cam.dist=dist;}}}
 if(mode==='build'&&cam.user<=0&&!RM){cam.az+=dt*(view==='hero'?.06:.14);}
 if(cam.user>0)cam.user-=dt;
 const sx=shake&&!RM?(Math.random()-.5)*shake:0,sy=shake&&!RM?(Math.random()-.5)*shake:0;
 camera.position.set(tx+dist*Math.sin(cam.pol)*Math.sin(cam.az)+sx,ty+dist*Math.cos(cam.pol)+sy,tz+dist*Math.sin(cam.pol)*Math.cos(cam.az));
 camera.lookAt(tx,ty,tz);
 stars.position.copy(camera.position);sunSpr.position.copy(camera.position).addScaledVector(SUND,400000);clouds.rotation.y+=dt*.004;
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
function loadBuild(b,label){if(mode!=='build')return;const w=build.world;hist.push(clone(build));redo.length=0;build=clone(b);build.world=w;onChange(null,label);}

/* ---------- UI render ---------- */
function gate(id,ok,label,val,sub,frac,mark,stat){return '<div class="g '+(ok===null?'neutral':ok?'':'bad')+'"><div class="gl">'+label+'</div><div class="gv">'+val+'</div><div class="bar"><i style="width:'+clamp(frac*100,0,100)+'%"></i>'+(mark!=null?'<b style="left:'+mark*100+'%"></b>':'')+'</div><div class="gs"><span class="chip">'+(ok===null?'·':ok?'✓':'✕')+' '+stat+'</span><span>'+sub+'</span></div></div>';}
function renderGauges(){
 const d=evalBuild(build),G=d.gates;let gen=0,draw=0;for(const p of PARTS){const n=count(build,p.id);if(p.power>0)gen+=n*p.power;else draw-=n*p.power;}
 const f=sim(build);const ap=G.twr.pass?f.maxY/1000:0;
 const eff=efficiency(d);
 const rows=[
  gate('twr',G.twr.pass&&G.struct.pass,'Thrust / weight',d.twr.toFixed(2),'min 1.20 · load '+d.loadG.toFixed(1)+' g of '+d.limit.toFixed(1),d.twr/3,1.2/3,G.twr.pass?(G.struct.pass?'OK':'TOO HIGH'):'TOO LOW'),
  gate('bud',G.budget.pass,'Budget',money(d.cost),'ceiling $1.00M',d.cost/1.2e6,1/1.2,G.budget.pass?'OK':'OVER'),
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
 rebuildRocket();debris.forEach(d=>scene&&scene.remove(d.g));debris.length=0;
 mode='countdown';cdT=3.2;setLocked(true);$('#launch').hidden=true;$('#log').innerHTML='';
 $('#tele').hidden=false;$('#speedRow').hidden=false;renderSpeed();$('#hint').textContent='Drag to orbit · Scroll to zoom';setStatus('Countdown');
 cam.dist=17;cam.pol=1.3;announce('Launch sequence started');startRumble();
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
 if(k==='budget')return g.pass?'Hardware and crew cost '+money(g.value)+', under the $1.00M ceiling.':'Hardware and crew cost '+money(g.value)+', which is '+money(g.value-g.limit)+' over the $1.00M ceiling.';
 if(k==='mass')return g.pass?'Launch mass is '+Math.round(g.value)+' kg, within the 5,000 kg pad limit.':'Launch mass is '+Math.round(g.value)+' kg, which is '+Math.round(g.value-g.limit)+' kg over the pad limit.';
 if(k==='power')return g.pass?'Generation beats consumption by '+g.value.toFixed(1)+' kW.':'Consumption exceeds generation by '+(-g.value).toFixed(1)+' kW. Payloads go dark in orbit.';
 return g.pass?'Liftoff load is '+g.value.toFixed(2)+' g. '+m+' holds up to '+g.limit.toFixed(1)+' g.':'Liftoff load is '+g.value.toFixed(2)+' g but '+m+' only holds '+g.limit.toFixed(1)+' g. The structure breaks on ascent.';
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
function backToBuild(){closeDeb();mode='build';fl=null;exploded=false;visAlt=0;rky=0;if(R){debris.forEach(d=>scene.remove(d.g));debris.length=0;P.life.fill(0);rebuildRocket();rkGroup.visible=true;}
 $('#log').innerHTML='';$('#tele').hidden=true;$('#speedRow').hidden=true;$('#count').hidden=true;$('#launch').hidden=false;$('#hint').textContent='Drag to orbit · Scroll to zoom · L to launch';setStatus('Build');cam.dist=17;cam.pol=1.32;cam.user=0;stopRumble();setLocked(false);}

/* ---------- hero, nav, worlds ---------- */
const COPY={
 earth:{eye:'Mission : <b>Reach orbit</b>',t:'Earth',c:'Our home world pulls hard: 9.81 m/s² and a thick atmosphere that fights every metre of the climb. Design a rocket that beats gravity, drag and the budget, then fly it.',s:[['Surface gravity','9.81','m/s²'],['Air density','1.225','kg/m³'],['Planet radius','6,371','km'],['Planet type','Terrestrial','']]},
 moon:{eye:'Mission : <b>Lunar ascent</b>',t:'Moon',c:'One sixth of Earth’s gravity and no air at all. Thrust is easy here, so the real test is building light, cheap and fast. Watch the Earth hang in the black sky.',s:[['Surface gravity','1.62','m/s²'],['Air density','Vacuum',''],['Planet radius','1,737','km'],['Body type','Satellite','']]},
 mars:{eye:'Mission : <b>The red frontier</b>',t:'Mars',c:'A dusty, cold world with a very thin atmosphere and 38% of Earth’s gravity. Fewer drag losses, but every kilogram you carry still counts against the budget.',s:[['Surface gravity','3.71','m/s²'],['Air density','0.020','kg/m³'],['Planet radius','3,390','km'],['Planet type','Terrestrial','']]}
};
const WN={earth:'Earth',moon:'Moon',mars:'Mars'};
function renderHero(){const w=build.world,c=COPY[w];
 $('#wtabs').innerHTML=Object.keys(COPY).map(k=>'<button data-world="'+k+'" aria-pressed="'+(k===w)+'">'+(k==='earth'?'Earth orbit':WN[k])+'</button>').join('');
 $('#hEye').innerHTML=c.eye;$('#hTitle').textContent=c.t;$('#hCopy').textContent=c.c;
 $('#hStrip').innerHTML=c.s.map(x=>'<div><small>'+x[0]+'</small><b>'+x[1]+(x[2]?'<span>'+x[2]+'</span>':'')+'</b></div>').join('');
 $('#wsel').innerHTML=Object.keys(COPY).map(k=>'<button data-world="'+k+'" aria-pressed="'+(k===w)+'">'+WN[k]+'</button>').join('');}
function setWorld(w){if(mode!=='build'||!COPY[w])return;if(w!==build.world){build.world=w;cache.clear();}document.body.dataset.world=w;applyWorld(w);renderHero();renderAll();logEv('Destination: '+WN[w],'');announce('Destination '+WN[w]);}
function setView(v){if(mode!=='build'&&v==='hero')return;view=v;$('#app').classList.toggle('hero',v==='hero');$('#nv-hero').setAttribute('aria-current',String(v==='hero'));$('#nv-build').setAttribute('aria-current',String(v==='build'));
 cam.user=0;cam.pol=v==='hero'?1.42:1.32;cam.dist=v==='hero'?(innerWidth<900?34:24):17;if(v==='build')renderAll();
 setTimeout(resize,30);}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
 const t=e.target.closest('button,[data-tab]');if(!t)return;
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

/* ---------- main loop ---------- */
let last=performance.now();
function loop(now){const dt=Math.min(.1,(now-last)/1000);last=now;try{tick(dt);if(R)frame3D(dt);}catch(err){console.error(err);}requestAnimationFrame(loop);}
init3D();renderAll();renderHero();document.body.dataset.world='earth';setView('hero');logEv('Starter build loaded. Add parts, then launch.','');
window.__ng={get mode(){return mode;},get fl(){return fl;},launch,get build(){return build;}};
requestAnimationFrame(loop);
})();
