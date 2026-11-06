import { describe, expect, it } from "vitest";
import { parseAvatarDataUrl } from "@/lib/crm/profile";
import { DEFAULT_SOUND_PREFS, newInboundChannels, normalizeSoundPrefs, soundFor } from "@/lib/crm/sound-prefs";

describe("preferencias de sonido", () => {
  it("completa lo que falta y descarta lo inválido", () => {
    const prefs = normalizeSoundPrefs({ enabled: false, volume: 250, channels: { wa: "pop", ig: "inventado", th: "off" } });
    expect(prefs.enabled).toBe(false);
    expect(prefs.volume).toBe(100);
    expect(prefs.channels.wa).toBe("pop");
    expect(prefs.channels.ig).toBe(DEFAULT_SOUND_PREFS.channels.ig);
    expect(prefs.channels.th).toBe("off");
    expect(normalizeSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
  });

  it("cada canal tiene un sonido distinto por defecto", () => {
    const values = Object.values(DEFAULT_SOUND_PREFS.channels);
    expect(new Set(values).size).toBe(values.length);
    expect(DEFAULT_SOUND_PREFS.channels.wa).toBe("bubble");
  });

  it("no suena si está apagado, en volumen 0 o el canal no tiene sonido", () => {
    expect(soundFor(DEFAULT_SOUND_PREFS, "wa")).toBe("bubble");
    expect(soundFor({ ...DEFAULT_SOUND_PREFS, enabled: false }, "wa")).toBeNull();
    expect(soundFor({ ...DEFAULT_SOUND_PREFS, volume: 0 }, "wa")).toBeNull();
    expect(soundFor({ ...DEFAULT_SOUND_PREFS, channels: { ...DEFAULT_SOUND_PREFS.channels, ig: "off" } }, "ig")).toBeNull();
  });

  it("detecta mensajes nuevos de clientes entre dos lecturas", () => {
    const before = [
      { id: 1, channel: "wa" as const, lastInboundAt: 100, lastMessageAuthor: "customer" },
      { id: 2, channel: "ig" as const, lastInboundAt: 50, lastMessageAuthor: "agent" },
    ];
    const after = [
      { id: 1, channel: "wa" as const, lastInboundAt: 100, lastMessageAuthor: "agent" },
      { id: 2, channel: "ig" as const, lastInboundAt: 60, lastMessageAuthor: "customer" },
      { id: 3, channel: "fb" as const, lastInboundAt: 70, lastMessageAuthor: "customer" },
      { id: 4, channel: "th" as const, lastInboundAt: null, lastMessageAuthor: "agent" },
    ];
    expect(newInboundChannels(before, after)).toEqual(["ig", "fb"]);
    expect(newInboundChannels(after, after)).toEqual([]);
  });
});

describe("foto de perfil", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");

  it("acepta una imagen válida", () => {
    const parsed = parseAvatarDataUrl(`data:image/jpeg;base64,${jpeg}`);
    expect("error" in parsed).toBe(false);
  });

  it("rechaza tipos, firmas y tamaños inválidos", () => {
    expect(parseAvatarDataUrl(`data:image/svg+xml;base64,${jpeg}`)).toHaveProperty("error");
    expect(parseAvatarDataUrl(`data:image/png;base64,${jpeg}`)).toHaveProperty("error");
    expect(parseAvatarDataUrl(42)).toHaveProperty("error");
    const big = Buffer.alloc(400 * 1024, 0xff);
    big[1] = 0xd8;
    expect(parseAvatarDataUrl(`data:image/jpeg;base64,${big.toString("base64")}`)).toHaveProperty("error");
  });
});

describe("versión del panel", async () => {
  const { isOutdated } = await import("@/lib/version");

  it("misma versión con distinta fecha de build no es desactualizado (bug de prod)", () => {
    expect(isOutdated({ version: "0.11.0", buildTime: "2026-11-05T00:06:01Z" }, { version: "0.11.0", buildTime: "2026-11-05T00:06:09Z" })).toBe(false);
  });

  it("avisa cuando el servidor tiene otra versión", () => {
    expect(isOutdated({ version: "0.11.0", buildTime: "a" }, { version: "0.12.0", buildTime: "a" })).toBe(true);
  });

  it("sin número de versión (dev) usa la fecha del build", () => {
    expect(isOutdated({ version: null, buildTime: "a" }, { version: null, buildTime: "b" })).toBe(true);
    expect(isOutdated({ version: null, buildTime: "a" }, { version: null, buildTime: "a" })).toBe(false);
  });
});

describe("sonidos de canales que vienen", () => {
  it("YouTube, Telegram y TikTok tienen sonido propio", () => {
    const prefs = normalizeSoundPrefs({ channels: { tg: "pop" } });
    expect(prefs.channels.yt).toBe("drop");
    expect(prefs.channels.tg).toBe("pop");
    expect(prefs.channels.tt).toBe("blip");
  });
});
