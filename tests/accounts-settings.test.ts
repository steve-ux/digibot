import { beforeEach, describe, expect, it } from "vitest";
import { createAccount, updateAccount } from "@/lib/crm/accounts";
import { MemoryAccountsRepo } from "@/lib/crm/accounts-repo";
import { coerceAttributeValue, keyFromLabel, parseAttributeInput } from "@/lib/crm/attributes";
import { applyConversationAction } from "@/lib/crm/conversation-actions";
import { DEFAULT_LABELS } from "@/lib/crm/labels";
import {
  createAttribute,
  createLabel,
  deleteAttribute,
  deleteLabel,
  updateAttribute,
  updateLabel,
} from "@/lib/crm/settings";
import { MemorySettingsRepo } from "@/lib/crm/settings-repo";
import { MemoryUsersRepo } from "@/lib/crm/users-repo";
import { MemoryInboxStore } from "@/lib/wa-inbox/memory-store";

const ACC = 1;
const ME = { id: 1, name: "Vos" };

let repo: MemorySettingsRepo;
let store: MemoryInboxStore;

beforeEach(() => {
  repo = new MemorySettingsRepo();
  store = new MemoryInboxStore();
});

describe("etiquetas", () => {
  it("se crean por cuenta y no se repiten (sin importar mayúsculas)", async () => {
    const label = await createLabel({ repo }, ACC, { name: "  Presupuesto   enviado ", color: "teal" });
    expect(label).toMatchObject({ name: "Presupuesto enviado", color: "teal", description: null });
    await expect(createLabel({ repo }, ACC, { name: "presupuesto ENVIADO" })).rejects.toMatchObject({ httpStatus: 409 });
    // Otra cuenta puede tener una con el mismo nombre.
    await expect(createLabel({ repo }, 2, { name: "Presupuesto enviado" })).resolves.toBeTruthy();
    await expect(createLabel({ repo }, ACC, { name: "", color: "fucsia" })).rejects.toMatchObject({
      fields: { name: expect.any(String), color: expect.any(String) },
    });
  });

  it("renombrar o borrar actualiza las conversaciones de esa cuenta", async () => {
    const venta = await createLabel({ repo }, ACC, { name: "Venta" });
    const mine = await store.upsertConversation("pn", "549111", "Ana", { accountId: ACC });
    const other = await store.upsertConversation("pn2", "549222", "Beto", { accountId: 2 });
    await store.updateConversation(mine, { tags: ["Venta", "Turno"] });
    await store.updateConversation(other, { tags: ["Venta"] });

    await updateLabel({ repo, store }, ACC, venta.id, { name: "Venta cerrada" });
    expect((await store.getConversation(mine))!.tags).toEqual(["Venta cerrada", "Turno"]);
    expect((await store.getConversation(other))!.tags).toEqual(["Venta"]); // otra cuenta, no se toca

    await deleteLabel({ repo, store }, ACC, venta.id);
    expect((await store.getConversation(mine))!.tags).toEqual(["Turno"]);
    expect(await repo.listLabels(ACC)).toHaveLength(0);
  });

  it("no se puede editar una etiqueta de otra cuenta", async () => {
    const ajena = await createLabel({ repo }, 2, { name: "Ajena" });
    await expect(updateLabel({ repo, store }, ACC, ajena.id, { name: "Mía" })).rejects.toMatchObject({ httpStatus: 404 });
    await expect(deleteLabel({ repo, store }, ACC, ajena.id)).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe("atributos", () => {
  it("arma la clave desde el nombre", () => {
    expect(keyFromLabel("Obra social")).toBe("obra_social");
    expect(keyFromLabel("N° de cliente")).toBe("n_de_cliente");
    expect(keyFromLabel("¿Compró antes?")).toBe("compro_antes");
    expect(keyFromLabel("2do teléfono")).toBe("a_2do_telefono");
  });

  it("valida al crear: clave, tipo y opciones de las listas", () => {
    expect(parseAttributeInput({ label: "Obra social", type: "list", options: ["OSDE", " OSDE ", "Galeno"] })).toMatchObject({
      input: { key: "obra_social", type: "list", options: ["OSDE", "Galeno"] },
      errors: {},
    });
    expect(parseAttributeInput({ label: "Obra social", type: "list", options: [] }).errors.options).toBeTruthy();
    expect(parseAttributeInput({ label: "DNI", type: "texto" }).errors.type).toBeTruthy();
    expect(parseAttributeInput({ label: "DNI", key: "Mal Clave", type: "text" }).errors.key).toBeTruthy();
  });

  it("valida y normaliza cada valor según el tipo", () => {
    const def = (type: Parameters<typeof coerceAttributeValue>[0]["type"], options: string[] = []) => ({ type, options, label: "Campo" });
    expect(coerceAttributeValue(def("number"), "1,5")).toEqual({ ok: true, value: 1.5 });
    expect(coerceAttributeValue(def("number"), "abc")).toMatchObject({ ok: false });
    expect(coerceAttributeValue(def("date"), "2026-02-30")).toMatchObject({ ok: true });
    expect(coerceAttributeValue(def("date"), "30/02/2026")).toMatchObject({ ok: false });
    expect(coerceAttributeValue(def("list", ["OSDE"]), "OSDE")).toEqual({ ok: true, value: "OSDE" });
    expect(coerceAttributeValue(def("list", ["OSDE"]), "IOMA")).toMatchObject({ ok: false });
    expect(coerceAttributeValue(def("checkbox"), true)).toEqual({ ok: true, value: true });
    expect(coerceAttributeValue(def("link"), "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(coerceAttributeValue(def("link"), "https://digibotlatam.com")).toMatchObject({ ok: true });
    expect(coerceAttributeValue(def("text"), "")).toEqual({ ok: true, value: null });
  });

  it("la clave y el tipo no cambian al editar; borrar limpia los valores", async () => {
    const attr = await createAttribute({ repo }, ACC, { label: "Obra social", type: "list", options: ["OSDE"] });
    const saved = await updateAttribute({ repo }, ACC, attr.id, { label: "Prepaga", key: "otra", type: "text", options: ["OSDE", "Galeno"] });
    expect(saved).toMatchObject({ key: "obra_social", type: "list", label: "Prepaga", options: ["OSDE", "Galeno"] });
    await expect(createAttribute({ repo }, ACC, { label: "Obra social", type: "text" })).rejects.toMatchObject({ httpStatus: 409 });

    const id = await store.upsertConversation("pn", "549111", "Ana", { accountId: ACC });
    await store.updateConversation(id, { attributes: { obra_social: "OSDE", dni: "1" } });
    await deleteAttribute({ repo, store }, ACC, attr.id);
    expect((await store.getConversation(id))!.attributes).toEqual({ dni: "1" });
  });
});

describe("acciones con etiquetas y atributos de la cuenta", () => {
  it("solo acepta etiquetas de la cuenta (y respeta las viejas que ya tenía)", async () => {
    const id = await store.upsertConversation("pn", "549111", "Ana", { accountId: ACC });
    await store.updateConversation(id, { tags: ["Etiqueta vieja"] });
    const ctx = { team: [ME], labels: ["Venta", "Turno"] };
    const ok = await applyConversationAction(store, id, { action: "tags", tags: ["Etiqueta vieja", "Venta"] }, ME, ctx);
    expect(ok.conversation.tags).toEqual(["Etiqueta vieja", "Venta"]);
    await expect(applyConversationAction(store, id, { action: "tags", tags: ["Inventada"] }, ME, ctx)).rejects.toMatchObject({
      httpStatus: 400,
    });
  });

  it("guarda atributos validados y los mezcla con los anteriores (null borra)", async () => {
    await createAttribute({ repo }, ACC, { label: "DNI", type: "text" });
    await createAttribute({ repo }, ACC, { label: "Cliente VIP", type: "checkbox" });
    const attributes = await repo.listAttributes(ACC);
    const ctx = { team: [ME], attributes };
    const id = await store.upsertConversation("pn", "549111", "Ana", { accountId: ACC });

    await applyConversationAction(store, id, { action: "attributes", values: { dni: " 30111222 " } }, ME, ctx);
    const { conversation } = await applyConversationAction(store, id, { action: "attributes", values: { cliente_vip: true } }, ME, ctx);
    expect(conversation.attributes).toEqual({ dni: "30111222", cliente_vip: true });

    const cleared = await applyConversationAction(store, id, { action: "attributes", values: { dni: null } }, ME, ctx);
    expect(cleared.conversation.attributes).toEqual({ cliente_vip: true });

    await expect(
      applyConversationAction(store, id, { action: "attributes", values: { inventado: "x" } }, ME, ctx)
    ).rejects.toMatchObject({ httpStatus: 400 });
    await expect(
      applyConversationAction(store, id, { action: "attributes", values: { cliente_vip: "quizás" } }, ME, ctx)
    ).rejects.toMatchObject({ httpStatus: 400 });
  });
});

describe("conversaciones por cuenta", () => {
  it("cada cuenta ve solo las suyas", async () => {
    await store.upsertConversation("pn", "549111", "Ana", { accountId: 1 });
    await store.upsertConversation("pn2", "549222", "Beto", { accountId: 2 });
    await store.upsertConversation("pn", "549333", "Caro"); // sin cuenta: la cuenta por defecto
    expect((await store.listConversations(1, 10)).map((c) => c.contactName).sort()).toEqual(["Ana", "Caro"]);
    expect((await store.listConversations(2, 10)).map((c) => c.contactName)).toEqual(["Beto"]);
  });
});

describe("cuentas", () => {
  it("una cuenta nueva nace con las etiquetas propuestas y su administrador invitado", async () => {
    const accounts = new MemoryAccountsRepo();
    const users = new MemoryUsersRepo();
    const { account, admin, inviteToken } = await createAccount(
      { accounts, users, settings: repo },
      { id: 999, role: "superadmin" },
      { name: " Óptica  Sol ", adminName: "Laura Gómez", adminEmail: "Laura@OpticaSol.com" }
    );
    expect(account).toMatchObject({ id: 1, name: "Óptica Sol", status: "active" });
    expect(admin).toMatchObject({ role: "admin", accountId: 1, email: "laura@opticasol.com", status: "invited" });
    expect(inviteToken).toBeTruthy();
    expect((await repo.listLabels(1)).map((l) => l.name).sort()).toEqual(DEFAULT_LABELS.map((l) => l.name).sort());

    // Email repetido: no se crea la cuenta a medias.
    await expect(
      createAccount({ accounts, users, settings: repo }, { id: 999, role: "superadmin" }, { name: "Otra", adminName: "Laura", adminEmail: "laura@opticasol.com" })
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(accounts.accounts).toHaveLength(1);

    // Sin administrador también se puede (se lo invita después desde Equipo).
    const solo = await createAccount({ accounts, users, settings: repo }, { id: 999, role: "superadmin" }, { name: "Pizzería Roma" });
    expect(solo.admin).toBeNull();

    expect(await updateAccount(accounts, 1, { status: "suspended" })).toMatchObject({ status: "suspended" });
    await expect(updateAccount(accounts, 1, { status: "borrada" })).rejects.toMatchObject({ httpStatus: 400 });
  });
});
