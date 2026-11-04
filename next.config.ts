import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactCompiler: true,
    // Evita que o Next gere AGENTS.md / CLAUDE.md na pasta do projeto a cada execução,
    // mantendo o pacote de entrega limpo.
    agentRules: false,
};

export default nextConfig;
