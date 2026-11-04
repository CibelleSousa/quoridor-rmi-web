import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Quoridor Distribuído | RMI sobre HTTP",
    description:
        "Versão distribuída do jogo Quoridor para 4 jogadores, implementada com Invocação de Métodos Remotos (RMI/RPC) sobre HTTP Request/Reply. Trabalho de Sistemas Distribuídos - UESC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="pt-BR">
            <body>{children}</body>
        </html>
    );
}
