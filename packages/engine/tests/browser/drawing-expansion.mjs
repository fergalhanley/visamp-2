export async function verifyDrawing(engine,step,load){
 const checks=[];const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 const capture=async()=>{const bitmap=await createImageBitmap(await engine.capture_frame());const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return(x,y)=>[...ctx.getImageData(x,y,1,1).data];};
 const near=(actual,expected,label)=>assert(expected.every((v,i)=>Math.abs(actual[i]-v)<4),`${label}: ${actual} != ${expected}`);
 engine.set_asset_texture('drawing-test',1,1,new Uint8Array([128,64,32,128]));
 const drawing=`draw::background(color: $COLOR_BLACK)
 transform::push()
 transform::translate(x: 40,y: 40)
 draw::rect(width: 80,height: 80,corner_radius: 10,color: $COLOR_CORAL)
 transform::pop()
 draw::image(asset: asset::bitmap(id: "drawing-test"),x: 140,y: 40,width: 80,height: 80)
 draw::rect(x: 240,y: 40,width: 80,height: 80,color: color::mix(a: $COLOR_BLACK,b: $COLOR_WHITE,amount: 0.5))
 draw::circle(x: 380,y: 80,radius: 40,gradient: color::radial_gradient(x: 380,y: 80,radius: 40,color_stops: [[0,$COLOR_WHITE],[1,$COLOR_BLACK]]))
 draw::polyline(points: [[40,180],[100,140],[160,180]],stroke_width: 8,color: $COLOR_WHITE,line_join: "round")
 draw::bezier(points: [[200,180],[240,120],[280,240],[320,180]],stroke_width: 5,color: $COLOR_WHITE)
 draw::arc(x: 380,y: 180,radius: 30,sweep_deg: 270,stroke_width: 5,color: $COLOR_WHITE)
 draw::text(content: "Drawing expansion",x: 40,y: 250,size: 24,color: $COLOR_WHITE)`;
 load(`render {${drawing}}`);step();let p=await capture();near(p(80,80),[255,127,80,255],'transformed rounded rectangle');near(p(160,80),[64,32,16,255],'straight alpha image');near(p(280,80),[188,188,188,255],'linear light mixing');assert(p(380,80)[0]>245,'radial centre');checks.push('2D transforms, rounded shapes, images, gradients, curves and colour mixing');
 load(`context 3d render {draw::cube() gfx::overlay(enabled: true) ${drawing}}`);step();p=await capture();near(p(80,80),[255,127,80,255],'overlay rectangle');near(p(160,80),[64,32,16,255],'overlay image');checks.push('3D overlay shares 2D drawing and capture dimensions');
 load(`context 3d render {draw::background(color: $COLOR_BLACK) camera::orthographic(height: 4) draw::rect(x: -1,y: -1,width: 2,height: 2,color: $COLOR_CORAL) draw::line(x1: -1,y1: 0,z1: 1,x2: 1,y2: 0,z2: 1,stroke_width: 0.1,color: $COLOR_WHITE)}`);step();p=await capture();near(p(640,360),[255,255,255,255],'thick world line');near(p(640,420),[255,127,80,255],'planar world rectangle');checks.push('3D planar fills and world-unit thick lines');
 load(`prop frames=[] on_frame {frames=[$FRAME_INDEX,$TIME_HOUR,$TIME_MINUTE,$TIME_DAY,$TIME_MONTH,$TIME_YEAR,$DELTA_SEC]} render {draw::background(color: $COLOR_BLACK)}`);step();const before=engine.get_properties();await capture();assert(engine.get_properties()===before,'capture advanced snapshot');step();assert(engine.get_properties()!==before,'frame index did not advance');checks.push('frame/calendar snapshot remains stable through capture');
 load(`context 3d render {camera::orthographic(height: 4) draw::point_cloud(count: 1,x: math::noise(x: $POINT_INDEX,seed: 7)*0,y: math::random(seed: 7,index: $POINT_INDEX)*0,z: 0,size: 30,color: color::mix(a: $COLOR_BLACK,b: $COLOR_WHITE,amount: 0.5))}`);step();p=await capture();near(p(640,360),[188,188,188,255],'GPU helpers');checks.push('GPU noise/random/colour helpers compile and render');
 // GPU-dependent inputs prevent constant folding and exercise hash/noise parity.
 const hash=n=>{n=(n^(n>>>16))>>>0;n=Math.imul(n,0x7feb352d)>>>0;n=(n^(n>>>15))>>>0;n=Math.imul(n,0x846ca68b)>>>0;return(n^(n>>>16))>>>0;};
 const random=(seed,index)=>(hash(index^hash(seed))>>>8)/16777216;
 load(`context 3d render {camera::orthographic(height: 4) draw::point_cloud(count: 4,x: $POINT_INDEX - 1.5,y: 0,z: 0,size: 30,color: color::rgb(r: math::random(seed: 7,index: $POINT_INDEX),g: math::noise(x: $POINT_INDEX,y: 0,z: 0,seed: 7)))}`);step();p=await capture();
 for(let i=0;i<4;i++){const noise=(hash(hash(hash(7^i)))>>>8)/16777216;near(p(640+(i-1.5)*180,360),[Math.round(random(7,i)*255),Math.round(noise*255),0,255],`GPU sample ${i}`);}
 checks.push('CPU/GPU random and integer-lattice noise test vectors');
 // A connected translucent corner should be no darker/brighter than its segments.
 load(`context 3d render {draw::background(color: $COLOR_BLACK) camera::orthographic(height: 4) draw::polyline(points: [[-1,0,0],[0,0,0],[0,1,0]],stroke_width: 0.4,line_join: "round",color: color::rgb(r: 1,g: 1,b: 1,a: 0.5))}`);step();p=await capture();near(p(630,370),[128,128,128,255],'translucent join');
 checks.push('continuous translucent join');
 // Verify that flat shading changes the normals used by a smooth mesh.
 const lit=mode=>`context 3d render {draw::background(color: $COLOR_BLACK) light::directional(x: -1,y: -1,z: -1) draw::sphere(radius: 2,resolution: 8,shading: "${mode}")}`;
 load(lit('flat'));step();const flat=await capture();load(lit('lambert'));step();const smooth=await capture();let differs=false;for(let x=500;x<780;x+=20){if(Math.abs(flat(x,330)[0]-smooth(x,330)[0])>5)differs=true;}assert(differs,'flat and Lambert shading were identical');checks.push('flat face normals differ from Lambert vertex normals');
 const sprite=roll=>`context 3d render {draw::background(color: $COLOR_BLACK) camera::orthographic(height: 4) draw::sprite(width: 2,height: 0.4,rotation_z_deg: ${roll},color: $COLOR_WHITE)}`;
 load(sprite(0));step();p=await capture();near(p(780,360),[255,255,255,255],'unrolled sprite');load(sprite(90));step();p=await capture();near(p(780,360),[0,0,0,255],'rolled sprite');near(p(640,220),[255,255,255,255],'visible sprite roll');checks.push('billboard Z roll');
 engine.set_asset_texture('081c271e-67d9-4a75-aff2-5a1bb88e4daa',1,1,new Uint8Array([255,255,255,255]));
 for(const name of ['01-calendar-clock','02-transform-mandala','03-connected-waveform','04-image-halo','05-world-ribbons','06-seeded-fields']){const source=await(await fetch(`../../examples/drawing/${name}.viscript`)).text();assert(!engine.validate_script(source),`${name}: validator`);load(source);for(let i=0;i<3;i++)step();await capture();checks.push(`live/capture ${name}`);}
 return {passed:true,checks};
}
