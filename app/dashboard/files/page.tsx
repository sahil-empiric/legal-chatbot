"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useParaphraseGenerator } from "@/hooks/useMistralParaphrase";
import { createBrowserClient } from "@/lib/supabase/client";
import axios from "axios";
import {
  Download,
  FileIcon,
  Loader2,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from "sonner";

// Initialize Supabase client
const supabase = createBrowserClient();
const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY;

const mistralAPI = axios.create({
  baseURL: 'https://api.mistral.ai/v1',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${mistralApiKey}`
  }
});

// Add retry logic with exponential backoff
mistralAPI.interceptors.response.use(null, async (error) => {
  const { config } = error;
  // Set max retries and track retry count
  config.retryCount = config.retryCount || 0;
  const MAX_RETRIES = 3;

  if (error.response?.status === 429 && config.retryCount < MAX_RETRIES) {
    config.retryCount += 1;
    // Exponential backoff: 1s, 2s, 4s
    const delay = 1000 * Math.pow(2, config.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
    return mistralAPI(config);
  }
  return Promise.reject(error);
});

// Types
interface FileObject {
  id: string;
  name: string;
  size: number;
  created_at: string;
  type: string;
  url?: string;
  vectorized?: boolean;
}

interface ExtractedPdfData {
  pages: string[];
  metadata: any;
}
interface ChatMessage {
  role: string;
  content: string;
}

// Maximum file size in bytes (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Utility function to throttle batch processing
const processBatch = async (
  items: any[],
  processFn: (value: any, index: number, array: any[]) => Promise<any>,
  batchSize = 3,
  delayMs = 1000
) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
};

// Default system prompt
const DEFAULT_SYSTEM_PROMPT = `You are a legal assistant AI. When a user submits a legal query:
Break the query down into key sub-questions.
Search both:
Documents uploaded by the admin (legal textbooks, policies, precedents)
Documents uploaded by the user (case files, contracts, evidence)
Retrieve relevant content using embeddings or vector search.
Draft a response using:
Extracted content from both sources
Legal reasoning grounded in UK or applicable jurisdictional law
Cite all sources from the documents used.
Structure your reply with:
- Query Breakdown
- Documents Used
- Response
- Next Steps or Legal Risks`;

// Default paraphrase prompt
const DEFAULT_PARAPHRASE_PROMPT = `When a user asks a question:
1. Check whether it relates to any of the listed topics.  
2. If it does, produce five alternate questions that explicitly mention and stay within that topic's context.  
3. If it does not, produce five general paraphrases of the user's question.  
Output exactly five lines—one question per line—and nothing else.`;

export default function FilesPage() {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [extractedPdfData, setExtractedPdfData] = useState<ExtractedPdfData | null>(null);

  const [ragAnswer, setRagAnswer] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [paraphraseDialogOpen, setParaphraseDialogOpen] = useState(false);
  // State for prompts fetched from Supabase
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [paraphrasePrompt, setParaphrasePrompt] = useState<string>(DEFAULT_PARAPHRASE_PROMPT);

  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
    fetchAdminPrompts();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Authentication required: " + (userError?.message || "User not found"));
      }

      const { data, error } = await supabase.storage.from("files").list('kb');
      if (error) throw error;
      console.log("🚀 ~ fetchFiles ~ data:", data)

      if (data) {

        const vectorizedFilenames = data?.map((item: any) => item.name) || [];

        // Use throttled batch processing for URL generation
        const generateFileWithUrl = async (file: any) => {
          const { data: urlData, error } = await supabase.storage
            .from("files")
            .createSignedUrl(`kb/${file.name}`, 3600);

          return {
            id: file.id,
            name: file.name,
            size: file.metadata?.size || 0,
            created_at: file.created_at,
            type: file.metadata?.mimetype || "unknown",
            url: urlData?.signedUrl,
            vectorized: vectorizedFilenames.includes(file.name),
          };
        };

        const filesWithUrls = await processBatch(data, generateFileWithUrl, 5, 200);
        setFiles(filesWithUrls);
      }
    } catch (error: any) {
      setError(error.message || "Failed to fetch files");
    } finally {
      setLoading(false);
    }
  };

  // Fetch admin prompts from Supabase
  const fetchAdminPrompts = async () => {
    try {
      // Fetch system prompt
      const { data: systemData, error: systemError } = await supabase
        .from("admin_prompts")
        .select("content")
        .eq("prompt_type", "system")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (systemError && systemError.code !== "PGRST116") {
        throw systemError;
      }

      // Fetch paraphrase prompt
      const { data: paraData, error: paraError } = await supabase
        .from("admin_prompts")
        .select("content")
        .eq("prompt_type", "paraphrase")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (paraError && paraError.code !== "PGRST116") {
        throw paraError;
      }

      setCustomPrompt(systemData?.content || DEFAULT_SYSTEM_PROMPT);
      setParaphrasePrompt(paraData?.content || DEFAULT_PARAPHRASE_PROMPT);
    } catch (error) {
      console.error("Error fetching admin prompts:", error);
      setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
      setParaphrasePrompt(DEFAULT_PARAPHRASE_PROMPT);
    }
  };

  // Save prompt to Supabase (insert or update)
  const savePrompt = async (
    promptType: "system" | "paraphrase",
    content: string
  ) => {
    try {
      // Check if prompt exists
      const { data, error } = await supabase
        .from("admin_prompts")
        .select("id")
        .eq("prompt_type", promptType)
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        // Update existing prompt
        const { error: updateError } = await supabase
          .from("admin_prompts")
          .update({ content })
          .eq("id", data.id);

        if (updateError) throw updateError;
      } else {
        // Insert new prompt
        const user = await supabase.auth.getUser();
        const userId = user.data.user?.id || null;

        const { error: insertError } = await supabase.from("admin_prompts").insert([
          {
            prompt_type: promptType,
            content,
            modified_by: userId,
          },
        ]);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error(`Failed to save ${promptType} prompt:`, error);
      throw error;
    }
  };

  // Save handlers for dialogs
  const saveCustomPromptHandler = async () => {
    try {
      await savePrompt("system", customPrompt.trim() || DEFAULT_SYSTEM_PROMPT);
      setPromptDialogOpen(false);
      toast.success("System prompt saved successfully.");
    } catch {
      toast.error("Failed to save system prompt.");
    }
  };

  const saveParaphrasePromptHandler = async () => {
    try {
      await savePrompt(
        "paraphrase",
        paraphrasePrompt.trim() || DEFAULT_PARAPHRASE_PROMPT
      );
      setParaphraseDialogOpen(false);
      toast.success("Paraphrase prompt saved successfully.");
    } catch {
      toast.error("Failed to save paraphrase prompt.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileSizeError(null);
    if (e.target.files?.length) {
      const file = e.target.files[0];
      if (file.size > MAX_FILE_SIZE) {
        setFileSizeError("File size exceeds the maximum limit of 5 MB");
        setSelectedFile(null);
        e.target.value = ''; // Reset the input
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError(null);

      const fileName = `kb/${Date.now()}-${selectedFile.name}`;
      const { data, error } = await supabase.storage
        .from("files")
        .upload(fileName, selectedFile);

      if (error) throw error;

      console.log('upload data', data);

    } catch (error: any) {
      setError(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const storeEmbeddingsInSupabase = async (
    embeddings: number[],
    text: string,
    fileName: string,
    chunkIndex: number
  ) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Authentication required: " + (userError?.message || "User not found"));
      }

      const { error: vectorError } = await supabase
        .from("document_vectors")
        .insert([
          {
            filename: fileName,
            embedding: embeddings,
            chunk_index: chunkIndex,
            user_id: user.id,
            content: text,
          },
        ]);

      if (vectorError) {
        throw vectorError;
      }
    } catch (error: any) {
      throw new Error(`Failed to store embeddings: ${error.message}`);
    }
  };

  const deleteFile = async () => {
    if (!fileToDelete) return;

    // 1️⃣ Build the full path
    const objectPath = `kb/${fileToDelete}`;

    try {
      setError(null);

      // 2️⃣ Remove from Storage
      const { error: storageError } = await supabase
        .storage
        .from("files")
        .remove([objectPath]);                       // ← use full path
      if (storageError) throw storageError;

      // 3️⃣ Remove from your document_vectors table
      const { error: vectorError } = await supabase
        .from("documents")
        .delete()
        .eq("filename", objectPath);                 // ← match full path
      if (vectorError) console.error("Vector delete error:", vectorError);

      // 4️⃣ Update UI state
      setFiles(prev => prev.filter(f => f.name !== fileToDelete));
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error: any) {
      setError(error.message || "Failed to delete file");
    }
  };

  // Utility functions
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const confirmDelete = (fileName: string) => {
    setFileToDelete(fileName);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Files</h1>
          <p className="text-muted-foreground">Upload and manage your files</p>
        </div>
        <Button onClick={fetchFiles}>Refresh</Button>
      </div>

      {/* Upload Card */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="file-upload">Select File</Label>
                <Input
                  id="file-upload"
                  type="file"
                  onChange={handleFileChange}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={uploadFile}
                  disabled={!selectedFile || uploading || processing}
                  className="w-full sm:w-auto"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {fileSizeError && (
              <Alert variant="destructive">
                <AlertDescription>{fileSizeError}</AlertDescription>
              </Alert>
            )}

            {processingStatus && (
              <Alert>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <AlertDescription>{processingStatus}</AlertDescription>
              </Alert>
            )}

            {selectedFile && (
              <div className="text-sm">
                Selected: <span className="font-medium">{selectedFile.name}</span> ({formatBytes(selectedFile.size)})
                {selectedFile.type === "application/pdf" && (
                  <span className="ml-2 text-green-600">
                    (PDF will be processed for text extraction and embedding)
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => setPromptDialogOpen(!promptDialogOpen)}
            variant="outline"
            className="me-4"
          >
            <Settings className="mr-2 h-4 w-4" />
            Customize System Prompt
          </Button>
          <Button
            onClick={() => setParaphraseDialogOpen(!paraphraseDialogOpen)}
            variant="outline"
            className=""
          >
            <Settings className="mr-2 h-4 w-4" />
            Customize Paraphrase Prompt
          </Button>
        </CardContent>
      </Card>

      {/* RAG Answer */}
      {
        ragAnswer && (
          <div className="prose mt-2 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {ragAnswer}
            </ReactMarkdown>
          </div>
        )
      }

      {/* Files Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4">
              <FileIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No files uploaded yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your first file using the form above
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded At</TableHead>
                  {/* <TableHead>Status</TableHead> */}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell>{formatBytes(file.size)}</TableCell>
                    <TableCell>{formatDate(file.created_at)}</TableCell>
                    {/* <TableCell>
                      {file.vectorized ? (
                        <span className="text-green-600">Vectorized</span>
                      ) : (
                        <span className="text-yellow-600">Pending Vectorization</span>
                      )}
                    </TableCell> */}
                    <TableCell className="text-right">
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirmDelete(file.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              file from our servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteFile}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System Prompt Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Customize System Prompt</DialogTitle>
            <DialogDescription>
              Define how the AI assistant should behave and respond. Leave blank
              to use the default prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter your custom system prompt here..."
              className="h-64"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomPrompt(DEFAULT_SYSTEM_PROMPT)}>
              Reset to Default
            </Button>
            <Button onClick={saveCustomPromptHandler}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paraphrase Prompt Dialog */}
      <Dialog open={paraphraseDialogOpen} onOpenChange={setParaphraseDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Customize Paraphrase Prompt</DialogTitle>
            <DialogDescription>
              Define how alternative questions should be generated. Leave blank to
              use the default prompt.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Note: The file list will be automatically populated with current
              knowledge base documents
            </p>
            <Textarea
              value={paraphrasePrompt}
              onChange={(e) => setParaphrasePrompt(e.target.value)}
              placeholder="Enter your custom paraphrase prompt here..."
              className="h-64"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setParaphrasePrompt(DEFAULT_PARAPHRASE_PROMPT)}
            >
              Reset to Default
            </Button>
            <Button onClick={saveParaphrasePromptHandler}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}