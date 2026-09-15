import * as FileSystem from 'expo-file-system/legacy';
import type { AnimeOptions, PickedVideo, ProcessProgress, ProcessResult, PythonConnection } from '../types';

export async function processWithPython(video: PickedVideo, options: AnimeOptions,
  connection: PythonConnection, progress: (progress: ProcessProgress) => void,
  signal: AbortSignal): Promise<ProcessResult> {
  const base = connection.url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base) || !connection.code.trim()) {
    throw new Error('Enter the computer address and pairing code shown in the Python terminal.');
  }
  const headers = { Authorization: `Bearer ${connection.code.trim()}` };
  let jobId: string | null = null;
  const directory = `${FileSystem.cacheDirectory}python-anime-${Date.now()}/`;
  let succeeded = false;
  const checkCancelled = () => { if (signal.aborted) throw new Error('Processing cancelled'); };
  async function request(path: string, method = 'GET', allowCancelled = false) {
    if (!allowCancelled) checkCancelled();
    const controller = new AbortController();
    const stop = () => controller.abort();
    if (!allowCancelled) signal.addEventListener('abort', stop);
    const timer = setTimeout(stop, 30000);
    try {
      const response = await fetch(`${base}${path}`, { method, headers, signal: controller.signal });
      if (response.status === 204) return null;
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The Python processor rejected the request.');
      return body;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
    }
  }
  try {
    progress({ stage: 'uploading', value: 0, total: 1 });
    await request('/health');
    const upload = FileSystem.createUploadTask(`${base}/jobs`, video.uri, {
      httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'video', mimeType: 'application/octet-stream', headers,
      parameters: { options: JSON.stringify(options) },
    }, event => progress({ stage: 'uploading', value: event.totalBytesSent, total: event.totalBytesExpectedToSend }));
    const cancelUpload = () => { void upload.cancelAsync(); };
    signal.addEventListener('abort', cancelUpload);
    const uploadTimer = setTimeout(cancelUpload, 300000);
    let response;
    try { response = await upload.uploadAsync(); }
    finally { clearTimeout(uploadTimer); signal.removeEventListener('abort', cancelUpload); }
    if (!response) throw new Error('Upload cancelled or timed out');
    const uploaded = JSON.parse(response.body);
    if (response.status !== 202) throw new Error(typeof uploaded.detail === 'string' ? uploaded.detail : 'Upload failed');
    jobId = uploaded.id;
    checkCancelled();
    const deadline = Date.now() + 20 * 60 * 1000;
    let frameCount = 0;
    while (true) {
      if (Date.now() > deadline) throw new Error('Processing timed out. Try a shorter clip.');
      const state = await request(`/jobs/${jobId}`);
      if (state.state === 'error') throw new Error(state.error || 'Python processing failed');
      if (state.state === 'done') { frameCount = state.result.frameCount; break; }
      progress({ stage: state.stage, value: state.value, total: state.total });
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 240) throw new Error('Invalid frame count from processor');
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const download = async (path: string, filename: string) => {
      checkCancelled();
      const task = FileSystem.createDownloadResumable(`${base}${path}`, directory + filename, { headers });
      const cancelDownload = () => { void task.pauseAsync().catch(() => {}); };
      signal.addEventListener('abort', cancelDownload);
      const timer = setTimeout(cancelDownload, 120000);
      try {
        const result = await task.downloadAsync();
        checkCancelled();
        if (!result || result.status !== 200) throw new Error('Could not download the result');
        return result.uri;
      } finally { clearTimeout(timer); signal.removeEventListener('abort', cancelDownload); }
    };
    progress({ stage: 'downloading', value: 0, total: frameCount + 1 });
    const videoUri = await download(`/jobs/${jobId}/video`, 'video.mp4');
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      const dataUrl = await download(`/jobs/${jobId}/frames/${i}`, `frame-${i}.png`);
      frames.push({ id: String(i), dataUrl });
      progress({ stage: 'downloading', value: i + 2, total: frameCount + 1 });
    }
    succeeded = true;
    return { videoUri, frames, cacheDirectory: directory };
  } catch (error) {
    checkCancelled();
    if (error instanceof Error && /network|fetch|aborted/i.test(error.message)) {
      throw new Error('Cannot reach the Python processor. Check the address, pairing code, same Wi-Fi connection, and that the Python terminal is running.');
    }
    throw error;
  } finally {
    if (jobId) await request(`/jobs/${jobId}`, 'DELETE', true).catch(() => {});
    if (!succeeded) await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
  }
}
