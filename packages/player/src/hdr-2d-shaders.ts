// Premultiplied linear-sRGB between passes. Only paint import/output apply a transfer function.
export const COMMON = /* wgsl */ `
struct Params { info: vec4f, p0: vec4f, p1: vec4f, color: vec4f, extra: vec4f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var auxiliary: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> u: Params;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(p[i],0,1);
}
fn sampleAt(uv: vec2f) -> vec4f { return textureSampleLevel(source,linearSampler,uv,0); }
fn inside(uv: vec2f) -> vec4f {
  if (any(uv < vec2f(0)) || any(uv >= vec2f(1))) { return vec4f(0); }
  return sampleAt(uv);
}
fn at(p: vec2f) -> vec4f { return inside(p/u.info.zw); }
fn decode(c: vec3f) -> vec3f { return select(c/12.92,pow((max(c,vec3f(0))+0.055)/1.055,vec3f(2.4)),c>vec3f(0.04045)); }
fn encode(c: vec3f) -> vec3f { return select(c*12.92,1.055*pow(max(c,vec3f(0)),vec3f(1.0/2.4))-0.055,c>vec3f(0.0031308)); }
fn finiteColor(c: vec4f) -> vec4f { return vec4f(clamp(c.rgb,vec3f(0),vec3f(65504)),clamp(c.a,0,1)); }
fn over(s: vec4f, d: vec4f) -> vec4f { return s+d*(1-s.a); }
fn straight(p: vec4f) -> vec3f { return p.rgb/max(p.a,0.000001); }
const PI = 3.141592653589793;
fn rotate(p: vec2f, a: f32) -> vec2f { return vec2f(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y); }
fn modulo(x: f32, y: f32) -> f32 { return x-y*floor(x/y); }
`;
export const COMPOSITE = COMMON + /* wgsl */ `
fn shade(pos: vec4f) -> vec4f {
  let uv = pos.xy/u.info.zw;
  let s = sampleAt(uv);
  let d = textureSampleLevel(auxiliary,linearSampler,uv,0);
  let mode = i32(u.info.x);
  if (mode == 0) { return s; }
  if (mode == 1) { // imported straight-alpha sRGB paint
    let p = vec4f(decode(s.rgb)*u.extra.w*s.a,s.a);
    let blend = i32(u.extra.z);
    if (blend == 1) { return vec4f(p.rgb+d.rgb,min(p.a+d.a,1)); }
    if (blend == 2) { return vec4f(p.rgb*d.rgb+p.rgb*(1-d.a)+d.rgb*(1-p.a),p.a+d.a*(1-p.a)); }
    if (blend == 3) { return p; }
    return over(p,d);
  }
  if (mode == 2) { // extended sRGB presentation, premultiplied in output encoding
    return vec4f(encode(max(straight(s)*u.info.y,vec3f(0)))*s.a,s.a);
  }
  // Scramble refresh then scene; alpha cadence is supplied by the renderer.
  let refresh = vec4f(decode(u.color.rgb)*u.color.a,u.color.a);
  return over(s,over(refresh,d));
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return finiteColor(shade(p)); }
`;
export const EFFECTS = COMMON + /* wgsl */ `
fn polygonDistance(p: vec2f,r: f32,n: i32,angle: f32) -> f32 {
  var d = -1e30;
  for (var i=0;i<6;i++) { if(i>=n){break;} let a=angle+(f32(i)+0.5)*2*PI/f32(n); d=max(d,dot(p,vec2f(cos(a),sin(a)))-r*cos(PI/f32(n))); }
  return d;
}
fn starDistance(p: vec2f,r: f32,tips: i32) -> f32 {
  let inner=r*select(0.57735026919,0.38196601125,tips==5);
  var distanceSquared=1e30; var isInside=false; var previous=vec2f(0,-r);
  for(var i=1;i<=12;i++) {
    if(i>2*tips){break;}
    let a=-PI/2+f32(i)*PI/f32(tips); let next=vec2f(cos(a),sin(a))*select(inner,r,i%2==0);
    let edge=next-previous; let offset=p-previous;
    let nearest=offset-edge*clamp(dot(offset,edge)/dot(edge,edge),0,1);
    distanceSquared=min(distanceSquared,dot(nearest,nearest));
    if ((previous.y>p.y)!=(next.y>p.y)) { if(p.x<(next.x-previous.x)*(p.y-previous.y)/(next.y-previous.y)+previous.x){isInside=!isInside;} }
    previous=next;
  }
  return sqrt(distanceSquared)*select(1.0,-1.0,isInside);
}
fn wedge(p: vec2f, angle: f32) -> vec2f {
  let r=length(p); if(r==0){return vec2f(0);}
  let a=abs(modulo(atan2(p.y,p.x)+angle,2*angle)-angle);
  return r*vec2f(cos(a),sin(a));
}
fn pixelate(point: vec2f,kind: i32) -> vec4f {
  let size=u.p0.x; let height=u.p0.y; let gap=u.p0.z; let angle=u.p0.w;
  let q=rotate(point-u.info.zw/2,-angle)+u.info.zw/2;
  var centre=vec2f(0); var distanceToEdge=-1.0;
  if(kind==14) {
    let side=size+sqrt(3.0)*gap; let h=side*sqrt(3.0)/2;
    let uv=vec2f(q.x/side-q.y/(2*h),q.y/h); let cell=floor(uv); let f=fract(uv); let lower=f.x+f.y<=1;
    let base=vec2f(side*(cell.x+cell.y/2),h*cell.y);
    centre=base+select(vec2f(side,2*h/3),vec2f(side/2,h/3),lower);
    if(gap>0){distanceToEdge=polygonDistance(q-centre,size/sqrt(3.0),3,select(-PI/2,PI/2,lower));}
  } else if(kind==16) {
    let radius=size+gap/sqrt(3.0);
    let cell=floor(vec2f(2*q.x/(3*radius),(-q.x/3+q.y/sqrt(3.0))/radius)); var best=1e30;
    for(var x=-1;x<=1;x++){for(var y=-1;y<=1;y++){
      let c=cell+vec2f(f32(x),f32(y)); let candidate=radius*vec2f(1.5*c.x,sqrt(3.0)*(c.y+c.x/2));
      let d=dot(candidate-q,candidate-q); if(d<best){best=d;centre=candidate;}
    }}
    if(gap>0){distanceToEdge=polygonDistance(q-centre,size,6,0);}
  } else {
    let radius=select(size/2,size/(2*sin(PI/5)),kind==15);
    let dimensions=select(vec2f(2*radius),vec2f(size,height),kind==12);
    centre=(floor(q/(dimensions+gap))+0.5)*(dimensions+gap); let local=q-centre;
    if(kind==12){if(gap>0){distanceToEdge=max(abs(local.x)-size/2,abs(local.y)-height/2);}}
    else if(kind==13){distanceToEdge=length(local)-radius;}
    else if(kind==15){distanceToEdge=polygonDistance(local,radius,5,-PI/2);}
    else{distanceToEdge=starDistance(local,radius,select(6,5,kind==17));}
  }
  let coverage=1-smoothstep(-0.5,0.5,distanceToEdge);
  let p=rotate(centre-u.info.zw/2,angle)+u.info.zw/2;
  let cellColor=at(clamp(p,vec2f(0.5),u.info.zw-0.5));
  return mix(vec4f(decode(u.color.rgb)*u.color.a,u.color.a),cellColor,coverage);
}
fn shade(position: vec4f) -> vec4f {
  let uv=position.xy/u.info.zw; let p=sampleAt(uv); var point=position.xy;
  let kind=i32(u.info.x); let amount=u.info.y;
  if(kind==0){return p;}
  if(kind==10){
    let angle=PI/u.p0.z; let rotation=u.p1.x; let centre=u.p0.xy;
    var folded=wedge(rotate(point-centre,-rotation),angle);
    if(u.p0.w>1){
      let extent=max(abs(centre),abs(u.info.zw-centre)); let radius=length(extent)/u.p0.w;
      let normal=vec2f(cos(angle/2),sin(angle/2)); let boundary=radius*cos(angle/2);
      for(var i=0;i<16;i++){let outside=dot(folded,normal)-boundary;if(outside<=0){break;}folded=wedge(folded-2*outside*normal,angle);}
    }
    return at(centre+rotate(folded,rotation));
  }
  if(kind==11){let d=point-u.p0.xy;let r=length(d);let twist=u.p0.w*(1-smoothstep(0,u.p0.z,r));return at(u.p0.xy+rotate(d,-twist));}
  if(kind>=12 && kind<=18){return pixelate(point,kind);}
  if(kind==19){if(u.p0.x!=1){point.x=min(point.x,u.info.z-point.x);}if(u.p0.x!=0){point.y=min(point.y,u.info.w-point.y);}return at(point);}
  if(kind==20){let c=straight(p);return vec4f(floor(c*(amount-1)+0.5)/(amount-1)*p.a,p.a);}
  if(kind==21){let offset=u.p0.x*vec2f(cos(u.p0.y),sin(u.p0.y));let r=at(point-offset);let b=at(point+offset);return vec4f(r.r,p.g,b.b,max(p.a,max(r.a,b.a)));}
  if(kind==22){let r=length(point-u.p0.xy)/u.p0.z;let shade=1-amount*smoothstep(1-u.p0.w,1,r);return vec4f(p.rgb*shade,p.a);}
  if(kind==23){let d=point-u.p0.xy;let r=length(d);let wave=sin(2*PI*(r/u.p0.z-u.p1.x))*u.p0.w;return at(point+d/max(r,0.000001)*wave*min(r/u.p0.z,1));}
  if(kind==24){let coordinate=dot(point,vec2f(-sin(u.p0.y),cos(u.p0.y)));let stripe=0.5-0.5*cos(coordinate*2*PI/u.p0.x);return vec4f(p.rgb*(1-amount*stripe),p.a);}
  if(kind==26){let map=textureSampleLevel(auxiliary,linearSampler,uv,0);let offset=(map.rg*2-1)*map.a*u.p0.x;return at(point+offset);}
  if(kind==27){let brightness=max(p.r,max(p.g,p.b));let weight=max(0,(brightness-amount)/max(brightness,0.000001));return p*weight;}
  if(kind==28){let base=textureSampleLevel(auxiliary,linearSampler,uv,0);let glow=p*amount;return vec4f(base.rgb+glow.rgb,min(1,base.a+glow.a));}
  if(kind==9){
    if(amount<=0.001){return p;}
    var sum=vec4f(0);var total=0.0;
    for(var i=-24;i<=24;i++){
      if(abs(f32(i))>ceil(3*amount)){continue;}
      let d=f32(i)/amount;let weight=exp(-0.5*d*d);
      sum+=inside(uv+u.extra.xy*f32(i)/vec2f(textureDimensions(source)))*weight;total+=weight;
    }
    if(amount>8){return (sum/amount)*0.3989422804;}
    return sum/max(total,0.000001);
  }
  var a=p.a;var c=straight(p);let t=amount;
  if(kind==1){c*=t;}
  else if(kind==2){c=(c-0.5)*t+0.5;}
  else if(kind==3 || kind==4){let s=select(t,1-t,kind==4);let weights=select(vec3f(0.213,0.715,0.072),vec3f(0.2126,0.7152,0.0722),kind==4);c=mix(vec3f(dot(c,weights)),c,s);}
  else if(kind==5){let co=cos(t);let si=sin(t);c=vec3f(
    dot(c,vec3f(0.213+co*0.787-si*0.213,0.715-co*0.715-si*0.715,0.072-co*0.072+si*0.928)),
    dot(c,vec3f(0.213-co*0.213+si*0.143,0.715+co*0.285+si*0.140,0.072-co*0.072-si*0.283)),
    dot(c,vec3f(0.213-co*0.213-si*0.787,0.715-co*0.715+si*0.715,0.072+co*0.928+si*0.072)));}
  else if(kind==6){c=mix(c,1-c,t);}
  else if(kind==7){a*=t;}
  else if(kind==8){c=mix(c,vec3f(dot(c,vec3f(0.393,0.769,0.189)),dot(c,vec3f(0.349,0.686,0.168)),dot(c,vec3f(0.272,0.534,0.131))),t);}
  return vec4f(max(c,vec3f(0))*a,clamp(a,0,1));
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return finiteColor(shade(p)); }
`;
export const SCRAMBLE = COMMON + /* wgsl */ `
@group(0) @binding(4) var<storage,read> addressMap: array<vec4i>;
fn pixel(p: vec2i) -> vec4f {
  let size=vec2i(u.info.zw);let c=textureLoad(source,clamp(p,vec2i(0),size-1),0);
  return vec4f(straight(c),c.a);
}
fn sampleCanvas(p: vec2f) -> vec4f { return pixel(vec2i(floor(p+0.5))); }
fn channel(address: i32) -> f32 {
  let size=vec2i(u.info.zw);
  if(address<0 || address>=size.x*size.y*4){return 0;}
  let p=address/4;return pixel(vec2i(p%size.x,p/size.x))[address%4];
}
fn extended(pos: vec2f,s: vec4f,kind: i32) -> vec4f {
  let centre=(u.info.zw-1)*0.5;let p=pos-centre;
  if(kind==18){return vec4f(sampleCanvas(pos+vec2f(3,0)).r,s.g,sampleCanvas(pos-vec2f(3,0)).b,s.a);}
  if(kind==19){return sampleCanvas(pos+vec2f(select(-4.0,4.0,i32(pos.y)%2==0),0));}
  if(kind==20){let d=select(-1.0,1.0,(i32(pos.x)/16+i32(pos.y)/16)%2==0);return sampleCanvas(pos+vec2f(4*d,4*d));}
  if(kind==21){return vec4f(sampleCanvas(pos+vec2f(0,3)).r,s.g,sampleCanvas(pos-vec2f(0,3)).b,s.a);}
  if(kind==22){return vec4f(sampleCanvas(pos+vec2f(4,0)).r,sampleCanvas(pos+vec2f(-2,3)).g,sampleCanvas(pos+vec2f(-2,-3)).b,s.a);}
  if(kind==23){return vec4f(sampleCanvas(centre+p*0.96).r,s.g,sampleCanvas(centre+p*1.04).b,s.a);}
  if(kind==24){return vec4f(s.gbr,s.a);}
  if(kind==25){return sampleCanvas(pos+vec2f(sin(pos.y*0.08)*6,0));}
  if(kind==26){return sampleCanvas(pos+vec2f(0,sin(pos.x*0.08)*6));}
  if(kind==27){return sampleCanvas(pos+vec2f(sin(pos.y*0.08),sin(pos.x*0.06+0.8))*6);}
  if(kind==28){return sampleCanvas(centre+p*0.96);}
  if(kind==29){return sampleCanvas(centre+p*1.04);}
  let lensRadius=max(1,min(u.info.z,u.info.w)*0.35);let influence=exp(-dot(p,p)/(lensRadius*lensRadius));
  if(kind==30 || kind==31){let angle=(0.035+0.04*influence)*select(1.0,-1.0,kind==30);return sampleCanvas(centre+rotate(p,angle));}
  if(kind==32){let radius=length(p);return sampleCanvas(pos+p/max(radius,1)*sin(radius*0.1)*4);}
  if(kind==33){return sampleCanvas(centre+p*(1+0.12*influence));}
  if(kind==34){return sampleCanvas(centre+p*(1-0.12*influence));}
  let tile=vec2i(pos)/16;let local=pos-16*floor(pos/16);let evenTile=(tile.x+tile.y)%2==0;
  if(kind==35){let rotated=select(vec2f(15-local.y,local.x),vec2f(local.y,15-local.x),evenTile);return sampleCanvas(vec2f(tile*16)+rotated);}
  if(kind==36){let mirrored=select(vec2f(local.x,15-local.y),vec2f(15-local.x,local.y),evenTile);return sampleCanvas(vec2f(tile*16)+mirrored);}
  if(kind==37){return sampleCanvas(floor(pos/8)*8+4);}
  if(kind==38){let shift=(i32(pos.y)/8*13+5)%17-8;return sampleCanvas(pos+vec2f(f32(shift),0));}
  if(kind==39){var hash=u32(tile.x)*1664525u+u32(tile.y)*1013904223u+2246822519u;hash^=hash>>16u;let shift=vec2f(f32(i32(hash%17u)-8),f32(i32((hash>>8u)%17u)-8));return sampleCanvas(pos+shift);}
  return sampleCanvas(pos-sign(p)*4);
}
fn shade(position: vec4f) -> vec4f {
  let xy=vec2i(position.xy);let size=vec2i(u.info.zw);let kind=i32(u.info.x);var s=pixel(xy);
  if(kind<=17){
    let index=xy.y*size.x+xy.x;
    if(size.x<27){let a=addressMap[index];s=vec4f(channel(a.r),channel(a.g),channel(a.b),channel(a.a));}
    else {
      let i=index*4;let w=size.x*4-4;let end=size.x*(size.y-i32(u.p1.x))*4;
      if(i>=w && i<end){let a=vec4i(i+w)+vec4i(u.p0);s=vec4f(channel(a.r),channel(a.g),channel(a.b),channel(a.a));}
    }
  } else {s=extended(vec2f(xy),s,kind);}
  let a=clamp(s.a,0,1);return vec4f(s.rgb*a,a);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return finiteColor(shade(p)); }
`;
