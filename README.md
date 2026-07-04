# Robô de Marmitex

Protótipo de um **robô de vendas de marmitex para WhatsApp** + painel do dono, feito para ser comercializado como SaaS multi-restaurante.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Painel do dono + simulação do WhatsApp. Robô que atende, monta pedido, calcula entrega por zona no mapa, sinaliza atendimento humano, etc. Single-file (HTML + CSS + JS vanilla). |
| `criador.html` | Painel do criador do robô (eu): login, lista de restaurantes usando o robô e controle de acesso (liberar/bloquear). |

## Como rodar (localmente)

Serve a pasta com qualquer servidor estático. Ex.:

```bash
npx live-server . --port=3457
```

Depois abra `http://localhost:3457/` (painel do dono) ou `http://localhost:3457/criador.html`.

No Claude Code, o `.claude/launch.json` já configura o preview automático.

## Estado

- **Fase 1 (atual):** protótipo visual/funcional completo, tudo em `localStorage` (faz-de-conta de banco).
  - Atendimento por linguagem natural (parser heurístico), pedidos, pagamento (Pix/Dinheiro/Cartão), aba Pedidos com botão do motoboy.
  - **Mapas:** malha de trabalho (área de cobertura do motoboy) + malhas de taxa por região (Leaflet + OpenStreetMap), com geocodificação enviesada pela cidade da loja.
  - Sinalização de atendimento humano + log de conversas exportável (.json).
- **Fase 2 (não iniciada):** backend próprio + Supabase (só banco, nunca expor ao front) e IA de verdade (Claude API) substituindo o parser.

## Tecnologias

- HTML + CSS + JavaScript vanilla (sem framework, sem build)
- [Leaflet](https://leafletjs.com/) + OpenStreetMap para os mapas (carregado sob demanda via CDN)
