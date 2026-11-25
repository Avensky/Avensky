precision highp float;
uniform sampler2D finish;
uniform vec3 panel, stripe, wall;
varying vec3 world, face;
varying vec2 tex;
varying float kind;

float seam(float x, float thickness) {
  return smoothstep(0., thickness, min(fract(x),1.-fract(x)));
}
void main() {
  vec3 amber = mix(vec3(1.,.67,.34), stripe, .18);
  if (kind > 7.5) {
    vec2 q=abs(tex*2.-1.);
    if(kind>8.5) q=q.yx;
    float halo=exp(-3.2*q.y*q.y) * (1.-smoothstep(.72,1.,q.x)) * (1.-smoothstep(.65,1.,q.y));
    gl_FragColor=vec4(amber,.26*halo); return;
  }
  if(kind>5.5) { gl_FragColor=vec4(mix(amber,vec3(1.,.98,.9),.78),1.); return; }

  float ceilingWash = exp(-abs(world.y-66.5)*.065);
  float lampBay = exp(-pow((mod(world.x+54.,54.)-27.)/23.,2.));
  float backWall = exp(-abs(world.z+96.)*.032);
  float joints = min(abs(world.x)/108., abs(world.z-2.5)/100.);
  float concrete = texture2D(finish, vec2(fract(tex.x),1.-tex.y)).r;
  vec3 color;
  if(kind<2.5) {
    vec3 base = kind<.5 ? panel : kind<1.5 ? stripe : wall;
    float across=abs(face.z)>.5?world.x:world.z;
    float bayDistance=abs(mod(across+27.,54.)-27.);
    float pilasterShadow=.76+.24*smoothstep(1.,11.,bayDistance);
    float topShadow=1.-.28*smoothstep(67.,83.,world.y);
    float ambient=(.34+.17*smoothstep(0.,43.,world.y)-.10*pow(joints,3.))*pilasterShadow*topShadow;
    if(kind>1.5) base=mix(vec3(dot(base,vec3(.30,.58,.12))),base,.52);
    float grout=seam((across+5.)/25.,.007)*seam((world.y-1.)/15.,.012);
    float tie=length((fract(vec2((across+3.)/12.5,(world.y-2.)/15.))-.5)*vec2(12.5,15.));
    float formwork=mix(.79,1.,grout)*mix(.70,1.,smoothstep(.14,.32,tie));
    float variation = .73+.30*concrete;
    float signWash = exp(-length((world.xy-vec2(-28.,50.))/vec2(33.,13.))*1.8);
    float sideLight = .035*smoothstep(-35.,67.,world.y);
    color = base*(ambient+sideLight)*variation*formwork;
    color += amber*backWall*(.29*ceilingWash*lampBay+.105*signWash);
    color *= .87+.13*smoothstep(.8,5.,world.y);
  } else if(kind<3.5) {
    vec2 tile=world.xz/12.;
    float joints=seam(tile.x,.012)*seam(tile.y,.012);
    float grain=texture2D(finish,fract(world.xz/45.)).r;
    color=vec3(.115,.113,.11)*(.80+.27*grain)*mix(.62,1.,joints);
    float spill=exp(-abs(world.z+98.)*.023);
    color+=amber*.14*spill*(.22+.78*lampBay);
    // Soft reflected ceiling light on the stationary concrete floor.
    float reflection=exp(-abs(world.z+56.)*.028);
    color+=amber*.055*reflection*pow(lampBay,5.)*grain;
  } else {
    float rib=kind>4.5 ? .8+.2*seam(world.x/10.,.04) : 1.;
    float light=.70+.17*face.y+.10*face.z+.075*face.x;
    color=vec3(.19,.18,.165)*light*rib;
    color+=amber*.065*ceilingWash*lampBay*backWall;
  }
  gl_FragColor=vec4(color,1.);
}
