#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_size;
uniform int u_kind;
uniform float u_amount;
uniform vec2 u_axis;
uniform vec4 u_params0;
uniform vec4 u_params1;
uniform vec4 u_gap;
uniform sampler2D u_aux;
out vec4 color;
vec4 sampleInside(vec2 uv) {
    if(any(lessThan(uv,vec2(0))) || any(greaterThanEqual(uv,vec2(1)))) return vec4(0);
    return texture(u_source,uv);
}
const float PI = 3.141592653589793;
vec2 rotatePoint(vec2 p, float angle) {
    float c=cos(angle), s=sin(angle);
    return vec2(c*p.x-s*p.y,s*p.x+c*p.y);
}
vec4 canvasSample(vec2 p) { return sampleInside(vec2(p.x/u_size.x,1.0-p.y/u_size.y)); }
float polygonDistance(vec2 p, float radius, int sides, float angle) {
    float d=-1e30;
    for(int i=0;i<6;i++) {
        if(i>=sides)break;
        float a=angle+(float(i)+0.5)*2.0*PI/float(sides);
        d=max(d,dot(p,vec2(cos(a),sin(a)))-radius*cos(PI/float(sides)));
    }
    return d;
}
float starDistance(vec2 p, float radius, int tips) {
    // Alternating outer/inner vertices form the filled five/six-point star.
    float inner=radius*(tips==5?0.38196601125:0.57735026919);
    float distanceSquared=1e30;bool inside=false;
    vec2 previous=vec2(0,-radius);
    for(int i=1;i<=12;i++) {
        if(i>2*tips)break;
        float a=-PI/2.0+float(i)*PI/float(tips);
        vec2 next=vec2(cos(a),sin(a))*(i%2==0?radius:inner);
        vec2 edge=next-previous, offset=p-previous;
        vec2 nearest=offset-edge*clamp(dot(offset,edge)/dot(edge,edge),0.0,1.0);
        distanceSquared=min(distanceSquared,dot(nearest,nearest));
        if((previous.y>p.y)!=(next.y>p.y)) {
            if(p.x<(next.x-previous.x)*(p.y-previous.y)/(next.y-previous.y)+previous.x)inside=!inside;
        }
        previous=next;
    }
    return sqrt(distanceSquared)*(inside?-1.0:1.0);
}
vec2 foldWedge(vec2 p, float angle) {
    float radius=length(p);
    if(radius==0.0)return vec2(0);
    float a=abs(mod(atan(p.y,p.x)+angle,2.0*angle)-angle);
    return radius*vec2(cos(a),sin(a));
}
vec4 pixelate(vec2 point) {
    float size=u_params0.x, height=u_params0.y, gap=u_params0.z, angle=u_params0.w;
    vec2 q=rotatePoint(point-u_size/2.0,-angle)+u_size/2.0;
    vec2 centre;float distanceToEdge=-1.0;
    if(u_kind==14) {
        float side=size+sqrt(3.0)*gap, h=side*sqrt(3.0)/2.0;
        vec2 uv=vec2(q.x/side-q.y/(2.0*h),q.y/h);
        vec2 cell=floor(uv), f=fract(uv);
        bool lower=f.x+f.y<=1.0;
        vec2 base=vec2(side*(cell.x+cell.y/2.0),h*cell.y);
        centre=base+(lower?vec2(side/2.0,h/3.0):vec2(side,2.0*h/3.0));
        if(gap>0.0)distanceToEdge=polygonDistance(q-centre,size/sqrt(3.0),3,lower?PI/2.0:-PI/2.0);
    } else if(u_kind==16) {
        float radius=size+gap/sqrt(3.0);
        vec2 cell=floor(vec2(2.0*q.x/(3.0*radius),(-q.x/3.0+q.y/sqrt(3.0))/radius));
        float best=1e30;centre=vec2(0);
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++) {
            vec2 c=cell+vec2(x,y);
            vec2 candidate=radius*vec2(1.5*c.x,sqrt(3.0)*(c.y+c.x/2.0));
            float d=dot(candidate-q,candidate-q);
            if(d<best){best=d;centre=candidate;}
        }
        if(gap>0.0)distanceToEdge=polygonDistance(q-centre,size,6,0.0);
    } else {
        float radius=u_kind==15?size/(2.0*sin(PI/5.0)):size/2.0;
        vec2 dimensions=u_kind==12?vec2(size,height):vec2(2.0*radius);
        centre=(floor(q/(dimensions+gap))+0.5)*(dimensions+gap);
        vec2 local=q-centre;
        if(u_kind==12) { if(gap>0.0)distanceToEdge=max(abs(local.x)-size/2.0,abs(local.y)-height/2.0); }
        else if(u_kind==13)distanceToEdge=length(local)-radius;
        else if(u_kind==15)distanceToEdge=polygonDistance(local,radius,5,-PI/2.0);
        else distanceToEdge=starDistance(local,radius,u_kind==17?5:6);
    }
    float feather=max(fwidth(distanceToEdge),0.0001);
    float coverage=1.0-smoothstep(-feather/2.0,feather/2.0,distanceToEdge);
    vec2 source=rotatePoint(centre-u_size/2.0,angle)+u_size/2.0;
    // Partial edge cells sample the nearest source pixel rather than disappearing.
    vec4 cellColor=canvasSample(clamp(source,vec2(0.5),u_size-0.5));
    return mix(vec4(u_gap.rgb*u_gap.a,u_gap.a),cellColor,coverage);
}
void main() {
    vec2 uv=gl_FragCoord.xy/u_size;
    vec4 p=texture(u_source,uv);
    if(u_kind==0){color=p;return;}
    vec2 point=vec2(gl_FragCoord.x,u_size.y-gl_FragCoord.y);
    if(u_kind==10) {
        float angle=PI/u_params0.z, rotation=u_params1.x;
        vec2 centre=u_params0.xy;
        vec2 folded=foldWedge(rotatePoint(point-centre,-rotation),angle);
        if(u_params0.w>1.0) {
            // The outer chord closes the wedge into an isosceles triangle.
            // Reflect across its hypotenuse, then back across wedge edges.
            vec2 extent=max(abs(centre),abs(u_size-centre));
            float radius=length(extent)/u_params0.w;
            vec2 normal=vec2(cos(angle/2.0),sin(angle/2.0));
            float boundary=radius*cos(angle/2.0);
            for(int i=0;i<16;i++) {
                float outside=dot(folded,normal)-boundary;
                if(outside<=0.0)break;
                folded=foldWedge(folded-2.0*outside*normal,angle);
            }
        }
        color=canvasSample(centre+rotatePoint(folded,rotation));return;
    }
    if(u_kind==11) {
        vec2 d=point-u_params0.xy;float r=length(d);
        float twist=u_params0.w*(1.0-smoothstep(0.0,u_params0.z,r));
        color=canvasSample(u_params0.xy+rotatePoint(d,-twist));return;
    }
    if(u_kind>=12 && u_kind<=18){color=pixelate(point);return;}
    if(u_kind==19) {
        if(u_params0.x!=1.0)point.x=min(point.x,u_size.x-point.x);
        if(u_params0.x!=0.0)point.y=min(point.y,u_size.y-point.y);
        color=canvasSample(point);return;
    }
    if(u_kind==20) {
        vec3 c=p.a>0.0?p.rgb/p.a:vec3(0);
        color=vec4(floor(c*(u_amount-1.0)+0.5)/(u_amount-1.0)*p.a,p.a);return;
    }
    if(u_kind==21) {
        vec2 offset=u_params0.x*vec2(cos(u_params0.y),sin(u_params0.y));
        vec4 r=canvasSample(point-offset),b=canvasSample(point+offset);
        color=vec4(r.r,p.g,b.b,max(p.a,max(r.a,b.a)));return;
    }
    if(u_kind==22) {
        float r=length(point-u_params0.xy)/u_params0.z;
        float shade=1.0-u_amount*smoothstep(1.0-u_params0.w,1.0,r);
        color=vec4(p.rgb*shade,p.a);return;
    }
    if(u_kind==23) {
        vec2 d=point-u_params0.xy;float r=length(d);
        float wave=sin(2.0*PI*(r/u_params0.z-u_params1.x))*u_params0.w;
        color=canvasSample(point+(r>0.0?d/r:vec2(0))*wave*min(r/u_params0.z,1.0));return;
    }
    if(u_kind==24) {
        float coordinate=dot(point,vec2(-sin(u_params0.y),cos(u_params0.y)));
        float stripe=0.5-0.5*cos(coordinate*2.0*PI/u_params0.x);
        color=vec4(p.rgb*(1.0-u_amount*stripe),p.a);return;
    }
    if(u_kind==26) {
        vec4 map=texture(u_aux,vec2(uv.x,1.0-uv.y));
        vec2 offset=(map.rg*2.0-1.0)*map.a*u_params0.x;
        color=canvasSample(point+offset);return;
    }
    if(u_kind==27) { // Bloom bright extraction, preserving premultiplied alpha.
        float brightness=max(p.r,max(p.g,p.b));
        float weight=brightness>u_amount?(brightness-u_amount)/max(brightness,0.000001):0.0;
        color=p*weight;return;
    }
    if(u_kind==28) {
        vec4 base=texture(u_aux,uv), glow=p*u_amount;
        float a=min(1.0,base.a+glow.a);
        color=vec4(min(base.rgb+glow.rgb,vec3(a)),a);return;
    }

    if(u_kind==9){
        // Premultiplied Gaussian: transparent borders cannot introduce dark fringes.
        vec4 sum=vec4(0);float total=0.0;
        for(int i=-24;i<=24;i++) {
            if(abs(float(i))>ceil(3.0*u_amount))continue;
            float d=float(i)/u_amount;float weight=exp(-0.5*d*d);
            sum+=sampleInside(uv+u_axis*float(i)/vec2(textureSize(u_source,0)))*weight;
            total+=weight;
        }
        // At the 1px pyramid limit a very large sigma still loses energy to
        // transparent space, instead of silently clamping the requested blur.
        if(u_amount>8.0)color=(sum/u_amount)*0.3989422804;
        else color=sum/max(total,0.000001);
        return;
    }
    float a=p.a;vec3 c=a>0.0?p.rgb/a:vec3(0);
    float t=u_amount;
    if(u_kind==1)c*=t;
    else if(u_kind==2)c=(c-0.5)*t+0.5;
    else if(u_kind==3 || u_kind==4){
        float s=u_kind==4?1.0-t:t;
        vec3 weights=u_kind==4?vec3(0.2126,0.7152,0.0722):vec3(0.213,0.715,0.072);
        c=mix(vec3(dot(c,weights)),c,s);
    }else if(u_kind==5){
        float co=cos(t),si=sin(t);
        c=vec3(dot(c,vec3(0.213+co*0.787-si*0.213,0.715-co*0.715-si*0.715,0.072-co*0.072+si*0.928)),
               dot(c,vec3(0.213-co*0.213+si*0.143,0.715+co*0.285+si*0.140,0.072-co*0.072-si*0.283)),
               dot(c,vec3(0.213-co*0.213-si*0.787,0.715-co*0.715+si*0.715,0.072+co*0.928+si*0.072)));
    }else if(u_kind==6)c=mix(c,1.0-c,t);
    else if(u_kind==7)a*=t;
    else if(u_kind==8)c=mix(c,vec3(dot(c,vec3(0.393,0.769,0.189)),dot(c,vec3(0.349,0.686,0.168)),dot(c,vec3(0.272,0.534,0.131))),t);
    color=vec4(clamp(c,0.0,1.0)*a,a);
}
