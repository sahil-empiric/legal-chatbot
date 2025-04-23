"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createBrowserClient } from "@/lib/supabase/client";
import { Bot, Download, FileIcon, Loader2, Send, Trash2, Upload, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useParams } from "next/navigation";
import axios from "axios";

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const supabase = createBrowserClient();
const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY!;

// Type definitions
interface FileObject {
    id: string;
    name: string;
    size: number;
    created_at: string;
    type: string;
    url?: string;
}

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
}

interface SearchResult {
    id: number;
    filename: string;
    content: string;
    similarity: number;
}

// API client setup
const mistralAPI = axios.create({
    baseURL: "https://api.mistral.ai/v1",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
    },
});

// System prompt for the legal assistant
const systemPrompt = {
    role: "system",
    content: `You are a legal AI assistant specialising in comprehensive legal analysis for the UK legal system. Provide detailed, well-structured analysis incorporating legal principles, case law, and practical implications. Always use British English spelling. When citing cases, use proper citation format and explain their relevance clearly.
Based on the following case details, analyse the charges and statutes:
Please extract and analyse:
1. Exact offence(s) charged
2. Relevant legal statute(s)
3. Any aggravating or mitigating factors
4. Potential alternative charges

then analyse the defence position:
Please analyse:
1. Primary defence arguments
2. Secondary defence arguments
3. Supporting forensic evidence
4. Contradicting evidence
5. Alignment with witness statements

then provide a comprehensive evidence analysis:
Focus on:
1. Physical evidence analysis
2. Forensic findings
3. Documentary evidence
4. Expert testimony

then analyse witness statements:
For each witness:
1. Key points of testimony
2. Credibility assessment
3. Corroboration with evidence

then analyse the prosecution's case:
Include:
1. Key prosecution arguments
2. Evidence strengths and weaknesses
3. Potential defence strategies

then identify relevant legal principles:
Include:
1. Key legal principles
2. Relevant precedents
3. Application to current case

Based on the case details, create a formal Part 2 defence statement that includes:
Structure the response exactly as follows:

Part 2: Nature of defence

(a) Give particulars of the defence:
[Provide a clear statement of the defence position, including specific legal arguments and precedents]

(b) Indicate the matters of fact on which you take issue with the prosecutor, and in respect of each explain why:
[Detail disputed facts and explanations, supported by case law where relevant]

(c) Set out particulars of the matters of fact on which you intend to rely for the purposes of your defence:
[List key facts supporting the defence, with reference to supporting evidence]

(d) Indicate any point of law that you wish to take, including any point about the admissibility of evidence or about abuse of process, and any authority relied on:
[Include at least 3-4 relevant cases with full citations and explanations of their application to the current case. Focus on recent UK cases where possible.]

(e) If your defence statement includes an alibi, give particulars of:
(i) the name, address and date of birth of any witness who you believe can give evidence in support of that alibi
(ii) if you do not know all of those details, any information that might help identify or find that witness
[State if no alibi is relevant]

Important: Do not use any asterisks (*), hash symbols (#), or markdown formatting in your response. Format the response as plain text with numbered sections.`,
};

export default function CaseFileUploader() {
    const { id: caseId } = useParams<{ id: string }>();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // State management
    const [files, setFiles] = useState<FileObject[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [input, setInput] = useState<string>("");
    const [fileSizeError, setFileSizeError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content:
                "Hello! How can I help you today? You can ask me questions about your files or search for specific information within them.",
        },
    ]);

    // Fetch files from storage
    const fetchFiles = async () => {
        setLoading(true);
        setError(null);

        try {
            const { data: fileList, error } = await supabase.storage
                .from("files")
                .list(`user_kb/${caseId}`);

            if (error) throw error;

            const withUrls = await Promise.all(
                fileList.map(async (f: any) => {
                    const { data: urlData } = await supabase.storage
                        .from("files")
                        .createSignedUrl(`user_kb/${caseId}/${f.name}`, 3600);

                    return {
                        id: f.id,
                        name: f.name,
                        size: f.metadata?.size || 0,
                        created_at: f.created_at,
                        type: f.metadata?.mimetype || "unknown",
                        url: urlData?.signedUrl,
                    };
                })
            );

            setFiles(withUrls);
        } catch (err: any) {
            setError(err.message || "Failed to load files");
        } finally {
            setLoading(false);
        }
    };

    // Handle file selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileSizeError(null);

        if (e.target.files?.length) {
            const file = e.target.files[0];

            if (file.size > MAX_FILE_SIZE) {
                setFileSizeError("File size exceeds the maximum limit of 5 MB");
                setSelectedFile(null);
                return;
            }

            setSelectedFile(file);
        }
    };

    // Upload file to storage
    const uploadFile = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setError(null);

        try {
            const path = `user_kb/${caseId}/${Date.now()}-${selectedFile.name}`;
            const { error } = await supabase.storage.from("files").upload(path, selectedFile, {
                metadata: { case_id: caseId },
            });

            if (error) throw error;

            await fetchFiles();
            setSelectedFile(null);

            // Reset file input using ref instead of DOM manipulation
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (err: any) {
            setError(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    // Open delete confirmation dialog
    const confirmDelete = (name: string) => {
        setFileToDelete(name);
        setDeleteDialogOpen(true);
    };

    // Delete file from storage
    const deleteFile = async () => {
        if (!fileToDelete) return;

        try {
            const path = `user_kb/${caseId}/${fileToDelete}`;
            const { error } = await supabase.storage.from("files").remove([path]);

            if (error) throw error;

            setFiles((prevFiles) => prevFiles.filter((f) => f.name !== fileToDelete));
        } catch (err: any) {
            setError(err.message || "Delete failed");
        } finally {
            setDeleteDialogOpen(false);
            setFileToDelete(null);
        }
    };

    // Format utilities
    const formatBytes = (bytes: number) => {
        if (!bytes) return "0 Bytes";
        const units = ["Bytes", "KB", "MB", "GB"];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    // Handle message submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || chatLoading) return;

        const userMessage = input.trim();
        setInput("");
        setError(null);

        // Add user message to chat
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setChatLoading(true);

        try {
            // Search for relevant documents
            const searchResults = await axios.post(
                "https://dhvvdsnipzvahdienvsm.supabase.co/functions/v1/queryEmbed",
                {
                    query: userMessage,
                    caseId: caseId,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            // Build context from search results
            let context = "";
            if (searchResults.data && searchResults.data.length > 0) {
                context = searchResults.data
                    .map((r: SearchResult) => `From ${r.filename}: ${r.content}`)
                    .join("\n\n");
            } else {
                const { data: files } = await supabase.storage
                    .from("files")
                    .list(`user_kb/${caseId}`);
                const fileNames = files?.map((file) => file.name).join(", ") || "No files available";
                context = `No relevant documents found. Available files: ${fileNames}`;
            }

            // Prepare messages for chat API
            const chatMessages = [
                systemPrompt,
                ...messages.slice(1).filter((msg) => msg.role !== "system"),
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${userMessage}` },
            ];

            // Generate AI response
            const completionResponse = await mistralAPI.post("/chat/completions", {
                model: "mistral-large-latest",
                messages: chatMessages,
                max_tokens: 1000,
                temperature: 0.2,
            });

            const answer = completionResponse.data.choices[0]?.message?.content || "No answer generated.";

            // Add AI response to chat
            setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
        } catch (err: any) {
            setError(err.message || "Failed to generate response");
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "I'm sorry, I encountered an error. Please try again later." },
            ]);
        } finally {
            setChatLoading(false);
        }
    };

    // Scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Load files on component mount or case ID change
    useEffect(() => {
        fetchFiles();
    }, [caseId]);

    // File list component
    const FilesList = () => {
        if (loading) {
            return (
                <div className="h-64 flex items-center justify-center">
                    <Loader2 className="animate-spin h-6 w-6" />
                </div>
            );
        }

        if (files.length === 0) {
            return (
                <div className="h-40 flex flex-col items-center justify-center text-center">
                    <FileIcon className="h-8 w-8 mb-2 text-muted-foreground" />
                    <p>No files uploaded yet.</p>
                </div>
            );
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Uploaded At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {files.map((file) => (
                        <TableRow key={file.id}>
                            <TableCell>{file.name}</TableCell>
                            <TableCell>{formatBytes(file.size)}</TableCell>
                            <TableCell>{formatDate(file.created_at)}</TableCell>
                            <TableCell className="text-right flex">
                                {file.url && (
                                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                                        <Button variant="ghost" size="sm">
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </a>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => confirmDelete(file.name)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    // Chat messages component
    const ChatMessages = () => {
        if (messages.length === 0) {
            return (
                <div className="text-center py-12">
                    <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">
                        Ask me anything about this case. I'll search through the case documents to find answers.
                    </p>
                </div>
            );
        }

        return (
            <>
                {messages.map((message, idx) => (
                    <div key={idx} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`flex items-start space-x-2 max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                                } p-3 rounded-lg`}
                        >
                            {message.role === "assistant" ? (
                                <Bot className="h-5 w-5 mt-1 flex-shrink-0" />
                            ) : (
                                <User className="h-5 w-5 mt-1 flex-shrink-0" />
                            )}
                            <div className="whitespace-pre-wrap">{message.content}</div>
                        </div>
                    </div>
                ))}
                {chatLoading && (
                    <div className="flex justify-start">
                        <div className="flex items-center space-x-2 bg-muted p-3 rounded-lg">
                            <Bot className="h-5 w-5" />
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Thinking...</span>
                        </div>
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="space-y-6">
            <div className="container mx-auto py-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4">
                        {/* Document Upload Card */}
                        <Card className="mb-5">
                            <CardHeader>
                                <CardTitle>Upload Documents</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 gap-4">
                                    <Input
                                        id="file-upload"
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                    />
                                    <Button
                                        onClick={uploadFile}
                                        disabled={!selectedFile || uploading}
                                    >
                                        {uploading ? (
                                            <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                        ) : (
                                            <Upload className="mr-2 h-4 w-4" />
                                        )}
                                        Upload
                                    </Button>
                                    {fileSizeError && (
                                        <Alert variant="destructive">
                                            <AlertDescription>{fileSizeError}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                                {error && (
                                    <Alert variant="destructive" className="mt-4">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}
                            </CardContent>
                        </Card>

                        {/* Files List Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Files</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <FilesList />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-8">
                        <Card className="flex flex-col h-[calc(100vh-8rem)]">
                            <CardHeader>
                                <CardTitle>Legal Assistant</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-y-auto pb-0 space-y-4">
                                <ChatMessages />
                                <div ref={messagesEndRef} />
                            </CardContent>
                            <div className="p-4 border-t">
                                <form onSubmit={handleSubmit} className="flex gap-2">
                                    <Input
                                        placeholder="Type your message..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        disabled={chatLoading}
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={chatLoading || !input.trim()}
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </form>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                    </DialogHeader>
                    <DialogDescription>Deleting this file cannot be undone.</DialogDescription>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
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