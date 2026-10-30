import type {
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { Config } from "./domain.js";
import { localEndpoint } from "./policy.js";
import { localFetch } from "./network.js";
export class ModelGateway {
  constructor(private config: () => Config) {}
  async discover() {
    const base = localEndpoint(this.config().model.baseUrl);
    const response = await localFetch(
      base.href.replace(/\/$/, "") + "/models",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("模型服务返回 " + response.status);
    const body = (await response.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id).filter((id) => !id.endsWith(":cloud"));
  }
  model(): Model<"openai-completions"> {
    const c = this.config().model;
    localEndpoint(c.baseUrl);
    if (!c.id) throw new Error("尚未选择本地模型");
    return {
      id: c.id,
      name: c.id,
      provider: "alien-local",
      api: "openai-completions",
      baseUrl: c.baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: c.contextWindow,
      maxTokens: c.maxOutputTokens,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    };
  }
  stream = (
    model: Model<any>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ) => {
    const c = this.config();
    if (model.provider !== "alien-local")
      throw new Error("仅允许本地模型，禁止云端兜底");
    localEndpoint(model.baseUrl);
    return streamSimple(model as Model<"openai-completions">, context, {
      ...options,
      apiKey: "local-only",
      fetch: localFetch,
      transport: "sse",
      maxRetries: 0,
      timeoutMs: c.limits.taskSeconds * 1000,
      maxTokens: c.model.maxOutputTokens,
      identity: { attribution: null },
      samplingParams: {
        reasoning_effort: c.model.thinking ? "medium" : "none",
      },
    });
  };
}
