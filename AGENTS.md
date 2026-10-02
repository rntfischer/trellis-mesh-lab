<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Browser calls the user's external TRELLIS.2 FastAPI (ngrok) directly via `src/lib/mesh-api.ts`; no server proxy — avoids an open proxy.
- API password lives only in React state; sessionStorage holds only base URL and job id — never persist secrets.
- GLB results are fetched with auth headers and shown via object URLs that are revoked on change — the result endpoint is authenticated.
- three.js is dynamically imported inside the viewer — keeps it out of SSR.
