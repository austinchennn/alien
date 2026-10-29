import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { publicAddress, localEndpoint } from "./policy.js";
export const localFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  localEndpoint(url.origin + "/v1");
  const response = await fetch(input, { ...init, redirect: "error" });
  return response;
};
export async function publicPage(
  url: string,
  domains: string[],
  signal?: AbortSignal,
): Promise<string> {
  const u = new URL(url);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    !domains.includes(u.hostname.toLowerCase())
  )
    throw new Error("网址不在用户授权的网站白名单中");
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("禁止访问本地或私有网络地址");
  const chosen = addresses[0]!;
  return new Promise((resolve, reject) => {
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      u,
      {
        method: "GET",
        signal,
        timeout: 20000,
        headers: { "user-agent": "Alien/0.1 (local personal agent)" },
        lookup: (_host, _opts, callback) =>
          callback(null, chosen.address, chosen.family),
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(
            new Error(`网页返回 ${res.statusCode}，重定向需要明确授权目标域名`),
          );
          return;
        }
        if (
          !/text\/|application\/(json|xml|xhtml)/i.test(
            String(res.headers["content-type"]),
          )
        ) {
          res.resume();
          reject(new Error("只允许文本网页"));
          return;
        }
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (b: string) => {
          text += b;
          if (text.length > 1000000) req.destroy(new Error("网页过大"));
        });
        res.on("end", () =>
          resolve(
            text
              .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, 40000),
          ),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("网页请求超时")));
    req.on("error", reject);
    req.end();
  });
}
