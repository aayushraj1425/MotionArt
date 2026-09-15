const { test, before } = require('node:test');
const cv = require('../assets/opencv-4.13.0.web.txt');
before(() => new Promise(resolve => cv.then(() => resolve())));
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const filename = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => mocks[name] ?? (name.startsWith('.') ? load(path.resolve(path.dirname(filename), name + '.ts'), mocks, globals) : require(name));
  vm.runInNewContext(code, { exports: module.exports, module, require: localRequire, console, setTimeout, clearTimeout, AbortController, ...globals });
  return module.exports;
}
const { DEFAULT_OPTIONS } = load('src/types.ts');
const { FILTER_SCRIPT } = load('src/processing/animeFilter.ts');
const context = { cv, Float32Array, Math, clamp: v => Math.max(0, Math.min(255, v)) };
vm.runInNewContext(FILTER_SCRIPT, context);
function filter(pixels, w, h, options = {}) {
  const data = new Uint8ClampedArray(pixels);
  context.stylize({ getImageData: () => ({ data }), putImageData() {} }, w, h, { ...DEFAULT_OPTIONS, ...options });
  return data;
}

test('zero saturation produces grayscale and preserves opaque output', () => {
  const out = filter([210, 120, 55, 255, 30, 80, 120, 255], 2, 1, { saturation: 0 });
  for (let i = 0; i < out.length; i += 4) {
    assert.equal(out[i], out[i + 1]); assert.equal(out[i], out[i + 2]); assert.equal(out[i + 3], 255);
  }
});
test('outlines darken silhouettes; zero strength disables ink', () => {
  const pixels = Array.from({ length: 64 }, (_, i) => [...Array(3).fill(i % 8 < 4 ? 70 : 220), 255]).flat();
  const plain = filter(pixels, 8, 8, { outlineStrength: 0 });
  const ink = filter(pixels, 8, 8, { outlineStrength: 1 });
  const boundary = [3, 4].map(x => plain[(4 * 8 + x) * 4] - ink[(4 * 8 + x) * 4]);
  assert.ok(Math.max(...boundary) > 35, 'Canny must ink one side of the silhouette');
  assert.equal(boundary.filter(value => value > 10).length, 1, 'contour should stay one pixel thin');
  assert.equal(ink[(4 * 8 + 7) * 4], plain[(4 * 8 + 7) * 4]);
});
test('bilateral smoothing reduces small texture variations without losing a silhouette', () => {
  const pixels = Array.from({ length: 256 }, (_, i) => [...Array(3).fill((i % 16 < 8 ? 80 : 210) + (i % 2 ? 8 : -8)), 255]).flat();
  const raw = filter(pixels, 16, 16, { smoothing: 0, levels: 256, outlineStrength: 0 });
  const smooth = filter(pixels, 16, 16, { smoothing: 3, levels: 256, outlineStrength: 0 });
  assert.ok(Math.abs(smooth[4 * 4] - smooth[5 * 4]) < Math.abs(raw[4 * 4] - raw[5 * 4]));
  assert.ok(smooth[12 * 4] - smooth[4 * 4] > 100);
});
test('detail retention protects thin low-contrast features from flat shading', () => {
  const pixels = Array.from({ length: 256 }, (_, i) => [...Array(3).fill(i % 16 === 8 ? 115 : 125), 255]).flat();
  const options = { levels: 6, smoothing: 2, outlineStrength: 0, celStrength: 0.8 };
  const flat = filter(pixels, 16, 16, { ...options, detail: 0 });
  const detailed = filter(pixels, 16, 16, { ...options, detail: 1 });
  const contrast = data => data[(8 * 16 + 4) * 4] - data[(8 * 16 + 8) * 4];
  assert.ok(contrast(detailed) > contrast(flat) + 2);
  assert.ok(contrast(detailed) >= 5, 'thin feature must remain visible');
});
test('zero shading and detail with smoothing off preserve source tones', () => {
  const pixels = Array.from({ length: 64 }, (_, i) => [i * 4, i * 4, i * 4, 255]).flat();
  const out = filter(pixels, 8, 8, { smoothing: 0, celStrength: 0, paletteStrength: 0, detail: 0, contrast: 1, saturation: 1, outlineStrength: 0 });
  assert.deepEqual(Array.from(out), pixels);
});
test('anime palette gives cool shadows and warm highlights', () => {
  const options = { smoothing: 0, celStrength: 0, detail: 0, contrast: 1, outlineStrength: 0, paletteStrength: 1 };
  const shadow = filter([60, 60, 60, 255], 1, 1, options);
  const highlight = filter([200, 200, 200, 255], 1, 1, options);
  assert.ok(shadow[2] > shadow[0] + 10);
  assert.ok(highlight[0] > highlight[2] + 10);
});
test('OpenCV releases every owned matrix on success and failure', () => {
  let allocated = 0, deleted = 0;
  const wrapped = Object.create(cv);
  wrapped.Mat = function () {
    allocated++;
    const matrix = new cv.Mat(), dispose = matrix.delete.bind(matrix);
    matrix.delete = () => { deleted++; dispose(); };
    return matrix;
  };
  const originalCv = context.cv;
  context.cv = wrapped;
  const pixels = new Uint8ClampedArray(16 * 16 * 4).fill(128);
  try {
    context.prepareOpenCvPixels(pixels, 16, 16, DEFAULT_OPTIONS);
    assert.ok(allocated > 0); assert.equal(deleted, allocated);
    wrapped.Canny = () => { throw Error('edge failure'); };
    assert.throws(() => context.prepareOpenCvPixels(pixels, 16, 16, DEFAULT_OPTIONS), /edge failure/);
    assert.equal(deleted, allocated);
  } finally { context.cv = originalCv; }
});
test('bundled OpenCV initializes with browser globals and no network', async () => {
  const sandbox = { console, setTimeout, clearTimeout, WebAssembly, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder, performance, atob, btoa };
  sandbox.window = sandbox;
  sandbox.document = { currentScript: { src: '' } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('assets/opencv-4.13.0.web.txt', 'utf8'), sandbox);
  await new Promise(resolve => sandbox.cv.then(() => resolve()));
  assert.equal(typeof sandbox.cv.Canny, 'function');
  assert.equal(typeof sandbox.cv.bilateralFilter, 'function');
});
test('detail retention no longer cancels cel shading on broad regions', () => {
  const options = { smoothing: 0, contrast: 1, outlineStrength: 0, paletteStrength: 0, detail: 1, celStrength: 0.8, levels: 6 };
  const a = filter([95, 95, 95, 255], 1, 1, options);
  const b = filter([110, 110, 110, 255], 1, 1, options);
  assert.ok(b[0] - a[0] <= 4, 'tones in the same band should visibly flatten');
});
test('sampling follows selected fps, trims duration, and cleans up on failure', async () => {
  const times = [], removed = [];
  let failAt = Infinity;
  const { sampleFrames } = load('src/services/FrameSampler.ts', {
    'expo-video-thumbnails': { getThumbnailAsync: async (_, opts) => {
      if (times.length === failAt) throw Error('decode failed');
      times.push(opts.time); return { uri: 'frame-' + times.length };
    } },
    'expo-file-system/legacy': { deleteAsync: async uri => removed.push(uri) },
  });
  const frames = await sampleFrames({ uri: 'clip', durationMs: 9000 }, { ...DEFAULT_OPTIONS, fps: 12, clipSeconds: 2 }, () => {});
  assert.equal(frames.length, 24); assert.equal(times[0], 0); assert.equal(times[12], 1000); assert.ok(times.at(-1) < 2000);
  times.length = 0; failAt = 3;
  await assert.rejects(() => sampleFrames({ uri: 'clip', durationMs: 9000 }, DEFAULT_OPTIONS, () => {}), /Could not read the full clip/);
  assert.equal(removed.length, 3);
});
test('WebView streams frames, keeps portrait dimensions bounded, and frees encoder', async () => {
  const { buildWebViewHtml } = load('src/processing/webviewSource.ts');
  const html = buildWebViewHtml('', '');
  const script = html.match(/<script>([\s\S]*?)<\/script>/g).at(-1).slice(8, -9);
  const messages = []; let deleted = false, encoded = 0;
  const encoder = { initialize() {}, addFrameRgba(data) { assert.equal(data.length, this.width * this.height * 4); encoded++; }, finalize() {}, FS: { readFile: () => new Uint8Array([0, 1, 2]) }, delete() { deleted = true; } };
  const window = { HME: { createH264MP4Encoder: async () => encoder }, ReactNativeWebView: { postMessage(json) {
    const message = JSON.parse(json); messages.push(message);
    if (message.type === 'requestFrame') window.MotionArt.acceptFrame('image');
  } } };
  const document = { createElement: () => {
    const canvas = { width: 0, height: 0, toDataURL: () => 'data:image/png;base64,test' };
    canvas.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(180) }), putImageData() {} });
    return canvas;
  } };
  class Image { width = 80; height = 160; set src(_) { this.onload(); } }
  vm.runInNewContext(script, { cv, window, document, Image, setTimeout, Uint8Array, Float32Array, btoa: s => Buffer.from(s, 'binary').toString('base64') });
  await window.MotionArt.run({ frameCount: 3, options: { ...DEFAULT_OPTIONS, maxWidth: 32 } });
  assert.equal(encoder.width, 16); assert.equal(encoder.height, 32);
  assert.equal(encoded, 3); assert.ok(deleted);
  assert.equal(messages.filter(m => m.type === 'frame').length, 3);
  assert.equal(messages.at(-1).type, 'result');
});
test('real WASM encoder produces an MP4 from filtered pixels', async () => {
  const encoder = await require('h264-mp4-encoder').createH264MP4Encoder();
  try {
    encoder.width = 32; encoder.height = 32; encoder.frameRate = 12; encoder.initialize();
    for (let i = 0; i < 12; i++) {
      const pixels = Array.from({ length: 1024 }, (_, p) => [p % 32 < 8 + i ? 60 : 210, 110, 160, 255]).flat();
      encoder.addFrameRgba(filter(pixels, 32, 32));
    }
    encoder.finalize();
    const bytes = Buffer.from(encoder.FS.readFile(encoder.outputFilename));
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    assert.ok(bytes.includes(Buffer.from('mdat'))); assert.ok(bytes.includes(Buffer.from('moov')));
  } finally { encoder.delete(); }
});

test('gallery saves MP4 and PNG and removes staged PNG after failure', async () => {
  const saved = [], removed = [], writes = [];
  let fail = false;
  const gallery = load('src/services/GallerySaver.ts', {
    'expo-media-library/legacy': {
      requestPermissionsAsync: async writeOnly => { assert.equal(writeOnly, true); return { granted: true }; },
      saveToLibraryAsync: async uri => { if (fail) throw Error('disk full'); saved.push(uri); },
    },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
      writeAsStringAsync: async (uri, data) => writes.push({ uri, data }),
      deleteAsync: async uri => removed.push(uri),
    },
  });
  await gallery.saveVideoToGallery('file:///clip.mp4');
  await gallery.saveDataUrlToGallery('data:image/png;base64,aGVsbG8=');
  assert.equal(saved[0], 'file:///clip.mp4'); assert.ok(saved[1].endsWith('.png'));
  assert.equal(writes[0].data, 'aGVsbG8='); assert.equal(removed.length, 1);
  fail = true;
  await assert.rejects(() => gallery.saveDataUrlToGallery('data:image/png;base64,aGVsbG8='), /disk full/);
  assert.equal(removed.length, 2);
});
test('gallery permission denial prevents saving', async () => {
  const gallery = load('src/services/GallerySaver.ts', {
    'expo-media-library/legacy': {
      requestPermissionsAsync: async () => ({ granted: false }),
      saveToLibraryAsync: async () => assert.fail('must not save without permission'),
    }, 'expo-file-system/legacy': {},
  });
  await assert.rejects(() => gallery.saveVideoToGallery('file:///clip.mp4'), /Allow Photos access/);
});

test('Python client downloads local files and removes the remote job', async () => {
  const requests = [], downloads = [], removed = [];
  const { processWithPython } = load('src/services/PythonProcessor.ts', {
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/', FileSystemUploadType: { MULTIPART: 1 },
      createUploadTask: (_, uri, options) => {
        assert.equal(uri, 'file:///source.mov');
        assert.equal(JSON.parse(options.parameters.options).fps, 12);
        return { uploadAsync: async () => ({ status: 202, body: '{"id":"job"}' }), cancelAsync: async () => {} };
      },
      makeDirectoryAsync: async () => {},
      createDownloadResumable: (url, destination) => ({
        downloadAsync: async () => { downloads.push(url); return { status: 200, uri: destination }; }, pauseAsync: async () => {},
      }),
      deleteAsync: async uri => removed.push(uri),
    },
  }, { fetch: async (url, options) => {
    requests.push([url, options.method]);
    assert.equal(options.headers.Authorization, 'Bearer paired');
    return { status: options.method === 'DELETE' ? 204 : 200, ok: true,
      json: async () => url.endsWith('/health') ? {} : { state: 'done', result: { frameCount: 2 } } };
  } });
  const result = await processWithPython({ uri: 'file:///source.mov' }, DEFAULT_OPTIONS,
    { url: 'http://192.168.1.10:8000', code: 'paired' }, () => {}, new AbortController().signal);
  assert.equal(downloads.length, 3);
  assert.equal(result.frames.length, 2);
  assert.ok(result.frames[0].dataUrl.startsWith('file://'));
  assert.ok(result.cacheDirectory);
  assert.equal(requests.at(-1)[1], 'DELETE');
  assert.equal(removed.length, 0, 'downloaded files live until the result screen is released');
});

test('gallery accepts downloaded PNG files without staging or deleting them', async () => {
  const saved = [];
  const gallery = load('src/services/GallerySaver.ts', {
    'expo-media-library/legacy': { requestPermissionsAsync: async () => ({ granted: true }), saveToLibraryAsync: async uri => saved.push(uri) },
    'expo-file-system/legacy': {},
  });
  await gallery.saveDataUrlToGallery('file:///cache/frame.png');
  assert.deepEqual(saved, ['file:///cache/frame.png']);
});
