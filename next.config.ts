import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /*
   * A self-contained server for the Docker image (healthspec.md §3): only the
   * files the app actually imports, so the image stays small and the 1 GB
   * box never has to run a build.
   */
  output: "standalone",

  images: { unoptimized: true },

  /*
   * Both users test on a phone over the LAN, and the dev server blocks
   * cross-origin requests to /_next/* by default — which silently stops the
   * client bundle from loading, so the page renders but never hydrates.
   * A single `*` matches one hostname label, so this covers the whole
   * 192.168.1.x subnet and survives a DHCP reassignment.
   */
  allowedDevOrigins: ["192.168.1.*", "192.168.0.*", "10.0.0.*", "*.local"],

  // Without this Turbopack walks up to the home directory looking for a lockfile.
  turbopack: { root: projectRoot },
};

export default nextConfig;
