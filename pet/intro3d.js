'use strict';
// The 3D intro: voxel agents run between work stations on a lit circuit floor, seen from above.
// Plain WebGL2, no libraries. Intro3D.create(canvas, { agents: [voxelData, ...] }) -> { start, stop, renderAt(t) } or null.
(function(){
  var VS='#version 300 es\nin vec3 pos;in vec3 nrm;in vec4 aCell;in vec3 aCol;uniform mat4 uVP;uniform mat4 uModel;uniform mat3 uRot;uniform vec3 uOrg;uniform vec2 uPivot;uniform vec3 uSwing;uniform vec2 uArmA;uniform vec2 uArmM;uniform float uLevel;uniform vec2 uHand;uniform float uLean;uniform vec2 uPz;uniform vec2 uTail;out vec3 vCol;out vec3 vN;out float vE;out float vW;\n'
   +'vec3 rot(vec3 q,float py,float pz,float a){float c=cos(a),s=sin(a),dy=q.y-py,dz=q.z-pz;return vec3(q.x,py+dy*c-dz*s,pz+dy*s+dz*c);}\n'
   +'void main(){float e=mod(aCell.w,2.0);float g=floor(aCell.w/2.0);vec3 q=aCell.xyz;'
   +'if(g>.5){float ph=sin(uSwing.x);'
   +'if(g>8.5){float c=cos(uTail.y),s=sin(uTail.y),dx=q.x-15.5,dz=q.z-uTail.x;q=vec3(15.5+dx*c-dz*s,q.y,uTail.x+dx*s+dz*c);}'
   +'else if(g>6.5){float sg=g<7.5?-1.0:1.0;q=rot(q,uPivot.x,uPz.y,ph*uSwing.y*sg);}'
   +'else if(g<2.5){float sg=g<1.5?1.0:-1.0;q=rot(q,uPivot.x,uPz.x,ph*uSwing.y*sg);}'
   +'else{bool R=abs(g-3.0)<.5||abs(g-5.0)<.5;float sg=R?-1.0:1.0;float m=R?uArmM.x:uArmM.y;float ov=R?uArmA.x:uArmA.y;float a=mix(ph*uSwing.z*sg,ov,m);'
   +'if(g>4.5)q=rot(q,uHand.x,uHand.y,-ov*m*uLevel);q=rot(q,uPivot.y,16.0,a);}}'
   +'q=rot(q,0.0,16.0,uLean);'
   +'vec3 p=q-uOrg+pos;gl_Position=uVP*(uModel*vec4(p,1.0));vN=uRot*nrm;vCol=aCol;vE=e;vW=gl_Position.w;}';
  var FS='#version 300 es\nprecision mediump float;in vec3 vCol;in vec3 vN;in float vE;in float vW;uniform vec3 uCol;uniform float uOver;uniform float uEmit;uniform float uBoost;uniform vec3 uTint;uniform vec3 uFog;uniform vec2 uFogR;out vec4 o;\n'
   +'void main(){vec3 base=uOver>.5?uCol:vCol;vec3 n=normalize(vN);float d=max(dot(n,normalize(vec3(-.35,.7,.6))),0.0);float rim=pow(1.0-max(n.z,0.0),2.0)*.12;'
   +'vec3 c=base*(.4+.8*d)+rim*vec3(.9,.9,1.0);if(vE>.5||uEmit>.5)c=base*(1.0+.5*uBoost)+.05*uBoost;c*=uTint;'
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
    var uArmA=U('uArmA'),uArmM=U('uArmM'),uLevel=U('uLevel'),uHand=U('uHand'),uLean=U('uLean'),uPz=U('uPz'),uTail=U('uTail'),uOrg=U('uOrg'),uPivot=U('uPivot'),uSwing=U('uSwing'),uVP=U('uVP'),uModel=U('uModel'),uRot=U('uRot'),uCol=U('uCol'),uOver=U('uOver'),uEmit=U('uEmit'),uBoost=U('uBoost');
    gl.uniform3f(U('uTint'),1,1,1);gl.uniform3f(U('uFog'),.55,.75,.9);gl.uniform2f(U('uFogR'),70,190);
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
      gl.uniform1f(uEmit,fx.emit?1:0);gl.uniform1f(uBoost,fx.boost||0);var og=o.org||[0,0,0],pv=o.pivot||[0,0];gl.uniform3f(uOrg,og[0],og[1],og[2]);gl.uniform2f(uPivot,pv[0],pv[1]);var po=fx.pose||MechPose.zero;gl.uniform3f(uSwing,fx.ph||0,po.leg,po.arm);gl.uniform2f(uArmA,po.aR,po.aL);gl.uniform2f(uArmM,po.mR,po.mL);gl.uniform1f(uLevel,po.lv);gl.uniform2f(uHand,o.hand?o.hand[0]:0,o.hand?o.hand[1]:16);gl.uniform1f(uLean,po.lean);var dd=o.data||{};gl.uniform2f(uPz,dd.pz?dd.pz[0]:16,dd.pz?dd.pz[1]:16);gl.uniform2f(uTail,dd.tailZ||0,Math.sin(time*(po.ts||4))*(po.tw||0));gl.drawElementsInstanced(gl.TRIANGLES,36,gl.UNSIGNED_SHORT,0,o.n)}
    function bx(x,y,z,sx,sy,sz,col,boost){draw(box,trs(x,y,z,0,0,sx,sy,sz),{col:col,emit:true,boost:boost||0})}

    var agents=opts.agents.slice(0,4).map(function(d){return voxObj(d)});
    var S=.135,AX=17,AZ=9.5; // park half-sizes
    var st=[],puffs=[],flies=[],time=0,raf=0,last=0,rr=rnd(11);
    var OBS=[[-11,3.5,4.4],[10,-4.5,1.7],[-3,-6.3,1.5]]; // pond and two trees: [x,z,radius] the pets run around
    var FL=(function(){var r=rnd(5),o=[];for(var i=0;i<46;i++){var x=(r()-.5)*(AX*2+14),z=(r()-.5)*(AZ*2+10);if(Math.hypot(x+11,z-3.5)<6)continue;o.push({x:x,z:z,c:[[1,.45,.57],[1,.82,.4],[1,1,1],[.78,.63,1]][i%4],p:r()*6})}return o})();
    function reset(){rr=rnd(11);puffs=[];flies=[];var n=agents.length;
      st=agents.map(function(o,i){var ang=i/n*Math.PI*2;return{o:o,x:Math.cos(ang)*8,z:Math.sin(ang)*4.5,yaw:ang+Math.PI/2,v:0,pause:0,boost:0,gait:i*1.3,ph:i*1.7,pose:null,run:0,rate:.92+rr()*.16,wob:rr()*6,cat:i%2===1,it:i%2===0}});
      for(var i=0;i<7;i++)flies.push({x:(rr()-.5)*30,z:(rr()-.5)*16,a:rr()*6,s:.5+rr()*.6,c:i%3});
      time=0}
    reset();
    function norm(a){while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a}
    function step(dt){
      time+=dt;var n=st.length;
      // pets run in pairs, a dog and a cat: one chases the other, and when it is caught up they swap
      st.forEach(function(a,i){
        var pr=st[i^1]||st[(i+1)%n],dx=pr.x-a.x,dz=pr.z-a.z,d=Math.hypot(dx,dz)||1,hx=(i>>1)?8:-4,hz=(i>>1)?.5:-1,sx,sz;
        if(a.it){sx=dx/d*1.2;sz=dz/d*1.2}
        else{var k=Math.max(0,Math.min(1,(9-d)/9))*1.3;sx=-dx/d*k;sz=-dz/d*k;var cr=Math.hypot(a.x-hx,(a.z-hz)*1.5)||1;sx+=(a.z-hz)/cr*.9;sz-=(a.x-hx)/cr*.9}
        var hd=Math.hypot(a.x-hx,a.z-hz);if(hd>7){sx-=(a.x-hx)/hd*(hd-7)*.35;sz-=(a.z-hz)/hd*(hd-7)*.35}
        OBS.forEach(function(o){var ox=a.x-o[0],oz=a.z-o[1],od=Math.hypot(ox,oz)||1,r=o[2]+2.4;if(od<r){var k=(r-od)/r*3.2;sx+=ox/od*k;sz+=oz/od*k}});
        if(a.x>AX-4)sx-=(a.x-AX+4)*.8;if(a.x<-AX+4)sx+=(-AX+4-a.x)*.8;if(a.z>AZ-3)sz-=(a.z-AZ+3)*1.1;if(a.z<-AZ+3)sz+=(-AZ+3-a.z)*1.1;
        var cr=Math.hypot(a.x/1.6,a.z)||1;sx+=a.z/cr*.7;sz-=a.x/1.6/cr*.7; // everyone circles the park, so the chase spreads out
        sx+=Math.sin(time*.9+a.wob)*.25;sz+=Math.cos(time*.7+a.wob*1.3)*.25;
        if(a.pause>0){a.pause-=dt;a.v=Math.max(0,a.v-dt*16)}
        else{
          var want=Math.atan2(sx,sz),da=norm(want-a.yaw);a.yaw+=Math.max(-4.2*dt,Math.min(4.2*dt,da));
          var sp=a.rate*5.4*(1+.16*Math.sin(time*.9+a.wob))*(1+a.boost*.5)*Math.max(.35,1-Math.abs(da)/2.2);a.v+=(sp-a.v)*Math.min(1,dt*5);
          // caught up: a tag. The chaser stops for a play bow, then the two swap roles
          if(a.it&&d<2.6&&pr.pause<=0){a.pause=1+rr()*.8;pr.pause=.5;pr.boost=1;a.it=false;pr.it=true;puffs.push({x:(a.x+pr.x)/2,z:(a.z+pr.z)/2,t:time,c:a.cat?[.78,.63,1]:[1,.7,.3]})}}
        a.boost=Math.max(0,a.boost-dt*.9);
        st.forEach(function(o){if(o===a)return;var ox=a.x-o.x,oz=a.z-o.z,od=Math.hypot(ox,oz);if(od<3.6&&od>.01){var k=(3.6-od)*dt*3;a.x+=ox/od*k;a.z+=oz/od*k}});
        a.x+=Math.sin(a.yaw)*a.v*dt;a.z+=Math.cos(a.yaw)*a.v*dt;
        a.x=Math.max(-AX+1.5,Math.min(AX-1.5,a.x));a.z=Math.max(-AZ+1.2,Math.min(AZ-1.2,a.z));
        a.gait+=a.v*dt*1.9;
        var play=a.pause>0,stt=play?'aim':(a.v>2.6?'run':'walk'),dat=a.o.data;
        var tp=MechPose.target(dat,stt,time+a.ph,0);a.pose=a.pose?MechPose.blend(a.pose,tp,Math.min(1,dt*7)):tp;a.run+=((stt==='run'?1:0)-a.run)*Math.min(1,dt*6);
      });
      puffs=puffs.filter(function(q){return time-q.t<.9});
      flies.forEach(function(f){f.a+=dt*(1.5+Math.sin(time+f.s)*1.2);f.x+=Math.cos(f.a)*f.s*dt*3;f.z+=Math.sin(f.a*.8)*f.s*dt*2.2;if(f.x>AX+3)f.x=-AX-3;if(f.x<-AX-3)f.x=AX+3;if(f.z>AZ+2)f.z=-AZ-2;if(f.z<-AZ-2)f.z=AZ+2});
    }
    function tree(x,z,s,t,k){var sw=Math.sin(t*.8+k)*.05*s;
      bx(x,.02,z,5.2*s,.03,5.2*s,[.14,.38,.17]);
      bx(x,1.2*s,z,.9*s,2.4*s,.9*s,[.42,.28,.16]);
      bx(x+sw,3.3*s,z,4.6*s,1.7*s,4.6*s,[.17,.52,.24]);bx(x+sw*1.5,4.7*s,z,3.6*s,1.5*s,3.6*s,[.24,.64,.31]);bx(x+sw*2,5.8*s,z,2.3*s,1.2*s,2.3*s,[.34,.76,.4]);
      if(k%2===0){bx(x+1.3*s,4.2*s,z+1.9*s,.4,.4,.4,[1,.4,.4]);bx(x-1.5*s,3.5*s,z+2.1*s,.4,.4,.4,[1,.4,.4])}}
    function frame(){
      var w=canvas.clientWidth||canvas.width,h=canvas.clientHeight||canvas.height,dpr=Math.min(window.devicePixelRatio||1,2),cw=Math.max(2,Math.round(w*dpr)),ch=Math.max(2,Math.round(h*dpr));
      if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch}
      gl.viewport(0,0,cw,ch);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.2,.46,.24,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      var t=time,asp=cw/ch,narrow=asp<.9;
      // high camera looking steeply down, drifting slowly
      var cx=Math.sin(t*.22)*3,eye=[cx,(narrow?60:36),(narrow?29:20)+Math.cos(t*.17)*1.2],tgt=[cx,0,-1.5];
      gl.uniformMatrix4fv(uVP,false,mul(persp(narrow?48:40,asp,.5,260),look(eye,tgt)));
      var WOOD=[.55,.38,.22],RAIL=[.93,.88,.78];
      // lawn with mown stripes, a gravel path, then the cloud shadows drifting over
      bx(0,-.2,0,AX*2+34,.2,AZ*2+26,[.2,.5,.22]);
      for(var gx=-20;gx<=20;gx+=4)bx(gx,-.02,0,2,.04,AZ*2+22,[.25,.6,.27]);
      bx(0,.03,0.5,AX*2+10,.05,3.6,[.8,.7,.52]);bx(7,.035,0,3.6,.05,AZ*2+20,[.8,.7,.52]);
      for(var c=0;c<2;c++){var cxs=((t*(.9+c*.5)+c*22)%(AX*2+30))-AX-15;bx(cxs,.06,-3+c*8,9,.02,4.5,[.17,.43,.2])}
      // pond with a duck, lily pads and shimmer
      bx(-11,.02,3.5,9.4,.04,8,[.5,.4,.26]);bx(-11,.05,3.5,8.2,.04,6.8,[.25,.56,.86]);bx(-11,.05,3.5,6.4,.04,5.2,[.3,.62,.9]);
      for(var k=0;k<3;k++)bx(-11+Math.sin(t*.8+k*2)*2.6,.09,3.5+Math.cos(t*.6+k*3)*2,1,.03,.5,[.75,.92,1]);
      bx(-13.4,.09,5,1.1,.04,1.1,[.2,.66,.3]);bx(-9,.09,1.6,1,.04,1,[.2,.66,.3]);bx(-9,.12,1.6,.3,.06,.3,[1,.6,.8]);
      var dkx=-11+Math.sin(t*.35)*2.4,dkz=3.5+Math.cos(t*.35)*1.6,dd=Math.cos(t*.35)>0?-1:1;
      bx(dkx,.4,dkz,1,.6,.8,[1,.9,.9]);bx(dkx+dd*.5,.8,dkz,.5,.5,.5,[.2,.5,.3]);bx(dkx+dd*.85,.78,dkz,.35,.15,.25,[1,.6,.15]);
      // flowers swaying in the grass
      FL.forEach(function(f){var sw=Math.sin(t*1.6+f.p)*.08;bx(f.x,.22,f.z,.08,.44,.08,[.2,.5,.2]);bx(f.x+sw,.5,f.z,.42,.26,.42,f.c)});
      // picket fence, trees and bushes round the edge
      for(var x=-AX-1;x<=AX+1;x+=2.6){bx(x,.55,-AZ-1.4,.3,1.1,.3,WOOD);bx(x,.55,AZ+1.4,.3,.9,.3,WOOD)}
      for(var z=-AZ-1;z<=AZ+1;z+=2.6){bx(-AX-1.4,.55,z,.3,1.1,.3,WOOD);bx(AX+1.4,.55,z,.3,1.1,.3,WOOD)}
      bx(0,.8,-AZ-1.4,AX*2+3,.14,.12,RAIL);bx(0,.4,-AZ-1.4,AX*2+3,.14,.12,RAIL);bx(-AX-1.4,.8,0,.12,.14,AZ*2+3,RAIL);bx(AX+1.4,.8,0,.12,.14,AZ*2+3,RAIL);bx(0,.6,AZ+1.4,AX*2+3,.14,.12,RAIL);
      [[-15,-AZ-4.5,1.5],[-8,-AZ-5,1.25],[1,-AZ-4.6,1.6],[9,-AZ-5,1.3],[16,-AZ-4.4,1.5],[-AX-4.5,-2,1.3],[-AX-5,6,1.5],[AX+4.5,-1,1.5],[AX+5,7,1.25]].forEach(function(q,i){tree(q[0],q[1],q[2],t,i)});
      tree(OBS[1][0],OBS[1][1],1.15,t,0);tree(OBS[2][0],OBS[2][1],.95,t,2);
      [[-6,AZ+3.4],[12,AZ+3.2],[-16,AZ+3.5]].forEach(function(q,i){bx(q[0],.8,q[1],2.6,1.6,2.2,[.2,.56,.28]);bx(q[0]+.5,1.7,q[1],1.6,.9,1.4,[.3,.7,.36]);bx(q[0]-.7,1.1,q[1]+1.12,.4,.4,.3,[1,.5,.6])});
      // a bench, a tennis ball bouncing about and a bone on the grass
      bx(3,.7,AZ-.4,4.2,.25,1.1,WOOD);bx(3,1.35,AZ-.95,4.2,1,.2,WOOD);bx(1.2,.35,AZ-.4,.3,.7,1,[.3,.3,.35]);bx(4.8,.35,AZ-.4,.3,.7,1,[.3,.3,.35]);
      var bxp=Math.sin(t*.5)*11,bzp=Math.cos(t*.37)*4.5+1,byp=Math.abs(Math.sin(t*4))*1.3+.35;bx(bxp,.04,bzp,.9,.03,.9,[.12,.34,.15]);bx(bxp,byp,bzp,.6,.6,.6,[.85,1,.3]);
      bx(-5,.15,7,1.4,.25,.4,[.98,.95,.88]);bx(-5.8,.15,6.8,.4,.25,.4,[.98,.95,.88]);bx(-5.8,.15,7.3,.4,.25,.4,[.98,.95,.88]);bx(-4.2,.15,6.8,.4,.25,.4,[.98,.95,.88]);bx(-4.2,.15,7.3,.4,.25,.4,[.98,.95,.88]);
      // butterflies
      flies.forEach(function(f){var fl=Math.abs(Math.sin(t*14+f.a*3)),c=f.c?(f.c===1?[1,.8,.3]:[.7,.8,1]):[1,.6,.8],y=2.2+Math.sin(t*2+f.a)*.5;bx(f.x,y,f.z,.1,.1,.4,[.2,.15,.1]);bx(f.x-.28*fl,y+.05,f.z,.46*fl+.05,.05,.4,c);bx(f.x+.28*fl,y+.05,f.z,.46*fl+.05,.05,.4,c)});
      // tag bursts: little stars and hearts when one pet catches another
      puffs.forEach(function(q){var u=(t-q.t)/.9,r=u*2.8,y=1.4+Math.sin(Math.PI*u)*2;for(var k=0;k<7;k++){var an=k/7*Math.PI*2+u*2;draw(box,trs(q.x+Math.cos(an)*r,y+(k%2)*.5,q.z+Math.sin(an)*r,t*5+k,0,.45*(1-u*.6),.45*(1-u*.6),.45*(1-u*.6)),{col:k%2?[1,.85,.3]:q.c,emit:true,boost:.7})}});
      // the pets: each wears a little marker, orange for the dogs and violet for the cats
      st.forEach(function(a,i){
        var bob=Math.abs(Math.sin(a.gait))*(.1+.25*a.run)*Math.min(1,a.v*.4),roll=Math.sin(t*7+a.ph)*.02*Math.min(1,a.v*.4);
        var sp=a.o.data&&a.o.data.pet?S*1.45:S;
        bx(a.x,.05,a.z,3.2,.03,2.2,[.12,.34,.15]);
        draw(a.o,trs(a.x,.5*sp+bob+.02,a.z,a.yaw,roll,sp,sp,sp),{pose:a.pose,ph:a.gait});
        var mc=a.cat?[.62,.45,1]:[1,.62,.22],sy=Math.sin(t*3+i);
        draw(box,trs(a.x,6.1+bob+sy*.15,a.z,t*2+i,0,.7,.7,.7),{col:mc,emit:true,boost:.5+.3*sy});
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
