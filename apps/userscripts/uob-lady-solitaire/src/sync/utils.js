export function generateDeviceId() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `device-${Date.now()}-${randomPart}`;
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
