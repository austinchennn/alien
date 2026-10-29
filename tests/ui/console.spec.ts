import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
test("owner can submit a task, view real waiting status, and persist a preference", async ({
  page,
}) => {
  const token = readFileSync(
    join(process.env.ALIEN_UI_DATA ?? ".ui-test-data", "access-token"),
    "utf8",
  );
  await page.goto("/#token=" + token);
  await expect(
    page.getByRole("heading", { name: "让每一次任务，积累成下一次能力。" }),
  ).toBeVisible();
  await page.getByLabel("任务目标").fill("UI regression: 整理课程资料");
  await page.getByRole("button", { name: "提交任务" }).click();
  await expect(page.getByRole("heading", { name: "执行记录" })).toBeVisible();
  await expect(
    page.getByText("等待本地模型", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "记忆与 Skill", exact: false })
    .click();
  await page.getByLabel("添加明确偏好").fill("测试偏好：输出使用中文");
  await page.getByRole("button", { name: "保存偏好" }).click();
  await expect(
    page.getByText("测试偏好：输出使用中文", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "systematic-debugging" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Apple Calendar" }),
  ).toBeVisible();
  await page.getByLabel("本机服务地址").fill("https://api.example.com/v1");
  await page.getByRole("button", { name: "保存运行设置" }).click();
  await expect(page.getByRole("alert")).toContainText("只允许本机");
});
