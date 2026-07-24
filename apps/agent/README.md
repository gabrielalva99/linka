# LINKA — Agente Android

App nativo (Kotlin) que roda nos aparelhos de demonstração: mostra conteúdo, coleta
telemetria, obedece comandos e se protege (kiosk). Este diretório recebe o projeto
Android (a ser criado no Android Studio).

## Estado atual
- **Backend do agente pronto e testado** (Edge Functions em `supabase/functions/`):
  `agent-provision` e `agent-heartbeat`. O loop foi validado via curl (device fica online).
- **App Android**: a criar. Alvo do **Marco 1 (esqueleto)**: parear + heartbeat + tela simples.

## Contrato de API (o que o app chama)

Base: `https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1`
Header comum: `apikey: <SUPABASE_ANON_KEY>` · `Content-Type: application/json`

### 1) Pareamento — `POST /agent-provision`
Chamado **uma vez**, quando o promotor informa o código de pareamento (gerado no painel ao
registrar o aparelho, ex.: `6352FD29`).

```json
// request
{ "provisioning_code": "6352FD29", "serial": "<android_id>", "os_version": "14",
  "agent_version": "0.1.0", "platform": "android" }
// response 200
{ "device_id": "<uuid>", "device_token": "<64 hex>" }
// erros: 404 code_not_found · 400 missing_code
```
Guardar o `device_token` localmente (ex.: EncryptedSharedPreferences).

### 2) Heartbeat — `POST /agent-heartbeat`
Chamado periodicamente (alvo: a cada 60s). Autentica com o token.

```json
// header: Authorization: Bearer <device_token>   (ou campo device_token no corpo)
{ "status": "online", "mode": "show", "battery_level": 77, "battery_charging": true,
  "os_version": "14", "agent_version": "0.1.0" }
// response 200: { "ok": true }
// erros: 401 invalid_token / missing_token
```
Campos aceitos: `status` (provisioning|online|degraded|offline), `mode`
(not_running|main_menu|show|protection|sleep|alarm), `battery_level` (0–100),
`battery_charging`, `os_version`, `agent_version`, `synced`, `app_updated`.

## Roadmap do agente (por marcos)
1. **Esqueleto** (atual): tela de pareamento (campo do código) → provision → loop de heartbeat
   com bateria/versão; manter-se em primeiro plano (foreground service).
2. **Player**: baixar e tocar conteúdo (vídeo) em loop; pré-download offline.
3. **Kiosk**: virar launcher + lock task; bloquear desligar Wi-Fi (device owner quando possível).
4. **Telemetria**: sessões de interação, toques, tempo de tela (fila local + envio em lote).
5. **Comandos + auto-update**: receber comandos (sync/reboot/screenshot) e atualizar o APK.

Referência de comportamento esperado: `docs/REFERENCIA-PRODUCT-ME.md` (Device Settings, modos).
Aparelho de desenvolvimento: **Edge 30 Ultra**. Homologação de desempenho: Moto G06/G15.
