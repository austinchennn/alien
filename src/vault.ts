import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { join } from "node:path";
export class Vault {
  private key: Buffer;
  constructor(private dir: string) {
    const path = join(dir, "vault.key");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(32), { mode: 0o600 });
    this.key = readFileSync(path);
    try {
      chmodSync(path, 0o600);
    } catch {}
  }
  put(name: string, value: unknown) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    writeFileSync(
      join(this.dir, "secret-" + name + ".bin"),
      Buffer.concat([iv, cipher.getAuthTag(), data]),
      { mode: 0o600 },
    );
  }
  get<T>(name: string): T | undefined {
    const path = join(this.dir, "secret-" + name + ".bin");
    if (!existsSync(path)) return;
    const raw = readFileSync(path),
      decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString(),
    ) as T;
  }
}
