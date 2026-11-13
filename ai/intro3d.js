'use strict';
// The 3D intro: voxel agents run between work stations on a lit circuit floor, seen from above.
// Plain WebGL2, no libraries. Intro3D.create(canvas, { agents: [voxelData, ...] }) -> { start, stop, renderAt(t) } or null.
(function(){
  var VS='#version 300 es\nin vec3 pos;in vec3 nrm;in vec4 aCell;in vec3 aCol;uniform mat4 uVP;uniform mat4 uModel;uniform mat3 uRot;uniform vec3 uOrg;uniform vec2 uPivot;uniform vec3 uSwing;uniform vec2 uArmA;uniform vec2 uArmM;uniform float uLevel;uniform vec2 uHand;uniform float uLean;out vec3 vCol;out vec3 vN;out float vE;out float vW;\n'
   +'vec3 rot(vec3 q,float py,float pz,float a){float c=cos(a),s=sin(a),dy=q.y-py,dz=q.z-pz;return vec3(q.x,py+dy*c-dz*s,pz+dy*s+dz*c);}\n'
   +'void main(){float e=mod(aCell.w,2.0);float g=floor(aCell.w/2.0);vec3 q=aCell.xyz;'
   +'if(g>.5){float ph=sin(uSwing.x);'
   +'if(g<2.5){float sg=g<1.5?1.0:-1.0;q=rot(q,uPivot.x,16.0,ph*uSwing.y*sg);}'
   +'else{bool R=abs(g-3.0)<.5||abs(g-5.0)<.5;float sg=R?-1.0:1.0;float m=R?uArmM.x:uArmM.y;float ov=R?uArmA.x:uArmA.y;float a=mix(ph*uSwing.z*sg,ov,m);'
   +'if(g>4.5)q=rot(q,uHand.x,uHand.y,-ov*m*uLevel);q=rot(q,uPivot.y,16.0,a);}}'
   +'q=rot(q,0.0,16.0,uLean);'
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
    var uArmA=U('uArmA'),uArmM=U('uArmM'),uLevel=U('uLevel'),uHand=U('uHand'),uLean=U('uLean'),uOrg=U('uOrg'),uPivot=U('uPivot'),uSwing=U('uSwing'),uVP=U('uVP'),uModel=U('uModel'),uRot=U('uRot'),uCol=U('uCol'),uOver=U('uOver'),uEmit=U('uEmit'),uBoost=U('uBoost');
    gl.uniform3f(U('uTint'),.86,1,.93);gl.uniform3f(U('uFog'),0,.01,.005);gl.uniform2f(U('uFogR'),70,190);
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
    function voxObj(d){var pal=d.palette.map(hex),a=new Float32Array(d.cells.length*7);d.cells.forEach(function(c,i){var k=pal[c[4]];a.set([c[0],c[1],c[2],c[3],k[0],k[1],k[2]],i*7)});var o=obj(a);o.org=[d.cx==null?15.5:d.cx,0,d.cz==null?16:d.cz];o.pivot=d.pivot||[8,28];o.data=d;o.hand=d.gun?[d.gun.hand[1],d.gun.hand[2]]:[0,16];var gh=/^#/.test(d.glow||'')?hex(d.glow):[.3,1,.9];o.gcol=gh;return o}
    var box=obj(new Float32Array([0,0,0,0,1,1,1]));box.org=[0,0,0];box.pivot=[0,0];
    function draw(o,T,fx){fx=fx||{};gl.bindVertexArray(o.vao);gl.uniformMatrix4fv(uModel,false,T.m);gl.uniformMatrix3fv(uRot,false,T.r);
      if(fx.col){gl.uniform1f(uOver,1);gl.uniform3f(uCol,fx.col[0],fx.col[1],fx.col[2])}else gl.uniform1f(uOver,0);
      gl.uniform1f(uEmit,fx.emit?1:0);gl.uniform1f(uBoost,fx.boost||0);var og=o.org||[0,0,0],pv=o.pivot||[0,0];gl.uniform3f(uOrg,og[0],og[1],og[2]);gl.uniform2f(uPivot,pv[0],pv[1]);var po=fx.pose||MechPose.zero;gl.uniform3f(uSwing,fx.ph||0,po.leg,po.arm);gl.uniform2f(uArmA,po.aR,po.aL);gl.uniform2f(uArmM,po.mR,po.mL);gl.uniform1f(uLevel,po.lv);gl.uniform2f(uHand,o.hand?o.hand[0]:0,o.hand?o.hand[1]:16);gl.uniform1f(uLean,po.lean);gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,o.n)}
    function bx(x,y,z,sx,sy,sz,col,boost){draw(box,trs(x,y,z,0,0,sx,sy,sz),{col:col,emit:true,boost:boost||0})}

    var agents=opts.agents.slice(0,4).map(function(d){return voxObj(d)});
    var S=.135,AX=17,AZ=9.5; // arena half-sizes
    // work stations the agents run between; each one pulses while an agent is on it
    var PADS=[[-12,-5.5],[-1,-7],[11,-5],[-9,5],[3,4.5],[13,5.5],[-1,-0.5]];
    var st=[],pads=[],pk=[],pulses=[],bolts=[],chainT=-9,time=0,raf=0,last=0,rr=rnd(11);
    function pickPad(a){var best=-1,tries=0;while(tries++<20){var k=Math.floor(rr()*PADS.length);if(k===a.pad)continue;if(st.some(function(o){return o!==a&&o.pad===k}))continue;best=k;break}return best<0?(a.pad+1)%PADS.length:best}
    function reset(){rr=rnd(11);pads=PADS.map(function(){return 0});
      st=agents.map(function(o,i){var p=PADS[(i*2)%PADS.length];return{o:o,x:p[0]+(i%2?2:-2),z:p[1]+3,yaw:i*1.7,v:0,pad:(i*2)%PADS.length,wait:.2+i*.35,ok:false,gait:i*1.3,ph:i*1.7,top:3.4+(i%3)*.35,pose:null,kick:0,fireT:.2+rr()*.3,run:0,rate:.8+rr()*.45}});
      st.forEach(function(a){a.pad=pickPad(a);a.wait=0});
      var r=rnd(3);pulses=[];bolts=[];chainT=-9;pk=[];for(var i=0;i<30;i++)pk.push({ax:r()<.5?0:1,line:Math.floor(r()*5),p:(r()-.5)*40,v:(6+r()*7)*(r()<.5?-1:1),c:r()<.5?0:1,s:.3+r()*.22});
      time=0}
    reset();
    function norm(a){while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a}
    function step(dt){
      time+=dt;
      st.forEach(function(a){
        var T=PADS[a.pad],dx=T[0]-a.x,dz=T[1]-a.z,d=Math.hypot(dx,dz);
        if(a.wait>0){a.wait-=dt;a.v=Math.max(0,a.v-dt*14);pads[a.pad]=1;if(a.wait<=0){a.ok=!a.ok;pulses.push({x:a.x,z:a.z,t:time});a.pad=pickPad(a)}}
        else{
          var want=Math.atan2(dx,dz),da=norm(want-a.yaw);a.yaw+=Math.max(-3.2*dt,Math.min(3.2*dt,da));
          var sp=a.rate*Math.min(6,1.2+d*1.5)*Math.max(.15,1-Math.abs(da)/1.6);a.v+=(sp-a.v)*Math.min(1,dt*5);
          if(d<.6){a.wait=.7+rr()*2.4}
        }
        // keep clear of the others
        st.forEach(function(o){if(o===a)return;var ox=a.x-o.x,oz=a.z-o.z,od=Math.hypot(ox,oz);if(od<4.6&&od>.01){var k=(4.6-od)*dt*2.2;a.x+=ox/od*k;a.z+=oz/od*k}});
        a.x+=Math.sin(a.yaw)*a.v*dt;a.z+=Math.cos(a.yaw)*a.v*dt;
        a.x=Math.max(-AX+2,Math.min(AX-2,a.x));a.z=Math.max(-AZ+1.5,Math.min(AZ-1.5,a.z));
        a.gait+=a.v*dt*1.9;
        // what the legs and arms are doing: running between stations, aiming and firing once there
        var aiming=a.wait>0,stt=aiming?'aim':(a.v>1.2?'run':'walk'),dat=a.o.data;
        var tg=MechPose.target(dat,stt,time+a.ph,a.kick);a.pose=a.pose?MechPose.blend(a.pose,tg,Math.min(1,dt*7)):tg;a.run+=((stt==='run'?1:0)-a.run)*Math.min(1,dt*6);
        a.kick*=Math.exp(-dt*10);
        if(aiming){a.fireT-=dt;if(a.fireT<=0){a.fireT=.18+rr()*.3;var mz=MechPose.muzzles(dat).slice(0,4),cy=Math.cos(a.yaw),sy=Math.sin(a.yaw);
          mz.forEach(function(m){var lx=(m.x-15.5)*S,ly=m.y*S+.5*S,lz=(m.z-16)*S,l=Math.hypot(m.dx,m.dy,m.dz)||1,ddx=m.dx/l,ddy=m.dy/l,ddz=m.dz/l;
            bolts.push({x:a.x+lx*cy+lz*sy,y:ly+.05,z:a.z-lx*sy+lz*cy,dx:ddx*cy+ddz*sy,dy:ddy,dz:-ddx*sy+ddz*cy,age:0,c:a.o.gcol})});
          if(mz.length)a.kick=1}}else a.fireT=.2;
      });
      bolts=bolts.filter(function(b){b.age+=dt;return b.age<.5});
      pulses=pulses.filter(function(q){if(time-q.t>1.2){chainT=time;return false}return true});
      for(var i=0;i<pads.length;i++)pads[i]=Math.max(0,pads[i]-dt*1.4);
      st.forEach(function(a){if(a.wait>0)pads[a.pad]=1});
      pk.forEach(function(p){p.p+=p.v*dt;var m=p.ax?AZ:AX;if(p.p>m+2)p.p=-m-2;if(p.p<-m-2)p.p=m+2});
    }
    function frame(){
      var w=canvas.clientWidth||canvas.width,h=canvas.clientHeight||canvas.height,dpr=Math.min(window.devicePixelRatio||1,2),cw=Math.max(2,Math.round(w*dpr)),ch=Math.max(2,Math.round(h*dpr));
      if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch}
      gl.viewport(0,0,cw,ch);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,.01,.005,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      var t=time,asp=cw/ch,narrow=asp<.9;
      // high camera looking steeply down, drifting slowly
      var cx=Math.sin(t*.22)*3,eye=[cx,(narrow?60:36),(narrow?29:20)+Math.cos(t*.17)*1.2],tgt=[cx,0,-1.5];
      gl.uniformMatrix4fv(uVP,false,mul(persp(narrow?48:40,asp,.5,260),look(eye,tgt)));
      var G=[.12,.75,.42],G2=[.24,1,.6];
      // floor, border and a circuit grid
      bx(0,-.2,0,AX*2+30,.2,AZ*2+22,[.012,.045,.03]);
      bx(0,.04,-AZ,AX*2,.08,.25,G);bx(0,.04,AZ,AX*2,.08,.25,G);bx(-AX,.04,0,.25,.08,AZ*2,G);bx(AX,.04,0,.25,.08,AZ*2,G);
      for(var gx=-16;gx<=16;gx+=4)bx(gx,.02,0,.07,.04,AZ*2,[.04,.22,.13]);
      for(var gz=-8;gz<=8;gz+=4)bx(0,.02,gz,AX*2,.04,.07,[.04,.22,.13]);
      // data packets streaming along the grid lines
      pk.forEach(function(p){var ln=-8+p.line*4,c=p.c?[.3,1,.95]:G2,sgn=p.v<0?-1:1;
        if(p.ax===0){var z=Math.max(-AZ,Math.min(AZ,ln));bx(p.p,.2,z,p.s*2,p.s,p.s,c);bx(p.p-sgn*p.s*3,.18,z,p.s*1.1,p.s*.5,p.s*.5,[c[0]*.5,c[1]*.5,c[2]*.5])}
        else{var x=-16+p.line*8;bx(x,.2,p.p,p.s,p.s,p.s*2,c);bx(x,.18,p.p-sgn*p.s*3,p.s*.5,p.s*.5,p.s*1.1,[c[0]*.5,c[1]*.5,c[2]*.5])}});
      // the ledger: a chain of linked blocks along the far and near edges; each finished task flies up as a transaction and a new block is minted
      var cs=smooth((t-chainT)/.7);
      [-AZ-3.6,AZ+3.6].forEach(function(cz,ci){for(var k=0;k<13;k++){var x=AX-2-k*3.8+(1-cs)*3.8;if(x<-AX-4||x>AX+4)continue;var nw=k===0?1-cs:0,y=1.5+Math.sin(t*1.2+k+ci)*.12,rot=Math.sin(t*.5+k)*.25+.3;
        bx(x+1.9,y,cz,1.9,.18,.18,[.1,.55,.4],0);
        draw(box,trs(x,y,cz,rot,0,2.2,2.2,2.2),{col:[.06+.4*nw,.55+.4*nw,.38+.3*nw],emit:true,boost:.25+nw});
        draw(box,trs(x,y+1.2,cz,-rot*1.3,0,1.05,1.05,1.05),{col:[.3,1,.7],emit:true,boost:.4+nw});
        if(k===0&&nw>.02)for(var m=0;m<4;m++)bx(x,y+.5+nw*(2+m),cz,.2,.5,.2,[.3,1,.8],nw)}});
      pulses.forEach(function(q){var u=(t-q.t)/1.2,ex=AX-2+(1-cs)*0,ez=-AZ-3.6;if(u<0||u>1)return;var uu=smooth(u),x=q.x+(AX-2-q.x)*uu,z=q.z+(ez-q.z)*uu,y=.8+Math.sin(Math.PI*u)*6;
        draw(box,trs(x,y,z,t*4,t*3,.7,.7,.7),{col:[.9,1,.6],emit:true,boost:.8})});
      // work stations: a pad with a ring and rising beams that light while an agent works there
      PADS.forEach(function(p,i){var f=pads[i],c=[.08+.2*f,.6+.4*f,.32+.25*f],R=2.6;
        bx(p[0],.03,p[1],R*2,.06,R*2,[.02,.09,.05]);
        bx(p[0],.08,p[1]-R,R*2,.1,.16,c,f);bx(p[0],.08,p[1]+R,R*2,.1,.16,c,f);bx(p[0]-R,.08,p[1],.16,.1,R*2,c,f);bx(p[0]+R,.08,p[1],.16,.1,R*2,c,f);
        if(f>.05){var h=1.5+f*7;for(var k=0;k<4;k++){var ax=k%2?R:-R,az=k<2?R:-R;bx(p[0]+ax,h/2,p[1]+az,.16,h,.16,[.2,1,.6],f)}bx(p[0],.14,p[1],R*1.5,.04,R*1.5,[.1+.3*f,.5+.5*f,.3+.3*f],f)}});
      bolts.forEach(function(b){var d=b.age*24,yw=Math.atan2(b.dx,b.dz);draw(box,trs(b.x+b.dx*d,b.y+b.dy*d,b.z+b.dz*d,yw,0,.22,.22,1.5),{col:b.c,emit:true,boost:1})});
      // agents; each carries a packet that flips colour every time it finishes a task
      st.forEach(function(a,i){
        var bob=Math.abs(Math.sin(a.gait))*(.15+.3*a.run)*Math.min(1,a.v*.4),roll=Math.sin(t*7+a.ph)*.03*Math.min(1,a.v*.4);
        draw(a.o,trs(a.x,.5*S+bob+.02,a.z,a.yaw,roll,S,S,S),{pose:a.pose,ph:a.gait});
        var pc=a.ok?[.2,1,.55]:[1,.7,.25],sp=Math.sin(t*3+i);
        draw(box,trs(a.x,7.7+bob+sp*.12,a.z,t*2+i,0,.8,.8,.8),{col:pc,emit:true,boost:.6+.4*sp});
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
