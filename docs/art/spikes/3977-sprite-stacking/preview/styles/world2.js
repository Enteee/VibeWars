function extrude(pts,h,colour,{from=0,step=1,low=0.55,high=0.85,cap=1.05}={}){
  const L=[];for(let l=from;l<=from+h;l+=step){const t=(l-from)/h;L.push({pts,lift:l,colour,light:l>=from+h-step+0.01?cap:low+(high-low)*t});}return L;
}
// ---- world objects
function wall(g,pts,h){ stack(g,extrude(pts,h,ST.wall,{low:0.45,high:0.7,cap:1}));
  // brick joints on the cap
  const top=up(pts,h); g.strokeStyle=hex(ST.wall,0.6);g.lineWidth=1;
  const [a,b,c,d]=top; const n=Math.round(Math.hypot(b.x-a.x,b.y-a.y)/18);
  for(let i=1;i<n;i++){const t=i/n;g.beginPath();g.moveTo(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);g.lineTo(d.x+(c.x-d.x)*t,d.y+(c.y-d.y)*t);g.stroke();}
}
function column(g,x,y,r,h){ shadow(g,x,y,r*1.3,r*0.9);
  const L=[]; for(let l=0;l<=h;l+=1){const t=l/h; let rr=r*(t<0.1?1.25:t>0.9?1.3:1-0.12*t); const flute=t>0.1&&t<0.9;
    L.push({pts:circ(x,y,rr,rr*0.85,flute?16:24),lift:l,colour:ST.column,light:l>=h?1.08:0.55+0.35*t});}
  stack(g,L);
}
function tree(g,x,y,s,ph=0){ shadow(g,x,y,s*1.1,s*0.7,0.35);
  const L=[]; for(let l=0;l<14;l++) L.push({pts:circ(x,y,s*0.22,s*0.2,10),lift:l,colour:ST.trunk,light:0.6+0.02*l});
  const blobs=[[-0.35,-0.2,0.65],[0.35,-0.25,0.6],[0,0.3,0.7],[0.05,-0.05,0.75]];
  for(let l=0;l<=22;l++){const t=l/22; const prof=Math.sin(Math.PI*(0.15+0.85*t))*(t<0.5?1:1-0.25*(t-0.5)); const sw=Math.sin(ph)*2*t;
    blobs.forEach(([bx,by,br])=>L.push({pts:circ(x+bx*s+sw,y+by*s,br*s*prof,br*s*prof*0.9,14),lift:12+l,colour:mix(ST.leaf[0],ST.leaf[1],t),light:l===22?1.05:0.75+0.3*t}));}
  stack(g,L);
}
function crate(g,x,y,s,rot){ shadow(g,x,y,s*0.9,s*0.7);
  const c=Math.cos(rot),si=Math.sin(rot); const sq=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:x+(a*c-b*si)*s*0.7,y:y+(a*si+b*c)*s*0.7}));
  const h=s*1.1; const L=extrude(sq,h,ST.wood,{low:0.5,high:0.75,cap:1}); L.forEach((Lr,i)=>{if(i===2||i===Math.round(L.length/2))Lr.colour=0x4a3020;}); stack(g,L);
  const t=up(sq,h); g.strokeStyle=hex(0x5a3a1e);g.lineWidth=1; for(const k of [1/3,2/3]){g.beginPath();g.moveTo(t[0].x+(t[1].x-t[0].x)*k,t[0].y+(t[1].y-t[0].y)*k);g.lineTo(t[3].x+(t[2].x-t[3].x)*k,t[3].y+(t[2].y-t[3].y)*k);g.stroke();}
}
function brazier(g,x,y,ph){ shadow(g,x,y,12,8);
  const L=[]; for(let l=0;l<12;l++){const r=l<8?4+0.2*l:6+2.2*(l-8);L.push({pts:circ(x,y,r,r*0.85,14),lift:l,colour:0x5a5450,light:0.5+0.04*l});}
  L.push({pts:circ(x,y,13,11,16),lift:12,colour:0x2a1a10,light:1});
  stack(g,L);
  // glow
  const gr=g.createRadialGradient(x,y-14,2,x,y-14,60);gr.addColorStop(0,"rgba(255,170,60,0.35)");gr.addColorStop(1,"rgba(255,170,60,0)");g.fillStyle=gr;g.fillRect(x-60,y-74,120,120);
  const F=[]; for(let l=0;l<16;l++){const t=l/16; const w=Math.sin(ph+l*0.6)*1.5*t; F.push({pts:circ(x+w,y,9*(1-t)+1,8*(1-t)+1,12),lift:13+l,colour:mix(0xd8401a,0xffe890,t),light:1,alpha:0.95});}
  stack(g,F,false);
}
function pool(g,pts,depth){
  // floor cut: the pit wall shows on the far side, the water sits below the floor
  g.fillStyle=hex(0x3a3630);poly(g,pts);g.fill();
  g.save();poly(g,pts);g.clip();
  const water=pts.map(p=>({x:p.x,y:p.y+depth}));
  g.fillStyle=ST.water[0];poly(g,water);g.fill();
  // depth tint: deeper toward the middle
  for(let k=1;k<=4;k++){const cx=water.reduce((s,p)=>s+p.x,0)/water.length,cy=water.reduce((s,p)=>s+p.y,0)/water.length;
    g.fillStyle=`rgba(10,40,70,0.18)`;poly(g,water.map(p=>({x:cx+(p.x-cx)*(1-k*0.18),y:cy+(p.y-cy)*(1-k*0.18)})));g.fill();}
  g.strokeStyle="rgba(200,235,255,0.35)";g.lineWidth=1;
  [[0.3,0.4,18],[0.6,0.55,12],[0.45,0.7,22]].forEach(([fx,fy,r])=>{const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);const X=Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*fx,Y=Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*fy+depth;g.beginPath();g.ellipse(X,Y,r,r*0.5,0,0,7);g.stroke();});
  g.restore();
  // stone lip, 3 px proud of the floor
  g.lineWidth=7;g.strokeStyle=OUT;poly(g,up(pts,0));g.stroke();
  for(let l=0;l<=3;l++){g.lineWidth=5;g.strokeStyle=hex(ST.wall,0.6+0.15*l);poly(g,up(pts,l));g.stroke();}
}
function fireAoe(g,x,y,R,ph){
  g.fillStyle="rgba(255,110,30,0.18)";g.beginPath();g.ellipse(x,y,R,R*0.85,0,0,7);g.fill();
  g.strokeStyle="rgba(255,150,60,0.7)";g.lineWidth=2;g.beginPath();g.ellipse(x,y,R,R*0.85,0,0,7);g.stroke();
  const pts=[];for(let i=0;i<9;i++){const a=i/9*7+ph*0.3;const rr=R*(0.3+0.6*((i*37)%10)/10);pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr*0.85,i]);}
  pts.sort((a,b)=>a[1]-b[1]).forEach(([fx,fy,i])=>{const F=[];const h=8+(i%3)*4;for(let l=0;l<h;l++){const t=l/h;F.push({pts:circ(fx+Math.sin(ph+i+l*0.5)*t,fy,5*(1-t)+0.8,4*(1-t)+0.8,10),lift:l,colour:mix(0xc83010,0xffe080,t),light:1,alpha:0.9});}stack(g,F,false);});
}
function ward(g,x,y,R){
  g.fillStyle="rgba(120,200,255,0.12)";g.beginPath();g.ellipse(x,y,R,R*0.85,0,0,7);g.fill();
  g.fillStyle="rgba(255,255,255,0.35)";g.beginPath();g.ellipse(x-R*0.35,y-R*0.75,R*0.22,R*0.12,-0.5,0,7);g.fill();g.strokeStyle="rgba(170,225,255,0.6)";g.lineWidth=1.5;g.beginPath();g.ellipse(x,y,R,R*0.85,0,0,7);g.stroke();
  for(let l=0;l<=R*0.6;l+=2){const t=l/(R*0.6);const rr=R*Math.sqrt(1-t*t);g.fillStyle=`rgba(140,210,255,${0.035+0.03*t})`;g.beginPath();g.ellipse(x-0.3*l,y-l,rr,rr*0.85,0,0,7);g.fill();}
}
function fireball(g,x,y,lift,dx,dy){ shadow(g,x,y,6,4,0.35);
  for(let k=1;k<=4;k++){g.fillStyle=`rgba(255,${120+20*k},40,${0.5-0.1*k})`;g.beginPath();g.arc(x-dx*k*4,y-lift-dy*k*4,6-k,0,7);g.fill();}
  const gr=g.createRadialGradient(x,y-lift,1,x,y-lift,16);gr.addColorStop(0,"rgba(255,220,120,0.6)");gr.addColorStop(1,"rgba(255,140,40,0)");g.fillStyle=gr;g.fillRect(x-16,y-lift-16,32,32);
  const L=[];for(let l=0;l<8;l++){const t=l/7;const r=6*Math.sin(Math.PI*(0.15+0.7*t));L.push({pts:circ(x,y,r,r,12),lift:lift-4+l,colour:mix(0xe04010,0xfff0a0,t),light:1});}stack(g,L,false);
}
function arrow(g,x,y,lift,a){ g.strokeStyle="rgba(0,0,0,0.3)";g.lineWidth=2;g.beginPath();g.moveTo(x-Math.cos(a)*10+3,y-Math.sin(a)*10+3);g.lineTo(x+Math.cos(a)*10+3,y+Math.sin(a)*10+3);g.stroke();
  for(let l=0;l<3;l++){g.strokeStyle=l===2?"#e8d8b0":"#6a4a2a";g.lineWidth=2;g.beginPath();g.moveTo(x-Math.cos(a)*10,y-Math.sin(a)*10-lift-l);g.lineTo(x+Math.cos(a)*10,y+Math.sin(a)*10-lift-l);g.stroke();}
  g.fillStyle="#d0d4dc";g.beginPath();g.moveTo(x+Math.cos(a)*14,y+Math.sin(a)*14-lift-2);g.lineTo(x+Math.cos(a+2.6)*5+Math.cos(a)*10,y+Math.sin(a+2.6)*5+Math.sin(a)*10-lift-2);g.lineTo(x+Math.cos(a-2.6)*5+Math.cos(a)*10,y+Math.sin(a-2.6)*5+Math.sin(a)*10-lift-2);g.fill();
}
function floor(g,W,H){ const [base,v]=ST.floor; g.fillStyle=hex(base,0.8);g.fillRect(0,0,W,H);
  let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  if(ST.floorKind==="flag") for(let y=0;y<H;y+=22)for(let x=-(y/22%2)*18;x<W;x+=36){g.fillStyle=hex(base,1-v+rnd()*v*2);g.fillRect(x+1,y+1,34,20);}
  if(ST.floorKind==="tri") for(let y=0;y<H;y+=40)for(let x=0;x<W;x+=40){g.fillStyle=hex(base,1-v+rnd()*v*2);g.beginPath();g.moveTo(x,y);g.lineTo(x+40,y);g.lineTo(x,y+40);g.fill();g.fillStyle=hex(base,1-v+rnd()*v*2);g.beginPath();g.moveTo(x+40,y);g.lineTo(x+40,y+40);g.lineTo(x,y+40);g.fill();}
  if(ST.floorKind==="grid") for(let y=0;y<H;y+=16)for(let x=0;x<W;x+=16){g.fillStyle=hex(base,1-v+((x/16+y/16)%2)*v+rnd()*v);g.fillRect(x,y,16,16);}
  if(ST.label==="Painterly") for(let i=0;i<220;i++){g.fillStyle=`rgba(${rnd()<0.5?"40,30,20":"200,190,160"},0.05)`;g.beginPath();g.ellipse(rnd()*W,rnd()*H,10+rnd()*40,6+rnd()*20,rnd()*3,0,7);g.fill();}
}
