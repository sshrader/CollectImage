'use strict';
// Draws an agent's voxels in 3D with plain WebGL2. No libraries. One cube per pixel column, so about 2,000 instances.
// VoxelView(canvas, data, opts) -> { setYaw, destroy }. data is { palette, cells:[x,y,depth,glows,colourIndex] } from the server.
(function(){
  var VS='#version 300 es\nin vec3 pos;in vec3 nrm;in vec4 aCell;in vec3 aCol;uniform mat4 uMVP;uniform mat3 uRot;uniform vec3 uOrg;uniform vec2 uPivot;uniform vec3 uSwing;uniform vec2 uArmA;uniform vec2 uArmM;uniform float uLevel;uniform vec2 uHand;uniform float uLean;out vec3 vCol;out vec3 vN;out float vE;\n'
   +'vec3 rot(vec3 q,float py,float pz,float a){float c=cos(a),s=sin(a),dy=q.y-py,dz=q.z-pz;return vec3(q.x,py+dy*c-dz*s,pz+dy*s+dz*c);}\n'
   +'void main(){float e=mod(aCell.w,2.0);float g=floor(aCell.w/2.0);vec3 q=aCell.xyz;'
   +'if(g>.5){float ph=sin(uSwing.x);'
   +'if(g<2.5){float sg=g<1.5?1.0:-1.0;q=rot(q,uPivot.x,16.0,ph*uSwing.y*sg);}'
   +'else{bool R=abs(g-3.0)<.5||abs(g-5.0)<.5;float sg=R?-1.0:1.0;float m=R?uArmM.x:uArmM.y;float ov=R?uArmA.x:uArmA.y;float a=mix(ph*uSwing.z*sg,ov,m);'
   +'if(g>4.5)q=rot(q,uHand.x,uHand.y,-ov*m*uLevel);q=rot(q,uPivot.y,16.0,a);}}'
   +'q=rot(q,0.0,16.0,uLean);'
   +'vec3 p=q-uOrg+pos;gl_Position=uMVP*vec4(p,1.0);vN=uRot*nrm;vCol=aCol;vE=e;}';
  var FS='#version 300 es\nprecision mediump float;in vec3 vCol;in vec3 vN;in float vE;uniform float uGlow;out vec4 o;\n'
   +'void main(){vec3 n=normalize(vN);float d=max(dot(n,normalize(vec3(-.45,.65,.6))),0.0);float r=pow(1.0-max(n.z,0.0),2.0)*.18;'
   +'vec3 c=vCol*(.42+.78*d)+r*vec3(.55,.8,1.0);if(vE>.5)c=vCol*(1.0+.18*uGlow)+.03*uGlow;o=vec4(c,1.0);}';
  var CUBE=(function(){var f=[[0,0,1,[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[0,0,-1,[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[1,0,0,[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[-1,0,0,[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[0,1,0,[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[0,-1,0,[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],v=[],ix=[];
    f.forEach(function(q,i){for(var k=3;k<7;k++)v.push(q[k][0]*.5,q[k][1]*.5,q[k][2]*.5,q[0],q[1],q[2]);var b=i*4;ix.push(b,b+1,b+2,b,b+2,b+3)});return{v:new Float32Array(v),i:new Uint16Array(ix)}})();
  function sh(gl,t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
  function mul(a,b){var o=new Float32Array(16);for(var c=0;c<4;c++)for(var r=0;r<4;r++){var q=0;for(var k=0;k<4;k++)q+=a[k*4+r]*b[c*4+k];o[c*4+r]=q}return o}
  function hex(c){var n=parseInt(c.slice(1,7),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}

  // Poses: what a mech does (run, walk, aim and fire) as numbers the shader turns into limb angles. Shared with the 3D intro.
  var MechPose=(function(){
    var Z={leg:0,arm:0,lean:0,aR:0,aL:0,mR:0,mL:0,lv:0};
    function target(d,st,t,kick){
      var g=d.gun||{kind:'none'},kind=g.kind||'none',armed=kind!=='none',melee=kind==='blade'||kind==='claw'||kind==='none',hasMuz=!!(d.muz&&d.muz.length);
      var wR=armed&&(g.side==='R'||g.twin),wL=armed&&(g.side==='L'||g.twin),P={leg:0,arm:0,lean:0,aR:0,aL:0,mR:0,mL:0,lv:melee?0:1};kick=kick||0;
      if(st==='run'){P.leg=.95;P.arm=.85;P.lean=.2;if(wR){P.mR=.55;P.aR=-.9}if(wL){P.mL=.55;P.aL=-.9}}
      else if(st==='walk'){P.leg=.5;P.arm=.4}
      else if(st==='aim'){
        if(!melee){var rz=-1.45+kick*.18;if(wR){P.mR=1;P.aR=rz}if(wL){P.mL=1;P.aL=rz}}
        else if(armed){if(wR){P.mR=1;P.aR=-1.25+Math.sin(t*7)*1.05}if(wL){P.mL=1;P.aL=-1.25+Math.sin(t*7+1.6)*1.05}}
        else if(!hasMuz){P.mR=1;P.mL=1;P.aR=-1.3*Math.max(0,Math.sin(t*8));P.aL=-1.3*Math.max(0,-Math.sin(t*8))}
        P.lean=-kick*.06;
      }
      return P}
    function blend(c,t,k){var o={};for(var key in t)o[key]=c[key]+(t[key]-c[key])*k;return o}
    // where the shots leave, in model space, in the aiming pose
    function muzzles(d){
      var out=[],g=d.gun;
      if(g&&(g.kind==='rifle'||g.kind==='gatling'||g.kind==='cannon')){
        var a=-1.45,py=d.pivot[1],hx=g.hand[0],hy=g.hand[1],hz=g.hand[2],dy=hy-py,dz=hz-16,y=py+dy*Math.cos(a)-dz*Math.sin(a),z=16+dy*Math.sin(a)+dz*Math.cos(a);
        (g.twin?['R','L']:[g.side]).forEach(function(s){out.push({x:s==='R'?hx:31-hx,y:y,z:z+g.len+1,dx:0,dy:0,dz:1})})}
      (d.muz||[]).forEach(function(m){out.push(m)});
      return out}
    return{target:target,blend:blend,muzzles:muzzles,zero:Z};
  })();
  window.MechPose=MechPose;
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
    var pal=data.palette.map(hex),n=data.cells.length,BM=160,inst=new Float32Array((n+BM)*7);
    data.cells.forEach(function(c,i){var k=pal[c[4]];inst.set([c[0],c[1],c[2],c[3],k[0],k[1],k[2]],i*7)});
    var ibuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ibuf);gl.bufferData(gl.ARRAY_BUFFER,inst,gl.DYNAMIC_DRAW);
    var lc=gl.getAttribLocation(pr,'aCell'),lk=gl.getAttribLocation(pr,'aCol');
    gl.enableVertexAttribArray(lc);gl.vertexAttribPointer(lc,4,gl.FLOAT,false,28,0);gl.vertexAttribDivisor(lc,1);
    gl.enableVertexAttribArray(lk);gl.vertexAttribPointer(lk,3,gl.FLOAT,false,28,16);gl.vertexAttribDivisor(lk,1);
    var UL=function(k){return gl.getUniformLocation(pr,k)},uArmA=UL('uArmA'),uArmM=UL('uArmM'),uLevel=UL('uLevel'),uHand=UL('uHand'),uLean=UL('uLean'),uOrg=gl.getUniformLocation(pr,'uOrg'),uPivot=gl.getUniformLocation(pr,'uPivot'),uSwing=gl.getUniformLocation(pr,'uSwing'),uM=gl.getUniformLocation(pr,'uMVP'),uR=gl.getUniformLocation(pr,'uRot'),uG=gl.getUniformLocation(pr,'uGlow');
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
    var yaw=0,pitch=.1,dragYaw=0,dragPitch=0,down=false,lx=0,ly=0,raf=0,t0=performance.now(),reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,manual=null;
    function size(){var dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(2,Math.round(canvas.clientWidth*dpr)),h=Math.max(2,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);return w/h}
    var cur=null,phase=0,fireT=.4,kick=0,bolts=[],lt=0,gcol=hex(data.glow||'#4ff3ff'),still=reduce||opts.anim===false;
    function draw(ts){
      var asp=size(),t=(ts-t0)/1000,dtm=lt?Math.min(.05,(ts-lt)/1000):0;lt=ts;
      var cyc=t%8.5,stt=still?'idle':(cyc<3.4?'run':'aim'),tg=MechPose.target(data,stt,t,kick);cur=cur?MechPose.blend(cur,tg,Math.min(1,dtm*7)):tg;
      if(stt==='run')phase+=dtm*9;
      kick*=Math.exp(-dtm*10);
      if(stt==='aim'){fireT-=dtm;if(fireT<=0){fireT=.3;var mz=MechPose.muzzles(data).slice(0,4);mz.forEach(function(m){var l=Math.hypot(m.dx,m.dy,m.dz)||1;bolts.push({x:m.x,y:m.y,z:m.z,dx:m.dx/l,dy:m.dy/l,dz:m.dz/l,age:0})});if(mz.length)kick=1}}
      else fireT=.25;
      bolts=bolts.filter(function(b){b.age+=dtm;return b.age<.5});
      var nb=0;bolts.slice(0,BM/4|0).forEach(function(b){for(var k=0;k<4;k++){var d=b.age*70-k*1.7,o=(n+nb)*7;inst[o]=b.x+b.dx*d;inst[o+1]=b.y+b.dy*d;inst[o+2]=b.z+b.dz*d;inst[o+3]=1;inst[o+4]=gcol[0];inst[o+5]=gcol[1];inst[o+6]=gcol[2];nb++}});
      gl.bindBuffer(gl.ARRAY_BUFFER,ibuf);if(nb)gl.bufferSubData(gl.ARRAY_BUFFER,n*28,inst.subarray(n*7,(n+nb)*7));
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
      var maxY=0;data.cells.forEach(function(c){if(c[1]>maxY)maxY=c[1]});gl.uniform3f(uOrg,data.cx==null?15.5:data.cx,maxY/2,data.cz==null?16:data.cz);gl.uniform2f(uPivot,data.pivot?data.pivot[0]:8,data.pivot?data.pivot[1]:28);gl.uniform3f(uSwing,phase,cur.leg,cur.arm);gl.uniform2f(uArmA,cur.aR,cur.aL);gl.uniform2f(uArmM,cur.mR,cur.mL);gl.uniform1f(uLevel,cur.lv);var hg=data.gun&&data.gun.hand;gl.uniform2f(uHand,hg?hg[1]:0,hg?hg[2]:16);gl.uniform1f(uLean,cur.lean);gl.uniformMatrix4fv(uM,false,M);gl.uniformMatrix3fv(uR,false,new Float32Array(R));gl.uniform1f(uG,reduce?.5:.5+.5*Math.sin(t*2.4));
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.bindVertexArray(vao);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,n+nb);
    }
    function loop(ts){raf=requestAnimationFrame(loop);draw(ts)}
    function pd(e){down=true;lx=e.clientX;ly=e.clientY;try{canvas.setPointerCapture(e.pointerId)}catch(x){}}
    function pm(e){if(!down)return;dragYaw+=(e.clientX-lx)*.012;dragPitch=Math.max(-.5,Math.min(.5,dragPitch+(e.clientY-ly)*.006));lx=e.clientX;ly=e.clientY}
    function pu(){down=false;if(opts.hold)return;var k=function(){if(down)return;dragYaw*=.92;dragPitch*=.92;if(Math.abs(dragYaw)>.002||Math.abs(dragPitch)>.002)requestAnimationFrame(k);else{dragYaw=0;dragPitch=0}};k()}
    canvas.addEventListener('pointerdown',pd);canvas.addEventListener('pointermove',pm);canvas.addEventListener('pointerup',pu);canvas.addEventListener('pointercancel',pu);
    canvas.style.touchAction='pan-y';
    if(reduce&&!opts.animate)draw(performance.now());else raf=requestAnimationFrame(loop);
    return{setYaw:function(a,p){manual=a;if(p!=null)pitch=p;draw(performance.now())},pause:function(){cancelAnimationFrame(raf);raf=0},resume:function(){if(!raf)raf=requestAnimationFrame(loop)},destroy:function(){cancelAnimationFrame(raf);raf=0;try{var x=gl.getExtension('WEBGL_lose_context');if(x)x.loseContext()}catch(e){}}};
  }
  // A live 3D card: swaps an <img> for a canvas you can drag to turn. Falls back to the image if WebGL or the fetch fails.
  var cards={},live=0;
  function card(img,url,o){
    o=o||{};if(cards[url]){if(img.parentNode)img.parentNode.replaceChild(cards[url].canvas,img);cards[url].view.resume();return cards[url].canvas}
    if(live>=(o.max||12))return null;
    live++;
    fetch(url).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){
      var c=document.createElement('canvas');c.className=(o.cls||'')+' vox3d';c.setAttribute('role','img');c.setAttribute('aria-label',(img.alt||'Agent')+' (3D, drag to turn)');
      c.style.cssText='width:100%;aspect-ratio:1;display:block;border-radius:'+(o.radius||'6px')+';cursor:grab;background:radial-gradient(circle at 50% 62%,'+(d.glow||'#3dffb0')+'33,transparent 58%),'+(d.scheme||'#0a1a12');
      var v=VoxelView(c,d,{hold:true,swing:.35,gait:3,dist:o.dist||128,fov:27});if(!v){live--;return}
      cards[url]={canvas:c,view:v};if(img.parentNode)img.parentNode.replaceChild(c,img);
      var moved=false,sx=0,sy=0;c.addEventListener('pointerdown',function(e){moved=false;sx=e.clientX;sy=e.clientY;c.style.cursor='grabbing'});
      c.addEventListener('pointermove',function(e){if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>5)moved=true});
      c.addEventListener('pointerup',function(){c.style.cursor='grab'});
      c.addEventListener('click',function(e){if(moved){e.stopPropagation();e.preventDefault();moved=false}},true);
    }).catch(function(){live--});
    return null}
  VoxelView.card=card;
  window.VoxelView=VoxelView;
})();
