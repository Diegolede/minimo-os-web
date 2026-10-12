(()=>{
const NS='http://www.w3.org/2000/svg',svg=document.getElementById('minimo'),body=document.getElementById('body'),
eyes=[{el:document.getElementById('eyeL'),x:200.35},{el:document.getElementById('eyeR'),x:311.65}],
wrap=document.getElementById('charWrap'),hearts=document.getElementById('hearts');
const C=256,R=240,EW=71.5,EH=162,EY=256;
let tx=0,ty=0,gx=0,gy=0,blink=1,blinkT=0,nextBlink=performance.now()+2500,petting=0,pet=0,lean=0,leanT=0,squash=0,squashT=0,clicks=[],lastMove=performance.now();
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
addEventListener('pointermove',e=>{const r=svg.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 const dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy)||1,k=Math.min(1,d/(r.width*2.2));tx=dx/d*k;ty=dy/d*k;lastMove=performance.now()});
document.addEventListener('mouseleave',()=>{tx=0;ty=0});
function heart(x){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.classList.add('heart');
 const p=document.createElementNS(NS,'path');p.setAttribute('d','M12 21s-7.5-4.6-9.6-9.1C.9 8.6 3 5 6.5 5c2 0 3.6 1.1 4.5 2.6.9-1.5 2.5-2.6 4.5-2.6C19 5 21.1 8.6 19.6 11.9 17.5 16.4 12 21 12 21z');p.setAttribute('fill','#0B0B0C');s.appendChild(p);
 const sz=14+Math.random()*14;s.style.width=s.style.height=sz+'px';s.style.left=(x*100+(Math.random()-.5)*30)+'%';s.style.top=(18+Math.random()*12)+'%';
 s.style.setProperty('--dx',(Math.random()-.5)*60+'px');s.style.setProperty('--r',(Math.random()-.5)*30+'deg');s.style.animationDelay=Math.random()*.15+'s';
 hearts.appendChild(s);setTimeout(()=>s.remove(),1900)}
wrap.addEventListener('pointerdown',e=>{const now=performance.now(),r=wrap.getBoundingClientRect(),fx=(e.clientX-r.left)/r.width;
 clicks=clicks.filter(t=>now-t<1500);clicks.push(now);squashT=1;
 if(clicks.length>=4){petting=now+1400;leanT=(fx-.5)*2;const n=2+(Math.random()<.5);for(let i=0;i<n;i++)heart(fx)}});
wrap.addEventListener('pointerenter',()=>{squashT=.4});
const L=(a,b,t)=>a+(b-a)*t;
function frame(now){
 if(now-lastMove>4000){tx*=.98;ty*=.98}
 gx=L(gx,tx,.12);gy=L(gy,ty,.12);
 // blink
 if(now>nextBlink&&!blinkT){blinkT=now}
 if(blinkT){const t=(now-blinkT)/160;blink=t<.5?1-t*2*0.92:t<1?0.08+(t-.5)*2*0.92:1;if(t>=1){blinkT=0;nextBlink=now+(Math.random()<.18?180:2600+Math.random()*3800)}}
 const isPet=now<petting;pet=L(pet,isPet?1:0,isPet?.12:.06);
 lean=L(lean,isPet?leanT:0,.08);squash=L(squash,squashT,.35);squashT*=.82;
 const hop=isPet?Math.abs(Math.sin(now/170))*6*pet:0;
 const sway=isPet?Math.sin(now/420)*3*pet:0;
 const sx=1+squash*.04+pet*.03,sy=1-squash*.05+pet*.02;
 body.setAttribute('transform',`translate(0 ${-hop}) rotate(${lean*9+sway} 256 496) translate(256 496) scale(${sx} ${sy}) translate(-256 -496)`);
 const lx=reduce?0:gx,ly=reduce?0:gy;
 eyes.forEach(o=>{
  const ox=o.x+lx*92,oy=EY+ly*78;
  // spherical foreshortening: compress along radial direction as eye nears edge
  const rx=(ox-C)/R,ry=(oy-C)/R,rr=Math.min(.95,Math.hypot(rx,ry)),fore=Math.sqrt(1-rr*rr);
  const ang=Math.atan2(ry,rx),cxw=Math.abs(Math.cos(ang)),cyh=Math.abs(Math.sin(ang));
  let w=EW*(1-(1-fore)*cxw*1.1),h=EH*(1-(1-fore)*cyh*1.1);
  const close=blink*(1-pet*.86); h*=Math.max(.06,close); if(pet>.05){h=Math.max(h,EW*.28*pet)}
  w=Math.max(w,EW*.5);
  const shift=pet*-10;
  o.el.setAttribute('x',ox-w/2);o.el.setAttribute('width',w);o.el.setAttribute('y',oy-h/2+shift);o.el.setAttribute('height',h);o.el.setAttribute('rx',Math.min(w,h)/2)});
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
const btn=document.getElementById('copy');btn.addEventListener('click',async()=>{const t=document.getElementById('cmd').textContent;
 try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}
 const st=document.getElementById('copyStatus');btn.classList.add('done');st.textContent='Comando copiado';clearTimeout(btn._t);btn._t=setTimeout(()=>{btn.classList.remove('done');st.textContent=''},1800)});
const rv=document.querySelectorAll('.rv');if(reduce||!('IntersectionObserver'in window))rv.forEach(e=>e.classList.add('in'));else{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});rv.forEach(e=>io.observe(e))}
const nav=document.querySelector('.nav');const onS=()=>nav.classList.toggle('scrolled',scrollY>8);addEventListener('scroll',onS,{passive:true});onS();
})();

