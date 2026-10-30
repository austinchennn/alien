import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("owner can chat, organize and fork conversations, and see local load", async ({
  page,
  request,
}) => {
  const token = readFileSync(
    join(process.env.ALIEN_UI_DATA ?? ".ui-test-data", "access-token"),
    "utf8",
  );
  const headers = { Authorization: "Bearer " + token };
  const state = await request.get("/api/state", { headers }).then((r) => r.json());
  state.config.model.id = "ui-test-model-not-installed";
  await request.put("/api/config", { headers, data: state.config });
  const project = await request
    .post("/api/projects", { headers, data: { name: "UI project" } })
    .then((r) => r.json());
  await request.post("/api/conversations", {
    headers,
    data: { title: "UI conversation", projectId: project.id },
  });

  await page.goto("/#token=" + token);
  await expect(page.getByRole("heading", { name: "今天想一起做什么？" })).toBeVisible();
  await expect(page.getByText("UI project", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "UI conversation" }).click();
  await page.getByPlaceholder(/给 Alien 发消息/).fill("UI regression: 你好");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("UI regression: 你好", { exact: true })).toBeVisible();
  await expect(page.getByText("等待本地模型", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("本机运行负载")).toBeVisible();
  await expect(page.getByText(/Agent$/).first()).toBeVisible();
  await page.getByRole("button", { name: /从此处分叉/ }).click();
  await expect(page.getByText("分支对话", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept("UI-created folder"));
  await page.getByRole("button", { name: "新建项目" }).click();
  await expect(page.getByRole("button", { name: /UI-created folder/ })).toBeVisible();

  await page.getByRole("button", { name: "记忆与 Skill", exact: false }).click();
  await page.getByLabel("添加明确偏好").fill("测试偏好：输出使用中文");
  await page.getByRole("button", { name: "保存偏好" }).click();
  await expect(page.getByText("测试偏好：输出使用中文", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Apple Calendar" })).toBeVisible();
});
