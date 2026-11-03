import { describe, expect, it } from "vitest";
import { demoMetricsMessages } from "@/lib/crm/demo-metrics";
import {
  computeMetrics,
  formatDuration,
  metricsWindowStart,
  periodRange,
  TZ_OFFSET_SECONDS,
  type MetricsMessage,
} from "@/lib/crm/metrics";

// Jueves 5/11/2026, 15:00 en Argentina (18:00 UTC).
const NOW = Date.UTC(2026, 10, 5, 18, 0, 0) / 1000;
const TODAY = NOW - 15 * 3600; // medianoche local
const H = 3600;

const msg = (conversationId: number, kind: MetricsMessage["kind"], at: number, extra: Partial<MetricsMessage> = {}): MetricsMessage => ({
  conversationId,
  channel: "wa",
  kind,
  authorName: null,
  at,
  ...extra,
});

describe("períodos", () => {
  it("hoy va de la medianoche local a ahora, en tramos de 2 h", () => {
    const { from, buckets } = periodRange("today", NOW);
    expect(from).toBe(TODAY);
    expect(from + TZ_OFFSET_SECONDS).toBe(Date.UTC(2026, 10, 5) / 1000);
    expect(buckets).toHaveLength(12);
    expect(buckets[7]).toMatchObject({ label: "14h", title: "De 14 a 16 h" });
  });

  it("7 y 30 días terminan hoy, un tramo por día", () => {
    const week = periodRange("7d", NOW);
    expect(week.buckets.map((b) => b.label)).toEqual(["Vie", "Sáb", "Dom", "Lun", "Mar", "Mié", "Jue"]);
    expect(week.buckets[6].title).toBe("Jueves 5/11");
    expect(periodRange("30d", NOW).buckets).toHaveLength(30);
    // Para comparar hacen falta también los 7 días anteriores.
    expect(metricsWindowStart("7d", NOW)).toBe(week.from - 7 * 24 * H);
  });

  it("formatea duraciones", () => {
    expect(formatDuration(38)).toBe("38 s");
    expect(formatDuration(70)).toBe("1 m 10 s");
    expect(formatDuration(120)).toBe("2 m");
    expect(formatDuration(7500)).toBe("2 h 5 m");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("computeMetrics", () => {
  const messages: MetricsMessage[] = [
    // 1: la resuelve DigiBot solo (responde en 20 s)
    msg(1, "in", TODAY + 9 * H),
    msg(1, "bot", TODAY + 9 * H + 20),
    // 2: Instagram, la toma Sofía (bot 10 s, Sofía 100 s después del 2º mensaje) y la resuelve
    msg(2, "in", TODAY + 10 * H, { channel: "ig" }),
    msg(2, "bot", TODAY + 10 * H + 10, { channel: "ig" }),
    msg(2, "in", TODAY + 10 * H + 60, { channel: "ig" }),
    msg(2, "agent", TODAY + 10 * H + 160, { channel: "ig", authorName: "Sofía" }),
    msg(2, "resolve", TODAY + 10 * H + 400, { channel: "ig", authorName: "Sofía" }),
    // 3: sin responder todavía
    msg(3, "in", TODAY + 14 * H + 30),
    // Respuesta a una conversación de ayer: no cuenta como conversación de hoy
    msg(4, "agent", TODAY + 8 * H, { authorName: "Diego" }),
    // Ayer: 2 conversaciones, respondidas en 60 s por el bot
    msg(10, "in", TODAY - 20 * H),
    msg(10, "bot", TODAY - 20 * H + 60),
    msg(11, "in", TODAY - 18 * H),
    msg(11, "bot", TODAY - 18 * H + 60),
  ];

  const report = computeMetrics({ period: "today", now: NOW, messages, waitingNow: 1 });

  it("cuenta las conversaciones en las que escribió el cliente", () => {
    expect(report.conversations).toBe(3);
    expect(report.conversationsDelta).toEqual({ text: "+50% vs ayer", tone: "good" });
    expect(report.byChannel).toMatchObject({ wa: 2, ig: 1 });
    expect(report.bars[4]).toMatchObject({ total: 1 }); // 8-10 h
    expect(report.bars[5].byChannel.ig).toBe(1); // 10-12 h
    expect(report.bars[7].total).toBe(1); // 14-16 h
    expect(report.waitingNow).toBe(1);
  });

  it("resueltas por DigiBot y primera respuesta", () => {
    // De las 2 respondidas, 1 la respondió solo el bot.
    expect(report.botResolvedPct).toBe(50);
    expect(report.botResolvedDelta).toEqual({ text: "-50 pts vs ayer", tone: "bad" });
    expect(report.split).toEqual({ bot: 1, team: 1 });
    expect(report.firstResponseSeconds).toBe(15); // (20 + 10) / 2
    expect(report.firstResponseDelta).toEqual({ text: "45 s más rápido", tone: "good" });
  });

  it("equipo: atendidas, tiempo de respuesta y resueltas", () => {
    expect(report.team).toEqual([
      { name: "Sofía", handled: 1, avgResponseSeconds: 100, resolved: 1 },
      // Diego respondió algo de ayer: atendida, sin tiempo medible en el período
      { name: "Diego", handled: 1, avgResponseSeconds: null, resolved: 0 },
    ]);
  });

  it("sin datos no inventa porcentajes", () => {
    const empty = computeMetrics({ period: "30d", now: NOW, messages: [], waitingNow: 0 });
    expect(empty).toMatchObject({ conversations: 0, botResolvedPct: null, firstResponseSeconds: null, conversationsDelta: null });
    expect(empty.bars).toHaveLength(30);
  });

  it("la demo genera datos estables y con sentido", () => {
    const team = [
      { name: "Vos", weight: 4, speed: 75 },
      { name: "Sofía", weight: 3, speed: 130 },
    ];
    const a = demoMetricsMessages(NOW, team);
    expect(demoMetricsMessages(NOW, team)).toEqual(a); // misma semilla, mismos datos
    const week = computeMetrics({ period: "7d", now: NOW, messages: a, waitingNow: 5 });
    expect(week.conversations).toBeGreaterThan(250);
    expect(week.botResolvedPct).toBeGreaterThan(60);
    expect(week.team.map((t) => t.name).sort()).toEqual(["Sofía", "Vos"]);
    expect(a.every((m) => m.at <= NOW)).toBe(true);
  });
});
