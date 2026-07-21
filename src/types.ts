export interface ExtractedMetadata {
  referenceNumber: string;
  recipientName: string;
  companyName: string;
  date: string;
  amount: string;
  documentType: string;
  summary: string;
}

export type FileStatus = "pending" | "processing" | "success" | "error";

export interface PDFFile {
  id: string;
  name: string;
  size: number;
  base64: string;
  status: FileStatus;
  error?: string;
  metadata?: ExtractedMetadata;
  customName: string; // The active editable proposed filename
}

export type OrganizationMode = "none" | "documentType" | "companyName" | "monthYear";
