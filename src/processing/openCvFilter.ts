// Only the OpenCV pixel operations live here; palette and cel shading are composed separately.
export const OPENCV_FILTER_SCRIPT = `
function prepareOpenCvPixels(data, w, h, opts){
  if(typeof cv === 'undefined' || !cv.Mat) throw new Error('OpenCV is not ready');
  var owned=[];
  function mat(){ var m=new cv.Mat(); owned.push(m); return m; }
  try {
    var rgba=mat(); rgba.create(h,w,cv.CV_8UC4); rgba.data.set(data);
    var rgb=mat(); cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
    var filtered=rgb;
    for(var pass=0;pass<opts.smoothing;pass++){
      var next=mat();
      // RGB input is required: bilateralFilter does not accept RGBA.
      cv.bilateralFilter(filtered,next,5,28,3,cv.BORDER_DEFAULT);
      filtered=next;
    }
    var colors=new Float32Array(w*h*4);
    for(var i=0;i<w*h;i++){
      colors[i*4]=filtered.data[i*3]; colors[i*4+1]=filtered.data[i*3+1];
      colors[i*4+2]=filtered.data[i*3+2]; colors[i*4+3]=255;
    }
    var gray=mat(), clean=mat(), edges=mat(), localEdges=mat();
    cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);
    cv.GaussianBlur(gray,clean,new cv.Size(3,3),0.7,0.7,cv.BORDER_DEFAULT);
    // Canny thins contours and connects weaker segments to strong edges.
    cv.Canny(clean,edges,opts.edgeThreshold*2,opts.edgeThreshold*4,3,true);
    cv.adaptiveThreshold(clean,localEdges,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,9,Math.max(2,opts.edgeThreshold/4));
    var ink=new Uint8Array(w*h);
    for(var i=0;i<ink.length;i++){
      // Local thresholding selects the darker side of each contour to avoid thick double lines.
      ink[i]=edges.data[i] ? (localEdges.data[i] ? 255 : 170) : 0;
    }
    return { colors: colors, ink: ink };
  } finally {
    // Copy all output out of WASM before releasing every matrix, including error paths.
    for(var i=owned.length-1;i>=0;i--) owned[i].delete();
  }
}
`;
