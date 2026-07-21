import { ExtractedMetadata } from "./types";

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Sanitize a string to be safe as a filename.
 */
export function sanitizeFilename(name: string): string {
  // Remove characters invalid in Windows, macOS, and Linux filesystems
  return name
    .replace(/[/\\?%*:|"<>\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluate a template string with metadata fields.
 * Template can contain: {referencia}, {nome}, {empresa}, {data}, {valor}, {tipo}
 */
export function evaluateNamingTemplate(
  template: string,
  metadata: ExtractedMetadata
): string {
  let result = template;

  const mapping: Record<string, string> = {
    "{referencia}": metadata.referenceNumber || "SEM_REFERENCIA",
    "{nome}": metadata.recipientName || "SEM_NOME",
    "{empresa}": metadata.companyName || "SEM_EMPRESA",
    "{data}": metadata.date || "SEM_DATA",
    "{valor}": metadata.amount || "SEM_VALOR",
    "{tipo}": metadata.documentType || "DOCUMENTO",
  };

  for (const [key, value] of Object.entries(mapping)) {
    // Standardize 'NÃO ENCONTRADO' or 'N/A' into cleaner file-safe defaults if found
    let cleanedValue = value;
    if (value === "NÃO ENCONTRADO" || value === "N/A" || !value) {
      if (key === "{referencia}") cleanedValue = "S-REF";
      else if (key === "{nome}") cleanedValue = "SemNome";
      else if (key === "{empresa}") cleanedValue = "SemEmpresa";
      else if (key === "{data}") cleanedValue = "SemData";
      else if (key === "{valor}") cleanedValue = "";
      else cleanedValue = "Doc";
    }

    // Clean up spaces/dots in individual parts before compiling
    cleanedValue = sanitizeFilename(cleanedValue);
    result = result.replace(new RegExp(key, "g"), cleanedValue);
  }

  // Final cleanup of the full filename
  result = sanitizeFilename(result);
  
  // Default to fallback if somehow empty
  if (!result) {
    result = "documento_renomeado";
  }

  return result;
}

/**
 * Parse date from DD-MM-YYYY or YYYY-MM-DD and return Month-Year string (e.g., "Julho_2026")
 */
export function getMonthYearFolder(dateStr: string): string {
  if (!dateStr || dateStr.includes("NÃO ENCONTRADO") || dateStr === "N/A") {
    return "Sem_Data";
  }

  // Try parsing YYYY-MM-DD
  let match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) {
    const year = match[1];
    const month = match[2];
    return `${year}-${month}`;
  }

  // Try parsing DD-MM-YYYY
  match = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (match) {
    const year = match[3];
    const month = match[2];
    return `${year}-${month}`;
  }

  return "Outras_Datas";
}
