import { describe, it, expect, vi } from "vitest";
import { normalizeBaseUrl, validateFile, parseSeed, getHealth, createJob, getJob, ApiError, saveSession, loadSession } from "./mesh-api";

const conn = { baseUrl: "https://abc.ngrok-free.app/", token: "s3cret" };

describe("mesh-api", () => {
  it("exige HTTPS", () => {
    expect(() => normalizeBaseUrl("http://x.ngrok.app")).toThrow(ApiError);
    expect(normalizeBaseUrl("https://x.ngrok.app//")).toBe("https://x.ngrok.app");
  });
  it("valida arquivo", () => {
    expect(validateFile(new File(["a"], "a.gif", { type: "image/gif" }))).toMatch(/Formato/);
    expect(validateFile(new File(["a"], "a.png", { type: "image/png" }))).toBeNull();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "b.png", { type: "image/png" });
    expect(validateFile(big)).toMatch(/10 MB/);
  });
  it("seed inteiro", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("4.2")).toBeNull();
    expect(parseSeed("-1")).toBeNull();
  });
  it("envia cabeçalhos obrigatórios", async () => {
    const f = vi.fn(async () => Response.json({ status: "ok", model_ready: true, model: "TRELLIS.2" }));
    const h = await getHealth(conn, f as unknown as typeof fetch);
    expect(h.model_ready).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abc.ngrok-free.app/health");
    const hd = new Headers(init.headers);
    expect(hd.get("X-API-Token")).toBe("s3cret");
    expect(hd.get("ngrok-skip-browser-warning")).toBe("1");
  });
  it("mapeia 401, 413, 429 e offline", async () => {
    for (const [s, k] of [[401, "auth"], [413, "too_large"], [422, "invalid"], [429, "rate_limit"]] as const) {
      const f = vi.fn(async () => new Response("{}", { status: s }));
      await expect(getJob(conn, "1", f as unknown as typeof fetch)).rejects.toMatchObject({ kind: k });
    }
    const off = vi.fn(async () => { throw new TypeError("fail"); });
    await expect(getHealth(conn, off as unknown as typeof fetch)).rejects.toMatchObject({ kind: "offline" });
  });
  it("POST /jobs envia multipart e exige 202", async () => {
    const f = vi.fn(async () => Response.json({ id: "j1", status: "queued" }, { status: 202 }));
    const job = await createJob(conn, new File(["a"], "a.png", { type: "image/png" }), 7, f as unknown as typeof fetch);
    expect(job.id).toBe("j1");
    const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get("seed")).toBe("7");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sessionStorage nunca guarda senha", () => {
    saveSession({ baseUrl: "https://x", jobId: "j", token: "s" } as never);
    expect(sessionStorage.getItem("magna-mesh-lab")).not.toContain("s\"");
    expect(loadSession()).toEqual({ baseUrl: "https://x", jobId: "j" });
  });
});
