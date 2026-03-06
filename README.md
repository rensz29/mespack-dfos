# Mespack Dashboard

Dashboard for Mespack Filler with live MQTT data. The **server** holds the MQTT connection; **clients** connect to the server over WebSocket so the app works from any computer (no direct broker access or CORS issues).

## Architecture

- **mespack-server**: Connects to the MQTT broker (TCP) and streams messages to browsers over WebSocket. Run on a machine that can reach the broker.
- **mespack-client**: React dashboard; connects to the server via WebSocket (same host in production, or proxied in dev).

## Quick start

### 1. Install and run the server (required for live data)

```bash
cd mespack-server
npm install
npm run dev
```

Server runs at `http://0.0.0.0:5012` and WebSocket at `ws://<host>:5012/ws`. It connects to MQTT using env (see below).

### 2. Run the client

**Development (client and server on same machine):**

```bash
cd mespack-client
npm install
npm run dev
```

Open `http://<this-machine-ip>:5011`. The client proxies `/ws` to the server (5012), so any device that can reach this machine on 5011 will get live data.

**Production (one port, server serves client):**

```bash
cd mespack-client && npm run build
cd ../mespack-server
SERVE_CLIENT=true npm start
```

Open `http://<server-ip>:5012`. The server serves the built React app and the WebSocket on the same port.

## Server environment variables

| Variable        | Default (example) | Description                    |
|----------------|-------------------|--------------------------------|
| `PORT`         | `5012`            | HTTP + WebSocket port          |
| `MQTT_HOST`    | `10.156.116.176`  | MQTT broker host               |
| `MQTT_PORT`    | `1883`            | MQTT broker TCP port           |
| `MQTT_TOPIC`   | (see server code) | Topic to subscribe to          |
| `MQTT_USERNAME`| `foodsbroker`     | Broker username                |
| `MQTT_PASSWORD`| (your password)   | Broker password                |
| `SERVE_CLIENT` | `false`           | Set `true` to serve client build |

Create a `.env` in `mespack-server` (or export vars) for production. Do not commit credentials.

## Client environment (optional)

- **`VITE_WS_URL`**: Override WebSocket URL (e.g. `http://your-server:5012` or `ws://your-server:5012/ws`) when the client is not served by the same host (e.g. static hosting elsewhere). If unset, the client uses same host + `/ws`.

## Ports

- **5011** – Vite dev server (client only, dev)
- **5012** – Mespack server (HTTP + WebSocket; optionally serves client when `SERVE_CLIENT=true`)
