// Atributos propios de cada cuenta (DNI, obra social, ciudad, fecha de nacimiento…).
// El administrador los define en Configuración; en cada conversación se guardan
// como { clave: valor } para que el bot y las integraciones los lean sin vueltas:
//   { "dni": "30111222", "obra_social": "OSDE", "cliente_vip": true }
// Sin imports de servidor: lo usan la UI y las APIs.

export type AttributeType = "text" | "number" | "date" | "list" | "checkbox" | "link";

export const ATTRIBUTE_TYPES: { id: AttributeType; label: string; hint: string }[] = [
  { id: "text", label: "Texto", hint: "Cualquier dato corto: DNI, dirección, modelo." },
  { id: "number", label: "Número", hint: "Cantidades o montos." },
  { id: "date", label: "Fecha", hint: "Cumpleaños, fecha de compra, vencimiento." },
  { id: "list", label: "Lista de opciones", hint: "Elegir una opción de las que definas." },
  { id: "checkbox", label: "Sí / No", hint: "Una casilla para marcar." },
  { id: "link", label: "Link", hint: "Una dirección web (https://…)." },
];

export const ATTRIBUTE_TYPE_LABELS = Object.fromEntries(ATTRIBUTE_TYPES.map((t) => [t.id, t.label])) as Record<
  AttributeType,
  string
>;

export interface CustomAttribute {
  id: number;
  // Clave estable para el bot (snake_case). No cambia después de crearse.
  key: string;
  label: string;
  type: AttributeType;
  options: string[];
  description: string | null;
  sortOrder: number;
}

export type AttributeValue = string | number | boolean;
export type AttributeValues = Record<string, AttributeValue>;

export const MAX_ATTRIBUTES = 40;
export const MAX_ATTRIBUTE_LABEL = 80;
export const MAX_KEY_LENGTH = 64;
export const MAX_OPTIONS = 30;
export const MAX_OPTION_LENGTH = 60;
export const MAX_TEXT_VALUE = 500;

const KEY_RE = /^[a-z][a-z0-9_]*$/;

// "Obra social" -> "obra_social" · "N° de cliente" -> "n_de_cliente"
export function keyFromLabel(label: string) {
  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "a_$1")
    .slice(0, MAX_KEY_LENGTH);
  return key;
}

export type AttributeInput = Omit<CustomAttribute, "id" | "sortOrder">;
export type AttributeErrors = Partial<Record<"key" | "label" | "type" | "options" | "description" | "form", string>>;

export function isAttributeType(value: unknown): value is AttributeType {
  return ATTRIBUTE_TYPES.some((t) => t.id === value);
}

// Crear (partial = false) o editar. Al editar no se cambian ni la clave ni el tipo:
// el bot ya puede estar usando esa clave y los valores guardados dependen del tipo.
export function parseAttributeInput(
  body: unknown,
  partial = false
): { input: Partial<AttributeInput>; errors: AttributeErrors } {
  const data = (body ?? {}) as Record<string, unknown>;
  const input: Partial<AttributeInput> = {};
  const errors: AttributeErrors = {};

  if (data.label !== undefined || !partial) {
    const label = typeof data.label === "string" ? data.label.trim().replace(/\s+/g, " ") : "";
    if (!label) errors.label = "Escribí el nombre del atributo.";
    else if (label.length > MAX_ATTRIBUTE_LABEL) errors.label = `Hasta ${MAX_ATTRIBUTE_LABEL} caracteres.`;
    else input.label = label;
  }

  if (!partial) {
    const rawKey = typeof data.key === "string" && data.key.trim() ? data.key.trim() : keyFromLabel(input.label ?? "");
    if (!rawKey) errors.key = "Escribí una clave (letras, números y guion bajo).";
    else if (!KEY_RE.test(rawKey) || rawKey.length > MAX_KEY_LENGTH) {
      errors.key = "La clave va en minúsculas, sin espacios ni acentos (ej. obra_social).";
    } else input.key = rawKey;

    if (isAttributeType(data.type)) input.type = data.type;
    else errors.type = "Elegí el tipo de dato.";
  }

  if (data.options !== undefined || (!partial && input.type === "list")) {
    const list = Array.isArray(data.options) ? data.options : [];
    const options = Array.from(
      new Set(list.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean))
    );
    if (options.some((o) => o.length > MAX_OPTION_LENGTH)) errors.options = `Cada opción, hasta ${MAX_OPTION_LENGTH} caracteres.`;
    else if (options.length > MAX_OPTIONS) errors.options = `Hasta ${MAX_OPTIONS} opciones.`;
    else input.options = options;
  }
  if (!partial && input.type === "list" && !(input.options?.length)) {
    errors.options = "Agregá al menos una opción.";
  }
  if (!partial && input.type !== "list") input.options = [];

  if (data.description !== undefined) {
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (description.length > 191) errors.description = "La descripción es demasiado larga.";
    else input.description = description || null;
  } else if (!partial) {
    input.description = null;
  }
  return { input, errors };
}

// Valida y normaliza el valor que llega desde el panel (o del bot) según el tipo.
// "" / null borran el valor.
export function coerceAttributeValue(
  def: Pick<CustomAttribute, "type" | "options" | "label">,
  raw: unknown
): { ok: true; value: AttributeValue | null } | { ok: false; message: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const fail = (message: string) => ({ ok: false as const, message });

  switch (def.type) {
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") return fail(`${def.label}: tiene que ser texto.`);
      const value = String(raw).trim();
      if (value.length > MAX_TEXT_VALUE) return fail(`${def.label}: hasta ${MAX_TEXT_VALUE} caracteres.`);
      return { ok: true, value: value || null };
    }
    case "number": {
      const value = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
      if (!Number.isFinite(value)) return fail(`${def.label}: tiene que ser un número.`);
      return { ok: true, value };
    }
    case "date": {
      const value = String(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        return fail(`${def.label}: la fecha no es válida.`);
      }
      return { ok: true, value };
    }
    case "list": {
      const value = String(raw);
      if (!def.options.includes(value)) return fail(`${def.label}: elegí una de las opciones.`);
      return { ok: true, value };
    }
    case "checkbox": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === 1) return { ok: true, value: true };
      if (raw === "false" || raw === 0) return { ok: true, value: false };
      return fail(`${def.label}: tiene que ser sí o no.`);
    }
    case "link": {
      const value = String(raw).trim();
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      } catch {
        return fail(`${def.label}: tiene que ser un link (https://…).`);
      }
      return { ok: true, value };
    }
  }
}

// Cómo se muestra un valor guardado (lista de conversaciones, exportaciones).
export function formatAttributeValue(def: Pick<CustomAttribute, "type">, value: AttributeValue | undefined) {
  if (value === undefined || value === null || value === "") return "";
  if (def.type === "checkbox") return value ? "Sí" : "No";
  if (def.type === "date" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return String(value);
}

export function parseAttributeValues(value: unknown): AttributeValues {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: AttributeValues = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
