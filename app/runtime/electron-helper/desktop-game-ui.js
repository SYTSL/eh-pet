(() => {
 const canvas=document.getElementById('scene'),ctx=canvas.getContext('2d'),video=document.getElementById('pet'),bar=document.getElementById('bar'),status=document.getElementById('status');
 const W=innerWidth,H=innerHeight;canvas.width=W;canvas.height=H;
 video.src=new URLSearchParams(location.search).get('video');video.play().catch(()=>{});
 let pigScale=1,actorScale=1,slingScale=1,savedPigSizes=[];
 try{const saved=JSON.parse(localStorage.getItem('eh-game-sizes')||'{}');pigScale=Number.isFinite(saved.pig)?Math.max(.5,Math.min(2,saved.pig)):1;actorScale=Number.isFinite(saved.pet)?Math.max(.5,Math.min(8,saved.pet)):1;slingScale=Number.isFinite(saved.sling)?Math.max(.5,Math.min(8,saved.sling)):1;savedPigSizes=Array.isArray(saved.pigs)?saved.pigs:[]}catch{}
 const sling={x:Math.min(200,W*.2),y:H-160};
 const actor={x:sling.x,y:sling.y,vx:0,vy:0,r:32*actorScale,state:'loaded'};
 let pigs=[],edit=true,drag=null,last=performance.now(),shots=0,hits=0,notice='';
 let beams=[],selectedBeam=null, rewardHits=0;
 let effects=[],clearUntil=0,audio;
 const beamHalfLength=60, beamHalfWidth=8;
 const floor=H-62;
 const topY=()=>Math.min(72*actorScale,H*.35);
 const landingY=()=>Math.max(topY()+30,Math.min(floor,H-8-68*actorScale));
 const slingHit=p=>Math.abs(p.x-sling.x)<44*slingScale&&p.y>sling.y-25*slingScale&&p.y<sling.y+85*slingScale;
 const handleHit=p=>Math.abs(p.x-sling.x)<20*slingScale&&p.y>sling.y+35*slingScale&&p.y<sling.y+85*slingScale;
 const loadRange=()=>({x:Math.max(110,55*actorScale+50*slingScale),y:Math.max(110,75*actorScale+40*slingScale)});
 const canLoad=()=>Math.abs(actor.x-sling.x)<=loadRange().x&&Math.abs(actor.y-sling.y)<=loadRange().y;
 const launchSpeed=()=>6*Math.sqrt(actorScale);
 const pigArt=[1,2,3].map(n=>{const image=new Image(),asset={canvas:null,image};image.onload=()=>{
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height),d=pixels.data,seen=new Uint8Array(c.width*c.height),queue=new Int32Array(seen.length);let begin=0,end=0;
  const add=i=>{if(i<0||i>=seen.length||seen[i])return;seen[i]=1;const p=i*4,m=Math.min(d[p],d[p+1],d[p+2]),M=Math.max(d[p],d[p+1],d[p+2]);if(m<200||M-m>18)return;d[p+3]=0;queue[end++]=i};
  for(let x=0;x<c.width;x++){add(x);add((c.height-1)*c.width+x)}for(let y=0;y<c.height;y++){add(y*c.width);add(y*c.width+c.width-1)}while(begin<end){const i=queue[begin++],x=i%c.width;add(i-c.width);add(i+c.width);if(x)add(i-1);if(x<c.width-1)add(i+1)}g.putImageData(pixels,0,0);asset.canvas=c;
 };return asset});
 window.desktopGame.assets().then(urls=>urls.forEach((url,i)=>pigArt[i].image.src=url)).catch(()=>{notice='猪头素材加载失败，请重开游戏。'});
 function addPig(falling=true){if(pigs.length>=15)return;const r=28*(Number.isFinite(savedPigSizes[pigs.length])?Math.max(.5,Math.min(8,savedPigSizes[pigs.length])):pigScale);pigs.push({x:Math.max(r,Math.min(W-r-10,W*.78+Math.random()*W*.15)),y:falling?Math.min(H*.25,r+90):H-120-(pigs.length%3)*90,r,art:pigs.length%3,id:Math.random(),vy:0,falling});}
 function setEdit(value){
  edit=value;
  document.getElementById('mode').textContent=edit?'开始发射':'摆放目标';
  document.getElementById('build-tools').hidden=!edit;
 }
 function reset(){effects=[];clearUntil=0;beams=[];selectBeam(null);pigs=[];for(let i=0;i<3;i++)addPig(false);Object.assign(actor,{x:sling.x,y:sling.y,vx:0,vy:0,state:'loaded'});setEdit(true);shots=hits=0;notice='';}
 reset();
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function report(){const r=bar.getBoundingClientRect();window.desktopGame.update({rewardHits,dragging:!!drag,position:{x:actor.x,y:actor.y},regions:[{x:r.x,y:r.y,w:r.width,h:r.height},{x:actor.x-55*actorScale,y:actor.y-80*actorScale,w:110*actorScale,h:145*actorScale},{x:sling.x-44*slingScale,y:sling.y-25*slingScale,w:88*slingScale,h:110*slingScale},...pigs.map(p=>({x:p.x-p.r,y:p.y-p.r,w:p.r*2,h:p.r*2})),...beams.map(b=>{const s=beamBounds(b);return {x:b.x-s.x,y:b.y-s.y,w:2*s.x,h:2*s.y}}),...handleRegion(),...popupRegion()]})}
 function point(e){return{x:e.clientX,y:e.clientY}}
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const p=point(e);
  if(edit&&selectedBeam&&distance(p,rotationHandle(selectedBeam))<=12){
   drag={kind:'rotate-beam',beam:selectedBeam,dx:0,dy:0,
    offset:selectedBeam.angle-Math.atan2(p.y-selectedBeam.y,p.x-selectedBeam.x)};
  }
  else if(edit&&handleHit(p))drag={kind:'sling',dx:p.x-sling.x,dy:p.y-sling.y};
  else if(Math.abs(p.x-actor.x)<55*actorScale&&p.y>actor.y-80*actorScale&&p.y<actor.y+65*actorScale&&actor.state!=='flying')drag={kind:!edit&&actor.state==='loaded'?'pull':'actor',dx:p.x-actor.x,dy:p.y-actor.y};
  else {
   const pig=[...pigs].reverse().find(pig=>distance(p,pig)<pig.r+5);
   const beam=edit&&beamAt(p);
   if(pig)drag={kind:'pig',pig,dx:p.x-pig.x,dy:p.y-pig.y};
   else if(beam){selectBeam(beam);drag={kind:'beam',beam,dx:p.x-beam.x,dy:p.y-beam.y}}
   else if(edit&&slingHit(p))drag={kind:'sling',dx:p.x-sling.x,dy:p.y-sling.y};
  }
  if(drag){if(drag.kind==='pig'){drag.pig.vy=0;drag.pig.falling=false;}canvas.setPointerCapture(e.pointerId);report();}
  if(drag?.kind==='pull')unlockAudio();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag)return;const p=point(e),x=clamp(p.x-drag.dx,40,W-40),y=clamp(p.y-drag.dy,95,floor);
  if(drag.kind==='pig'){Object.assign(drag.pig,{x,y,vy:0,falling:false});}
  else if(drag.kind==='rotate-beam'){
   const beam=drag.beam;
   let angle=Math.atan2(p.y-beam.y,p.x-beam.x)+drag.offset;
   if(e.shiftKey)angle=Math.round(angle/(Math.PI/12))*(Math.PI/12);
   beam.angle=wrapAngle(angle);clampBeam(beam);
  }
  else if(drag.kind==='beam'){Object.assign(drag.beam,{x,y});clampBeam(drag.beam);}
  else if(drag.kind==='sling'){sling.x=x;sling.y=Math.min(y,Math.max(90,H-76*slingScale-8),landingY());if(actor.state==='loaded'){actor.x=sling.x;actor.y=sling.y;}}
  else if(drag.kind==='pull'){const dx=x-sling.x,dy=y-sling.y,k=Math.min(1,140/Math.max(1,Math.hypot(dx,dy)));actor.x=sling.x+dx*k;actor.y=sling.y+dy*k;}
  else{actor.x=x;actor.y=Math.min(y,landingY());actor.state='landed';}
 });
 function release(e){
  if(!drag)return;const kind=drag.kind;
  if(kind==='pull'){
   if(distance(actor,sling)>12){actor.vx=(sling.x-actor.x)*launchSpeed();actor.vy=(sling.y-actor.y)*launchSpeed();actor.state='flying';hideSize();shots++;notice='';}
   else{actor.x=sling.x;actor.y=sling.y;actor.state='loaded';}
  }else if(kind==='actor'&&canLoad()){actor.x=sling.x;actor.y=sling.y;actor.state='loaded';notice='已放回弹弓，再向后拉一下发射。';}
  drag=null;if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);report();
 }
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',e=>{if(drag?.kind==='pull'){actor.x=sling.x;actor.y=sling.y;actor.state='loaded';drag=null;report()}else release(e)});
 document.getElementById('mode').onclick=()=>{if(actor.state==='flying')return;setEdit(!edit);selectBeam(null);hideSize();notice='';report()};
 document.getElementById('add').onclick=()=>{addPig();report()};
 document.getElementById('reset').onclick=()=>{drag=null;hideSize();reset();report()};document.getElementById('exit').onclick=()=>{report();window.desktopGame.exit()};
 window.addEventListener('keydown',e=>{if(e.key==='Escape'){report();window.desktopGame.exit()}});
 const popup=document.getElementById('object-size'),slider=document.getElementById('size-slider');
 let selected=null;
 function hideSize(){selected=null;popup.hidden=true;report()}
 function popupRegion(){if(popup.hidden)return [];const r=popup.getBoundingClientRect();return [{x:r.x,y:r.y,w:r.width,h:r.height}]}
 function positionSize(){
  if(!selected)return;
  const handle=beams.includes(selected)?rotationHandle(selected):null;
  const left=handle&&handle.x>=selected.x?selected.x-280:selected.x+35;
  popup.style.left=clamp(left,8,W-268)+'px';
  popup.style.top=clamp(selected.y-135,8,H-150)+'px';
  if(beams.includes(selected))document.getElementById('size-hint').textContent=`角度 ${Math.round(selected.angle*180/Math.PI)%360}° · 拖圆形手柄 · Shift 每 15°`;
 }
 function saveSizes(){savedPigSizes=pigs.map(p=>p.r/28);try{localStorage.setItem('eh-game-sizes',JSON.stringify({pig:pigScale,pet:actorScale,sling:slingScale,pigs:savedPigSizes}))}catch{}}
 canvas.addEventListener('dblclick',e=>{
  if(actor.state==='flying')return;
  const p=point(e);
  const beam=edit&&beamAt(p);
  selected=beam || [...pigs].reverse().find(pig=>distance(p,pig)<pig.r+5) || (handleHit(p)?sling:null) || (Math.abs(p.x-actor.x)<55*actorScale&&p.y>actor.y-80*actorScale&&p.y<actor.y+65*actorScale?actor:null) || (slingHit(p)?sling:null);
  if(!selected){hideSize();return}
  if(beam)selectBeam(beam);
  popup.hidden=false;document.getElementById('size-title').textContent=beam?'木棍大小':selected===actor?'桌宠大小':selected===sling?'弹弓大小':'这只猪头的大小';
  document.getElementById('size-hint').textContent=selected===actor?'越大，发射力度和预测射程越远':selected===sling?'双击弹弓下方手柄可随时调整':'仅调整选中的这一只猪头';
  slider.max=beam?'300':'800';
  slider.value=Math.round((beam?beam.scale:selected===actor?actorScale:selected===sling?slingScale:selected.r/28)*100);document.getElementById('size-value').textContent=slider.value+'%';positionSize();report();
 });
 slider.oninput=()=>{
  if(!selected||actor.state==='flying'||drag)return;
  const scale=clamp(Number(slider.value)/100,.5,8);
  if(beams.includes(selected)){selected.scale=clamp(scale,.5,3);clampBeam(selected);}
  else if(selected===actor){actorScale=scale;actor.r=32*scale;const side=Math.min(W*.45,55*scale);actor.x=clamp(actor.x,side,W-side);actor.y=clamp(actor.y,topY(),landingY());if(actor.state==='loaded'){sling.x=actor.x;sling.y=actor.y}}
  else if(selected===sling){slingScale=scale;sling.x=clamp(sling.x,44*scale,W-44*scale);sling.y=clamp(sling.y,25*scale,Math.max(25*scale,H-76*scale-8));if(actor.state==='loaded'){sling.y=Math.min(sling.y,landingY());actor.x=sling.x;actor.y=sling.y}}
  else{selected.r=28*scale;selected.x=clamp(selected.x,selected.r,W-selected.r);selected.y=clamp(selected.y,selected.r,H-selected.r)}
  document.getElementById('size-value').textContent=slider.value+'%';saveSizes();positionSize();report();
 };
 document.getElementById('size-close').onclick=hideSize;
 popup.addEventListener('pointerdown',e=>e.stopPropagation());
 function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
 function wrapAngle(angle){return (angle%(2*Math.PI)+2*Math.PI)%(2*Math.PI);}
 function beamSize(beam){return {x:beamHalfLength*beam.scale,y:beamHalfWidth*beam.scale};}
 function rotate(x,y,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:x*c-y*s,y:x*s+y*c};
 }
 function beamLocal(beam,p){return rotate(p.x-beam.x,p.y-beam.y,-beam.angle);}
 function beamBounds(beam){
  const size=beamSize(beam),c=Math.abs(Math.cos(beam.angle)),s=Math.abs(Math.sin(beam.angle));
  return {x:c*size.x+s*size.y,y:s*size.x+c*size.y};
 }
 function beamAt(p){
  return [...beams].reverse().find(beam=>{
   const local=beamLocal(beam,p),size=beamSize(beam);
   return Math.abs(local.x)<=size.x&&Math.abs(local.y)<=size.y;
  });
 }
 function rotationHandle(beam){
  const size=beamSize(beam);
  const near=rotate(size.x+20,0,beam.angle);
  const sign=beam.x+near.x<12||beam.x+near.x>W-12||beam.y+near.y<12||beam.y+near.y>H-12?-1:1;
  return {x:beam.x+sign*near.x,y:beam.y+sign*near.y};
 }
 function handleRegion(){
  if(!edit||!selectedBeam)return [];
  const p=rotationHandle(selectedBeam);
  return [{x:p.x-12,y:p.y-12,w:24,h:24}];
 }
 function clampBeam(beam){
  const size=beamBounds(beam);
  beam.x=clamp(beam.x,size.x,W-size.x);
  beam.y=clamp(beam.y,size.y,H-8-size.y);
 }
 function selectBeam(beam){
  selectedBeam=beam;
  document.getElementById('delete-beam').disabled=!beam;
 }
 document.getElementById('add-beam').onclick=()=>{
  if(!edit||beams.length>=24){notice='请在摆放模式添加木棍，最多 24 根。';return}
  const beam={x:W*.56,y:H*.55,angle:Math.PI/2,scale:1};
  clampBeam(beam);beams.push(beam);selectBeam(beam);report();
 };
 document.getElementById('delete-beam').onclick=()=>{
  if(!edit||!selectedBeam)return;
  if(selected===selectedBeam)hideSize();
  beams=beams.filter(beam=>beam!==selectedBeam);selectBeam(null);report();
 };
 const mapList=document.getElementById('map-list'),mapName=document.getElementById('map-name');
 const mapKey='eh-sling-maps-v1';
 function readMaps(){
  const maps=JSON.parse(localStorage.getItem(mapKey)||'[]');
  return Array.isArray(maps)?maps:[];
 }
 function listMaps(selectedName){
  mapList.replaceChildren(new Option('选择地图',''));
  for(const map of readMaps())mapList.add(new Option(map.name,map.name));
  mapList.value=selectedName||'';
 }
 try{listMaps()}catch{notice='地图列表无法读取。'}
 document.getElementById('save-map').onclick=()=>{
  if(!edit||drag||actor.state==='flying'){notice='请在摆放模式保存地图。';return}
  const name=mapName.value.trim();
  if(!name){notice='先给地图取个名字。';return}
  try{
   const maps=readMaps().filter(map=>map.name!==name);
   const position=object=>({x:object.x/W,y:object.y/H});
   maps.push({name,sling:{...position(sling),scale:slingScale},actorScale,
    pigs:pigs.map(p=>({...position(p),r:p.r,art:p.art})),
    beams:beams.map(b=>({...position(b),angle:b.angle,scale:b.scale}))});
   localStorage.setItem(mapKey,JSON.stringify(maps));listMaps(name);notice='地图已保存。';
  }catch{notice='地图保存失败。'}
 };
 document.getElementById('load-map').onclick=()=>{
  if(actor.state==='flying'||drag)return;
  try{
   const map=readMaps().find(map=>map.name===mapList.value);
   if(!map){notice='先选择一张地图。';return}
   const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
   if(!validPoint(map.sling)||!Number.isFinite(map.sling.scale)||!Number.isFinite(map.actorScale)||
      !Array.isArray(map.pigs)||!map.pigs.every(p=>validPoint(p)&&Number.isFinite(p.r))||
      !Array.isArray(map.beams)||!map.beams.every(validPoint))throw new Error('Invalid map');
   const position=p=>({x:p.x*W,y:p.y*H});
   hideSize();reset();
   pigs=map.pigs.slice(0,15).map(p=>({...position(p),r:clamp(p.r,14,224),art:p.art,vy:0,falling:false}));
   beams=map.beams.slice(0,24).map(b=>({...position(b),
    angle:Number.isFinite(b.angle)?wrapAngle(b.angle):b.vertical===true?Math.PI/2:0,
    scale:Number.isFinite(b.scale)?clamp(b.scale,.5,3):1}));
   beams.forEach(clampBeam);
   actorScale=clamp(map.actorScale,.5,8);actor.r=32*actorScale;
   slingScale=clamp(map.sling.scale,.5,8);
   Object.assign(sling,position(map.sling));
   sling.x=clamp(sling.x,40,W-40);sling.y=clamp(sling.y,90,landingY());
   Object.assign(actor,sling);
   setEdit(false);
   mapName.value=map.name;notice='地图已载入，可以发射。';report();
  }catch{notice='地图载入失败。'}
 };
 function separatePigs(){
  for(let pass=0;pass<8;pass++){
   for(let i=0;i<pigs.length;i++)for(let j=i+1;j<pigs.length;j++){
    const a=pigs[i],b=pigs[j];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),overlap=a.r+b.r-length;
    if(overlap<=0)continue;
    const nx=length?dx/length:1,ny=length?dy/length:0;
    const share=drag?.pig===a?0:drag?.pig===b?1:.5;
    a.x-=nx*overlap*share;a.y-=ny*overlap*share;
    b.x+=nx*overlap*(1-share);b.y+=ny*overlap*(1-share);
    if(a.falling&&a.vy*ny>0)a.vy*=-.35;
    if(b.falling&&b.vy*ny<0)b.vy*=-.35;
   }
   for(const p of pigs){
    for(const beam of beams){
     const size=beamSize(beam),local=beamLocal(beam,p);
     const dx=local.x-clamp(local.x,-size.x,size.x);
     const dy=local.y-clamp(local.y,-size.y,size.y);
     const distance=Math.hypot(dx,dy);
     if(distance>=p.r)continue;
     let push;
     if(distance>0){
      const scale=(p.r-distance)/distance;
      push={x:dx*scale,y:dy*scale};
     }else{
      const gapX=size.x-Math.abs(local.x),gapY=size.y-Math.abs(local.y);
      push=gapX<gapY?{x:(local.x<0?-1:1)*(gapX+p.r),y:0}
       :{x:0,y:(local.y<0?-1:1)*(gapY+p.r)};
     }
     const world=rotate(push.x,push.y,beam.angle);
     p.x+=world.x;p.y+=world.y;
     if(p.falling&&p.vy*world.y<0)p.vy*=-.2;
    }
    p.x=clamp(p.x,p.r,W-p.r);p.y=clamp(p.y,p.r,H-8-p.r);
   }
  }
 }
 function beamImpact(beam,start,end,radius){
  const size=beamSize(beam),a=beamLocal(beam,start),b=beamLocal(beam,end);
  let enter=0,exit=1;
  let normal=null;
  for(const axis of ['x','y']){
   const extent=size[axis]+radius,from=a[axis],delta=b[axis]-from;
   if(Math.abs(delta)<1e-8){if(Math.abs(from)>extent)return null;continue;}
   const near=(-extent-from)/delta,far=(extent-from)/delta;
   const first=Math.min(near,far);
   if(first>=enter){
    enter=first;
    const sign=-Math.sign(delta);
    normal=rotate(axis==='x'?sign:0,axis==='y'?sign:0,beam.angle);
   }
   exit=Math.min(exit,Math.max(near,far));
   if(enter>exit)return null;
  }
  return {time:enter,normal};
 }
 function drawBeam(beam){
  ctx.save();ctx.translate(beam.x,beam.y);ctx.rotate(beam.angle);ctx.scale(beam.scale,beam.scale);
  const grain=ctx.createLinearGradient(0,-8,0,8);
  grain.addColorStop(0,'#f2c579');grain.addColorStop(.45,'#d89540');grain.addColorStop(1,'#a85e25');
  ctx.fillStyle=grain;ctx.fillRect(-60,-8,120,16);
  ctx.strokeStyle=beam===selectedBeam?'#5c9463':'#85471e';ctx.lineWidth=2;ctx.strokeRect(-60,-8,120,16);
  ctx.strokeStyle='#91552488';ctx.lineWidth=1;
  for(const y of [-4,1,5]){ctx.beginPath();ctx.moveTo(-55,y);ctx.lineTo(55,y);ctx.stroke();}
  ctx.restore();
  if(edit&&selectedBeam===beam){
   const handle=rotationHandle(beam);
   ctx.strokeStyle='#50785a';ctx.lineWidth=2;
   ctx.beginPath();ctx.moveTo(beam.x,beam.y);ctx.lineTo(handle.x,handle.y);ctx.stroke();
   ctx.beginPath();ctx.arc(handle.x,handle.y,9,0,2*Math.PI);
   ctx.fillStyle='#eef6e7';ctx.fill();ctx.stroke();
  }
 }
 function pig(p){ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#85bd65';for(const x of [-17,17]){ctx.beginPath();ctx.ellipse(x,-22,10,15,x*.025,0,Math.PI*2);ctx.fill()}ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#4f8346';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';for(const x of [-10,10]){ctx.beginPath();ctx.arc(x,-7,7,0,7);ctx.fill()}ctx.fillStyle='#283c2d';for(const x of [-9,9]){ctx.beginPath();ctx.arc(x,-6,3,0,7);ctx.fill()}ctx.fillStyle='#b2d697';ctx.beginPath();ctx.ellipse(0,9,17,11,0,0,7);ctx.fill();ctx.fillStyle='#608d4e';for(const x of [-6,6]){ctx.beginPath();ctx.ellipse(x,9,3,4,0,0,7);ctx.fill()}ctx.restore()}
 function unlockAudio(){
  try{
   audio ||= new AudioContext();
   if(audio.state==='suspended')audio.resume().catch(()=>{});
  }catch{/* Audio is optional on unsupported devices. */}
 }
 function impactSound(wood){
  if(audio?.state!=='running')return;
  const now=audio.currentTime,osc=audio.createOscillator(),volume=audio.createGain();
  osc.type=wood?'triangle':'sine';
  osc.frequency.setValueAtTime(wood?260:640,now);
  osc.frequency.exponentialRampToValueAtTime(wood?90:980,now+.10);
  volume.gain.setValueAtTime(.001,now);
  volume.gain.exponentialRampToValueAtTime(wood?.07:.12,now+.012);
  volume.gain.exponentialRampToValueAtTime(.001,now+.15);
  osc.connect(volume).connect(audio.destination);
  osc.onended=()=>{osc.disconnect();volume.disconnect();};
  osc.start(now);osc.stop(now+.16);
 }
 function impactEffect(kind,x,y,now,target){
  const particles=Array.from({length:kind==='pig'?8:12},(_,index)=>{
   const angle=index*2.4;
   const speed=55+(index%4)*25;
   return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-35,angle};
  });
  effects.push({kind,x,y,now,target,particles});
  impactSound(kind==='wood');
 }
 function drawPig(p,squash=1){
  const art=pigArt[p.art]?.canvas;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(1+(1-squash)*.35,squash);
  if(art){
   const scale=p.r*2/Math.max(art.width,art.height),w=art.width*scale,h=art.height*scale;
   ctx.drawImage(art,-w/2,-h/2,w,h);
  }else pig({...p,x:0,y:0});
  ctx.restore();
 }
 function drawEffects(now){
  effects=effects.filter(effect=>now-effect.now<1050);
  for(const effect of effects){
   const age=(now-effect.now)/1000,wood=effect.kind==='wood';
   ctx.save();
   if(!wood&&age<.16){
    ctx.globalAlpha=1-age/.16;
    drawPig(effect.target,1-.5*Math.sin(Math.min(1,age/.16)*Math.PI/2));
   }
   if(age<.5){
    ctx.globalAlpha=1-age/.5;ctx.fillStyle=wood?'#ae7138':'#8dd967';
    for(const p of effect.particles){
     ctx.save();
     ctx.translate(effect.x+p.vx*age,effect.y+p.vy*age+180*age*age);
     ctx.rotate(p.angle+age*7);
     ctx.fillRect(-3,-2,wood?9:6,wood?3:5);
     ctx.restore();
    }
   }
   if(!wood){
    ctx.globalAlpha=Math.min(1,(1.05-age)/.3);
    ctx.font='bold 17px "Microsoft YaHei", sans-serif';ctx.textAlign='center';
    ctx.lineWidth=4;ctx.strokeStyle='#f5fff0';ctx.fillStyle='#297a36';
    const x=clamp(effect.x,68,W-68),y=Math.max(22,effect.y-14-44*age);
    ctx.strokeText('+1 绿宝石',x,y);ctx.fillText('+1 绿宝石',x,y);
   }
   ctx.restore();
  }
  if(now<clearUntil){
   const y=clamp(bar.getBoundingClientRect().bottom+24,30,H-30);
   ctx.save();ctx.globalAlpha=Math.min(1,(clearUntil-now)/300);
   ctx.fillStyle='#eaf6dd';ctx.beginPath();ctx.roundRect(W/2-70,y-14,140,32,12);ctx.fill();
   ctx.fillStyle='#2d6436';ctx.font='bold 17px "Microsoft YaHei", sans-serif';
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('全部击中！',W/2,y+2);
   ctx.restore();
  }
 }
 function frame(now){
  const dt=Math.min((now-last)/1000,.035);last=now;
  for(const p of pigs){
   if(!p.falling||drag?.pig===p||selected===p)continue;
   p.vy+=650*dt;p.y+=p.vy*dt;
   const ground=H-8-p.r;
   if(p.y>=ground){p.y=ground;if(p.vy>55)p.vy=-p.vy*.5;else{p.vy=0;p.falling=false}}
  }
  separatePigs();
  if(actor.state==='flying'){
   const before={x:actor.x,y:actor.y};actor.vy+=650*dt;actor.x+=actor.vx*dt;actor.y+=actor.vy*dt;
   let shield=null,impact=null;
   for(const beam of beams){
    const contact=beamImpact(beam,before,actor,actor.r*.65);
    if(contact&&(!impact||contact.time<impact.time)){shield=beam;impact=contact;}
   }
   if(shield){
    actor.x=before.x+(actor.x-before.x)*impact.time;actor.y=before.y+(actor.y-before.y)*impact.time;
    if(impact.normal){
     const n=impact.normal,speed=actor.vx*n.x+actor.vy*n.y;
     actor.vx-=1.5*speed*n.x;actor.vy-=1.5*speed*n.y;
    }else{actor.vx*=-.5;actor.vy*=-.5;}
    beams=beams.filter(beam=>beam!==shield);if(selectedBeam===shield)selectBeam(null);
    impactEffect('wood',actor.x,actor.y,now);
    notice='木棍挡住撞击后折断了。';
   }else{
    const previousCount=pigs.length;
    pigs=pigs.filter(p=>{
     if(segmentDistance(p,before,actor)>=p.r+actor.r*.65)return true;
     hits++;rewardHits++;
     impactEffect('pig',p.x,p.y,now,p);
     return false;
    });
    if(previousCount&&!pigs.length)clearUntil=now+1600;
   }
   const side=Math.min(W*.45,Math.max(35,55*actorScale)),top=topY();if(actor.x<side||actor.x>W-side){actor.x=clamp(actor.x,side,W-side);actor.vx=-actor.vx*.55;}
   if(actor.y<top){actor.y=top;actor.vy=Math.abs(actor.vy)*.45}
   if(actor.y>=landingY()){actor.y=landingY();if(actor.vy>65){actor.vy=-actor.vy*.48;actor.vx*=.72;notice='弹起来啦，停稳后拖回弹弓！';}else{actor.vx=actor.vy=0;actor.state='landed';notice='停稳啦，拖回弹弓再发射。';}}
  }
  ctx.clearRect(0,0,W,H);
  ctx.save();ctx.translate(sling.x,sling.y);ctx.scale(slingScale,slingScale);
  ctx.lineCap='round';ctx.lineWidth=10;ctx.strokeStyle='#8b6242';ctx.beginPath();ctx.moveTo(0,76);ctx.lineTo(0,24);ctx.lineTo(-24,0);ctx.moveTo(0,24);ctx.lineTo(24,0);ctx.stroke();ctx.restore();
  ctx.lineWidth=5*slingScale;ctx.strokeStyle='#ba8567';ctx.beginPath();ctx.moveTo(sling.x-24*slingScale,sling.y);ctx.lineTo(actor.state==='loaded'?actor.x:sling.x,actor.state==='loaded'?actor.y:sling.y+12*slingScale);ctx.lineTo(sling.x+24*slingScale,sling.y);ctx.stroke();
  if(drag?.kind==='actor'){const r=loadRange();ctx.save();ctx.setLineDash([6,6]);ctx.strokeStyle=canLoad()?'#70bd65':'#92ad8599';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(sling.x,sling.y,r.x,r.y,0,0,Math.PI*2);ctx.stroke();ctx.restore();if(canLoad())notice='松手即可放回弹弓';}
  if(drag?.kind==='pull'){ctx.fillStyle='#638e6dbb';const vx=(sling.x-actor.x)*launchSpeed(),vy=(sling.y-actor.y)*launchSpeed();for(let t=.1;t<2;t+=.12){const x=actor.x+vx*t,y=actor.y+vy*t+325*t*t;if(y>landingY()||x<0||x>W)break;ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill()}}
  beams.forEach(drawBeam);
  pigs.forEach(p=>drawPig(p));
  if(video.readyState>=2)ctx.drawImage(video,200,40,240,300,actor.x-55*actorScale,actor.y-72*actorScale,110*actorScale,140*actorScale);
  else{ctx.fillStyle='#719b87';ctx.beginPath();ctx.arc(actor.x,actor.y,30*actorScale,0,7);ctx.fill()}
  drawEffects(now);
  status.textContent=(edit?'摆放：拖动猪头到图标上，也可移动弹弓。':actor.state==='loaded'?'按住桌宠向后拉，松手发射。':actor.state==='flying'?'飞行中…':'拖动桌宠回弹弓，靠近后松手装填。')+`　发射 ${shots} 次 · 命中 ${hits} 只 · 本局获得 ${hits} 绿宝石`+(notice?'　'+notice:'');
  if(selected&&selected!==actor&&selected!==sling&&!pigs.includes(selected)&&!beams.includes(selected))hideSize();
  positionSize();
  report();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 // Test-only read-only state, no settings or credentials.
 window.gameState=()=>({actor:{...actor},sling:{...sling},pigs:pigs.map(p=>({...p})),beams:beams.map(b=>({...b})),beamHandle:selectedBeam&&rotationHandle(selectedBeam),edit,shots,hits,pigScale,actorScale,slingScale,loadRange:loadRange(),launchPower:launchSpeed()});
})();

