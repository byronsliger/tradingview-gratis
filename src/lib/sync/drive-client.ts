"use client";

import type { DriveSyncDocument } from "./types";

/**
 * Cliente mínimo de la API REST de Google Drive sobre `appDataFolder`:
 * una carpeta oculta y privada de la app dentro del Drive del usuario,
 * por lo que no necesitamos base de datos propia ni vemos sus archivos.
 */

const FILE_NAME = "tv-gratis-state.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

/** El token expiró o fue revocado: hay que volver a autenticar. */
export class DriveAuthError extends Error {}
/** El archivo referenciado ya no existe en Drive (fue borrado). */
export class DriveNotFoundError extends Error {}

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new DriveAuthError("Token de Google rechazado (401)");
  if (res.status === 404) throw new DriveNotFoundError("Archivo no encontrado en Drive");
  if (!res.ok) {
    throw new Error(`Error de Google Drive (${res.status}): ${await res.text()}`);
  }
  return res;
}

export async function findStateFileId(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });
  const res = await driveFetch(token, `${DRIVE_API}/files?${params.toString()}`);
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function downloadStateDocument(
  token: string,
  fileId: string,
): Promise<DriveSyncDocument | null> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  try {
    const doc = (await res.json()) as DriveSyncDocument;
    return doc && typeof doc.updatedAt === "number" && doc.state ? doc : null;
  } catch {
    // Archivo corrupto: se tratará como si no existiera y se sobrescribirá
    return null;
  }
}

/** Sube el documento. Con `fileId` actualiza; sin él crea el archivo y devuelve su id. */
export async function uploadStateDocument(
  token: string,
  fileId: string | null,
  doc: DriveSyncDocument,
): Promise<string> {
  const body = JSON.stringify(doc);
  if (fileId) {
    await driveFetch(token, `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return fileId;
  }
  const boundary = `tvgratis-${Date.now()}`;
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${body}\r\n--${boundary}--`;
  const res = await driveFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}
