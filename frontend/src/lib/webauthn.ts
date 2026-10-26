export function b64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(padded);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function bufferToB64url(buf: ArrayBuffer): string {
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export const passkeysSupported = () =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

// Server options (base64url) -> what navigator.credentials.create() expects.
export function toCreationOptions(o: any): PublicKeyCredentialCreationOptions {
  return {
    ...o,
    challenge: b64urlToBuffer(o.challenge),
    user: { ...o.user, id: b64urlToBuffer(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c: any) => ({
      ...c,
      id: b64urlToBuffer(c.id),
    })),
  };
}

// Server options -> navigator.credentials.get() input.
export function toRequestOptions(o: any): PublicKeyCredentialRequestOptions {
  return {
    ...o,
    challenge: b64urlToBuffer(o.challenge),
    allowCredentials: (o.allowCredentials || []).map((c: any) => ({
      ...c,
      id: b64urlToBuffer(c.id),
    })),
  };
}

export function serializeAssertion(credential: PublicKeyCredential) {
  const r = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToB64url(r.clientDataJSON),
      authenticatorData: bufferToB64url(r.authenticatorData),
      signature: bufferToB64url(r.signature),
      userHandle: r.userHandle ? bufferToB64url(r.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export function serializeAttestation(credential: PublicKeyCredential) {
  const r = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToB64url(r.clientDataJSON),
      attestationObject: bufferToB64url(r.attestationObject),
      transports: r.getTransports ? r.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}
