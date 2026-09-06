// Synthetic legacy v1 data, generated with the exact pre-upgrade crypto scheme.
export async function legacyFixture(password = 'legacy-password') {
  const b64 = (bytes: ArrayBuffer | Uint8Array) =>
    Buffer.from(
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    ).toString('base64');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const seal = async (text: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return {
      iv: b64(iv),
      payload: b64(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(text),
        ),
      ),
    };
  };
  const verifier = await seal('PRISM_LOCAL_VAULT_V1');
  const record = {
    id: 'legacy-secret',
    secret: 'legacy prompt\n第二行',
    author: '旧版测试作者',
  };
  const data = {
    format: 'PRISM-VAULT',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: [
      {
        key: 'vault',
        salt: b64(salt),
        iv: verifier.iv,
        verifier: verifier.payload,
        iterations: 310000,
      },
    ],
    records: [
      {
        id: record.id,
        scope: 'test',
        updatedAt: new Date().toISOString(),
        ...(await seal(JSON.stringify(record))),
      },
    ],
    blobs: [
      {
        id: 'legacy-file',
        scope: 'test-file',
        name: '旧例图.svg',
        type: 'image/svg+xml',
        updatedAt: new Date().toISOString(),
        ...(await seal('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      },
    ],
  };
  return { file: new File([JSON.stringify(data)], 'legacy.prism'), record };
}
