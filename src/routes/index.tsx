import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ApiError, RESOLUTION, ACCEPTED_TYPES, createJob, getHealth, getJob, getResult,
  loadSession, normalizeBaseUrl, parseSeed, saveSession, validateFile,
  type Conn, type Health, type Job,
} from "@/lib/mesh-api";

const MeshViewer = lazy(() => import("@/components/MeshViewer").then((m) => ({ default: m.MeshViewer })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Magna Mesh Lab — Imagem para malha 3D TRELLIS.2" },
      { name: "description", content: "Laboratório para testar a geração de malhas 3D GLB a partir de imagens com TRELLIS.2." },
      { property: "og:title", content: "Magna Mesh Lab — TRELLIS.2" },
      { property: "og:description", content: "Envie uma imagem, gere uma malha 3D e visualize o GLB." },
    ],
  }),
  component: Lab,
});

type ConnState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Na fila",
  running: "Processando",
  succeeded: "Concluído",
  failed: "Falha",
};

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : "Erro inesperado.";
}

function Lab() {
  const [dark, setDark] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState(""); // somente memória
  const [conn, setConn] = useState<ConnState>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [seedText, setSeedText] = useState("0");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [resultErr, setResultErr] = useState<string | null>(null);
  const glbRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const s = loadSession();
    if (s.baseUrl) setBaseUrl(s.baseUrl);
    if (s.jobId) setJobId(s.jobId);
  }, []);

  useEffect(() => {
    saveSession({ baseUrl: baseUrl || undefined, jobId: jobId ?? undefined });
  }, [baseUrl, jobId]);

  // Revoga object URLs ao trocar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const setGlb = (u: string | null) => {
    if (glbRef.current) URL.revokeObjectURL(glbRef.current);
    glbRef.current = u;
    setGlbUrl(u);
  };
  useEffect(() => () => { if (glbRef.current) URL.revokeObjectURL(glbRef.current); }, []);

  const c: Conn = { baseUrl, token };
  const hasCreds = !!token && !!baseUrl;

  // Qualquer mudança de credencial invalida o teste anterior.
  useEffect(() => { setConn({ kind: "idle" }); }, [baseUrl, token]);

  async function testConnection() {
    setConn({ kind: "testing" });
    try {
      normalizeBaseUrl(baseUrl);
      setConn({ kind: "ok", health: await getHealth(c) });
    } catch (e) {
      setConn({ kind: "error", message: errMsg(e) });
    }
  }

  const jobQ = useQuery({
    queryKey: ["job", baseUrl, jobId, !!token],
    queryFn: () => getJob(c, jobId!),
    enabled: !!jobId && hasCreds,
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (q.state.error) return false;
      return d && (d.status === "succeeded" || d.status === "failed") ? false : 3000;
    },
  });
  const job = jobQ.data?.id === jobId ? jobQ.data : undefined;

  // Busca GLB autenticado quando concluído — no máximo uma vez por job id.
  const fetchedJobRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.status !== "succeeded" || !hasCreds) return;
    if (fetchedJobRef.current === job.id) return;
    fetchedJobRef.current = job.id;
    let cancel = false;
    setResultErr(null);
    getResult(c, job.id)
      .then((b) => { if (!cancel) setGlb(URL.createObjectURL(b)); })
      .catch((e) => {
        if (!cancel) {
          fetchedJobRef.current = null; // permite nova tentativa manual
          setResultErr(errMsg(e));
        }
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, hasCreds]);

  function onFile(f: File | undefined) {
    setFile(null);
    setPreview(null);
    if (!f) return setFileErr(null);
    const err = validateFile(f);
    setFileErr(err);
    if (!err) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }

  const seed = parseSeed(seedText);
  const modelReady = conn.kind === "ok" && conn.health.model_ready;
  const busy = !!job && (job.status === "queued" || job.status === "running");
  const canGenerate = modelReady && !!file && seed !== null && !submitting && !busy;

  async function generate() {
    if (!canGenerate || !file || seed === null) return;
    setSubmitting(true);
    setSubmitErr(null);
    setGlb(null);
    setResultErr(null);
    fetchedJobRef.current = null;
    try {
      const j = await createJob(c, file, seed); // nunca repetido automaticamente
      setJobId(j.id);
    } catch (e) {
      setSubmitErr(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  }

  function clearJob() {
    setJobId(null);
    setGlb(null);
    setResultErr(null);
    fetchedJobRef.current = null;
  }

  const pollErr = jobQ.error ? errMsg(jobQ.error) : null;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">Magna · Laboratório</p>
            <h1 className="text-3xl font-bold sm:text-4xl">Magna Mesh Lab</h1>
            <p className="text-sm text-muted-foreground">Imagem → malha 3D com TRELLIS.2 (servidor Kaggle via ngrok)</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDark((d) => !d)}>
            {dark ? "Tema claro" : "Tema escuro"}
          </Button>
        </header>

        {/* Configuração */}
        <Collapsible defaultOpen className="airbrush-panel group p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Conexão</h2>
              <ConnBadge state={conn} />
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <span className="group-data-[state=open]:hidden">Configurar</span>
                <span className="group-data-[state=closed]:hidden">Recolher</span>
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-4 space-y-4">
            <form
              className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
              onSubmit={(e) => { e.preventDefault(); testConnection(); }}
              autoComplete="off"
            >
              <div className="space-y-1.5">
                <Label htmlFor="url">URL HTTPS do ngrok</Label>
                <Input id="url" type="url" inputMode="url" placeholder="https://xxxx.ngrok-free.app"
                  value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="token">Senha da API</Label>
                <Input id="token" type="password" autoComplete="off" value={token}
                  onChange={(e) => setToken(e.target.value)} placeholder="Somente em memória" />
              </div>
              <Button type="submit" disabled={!baseUrl || !token || conn.kind === "testing"}>
                {conn.kind === "testing" ? "Testando…" : "Testar conexão"}
              </Button>
            </form>
            {conn.kind === "error" && <p className="text-sm text-destructive">{conn.message}</p>}
            {conn.kind === "ok" && (
              <p className="text-sm text-muted-foreground">
                Modelo <strong className="text-foreground">{conn.health.model}</strong> —{" "}
                {conn.health.model_ready ? "pronto." : "ainda carregando. Teste novamente em instantes."}
                {conn.health.detail && <> {conn.health.detail}</>}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A senha nunca é salva; ao recarregar a página será preciso digitá-la de novo.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Entrada */}
          <section className="airbrush-panel space-y-5 p-5">
            <h2 className="text-lg font-semibold">Imagem de entrada</h2>
            <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary">
              {preview ? (
                <img src={preview} alt="Pré-visualização" className="h-full w-full object-contain" />
              ) : (
                <span className="px-6 text-center text-sm text-muted-foreground">
                  Clique para escolher PNG, JPEG ou WebP (até 10 MB)
                </span>
              )}
              <input type="file" className="sr-only" accept={ACCEPTED_TYPES.join(",")}
                onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {file && <p className="truncate text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
            {fileErr && <p className="text-sm text-destructive">{fileErr}</p>}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="seed">Seed</Label>
                <Input id="seed" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
                {seed === null && <p className="text-xs text-destructive">Inteiro ≥ 0</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Resolução</Label>
                <Input value={RESOLUTION} readOnly disabled />
              </div>
            </div>

            <Button className="w-full" size="lg" disabled={!canGenerate} onClick={generate}>
              {submitting ? "Enviando…" : busy ? "Aguardando servidor…" : "Gerar malha"}
            </Button>
            {!modelReady && <p className="text-xs text-muted-foreground">Teste a conexão com o modelo pronto para liberar a geração.</p>}
            {submitErr && <p className="text-sm text-destructive">{submitErr}</p>}
          </section>

          {/* Resultado */}
          <section className="airbrush-panel flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Resultado</h2>
                {job && <StatusBadge status={job.status} />}
              </div>
              {jobId && <span className="font-mono text-xs text-muted-foreground">job {jobId}</span>}
            </div>

            <div className="relative min-h-[360px] flex-1 lg:min-h-[480px]">
              {glbUrl ? (
                <ClientOnly fallback={null}>
                  <Suspense fallback={<Center>Carregando visualizador…</Center>}>
                    <MeshViewer url={glbUrl} />
                  </Suspense>
                </ClientOnly>
              ) : (
                <Center>
                  {!jobId && "Nenhuma malha gerada ainda."}
                  {jobId && !token && "Há um job salvo desta sessão. Informe a senha da API para consultá-lo."}
                  {jobId && token && !job && !pollErr && "Consultando status…"}
                  {job?.status === "queued" && "Job na fila do servidor."}
                  {job?.status === "running" && "O servidor está processando a malha."}
                  {job?.status === "failed" && <span className="text-destructive">Falha: {job.error ?? "sem detalhes do servidor."}</span>}
                  {job?.status === "succeeded" && !resultErr && "Baixando GLB…"}
                </Center>
              )}
            </div>

            {pollErr && (
              <p className="text-sm text-destructive">
                {pollErr} <button className="underline" onClick={() => jobQ.refetch()}>Consultar novamente</button>
              </p>
            )}
            {resultErr && <p className="text-sm text-destructive">{resultErr}</p>}

            <div className="flex flex-wrap gap-2">
              {glbUrl && (
                <Button asChild>
                  <a href={glbUrl} download={`magna-mesh-${jobId}.glb`}>Baixar GLB</a>
                </Button>
              )}
              {jobId && !busy && <Button variant="outline" onClick={clearJob}>Limpar resultado</Button>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="viewer-surface absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <div>{children}</div>
    </div>
  );
}

function ConnBadge({ state }: { state: ConnState }) {
  if (state.kind === "ok")
    return state.health.model_ready
      ? <Badge className="bg-success text-primary-foreground">Conectado · pronto</Badge>
      : <Badge className="bg-warning text-primary-foreground">Conectado · carregando</Badge>;
  if (state.kind === "error") return <Badge variant="destructive">Falha</Badge>;
  if (state.kind === "testing") return <Badge variant="secondary">Testando…</Badge>;
  return <Badge variant="outline">Desconectado</Badge>;
}

function StatusBadge({ status }: { status: Job["status"] }) {
  const cls =
    status === "succeeded" ? "bg-success text-primary-foreground"
    : status === "failed" ? "bg-destructive text-destructive-foreground"
    : status === "running" ? "bg-primary text-primary-foreground animate-pulse"
    : "bg-secondary text-secondary-foreground";
  return <Badge className={cls}>{STATUS_LABEL[status]}</Badge>;
}
