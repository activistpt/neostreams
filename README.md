# NeoStreams — Live TV, Desporto, Filmes e Séries

Clone completo do **NeoStreams** (`neostreams.pages.dev`) preparado para:
1. **GitHub Pages** (alojamento estático com listas M3U/IPTV-Org e proxies públicos integrados)
2. **Render** (Web Service Node.js gratuito com proxy CORS/HLS próprio em `/proxy` e `/proxy/m3u8`, `/api/health`, `/api/auth` e `/api/playlists`)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/activistpt/neostreams)

## Funcionalidades
- Player multi-formato (**HLS.js**, **mpegts.js**, **DASH.js** e HTML5 `<video>`)
- Failover automático entre ligação direta, proxy local (`/proxy` e `/proxy/m3u8`) e proxies públicos
- Suporte para listas **M3U / M3U8**, **API Xtream Codes** (Ao Vivo, Filmes VOD e Séries com temporadas/episódios) e catálogo mundial **IPTV-Org**
- Lista **NEO Sports & TV PT** pré-configurada em `playlists/custom-pt.m3u`

## Credenciais da Área de Membros (por omissão)
- **Utilizador:** `ptlegion` (ou `admin`)
- **Password:** `neostreams`
*(No Render podes alterar através das variáveis de ambiente `ADMIN_USER` e `ADMIN_PASS`)*

## Correr localmente no PC
```bash
cd C:/Users/ptleg/Documents/neostreams
node server.js
```
Abre `http://localhost:3000`.

## Hospedar no Render (Blueprint `render.yaml`)
1. Acede a: **https://render.com/deploy?repo=https://github.com/activistpt/neostreams** (ou no painel do Render → **New +** → **Blueprint** e seleciona o repositório `activistpt/neostreams`).
2. O ficheiro `render.yaml` configura automaticamente o plano `free`, o health check em `/api/health` e o servidor Node.js.
3. Clica em **Apply** para publicar.
