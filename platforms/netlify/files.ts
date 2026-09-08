import { getStore } from "@netlify/blobs";
// Site-wide store survives deployments. Bytes are served only by the private
// API after looking up attachment metadata and validating the session.
const store = () => getStore({ name: "pacific-tech-attachments", consistency: "strong" });
export async function putFile(key: string, bytes: ArrayBuffer) { await store().set(key, bytes); }
export async function getFile(key: string) { return store().get(key, { type: "arrayBuffer" }); }
export async function deleteFile(key: string) { await store().delete(key); }
