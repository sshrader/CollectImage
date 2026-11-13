'use strict';
// The pixel pet room (the page background), shared by the home page and the coin pages.
// The class keeps the name Cave so the pages need no wiring change: same options (bears, ambient, glow, fps).
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed){var a=seed>>>0;return function(){a=(a+0x6d2b79f5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
  // The page background: a cosy pixel room at night. A sleeping dog in its bed, a cat on its tree, a lamp, a moonlit window.
  function Cave(canvas,opts){
    var scale=0,w=0,h=0,ctx=canvas.getContext('2d'),base=null,fall=null,hearts=[],stars=[],fx=0,fy=0,ly=0,floorY=0,t0=0,raf=0,last=0,self=this;
    function R(c,x,y,ww,hh,col){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(ww)),Math.max(1,Math.round(hh)))}
    function ell(c,cx,cy,rx,ry,col){c.fillStyle=col;for(var y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++){var dy=(y+.5-cy)/ry;if(dy*dy>1)continue;var dx=Math.sqrt(1-dy*dy)*rx;c.fillRect(Math.round(cx-dx),y,Math.max(1,Math.round(dx*2)),1)}}
    function paw(c,x,y,col){R(c,x,y+2,3,2,col);R(c,x-1,y,1,1,col);R(c,x+1,y-1,1,1,col);R(c,x+3,y,1,1,col)}
    function size(){
      var vw=canvas.clientWidth||window.innerWidth,vh=canvas.clientHeight||window.innerHeight;
      scale=vw>900?4:3;w=Math.max(80,Math.ceil(vw/scale));h=Math.max(80,Math.ceil(vh/scale));canvas.width=w;canvas.height=h;
      floorY=Math.round(h*.74);fx=Math.round(w*.5);var tableTop=floorY-Math.round(h*.09);fy=tableTop;ly=tableTop-Math.round(h*.11);
      var oc=document.createElement('canvas');oc.width=w;oc.height=h;var c=oc.getContext('2d'),r=rng(11);
      // wallpaper: soft stripes with little paw prints
      for(var y=0;y<floorY;y++)for(var x=0;x<w;x++){var st=((x/6)|0)%2,n=r()*.08;var k=1+n+(st?.04:0);c.fillStyle='rgb('+(70*k|0)+','+(52*k|0)+','+(84*k|0)+')';c.fillRect(x,y,1,1)}
      for(var gy=8,row=0;gy<floorY-20;gy+=20,row++)for(var gx=(row%2?14:4);gx<w;gx+=28)paw(c,gx,gy,'#5a4468');
      // wooden panelling and skirting
      var wt=floorY-Math.round(h*.13);R(c,0,wt,w,floorY-wt,'#5c3e2c');for(var px=0;px<w;px+=Math.round(w/12)+4){R(c,px,wt+3,1,floorY-wt-5,'#4a3022')}
      R(c,0,wt,w,2,'#8a6240');R(c,0,floorY-3,w,3,'#8f6a46');
      // floor boards
      for(var fy2=floorY;fy2<h;fy2++){for(var fx2=0;fx2<w;fx2++){var pl=Math.floor((fy2-floorY)/9),sm=((fx2+pl*37)%53)===0,nn=r()*.1;var kk=(sm?.7:1)*(1+nn);c.fillStyle='rgb('+(118*kk|0)+','+(80*kk|0)+','+(50*kk|0)+')';c.fillRect(fx2,fy2,1,1)}if((fy2-floorY)%9===0)R(c,0,fy2,w,1,'#5a3a24')}
      // the rug
      var ryc=floorY+Math.round((h-floorY)*.52),rrx=Math.round(w*.3),rry=Math.round((h-floorY)*.36);
      ell(c,fx,ryc,rrx,rry,'#6e2f3c');ell(c,fx,ryc,rrx*.92,rry*.88,'#a3475a');ell(c,fx,ryc,rrx*.7,rry*.66,'#e0b98a');ell(c,fx,ryc,rrx*.6,rry*.56,'#b86a5c');
      // moonlit window with curtains
      var wx=Math.round(w*.07),wy=Math.round(h*.11),ww=Math.round(w*.17),wh=Math.round(h*.3);
      R(c,wx-3,wy-3,ww+6,wh+6,'#8a6240');
      for(var sy=0;sy<wh;sy++){var q=sy/wh;R(c,wx,wy+sy,ww,1,'rgb('+(14+30*q|0)+','+(22+30*q|0)+','+(58+40*q|0)+')')}
      ell(c,wx+ww*.72,wy+wh*.3,Math.max(4,ww*.09),Math.max(4,ww*.09),'#fff4c8');ell(c,wx+ww*.72+2,wy+wh*.3-1,Math.max(3,ww*.07),Math.max(3,ww*.07),'#14204a');
      ell(c,wx+ww*.72,wy+wh*.3,Math.max(4,ww*.085),Math.max(4,ww*.085),'#fff4c8');
      R(c,wx+ww/2-1,wy,2,wh,'#8a6240');R(c,wx,wy+wh*.55,ww,2,'#8a6240');
      R(c,wx-3,wy+wh-1,ww+6,4,'#a67a52');
      R(c,wx-6,wy-4,Math.round(ww*.22),wh+10,'#9a3f55');R(c,wx+ww-Math.round(ww*.22)+6,wy-4,Math.round(ww*.22),wh+10,'#9a3f55');R(c,wx-8,wy-6,ww+16,3,'#6a5a48');
      stars=[];for(var s=0;s<14;s++)stars.push({x:wx+3+r()*(ww-6),y:wy+3+r()*(wh*.5),p:r()*6,s:.8+r()*2});
      // picture frames: a bone and a fish
      var f1x=Math.round(w*.34),f1y=Math.round(h*.13);R(c,f1x,f1y,20,15,'#8a6240');R(c,f1x+2,f1y+2,16,11,'#e8d9b5');R(c,f1x+5,f1y+7,10,2,'#fffaf0');R(c,f1x+4,f1y+5,2,2,'#fffaf0');R(c,f1x+4,f1y+9,2,2,'#fffaf0');R(c,f1x+14,f1y+5,2,2,'#fffaf0');R(c,f1x+14,f1y+9,2,2,'#fffaf0');
      var f2x=Math.round(w*.63),f2y=Math.round(h*.17);R(c,f2x,f2y,16,13,'#8a6240');R(c,f2x+2,f2y+2,12,9,'#7fb5c9');R(c,f2x+5,f2y+5,6,3,'#ffb347');R(c,f2x+11,f2y+4,2,5,'#ffb347');R(c,f2x+6,f2y+5,1,1,'#222');
      // shelf with a plant
      var shx=Math.round(w*.43),shy=Math.round(h*.4);R(c,shx,shy,Math.round(w*.15),3,'#8a6240');R(c,shx+4,shy-7,8,7,'#b4573a');R(c,shx+3,shy-14,3,7,'#4fa35a');R(c,shx+7,shy-17,3,10,'#6bc274');R(c,shx+11,shy-13,3,6,'#4fa35a');R(c,shx+Math.round(w*.15)-12,shy-6,9,6,'#e8d9b5');R(c,shx+Math.round(w*.15)-11,shy-5,7,1,'#7fb5c9');
      // the cat tree: a carpeted base, a sisal post and two perches
      var tx=Math.round(w*.84),top1=Math.round(h*.36),top2=Math.round(h*.56);
      R(c,tx-14,floorY-4,28,8,'#9a7a55');R(c,tx-14,floorY-4,28,1,'#bb9a70');
      R(c,tx-2,top1,5,floorY-top1,'#c9a56e');for(var sy2=top1;sy2<floorY-4;sy2+=3)R(c,tx-2,sy2,5,1,'#a3824f');
      R(c,tx-12,top1-3,24,4,'#9a7a55');R(c,tx-12,top1-3,24,1,'#bb9a70');R(c,tx-9,top2,18,4,'#9a7a55');R(c,tx-9,top2,18,1,'#bb9a70');
      // the dog's bed
      var bx=Math.round(w*.27),by=floorY+Math.round((h-floorY)*.5),bw2=Math.round(w*.14),bh2=Math.round(w*.05);
      ell(c,bx,by+3,bw2+2,bh2+2,'#1b2447');ell(c,bx,by,bw2,bh2,'#3f58a0');ell(c,bx,by+1,bw2*.8,bh2*.7,'#2a3a72');
      // bowls
      var bwx=Math.round(w*.63),bwy=floorY+Math.round((h-floorY)*.7);
      ell(c,bwx,bwy+2,9,4,'#3a2a22');ell(c,bwx,bwy,9,4,'#c4453f');ell(c,bwx,bwy-1,7,2.6,'#6a4630');
      ell(c,bwx+22,bwy+2,9,4,'#3a2a22');ell(c,bwx+22,bwy,9,4,'#3f7fc4');ell(c,bwx+22,bwy-1,7,2.6,'#9fd6ff');
      // a side table and the lamp
      R(c,fx-12,fy,24,3,'#8a6240');R(c,fx-10,fy+3,3,floorY-fy,'#6e4a2f');R(c,fx+7,fy+3,3,floorY-fy,'#6e4a2f');R(c,fx-9,fy+Math.round((floorY-fy)*.6),18,2,'#6e4a2f');
      R(c,fx-1,fy-Math.round(h*.06),3,Math.round(h*.06),'#6a5a48');R(c,fx-4,fy-3,9,3,'#6a5a48');
      var sw=Math.round(w*.05);for(var sy3=0;sy3<Math.round(h*.06);sy3++){var half=sw*.5+sy3*.55;R(c,fx-half,ly+sy3,half*2,1,'#ffe9b0')}
      base=oc;
      fall=new Float32Array(w*h);var sig=Math.max(w,h)*.5;
      for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){var dx=(xx-fx)/(sig*1.1),dy=(yy-ly)/(sig*.9);fall[yy*w+xx]=Math.exp(-(dx*dx+dy*dy)*2.0)}
    }
    // the sleeping dog: a curled orange body that rises and falls, with an ear, a nose and a tail round the front
    function dog(c,t){
      var bx=Math.round(w*.27),by=floorY+Math.round((h-floorY)*.5)-1,u=Math.max(6,Math.round(w*.05)),br=Math.sin(t*1.5)>0?1:0;
      ell(c,bx,by,u*1.9,u*.9+br*.5,'#d98a3d');ell(c,bx,by-u*.35,u*1.6,u*.55,'#e9a65a');
      ell(c,bx-u*1.6,by+u*.15,u*.85,u*.7,'#d98a3d');ell(c,bx-u*2.1,by+u*.45,u*.45,u*.3,'#f3dcb5');R(c,bx-u*2.45,by+u*.2,2,2,'#1c1416');
      ell(c,bx-u*1.25,by-u*.45,u*.35,u*.55,'#a85d1d');R(c,bx-u*1.95,by-u*.05,3,1,'#3a2214');
      ell(c,bx+u*1.5,by+u*.25,u*.9,u*.3,'#f3dcb5'); // the tail curled in front
      for(var z=0;z<2;z++){var ph=((t*.3+z*.5)%1),zx=Math.round(bx-u*2+ph*7+z*3),zy=Math.round(by-u*1.4-ph*16),sz=z?4:5,al=1-ph;if(al<.15)continue;c.fillStyle=al>.55?'#fff4d8':'#9a8a78';
        c.fillRect(zx,zy,sz,1);for(var zd=1;zd<sz-1;zd++)c.fillRect(zx+sz-1-zd,zy+zd,1,1);c.fillRect(zx,zy+sz-1,sz,1)}
      if(hearts.length<4&&Math.random()<.03)hearts.push({x:bx-u*.5+Math.random()*u,y:by-u*.8,l:1});
    }
    // the cat on the top perch: tabby, ears up, a tail that swishes, and a slow blink
    function cat(c,t){
      var tx=Math.round(w*.84),gy=Math.round(h*.36)-3,u=Math.max(5,Math.round(w*.035)),sw=Math.round(Math.sin(t*1.7)*u*.6);
      // tail hangs down off the perch
      for(var k=0;k<7;k++)R(c,tx+u*1.1+Math.round(Math.sin(t*1.7+k*.4)*k*.5)+(k>4?1:0),gy-u*.3+k*2,2,2,k>4?'#4a4f58':'#8f959d');
      ell(c,tx,gy-u*.7,u*1.1,u*.9,'#8f959d');R(c,tx-u*.6,gy-u*.8,u*1.2,u*.2,'#6b7078');R(c,tx-u*.3,gy-u*1.2,u*.6,u*.2,'#6b7078');
      ell(c,tx-u*.2,gy-u*2,u*.78,u*.62,'#8f959d');
      R(c,tx-u*.9,gy-u*2.9,2,u*.6,'#8f959d');R(c,tx+u*.4,gy-u*2.9,2,u*.6,'#8f959d');R(c,tx-u*.9+1,gy-u*2.7,1,u*.3,'#e8a8b0');R(c,tx+u*.4+1,gy-u*2.7,1,u*.3,'#e8a8b0');
      var blink=(t%5)>4.8;R(c,tx-u*.6,gy-u*2.05,2,blink?1:2,blink?'#3a3f48':'#ffe066');R(c,tx+u*.1,gy-u*2.05,2,blink?1:2,blink?'#3a3f48':'#ffe066');
      R(c,tx-u*.25,gy-u*1.65,2,1,'#e8a8b0');
    }
    function frame(ts){
      if(!ctx)return;
      var t=(ts-t0)/1000;
      if(!frame.buf||frame.buf.width!==w||frame.buf.height!==h){frame.buf=document.createElement('canvas');frame.buf.width=w;frame.buf.height=h}
      var bc=frame.buf.getContext('2d');bc.drawImage(base,0,0);
      dog(bc,t);cat(bc,t);
      stars.forEach(function(s){if(Math.sin(t*s.s+s.p)>-.2)R(bc,s.x,s.y,1,1,'#fff')});
      var img=bc.getImageData(0,0,w,h),d=img.data;
      var fl=.92+.05*Math.sin(t*2.1)+.03*Math.sin(t*5.3+1.3)+(Math.random()-.5)*.02,amb=opts.ambient*1.15;
      for(var p=0,n=w*h;p<n;p++){var g=fall[p]*fl*opts.glow,o=p*4;
        d[o]=Math.min(255,d[o]*(amb*1.05+g*1.35));d[o+1]=Math.min(255,d[o+1]*(amb+g*1.05));d[o+2]=Math.min(255,d[o+2]*(amb*1.05+g*.75))}
      ctx.putImageData(img,0,0);
      // the lamp bulb glow, and hearts drifting up from the sleeping dog
      ell(ctx,fx,ly+Math.round(h*.03),Math.round(w*.03),Math.round(h*.03),'rgba(255,240,190,.5)');
      for(var q=hearts.length-1;q>=0;q--){var hq=hearts[q];hq.y-=.25;hq.x+=Math.sin(t*3+q)*.15;hq.l-=.012;if(hq.l<=0){hearts.splice(q,1);continue}
        ctx.fillStyle=hq.l>.5?'#ff7aa8':'#b84a74';var hx=hq.x|0,hy=hq.y|0;ctx.fillRect(hx,hy,1,1);ctx.fillRect(hx+2,hy,1,1);ctx.fillRect(hx,hy+1,3,1);ctx.fillRect(hx+1,hy+2,1,1)}
    }
    function loop(ts){raf=requestAnimationFrame(loop);if(ts-last<(opts.fps?1000/opts.fps:33))return;last=ts;frame(ts)}
    this.start=function(){size();t0=performance.now();if(reduce){frame(t0+1500);return}
      window.addEventListener('resize',self.resize);raf=requestAnimationFrame(loop)};
    this.stop=function(){cancelAnimationFrame(raf);raf=0;window.removeEventListener('resize',self.resize)};
    this.resize=function(){size()};
  }

  /* ---------- the 2D intro for slow devices: a pixel park where a dog and a cat chase each other ---------- */
  function Matrix(canvas,opts){
    var w=0,h=0,ctx=canvas.getContext('2d'),t0=0,raf=0,last=0,self=this,rd=rng(5),fl=[],tr=[];
    function size(){
      var vw=canvas.clientWidth||window.innerWidth,vh=canvas.clientHeight||window.innerHeight,scale=vw>900?4:3;
      w=Math.max(80,Math.ceil(vw/scale));h=Math.max(80,Math.ceil(vh/scale));canvas.width=w;canvas.height=h;
      fl=[];for(var i=0;i<Math.round(w/5);i++)fl.push({x:rd()*w,y:.5+rd()*.5,c:['#ff6f91','#ffd166','#fff','#c9a0ff'][i%4]});
      tr=[];for(var k=0;k<Math.ceil(w/46)+1;k++)tr.push({x:k*46+rd()*18,s:.8+rd()*.5})}
    // one pet, facing dir (1 = right). Body, head, ears, tail and four legs that swap as it runs.
    function pet(c,x,gy,dir,cat,col,dk,lt,step,t){
      var f=function(rx,ry,rw,rh,cl){c.fillStyle=cl;c.fillRect(Math.round(x+dir*rx-(dir<0?rw-1:0)),gy+ry,rw,rh)};
      var lg=step?1:0;
      f(-4,-3,2,3,dk);f(3,-3,2,3,dk);f(-2+lg,-3,2,3,col);f(1-lg,-3,2,3,col);        // legs
      f(-5,-8,11,5,col);f(-5,-4,11,1,lt);                                        // body and belly
      f(5,-11,6,6,col);f(10,-8,2,3,lt);f(10,-9,1,1,'#222');f(8,-10,1,1,'#222');   // head, muzzle, nose, eye
      if(cat){f(5,-14,2,3,col);f(9,-14,2,3,col);f(6,-13,1,1,'#f6a8b8');             // pointed ears
        var tw=Math.round(Math.sin(t*9));f(-8,-14+tw,2,7,col);f(-7,-15+tw,1,1,dk)}  // tail up
      else{f(5,-12,2,3,dk);f(9,-12,2,2,dk);var tw2=Math.round(Math.sin(t*16)*2);f(-8,-10+tw2,3,2,col)} // floppy ears and a wagging tail
    }
    function tree(c,x,gy,s){c.fillStyle='#6b4a2b';c.fillRect(x-2,gy-Math.round(16*s),4,Math.round(16*s));
      c.fillStyle='#2f8a3e';c.fillRect(x-Math.round(10*s),gy-Math.round(30*s),Math.round(20*s),Math.round(12*s));c.fillStyle='#3fae52';c.fillRect(x-Math.round(7*s),gy-Math.round(38*s),Math.round(14*s),Math.round(10*s));c.fillStyle='#57c96b';c.fillRect(x-Math.round(4*s),gy-Math.round(42*s),Math.round(8*s),Math.round(5*s))}
    function frame(ts){
      if(!ctx)return;var t=(ts-t0)/1000;
      ctx.fillStyle='#8fd0ff';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#bfe6ff';ctx.fillRect(0,Math.round(h*.4),w,Math.round(h*.12));
      for(var c=0;c<4;c++){var cx=Math.round(((t*(3+c)+c*w*.3)%(w+60))-30),cy=Math.round(h*(.12+c*.07));ctx.fillStyle='#fff';ctx.fillRect(cx,cy,26,5);ctx.fillRect(cx+5,cy-3,14,4)}
      var hy=Math.round(h*.58);ctx.fillStyle='#4fb35f';ctx.fillRect(0,hy,w,h-hy);
      for(var s=0;s<w;s+=16){ctx.fillStyle=(s/16|0)%2?'#58c06a':'#4fb35f';ctx.fillRect(s,hy,8,h-hy)}
      tr.forEach(function(q){tree(ctx,Math.round(q.x),hy+2,q.s)});
      ctx.fillStyle='#d7bf8f';ctx.fillRect(0,Math.round(h*.8),w,Math.round(h*.06));
      fl.forEach(function(q){var y=Math.round(hy+6+q.y*(h-hy-10));ctx.fillStyle='#2f8a3e';ctx.fillRect(Math.round(q.x),y+1,1,2);ctx.fillStyle=q.c;ctx.fillRect(Math.round(q.x)-1,y-1+Math.round(Math.sin(t*2+q.x)),3,2)});
      // two chases on two lanes. They run out to the right, turn, and the chaser and the chased swap.
      [[.8,.09,0],[.9,.075,.37]].forEach(function(ln,i){
        var gy=Math.round(h*ln[0]),ph=(t*ln[1]+ln[2])%1,fwd=ph<.5,k=fwd?ph*2:(1-ph)*2,e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
        var L=14,R=w-32,lead=Math.round(Math.min(w*.18,26)),x1=L+(R-L)*e,dir=fwd?1:-1,step=((t*10+i)%1)<.5;
        var x2=x1-dir*lead,a=i%2?x1:x2,b=i%2?x2:x1; // a: the dog, b: the cat
        pet(ctx,Math.round(a),gy,dir,false,i%2?'#e8913a':'#c98a4b','#7a4a1c','#f5e6cc',step,t);
        pet(ctx,Math.round(b),gy,dir,true,i%2?'#9a7cff':'#8f959d','#4a3a8c','#e8e8ee',!step,t)})
    }
    function loop(ts){raf=requestAnimationFrame(loop);if(ts-last<(opts&&opts.fps?1000/opts.fps:33))return;last=ts;frame(ts)}
    this.start=function(){size();t0=performance.now();
      if(reduce){frame(t0+3500);return}
      window.addEventListener('resize',self.resize);raf=requestAnimationFrame(loop)};
    this.stop=function(){cancelAnimationFrame(raf);raf=0;window.removeEventListener('resize',self.resize)};
    this.resize=function(){size()};
  }

  window.Matrix=Matrix;

  window.Cave=Cave;window.caveReduce=reduce;
})();
