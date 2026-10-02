// Cliente do contrato TRELLIS.2 (servidor FastAPI externo no Kaggle via ngrok).
// A senha nunca é persistida nem registrada em logs; vive apenas em memória.

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export interface Health {
  status: "ok";
  model_ready: boolean;
  model: string;
  detail?: string;
}
export interface Job {
  id: string;
  status: JobStatus;
  error?: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const RESOLUTION = 512;

export class ApiError extends Error {
  constructor(
    public kind: "auth" | "offline" | "too_large" | "invalid" | "rate_limit" | "not_found" | "server" | "config",
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export function normalizeBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new ApiError("config", "URL inválida.");
  }
  if (u.protocol !== "https:") throw new ApiError("config", "A URL precisa usar HTTPS.");
  if (u.username || u.password || u.search || u.hash)
    throw new ApiError("config", "A URL não pode conter credenciais, parâmetros ou âncora.");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

export function validateFile(f: File): string | null {
  if (!ACCEPTED_TYPES.includes(f.type)) return "Formato não suportado. Use PNG, JPEG ou WebP.";
  if (f.size > MAX_FILE_BYTES) return "Arquivo maior que 10 MB.";
  if (f.size === 0) return "Arquivo vazio.";
  return null;
}

export function parseSeed(s: string): number | null {
  if (!/^-?\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : null;
}

function errorFor(status: number, detail?: string): ApiError {
  const d = detail ? ` (${detail})` : "";
  switch (status) {
    case 401:
    case 403:
      return new ApiError("auth", "Senha da API recusada (401).", status);
    case 404:
      return new ApiError("not_found", "Recurso não encontrado — o servidor pode ter reiniciado e perdido a sessão.", status);
    case 413:
      return new ApiError("too_large", "Arquivo rejeitado pelo servidor: muito grande (413).", status);
    case 422:
      return new ApiError("invalid", `Dados rejeitados pelo servidor (422)${d}.`, status);
    case 429:
      return new ApiError("rate_limit", "Muitas requisições ou fila cheia (429). Aguarde e tente novamente.", status);
    default:
      return new ApiError("server", `Erro do servidor (${status})${d}.`, status);
  }
}

async function readDetail(res: Response): Promise<string | undefined> {
  try {
    const j = await res.clone().json();
    if (typeof j?.detail === "string") return j.detail.slice(0, 200);
  } catch {
    /* sem corpo JSON */
  }
  return undefined;
}

export interface Conn {
  baseUrl: string;
  token: string;
}

async function call(conn: Conn, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
  if (!conn.token) throw new ApiError("auth", "Informe a senha da API.");
  const base = normalizeBaseUrl(conn.baseUrl);
  const headers = new Headers(init.headers);
  headers.set("X-API-Token", conn.token);
  headers.set("ngrok-skip-browser-warning", "1");
  let res: Response;
  try {
    res = await fetchImpl(base + path, { ...init, headers, credentials: "omit", cache: "no-store" });
  } catch {
    throw new ApiError("offline", "Servidor inacessível (offline, túnel ngrok encerrado ou CORS bloqueado).");
  }
  if (!res.ok) throw errorFor(res.status, await readDetail(res));
  return res;
}

export async function getHealth(conn: Conn, f?: typeof fetch): Promise<Health> {
  const j = await (await call(conn, "/health", {}, f)).json();
  if (j?.status !== "ok" || typeof j?.model_ready !== "boolean")
    throw new ApiError("server", "Resposta de /health fora do contrato.");
  return j as Health;
}

export async function createJob(conn: Conn, file: File, seed: number, f?: typeof fetch): Promise<Job> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("seed", String(seed));
  const res = await call(conn, "/jobs", { method: "POST", body: fd }, f);
  const j = await res.json();
  if (res.status !== 202 || typeof j?.id !== "string") throw new ApiError("server", "Resposta de /jobs fora do contrato.");
  return j as Job;
}

export async function getJob(conn: Conn, id: string, f?: typeof fetch): Promise<Job> {
  const j = await (await call(conn, `/jobs/${encodeURIComponent(id)}`, {}, f)).json();
  if (!["queued", "running", "succeeded", "failed"].includes(j?.status))
    throw new ApiError("server", "Status de job fora do contrato.");
  return j as Job;
}

export async function getResult(conn: Conn, id: string, f?: typeof fetch): Promise<Blob> {
  const res = await call(conn, `/jobs/${encodeURIComponent(id)}/result`, {}, f);
  const blob = await res.blob();
  return new Blob([blob], { type: "model/gltf-binary" });
}

// sessionStorage: somente URL e job id. Nunca a senha.
const SS_KEY = "magna-mesh-lab";
export function loadSession(): { baseUrl?: string; jobId?: string } {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    const j = raw ? JSON.parse(raw) : {};
    return { baseUrl: typeof j.baseUrl === "string" ? j.baseUrl : undefined, jobId: typeof j.jobId === "string" ? j.jobId : undefined };
  } catch {
    return {};
  }
}
export function saveSession(s: { baseUrl?: string; jobId?: string }) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ baseUrl: s.baseUrl, jobId: s.jobId }));
  } catch {
    /* ignore */
  }
}
