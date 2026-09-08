import { env } from "cloudflare:workers";
export async function putFile(key: string, bytes: ArrayBuffer) { await env.FILES.put(key, bytes); }
export async function getFile(key: string) { const object = await env.FILES.get(key); return object ? object.arrayBuffer() : null; }
export async function deleteFile(key: string) { await env.FILES.delete(key); }
