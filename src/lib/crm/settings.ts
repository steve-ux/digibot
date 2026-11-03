// Etiquetas y atributos de una cuenta (Configuración). Recibe los repositorios
// para poder testearse y usarse en el modo demo, en memoria.
// Renombrar o borrar una etiqueta / atributo actualiza las conversaciones.

import type { InboxStore } from "../wa-inbox/store";
import { MAX_ATTRIBUTES, parseAttributeInput, type AttributeErrors, type AttributeInput } from "./attributes";
import { MAX_LABELS, parseLabelInput, sameLabel, type LabelErrors, type LabelInput } from "./labels";
import type { SettingsRepo } from "./settings-repo";

export class SettingsError extends Error {
  constructor(
    public readonly fields: LabelErrors & AttributeErrors,
    public readonly httpStatus = 400
  ) {
    super(Object.values(fields)[0] ?? "Datos inválidos.");
  }
}

interface Deps {
  repo: SettingsRepo;
  store: Pick<InboxStore, "renameTag" | "removeTag" | "removeAttribute">;
}

const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "ER_DUP_ENTRY";

// ---------- Etiquetas ----------

export async function createLabel({ repo }: Pick<Deps, "repo">, accountId: number, body: unknown) {
  const { input, errors } = parseLabelInput(body);
  if (Object.keys(errors).length) throw new SettingsError(errors);
  const labels = await repo.listLabels(accountId);
  if (labels.length >= MAX_LABELS) throw new SettingsError({ form: `Hasta ${MAX_LABELS} etiquetas por cuenta.` }, 409);
  if (labels.some((l) => sameLabel(l.name, input.name!))) {
    throw new SettingsError({ name: "Ya hay una etiqueta con ese nombre." }, 409);
  }
  try {
    const id = await repo.createLabel(accountId, input as LabelInput);
    return (await repo.listLabels(accountId)).find((l) => l.id === id)!;
  } catch (err) {
    if (isDuplicate(err)) throw new SettingsError({ name: "Ya hay una etiqueta con ese nombre." }, 409);
    throw err;
  }
}

export async function updateLabel({ repo, store }: Deps, accountId: number, id: number, body: unknown) {
  const labels = await repo.listLabels(accountId);
  const current = labels.find((l) => l.id === id);
  if (!current) throw new SettingsError({ form: "La etiqueta no existe." }, 404);
  const { input, errors } = parseLabelInput(body, true);
  if (Object.keys(errors).length) throw new SettingsError(errors);
  if (input.name && labels.some((l) => l.id !== id && sameLabel(l.name, input.name!))) {
    throw new SettingsError({ name: "Ya hay una etiqueta con ese nombre." }, 409);
  }
  await repo.updateLabel(accountId, id, input);
  if (input.name && input.name !== current.name) await store.renameTag(accountId, current.name, input.name);
  return (await repo.listLabels(accountId)).find((l) => l.id === id)!;
}

export async function deleteLabel({ repo, store }: Deps, accountId: number, id: number) {
  const current = (await repo.listLabels(accountId)).find((l) => l.id === id);
  if (!current) throw new SettingsError({ form: "La etiqueta no existe." }, 404);
  await repo.deleteLabel(accountId, id);
  await store.removeTag(accountId, current.name);
}

// ---------- Atributos ----------

export async function createAttribute({ repo }: Pick<Deps, "repo">, accountId: number, body: unknown) {
  const { input, errors } = parseAttributeInput(body);
  if (Object.keys(errors).length) throw new SettingsError(errors);
  const attributes = await repo.listAttributes(accountId);
  if (attributes.length >= MAX_ATTRIBUTES) {
    throw new SettingsError({ form: `Hasta ${MAX_ATTRIBUTES} atributos por cuenta.` }, 409);
  }
  if (attributes.some((a) => a.key === input.key)) {
    throw new SettingsError({ key: "Ya hay un atributo con esa clave." }, 409);
  }
  try {
    const id = await repo.createAttribute(accountId, input as AttributeInput);
    return (await repo.listAttributes(accountId)).find((a) => a.id === id)!;
  } catch (err) {
    if (isDuplicate(err)) throw new SettingsError({ key: "Ya hay un atributo con esa clave." }, 409);
    throw err;
  }
}

export async function updateAttribute({ repo }: Pick<Deps, "repo">, accountId: number, id: number, body: unknown) {
  const current = (await repo.listAttributes(accountId)).find((a) => a.id === id);
  if (!current) throw new SettingsError({ form: "El atributo no existe." }, 404);
  const { input, errors } = parseAttributeInput(body, true);
  if (Object.keys(errors).length) throw new SettingsError(errors);
  if (current.type === "list" && input.options !== undefined && input.options.length === 0) {
    throw new SettingsError({ options: "Agregá al menos una opción." });
  }
  await repo.updateAttribute(accountId, id, {
    label: input.label,
    description: input.description,
    // Las opciones solo aplican a las listas.
    options: current.type === "list" ? input.options : undefined,
  });
  return (await repo.listAttributes(accountId)).find((a) => a.id === id)!;
}

export async function deleteAttribute({ repo, store }: Deps, accountId: number, id: number) {
  const current = (await repo.listAttributes(accountId)).find((a) => a.id === id);
  if (!current) throw new SettingsError({ form: "El atributo no existe." }, 404);
  await repo.deleteAttribute(accountId, id);
  await store.removeAttribute(accountId, current.key);
}
