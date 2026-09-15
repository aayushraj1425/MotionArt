// The document loaded into the hidden WebView. It receives frames as data
// URLs, applies a cartoon filter on a <canvas>, then encodes the frames into a
// real MP4 using an embedded WASM H.264 encoder (global `HME`) — all on-device,
// and cross-platform: unlike MediaRecorder/captureStream (unsupported in iOS
// WebViews), canvas pixels + WASM work the same on iOS and Android.
//
// This script uses only single quotes and string concatenation so nothing
// clashes with the surrounding TypeScript template literal.

const PAGE_SCRIPT = `
var RN = window.ReactNativeWebView;
function post(o){ RN && RN.postMessage(JSON.stringify(o)); }

function clamp(v){ return v < 0 ? 0 : (v > 255 ? 255 : v); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

function loadImage(src){
  return new Promise(function(res, rej){
    var img = new Image();
    img.onload = function(){ res(img); };
    img.onerror = function(){ rej(new Error('image decode failed')); };
    img.src = src;
  });
}

// Scale a source frame down to maxW (keeping aspect, and even dimensions the
// H.264 encoder requires) and return its own canvas.
function drawScaled(img, maxW){
  var scale = Math.min(1, maxW / img.width);
  var w = Math.round(img.width * scale); w -= w % 2; if (w < 2) w = 2;
  var h = Math.round(img.height * scale); h -= h % 2; if (h < 2) h = 2;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

// The cartoon look: boost saturation, posterize colours into flat bands, then
// darken pixels sitting on a strong luminance edge to fake ink outlines.
function stylize(ctx, w, h, opts){
  var levels = opts.levels || 5;
  var th = opts.edgeThreshold || 34;
  var sat = opts.saturation || 1.35;

  var img = ctx.getImageData(0, 0, w, h);
  var d = img.data;
  var n = w * h;
  var lum = new Float32Array(n);
  var i, p;

  for (i = 0; i < n; i++){ p = i * 4; lum[i] = 0.299 * d[p] + 0.587 * d[p+1] + 0.114 * d[p+2]; }

  var step = 255 / (levels - 1);
  for (i = 0; i < n; i++){
    p = i * 4;
    var l = lum[i];
    var r = l + (d[p]   - l) * sat;
    var g = l + (d[p+1] - l) * sat;
    var b = l + (d[p+2] - l) * sat;
    d[p]   = Math.round(clamp(r) / step) * step;
    d[p+1] = Math.round(clamp(g) / step) * step;
    d[p+2] = Math.round(clamp(b) / step) * step;
  }

  for (var y = 0; y < h; y++){
    for (var x = 0; x < w; x++){
      i = y * w + x; p = i * 4;
      var edge = false;
      if (x + 1 < w && Math.abs(lum[i] - lum[i+1]) > th) edge = true;
      if (!edge && y + 1 < h && Math.abs(lum[i] - lum[i+w]) > th) edge = true;
      if (edge){ d[p] *= 0.12; d[p+1] *= 0.12; d[p+2] *= 0.12; }
    }
  }

  ctx.putImageData(img, 0, 0);
}

// Encode raw canvas pixels into MP4 bytes using the embedded WASM encoder.
async function encode(frames, opts){
  var HMEref = window.HME || (typeof HME !== 'undefined' ? HME : null);
  if (!HMEref) throw new Error('H.264 encoder failed to load');

  var w = frames[0].width, h = frames[0].height;
  var enc = await HMEref.createH264MP4Encoder();
  enc.width = w;
  enc.height = h;
  enc.frameRate = opts.fps;
  enc.quantizationParameter = opts.quantizer || 26;
  enc.groupOfPictures = 10;
  enc.initialize();

  for (var k = 0; k < frames.length; k++){
    var data = frames[k].getContext('2d').getImageData(0, 0, w, h).data;
    enc.addFrameRgba(data);
    post({ type: 'progress', stage: 'encoding', value: k + 1, total: frames.length });
    await sleep(0); // yield so progress can paint
  }

  enc.finalize();
  var mp4 = enc.FS.readFile(enc.outputFilename);
  var base64 = uint8ToBase64(mp4);
  enc.delete();
  return { base64: base64, mime: 'video/mp4' };
}

function uint8ToBase64(u8){
  var CHUNK = 0x8000, parts = [];
  for (var i = 0; i < u8.length; i += CHUNK){
    parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

window.MotionArt = {
  run: async function(payload){
    try {
      var frames = payload.frames;
      var opts = payload.options;
      var canvases = [];
      var dataUrls = [];
      for (var i = 0; i < frames.length; i++){
        var img = await loadImage(frames[i]);
        var c = drawScaled(img, opts.maxWidth);
        stylize(c.getContext('2d'), c.width, c.height, opts);
        canvases.push(c);
        dataUrls.push(c.toDataURL('image/png'));
        post({ type: 'progress', stage: 'stylizing', value: i + 1, total: frames.length });
      }
      var res = await encode(canvases, opts);
      post({ type: 'result', frames: dataUrls, video: res.base64, mimeType: res.mime });
    } catch (err){
      post({ type: 'error', message: String((err && err.message) || err) });
    }
  }
};

post({ type: 'ready' });
`;

/**
 * Build the WebView document, inlining the encoder library as a page <script>
 * so it loads as normal browser code (the most reliable path across platforms),
 * followed by our processing script.
 */
export function buildWebViewHtml(encoderSource: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" /></head>' +
    '<body style="margin:0;background:#000">' +
    '<script>' + encoderSource + '</script>' +
    '<script>' + PAGE_SCRIPT + '</script>' +
    '</body></html>'
  );
}
