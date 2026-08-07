import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Resume parsing runs these in the Node runtime, not through webpack.
   * `pdfjs-dist` (pulled in by `pdf-parse`) ships a pre-built bundle that
   * declares its own top-level `__webpack_exports__`, which shadows the
   * binding Next injects and throws on import. `mammoth` is CJS doing `fs`
   * work. Neither is in Next's built-in externals list. */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
};

export default nextConfig;
