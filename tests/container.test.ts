import { test } from "node:test";
import assert from "node:assert/strict";
import { ContainerSandbox } from "../src/sandbox.js";
import { defaults } from "../src/domain.js";

test(
  "real container enforces no network, readonly root and timeout",
  { skip: process.env.ALIEN_CONTAINER_TEST !== "1", timeout: 40000 },
  async () => {
    const config = structuredClone(defaults);
    config.sandbox.engine =
      process.env.ALIEN_CONTAINER_ENGINE === "podman" ? "podman" : "docker";
    config.sandbox.wsl = false;
    const sandbox = new ContainerSandbox(() => config);
    assert.equal((await sandbox.health()).ok, true);
    assert.deepEqual(await sandbox.execute("x=>({double:x.n*2})", { n: 7 }), {
      double: 14,
    });
    await assert.rejects(sandbox.execute("x=>{while(true){}}", {}));
    await assert.rejects(sandbox.execute("x=>process.env", {}));
    // Obtain the container process via the host input prototype. Node VM is not the security boundary.
    // The resulting process still has only the container's filesystem and network.
    const probe =
      'x=>{const p=x.constructor.constructor("return process")();const fs=p.getBuiltinModule("fs");let readonly=false;try{fs.writeFileSync("/escape","bad")}catch{readonly=true}return {uid:p.getuid(),readonly,interfaces:fs.readdirSync("/sys/class/net")}}';
    const actual = (await sandbox.execute(probe, {})) as {
      uid: number;
      readonly: boolean;
      interfaces: string[];
    };
    assert.equal(actual.uid, 65534);
    assert.equal(actual.readonly, true);
    assert.deepEqual(actual.interfaces, ["lo"]);
  },
);
