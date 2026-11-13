'use strict';
// The pixel mechpad and its power core, shared by the home page and the coin pages.
// The class keeps the name Cave so the pages need no wiring change: same options (bears, ambient, glow, fps).
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed){var a=seed>>>0;return function(){a=(a+0x6d2b79f5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
  // four standby agents round the core: body, light, shade, glow
  var UNITS=[{b:'#8a98a8',l:'#b4c0cf',d:'#5f6c7c',a:[79,243,255]},{b:'#c0713a',l:'#e39a62',d:'#8c4c22',a:[255,179,71]},{b:'#8a6bd8',l:'#b79cf5',d:'#5f45a8',a:[255,95,208]},{b:'#4fd1a5',l:'#8cf0cc',d:'#2c9a74',a:[157,255,79]}];

  function Cave(canvas,opts){
    var scale=0,w=0,h=0,ctx=canvas.getContext('2d'),base=null,fall=null,sp=[],leds=[],fx=0,fy=0,fw=0,fh=0,t0=0,raf=0,last=0,self=this;
    function pix(c,x,y,col){c.fillStyle=col;c.fillRect(x|0,y|0,1,1)}
    function ell(c,cx,cy,rx,ry,col){c.fillStyle=col;for(var y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++){var dy=(y+.5-cy)/ry;if(dy*dy>1)continue;var dx=Math.sqrt(1-dy*dy)*rx;c.fillRect(Math.round(cx-dx),y,Math.max(1,Math.round(dx*2)),1)}}
    function size(){
      var vw=canvas.clientWidth||window.innerWidth,vh=canvas.clientHeight||window.innerHeight;
      scale=vw>900?4:3;w=Math.max(80,Math.ceil(vw/scale));h=Math.max(80,Math.ceil(vh/scale));
      canvas.width=w;canvas.height=h;
      fx=Math.round(w*.5);fy=Math.round(h*(opts.bears?.80:.88));fw=Math.max(6,Math.round(Math.min(w,h*1.5)*.05));fh=Math.round(fw*2.7);
      var oc=document.createElement('canvas');oc.width=w;oc.height=h;var c=oc.getContext('2d'),r=rng(11);
      var floorY=Math.round(h*(opts.bears?.66:.74));leds=[];
      // back wall: dark steel with panel seams, then rows of server racks
      for(var y=0;y<h;y++){for(var x=0;x<w;x++){var n=r(),shade=y<floorY?(.7+.18*Math.sin(x/11+y/17)+.12*n):(.75+.2*n);var b0=y<floorY?[44,56,74]:[40,48,62];c.fillStyle='rgb('+(b0[0]*shade|0)+','+(b0[1]*shade|0)+','+(b0[2]*shade|0)+')';c.fillRect(x,y,1,1)}}
      var rw=Math.max(14,Math.round(w/14)),top=Math.round(h*.12);
      for(var rx=Math.round(rw*.3);rx+rw-2<w;rx+=rw+Math.round(rw*.25)){
        c.fillStyle='#0b1018';c.fillRect(rx-1,top-1,rw,floorY-top+1);c.fillStyle='#151c28';c.fillRect(rx,top,rw-2,floorY-top);
        for(var uy=top+2;uy<floorY-3;uy+=4){c.fillStyle='#1d2636';c.fillRect(rx+1,uy,rw-4,3);c.fillStyle='#0f1520';c.fillRect(rx+1,uy+3,rw-4,1);
          for(var k=0;k<3;k++)if(r()<.8)leds.push({x:rx+2+k*2,y:uy+1,ph:r()*6.28,sp:.4+r()*2.2,c:r()<.7?0:r()<.5?1:2})}
      }
      // ceiling and side walls close in
      for(var x2=0;x2<w;x2++){var ceil=Math.round(top*.8);for(var y2=0;y2<ceil;y2++)pix(c,x2,y2,'#0a0e15')}
      for(var x3=Math.round(w*.02);x3<w;x3+=Math.round(w/7)){c.fillStyle='#0a0e15';c.fillRect(x3,0,2,top)}
      for(var y3=0;y3<h;y3++){var edge=Math.round(w*.05*(1+Math.sin(y3/9)*.15));for(var x4=0;x4<edge;x4++){pix(c,x4,y3,'#080b11');pix(c,w-1-x4,y3,'#080b11')}}
      // floor: tiles
      for(var x5=0;x5<w;x5++)pix(c,x5,floorY,'#2a3446');
      for(var gy=floorY+6;gy<h;gy+=6)for(var gx=0;gx<w;gx++)pix(c,gx,gy,'#222b3a');
      for(var gx2=(fx%10);gx2<w;gx2+=10)for(var gy2=floorY+1;gy2<h;gy2++)pix(c,gx2,gy2,'#222b3a');
      // the core's pedestal
      c.fillStyle='#0b1018';c.fillRect(fx-fw-2,fy-2,fw*2+4,5);c.fillStyle='#2a3446';c.fillRect(fx-fw-1,fy-1,fw*2+2,2);c.fillStyle='#3f4d66';c.fillRect(fx-fw-1,fy-1,fw*2+2,1);
      base=oc;
      // how far the core's light reaches
      fall=new Float32Array(w*h);var sig=Math.max(w,h)*.5;
      for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){var dx=(xx-fx)/(sig*1.1),dy=(yy-(fy-fh*.5))/(sig*.85);fall[yy*w+xx]=Math.exp(-(dx*dx+dy*dy)*2.2)}
    }
    function agent(c,i,t){
      var u=UNITS[i],left=i<2,dir=left?1:-1,bw=Math.max(18,Math.min(46,Math.round(w*.12)));
      var pos=[[.27,.73],[.36,.87],[.64,.87],[.73,.73]][i],cx=Math.round(w*pos[0]),cy=Math.round(h*pos[1]);
      var ol='#05080d',tw=Math.round(bw*.62),th=Math.round(bw*.44),hw=Math.round(bw*.52),hh=Math.round(bw*.38),gy=cy+Math.round(bw*.3),bob=Math.sin(t*1.5+i*1.7)>0?1:0;
      var tx=cx-(tw>>1),ty=gy-th-2,hx=cx-(hw>>1)+dir,hy=ty-hh+2+bob;
      // feet and arms
      c.fillStyle=ol;c.fillRect(tx-1,gy-3,Math.round(tw*.4)+2,4);c.fillRect(tx+tw-Math.round(tw*.4)-1,gy-3,Math.round(tw*.4)+2,4);
      c.fillStyle=u.d;c.fillRect(tx,gy-2,Math.round(tw*.4),2);c.fillRect(tx+tw-Math.round(tw*.4),gy-2,Math.round(tw*.4),2);
      c.fillStyle=ol;c.fillRect(tx-4,ty+1,4,th-2);c.fillRect(tx+tw,ty+1,4,th-2);c.fillStyle=u.d;c.fillRect(tx-3,ty+2,2,th-4);c.fillRect(tx+tw+1,ty+2,2,th-4);
      // torso
      c.fillStyle=ol;c.fillRect(tx-1,ty-1,tw+2,th+2);c.fillStyle=u.b;c.fillRect(tx,ty,tw,th);c.fillStyle=u.l;c.fillRect(tx,ty,tw,1);c.fillStyle=u.d;c.fillRect(tx,ty+th-2,tw,2);
      var pulse=.55+.45*Math.sin(t*1.2+i*2.1),a=u.a;
      c.fillStyle='rgb('+(a[0]*pulse|0)+','+(a[1]*pulse|0)+','+(a[2]*pulse|0)+')';c.fillRect(cx-1,ty+(th>>1)-1,2,2);
      // head: screen dim, eyes shut to a pair of dashes
      c.fillStyle=ol;c.fillRect(hx-1,hy-1,hw+2,hh+2);c.fillStyle=u.b;c.fillRect(hx,hy,hw,hh);c.fillStyle=u.l;c.fillRect(hx,hy,hw,1);
      c.fillStyle='#070d14';c.fillRect(hx+2,hy+2,hw-4,hh-4);
      var ew=Math.max(2,Math.round(hw*.22)),ey=hy+(hh>>1)+1;
      c.fillStyle='rgb('+(a[0]*.45*pulse|0)+','+(a[1]*.45*pulse|0)+','+(a[2]*.45*pulse|0)+')';
      c.fillRect(hx+Math.round(hw*.25)+dir,ey,ew,1);c.fillRect(hx+hw-Math.round(hw*.25)-ew+dir,ey,ew,1);
      // antenna with a slow standby blink
      c.fillStyle=ol;c.fillRect(hx+(hw>>1)-1,hy-5,3,5);c.fillStyle=u.d;c.fillRect(hx+(hw>>1),hy-4,1,4);
      c.fillStyle=Math.sin(t*2.2+i)>.3?'rgb('+a[0]+','+a[1]+','+a[2]+')':'#1a2230';c.fillRect(hx+(hw>>1)-1,hy-6,3,2);
      // a z or two drifting up
      for(var z=0;z<2;z++){var ph=((t*.35+i*.27+z*.5)%1),zx=Math.round(hx+hw*.7+ph*dir*6+z*dir*2),zy=Math.round(hy-hh*.6-ph*14),sz=z?4:5;
        var al=1-ph;if(al<.15)continue;c.fillStyle=al>.55?'#d8f6ff':'#6a8fa8';
        c.fillRect(zx,zy,sz,1);for(var zd=1;zd<sz-1;zd++)c.fillRect(zx+sz-1-zd,zy+zd,1,1);c.fillRect(zx,zy+sz-1,sz,1)}
    }
    function frame(ts){
      if(!ctx)return;
      var t=(ts-t0)/1000;
      if(!frame.buf||frame.buf.width!==w||frame.buf.height!==h){frame.buf=document.createElement('canvas');frame.buf.width=w;frame.buf.height=h}
      var bc=frame.buf.getContext('2d');bc.drawImage(base,0,0);
      if(opts.bears)for(var i=0;i<4;i++)agent(bc,i,t);
      var img=bc.getImageData(0,0,w,h),d=img.data;
      var fl=.88+.07*Math.sin(t*2.1)+.04*Math.sin(t*7.3+1.3)+(Math.random()-.5)*.04,amb=opts.ambient;
      for(var p=0,n=w*h;p<n;p++){var g=fall[p]*fl*opts.glow,o=p*4;
        d[o]=Math.min(255,d[o]*(amb*.85+g*.6));d[o+1]=Math.min(255,d[o+1]*(amb*1+g*1.1));d[o+2]=Math.min(255,d[o+2]*(amb*1.3+g*1.35))}
      ctx.putImageData(img,0,0);
      // rack lights, at full brightness
      var pal=['#4ff3ff','#3ddc84','#ffb347'];
      for(var k=0;k<leds.length;k++){var L=leds[k];if(Math.sin(t*L.sp+L.ph)>-.1){ctx.fillStyle=pal[L.c];ctx.fillRect(L.x,L.y,1,1)}}
      // the core: an orb in a pulsing beam, with data bits rising off it
      var cy=fy-fh*.55,pr=fw*(.85+.1*Math.sin(t*2.4)),i2;
      for(i2=0;i2<fh;i2++){var bx=Math.round(fx+Math.sin(t*3+i2*.5)*1.2),bwid=Math.max(1,Math.round(fw*.35*(1-i2/fh)));ctx.fillStyle=i2%3===0?'#c8fbff':'#2aa6c0';ctx.fillRect(bx-(bwid>>1),fy-2-i2,bwid,1)}
      ell(ctx,fx,cy,pr+1.5,pr+1.5,'#0b3a4a');ell(ctx,fx,cy,pr,pr,'#1a8fb0');ell(ctx,fx,cy,pr*.7,pr*.7,'#4ff3ff');ell(ctx,fx,cy,pr*.35,pr*.35,'#eaffff');
      if(sp.length<22&&Math.random()<.5)sp.push({x:fx+(Math.random()-.5)*fw*1.4,y:cy,vx:(Math.random()-.5)*.2,vy:-.2-Math.random()*.4,l:1});
      for(var s=sp.length-1;s>=0;s--){var q=sp[s];q.x+=q.vx+Math.sin(t*4+s)*.06;q.y+=q.vy;q.l-=.012;if(q.l<=0){sp.splice(s,1);continue}ctx.fillStyle=q.l>.6?'#d8ffff':q.l>.3?'#4ff3ff':'#1a6f88';ctx.fillRect(q.x|0,q.y|0,1,1)}
    }
    function loop(ts){raf=requestAnimationFrame(loop);if(ts-last<(opts.fps?1000/opts.fps:33))return;last=ts;frame(ts)}
    this.start=function(){size();t0=performance.now();if(reduce){frame(t0+1500);return}
      window.addEventListener('resize',self.resize);raf=requestAnimationFrame(loop)};
    this.stop=function(){cancelAnimationFrame(raf);raf=0;window.removeEventListener('resize',self.resize)};
    this.resize=function(){size()};
  }

  /* ---------- the intro: a mainframe. Code rain, a terminal typing its tasks, agents hauling packets along a block chain ---------- */
  var GL={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110','>':'100010001010100','.':'000000000000010',':':'000010000010000','_':'000000000000111','-':'000000111000000','/':'001001010100100','#':'101111101111101','=':'000111000111000','[':'110100100100110',']':'011001001001011'};
  var LOG=['> BOOT MECHPAD','> LINK PUMP.FUN ... OK','> SCAN CURVE ........ OK','> READ HOLDERS ...... OK','> CHECK DEV SHARE ... OK','> ROUTE BLOCK #4821','> CLAIM AGENT ....... OK','> ALL AGENTS ONLINE'];
  function Matrix(canvas,opts){
    var w=0,h=0,ctx=canvas.getContext('2d'),rain=null,rc=null,cols=[],t0=0,raf=0,last=0,self=this,rd=rng(5),fr=0;
    function glyph(c,ch,x,y,col){var g=GL[ch];if(!g)return;c.fillStyle=col;for(var i=0;i<15;i++)if(g.charAt(i)==='1')c.fillRect(x+i%3,y+(i/3|0),1,1)}
    function text(c,str,x,y,col,n){for(var i=0;i<str.length&&i<n;i++)glyph(c,str.charAt(i),x+i*4,y,col)}
    function size(){
      var vw=canvas.clientWidth||window.innerWidth,vh=canvas.clientHeight||window.innerHeight,scale=vw>900?4:3;
      w=Math.max(80,Math.ceil(vw/scale));h=Math.max(80,Math.ceil(vh/scale));canvas.width=w;canvas.height=h;
      rain=document.createElement('canvas');rain.width=w;rain.height=h;rc=rain.getContext('2d');rc.fillStyle='#000';rc.fillRect(0,0,w,h);
      cols=[];for(var x=0;x<w;x+=4)cols.push({x:x,y:-rd()*h*1.2,v:.5+rd()*1.3});
    }
    var KEYS=Object.keys(GL);
    function rainStep(){
      rc.fillStyle='rgba(0,6,3,.14)';rc.fillRect(0,0,w,h);
      for(var i=0;i<cols.length;i++){var c=cols[i];c.y+=c.v;
        if(c.y>h+8){c.y=-Math.random()*h*.5;c.v=.5+Math.random()*1.3}
        var ch=KEYS[(Math.random()*KEYS.length)|0];
        glyph(rc,ch,c.x,Math.round(c.y)-6,'#18a85a');glyph(rc,ch,c.x,Math.round(c.y),'#d8ffe8')}
    }
    function agent(c,i,t,fy,L,R){
      var u=UNITS[i],sp=.16+i*.035,ph=(t*sp+i*.23)%1,fwd=ph<.5,k=fwd?ph*2:(1-ph)*2,e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
      var x=Math.round(L+(R-L)*e),dir=fwd?1:-1,moving=k>.03&&k<.97,step=moving&&((t*7+i)%1)<.5?1:0,ol='#021008';
      var bw=10,bh=7,hh=6,gy=fy;
      c.fillStyle=ol;c.fillRect(x-bw/2-1,gy-bh-hh-1,bw+2,hh+2);c.fillRect(x-bw/2-1,gy-bh-1,bw+2,bh+2);
      c.fillStyle=u.d;c.fillRect(x-4,gy-1+step,3,2);c.fillRect(x+1,gy-1+(1-step),3,2);
      c.fillStyle=u.b;c.fillRect(x-bw/2,gy-bh,bw,bh);c.fillStyle=u.l;c.fillRect(x-bw/2,gy-bh,bw,1);
      c.fillStyle=u.b;c.fillRect(x-bw/2,gy-bh-hh,bw,hh);c.fillStyle=u.l;c.fillRect(x-bw/2,gy-bh-hh,bw,1);
      c.fillStyle='#04140c';c.fillRect(x-bw/2+1,gy-bh-hh+1,bw-2,hh-3);
      c.fillStyle='#7dffb4';c.fillRect(x-3+dir,gy-bh-hh+2,2,1);c.fillRect(x+1+dir,gy-bh-hh+2,2,1);
      c.fillStyle=u.d;c.fillRect(x,gy-bh-hh-2,1,2);c.fillStyle='#7dffb4';c.fillRect(x,gy-bh-hh-3,1,1);
      // the packet it carries: out to the right node full, back empty
      if(fwd){var bob=step?0:1;c.fillStyle=ol;c.fillRect(x+dir*6-2,gy-bh-2+bob,5,5);c.fillStyle='#3dff9a';c.fillRect(x+dir*6-1,gy-bh-1+bob,3,3);c.fillStyle='#d8ffe8';c.fillRect(x+dir*6-1,gy-bh-1+bob,1,1)}
    }
    function frame(ts){
      if(!ctx)return;var t=(ts-t0)/1000;fr++;rainStep();
      ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=.6;ctx.drawImage(rain,0,0);ctx.globalAlpha=1;
      // terminal panel
      var pw=Math.round(w*.6),ph=Math.round(h*.36),px=Math.round((w-pw)/2),py=Math.round(h*.3);
      ctx.fillStyle='rgba(1,10,6,.9)';ctx.fillRect(px,py,pw,ph);
      ctx.fillStyle='#1fbf6a';ctx.fillRect(px,py,pw,1);ctx.fillRect(px,py+ph-1,pw,1);ctx.fillRect(px,py,1,ph);ctx.fillRect(px+pw-1,py,1,ph);
      ctx.fillStyle='#0b3a22';ctx.fillRect(px+1,py+1,pw-2,7);
      ctx.fillStyle='#3dff9a';ctx.fillRect(px+3,py+3,2,2);ctx.fillStyle='#18a85a';ctx.fillRect(px+7,py+3,2,2);ctx.fillRect(px+11,py+3,2,2);
      var maxc=Math.floor((pw-8)/4);text(ctx,'MAINFRAME',px+pw-4-Math.min(9,maxc)*4,py+2,'#3dff9a',9);
      var typed=Math.floor(t*58),shown=0,lines=Math.floor((ph-12)/7),first=0,total=0;
      for(var i=0;i<LOG.length;i++){if(typed>=total)first=i;total+=LOG[i].length+4}
      var start=Math.max(0,Math.min(first,LOG.length)-lines+1),used=0,rowN=0;
      for(var j=0;j<LOG.length;j++){var len=LOG[j].length+4,n=Math.max(0,Math.min(LOG[j].length,typed-used));used+=len;if(n<=0&&typed<used-len)break;
        if(j<start)continue;var y=py+11+rowN*7,col=LOG[j].indexOf('OK')>0||j===LOG.length-1?'#7dffb4':'#3dff9a';
        text(ctx,LOG[j],px+4,y,col,Math.min(n,maxc));
        if(n<LOG[j].length&&Math.sin(t*14)>0){ctx.fillStyle='#d8ffe8';ctx.fillRect(px+4+Math.min(n,maxc)*4,y,3,5)}rowN++;if(rowN>=lines)break}
      // floor, nodes, agents, block chain
      var fy=Math.round(h*.84),L=Math.round(w*.14),R=Math.round(w*.86);
      ctx.fillStyle='#0b3a22';ctx.fillRect(0,fy+1,w,1);
      [L-10,R+4].forEach(function(nx,q){ctx.fillStyle='#021008';ctx.fillRect(nx-1,fy-17,8,18);ctx.fillStyle='#0f2a1c';ctx.fillRect(nx,fy-16,6,16);for(var r=0;r<4;r++){ctx.fillStyle=Math.sin(t*5+r+q)>0?'#3dff9a':'#0b3a22';ctx.fillRect(nx+1,fy-14+r*4,2,1)}});
      for(var a=0;a<4;a++)agent(ctx,a,t,fy,L,R);
      var off=(t*16)%18,cy=fy+8;
      for(var b=-1;b*18-off<w;b++){var bx=Math.round(b*18-off),idx=b+Math.floor(t*16/18)+4800;
        ctx.fillStyle='#0b3a22';ctx.fillRect(bx+9,cy+2,9,1);
        ctx.fillStyle='#021008';ctx.fillRect(bx,cy,10,7);ctx.fillStyle='#1fbf6a';ctx.fillRect(bx,cy,10,1);ctx.fillRect(bx,cy+6,10,1);ctx.fillRect(bx,cy,1,7);ctx.fillRect(bx+9,cy,1,7);
        for(var d=0;d<4;d++){ctx.fillStyle=((idx*7+d*13)%5)<2?'#3dff9a':'#0b3a22';ctx.fillRect(bx+2+(d%2)*3,cy+2+((d/2)|0)*2,2,1)}}
    }
    function loop(ts){raf=requestAnimationFrame(loop);if(ts-last<(opts&&opts.fps?1000/opts.fps:33))return;last=ts;frame(ts)}
    this.start=function(){size();t0=performance.now();
      if(reduce){for(var i=0;i<70;i++)rainStep();frame(t0+3500);return}
      window.addEventListener('resize',self.resize);raf=requestAnimationFrame(loop)};
    this.stop=function(){cancelAnimationFrame(raf);raf=0;window.removeEventListener('resize',self.resize)};
    this.resize=function(){size()};
  }

  window.Matrix=Matrix;

  window.Cave=Cave;window.caveReduce=reduce;
})();
