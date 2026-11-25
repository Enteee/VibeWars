function glyph(g,x,y,s,kind,tint){
  g.fillStyle=tint;g.beginPath();
  if(kind===0){g.moveTo(x,y-s);g.lineTo(x+s*0.7,y);g.lineTo(x,y+s);g.lineTo(x-s*0.7,y);}
  else if(kind===1){g.moveTo(x,y-s);g.lineTo(x+s*0.8,y+s*0.1);g.lineTo(x+s*0.3,y+s*0.1);g.lineTo(x+s*0.3,y+s);g.lineTo(x-s*0.3,y+s);g.lineTo(x-s*0.3,y+s*0.1);g.lineTo(x-s*0.8,y+s*0.1);}
  else {g.moveTo(x-s*0.75,y-s);g.lineTo(x+s*0.75,y-s);g.lineTo(x-s*0.75,y+s);g.lineTo(x+s*0.75,y+s);}
  g.closePath();g.fill();
}
function badge(g,x,topY,r,kind){
  const br=Math.max(5,r*0.5);
  const by=topY-br*0.6;
  g.fillStyle="#14100c";g.beginPath();g.arc(x,by,br+1,0,7);g.fill();
  g.fillStyle="#2c2620";g.beginPath();g.arc(x,by,br,0,7);g.fill();
  glyph(g,x,by,br*0.7,kind,"#f4ead0");
}
