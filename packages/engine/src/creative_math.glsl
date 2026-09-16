uint creative_hash(uint n) { n ^= n >> 16; n *= 0x7feb352du; n ^= n >> 15; n *= 0x846ca68bu; return n ^ (n >> 16); }
bool creative_index(float n) { return !isnan(n) && !isinf(n) && n >= 0.0 && n <= 16777215.0 && n == floor(n); }
float creative_nan() { return uintBitsToFloat(0x7fc00000u); }
float creative_random(float seed, float index) { if (!creative_index(seed) || !creative_index(index)) return creative_nan(); return float(creative_hash(uint(index) ^ creative_hash(uint(seed))) >> 8) / 16777216.0; }
float creative_noise(float x,float y,float z,float seed) {
 vec3 p=vec3(x,y,z); if (!creative_index(seed) || any(isnan(p)) || any(isinf(p)) || any(greaterThan(abs(p),vec3(1000000.0)))) return creative_nan();
 ivec3 cell=ivec3(floor(p)); vec3 f=fract(p); f=f*f*(3.0-2.0*f); float sum=0.0;
 for(int c=0;c<8;c++){uint h=uint(seed);float w=1.0;for(int axis=0;axis<3;axis++){int bit=(c>>axis)&1;w*=bit==0?1.0-f[axis]:f[axis];h=creative_hash(h ^ uint(cell[axis]+bit));}sum+=w*float(h>>8)/16777216.0;} return sum;
}
float creative_lerp(float a,float b,float t){return a+(b-a)*t;}
float creative_map(float v,float lo,float hi,float a,float b,float bounded){if(lo==hi)return creative_nan();float t=(v-lo)/(hi-lo);return mix(a,b,bounded!=0.0?clamp(t,0.0,1.0):t);}
float creative_wrap(float v,float lo,float hi){return hi>lo?mod(v-lo,hi-lo)+lo:creative_nan();}
float creative_smoothstep(float v,float lo,float hi){return hi>lo?smoothstep(lo,hi,v):creative_nan();}
vec3 creative_linear(vec3 c){return mix(pow((c+0.055)/1.055,vec3(2.4)),c/12.92,lessThanEqual(c,vec3(0.04045)));}
vec3 creative_srgb(vec3 c){return mix(1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,c*12.92,lessThanEqual(c,vec3(0.0031308)));}
vec4 creative_color_mix(vec4 a,vec4 b,float t){t=clamp(t,0.0,1.0);return vec4(creative_srgb(mix(creative_linear(a.rgb),creative_linear(b.rgb),t)),mix(a.a,b.a,t));}
