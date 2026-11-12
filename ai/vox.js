'use strict';
// Draws an agent's voxels in 3D with plain WebGL2. No libraries. One cube per pixel column, so about 2,000 instances.
// VoxelView(canvas, data, opts) -> { setYaw, destroy }. data is { palette, cells:[x,y,depth,glows,colourIndex] } from the server.
(function(){
  var VS='#version 300 es\nin vec3 pos;in vec3 nrm;in vec4 aCell;in vec3 aCol;uniform mat4 uMVP;uniform mat3 uRot;uniform vec3 uOrg;uniform vec2 uPivot;uniform vec2 uSwing;out vec3 vCol;out vec3 vN;out float vE;\n'
   +'void main(){float e=mod(aCell.w,2.0);float g=floor(aCell.w/2.0);vec3 q=aCell.xyz;'
   +'if(g>.5){float pv=g<2.5?uPivot.x:uPivot.y;float sg=(g<1.5||g>3.5)?1.0:-1.0;float a=sin(uSwing.x)*uSwing.y*sg;float c=cos(a),s=sin(a);float dy=q.y-pv,dz=q.z-16.0;q.y=pv+dy*c-dz*s;q.z=16.0+dy*s+dz*c;}'
   +'vec3 p=q-uOrg+pos;gl_Position=uMVP*vec4(p,1.0);vN=uRot*nrm;vCol=aCol;vE=e;}';
  var FS='#version 300 es\nprecision mediump float;in vec3 vCol;in vec3 vN;in float vE;uniform float uGlow;out vec4 o;\n'
   +'void main(){vec3 n=normalize(vN);float d=max(dot(n,normalize(vec3(-.45,.65,.6))),0.0);float r=pow(1.0-max(n.z,0.0),2.0)*.18;'
   +'vec3 c=vCol*(.42+.78*d)+r*vec3(.55,.8,1.0);if(vE>.5)c=vCol*(1.0+.18*uGlow)+.03*uGlow;o=vec4(c,1.0);}';
  var CUBE=(function(){var f=[[0,0,1,[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[0,0,-1,[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[1,0,0,[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[-1,0,0,[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[0,1,0,[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[0,-1,0,[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],v=[],ix=[];
    f.forEach(function(q,i){for(var k=3;k<7;k++)v.push(q[k][0]*.5,q[k][1]*.5,q[k][2]*.5,q[0],q[1],q[2]);var b=i*4;ix.push(b,b+1,b+2,b,b+2,b+3)});return{v:new Float32Array(v),i:new Uint16Array(ix)}})();
  function sh(gl,t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
  function mul(a,b){var o=new Float32Array(16);for(var c=0;c<4;c++)for(var r=0;r<4;r++){var q=0;for(var k=0;k<4;k++)q+=a[k*4+r]*b[c*4+k];o[c*4+r]=q}return o}
  function hex(c){var n=parseInt(c.slice(1,7),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
  function VoxelView(canvas,data,opts){
    opts=opts||{};
    var gl=canvas.getContext('webgl2',{antialias:true,alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:!!opts.keep});
    if(!gl)return null;
    var pr=gl.createProgram();gl.attachShader(pr,sh(gl,gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var vao=gl.createVertexArray();gl.bindVertexArray(vao);
    var vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,CUBE.v,gl.STATIC_DRAW);
    var lp=gl.getAttribLocation(pr,'pos'),ln=gl.getAttribLocation(pr,'nrm');
    gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(ln);gl.vertexAttribPointer(ln,3,gl.FLOAT,false,24,12);
    var ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,CUBE.i,gl.STATIC_DRAW);
    var pal=data.palette.map(hex),n=data.cells.length,inst=new Float32Array(n*7);
    data.cells.forEach(function(c,i){var k=pal[c[4]];inst.set([c[0],c[1],c[2],c[3],k[0],k[1],k[2]],i*7)});
    var ibuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ibuf);gl.bufferData(gl.ARRAY_BUFFER,inst,gl.STATIC_DRAW);
    var lc=gl.getAttribLocation(pr,'aCell'),lk=gl.getAttribLocation(pr,'aCol');
    gl.enableVertexAttribArray(lc);gl.vertexAttribPointer(lc,4,gl.FLOAT,false,28,0);gl.vertexAttribDivisor(lc,1);
    gl.enableVertexAttribArray(lk);gl.vertexAttribPointer(lk,3,gl.FLOAT,false,28,16);gl.vertexAttribDivisor(lk,1);
    var uOrg=gl.getUniformLocation(pr,'uOrg'),uPivot=gl.getUniformLocation(pr,'uPivot'),uSwing=gl.getUniformLocation(pr,'uSwing'),uM=gl.getUniformLocation(pr,'uMVP'),uR=gl.getUniformLocation(pr,'uRot'),uG=gl.getUniformLocation(pr,'uGlow');
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
    var yaw=0,pitch=.1,dragYaw=0,dragPitch=0,down=false,lx=0,ly=0,raf=0,t0=performance.now(),reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,manual=null;
    function size(){var dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(2,Math.round(canvas.clientWidth*dpr)),h=Math.max(2,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);return w/h}
    function draw(ts){
      var asp=size(),t=(ts-t0)/1000;
      var sway=manual!=null?manual:(reduce?0:Math.sin(t*.7)*.75),yw=sway+dragYaw,pt=pitch+dragPitch+(reduce?0:Math.sin(t*.9)*.03);
      var bob=reduce?0:Math.sin(t*2)*.7;
      var cy=Math.cos(yw),sy=Math.sin(yw),cp=Math.cos(pt),sp=Math.sin(pt);
      // model = Rx(pitch) * Ry(yaw), then pushed back from the camera and projected
      var R=[cy,sp*sy,-cp*sy, 0,cp,sp, sy,-sp*cy,cp*cy]; // column-major 3x3
      var R4=new Float32Array([R[0],R[1],R[2],0, R[3],R[4],R[5],0, R[6],R[7],R[8],0, 0,0,0,1]);
      var D=opts.dist||150,f=1/Math.tan((opts.fov||27)*Math.PI/360),nr=10,fr=400;
      var T=new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,bob,-D,1]);
      var P=new Float32Array([f/asp,0,0,0, 0,f,0,0, 0,0,(fr+nr)/(nr-fr),-1, 0,0,2*fr*nr/(nr-fr),0]);
      var M=mul(P,mul(T,R4));
      var maxY=0;data.cells.forEach(function(c){if(c[1]>maxY)maxY=c[1]});gl.uniform3f(uOrg,data.cx==null?15.5:data.cx,maxY/2,data.cz==null?16:data.cz);gl.uniform2f(uPivot,data.pivot?data.pivot[0]:8,data.pivot?data.pivot[1]:28);gl.uniform2f(uSwing,t*(opts.gait||5),opts.swing||0);gl.uniformMatrix4fv(uM,false,M);gl.uniformMatrix3fv(uR,false,new Float32Array(R));gl.uniform1f(uG,reduce?.5:.5+.5*Math.sin(t*2.4));
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.bindVertexArray(vao);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,n);
    }
    function loop(ts){raf=requestAnimationFrame(loop);draw(ts)}
    function pd(e){down=true;lx=e.clientX;ly=e.clientY;try{canvas.setPointerCapture(e.pointerId)}catch(x){}}
    function pm(e){if(!down)return;dragYaw+=(e.clientX-lx)*.012;dragPitch=Math.max(-.5,Math.min(.5,dragPitch+(e.clientY-ly)*.006));lx=e.clientX;ly=e.clientY}
    function pu(){down=false;var k=function(){if(down)return;dragYaw*=.92;dragPitch*=.92;if(Math.abs(dragYaw)>.002||Math.abs(dragPitch)>.002)requestAnimationFrame(k);else{dragYaw=0;dragPitch=0}};k()}
    canvas.addEventListener('pointerdown',pd);canvas.addEventListener('pointermove',pm);canvas.addEventListener('pointerup',pu);canvas.addEventListener('pointercancel',pu);
    canvas.style.touchAction='pan-y';
    if(reduce&&!opts.animate)draw(performance.now());else raf=requestAnimationFrame(loop);
    return{setYaw:function(a,p){manual=a;if(p!=null)pitch=p;draw(performance.now())},destroy:function(){cancelAnimationFrame(raf)}};
  }
  window.VoxelView=VoxelView;
})();
