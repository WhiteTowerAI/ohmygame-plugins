// The market's signed record of one release, as the app reads it
// (`src/daemon/plugin-releases.ts` in OhMyGame): it vouches for the id,
// version and archive digest, so any copy of the archive, from the mirror,
// GitHub or a proxy, is checked the same way.

import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export interface SignedRelease {
  id: string;
  version: string;
  url: string;
  size: number;
  sha256: string;
  key: string;
  signature: string;
}

/** The bytes a release's signature covers; the app's `releaseMessage`. */
export function releaseMessage(release: Pick<SignedRelease, "id" | "version" | "sha256">): Buffer {
  return Buffer.from(`ohmygame-plugin-release:1\n${release.id}\n${release.version}\n${release.sha256}`);
}

/** The market's key: an Ed25519 private key (PKCS#8 PEM) and its id. */
export interface SigningKey {
  id: string;
  key: KeyObject;
}

export function signingKey(id: string, pem: string): SigningKey {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error(`${id} isn't a key id`);
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("The signing key must be Ed25519");
  return { id, key };
}

export function signRelease(key: SigningKey, release: Omit<SignedRelease, "key" | "signature">): SignedRelease {
  return { ...release, key: key.id, signature: sign(null, releaseMessage(release), key.key).toString("base64") };
}

/** Where the mirror keeps an archive, below its base: named by version and digest, so it never changes. */
export function mirrorPath(id: string, version: string, sha256: string): string {
  return `packages/${id}/${version}-${sha256}.zip`;
}
