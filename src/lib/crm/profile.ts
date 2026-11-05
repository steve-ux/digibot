// Perfil personal del usuario del panel (foto y sonidos) sobre web_user_profiles
// (migración 0011). Server-only. Si la tabla no existe todavía, se devuelven los
// valores por defecto: el panel sigue andando, solo sin foto ni sonidos guardados.

import type { RowDataPacket } from "mysql2";
import { getPool, isDbConfigured } from "../db";
import { DEFAULT_SOUND_PREFS, normalizeSoundPrefs, type SoundPrefs } from "./sound-prefs";

export interface UserProfile {
  // 0 = sin foto
  avatarVersion: number;
  sounds: SoundPrefs;
}

export const AVATAR_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];
// La foto llega recortada a 256x256 desde el navegador; esto es solo un tope.
export const AVATAR_MAX_BYTES = 300 * 1024;

const DEFAULT_PROFILE: UserProfile = { avatarVersion: 0, sounds: DEFAULT_SOUND_PREFS };

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export async function getProfile(userId: number): Promise<UserProfile> {
  if (!isDbConfigured()) return DEFAULT_PROFILE;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT avatar_version, avatar IS NOT NULL AS has_avatar, preferences FROM web_user_profiles WHERE user_id = ? LIMIT 1",
      [userId]
    );
    const row = rows[0];
    if (!row) return DEFAULT_PROFILE;
    return {
      avatarVersion: Number(row.has_avatar) ? Number(row.avatar_version) || 0 : 0,
      sounds: normalizeSoundPrefs(parseJson(row.preferences).sounds),
    };
  } catch (err) {
    console.error("[crm] No se pudo leer el perfil (¿falta la migración 0011?):", (err as Error).message);
    return DEFAULT_PROFILE;
  }
}

export async function getAvatar(userId: number): Promise<{ mime: string; data: Buffer } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT avatar, avatar_mime FROM web_user_profiles WHERE user_id = ? AND avatar IS NOT NULL LIMIT 1",
    [userId]
  );
  const row = rows[0];
  return row ? { mime: String(row.avatar_mime || "image/jpeg"), data: row.avatar as Buffer } : null;
}

// Devuelve la nueva versión (va en la URL de la foto).
export async function setAvatar(userId: number, mime: AvatarMime, data: Buffer): Promise<number> {
  await getPool().query(
    `INSERT INTO web_user_profiles (user_id, avatar, avatar_mime, avatar_version) VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE avatar = VALUES(avatar), avatar_mime = VALUES(avatar_mime), avatar_version = avatar_version + 1`,
    [userId, data, mime]
  );
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT avatar_version FROM web_user_profiles WHERE user_id = ?",
    [userId]
  );
  return Number(rows[0]?.avatar_version ?? 1);
}

export async function clearAvatar(userId: number) {
  await getPool().query("UPDATE web_user_profiles SET avatar = NULL, avatar_mime = NULL WHERE user_id = ?", [userId]);
}

export async function setSoundPrefs(userId: number, sounds: SoundPrefs) {
  const json = JSON.stringify(sounds);
  await getPool().query(
    `INSERT INTO web_user_profiles (user_id, preferences) VALUES (?, JSON_OBJECT('sounds', CAST(? AS JSON)))
     ON DUPLICATE KEY UPDATE preferences = JSON_SET(COALESCE(preferences, JSON_OBJECT()), '$.sounds', CAST(? AS JSON))`,
    [userId, json, json]
  );
}

// URL de la foto: lleva el usuario y la versión para que el caché del navegador
// no muestre la foto de otra persona ni una vieja.
export function avatarUrl(userId: number, version: number) {
  return version > 0 ? `/api/admin/perfil/avatar?u=${userId}&v=${version}` : null;
}

// "data:image/webp;base64,..." -> bytes, validando tipo, tamaño y firma del archivo.
export function parseAvatarDataUrl(value: unknown): { mime: AvatarMime; data: Buffer } | { error: string } {
  if (typeof value !== "string") return { error: "Mandá una imagen." };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return { error: "La foto tiene que ser JPG, PNG o WebP." };
  const mime = match[1] as AvatarMime;
  const data = Buffer.from(match[2], "base64");
  if (data.length === 0) return { error: "La imagen está vacía." };
  if (data.length > AVATAR_MAX_BYTES) return { error: "La imagen es muy pesada." };
  const isJpeg = data[0] === 0xff && data[1] === 0xd8;
  const isPng = data.subarray(0, 4).toString("hex") === "89504e47";
  const isWebp = data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  const ok = (mime === "image/jpeg" && isJpeg) || (mime === "image/png" && isPng) || (mime === "image/webp" && isWebp);
  return ok ? { mime, data } : { error: "El archivo no es una imagen válida." };
}
