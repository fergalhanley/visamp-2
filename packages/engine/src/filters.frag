#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_size;
uniform int u_kind;
uniform float u_amount;
uniform vec2 u_axis;
out vec4 color;
vec4 sampleInside(vec2 uv) {
    if(any(lessThan(uv,vec2(0))) || any(greaterThanEqual(uv,vec2(1)))) return vec4(0);
    return texture(u_source,uv);
}
void main() {
    vec2 uv=gl_FragCoord.xy/u_size;
    vec4 p=texture(u_source,uv);
    if(u_kind==0){color=p;return;}
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
