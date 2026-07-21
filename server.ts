import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Create Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit to handle bulk base64 PDF uploads
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  // API endpoint for PDF metadata extraction using Gemini 3.5 Flash
  app.post("/api/extract-metadata", async (req: express.Request, res: express.Response) => {
    try {
      const { fileName, base64Data, documentTypeHint, customPrompt } = req.body;

      if (!base64Data) {
        return res.status(400).json({ error: "Faltando dados do arquivo em base64" });
      }

      // Clean base64 data if it includes a data URL prefix
      const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, "");

      // Construct a highly descriptive prompt for the AI extraction
      let promptText = `Você é um assistente especialista em processamento de documentos e renomeação de arquivos. 
Analise este documento PDF e extraia os metadados mais relevantes de forma estruturada.

Diretrizes para os campos de metadados:
1. referenceNumber (Número de Referência): Procure pelo código localizador de reserva, ID da reserva, número da Nota Fiscal (NF, NF-e), número de fatura, número de boleto ou similar. Se não houver nenhum, retorne "NÃO ENCONTRADO".
2. recipientName (Nome do Destinatário/Hóspede): Identifique o nome do hóspede principal, cliente, comprador, tomador de serviço, contratante ou passageiro. Se houver múltiplos, use o principal ou o primeiro. Se não houver, retorne "NÃO ENCONTRADO".
3. companyName (Empresa/Emitente): O nome da empresa emitente do documento (nome do hotel, pousada, agência de viagens, companhia aérea, prestadora de serviços, emissora da nota fiscal, etc. ou "NÃO ENCONTRADO").
4. date (Data): A data mais importante associada (data do check-in, data de emissão da nota, data da compra, data do serviço). Formate como DD-MM-AAAA ou AAAA-MM-DD.
5. amount (Valor): O valor monetário total contido no documento com o símbolo da moeda correto (ex: R$ 1500,00, R$ 250,50, USD 100). Retorne "N/A" se não houver.
6. documentType (Tipo de Documento): Identifique se é "Reserva de Hotel", "Nota Fiscal", "Fatura", "Recibo", "Contrato", "Passagem Aérea" ou "Outro".
7. summary (Resumo): Um resumo conciso em uma única frase descrevendo do que se trata o documento.`;

      if (documentTypeHint && documentTypeHint !== "auto") {
        promptText += `\n\nATENÇÃO: O tipo de documento esperado do arquivo é "${documentTypeHint}". Priorize termos correspondentes a esse tipo.`;
      }

      if (customPrompt) {
        promptText += `\n\nInstruções personalizadas adicionais do usuário para buscar nos dados: ${customPrompt}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "application/pdf"
            }
          },
          promptText
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              referenceNumber: { type: Type.STRING, description: "Código de reserva, localizador, número da nota fiscal ou fatura" },
              recipientName: { type: Type.STRING, description: "Nome do hóspede, cliente, passageiro ou comprador principal" },
              companyName: { type: Type.STRING, description: "Nome do hotel, emissor da nota fiscal, prestadora ou empresa" },
              date: { type: Type.STRING, description: "Data de check-in, data de emissão ou data principal formatada como DD-MM-AAAA ou AAAA-MM-DD" },
              amount: { type: Type.STRING, description: "Valor total do documento com moeda (ex: R$ 1.250,00)" },
              documentType: { type: Type.STRING, description: "Tipo do documento (ex: Reserva de Hotel, Nota Fiscal, Fatura, Recibo, Contrato, Outro)" },
              summary: { type: Type.STRING, description: "Resumo rápido de uma linha do documento" }
            },
            required: ["referenceNumber", "recipientName", "companyName", "date", "documentType"]
          }
        }
      });

      const extractedText = response.text;
      if (!extractedText) {
        throw new Error("A IA não retornou dados estruturados.");
      }

      const parsedData = JSON.parse(extractedText);
      return res.json({ success: true, metadata: parsedData });
    } catch (error: any) {
      console.error("Erro na extração de PDF:", error);
      return res.status(500).json({ error: error.message || "Erro interno na extração de metadados" });
    }
  });

  // Serve Vite in development, static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
