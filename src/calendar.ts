import { createDAVClient } from "tsdav";
import ICAL from "ical.js";
import { Vault } from "./vault.js";
export interface CalendarSecret {
  username: string;
  password: string;
}
export interface CalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
  location: string;
}
export function expandICS(
  data: string,
  start: string,
  end: string,
  calendar = "导入日历",
): CalendarEvent[] {
  validateRange(start, end);
  const component = new ICAL.Component(ICAL.parse(data));
  const zone = component.getAllSubcomponents("vtimezone");
  for (const z of zone) ICAL.TimezoneService.register(new ICAL.Timezone(z));
  const lo = Date.parse(start),
    hi = Date.parse(end);
  const events: CalendarEvent[] = [];
  const parts = component.getAllSubcomponents("vevent");
  const exceptions = parts
    .filter((p) => p.hasProperty("recurrence-id"))
    .map((p) => new ICAL.Event(p));
  for (const p of parts.filter((p) => !p.hasProperty("recurrence-id"))) {
    const event = new ICAL.Event(p, { exceptions });
    if (event.component.getFirstPropertyValue("status") === "CANCELLED")
      continue;
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      let n = 0;
      while ((next = iterator.next()) && n++ < 20000) {
        const occurrence = event.getOccurrenceDetails(next);
        const a = occurrence.startDate.toJSDate().getTime(),
          b = occurrence.endDate.toJSDate().getTime();
        if (a >= hi) break;
        if (
          occurrence.item.component.getFirstPropertyValue("status") ===
          "CANCELLED"
        )
          continue;
        if (b > lo)
          events.push({
            uid: event.uid,
            title: occurrence.item.summary,
            start: new Date(a).toISOString(),
            end: new Date(b).toISOString(),
            calendar,
            location: occurrence.item.location,
          });
      }
      if (n >= 20000)
        throw new Error(
          "重复日程展开超过上限，请缩小日期范围或使用较新的日历数据",
        );
    } else {
      const a = event.startDate.toJSDate().getTime(),
        b = event.endDate.toJSDate().getTime();
      if (a < hi && b > lo)
        events.push({
          uid: event.uid,
          title: event.summary,
          start: new Date(a).toISOString(),
          end: new Date(b).toISOString(),
          calendar,
          location: event.location,
        });
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
function validateRange(start: string, end: string) {
  if (
    !/(Z|[+-]\d\d:\d\d)$/.test(start) ||
    !/(Z|[+-]\d\d:\d\d)$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 31 * 86400000
  )
    throw new Error("请选择带时区且不超过 31 天的有效日期范围");
}
export class CalendarConnector {
  constructor(private vault: Vault) {}
  configured() {
    return !!this.vault.get<CalendarSecret>("calendar");
  }
  save(c: CalendarSecret) {
    if (
      !c.username ||
      !c.password ||
      c.username.length > 200 ||
      c.password.length > 200
    )
      throw new Error("日历凭据无效");
    this.vault.put("calendar", c);
  }
  async events(start: string, end: string) {
    validateRange(start, end);
    const credentials = this.vault.get<CalendarSecret>("calendar");
    if (!credentials)
      throw new Error(
        "请先配置 iCloud 日历应用专用密码，或使用 ICS 文件读取工具",
      );
    // Credentials are only sent to Apple's HTTPS CalDAV hosts, including discovered collection URLs.
    const appleFetch: typeof fetch = async (input, init) => {
      const u = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        u.protocol !== "https:" ||
        !(
          u.hostname === "caldav.icloud.com" ||
          /^p\d+-caldav\.icloud\.com$/.test(u.hostname)
        )
      )
        throw new Error("CalDAV 目标不属于 iCloud");
      return fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    };
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials,
      authMethod: "Basic",
      defaultAccountType: "caldav",
      fetch: appleFetch,
    });
    const calendars = await client.fetchCalendars();
    const output: CalendarEvent[] = [];
    for (const calendar of calendars.slice(0, 20)) {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start, end },
      });
      for (const o of objects.slice(0, 300))
        if (o.data)
          output.push(
            ...expandICS(
              String(o.data),
              start,
              end,
              String(calendar.displayName ?? "iCloud"),
            ),
          );
    }
    return output.sort((a, b) => a.start.localeCompare(b.start));
  }
}
