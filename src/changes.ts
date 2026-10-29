import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { Config, CoreChange, Patch } from "./domain.js";
import { errorText, now } from "./domain.js";
import { validatePatches } from "./policy.js";
import { Store } from "./store.js";
interface Evaluator {
  evaluate(
    candidate: string,
    output: string,
    signal?: AbortSignal,
  ): Promise<string>;
}
export class Changes {
  constructor(
    private store: Store,
    private sandbox: Evaluator,
    private config: () => Config,
    private root: string,
  ) {}
  private async currentPatches(): Promise<Patch[]> {
    try {
      const pointer = JSON.parse(
        await readFile(join(this.store.dir, "release.json"), "utf8"),
      );
      const manifest = JSON.parse(
        await readFile(join(pointer.path, "manifest.json"), "utf8"),
      );
      return manifest.patches ?? [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  async readCurrent(path: string) {
    validatePatches([{ path, content: "" }]);
    const patches = await this.currentPatches();
    return (
      patches.find((p) => p.path === path)?.content ??
      (await readFile(join(this.root, path), "utf8"))
    );
  }
  async propose(taskId: string, patches: Patch[], signal?: AbortSignal) {
    validatePatches(patches);
    patches = [
      ...new Map(
        [...(await this.currentPatches()), ...patches].map((p) => [p.path, p]),
      ).values(),
    ];
    validatePatches(patches);
    const c: CoreChange = {
      id: randomUUID(),
      taskId,
      patches,
      state: "candidate",
      createdAt: now(),
    };
    this.store.put("change", c.id, c);
    const folder = join(this.store.dir, "candidates", c.id);
    const input = join(folder, "input"),
      output = join(folder, "output");
    await mkdir(output, { recursive: true });
    for (const p of patches) {
      const path = join(input, p.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, p.content);
    }
    try {
      c.report = (await this.sandbox.evaluate(input, output, signal)).slice(
        -30000,
      );
      const files = await this.hashTree(output);
      if (!files.length || !files.some((f) => f.path === "server/main.js"))
        throw new Error("验收没有产生完整发布物");
      c.state = "verified";
      this.store.put("change_manifest", c.id, files);
    } catch (e) {
      c.state = "failed";
      c.report = errorText(e);
    }
    this.store.put("change", c.id, c);
    this.store.event(taskId, "core_candidate", {
      id: c.id,
      state: c.state,
      report: c.report,
    });
    if (c.state === "verified" && this.config().autoPublishCore)
      await this.publish(c.id);
    return c;
  }
  private async hashTree(
    root: string,
  ): Promise<{ path: string; hash: string }[]> {
    let files: { path: string; hash: string }[] = [];
    for (const ent of await readdir(root, { withFileTypes: true })) {
      const p = join(root, ent.name);
      if (ent.isSymbolicLink()) throw new Error("发布物不能包含符号链接");
      if (ent.isDirectory())
        files = files.concat(
          (await this.hashTree(p)).map((f) => ({
            ...f,
            path: ent.name + "/" + f.path,
          })),
        );
      else if (ent.isFile())
        files.push({
          path: ent.name,
          hash: createHash("sha256")
            .update(await readFile(p))
            .digest("hex"),
        });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  async publish(id: string) {
    const c = this.store.get<CoreChange>("change", id);
    if (!c || c.state !== "verified") throw new Error("候选尚未通过独立验收");
    const output = join(this.store.dir, "candidates", id, "output");
    const current = await this.hashTree(output),
      recorded = this.store.get("change_manifest", id);
    if (JSON.stringify(current) !== JSON.stringify(recorded))
      throw new Error("发布物在验收后发生变化");
    const dest = join(this.root, ".releases", id);
    await mkdir(dest, { recursive: true });
    for (const file of current) {
      if (!/^(server|web)\//.test(file.path) || file.path.includes(".."))
        throw new Error("发布物路径无效");
      const p = join(dest, file.path);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, await readFile(join(output, file.path)));
    }
    await writeFile(
      join(dest, "manifest.json"),
      JSON.stringify(
        { id, files: current, patches: c.patches, createdAt: now() },
        null,
        2,
      ),
    );
    // The supervisor is the sole owner of the active release pointer.
    const request = {
      id,
      path: relative(this.root, resolve(dest)),
      createdAt: now(),
    };
    await writeFile(
      join(this.store.dir, "release-request.json.tmp"),
      JSON.stringify(request),
    );
    const { rename } = await import("node:fs/promises");
    await rename(
      join(this.store.dir, "release-request.json.tmp"),
      join(this.store.dir, "release-request.json"),
    );
    c.state = "published";
    this.store.put("change", id, c);
    return request;
  }
}
