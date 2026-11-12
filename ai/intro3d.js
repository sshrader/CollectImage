'use strict';
// The 3D intro: voxel agents walk a lit data highway through scanning gates, under falling code.
// Plain WebGL2, no libraries. Intro3D.create(canvas, { agents: [voxelData, ...] }) -> { start, stop, renderAt(t) } or null.
(function(){
  var VS='#version 300 es\nin vec3 pos;in vec3 nrm;in vec4 aCell;in vec3 aCol;uniform mat4 uVP;uniform mat4 uModel;uniform mat3 uRot;uniform vec3 uOrg;uniform vec2 uPivot;uniform vec2 uSwing;out vec3 vCol;out vec3 vN;out float vE;out float vW;\n'
   +'void main(){float e=mod(aCell.w,2.0);float g=floor(aCell.w/2.0);vec3 q=aCell.xyz;'
   +'if(g>.5){float pv=g<2.5?uPivot.x:uPivot.y;float sg=(g<1.5||g>3.5)?1.0:-1.0;float a=sin(uSwing.x)*uSwing.y*sg;float c=cos(a),s=sin(a);float dy=q.y-pv,dz=q.z-16.0;q.y=pv+dy*c-dz*s;q.z=16.0+dy*s+dz*c;}'
   +'vec3 p=q-uOrg+pos;gl_Position=uVP*(uModel*vec4(p,1.0));vN=uRot*nrm;vCol=aCol;vE=e;vW=gl_Position.w;}';
  var FS='#version 300 es\nprecision mediump float;in vec3 vCol;in vec3 vN;in float vE;in float vW;uniform vec3 uCol;uniform float uOver;uniform float uEmit;uniform float uBoost;uniform vec3 uTint;uniform vec3 uFog;uniform vec2 uFogR;out vec4 o;\n'
   +'void main(){vec3 base=uOver>.5?uCol:vCol;vec3 n=normalize(vN);float d=max(dot(n,normalize(vec3(-.35,.7,.6))),0.0);float rim=pow(1.0-max(n.z,0.0),2.0)*.12;'
   +'vec3 c=base*(.4+.8*d)+rim*vec3(.4,1.0,.7);if(vE>.5||uEmit>.5)c=base*(1.0+.5*uBoost)+.05*uBoost;c*=uTint;'
   +'float f=clamp((vW-uFogR.x)/(uFogR.y-uFogR.x),0.0,1.0);o=vec4(mix(c,uFog,f),1.0);}';
  var CUBE=(function(){var f=[[0,0,1,[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[0,0,-1,[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[1,0,0,[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[-1,0,0,[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[0,1,0,[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[0,-1,0,[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],v=[],ix=[];
    f.forEach(function(q,i){for(var k=3;k<7;k++)v.push(q[k][0]*.5,q[k][1]*.5,q[k][2]*.5,q[0],q[1],q[2]);var b=i*4;ix.push(b,b+1,b+2,b,b+2,b+3)});return{v:new Float32Array(v),i:new Uint16Array(ix)}})();
  function hex(c){var n=parseInt(c.slice(1,7),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
  function mul(a,b){var o=new Float32Array(16);for(var c=0;c<4;c++)for(var r=0;r<4;r++){var q=0;for(var k=0;k<4;k++)q+=a[k*4+r]*b[c*4+k];o[c*4+r]=q}return o}
  function mul3(a,b){var o=new Float32Array(9);for(var c=0;c<3;c++)for(var r=0;r<3;r++){var q=0;for(var k=0;k<3;k++)q+=a[k*3+r]*b[c*3+k];o[c*3+r]=q}return o}
  function persp(fov,asp,n,f){var t=1/Math.tan(fov*Math.PI/360);return new Float32Array([t/asp,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0])}
  function look(e,c){var f=[c[0]-e[0],c[1]-e[1],c[2]-e[2]],l=Math.hypot(f[0],f[1],f[2]);f=f.map(function(v){return v/l});
    var s=[f[1]*0-f[2]*1,f[2]*0-f[0]*0,f[0]*1-f[1]*0];s=[-f[2],0,f[0]];l=Math.hypot(s[0],s[2]);s=[s[0]/l,0,s[2]/l];
    var u=[s[1]*f[2]-s[2]*f[1],s[2]*f[0]-s[0]*f[2],s[0]*f[1]-s[1]*f[0]];
    return new Float32Array([s[0],u[0],-f[0],0,s[1],u[1],-f[1],0,s[2],u[2],-f[2],0,-(s[0]*e[0]+s[1]*e[1]+s[2]*e[2]),-(u[0]*e[0]+u[1]*e[1]+u[2]*e[2]),(f[0]*e[0]+f[1]*e[1]+f[2]*e[2]),1])}
  // translate, then yaw and roll, then scale: returns the 4x4 model and the 3x3 rotation for normals
  function trs(tx,ty,tz,yaw,roll,sx,sy,sz){var cy=Math.cos(yaw),sy_=Math.sin(yaw),cz=Math.cos(roll),sz_=Math.sin(roll);
    var Ry=[cy,0,-sy_,0,1,0,sy_,0,cy],Rz=[cz,sz_,0,-sz_,cz,0,0,0,1],R=mul3(Ry,Rz);
    return{m:new Float32Array([R[0]*sx,R[1]*sx,R[2]*sx,0,R[3]*sy,R[4]*sy,R[5]*sy,0,R[6]*sz,R[7]*sz,R[8]*sz,0,tx,ty,tz,1]),r:R}}
  function rnd(seed){var a=seed>>>0;return function(){a=(a+0x6d2b79f5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
  function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)}
  function sh(gl,t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}

  function create(canvas,opts){
    var gl;try{gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:!!opts.keep})}catch(e){gl=null}
    if(!gl||!opts.agents||!opts.agents.length)return null;
    var pr=gl.createProgram();gl.attachShader(pr,sh(gl,gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var L=function(n){return gl.getAttribLocation(pr,n)},U=function(n){return gl.getUniformLocation(pr,n)};
    var vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,CUBE.v,gl.STATIC_DRAW);
    var ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,CUBE.i,gl.STATIC_DRAW);
    var uOrg=U('uOrg'),uPivot=U('uPivot'),uSwing=U('uSwing'),uVP=U('uVP'),uModel=U('uModel'),uRot=U('uRot'),uCol=U('uCol'),uOver=U('uOver'),uEmit=U('uEmit'),uBoost=U('uBoost');
    gl.uniform3f(U('uTint'),.86,1,.93);gl.uniform3f(U('uFog'),0,.01,.005);gl.uniform2f(U('uFogR'),40,125);
    // an object is a set of instances (cells) in its own vertex array
    function obj(data,max,dynamic){
      var vao=gl.createVertexArray();gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.enableVertexAttribArray(L('pos'));gl.vertexAttribPointer(L('pos'),3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(L('nrm'));gl.vertexAttribPointer(L('nrm'),3,gl.FLOAT,false,24,12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
      var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data||new Float32Array(max*7),dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
      gl.enableVertexAttribArray(L('aCell'));gl.vertexAttribPointer(L('aCell'),4,gl.FLOAT,false,28,0);gl.vertexAttribDivisor(L('aCell'),1);
      gl.enableVertexAttribArray(L('aCol'));gl.vertexAttribPointer(L('aCol'),3,gl.FLOAT,false,28,16);gl.vertexAttribDivisor(L('aCol'),1);
      return{vao:vao,buf:buf,n:data?data.length/7:0};
    }
    function voxObj(d){var pal=d.palette.map(hex),a=new Float32Array(d.cells.length*7);d.cells.forEach(function(c,i){var k=pal[c[4]];a.set([c[0],c[1],c[2],c[3],k[0],k[1],k[2]],i*7)});var o=obj(a);o.org=[d.cx==null?15.5:d.cx,0,d.cz==null?16:d.cz];o.pivot=d.pivot||[8,28];return o}
    var box=obj(new Float32Array([0,0,0,0,1,1,1]));box.org=[0,0,0];box.pivot=[0,0];
    function draw(o,T,fx){fx=fx||{};gl.bindVertexArray(o.vao);gl.uniformMatrix4fv(uModel,false,T.m);gl.uniformMatrix3fv(uRot,false,T.r);
      if(fx.col){gl.uniform1f(uOver,1);gl.uniform3f(uCol,fx.col[0],fx.col[1],fx.col[2])}else gl.uniform1f(uOver,0);
      gl.uniform1f(uEmit,fx.emit?1:0);gl.uniform1f(uBoost,fx.boost||0);var og=o.org||[0,0,0],pv=o.pivot||[0,0];gl.uniform3f(uOrg,og[0],og[1],og[2]);gl.uniform2f(uPivot,pv[0],pv[1]);gl.uniform2f(uSwing,fx.sw?fx.sw[0]:0,fx.sw?fx.sw[1]:0);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,o.n)}
    function bx(x,y,z,sx,sy,sz,col,boost){draw(box,trs(x,y,z,0,0,sx,sy,sz),{col:col,emit:true,boost:boost||0})}

    var agents=opts.agents.slice(0,4).map(function(d){return voxObj(d)});
    var LANES=[-4,1,6],DIV=[-6.5,-1.5,3.5,8.5],GATES=[-5,9],S=.135;
    var rd=rnd(7),st=[];
    var CFG=[[0,-12,3.4],[1,-3,3.0],[2,3,3.8],[1,12,3.2]];
    function reset(){st=agents.map(function(o,i){var c=CFG[i%CFG.length];return{o:o,z:LANES[c[0]],x:c[1],v:c[2],ok:c[1]>GATES[0],ph:i*1.7,gait:i*1.3}});gates=[0,0];time=0;
      var r=rnd(3);rain=[{z:-26,k:.6,n:64,top:30,a:[]},{z:-17,k:.45,n:36,top:26,a:[]}];
      rain.forEach(function(l){for(var i=0;i<l.n;i++)l.a.push({x:(r()-.5)*84*(l.z<-20?1:.8),sp:3+r()*6,off:r()*40})});
      pk=[];for(var i=0;i<26;i++)pk.push({lane:Math.floor(r()*4),x:(r()-.5)*70,v:6+r()*7,c:r()<.5?0:1,s:.3+r()*.25})}
    var gates=[0,0],time=0,rain=[],pk=[],raf=0,last=0;
    var rainObj=[obj(null,64*9,true),obj(null,36*9,true)];
    reset();
    function step(dt){
      time+=dt;
      st.forEach(function(a){
        var slow=1,i;for(i=0;i<2;i++){var d=Math.abs(a.x-GATES[i]);slow=Math.min(slow,.12+.88*smooth(d/2.4));if(d<.7)gates[i]=1}
        var px=a.x;a.x+=a.v*slow*dt;if(px<=GATES[0]&&a.x>GATES[0])a.ok=true;if(a.x>30){a.x=-30;a.ok=false}a.slow=slow;a.gait+=a.v*slow*dt*1.9;
      });
      gates[0]=Math.max(0,gates[0]-dt*1.6);gates[1]=Math.max(0,gates[1]-dt*1.6);
      pk.forEach(function(p){p.x+=p.v*dt;if(p.x>38)p.x-=76});
    }
    function frame(){
      var w=canvas.clientWidth||canvas.width,h=canvas.clientHeight||canvas.height,dpr=Math.min(window.devicePixelRatio||1,2),cw=Math.max(2,Math.round(w*dpr)),ch=Math.max(2,Math.round(h*dpr));
      if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch}
      gl.viewport(0,0,cw,ch);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,.01,.005,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      var t=time,asp=cw/ch,narrow=asp<.9;
      var eye=[Math.sin(t*.35)*2.5-1.5,8.2+Math.sin(t*.5)*.25,(narrow?48:33)-t*.6],tgt=[0,1.4,2];
      gl.uniformMatrix4fv(uVP,false,mul(persp(narrow?46:38,asp,.5,260),look(eye,tgt)));
      var G=[.12,.75,.42],G2=[.24,1,.6];
      // floor and lane lines
      bx(0,-.2,6,150,.2,40,[.012,.045,.03]);
      DIV.forEach(function(z){bx(0,.02,z,150,.07,.16,G,0)});
      var off=(t*3.2)%4;for(var x=-60;x<=60;x+=4)bx(x+off,.02,1,.12,.05,15.2,[.05,.32,.18],0);
      // data packets streaming along the lane edges
      pk.forEach(function(p){var z=DIV[p.lane]+(p.lane%2?.35:-.35),c=p.c?[.3,1,.95]:G2;bx(p.x,.35,z,p.s*1.8,p.s,p.s,c,0);bx(p.x-p.s*3,.3,z,p.s*.9,p.s*.5,p.s*.5,[c[0]*.5,c[1]*.5,c[2]*.5],0)});
      // gates: two pillars, a beam and a scan grid that lights as an agent passes
      GATES.forEach(function(gx,i){var f=gates[i],c=[.1+.15*f,.8+.2*f,.4+.2*f];
        bx(gx,4.6,-8.6,.5,9.2,.5,c,f);bx(gx,4.6,10.6,.5,9.2,.5,c,f);bx(gx,9.2,1,.5,.5,19.7,c,f);
        for(var k=0;k<9;k++){var z=-7+k*2.3,y=.6+((t*3.5+k*.7)%1)*8;bx(gx,y,z,.08,.12,.9,[.2,1,.6],f*1.2)}
        if(f>.05)for(var q=0;q<15;q++)bx(gx,4.5,-7.6+q*1.3,.1,8.6,.12,[.2*f+.05,.9*f+.1,.5*f+.05],f)});
      // falling code, two layers, rebuilt each frame
      rain.forEach(function(l,li){var a=rainObj[li].n=0,arr=new Float32Array(l.n*9*7),q=0;
        l.a.forEach(function(c){var hd=l.top-((t*c.sp+c.off)%(l.top+8));for(var j=0;j<9;j++){var y=hd+j*.9;if(y<0||y>l.top)continue;var fd=1-j/9,col=j===0?[.85,1,.9]:[.05,.35+.5*fd,.18+.2*fd];
          arr.set([c.x/l.k,y/l.k,0,1,col[0]*(j?fd+.25:1),col[1]*(j?fd+.25:1),col[2]*(j?fd+.25:1)],q*7);q++}});
        rainObj[li].n=q;gl.bindBuffer(gl.ARRAY_BUFFER,rainObj[li].buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,arr.subarray(0,q*7));
        draw(rainObj[li],trs(0,0,l.z,0,0,l.k,l.k,l.k),{emit:true,boost:0})});
      // agents, each carrying a packet that turns green once it clears the first gate
      st.forEach(function(a,i){
        var bob=Math.abs(Math.sin(a.gait))*.22*Math.min(1,a.slow*1.5+.2),yaw=.35,roll=Math.sin(t*7+a.ph)*.035*a.slow;
        draw(a.o,trs(a.x,.5*S+bob+.02,a.z,yaw,roll,S,S,S),{sw:[a.gait,.5*Math.min(1,a.slow*1.6)]});
        var fx=Math.sin(yaw),fz=Math.cos(yaw),pc=a.ok?[.2,1,.55]:[1,.7,.25],sp=Math.sin(t*3+i);
        draw(box,trs(a.x+fx*2.6,3.1+bob+sp*.1,a.z+fz*2.6,t*2+i,0,.8,.8,.8),{col:pc,emit:true,boost:.6+.4*sp});
      });
    }
    function start(){var t0=performance.now();last=t0;
      // time the very first frame, forced to finish: a device this slow gets the 2D intro instead
      frame();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
      if(performance.now()-t0>1500&&opts.onSlow){opts.onSlow();return}
      last=performance.now();
      var n=0,slow=0;
      (function loop(ts){raf=requestAnimationFrame(loop);var real=ts-last,dt=Math.min(.05,real/1000);last=ts;
        // a device that cannot keep up (software rendering, for one) gets the 2D intro instead
        if(++n>2){if(real>400)slow++;else slow=Math.max(0,slow-1);if(slow>=2&&opts.onSlow){stop();opts.onSlow();return}}
        step(dt);frame()})(t0)}
    function stop(){cancelAnimationFrame(raf);raf=0}
    function renderAt(T){reset();for(var s=0;s<T*30;s++)step(1/30);frame()}
    return{start:start,stop:stop,renderAt:renderAt};
  }
  window.Intro3D={create:create,supported:function(){try{var c=document.createElement('canvas');return!!c.getContext('webgl2')}catch(e){return false}}};
})();
