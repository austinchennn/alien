import { resolve, join } from "node:path";
import { createApp } from "./app.js";
const root = resolve(process.env.ALIEN_ROOT ?? process.cwd());
const runtime = await createApp({
  root,
  dir: resolve(process.env.ALIEN_DATA ?? join(root, "data")),
});
await runtime.app.listen({
  host: "127.0.0.1",
  port: Number(process.env.ALIEN_PORT ?? 4317),
});
console.log(
  "Alien 本地控制台：http://127.0.0.1:" + (process.env.ALIEN_PORT ?? 4317),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(
    signal,
    () => void runtime.app.close().then(() => process.exit(0)),
  );
