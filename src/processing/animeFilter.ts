import { OPENCV_FILTER_SCRIPT } from './openCvFilter';

// Runs in the WebView and in the pixel regression tests; no native dependencies.
export const FILTER_SCRIPT = `
${OPENCV_FILTER_SCRIPT}
function stylize(ctx, w, h, opts){
  var img = ctx.getImageData(0, 0, w, h), n = w*h;
  var src = new Float32Array(img.data);
  var originalLum = new Float32Array(n);
  for(var i=0;i<n;i++) originalLum[i]=src[i*4]*0.299+src[i*4+1]*0.587+src[i*4+2]*0.114;
  var detail=opts.detail === undefined ? 1 : opts.detail;
  var cel=opts.celStrength === undefined ? 0.55 : opts.celStrength;
  var palette=opts.paletteStrength === undefined ? 0 : opts.paletteStrength;
  var prepared=prepareOpenCvPixels(img.data,w,h,opts);
  src=prepared.colors;
  var lum=new Float32Array(n);
  for(var i=0;i<n;i++) lum[i]=src[i*4]*0.299+src[i*4+1]*0.587+src[i*4+2]*0.114;
  var step=255/(opts.levels-1), d=img.data;
  function luma(x,y){return lum[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))];}
  for(var y=0;y<h;y++) for(var x=0;x<w;x++){
    var i=y*w+x, p=i*4, l=lum[i];
    // Quantize lightness, retaining hue instead of independently crushing RGB channels.
    var light=clamp((l-128)*opts.contrast+128);
    // Retain fine local contrast independently of the amount of flat shading.
    var mean=(luma(x-1,y-1)+2*luma(x,y-1)+luma(x+1,y-1)+2*luma(x-1,y)+4*l+2*luma(x+1,y)+luma(x-1,y+1)+2*luma(x,y+1)+luma(x+1,y+1))/16;
    var local=l-mean;
    // Shade broad tones, then restore local features. Detail no longer weakens the whole effect.
    var base=clamp((mean-128)*opts.contrast+128);
    var flat=Math.round(base/step)*step;
    var blend=cel;
    var residual=originalLum[i]-l;
    // Suppress tiny noise and bound sharpening so strong edges do not develop halos.
    var restored=Math.sign(residual)*Math.max(0,Math.abs(residual)-2);
    var sharp=Math.sign(local)*Math.max(0,Math.abs(local)-1)*opts.contrast;
    var shade=light*(1-blend)+flat*blend+detail*Math.max(-24,Math.min(24,restored+sharp*blend));
    var ink=prepared.ink[i]/255*opts.outlineStrength;
    var shadow=Math.max(0,1-shade/150), highlight=Math.max(0,(shade-100)/155);
    var tint=[highlight*18-shadow*8, highlight*7-shadow*5, shadow*20-highlight*14];
    // Saturation zero remains a true grayscale option, including the palette.
    var colorMix=palette*Math.min(1,opts.saturation);
    for(var c=0;c<3;c++) d[p+c]=clamp((shade+(src[p+c]-l)*opts.saturation+tint[c]*colorMix)*(1-ink)+[17,19,30][c]*ink*Math.min(1,opts.saturation)+18*ink*(1-Math.min(1,opts.saturation)));
    d[p+3]=255;
  }
  ctx.putImageData(img,0,0);
}
`;
