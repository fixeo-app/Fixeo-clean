/** Obsidian material: analytic sphere, moving surface relief and warm studio reflections.
 * No texture, face, orbit, global scale or rotation. Both sizes share these shaders. */
export const materialVertexShader = `
attribute vec2 position;
varying vec2 uv;
void main(){ uv=position; gl_Position=vec4(position,0.0,1.0); }
`;
export const materialFragmentShader = `
precision highp float;
varying vec2 uv;
uniform float time;
uniform float flow;
uniform float breath;
uniform float tension;
uniform vec3 contact;
uniform float compact;
float relief(vec3 p) {
  float t=flow*0.105;
  vec3 q=p*2.4;
  q+=0.54*vec3(sin(q.y*1.7+t*0.73),sin(q.z*1.6-t*0.53),sin(q.x*1.5+t*0.61));
  float fold=sin(q.x*1.9+sin(q.y*2.2+q.z+t)*1.5+t*0.59);
  float fold2=sin(q.y*1.6-q.z*1.7+sin(q.x*1.8-t*0.41));
  return 0.11*fold+0.075*fold2+0.018*sin(q.z*4.0+q.x*2.1+t*0.27);
}
float heightAt(vec2 p) {
  float r2=dot(p,p);
  float z=sqrt(max(0.002,1.0-r2));
  float d=length(p-contact.xy);
  float imprint=-contact.z*0.12*exp(-d*d*14.0);
  float ring=contact.z*0.028*exp(-pow((d-0.29)*7.0,2.0));
  return z+relief(vec3(p,z))*(1.0-smoothstep(0.6,1.0,r2))+imprint+ring;
}
void main(){
  vec2 p=uv*1.095;
  float angle=atan(p.y,p.x);
  float deformation=breath*(0.55*sin(angle*3.0+time*0.071)+0.45*sin(angle*2.0-time*0.093));
  float radius=1.0+deformation;
  p/=radius;
  float d=length(p);
  float alpha=1.0-smoothstep(0.988,1.004,d);
  if(alpha<0.001){ gl_FragColor=vec4(0.0); return; }
  float z=heightAt(p);
  float e=mix(0.003,0.008,compact);
  vec3 normal=normalize(vec3(heightAt(p-vec2(e,0.0))-heightAt(p+vec2(e,0.0)),heightAt(p-vec2(0.0,e))-heightAt(p+vec2(0.0,e)),2.0*e));
  vec3 view=vec3(0.0,0.0,1.0);
  vec3 reflected=reflect(-view,normal);
  float fresnel=pow(1.0-max(0.0,normal.z),3.0);
  float soft=pow(max(0.0,dot(reflected,normalize(vec3(-0.65,0.95,1.1)))),16.0);
  float strip=pow(max(0.0,dot(reflected,normalize(vec3(0.83,0.5,0.28)))),70.0);
  float warm=pow(max(0.0,dot(reflected,normalize(vec3(-0.78,-0.38,0.30)))),95.0);
  float lower=pow(max(0.0,dot(reflected,normalize(vec3(0.20,-0.90,0.62)))),36.0);
  vec3 black=vec3(0.009,0.008,0.007);
  vec3 color=black+vec3(0.25,0.255,0.26)*soft+vec3(0.73,0.48,0.25)*strip*0.85+vec3(0.64,0.39,0.19)*warm*0.60+vec3(0.14,0.095,0.055)*lower;
  color+=vec3(0.052,0.035,0.019)*fresnel*(0.35+0.65*max(0.0,normal.y));
  color*=0.75+0.25*smoothstep(-0.1,1.1,z);
  color=pow(color,vec3(0.78));
  gl_FragColor=vec4(color*alpha,alpha);
}
`;
