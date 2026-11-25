const STEP = 1.1;
const ell=(cx,cy,rx,ry,n=18)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return{x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)}});
const TONES={boot:0x3a2a20,trouser:0x3b3f4a,skin:0xe0b08a,hair:0x4a3020,belt:0x5a3e28,metal:0xb8bcc4};
function sc(c,k){const r=Math.min(255,((c>>16)&255)*k),g=Math.min(255,((c>>8)&255)*k),b=Math.min(255,(c&255)*k);return `rgb(${r|0},${g|0},${b|0})`;}
function body(stride=0, lean=0){
  const S=[]; const push=(parts,tone,light)=>S.push({parts,tone,light});
  const f=0.3*stride;
  for(let i=0;i<2;i++) push([ell(f+0.05,-0.26,0.26,0.16,10),ell(-f+0.05,0.26,0.26,0.16,10)],"boot",0.7+0.15*i);
  for(let i=0;i<4;i++) push([ell(f*0.7,-0.24,0.18,0.17,10),ell(-f*0.7,0.24,0.18,0.17,10)],"trouser",0.7+0.05*i);
  // tunic skirt, flaring a little at the hem
  const skirt=[0.62,0.6,0.58,0.56];
  skirt.forEach((r,i)=>push([ell(0.03*lean*i,0,r*0.72,r,20)],"team",0.62+0.06*i));
  push([ell(0.12*lean,0,0.4,0.56,20)],"belt",0.9);
  // arms swing against the legs; hands at the bottom
  const arm=(i)=>{const sw=-0.22*stride*(1-i/7);return[ell(sw+0.25*lean*(i/7),-0.66,0.15,0.14,10),ell(-sw+0.25*lean*(i/7),0.66,0.15,0.14,10)];};
  const torso=[0.56,0.6,0.64,0.68,0.7];
  for(let i=0;i<7;i++){
    const parts=[...arm(i)];
    const tone=i<2?"skin":"team";
    if(i>=2){const r=torso[Math.min(i-2,4)];S.push({parts:[ell(0.06+0.2*lean*(i/7),0,r*0.66,r,20)],tone:"team",light:0.78+0.04*i});}
    S.push({parts,tone,light:i<2?0.9:0.72+0.04*i});
  }
  // pauldrons
  for(let i=0;i<2;i++) push([ell(0.25*lean,-0.6,0.3,0.26,12),ell(0.25*lean,0.6,0.3,0.26,12)],"accent",0.85+0.15*i);
  push([ell(0.06+0.3*lean,0,0.16,0.16,10)],"skin",0.8);
  // head: skin face to the front, hair over the back and the crown
  const head=[0.3,0.36,0.38,0.38,0.34,0.26];
  head.forEach((r,i)=>{const cx=0.1+0.35*lean;
    S.push({parts:[ell(cx,0,r,r*0.95,16)],tone:"skin",light:0.85+0.03*i});
    const hr=i<4?r*1.02:r*1.04; const off=i<4?-0.12:-0.04;
    S.push({parts:[ell(cx+off,0,hr*0.9,hr,16)],tone:"hair",light:0.8+0.08*i,same:true});
  });
  return S;
}
function paint(g,x,y,r,facing,colour,accent,slices,kind){
  const cos=Math.cos(facing),sin=Math.sin(facing);
  g.fillStyle="rgba(0,0,0,0.3)";g.beginPath();g.ellipse(x+r*0.15,y+r*0.1,r*0.95,r*0.7,0,0,7);g.fill();
  const tf=(p,lift)=>({x:x+(p.x*cos-p.y*sin)*r,y:y+(p.x*sin+p.y*cos)*r*0.82-lift});
  let lift=0; const lifts=[];
  slices.forEach(s=>{if(!s.same)lift+=STEP;lifts.push(lift);});
  const path=(pts)=>{g.beginPath();pts.forEach((p,j)=>j?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();};
  // outline pass
  g.strokeStyle="#1a1410";g.lineWidth=2;g.fillStyle="#1a1410";g.lineJoin="round";
  slices.forEach((s,i)=>s.parts.forEach(pt=>{path(pt.map(p=>tf(p,lifts[i])));g.stroke();}));
  slices.forEach((s,i)=>{
    const base=s.tone==="team"?colour:s.tone==="accent"?accent:TONES[s.tone];
    g.fillStyle=sc(base,s.light);
    s.parts.forEach(pt=>{path(pt.map(p=>tf(p,lifts[i])));g.fill();});
  });
  if(kind!==undefined) badge(g,x,y-lift-r*0.1,r,kind);
}
