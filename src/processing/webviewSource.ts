import { FILTER_SCRIPT } from './animeFilter';

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
  var scale = Math.min(1, maxW / Math.max(img.width, img.height));
  var w = Math.round(img.width * scale); w -= w % 2; if (w < 2) w = 2;
  var h = Math.round(img.height * scale); h -= h % 2; if (h < 2) h = 2;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx=c.getContext('2d');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

${FILTER_SCRIPT}

// Encode raw canvas pixels into MP4 bytes using the embedded WASM encoder.
function uint8ToBase64(u8){
  var CHUNK = 0x8000, parts = [];
  for (var i = 0; i < u8.length; i += CHUNK){
    parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

var acceptFrame = null;
function requestFrame(index){
  return new Promise(function(resolve){
    acceptFrame=resolve;
    post({ type: 'requestFrame', index: index });
  });
}
window.MotionArt = {
  acceptFrame: function(data){ if(acceptFrame){ var resolve=acceptFrame; acceptFrame=null; resolve(data); } },
  run: async function(payload){
    try {
      var count = payload.frameCount;
      var opts = payload.options;
      if (!count) throw new Error('No frames to process');
      var HMEref = window.HME || (typeof HME !== 'undefined' ? HME : null);
      if (!HMEref) throw new Error('H.264 encoder failed to load');
      var enc = await HMEref.createH264MP4Encoder();
      try {
        for (var i = 0; i < count; i++){
          var img = await loadImage(await requestFrame(i));
          var c = drawScaled(img, opts.maxWidth);
          if (i === 0) {
            enc.width=c.width; enc.height=c.height; enc.frameRate=opts.fps;
            enc.quantizationParameter=opts.quantizer; enc.groupOfPictures=opts.fps;
            enc.initialize();
          }
          if(c.width !== enc.width || c.height !== enc.height) throw new Error('Video frame dimensions changed');
          stylize(c.getContext('2d'), c.width, c.height, opts);
          post({ type: 'frame', index: i, dataUrl: c.toDataURL('image/png') });
          enc.addFrameRgba(c.getContext('2d').getImageData(0,0,c.width,c.height).data);
          c.width=0; c.height=0;
          post({ type: 'progress', stage: 'stylizing', value: i + 1, total: count });
          await sleep(0);
        }
        post({ type: 'progress', stage: 'encoding', value: 0, total: 1 });
        enc.finalize();
        var base64=uint8ToBase64(enc.FS.readFile(enc.outputFilename));
        post({ type: 'result', video: base64, mimeType: 'video/mp4' });
      } finally { enc.delete(); }
    } catch (err){
      post({ type: 'error', message: String((err && err.message) || err) });
    }
  }
};

// Older OpenCV builds expose a self-resolving thenable. Never await that object directly.
function openCvReady(){
  if(typeof cv !== 'undefined' && cv.Mat){ post({ type: 'ready' }); return; }
  if(typeof cv !== 'undefined' && typeof cv.then === 'function'){
    cv.then(function(runtime){ cv=runtime; post({ type: 'ready' }); });
  } else {
    post({ type: 'error', message: 'OpenCV could not initialize. Restart the app and try again.' });
  }
}
openCvReady();
`;

/**
 * Build the WebView document, inlining the encoder library as a page <script>
 * so it loads as normal browser code (the most reliable path across platforms),
 * followed by our processing script.
 */
export function buildWebViewHtml(encoderSource: string, openCvSource: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" /></head>' +
    '<body style="margin:0;background:#000">' +
    '<script>' + encoderSource + '</script>' +
    '<script>' + openCvSource + '</script>' +
    '<script>' + PAGE_SCRIPT + '</script>' +
    '</body></html>'
  );
}
