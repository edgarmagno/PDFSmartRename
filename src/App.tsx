import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Sparkles, 
  UploadCloud, 
  FileText, 
  Settings, 
  Play, 
  Trash2, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  FolderOpen, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Plus, 
  Info, 
  Calendar, 
  DollarSign, 
  Building2, 
  Tag, 
  Briefcase, 
  User,
  FolderKanban,
  CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { PDFFile, ExtractedMetadata, OrganizationMode } from "./types";
import { formatBytes, evaluateNamingTemplate, getMonthYearFolder } from "./utils";
import { extractMetadataFromText } from "./localExtractor";

export default function App() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessingActive, setIsProcessingActive] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  const triggerNotification = (message: string, type: "error" | "success" | "info" = "info") => {
    setNotification({ message, type });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Configuration States
  const [config, setConfig] = useState({
    documentTypeHint: "auto",
    template: "{referencia} - {nome}",
    organizationMode: "none" as OrganizationMode,
    customPrompt: "",
  });

  // Custom template input state
  const [customTemplate, setCustomTemplate] = useState("{referencia} - {nome}");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Predefined templates
  const templatePresets = [
    { label: "Ref - Nome", value: "{referencia} - {nome}" },
    { label: "Nome - Ref", value: "{nome} - {referencia}" },
    { label: "Ref - Nome - Data", value: "{referencia} - {nome} - {data}" },
  ];

  // Apply template changes to already processed files
  useEffect(() => {
    setFiles(prev =>
      prev.map(file => {
        if (file.status === "success" && file.metadata) {
          return {
            ...file,
            customName: evaluateNamingTemplate(config.template, file.metadata)
          };
        }
        return file;
      })
    );
  }, [config.template]);

  // Sync custom template changes
  const handleTemplateChange = (newVal: string) => {
    setCustomTemplate(newVal);
    setConfig(prev => ({ ...prev, template: newVal }));
  };

  const insertTag = (tag: string) => {
    const newVal = customTemplate + tag;
    handleTemplateChange(newVal);
  };

  // Convert files to base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle Drag & Drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const addFilesToState = async (uploadedFiles: FileList) => {
    const pdfFiles = Array.from(uploadedFiles).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    
    if (pdfFiles.length === 0) {
      triggerNotification("Por favor, selecione apenas arquivos em formato PDF.", "error");
      return;
    }

    const newPDFs: PDFFile[] = [];

    for (const f of pdfFiles) {
      try {
        const base64 = await fileToBase64(f);
        newPDFs.push({
          id: Math.random().toString(36).substring(7),
          name: f.name,
          size: f.size,
          base64: base64,
          status: "pending",
          customName: f.name.replace(/\.pdf$/i, "") // initial raw filename without ext
        });
      } catch (err) {
        console.error("Erro ao ler arquivo:", err);
      }
    }

    const updatedList = [...files, ...newPDFs];
    setFiles(updatedList);
    // Automatically trigger processing
    startProcessing(updatedList);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesToState(e.dataTransfer.files);
    }
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addFilesToState(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeAccordion === id) {
      setActiveAccordion(null);
    }
  };

  const clearAllFiles = () => {
    setFiles([]);
    setActiveAccordion(null);
    setShowConfirmClear(false);
    triggerNotification("Fila de arquivos limpa com sucesso.", "success");
  };

  // Start Batch Local Rules-Based Processing
  const startProcessing = async (filesList?: PDFFile[]) => {
    const listToProcess = filesList || files;
    if (listToProcess.length === 0) return;
    setIsProcessingActive(true);

    // Process files sequentially for detailed real-time monitoring
    for (let i = 0; i < listToProcess.length; i++) {
      const file = listToProcess[i];
      if (file.status === "success") continue; // skip already successfully processed files

      setFiles(prev => 
        prev.map(f => f.id === file.id ? { ...f, status: "processing", error: undefined } : f)
      );

      try {
        const base64Data = file.base64.split(",")[1] || file.base64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error("A biblioteca PDF.js não carregou corretamente. Por favor, recarregue a página.");
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        let extractedText = "";
        
        // Scan up to 5 pages
        const pagesToScan = Math.min(pdf.numPages, 5);
        for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Reconstruct visual lines using vertical Y coordinates (translateY is item.transform[5])
          const linesMap: { [key: number]: { x: number; text: string }[] } = {};
          
          for (const item of textContent.items as any[]) {
            if (typeof item.str !== "string") continue;
            const text = item.str;
            const x = item.transform ? item.transform[4] : 0;
            const y = item.transform ? item.transform[5] : 0;
            
            // Group items into the same line if their vertical position is within 4 points tolerance
            const tolerance = 4;
            const existingYStr = Object.keys(linesMap).find(
              (existingY) => Math.abs(Number(existingY) - y) < tolerance
            );
            
            if (existingYStr) {
              linesMap[Number(existingYStr)].push({ x, text });
            } else {
              linesMap[y] = [{ x, text }];
            }
          }
          
          // Sort lines descending (from top of the page to bottom)
          const sortedY = Object.keys(linesMap)
            .map(Number)
            .sort((a, b) => b - a);
            
          let pageText = "";
          for (const y of sortedY) {
            // Sort items in the same line from left to right (ascending X)
            const rowItems = linesMap[y].sort((a, b) => a.x - b.x);
            const rowText = rowItems.map(it => it.text).join(" ");
            pageText += rowText + "\n";
          }
          
          extractedText += pageText + "\n";
        }

        // Apply our rule-based local extractor
        const metadata = extractMetadataFromText(file.name, extractedText);
        const evaluatedName = evaluateNamingTemplate(config.template, metadata);

        setFiles(prev => 
          prev.map(f => f.id === file.id ? {
            ...f,
            status: "success",
            metadata: metadata,
            customName: evaluatedName
          } : f)
        );
        // Auto expand the processed file
        setActiveAccordion(file.id);
      } catch (err: any) {
        console.error("Erro ao processar arquivo:", file.name, err);
        setFiles(prev => 
          prev.map(f => f.id === file.id ? {
            ...f,
            status: "error",
            error: err.message || "Falha ao analisar o PDF localmente."
          } : f)
        );
      }
    }

    setIsProcessingActive(false);
  };

  // Handle single metadata property edit
  const handleMetadataEdit = (fileId: string, field: keyof ExtractedMetadata, value: string) => {
    setFiles(prev => 
      prev.map(f => {
        if (f.id === fileId && f.metadata) {
          const updatedMetadata = { ...f.metadata, [field]: value };
          const newName = evaluateNamingTemplate(config.template, updatedMetadata);
          return {
            ...f,
            metadata: updatedMetadata,
            customName: newName
          };
        }
        return f;
      })
    );
  };

  // Handle direct filename edit
  const handleFilenameDirectEdit = (fileId: string, val: string) => {
    setFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, customName: val } : f)
    );
  };

  // Convert base64 back to Blob and Trigger Browser Download
  const downloadSingleFile = (file: PDFFile) => {
    try {
      const byteCharacters = atob(file.base64.split(",")[1] || file.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${file.customName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Erro ao baixar arquivo:", err);
      triggerNotification("Erro ao gerar download do PDF.", "error");
    }
  };

  // Bulk Zip Download with Folders Setup
  const downloadAllAsZip = async () => {
    const successFiles = files.filter(f => f.status === "success");
    if (successFiles.length === 0) return;

    const zip = new JSZip();

    successFiles.forEach(file => {
      try {
        const cleanBase64 = file.base64.split(",")[1] || file.base64;
        const binaryString = atob(cleanBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const fileNameWithExt = `${file.customName}.pdf`;
        
        // Dynamic folder organization logic
        if (config.organizationMode === "none") {
          zip.file(fileNameWithExt, bytes);
        } else if (config.organizationMode === "documentType" && file.metadata) {
          const folderName = file.metadata.documentType || "Outros_Documentos";
          zip.folder(folderName)?.file(fileNameWithExt, bytes);
        } else if (config.organizationMode === "companyName" && file.metadata) {
          const folderName = file.metadata.companyName || "Outros_Emitentes";
          zip.folder(folderName)?.file(fileNameWithExt, bytes);
        } else if (config.organizationMode === "monthYear" && file.metadata) {
          const folderName = getMonthYearFolder(file.metadata.date);
          zip.folder(folderName)?.file(fileNameWithExt, bytes);
        }
      } catch (err) {
        console.error("Erro ao adicionar arquivo ao ZIP:", file.name, err);
      }
    });

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `PDFs_Renomeados_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerNotification("Pacote ZIP gerado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao gerar ZIP:", err);
      triggerNotification("Erro ao criar o pacote compactado (ZIP).", "error");
    }
  };

  // Stats Counters
  const totalFiles = files.length;
  const processedFiles = files.filter(f => f.status === "success").length;
  const errorFiles = files.filter(f => f.status === "error").length;
  const pendingFiles = files.filter(f => f.status === "pending").length;
  const estimatedTimeSavedMinutes = (processedFiles * 1.5).toFixed(1);

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden text-slate-900">
      
      {/* Top Navigation Bar / Header */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-200">
            PDF
          </div>
          <div>
            <h1 className="text-base font-bold leading-none flex items-center gap-1.5">
              SmartRename 
              <span className="text-blue-600 text-[10px] font-bold bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">LOCAL v4.0</span>
            </h1>
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">Renomeador de PDF Offline de Alta Velocidade</p>
          </div>
        </div>

        {/* Mid Stats Area if there are loaded files */}
        {totalFiles > 0 && (
          <div className="hidden md:flex items-center gap-4 bg-slate-50 p-1 rounded-lg border border-slate-200/80">
            <span className="text-xs font-semibold px-2 text-slate-500">
              Fila: <strong className="text-slate-800 font-mono">{totalFiles}</strong>
            </span>
            <span className="text-xs font-semibold px-2 text-emerald-600 bg-emerald-50 rounded py-0.5">
              Prontos: <strong className="font-mono">{processedFiles}</strong>
            </span>
            {errorFiles > 0 && (
              <span className="text-xs font-semibold px-2 text-rose-600 bg-rose-50 rounded py-0.5">
                Erros: <strong className="font-mono">{errorFiles}</strong>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <button
              onClick={startProcessing}
              disabled={isProcessingActive || pendingFiles === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-md shadow-md shadow-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none transition-all flex items-center gap-1.5"
            >
              {isProcessingActive ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Extraindo...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Iniciar Lote ({pendingFiles})
                </>
              )}
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-7xl w-full mx-auto px-4 md:px-6 pb-6">
        
        {/* Right Main Panel with Data Grid or Dropzone */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200/80 rounded-xl shadow-xs mt-4">
          
          {files.length === 0 ? (
            /* Upload stage */
            <div className="flex-grow flex items-center justify-center p-6 md:p-8">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-2xl border-2 border-dashed rounded-xl p-8 md:p-12 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? "border-blue-500 bg-blue-50/50 scale-[0.99]" 
                    : "border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/20"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <UploadCloud className="h-6 w-6" />
                </div>
                
                <h3 className="font-bold text-slate-800 text-sm">Carregar PDFs para Renomear</h3>
                <p className="text-[11px] text-slate-500 max-w-sm mt-1 mx-auto leading-relaxed">
                  Arraste seus arquivos PDF ou clique para explorar. O app localiza e extrai o número da nota fiscal ou reserva, o nome e outros dados offline em milissegundos!
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2 text-slate-400 text-[10px] font-bold">
                  <span className="flex items-center gap-1 bg-white border border-slate-200/60 px-2 py-1 rounded">🏨 Reservas</span>
                  <span className="flex items-center gap-1 bg-white border border-slate-200/60 px-2 py-1 rounded">🧾 Notas Fiscais</span>
                  <span className="flex items-center gap-1 bg-white border border-slate-200/60 px-2 py-1 rounded">💳 Faturas</span>
                  <span className="flex items-center gap-1 bg-white border border-slate-200/60 px-2 py-1 rounded">📂 Contratos</span>
                </div>
              </div>
            </div>
          ) : (
            /* High Density Table & Edit Grid */
            <div className="flex-grow flex flex-col overflow-hidden">
              
              {/* Sleek Horizontal Settings Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Tag className="h-4 w-4 text-blue-600" />
                    Padrão de Nome:
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customTemplate}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      placeholder="Ex: {referencia} - {nome}"
                      className="text-xs font-mono bg-white px-3 py-1.5 border border-slate-200 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-52 font-bold text-blue-700 shadow-3xs"
                    />
                    
                    {/* Fast Injectors */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTemplateChange("{referencia} - {nome}")}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                          config.template === "{referencia} - {nome}"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Usar Ref/Fatura - Nome"
                      >
                        Ref - Nome
                      </button>
                      <button
                        onClick={() => handleTemplateChange("{nome} - {referencia}")}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                          config.template === "{nome} - {referencia}"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Usar Nome - Ref/Fatura"
                      >
                        Nome - Ref
                      </button>
                      <button
                        onClick={() => handleTemplateChange("{referencia} - {nome} - {data}")}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                          config.template === "{referencia} - {nome} - {data}"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Usar Ref/Fatura - Nome - Data"
                      >
                        Ref - Nome - Data
                      </button>
                    </div>
                  </div>

                  {/* Add Tag quick inject */}
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tags:</span>
                    <button
                      onClick={() => insertTag("{referencia}")}
                      className="px-1.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 text-[9px] font-mono font-bold text-slate-600 rounded flex items-center gap-0.5"
                    >
                      <Plus className="h-2 w-2 text-blue-500" />
                      {"{referencia}"}
                    </button>
                    <button
                      onClick={() => insertTag("{nome}")}
                      className="px-1.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 text-[9px] font-mono font-bold text-slate-600 rounded flex items-center gap-0.5"
                    >
                      <Plus className="h-2 w-2 text-blue-500" />
                      {"{nome}"}
                    </button>
                    <button
                      onClick={() => insertTag("{data}")}
                      className="px-1.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 text-[9px] font-mono font-bold text-slate-600 rounded flex items-center gap-0.5"
                    >
                      <Plus className="h-2 w-2 text-blue-500" />
                      {"{data}"}
                    </button>
                  </div>
                </div>

                {/* Local Engine badge / counters */}
                <div className="flex items-center gap-2.5 text-[11px] self-end md:self-auto">
                  <div className="flex items-center gap-1 text-slate-500 font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Local Extractor: <strong>{processedFiles}/{totalFiles}</strong> concluídos</span>
                  </div>
                  {processedFiles > 0 && (
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[9px] font-bold rounded-sm">
                      ~{estimatedTimeSavedMinutes} min salvos!
                    </span>
                  )}
                </div>
              </div>
              
              {/* Table Data list */}
              <div className="flex-grow overflow-auto bg-white">
                <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-20">
                    <tr>
                      <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Arquivo Original</th>
                      <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/6">Ref / Reserva</th>
                      <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/5">Nome / Hóspede</th>
                      <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Novo Nome Proposto</th>
                      <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/6 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {files.map((file) => {
                      const isExpanded = activeAccordion === file.id;
                      return (
                        <React.Fragment key={file.id}>
                          {/* Row representation */}
                          <tr 
                            onClick={() => file.status === "success" && setActiveAccordion(isExpanded ? null : file.id)}
                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer text-xs ${
                              isExpanded ? "bg-blue-50/20" : ""
                            }`}
                          >
                            <td className="p-3 font-medium text-slate-700 truncate" title={file.name}>
                              <div className="flex items-center gap-2">
                                <FileText className={`h-4 w-4 shrink-0 ${
                                  file.status === "success" ? "text-emerald-500" :
                                  file.status === "error" ? "text-rose-500" :
                                  file.status === "processing" ? "text-blue-500 animate-pulse" :
                                  "text-slate-400"
                                }`} />
                                <span className="truncate">{file.name}</span>
                              </div>
                            </td>
                            
                            <td className="p-3 font-mono font-bold text-blue-700 truncate">
                              {file.status === "success" && file.metadata ? (
                                file.metadata.referenceNumber !== "NÃO ENCONTRADO" ? `#${file.metadata.referenceNumber}` : "Não Encontrado"
                              ) : "-"}
                            </td>

                            <td className="p-3 text-slate-600 truncate">
                              {file.status === "success" && file.metadata ? file.metadata.recipientName : "-"}
                            </td>

                            <td className="p-3 text-slate-900 truncate font-semibold">
                              {file.status === "success" ? `${file.customName}.pdf` : (
                                file.status === "processing" ? "Extraindo com IA..." : "Aguardando processamento"
                              )}
                            </td>

                            <td className="p-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                                file.status === "success" ? "bg-emerald-100 text-emerald-800" :
                                file.status === "error" ? "bg-rose-100 text-rose-800" :
                                file.status === "processing" ? "bg-blue-100 text-blue-800 animate-pulse" :
                                "bg-slate-100 text-slate-600"
                              }`}>
                                {file.status === "success" ? "PRONTO" :
                                 file.status === "error" ? "ERRO" :
                                 file.status === "processing" ? "IA ATIVA" :
                                 "FILA"}
                              </span>
                            </td>
                          </tr>

                          {/* Accordion Edit area directly below row */}
                          {file.status === "success" && file.metadata && isExpanded && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50/50 p-4 border-b border-slate-200">
                                <div className="space-y-3 max-w-4xl">
                                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                                    <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                                      <Edit3 className="h-3.5 w-3.5 text-blue-600" />
                                      Metadados Extraídos & Edição de Nome do Arquivo
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadSingleFile(file);
                                        }}
                                        className="px-2.5 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                                      >
                                        <Download className="h-3 w-3" />
                                        Baixar PDF
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFile(file.id);
                                        }}
                                        className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded text-[10px] font-bold hover:bg-rose-100 flex items-center gap-1"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        Remover
                                      </button>
                                    </div>
                                  </div>

                                  {/* Edit template name preview input */}
                                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                      Nome Proposto Final (editável diretamente):
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={file.customName}
                                        onChange={(e) => handleFilenameDirectEdit(file.id, e.target.value)}
                                        className="flex-1 text-xs font-bold text-blue-700 bg-blue-50/20 px-3 py-1.5 border border-blue-100 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                      />
                                      <span className="text-xs font-semibold text-slate-400">.pdf</span>
                                    </div>
                                  </div>

                                  {/* Metadados bento fields */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Tag className="h-3 w-3 text-blue-500" /> Referência:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.referenceNumber}
                                        onChange={(e) => handleMetadataEdit(file.id, "referenceNumber", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>

                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <User className="h-3 w-3 text-blue-500" /> Hóspede / Cliente:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.recipientName}
                                        onChange={(e) => handleMetadataEdit(file.id, "recipientName", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>

                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Building2 className="h-3 w-3 text-blue-500" /> Empresa / Emissor:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.companyName}
                                        onChange={(e) => handleMetadataEdit(file.id, "companyName", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>

                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Calendar className="h-3 w-3 text-blue-500" /> Data:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.date}
                                        onChange={(e) => handleMetadataEdit(file.id, "date", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>

                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <DollarSign className="h-3 w-3 text-blue-500" /> Valor total:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.amount}
                                        onChange={(e) => handleMetadataEdit(file.id, "amount", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>

                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Briefcase className="h-3 w-3 text-blue-500" /> Tipo:
                                      </span>
                                      <input
                                        type="text"
                                        value={file.metadata.documentType}
                                        onChange={(e) => handleMetadataEdit(file.id, "documentType", e.target.value)}
                                        className="w-full text-xs font-semibold text-slate-800 border-0 border-b border-slate-200/50 hover:border-slate-300 p-0.5 focus:outline-hidden focus:border-blue-500"
                                      />
                                    </div>
                                  </div>

                                  <div className="text-[10px] text-slate-500 italic bg-blue-50/50 px-2.5 py-1.5 rounded border border-blue-100/40">
                                    <span className="font-bold text-blue-700 not-italic mr-1">Resumo IA:</span> 
                                    "{file.metadata.summary}"
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Row for Errors */}
                          {file.status === "error" && (
                            <tr>
                              <td colSpan={5} className="bg-rose-50/30 p-3 border-b border-rose-100">
                                <div className="flex items-start gap-2 text-xs text-rose-600">
                                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <span className="font-bold">Erro ao extrair metadados: </span>
                                    <span>{file.error}</span>
                                    <button 
                                      onClick={() => removeFile(file.id)}
                                      className="ml-2 underline font-bold hover:text-rose-800"
                                    >
                                      Remover da fila
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Action bar */}
              <div className="h-20 bg-slate-50 border-t border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900">{totalFiles} {totalFiles === 1 ? "Arquivo carregado" : "Arquivos carregados"}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight italic">
                      Organização Automática por Pasta: {config.organizationMode === "none" ? "Desativada" : "Ativada"}
                    </span>
                  </div>

                  {config.organizationMode !== "none" && processedFiles > 0 && (
                    <>
                      <div className="hidden sm:block h-8 w-px bg-slate-200"></div>
                      <div className="hidden sm:flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                          Pastas inteligentes ativas
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <button 
                    disabled={isProcessingActive}
                    onClick={() => setShowConfirmClear(true)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    Limpar Fila
                  </button>

                  <button
                    onClick={downloadAllAsZip}
                    disabled={processedFiles === 0}
                    className="px-5 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-md shadow-green-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar Tudo ({processedFiles} PDFs) .zip
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Custom Confirmation Modal for Clearing File List */}
      <AnimatePresence>
        {showConfirmClear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200 text-center space-y-4"
            >
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-sm">Limpar Fila de Arquivos?</h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Tem certeza que deseja remover todos os arquivos desta lista? Essa ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={clearAllFiles}
                  className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-md shadow-rose-100 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg border text-xs font-bold ${
              notification.type === "error" 
                ? "bg-rose-50 border-rose-200 text-rose-800" 
                : notification.type === "success" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}>
              {notification.type === "error" ? (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              ) : notification.type === "success" ? (
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-blue-600 shrink-0" />
              )}
              <span>{notification.message}</span>
              <button 
                onClick={() => setNotification(null)}
                className="ml-2 hover:opacity-75 focus:outline-hidden text-[10px]"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

