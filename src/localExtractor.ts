import { ExtractedMetadata } from "./types";

/**
 * Clean up text from multiple spaces, line breaks, and trailing punctuations.
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[;,\.\s\-:]+$/, "")
    .replace(/^[:\-\s]+/, "")
    .trim();
}

/**
 * Clean up names to remove CNPJ/CPF, common prefixes/suffixes, and normalize spacing.
 */
function cleanName(name: string): string {
  let cleaned = name.replace(/\s+/g, " ").trim();
  // Remove CPF/CNPJ patterns
  cleaned = cleaned.replace(/\b\d{2,3}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "");
  cleaned = cleaned.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "");
  // Remove other noise
  cleaned = cleaned.replace(/(?:cpf|cnpj|rg|telefone|tel|email|e-mail)[:\-#º°\s]*[^\s]*/gi, "");
  // Trim any leftover double spaces or leading/trailing non-alphanumeric noise
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^[:\-\s,\.\/#°º]+|[:\-\s,\.\/#°º]+$/g, "").trim();
  return cleaned;
}

/**
 * Check if a candidate string is a valid name.
 * Excludes headers, footers, address lines, and other non-name document metadata.
 */
function isValidName(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 70) return false;

  // Split into individual clean words
  const words = normalized.split(/[\s,.;:\(\)\-\/]+/);

  // Exact words that should NEVER be part of a recipient's/company's name
  const invalidExactWords = new Set([
    "cnpj", "cpf", "valor", "data", "telefone", "tel", "email", "e-mail", "cep", 
    "rua", "avenida", "end.", "endereço", "endereco", "nº", "numero", "nº da nota", "nota fiscal",
    "bairro", "cidade", "estado", "uf", "fones", "fax", "inscrição", "inscricao", "imposto",
    "total", "subtotal", "pagamento", "vencimento", "fatura", "invoice", "booking", "reserva",
    "check-in", "check-out", "checkin", "checkout", "hospede", "hóspede", "cliente", "tomador",
    "prestador", "emitente", "serviço", "servico", "descrição", "descricao", "quantidade", "unitary",
    "unitário", "unitario", "preço", "preco", "alíquota", "aliquota", "issqn", "histórico", "historico",
    "danfe", "auxiliar", "documento", "operador", "agente", "via", "página", "pagina", "r$", "r", "id", "ref"
  ]);

  // Check if any single word is on the invalid exact list
  if (words.some(word => invalidExactWords.has(word))) {
    return false;
  }

  // Common complete phrases that we want to reject
  const invalidSubstrings = [
    "nota fiscal", "danfe", "chave de acesso", "inscrição estadual", "inscricao estadual",
    "prestador de", "tomador de", "todos os direitos", "página de", "página 1", "data de",
    "valor total", "fatura/invoice", "fatura / invoice"
  ];
  if (invalidSubstrings.some(sub => normalized.includes(sub))) {
    return false;
  }
  
  // Names should not have too many digits (more than 4 digits is highly likely an ID, zip code, or phone)
  const digitCount = (normalized.match(/\d/g) || []).length;
  if (digitCount > 4) return false;

  // Names should have letters
  const hasLetters = /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(normalized);
  if (!hasLetters) return false;

  return true;
}

/**
 * Extract a field using an array of regular expressions.
 * Returns the first valid group match, cleaned up.
 */
function extractWithRegexes(text: string, regexes: RegExp[]): string | null {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = cleanText(match[1]);
      if (candidate && candidate.length > 1) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Check if a candidate string is a valid reference identifier (nota, fatura or reservation code).
 */
function isValidReference(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 44) return false;
  
  // Usually codes do not span multiple words
  if (trimmed.includes(" ") && trimmed.split(" ").length > 2) return false;
  
  const lower = trimmed.toLowerCase();
  
  // Split into words to prevent partial substring match blocking good things
  const words = lower.split(/[\s,.;:\(\)\-\/]+/);
  const invalidExactWords = new Set(["valor", "data", "nome", "hospede", "hóspede", "cliente", "cnpj", "cpf", "emitente", "prestador", "tomador", "r$"]);
  if (words.some(w => invalidExactWords.has(w))) return false;

  const hasDigits = /\d/.test(trimmed);
  // Standard GDS localizer / Booking code: exactly 6 chars alphanumeric uppercase
  const isLocalizer = /^[A-Z0-9]{6}$/.test(trimmed.toUpperCase());
  
  return hasDigits || isLocalizer;
}

/**
 * Parses and validates a date sequence, ensuring valid day, month, and year.
 * Normalizes separators and handles 2-digit years. Returns standard DD/MM/YYYY.
 */
function parseAndValidateDate(matchStr: string): string | null {
  const clean = matchStr.trim();
  // Split by typical date separators: space, dot, slash, dash
  const parts = clean.split(/[\s\-\/\.]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  let day = 0;
  let month = 0;
  let year = 0;

  if (parts[0].length === 4) {
    // Format YYYY/MM/DD
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (parts[2].length === 4 || parts[2].length === 2) {
    // Format DD/MM/YYYY or DD/MM/YY
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    return null;
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  // Simple calendar boundary check
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  // Adjust 2-digit years
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }
  
  if (year < 1950 || year > 2100) return null;

  // Pad to standard DD/MM/YYYY format
  const dStr = String(day).padStart(2, "0");
  const mStr = String(month).padStart(2, "0");
  const yStr = String(year);

  return `${dStr}/${mStr}/${yStr}`;
}

/**
 * Helper to capitalize words properly (Title Case).
 */
function toTitleCase(str: string): string {
  const minorWords = ["de", "da", "do", "das", "dos", "e", "em", "para", "com", "by", "of", "the", "and", "or", "in", "to"];
  const upperWords = ["s/a", "sa", "s.a.", "ltda", "me", "epp", "cnpj", "cpf", "gds"];
  return str
    .split(/\s+/)
    .map((word, index) => {
      const lowerWord = word.toLowerCase().replace(/[^a-z\/.]/g, "");
      if (upperWords.includes(lowerWord)) {
        return word.toUpperCase();
      }
      if (minorWords.includes(lowerWord) && index !== 0) {
        return lowerWord;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Local Rule-Based Extractor.
 * Parses raw text extracted from PDF and applies advanced pattern matching.
 */
export function extractMetadataFromText(fileName: string, text: string): ExtractedMetadata {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const lowercaseText = normalizedText.toLowerCase();

  // 1. Identify Document Type
  let documentType = "Documento";
  if (
    lowercaseText.includes("nota fiscal") || 
    lowercaseText.includes("nf-e") || 
    lowercaseText.includes("nfs-e") || 
    lowercaseText.includes("danfe") || 
    lowercaseText.includes("município") ||
    lowercaseText.includes("prestador de serviço") ||
    lowercaseText.includes("tomador de serviço")
  ) {
    documentType = "Nota Fiscal";
  } else if (
    lowercaseText.includes("reserva") || 
    lowercaseText.includes("booking") || 
    lowercaseText.includes("voucher") || 
    lowercaseText.includes("hospede") || 
    lowercaseText.includes("hóspede") || 
    lowercaseText.includes("check-in") ||
    lowercaseText.includes("checkin") ||
    lowercaseText.includes("estadia") ||
    lowercaseText.includes("hospedagem")
  ) {
    documentType = "Reserva";
  } else if (
    lowercaseText.includes("invoice") || 
    lowercaseText.includes("fatura") || 
    lowercaseText.includes("fatura/duplicata") ||
    lowercaseText.includes("bill")
  ) {
    documentType = "Invoice";
  } else if (
    lowercaseText.includes("recibo") || 
    lowercaseText.includes("receipt")
  ) {
    documentType = "Recibo";
  }

  // Split into lines for advanced scanning
  const lines = normalizedText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Initialize extracted fields with default placeholders
  let recipientName = "NÃO ENCONTRADO";
  let referenceNumber = "NÃO ENCONTRADO";
  let companyName = "NÃO ENCONTRADO";
  let date = "NÃO ENCONTRADO";
  let amount = "NÃO ENCONTRADO";

  // --- STEP 1: EXTRACT RECIPIENT NAME (NOME DO CLIENTE / HÓSPEDE) ---
  // Try line-by-line label scanning for the name
  const nameLabels = [
    // Portuguese labels
    /(?:^|[^a-zA-Z0-9À-ÖØ-öø-ÿ])(?:nome\s+do\s+hóspede|nome\s+do\s+hospede|hóspede|hospede|nome\s+do\s+cliente|nome\s+cliente|cliente|tomador\s+do\s+serviço|tomador\s+de\s+serviço|tomador|destinatário|destinatario|pagador|nome\s+completo|nome|passageiro|nome\s+do\s+passageiro|razão\s+social|razao\s+social|nome\s*\/?\s*razão\s+social|nome\s*\/?\s*razao\s+social)[:\-#º°\s=]+/i,
    // English labels
    /(?:^|[^a-zA-Z0-9À-ÖØ-öø-ÿ])(?:guest\s+name|guest|client|customer|consumer|bill\s+to|invoice\s+to|faturar\s+para|faturar\s+a|faturado\s+a)[:\-#º°\s=]+/i
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const labelRegex of nameLabels) {
      if (labelRegex.test(line)) {
        // Option A: Name is on the SAME line after the label
        const suffix = line.replace(labelRegex, "").trim();
        const cleanedSuffix = cleanName(suffix);
        if (isValidName(cleanedSuffix)) {
          recipientName = cleanedSuffix;
          break;
        }

        // Option B: Name is on the NEXT line (common in structured layouts)
        if (i + 1 < lines.length) {
          const nextLine = cleanName(lines[i + 1]);
          if (isValidName(nextLine)) {
            recipientName = nextLine;
            break;
          }
        }
        
        // Option C: Name is on the line after next (in case of empty lines or formatting noise)
        if (i + 2 < lines.length) {
          const lineAfterNext = cleanName(lines[i + 2]);
          if (isValidName(lineAfterNext)) {
            recipientName = lineAfterNext;
            break;
          }
        }
      }
    }
    if (recipientName !== "NÃO ENCONTRADO") break;
  }

  // Fallback regexes on the entire text block if line-by-line didn't resolve
  if (recipientName === "NÃO ENCONTRADO") {
    const nameRegexes = [
      /(?:nome\s+do\s+hóspede|nome\s+do\s+hospede|hóspede|hospede|guest\s+name|guest|nome\s+do\s+cliente|nome\s+cliente|cliente|client|tomador\s+do\s+serviço|tomador\s+de\s+serviço|tomador|destinatário|destinatario|pagador|nome\s+completo|nome|customer|consumer)\s*[:\-#º°\s=]+\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9'\s\.\-\/&]{3,60})/i,
      /(?:razão\s+social|razao\s+social|nome\s*\/?\s*razão\s+social)\s*[:\-#º°\s=]+\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9'\s\.\-\/&]{3,60})/i
    ];
    const rawMatch = extractWithRegexes(normalizedText, nameRegexes);
    if (rawMatch && isValidName(rawMatch)) {
      recipientName = cleanName(rawMatch);
    }
  }

  // --- STEP 2: EXTRACT REFERENCE NUMBER (NOTA, FATURA OU RESERVA) ---
  // Match based on detected document type for high accuracy, with dynamic fallbacks.
  const noteLabels = [
    /(?:^|[^a-zA-Z0-9À-ÖØ-öø-ÿ])(?:fatura\s*\/\s*invoice|nota\s+fiscal|nf-e|nfe|nfs-e|fatura|invoice|recibo|receipt|reserva|booking|localizador|voucher|nº\s+da\s+nota|nº\s+da\s+fatura|número\s+da\s+nota|número\s+da\s+fatura|invoice\s+no|invoice\s+number|booking\s+no|booking\s+id|código\s+da\s+reserva|codigo\s+da\s+reserva|localizador\s+da\s+reserva|nº|n\.º|num\.?|id|ref|código|codigo)[:\-#º°\s=]+/i
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const labelRegex of noteLabels) {
      if (labelRegex.test(line)) {
        // Option A: Reference is on the SAME line after label
        // Isolate the very first word/token after the match, to support side-by-side elements on the same physical line (like "Fatura: 12345 Data: 12/12/2026")
        const suffix = line.replace(labelRegex, "").trim();
        const firstWord = suffix.split(/\s+/)[0];
        const cleanedSuffix = firstWord.replace(/^[:\-\s,\.\/#°º]+|[:\-\s,\.\/#°º]+$/g, "").toUpperCase();
        if (isValidReference(cleanedSuffix)) {
          referenceNumber = cleanedSuffix;
          break;
        }

        // Option B: Reference is on the NEXT line
        if (i + 1 < lines.length) {
          const nextLineFirstWord = lines[i + 1].trim().split(/\s+/)[0];
          const nextLineCleaned = nextLineFirstWord.replace(/^[:\-\s,\.\/#°º]+|[:\-\s,\.\/#°º]+$/g, "").toUpperCase();
          if (isValidReference(nextLineCleaned)) {
            referenceNumber = nextLineCleaned;
            break;
          }
        }
      }
    }
    if (referenceNumber !== "NÃO ENCONTRADO") break;
  }

  // Specific regex heuristics for Reference Number if line-by-line failed
  if (referenceNumber === "NÃO ENCONTRADO") {
    const refRegexes: RegExp[] = [];
    if (documentType === "Reserva") {
      refRegexes.push(
        /(?:código\s+da\s+reserva|codigo\s+da\s+reserva|cód\s+reserva|cod\s+reserva|reserva|booking\s+id|booking\s+no|booking|reservation\s+id|reservation\s+no|reservation|localizador|locator|ref\.?\s*reserva)\s*[:\-#º°\s=]+\s*([a-zA-Z0-9\-/]{3,25})/i,
        /\b([A-Z0-9]{6})\b/ // GDS Locator
      );
    } else if (documentType === "Nota Fiscal") {
      refRegexes.push(
        /(?:nota\s+fiscal|nf-e|nfs-e|nfe|nº\s+da\s+nota|número|numero|nº|n\.º|num\.?)\s*(?:da\s+nota|nº|n\.º)?\s*[:\-#º°\s=]+\s*([0-9\./\-]{3,15})/i,
        /(?:chv\s+aces|chave\s+de\s+acesso|chave)\s*[:\-#º°\s=]+\s*([0-9\s]{44})/i
      );
    } else {
      // Invoice / Fatura specific
      refRegexes.push(
        /(?:fatura\s*\/\s*invoice|fatura\s*-\s*invoice|invoice\s*\/\s*fatura|invoice\s+number|invoice\s+no|invoice\s+#|invoice|fatura|recibo|nº|n\.º|nº\s+do\s+documento|referência|referencia|ref|id)\s*[:\-#º°\s=]+\s*([a-zA-Z0-9\-/]{3,25})/i
      );
    }

    // Dynamic general fallback regexes including compound labels
    refRegexes.push(
      /(?:fatura\s*\/\s*invoice|fatura\s*-\s*invoice|invoice\s*\/\s*fatura|reserva|booking|nota|nf-e|nfe|nfs-e|invoice|fatura|recibo|nº|n\.º|ref|id)\s*[:\-#º°\s=]+\s*([a-zA-Z0-9\-/]{3,25})/i
    );

    const rawMatch = extractWithRegexes(normalizedText, refRegexes);
    if (rawMatch && isValidReference(rawMatch)) {
      referenceNumber = rawMatch.replace(/\s+/g, "").toUpperCase();
    }
  }

  // --- STEP 3: EXTRACT COMPANY/EMITENTE NAME ---
  const companyRegexes = [
    /(?:hotel|pousada|resort|flat|hostel|apartamento|prestador\s+de\s+serviços|prestador\s+de\s+serviço|prestador|emitente|razão\s+social\s+emitente|razao\s+social\s+emitente|empresa|company|vendor|seller)\s*[:\-#º°\s=]+\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9\s\.\-&]{3,40})/i,
    /^[ \t]*([A-Za-zÀ-ÖØ-öø-ÿ0-9\s\.\-&]{3,35}\s+(?:Hotel|Pousada|Resort|Flat|Hostel|S\.?A\.?|Ltda|LTDA|Inc|LLC|Corporation))/im
  ];
  const rawCompany = extractWithRegexes(normalizedText, companyRegexes);
  if (rawCompany && rawCompany.length > 2) {
    companyName = toTitleCase(cleanName(rawCompany));
  }

  // --- STEP 4: EXTRACT DATE (DATA) ---
  const emissionRegexes = [
    /(?:data\s+da?\s+emissão|data\s+emissão|data\s+emissao|emissão\s+em|emissao\s+em|data\s+do\s+documento|data\s+doc|data\s+da\s+fatura|data\s+fatura|date\s+of\s+issue|issue\s+date|invoice\s+date|billing\s+date|issued\s+on)\s*[:\-#º°\s=]+\s*(\d{1,4}[-/.\s]+\d{1,2}[-/.\s]+\d{1,4})/i
  ];
  
  const neutralRegexes = [
    /(?:data\s+de\s+entrada|check-in|checkin|data\s+da\s+reserva|data\s+reserva|booking\s+date)\s*[:\-#º°\s=]+\s*(\d{1,4}[-/.\s]+\d{1,2}[-/.\s]+\d{1,4})/i,
    /(?<!vencimento\s+da\s+|vencimento\s+|due\s+)(?:data|date)\s*[:\-#º°\s=]+\s*(\d{1,4}[-/.\s]+\d{1,2}[-/.\s]+\d{1,4})/i
  ];

  const dueRegexes = [
    /(?:vencimento|venc|due\s+date|check-out|checkout|data\s+de\s+saída|data\s+de\s+saida)\s*[:\-#º°\s=]+\s*(\d{1,4}[-/.\s]+\d{1,2}[-/.\s]+\d{1,4})/i
  ];

  let parsedDate: string | null = null;

  // 1. Try to find precise Emission/Issue date
  let rawDate = extractWithRegexes(normalizedText, emissionRegexes);
  if (rawDate) {
    parsedDate = parseAndValidateDate(rawDate);
  }

  // 2. Try to find neutral dates ("data", "date", "check-in")
  if (!parsedDate) {
    rawDate = extractWithRegexes(normalizedText, neutralRegexes);
    if (rawDate) {
      parsedDate = parseAndValidateDate(rawDate);
    }
  }

  // 3. Fallback to scanning line-by-line for any valid date, prioritizing lines that do NOT contain due-date/checkout keywords
  if (!parsedDate) {
    const candidateDates: { dateStr: string; isEmissionOrNeutral: boolean; lineIndex: number }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      const matches = line.match(/\b\d{1,4}[-/.\s]+\d{1,2}[-/.\s]+\d{1,4}\b/g);
      if (matches) {
        for (const match of matches) {
          const validated = parseAndValidateDate(match);
          if (validated) {
            const hasDueKeyword = /vencimento|venc|due|check-out|checkout|saída|saida|pagamento/i.test(lowerLine);
            candidateDates.push({
              dateStr: validated,
              isEmissionOrNeutral: !hasDueKeyword,
              lineIndex: i
            });
          }
        }
      }
    }

    // First look for any date that is NOT on a due-date line
    const nonDueCandidate = candidateDates.find(c => c.isEmissionOrNeutral);
    if (nonDueCandidate) {
      parsedDate = nonDueCandidate.dateStr;
    } else if (candidateDates.length > 0) {
      // If only due-dates are present, pick the first one as a final resort
      parsedDate = candidateDates[0].dateStr;
    }
  }

  // 4. As a last resort, check due-date labels explicitly
  if (!parsedDate) {
    rawDate = extractWithRegexes(normalizedText, dueRegexes);
    if (rawDate) {
      parsedDate = parseAndValidateDate(rawDate);
    }
  }

  if (parsedDate) {
    date = parsedDate;
  }

  // --- STEP 5: EXTRACT AMOUNT (VALOR) ---
  const amountRegexes = [
    /(?:valor\s+total|valor\s+líquido|valor\s+liquido|total\s+da\s+nota|total\s+a\s+pagar|total\s+amount|grand\s+total|total|amount|subtotal)\s*[:\-#º°\s=]*(?:r\$|usd|eur|[\$])?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2}))/i,
    /(?:valor\s+total|valor\s+líquido|valor\s+liquido|total\s+da\s+nota|total\s+a\s+pagar|total\s+amount|grand\s+total|total|amount|subtotal)\s*[:\-#º°\s=]*(?:r\$|usd|eur|[\$])?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))/i,
    /(?:r\$|usd|eur|[\$])\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2}))/i,
    /(?:r\$|usd|eur|[\$])\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))/i,
    /\b(\d+,\d{2})\b/
  ];
  let rawAmount = extractWithRegexes(normalizedText, amountRegexes);
  if (rawAmount) {
    if (!rawAmount.startsWith("R$") && !rawAmount.startsWith("$") && !rawAmount.startsWith("USD")) {
      rawAmount = lowercaseText.includes("r$") || lowercaseText.includes("reais") ? `R$ ${rawAmount}` : `$ ${rawAmount}`;
    }
    amount = rawAmount;
  }

  // --- STEP 6: POST-PROCESSING & CASING NORMALIZATION ---
  if (recipientName !== "NÃO ENCONTRADO") {
    recipientName = toTitleCase(recipientName);
  }

  // --- STEP 7: GENERATE INTEGRATED SUMMARY ---
  const summaryParts: string[] = [];
  summaryParts.push(`${documentType} extraída localmente de ${fileName}.`);
  if (recipientName !== "NÃO ENCONTRADO") summaryParts.push(`Nome do Cliente/Hóspede: ${recipientName}.`);
  if (companyName !== "NÃO ENCONTRADO") summaryParts.push(`Emitente/Empresa: ${companyName}.`);
  if (referenceNumber !== "NÃO ENCONTRADO") summaryParts.push(`Ref/Nota/Fatura: ${referenceNumber}.`);
  if (date !== "NÃO ENCONTRADO") summaryParts.push(`Data: ${date}.`);
  if (amount !== "NÃO ENCONTRADO") summaryParts.push(`Valor: ${amount}.`);

  const summary = summaryParts.join(" ");

  return {
    referenceNumber,
    recipientName,
    companyName,
    date,
    amount,
    documentType,
    summary
  };
}
