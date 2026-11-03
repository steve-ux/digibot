// Etiquetas de cada cuenta: las define el administrador en Configuración y se
// aplican a las conversaciones. En la conversación se guarda el NOMBRE (como
// Chatwoot), así el bot y las integraciones reciben ["Venta", "Turno"] tal cual.
// Sin imports de servidor: lo usan la UI y las APIs.

export type LabelColor = "blue" | "green" | "amber" | "red" | "violet" | "pink" | "teal" | "gray";

// Colores del punto que acompaña a la etiqueta (el texto siempre usa el color de
// tinta del tema, así el contraste AA no depende del color elegido).
export const LABEL_COLORS: Record<LabelColor, { name: string; hex: string }> = {
  blue: { name: "Azul", hex: "#2D6BFF" },
  green: { name: "Verde", hex: "#16A34A" },
  amber: { name: "Ámbar", hex: "#D97706" },
  red: { name: "Rojo", hex: "#DC2626" },
  violet: { name: "Violeta", hex: "#7C3AED" },
  pink: { name: "Rosa", hex: "#DB2777" },
  teal: { name: "Turquesa", hex: "#0D9488" },
  gray: { name: "Gris", hex: "#6B7280" },
};

export const LABEL_COLOR_IDS = Object.keys(LABEL_COLORS) as LabelColor[];

export interface Label {
  id: number;
  name: string;
  color: LabelColor;
  description: string | null;
}

// Las que la plataforma propone al crear una cuenta (se pueden editar o borrar).
export const DEFAULT_LABELS: Omit<Label, "id">[] = [
  { name: "Cliente nuevo", color: "blue", description: null },
  { name: "Consulta de precio", color: "amber", description: null },
  { name: "Venta", color: "green", description: null },
  { name: "Turno", color: "violet", description: null },
  { name: "Reclamo", color: "red", description: null },
];

export const MAX_LABELS = 60;
export const MAX_LABEL_LENGTH = 40;
export const MAX_DESCRIPTION_LENGTH = 191;

export type LabelInput = Omit<Label, "id">;
export type LabelErrors = Partial<Record<"name" | "color" | "description" | "form", string>>;

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === "string" && value in LABEL_COLORS;
}

export function labelColor(color: string) {
  return LABEL_COLORS[isLabelColor(color) ? color : "gray"].hex;
}

export function parseLabelInput(body: unknown, partial = false): { input: Partial<LabelInput>; errors: LabelErrors } {
  const data = (body ?? {}) as Record<string, unknown>;
  const input: Partial<LabelInput> = {};
  const errors: LabelErrors = {};

  if (data.name !== undefined || !partial) {
    const name = typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ") : "";
    if (!name) errors.name = "Escribí el nombre de la etiqueta.";
    else if (name.length > MAX_LABEL_LENGTH) errors.name = `Hasta ${MAX_LABEL_LENGTH} caracteres.`;
    else input.name = name;
  }
  if (data.color !== undefined || !partial) {
    if (isLabelColor(data.color)) input.color = data.color;
    else if (data.color === undefined) input.color = "blue";
    else errors.color = "Elegí un color de la lista.";
  }
  if (data.description !== undefined) {
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (description.length > MAX_DESCRIPTION_LENGTH) errors.description = "La descripción es demasiado larga.";
    else input.description = description || null;
  } else if (!partial) {
    input.description = null;
  }
  return { input, errors };
}

// Compara nombres sin distinguir mayúsculas (no puede haber "Venta" y "venta").
export const sameLabel = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
