import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveDeploymentEnvironment,
  resolveRustWebSocketUrl,
} from "../src/net/deploymentEnvironment.ts";

const local = (options = {}) => ({
  mode: "development",
  pageUrl: "http://localhost:5174/",
  ...options,
});

test("local Vite development uses a local Rust socket, including LAN devices", () => {
  assert.equal(resolveRustWebSocketUrl(local()), "ws://localhost:9001/");
  assert.equal(resolveRustWebSocketUrl(local({ pageUrl: "http://192.168.1.20:5174/" })),
    "ws://192.168.1.20:9001/");
});

test("production uses secure live API only on the intended play domain", () => {
  const production = { mode: "production", pageUrl: "https://play.avensky.com/" };
  assert.equal(resolveRustWebSocketUrl(production), "wss://api.avensky.com/ws/");
  assert.equal(resolveRustWebSocketUrl({ ...production, configuredUrl: "wss://api.avensky.com/ws/" }),
    "wss://api.avensky.com/ws/");
  assert.throws(() => resolveRustWebSocketUrl({ ...production, pageUrl: "http://localhost:4173/" }),
    /Production multiplayer only connects/);
  assert.throws(() => resolveRustWebSocketUrl({ ...production, pageUrl: "https://staging.avensky.com/" }),
    /Production multiplayer only connects/);
  assert.throws(() => resolveRustWebSocketUrl({ ...production, configuredUrl: "wss://api-staging.avensky.com/ws/" }),
    /must connect to api.avensky.com/);
});

test("staging and test must configure their own socket", () => {
  assert.throws(() => resolveRustWebSocketUrl({ mode: "staging", pageUrl: "https://staging.avensky.com/" }),
    /VITE_RUST_WS_URL is required/);
  assert.throws(() => resolveRustWebSocketUrl({ mode: "test", pageUrl: "http://localhost:4173/" }),
    /VITE_RUST_WS_URL is required/);
  assert.equal(resolveRustWebSocketUrl({
    mode: "staging",
    pageUrl: "https://staging.avensky.com/",
    configuredUrl: "wss://api-staging.avensky.com/ws/",
  }), "wss://api-staging.avensky.com/ws/");
});

test("testing, staging, and local dev cannot silently access production data", () => {
  for (const mode of ["development", "staging", "test"]) {
    assert.throws(() => resolveRustWebSocketUrl({
      mode, pageUrl: "http://localhost:5174/",
      configuredUrl: "wss://api.avensky.com/ws/",
    }), /cannot connect to the live multiplayer endpoint/);
  }
});

test("HTTPS pages cannot use unencrypted WebSockets", () => {
  assert.throws(() => resolveRustWebSocketUrl({
    mode: "staging", pageUrl: "https://staging.avensky.com/",
    configuredUrl: "ws://api-staging.avensky.com/ws/",
  }), /secure wss:\/\//);
  assert.throws(() => resolveRustWebSocketUrl({
    mode: "production", pageUrl: "https://play.avensky.com/",
    configuredUrl: "ws://api.avensky.com/ws/",
  }), /wss:\/\//);
});

test("invalid and unsafe socket URLs are rejected", () => {
  for (const configuredUrl of [
    "https://api-staging.avensky.com/ws/",
    "wss://user:password@api-staging.avensky.com/ws/",
    "wss://api-staging.avensky.com/ws/?token=abc",
    "not a url",
  ]) {
    assert.throws(() => resolveRustWebSocketUrl({
      mode: "staging", pageUrl: "https://staging.avensky.com/",
      configuredUrl,
    }));
  }
});

test("deployment mode is explicit; no typos or mismatched builds fall back to live", () => {
  assert.equal(resolveDeploymentEnvironment("production", "production"), "production");
  assert.throws(() => resolveDeploymentEnvironment("staging", "production"), /conflicts/);
  assert.throws(() => resolveDeploymentEnvironment("stagng"), /Unknown Avensky deployment/);
});
