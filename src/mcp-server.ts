import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { calculatePostHoc, calculateAPriori } from "./stat-engine.js";

const server = new Server(
  { name: "gpower-k4-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Aracın şemasını AI'a tanıtıyoruz (README'de belgelenecek kısım)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "calculate_gpower",
        description: "G*Power istatistiksel güç ve örneklem büyüklüğü hesaplayıcısı. Yalnızca K4 (chi2-contingency) testini destekler.",
        inputSchema: {
          type: "object",
          properties: {
            test: { type: "string", description: "Test ailesi (örn: chi2-contingency, t2-indep vb.)" },
            mode: { type: "string", description: "Hesaplama modu: 'a-priori' veya 'post-hoc'" },
            w: { type: "number", description: "Cohen's w etki büyüklüğü" },
            alpha: { type: "number", description: "I. Tip hata payı (alpha)" },
            df: { type: "number", description: "Serbestlik derecesi (df)" },
            power: { type: "number", description: "A-priori için hedeflenen güç (1-beta)" },
            n_total: { type: "number", description: "Post-hoc için toplam örneklem büyüklüğü" }
          },
          required: ["test", "mode", "w", "alpha", "df"]
        }
      }
    ]
  };
});

// AI aracı çağırdığında çalışacak mantık
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "calculate_gpower") {
    throw new Error("Tool not found");
  }

  const args = request.params.arguments as any;

  // Sözleşme Kuralı: Desteklenmeyen testlerde UNSUPPORTED dönmeli
  if (args.test !== "chi2-contingency") {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "UNSUPPORTED", message: `Test family '${args.test}' is not supported by this K4 module.` }) }],
      isError: true
    };
  }

  try {
    let result;
    if (args.mode === "a-priori") {
      result = calculateAPriori(args.w, args.alpha, args.power, args.df);
    } else if (args.mode === "post-hoc") {
      result = calculatePostHoc(args.w, args.alpha, args.n_total, args.df);
    } else {
      throw new Error("Geçersiz mod: " + args.mode);
    }

    // Başarılı JSON yanıtı
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
      isError: true
    };
  }
});

// Sunucuyu Stdio üzerinden başlat
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("G*Power K4 MCP Server çalışıyor...");
});