import type { Memory, Skill } from "../domain.js";
export function selectContext(
  goal: string,
  memories: Memory[],
  skills: Skill[],
  limit: number,
) {
  const terms = [
    ...new Set(
      goal.toLowerCase().match(/[a-z0-9_]{2,}|[\p{Script=Han}]/gu) ?? [],
    ),
  ];
  const score = (text: string) =>
    terms.reduce((n, t) => n + (text.toLowerCase().includes(t) ? 1 : 0), 0);
  const facts = memories
    .filter((m) => !m.expiresAt || Date.parse(m.expiresAt) > Date.now())
    .sort(
      (a, b) =>
        Number(b.source === "user") - Number(a.source === "user") ||
        score(b.text) - score(a.text),
    )
    .slice(0, 12);
  const methods = skills
    .map((s) => ({ ...s, score: score(s.name + " " + s.instructions) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return JSON.stringify({ memories: facts, skills: methods }).slice(0, limit);
}
export function compactObservation(value: unknown, limit = 6000) {
  const text = JSON.stringify(value) ?? "null";
  return text.length > limit
    ? text.slice(0, limit) + "… [结果已截断，完整证据保存在事件记录]"
    : text;
}
