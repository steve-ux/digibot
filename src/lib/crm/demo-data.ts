// Datos de ejemplo del modo demo (los de la maqueta aprobada). Las horas se
// calculan relativas a "ahora" para que la demo siempre se vea viva.
// Sin imports de servidor: lo usan componentes cliente.

import { MemoryInboxStore } from "../wa-inbox/memory-store";
import type { InboxConversation, InboxMessage, InboxPost, InboxTemplate } from "../wa-inbox/types";
import type { AttributeInput, AttributeValues } from "./attributes";
import type { ChannelId } from "./channels";
import { MemorySettingsRepo } from "./settings-repo";

export interface DemoMember {
  id: number;
  name: string;
}

// El usuario real siempre es el id 1; el resto del equipo es de ejemplo.
export const DEMO_TEAMMATES: DemoMember[] = [
  { id: 2, name: "Sofía Rivas" },
  { id: 3, name: "Diego Paz" },
];

const SOFIA = DEMO_TEAMMATES[0];
const DIEGO = DEMO_TEAMMATES[1];
const ME = 1;

export const DEMO_TEMPLATES: InboxTemplate[] = [
  {
    name: "seguimiento",
    language: "es_AR",
    category: "UTILITY",
    header: null,
    body: "¡Hola {{1}}! Te escribimos de Óptica Sol para saber si pudiste resolver tu consulta. ¿Te ayudamos con algo más?",
    footer: null,
    headerVars: [],
    bodyVars: ["1"],
  },
  {
    name: "promocion",
    language: "es_AR",
    category: "MARKETING",
    header: null,
    body: "Hola {{1}}, esta semana tenemos 20% off en multifocales. ¿Querés que te reservemos un turno?",
    footer: null,
    headerVars: [],
    bodyVars: ["1"],
  },
  {
    name: "pedido_listo",
    language: "es_AR",
    category: "UTILITY",
    header: null,
    body: "Hola {{1}}, tus anteojos ya están listos para retirar en sucursal. ¡Te esperamos!",
    footer: null,
    headerVars: [],
    bodyVars: ["1"],
  },
];

const POST: InboxPost = {
  caption: "Nueva colección otoño · 12 modelos en todas las sucursales",
  likes: 248,
  comments: 31,
  thumbnailUrl: null,
};

type SeedMessage = {
  // Minutos antes de ahora
  ago: number;
  by: "in" | "bot" | "agent" | "note" | "system";
  text: string;
  type?: string;
  authorName?: string;
  failedCode?: number;
};

type SeedConversation = {
  name: string;
  channel: ChannelId;
  waId?: string;
  handle?: string;
  unread: number;
  status?: "open" | "resolved";
  bot?: boolean;
  assignee?: number | null;
  tags?: string[];
  attributes?: AttributeValues;
  note?: string;
  // Minutos antes de ahora del primer contacto
  sinceAgo: number;
  sessions: number;
  post?: InboxPost;
  messages: SeedMessage[];
};

const H = 60;
const D = 24 * H;

function seeds(meName: string): SeedConversation[] {
  return [
    {
      name: "Esteban Maldonado",
      channel: "wa",
      waId: "5492616998830",
      unread: 0,
      assignee: ME,
      tags: ["Cliente nuevo"],
      attributes: { dni: "30111222", obra_social: "OSDE" },
      sinceAgo: 23 * H,
      sessions: 1,
      messages: [
        { ago: 23 * H - 10, by: "in", text: "Holis" },
        { ago: 23 * H - 13, by: "agent", text: "Test exitoso", authorName: meName, failedCode: 131030 },
        { ago: 23 * H - 22, by: "agent", text: "Dije test exitoso", authorName: meName },
      ],
    },
    {
      name: "Lucía Fernández",
      channel: "wa",
      waId: "5492614551203",
      unread: 2,
      bot: true,
      tags: ["Turno"],
      sinceAgo: 220 * D,
      sessions: 4,
      messages: [
        { ago: 8, by: "in", text: "Hola! Quería sacar turno para control de vista" },
        { ago: 8, by: "bot", text: "¡Hola Lucía! Tenemos turnos el jueves a las 10:00 o a las 16:30. ¿Cuál te queda mejor?" },
        { ago: 3, by: "in", text: "El jueves a las 16:30" },
        { ago: 2, by: "in", text: "Atienden con obra social?" },
      ],
    },
    {
      name: "Martina Gómez",
      channel: "ig",
      handle: "@martu.gomez",
      unread: 1,
      assignee: SOFIA.id,
      tags: ["Consulta de precio"],
      sinceAgo: D,
      sessions: 1,
      messages: [
        { ago: 26, by: "in", text: "Hola! Vi el reel de los lentes redondos, qué precio tienen?" },
        {
          ago: 26,
          by: "bot",
          text: "¡Hola Martina! Los redondos están $52.000 con lentes polarizados incluidos. ¿Querés que te muestre los colores?",
        },
        { ago: 22, by: "system", text: "", type: "system:take", authorName: SOFIA.name },
        { ago: 19, by: "in", text: "Sí porfa, y si tienen en carey" },
      ],
    },
    {
      name: "Nicolás Ruiz",
      channel: "igc",
      handle: "@nico_ruiz",
      unread: 1,
      sinceAgo: 35,
      sessions: 1,
      post: POST,
      messages: [{ ago: 35, by: "in", text: "Precio de los de la segunda foto?", type: "comment" }],
    },
    {
      name: "Carla Benítez",
      channel: "fb",
      handle: "Carla Benítez",
      unread: 0,
      assignee: SOFIA.id,
      tags: ["Reclamo"],
      attributes: { obra_social: "Swiss Medical", cliente_vip: true, fecha_de_compra: "2026-10-22" },
      note: "Compró Aviador dorado el 22/10.",
      sinceAgo: 12 * D,
      sessions: 2,
      messages: [
        { ago: 75, by: "in", text: "Buen día, compré unos anteojos la semana pasada y se aflojó una patilla" },
        {
          ago: 70,
          by: "agent",
          authorName: SOFIA.name,
          text: "¡Hola Carla! Lamentamos lo que pasó. Acercate a cualquier sucursal y te lo ajustamos sin cargo.",
        },
        { ago: 66, by: "note", authorName: SOFIA.name, text: "Ofrecerle 10% en su próxima compra si vuelve a escribir." },
        { ago: 63, by: "in", text: "Perfecto, paso hoy a la tarde. Gracias!" },
      ],
    },
    {
      name: "Javier Ortiz",
      channel: "wa",
      waId: "5492613127788",
      unread: 0,
      assignee: ME,
      tags: ["Consulta de precio"],
      sinceAgo: D + 15 * H,
      sessions: 1,
      messages: [
        { ago: D + 15 * H, by: "in", text: "Me pasás el precio de los multifocales?" },
        {
          ago: D + 15 * H,
          by: "bot",
          text: "¡Claro, Javier! Los multifocales arrancan en $185.000 con armazón incluido. ¿Querés que un asesor te llame?",
        },
        { ago: D + 15 * H - 8, by: "in", text: "Lo pienso y te aviso" },
      ],
    },
    {
      name: "Valentina Sosa",
      channel: "igc",
      handle: "@valen.sosa",
      unread: 0,
      bot: true,
      sinceAgo: D + 2 * H,
      sessions: 1,
      post: POST,
      messages: [
        { ago: D + 2 * H, by: "in", text: "Hacen envíos a San Juan?", type: "comment" },
        {
          ago: D + 2 * H,
          by: "bot",
          type: "comment_reply",
          text: "¡Hola Valentina! Sí, enviamos a todo el país. Te escribimos por privado con los detalles.",
        },
      ],
    },
    {
      name: "Rocío Salinas",
      channel: "fbc",
      unread: 1,
      sinceAgo: 50,
      sessions: 1,
      post: {
        caption: "¡Llegaron los anteojos de sol 2027! Pasá por cualquier sucursal 😎",
        likes: 87,
        comments: 12,
        thumbnailUrl: null,
      },
      messages: [{ ago: 50, by: "in", text: "¿Hacen cuotas sin interés con tarjeta?", type: "comment" }],
    },
    {
      name: "",
      channel: "th",
      handle: "@juli.mendez",
      unread: 1,
      sinceAgo: 95,
      sessions: 1,
      post: { caption: "¿Lentes redondos o cuadrados? Leemos opiniones 👇", likes: 0, comments: 0, thumbnailUrl: null },
      messages: [{ ago: 95, by: "in", text: "Redondos siempre!! ¿tienen en verde?", type: "comment" }],
    },
    {
      name: "Marcos Díaz",
      channel: "fb",
      handle: "Marcos Díaz",
      unread: 0,
      bot: true,
      tags: ["Venta"],
      sinceAgo: D + 4 * H,
      sessions: 1,
      messages: [
        { ago: D + 4 * H, by: "in", text: "Quiero comprar el modelo Aviador negro" },
        {
          ago: D + 4 * H - 1,
          by: "bot",
          text: "¡Excelente elección! Te dejo el link de pago: digibot.link/aviador. Apenas se acredite te avisamos.",
        },
        { ago: D + 4 * H - 10, by: "in", text: "Listo, ya pagué" },
      ],
    },
    {
      name: "Paula Medina",
      channel: "fb",
      handle: "Paula Medina",
      unread: 0,
      tags: ["Consulta de precio"],
      sinceAgo: 9 * D,
      sessions: 1,
      messages: [
        { ago: 9 * D, by: "in", text: "¿Tienen lentes de contacto descartables?" },
        { ago: 9 * D - 1, by: "bot", text: "¡Hola Paula! Sí, de las marcas Acuvue y Biofinity. ¿Querés que te pase los precios?" },
        { ago: 9 * D - 30, by: "in", text: "Dale, después te escribo" },
      ],
    },
    {
      name: "Ana Torres",
      channel: "wa",
      waId: "5492616001122",
      unread: 0,
      status: "resolved",
      assignee: DIEGO.id,
      tags: ["Venta"],
      sinceAgo: 90 * D,
      sessions: 6,
      messages: [
        { ago: 3 * D, by: "in", text: "¿Ya están mis lentes?" },
        { ago: 3 * D - 8, by: "agent", authorName: DIEGO.name, text: "¡Sí Ana! Ya podés pasar a retirarlos." },
        { ago: 3 * D - 9, by: "in", text: "Genial, gracias!" },
        { ago: 3 * D - 20, by: "system", text: "", type: "system:resolve", authorName: DIEGO.name },
      ],
    },
  ];
}

const SYSTEM_TEXT: Record<string, (name: string) => string> = {
  "system:take": (n) => `${n} tomó la conversación · DigiBot en pausa en este chat`,
  "system:resolve": (n) => `${n} resolvió la conversación`,
};

// Atributos de ejemplo de la cuenta (Configuración y panel del contacto en modo demo).
export const DEMO_ATTRIBUTES: AttributeInput[] = [
  { key: "dni", label: "DNI", type: "text", options: [], description: null },
  { key: "obra_social", label: "Obra social", type: "list", options: ["OSDE", "Swiss Medical", "Galeno", "Particular"], description: null },
  { key: "fecha_de_compra", label: "Fecha de compra", type: "date", options: [], description: "Última compra en el local" },
  { key: "cliente_vip", label: "Cliente VIP", type: "checkbox", options: [], description: null },
];

// Etiquetas y atributos de ejemplo, en memoria.
export async function buildDemoSettings(accountId: number): Promise<MemorySettingsRepo> {
  const repo = new MemorySettingsRepo();
  await repo.seedDefaultLabels(accountId);
  for (const attribute of DEMO_ATTRIBUTES) await repo.createAttribute(accountId, attribute);
  return repo;
}

// Arma un store en memoria con las conversaciones de ejemplo.
export function buildDemoStore(meName: string, accountId = 1): MemoryInboxStore {
  const store = new MemoryInboxStore();
  store.defaultAccountId = accountId;
  const now = Math.floor(Date.now() / 1000);
  const at = (ago: number) => now - ago * 60;

  seeds(meName).forEach((seed, index) => {
    const id = index + 1;
    const visible = seed.messages.filter((m) => m.by === "in" || m.by === "bot" || m.by === "agent");
    const last = visible[visible.length - 1];
    const lastInbound = [...seed.messages].reverse().find((m) => m.by === "in");

    // Como en producción, la ventana de 24 h sale del último mensaje del cliente.
    const lastInboundAt = lastInbound ? at(lastInbound.ago) : null;

    const conversation: Omit<InboxConversation, "windowSecondsLeft"> = {
      id,
      accountId,
      channel: seed.channel,
      phoneNumberId: "demo",
      waId: seed.waId ?? `demo-${id}`,
      contactName: seed.name || null,
      handle: seed.handle ?? null,
      post: seed.post ?? null,
      lastMessagePreview: last?.text ?? null,
      lastMessageAuthor: last ? (last.by === "in" ? "customer" : last.by === "bot" ? "bot" : "agent") : null,
      lastMessageAt: last ? at(last.ago) : null,
      lastInboundAt,
      unreadCount: seed.unread,
      status: seed.status ?? "open",
      botActive: seed.bot ?? false,
      assigneeId: seed.assignee ?? null,
      tags: seed.tags ?? [],
      attributes: seed.attributes ?? {},
      note: seed.note ?? "",
      createdAt: at(seed.sinceAgo),
      sessionCount: seed.sessions,
    };
    store.conversations.push(conversation);

    for (const m of seed.messages) {
      const message: InboxMessage & { rawPayload: unknown } = {
        id: store.messages.length + 1,
        conversationId: id,
        wamid: null,
        direction: m.by === "in" ? "in" : m.by === "bot" || m.by === "agent" ? "out" : "internal",
        author: m.by === "in" ? "customer" : m.by,
        authorName: m.authorName ?? null,
        type: m.type ?? (m.by === "note" ? "note" : "text"),
        body: m.by === "system" ? SYSTEM_TEXT[m.type ?? ""]?.(m.authorName ?? "") ?? m.text : m.text,
        templateName: null,
        status: m.by === "in" ? "received" : m.failedCode ? "failed" : m.by === "agent" || m.by === "bot" ? "read" : "sent",
        errorCode: m.failedCode ?? null,
        errorTitle: m.failedCode ? "Recipient phone number not in allowed list" : null,
        messageAt: at(m.ago),
        rawPayload: null,
      };
      store.messages.push(message);
    }
  });

  return store;
}

// Equipo de ejemplo (pantalla Equipo y Métricas en modo demo).
export interface DemoTeamUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "supervisor" | "agent";
  channels: ChannelId[];
  status: "invited" | "active" | "disabled";
}

export function demoUsers(meName: string): DemoTeamUser[] {
  return [
    { id: 1, name: meName, email: "vos@opticasol.com", role: "admin", channels: ["wa", "ig", "igc", "fb", "fbc", "th"], status: "active" },
    { id: 2, name: SOFIA.name, email: "sofia@opticasol.com", role: "agent", channels: ["wa", "ig", "igc"], status: "active" },
    { id: 3, name: DIEGO.name, email: "diego@opticasol.com", role: "supervisor", channels: ["wa", "ig", "igc", "fb", "fbc", "th"], status: "active" },
    { id: 4, name: "Camila Ortega", email: "camila@opticasol.com", role: "agent", channels: ["fb", "fbc"], status: "invited" },
  ];
}
