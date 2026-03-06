/**
 * Mespack server: connects to MQTT broker and streams messages to clients over WebSocket.
 * Run this on a machine that can reach the MQTT broker; clients connect to this server
 * so they work from any IP (no direct broker access or CORS needed).
 */

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config (env with defaults for local dev) ───────────────────────────────────
const PORT = Number(process.env.PORT) || 5012;
const MQTT_HOST = process.env.MQTT_HOST || "10.156.116.176";
const MQTT_PORT = Number(process.env.MQTT_PORT) || 1883;
const MQTT_TOPIC = process.env.MQTT_TOPIC || "Unilever_Ph_Nutrition/Dressings_Halal/Filling_Flexibles/DFOS/Dressings DFOS Params";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "foodsbroker";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "Engineering@2024";
const SERVE_CLIENT = process.env.SERVE_CLIENT === "true" || process.env.SERVE_CLIENT === "1";

const mqttUrl = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;

// ── Express + HTTP server ──────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const httpServer = createServer(app);

// ── WebSocket: broadcast MQTT messages to all connected clients ────────────────
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const clients = new Set();

function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === 1) {
      try {
        ws.send(payload);
      } catch (e) {
        console.error("[WS] send error:", e.message);
      }
    }
  });
}

wss.on("connection", (ws, req) => {
  clients.add(ws);
  console.log("[WS] client connected, total:", clients.size);

  ws.on("close", () => {
    clients.delete(ws);
    console.log("[WS] client disconnected, total:", clients.size);
  });

  ws.on("error", (err) => {
    clients.delete(ws);
    console.error("[WS] client error:", err.message);
  });

  // Optional: send current connection status
  ws.send(JSON.stringify({ type: "status", status: mqttClient?.connected ? "connected" : "disconnected" }));
});

// ── MQTT client (server-side, TCP – no CORS) ────────────────────────────────────
let mqttClient = null;

function connectMqtt() {
  if (mqttClient) return;

  console.log("[MQTT] connecting to", mqttUrl, "topic:", MQTT_TOPIC);
  mqttClient = mqtt.connect(mqttUrl, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });

  mqttClient.on("connect", () => {
    console.log("[MQTT] connected");
    mqttClient.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
      if (err) console.error("[MQTT] subscribe error:", err);
      else console.log("[MQTT] subscribed to", MQTT_TOPIC);
    });
    broadcast({ type: "status", status: "connected" });
  });

  mqttClient.on("message", (topic, payload) => {
    try {
      const raw = payload.toString();
      const data = JSON.parse(raw);
      broadcast({ type: "message", topic, data });
    } catch (e) {
      console.error("[MQTT] parse error:", e.message);
    }
  });

  mqttClient.on("error", (err) => {
    console.error("[MQTT] error:", err.message);
    broadcast({ type: "status", status: "error" });
  });

  mqttClient.on("offline", () => {
    console.log("[MQTT] offline");
    broadcast({ type: "status", status: "disconnected" });
  });

  mqttClient.on("reconnect", () => {
    broadcast({ type: "status", status: "connecting" });
  });

  mqttClient.on("close", () => {
    broadcast({ type: "status", status: "disconnected" });
  });
}

// ── HTTP routes ─────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mqtt: mqttClient ? (mqttClient.connected ? "connected" : "disconnected") : "not started",
    wsClients: clients.size,
  });
});

// Optional: serve built React client (same origin = no CORS for WS)
if (SERVE_CLIENT) {
  const clientDist = path.join(__dirname, "../../mespack-client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("[Server] listening on http://0.0.0.0:" + PORT);
  console.log("[Server] WebSocket path: ws://<this-host>:" + PORT + "/ws");
  if (SERVE_CLIENT) console.log("[Server] serving client from mespack-client/dist");
  connectMqtt();
});
