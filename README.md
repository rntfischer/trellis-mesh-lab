# Trellis Mesh Lab

Crie NOVO projeto independente Magna Mesh Lab, laboratório de teste imagem para malha 3D TRELLIS.2 via Kaggle/ngrok. Stack: React 19, TypeScript, TanStack Start/Router, React Query, Tailwind e shadcn/Radix, compatível com Print Price Pro. Não conectar GitHub nem acessar/modificar projetos ou Supabase existentes. Sem banco e sem recursos pagos. Interface pt-BR Airbrushed Teal escuro/claro, uma página responsiva: configuração recolhível com URL HTTPS ngrok e senha API (type=password, só em memória, nunca logs/URL/localStorage); testar conexão; upload PNG/JPEG/WebP até 10 MB com preview; seed inteiro e resolução fixa 512; gerar malha; status fila/processando/concluído/falha; visualizador GLB real com controles orbitais e download. Sem resultados falsos/progresso inventado. Contrato: todas chamadas enviam X-API-Token e ngrok-skip-browser-warning: 1. GET /health -> {status:"ok",model_ready:boolean,model:"TRELLIS.2",detail?:string}. POST /jobs multipart file,seed -> 202 {id,status:"queued"}. GET /jobs/{id} polling 3s -> {id,status:"queued"|"running"|"succeeded"|"failed",error?:string}. GET /jobs/{id}/result -> GLB binário autenticado. Usar fetch autenticado + Blob/objectURL no visualizador/download, revogar ao trocar. Tratar 401/offline/413/422/429 e sessão perdida. Gerar desabilitado até health.model_ready e arquivo válido; nunca retry automático do POST. Guardar somente URL e job id em sessionStorage, senha só em memória; após recarga pedir senha para consultar. Servidor FastAPI externo será preparado por mim no Kaggle: não inventar endpoint ativo, mostrar desconectado corretamente. Não criar proxy aberto. Implementar testes e verificar build. Crie agora o projeto e interface real para esse contrato.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/14baeb37-a5fe-44bb-b1eb-7c7ce0dba9c4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
