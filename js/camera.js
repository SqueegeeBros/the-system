// In-app camera. Uses the camera stream directly inside the app instead of handing off
// to Android's Camera app (which can get the app killed on low memory).
import { $ } from './util.js';
import { sheet, closeSheet, toast } from './ui.js';

let stream = null;
const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };

// Opens a camera sheet. Resolves with a JPEG Blob, or null if closed.
export function takePhoto({ title = 'Camera', facing = 'environment', hint = '' } = {}) {
  return new Promise(resolve => {
    let done = false, face = facing;
    const finish = blob => { if (done) return; done = true; stop(); resolve(blob); };
    const canLive = !!navigator.mediaDevices?.getUserMedia;

    sheet(title, `
      ${canLive ? `<div class="cambox"><video id="cam-v" playsinline muted autoplay></video></div>
        ${hint ? `<div class="note center">${hint}</div>` : ''}
        <div class="camrow">
          <label class="camside" aria-label="Choose from gallery"><input type="file" id="cam-file" accept="image/*" hidden>
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg></label>
          <button class="shutter" id="cam-shoot" aria-label="Take photo"></button>
          <button class="camside" id="cam-flip" aria-label="Flip camera"><svg viewBox="0 0 24 24"><path d="M4 7h4l2-3h4l2 3h4v12H4z"/><path d="M9 13a3 3 0 0 0 5.6 1.5M15 12a3 3 0 0 0-5.6-1.5"/></svg></button>
        </div>`
      : `<div class="note">Live camera isn’t available here. Pick a photo instead.</div>
        <label class="btn full mt"><input type="file" id="cam-file" accept="image/*" hidden>Choose photo</label>`}`, {
      onClose: () => finish(null),
      onMount: async card => {
        card.querySelector('#cam-file').onchange = e => { const f = e.target.files[0]; if (f) { finish(f); closeSheet(); } };
        if (!canLive) return;
        const video = card.querySelector('#cam-v');
        const start = async () => {
          stop();
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
            video.srcObject = stream; await video.play().catch(() => {});
          } catch {
            card.querySelector('.cambox').innerHTML = '<div class="alert">Camera blocked. Allow camera access for this app in Chrome site settings, or use the gallery button.</div>';
          }
        };
        await start();
        card.querySelector('#cam-flip').onclick = () => { face = face === 'environment' ? 'user' : 'environment'; start(); };
        card.querySelector('#cam-shoot').onclick = () => {
          if (!video.videoWidth) return toast('Camera is still starting…');
          const max = 1280, s = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(video.videoWidth * s); c.height = Math.round(video.videoHeight * s);
          c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
          c.toBlob(b => { finish(b); closeSheet(); }, 'image/jpeg', 0.85);
        };
      },
    });
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
