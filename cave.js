'use strict';
// The pixel cave and its campfire, shared by the home page and the coin pages.
(function(){
  /* ---------- the cave: one scene, drawn small and scaled up, lit by the fire ---------- */
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed){var a=seed>>>0;return function(){a=(a+0x6d2b79f5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
  function hex(c){var n=parseInt(c.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
  var COATS=[{b:'#7a4a2b',l:'#a06a42',d:'#4d2d18',s:'#d9b48a'},{b:'#d9952b',l:'#f5c065',d:'#a8681a',s:'#f7e0ae'},{b:'#44445a',l:'#6a6a84',d:'#2a2a3a',s:'#9a8a7c'},{b:'#e9edf4',l:'#ffffff',d:'#aab5c8',s:'#ffffff'}];

  function Cave(canvas,opts){
    var scale=0,w=0,h=0,ctx=canvas.getContext('2d'),base=null,fall=null,sp=[],fx=0,fy=0,fw=0,fh=0,t0=0,raf=0,last=0,self=this;
    function pix(c,x,y,col){c.fillStyle=col;c.fillRect(x|0,y|0,1,1)}
    function ell(c,cx,cy,rx,ry,col){c.fillStyle=col;for(var y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++){var dy=(y+.5-cy)/ry;if(dy*dy>1)continue;var dx=Math.sqrt(1-dy*dy)*rx;c.fillRect(Math.round(cx-dx),y,Math.max(1,Math.round(dx*2)),1)}}
    function size(){
      var vw=canvas.clientWidth||window.innerWidth,vh=canvas.clientHeight||window.innerHeight;
      scale=vw>900?4:3;w=Math.max(80,Math.ceil(vw/scale));h=Math.max(80,Math.ceil(vh/scale));
      canvas.width=w;canvas.height=h;
      fx=Math.round(w*.5);fy=Math.round(h*(opts.bears?.80:.88));fw=Math.max(6,Math.round(Math.min(w,h*1.5)*.05));fh=Math.round(fw*2.7);
      // static layer: cave wall, ceiling teeth, floor
      var oc=document.createElement('canvas');oc.width=w;oc.height=h;var c=oc.getContext('2d'),r=rng(11);
      var floorY=Math.round(h*(opts.bears?.66:.74));
      for(var y=0;y<h;y++){for(var x=0;x<w;x++){var n=r(),shade=y<floorY?(.55+.25*Math.sin(x/9+y/13)+.2*n):(.8+.2*n);var base0=y<floorY?[74,52,38]:[96,70,48];c.fillStyle='rgb('+(base0[0]*shade|0)+','+(base0[1]*shade|0)+','+(base0[2]*shade|0)+')';c.fillRect(x,y,1,1)}}
      for(var i=0;i<w*h/260;i++){var rx=r()*w,ry=r()*floorY,rr=1+r()*4;ell(c,rx,ry,rr*1.5,rr,r()<.5?'#2c1e15':'#4e3626')}
      // ceiling and side walls close in
      for(var x2=0;x2<w;x2++){var ceil=Math.round(h*.1+Math.sin(x2/7)*2+r()*3);for(var y2=0;y2<ceil;y2++)pix(c,x2,y2,'#140d09')}
      for(var s=0;s<w/9;s++){var sx=Math.round(r()*w),len=4+Math.round(r()*h*.12);for(var k=0;k<len;k++){var half=Math.max(0,Math.round((len-k)/4));for(var q=-half;q<=half;q++)pix(c,sx+q,h*.1+k,'#1c130d')}}
      for(var y3=0;y3<h;y3++){var edge=Math.round(Math.pow(Math.abs(y3/h-.35),2)*0+w*.07*(1+Math.sin(y3/6)*.3));for(var x3=0;x3<edge;x3++){pix(c,x3,y3,'#120b08');pix(c,w-1-x3,y3,'#120b08')}}
      // floor edge
      for(var x4=0;x4<w;x4++)pix(c,x4,floorY,'#3a281b');
      for(var p=0;p<w/6;p++)pix(c,r()*w,floorY+2+r()*(h-floorY-2),r()<.5?'#2a1c12':'#7a5a3c');
      // logs under the fire
      c.fillStyle='#3a2210';c.fillRect(fx-fw-2,fy-1,fw*2+4,3);c.fillStyle='#5a3418';c.fillRect(fx-fw-1,fy-2,fw*2+2,1);
      ell(c,fx-fw,fy,2,2,'#2a1a0c');ell(c,fx+fw,fy,2,2,'#2a1a0c');
      base=oc;
      // how far the firelight reaches
      fall=new Float32Array(w*h);var sig=Math.max(w,h)*.5;
      for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){var dx=(xx-fx)/(sig*1.1),dy=(yy-(fy-fh*.5))/(sig*.85);fall[yy*w+xx]=Math.exp(-(dx*dx+dy*dy)*2.2)}
    }
    function bear(c,i,t){
      var co=COATS[i],left=i<2,dir=left?1:-1,bw=Math.max(18,Math.min(46,Math.round(w*.12)));
      var pos=[[.27,.73],[.36,.87],[.64,.87],[.73,.73]][i],cx=Math.round(w*pos[0]),cy=Math.round(h*pos[1]);
      var br=Math.sin(t*1.5+i*1.7)*.5;
      var rx=bw*.5,ry=bw*.3+br;
      var ol='#140b06';
      ell(c,cx,cy+1,rx+1,ry+1,ol);ell(c,cx+dir*rx*.78,cy-ry*.1,bw*.27,bw*.25,ol);
      ell(c,cx,cy,rx,ry,co.b);ell(c,cx,cy+ry*.35,rx*.95,ry*.55,co.d);ell(c,cx-dir*rx*.1,cy-ry*.45,rx*.7,ry*.4,co.l);
      var hx=cx+dir*rx*.78,hy=cy-ry*.1,hr=bw*.25;
      ell(c,hx-dir*hr*.2,hy-hr*.95,hr*.42,hr*.42,ol);ell(c,hx+dir*hr*.55,hy-hr*.95,hr*.42,hr*.42,ol);
      ell(c,hx,hy,hr,hr*.95,co.b);ell(c,hx-dir*hr*.2,hy-hr*.9,hr*.32,hr*.32,co.b);ell(c,hx+dir*hr*.55,hy-hr*.9,hr*.32,hr*.32,co.b);
      ell(c,hx+dir*hr*.45,hy+hr*.28,hr*.55,hr*.42,co.s);
      pix(c,hx+dir*hr*.95,hy+hr*.12,'#140b06');                 // nose
      var ex=Math.round(hx+dir*hr*.3),ey=Math.round(hy-hr*.18);pix(c,ex,ey,'#140b06');pix(c,ex+dir,ey,'#140b06'); // closed eye
      ell(c,cx-dir*rx*.9,cy+ry*.55,bw*.12,bw*.1,co.d);                                                              // back paw
      // a z or two drifting up
      for(var z=0;z<2;z++){var ph=((t*.35+i*.27+z*.5)%1),zx=Math.round(hx+dir*hr*.3+ph*dir*6+z*dir*2),zy=Math.round(hy-hr*1.6-ph*14),sz=z?4:5;
        var a=1-ph;if(a<.15)continue;c.fillStyle=a>.55?'#dfe8ff':'#8ea0c8';
        c.fillRect(zx,zy,sz,1);for(var zd=1;zd<sz-1;zd++)c.fillRect(zx+sz-1-zd,zy+zd,1,1);c.fillRect(zx,zy+sz-1,sz,1)}
    }
    function frame(ts){
      if(!ctx)return;
      var t=(ts-t0)/1000;
      if(!frame.buf||frame.buf.width!==w||frame.buf.height!==h){frame.buf=document.createElement('canvas');frame.buf.width=w;frame.buf.height=h}
      var bc=frame.buf.getContext('2d');bc.drawImage(base,0,0);
      if(opts.bears)for(var i=0;i<4;i++)bear(bc,i,t);
      var img=bc.getImageData(0,0,w,h),d=img.data;
      var fl=.86+.1*Math.sin(t*9.3)+.06*Math.sin(t*23.1+1.3)+(Math.random()-.5)*.1,amb=opts.ambient;
      for(var p=0,n=w*h;p<n;p++){var g=fall[p]*fl*opts.glow,o=p*4;
        d[o]=Math.min(255,d[o]*(amb*.9+g*1.15));d[o+1]=Math.min(255,d[o+1]*(amb*.95+g*.72));d[o+2]=Math.min(255,d[o+2]*(amb*1.25+g*.38))}
      ctx.putImageData(img,0,0);
      // flames and sparks, drawn at full brightness
      for(var x=-fw;x<=fw;x++){
        var ax=Math.abs(x)/fw,sway=Math.sin(t*6+x*.7)*1.2,hgt=Math.max(1,Math.round(fh*Math.pow(1-ax,1.1)*(.7+.3*Math.abs(Math.sin(t*11+x*1.3))*(.6+Math.random()*.4))));
        for(var y=0;y<hgt;y++){var u=y/hgt,col=u<.22&&ax<.5?'#fff4b8':u<.5?'#ffcf4a':u<.78?'#ff8a2a':'#d9401a';ctx.fillStyle=col;ctx.fillRect(Math.round(fx+x+sway*u),fy-y-1,1,1)}}
      if(sp.length<18&&Math.random()<.5)sp.push({x:fx+(Math.random()-.5)*fw,y:fy-fh*.6,vx:(Math.random()-.5)*.25,vy:-.25-Math.random()*.4,l:1});
      for(var k=sp.length-1;k>=0;k--){var q=sp[k];q.x+=q.vx+Math.sin(t*5+k)*.08;q.y+=q.vy;q.l-=.012;if(q.l<=0){sp.splice(k,1);continue}ctx.fillStyle=q.l>.6?'#ffe08a':q.l>.3?'#ff9a2e':'#b8451c';ctx.fillRect(q.x|0,q.y|0,1,1)}
    }
    function loop(ts){raf=requestAnimationFrame(loop);if(ts-last<(opts.fps?1000/opts.fps:33))return;last=ts;frame(ts)}
    this.start=function(){size();t0=performance.now();if(reduce){frame(t0+1500);return}
      window.addEventListener('resize',self.resize);raf=requestAnimationFrame(loop)};
    this.stop=function(){cancelAnimationFrame(raf);raf=0;window.removeEventListener('resize',self.resize)};
    this.resize=function(){size()};
  }

  window.Cave=Cave;window.caveReduce=reduce;
})();
