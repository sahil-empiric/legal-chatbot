"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { createBrowserClient } from "@/lib/supabase/client";
import axios from "axios";
import {
  Download,
  FileIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

interface SearchResult {
  id: number;
  filename: string;
  content: string;
  similarity: number;
}

interface ChatMessage {
  role: string;
  content: string;
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{
    role: "system",
    content: "You are an expert assistant. Use the provided context to answer the user's question as accurately as possible. Format your responses using Markdown."
  }]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Authentication required: " + (userError?.message || "User not found"));
      }

      const { data, error } = await supabase.storage.from("files").list();
      if (error) throw error;

      if (data) {
        const { data: vectorData, error: vectorError } = await supabase
          .from("documents")
          .select("file_name")
          .eq("file_type", "kb");

        if (vectorError) {
          console.error("Error fetching vector data:", vectorError);
        }

        const vectorizedFilenames = vectorData?.map((item: any) => item.filename) || [];

        // Use throttled batch processing for URL generation
        const generateFileWithUrl = async (file: any) => {
          const { data: urlData } = await supabase.storage
            .from("files")
            .createSignedUrl(file.name, 3600);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
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

      // if (selectedFile.type === "application/pdf") {
      //   await extractPdfText(fileName, selectedFile);
      // } else {
      //   setSelectedFile(null);
      // }

      // fetchFiles();
    } catch (error: any) {
      setError(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const extractPdfText = async (fileName: string, file: File) => {
    try {
      setProcessing(true);
      setProcessingStatus("Extracting text from PDF...");

      const formData = new FormData();
      formData.append("pdf", file);

      const response = await axios.post("/api/extract-pdf", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const extractedData = response.data;
      setExtractedPdfData({
        pages: extractedData.pages,
        metadata: extractedData.metadata,
      });

      setProcessingStatus("PDF text extracted successfully!");

      // Split pages into smaller batches to avoid rate limiting
      const pageChunks = [];
      for (let i = 0; i < extractedData.pages.length; i += 5) {
        pageChunks.push(extractedData.pages.slice(i, i + 5));
      }

      for (let i = 0; i < pageChunks.length; i++) {
        setProcessingStatus(`Processing page chunk ${i + 1}/${pageChunks.length}...`);
        await generateEmbeddingsForChunk(fileName, pageChunks[i], i * 5);
        // Add delay between chunks to avoid rate limiting
        if (i < pageChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      fetchFiles();

      setProcessingStatus("All embeddings generated successfully!");
      setTimeout(() => {
        setProcessingStatus(null);
      }, 3000);
    } catch (error: any) {
      setError(`PDF text extraction failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setProcessing(false);
      setSelectedFile(null);
    }
  };

  const generateEmbeddingsForChunk = async (
    fileName: string,
    pages: string[],
    startIndex: number
  ) => {
    try {
      const response = await mistralAPI.post("/embeddings", {
        model: "mistral-embed",
        input: pages,
      });

      const data = response.data;

      await processBatch(
        data?.data?.map((ele: { embedding: number[] }, i: number) => ({
          embedding: ele.embedding,
          text: pages[i],
          index: startIndex + i
        })),
        async (item: any) => {
          await storeEmbeddingsInSupabase(
            item.embedding,
            item.text,
            fileName,
            item.index
          );
        },
        1,
        500
      );

      return true;
    } catch (error: any) {
      throw error;
    }
  };

  const generateEmbeddings = async (
    fileName: string,
    extractedData: { pages: string[]; metadata: any; text: string }
  ) => {
    try {
      setProcessingStatus("Generating embeddings from extracted text...");

      // Process in batches of 3 pages at a time with delay
      const pageChunks = [];
      for (let i = 0; i < extractedData.pages.length; i += 3) {
        pageChunks.push(extractedData.pages.slice(i, i + 3));
      }

      for (let i = 0; i < pageChunks.length; i++) {
        setProcessingStatus(`Processing chunk ${i + 1}/${pageChunks.length}...`);
        await generateEmbeddingsForChunk(fileName, pageChunks[i], i * 3);
        if (i < pageChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      setProcessingStatus("Embeddings generated and stored successfully!");

      setTimeout(() => {
        setProcessingStatus(null);
        setExtractedPdfData(null);
      }, 3000);
    } catch (error: any) {
      setError(`Embedding generation failed: ${error.response?.data?.error?.message || error.message}`);
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

    try {
      setError(null);

      const { error: storageError } = await supabase.storage
        .from("files")
        .remove([fileToDelete]);

      if (storageError) throw storageError;

      const { error: vectorError } = await supabase
        .from("document_vectors")
        .delete()
        .match({ filename: fileToDelete });

      if (vectorError) {
        console.error("Error deleting vector data:", vectorError);
      }

      setFiles(files.filter((file) => file.name !== fileToDelete));
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error: any) {
      setError(error.message || "Failed to delete file");
    }
  };

  const searchAndGenerateAnswer = async () => {
    if (!searchQuery) {
      setRagAnswer(null);
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setRagAnswer(null);

      // 1. Get embedding for search query
      const embeddingResponse = await mistralAPI.post("/embeddings", {
        model: "mistral-embed",
        input: [searchQuery]
      });

      const queryEmbedding = embeddingResponse.data.data[0].embedding;

      // 2. Search documents with the embedding
      const { data, error } = await supabase.rpc("search_document_vectors", {
        query_embedding: queryEmbedding,
        match_count: 5,
        similarity_threshold: 0.7,
      });

      if (error) throw error;

      const searchResults: SearchResult[] = data || [];

      // 3. Generate answer using RAG
      if (searchResults.length > 0) {
        // Concatenate top chunks for context
        const context = searchResults.map((r) => r.content).join("\n\n");

        const messages = [
          ...chatHistory,
          {
            role: "user",
            content: `Context:\n${context}\n\nQuestion: ${searchQuery}`,
          },
        ];

        const completionResponse = await mistralAPI.post("/chat/completions", {
          model: "mistral-small",
          messages,
          max_tokens: 512,
          temperature: 0.2,
        });

        const answer = completionResponse.data.choices[0]?.message?.content || "No answer generated.";

        const updatedMessages = [
          ...messages,
          { role: "assistant", content: answer }
        ];

        setChatHistory(updatedMessages);
        setRagAnswer(answer);
      } else {
        setRagAnswer("No relevant documents found to generate an answer.");
      }
    } catch (error: any) {
      setError(`Search failed: ${error.response?.data?.error?.message || error.message}`);
      setRagAnswer(null);
    } finally {
      setSearching(false);
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

      {/* Search Card */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Label htmlFor="search">Semantic Search</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="search"
                type="text"
                placeholder="Enter search query"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchAndGenerateAnswer()}
              />
              <Button onClick={searchAndGenerateAnswer} disabled={searching || !searchQuery.trim()}>
                {searching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RAG Answer */}
      {ragAnswer && (
        <div className="prose mt-2 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {ragAnswer}
          </ReactMarkdown>
        </div>
      )}

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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell>{formatBytes(file.size)}</TableCell>
                    <TableCell>{formatDate(file.created_at)}</TableCell>
                    <TableCell>
                      {file.vectorized ? (
                        <span className="text-green-600">Vectorized</span>
                      ) : (
                        <span className="text-yellow-600">Pending Vectorization</span>
                      )}
                    </TableCell>
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
    </div>
  );
}