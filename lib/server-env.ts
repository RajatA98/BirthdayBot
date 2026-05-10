import { loadEnvConfig } from "@next/env";

let envLoaded = false;

export function getServerEnv(name: string) {
  loadServerEnv();
  return process.env[name];
}

export function loadServerEnv() {
  if (envLoaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  envLoaded = true;
}
