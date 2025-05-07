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
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateParaphrases } from "@/hooks/useMistralParaphrase";

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
    question: string;
    documents: { content: string }[];
}

// API client setup
const mistralAPI = axios.create({
    baseURL: "https://api.mistral.ai/v1",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
    },
    responseType: 'stream',
});

// System prompt for the legal assistant
const systemPrompt = {
    role: "system",
    content: `You are a legal assistant AI. When a user submits a legal query:
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
- Next Steps or Legal Risks`,
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

        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type (PDF only)
        if (file.type !== 'application/pdf') {
            setFileSizeError('Only PDF files are allowed');
            setSelectedFile(null);
            return;
        }

        // Validate file size (max 5 MB)
        if (file.size > MAX_FILE_SIZE) {
            setFileSizeError('File size exceeds the maximum limit of 5 MB');
            setSelectedFile(null);
            return;
        }
        setSelectedFile(file);
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

        let res = [userMessage, ...await generateParaphrases(userMessage)];


        try {
            // Search for relevant documents
            const searchResults = await axios.post(
                "https://dhvvdsnipzvahdienvsm.supabase.co/functions/v1/queryEmbed",
                {
                    query: res,
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
                context = "Use the following context to answer the question (if needed):\n\n";
                context = searchResults.data
                    .map((r: SearchResult, index: number) => `${(index + 1)}. ${r.question}\n${r.documents.map((doc) => doc.content).join("\n")} \n\n`)
                    .join("\n\n");
            } else {
                const { data: files } = await supabase.storage
                    .from("files")
                    .list(`user_kb / ${caseId} `);
                const fileNames = files?.map((file) => file.name).join(", ") || "No files available";
                context = `No relevant documents found.Available files: ${fileNames} `;
            }

            // Prepare messages for chat API
            const chatMessages = [
                systemPrompt,
                ...messages.slice(1).filter((msg) => msg.role !== "system"),
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${userMessage}` },
            ];

            // // Add empty assistant message that will be updated during streaming
            // setMessages(prev => [...prev, { role: "assistant", content: "" }]);
            // setChatLoading(false);

            // Generate AI response with streaming using fetch
            const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${mistralApiKey}`,
                },
                body: JSON.stringify({
                    model: "mistral-large-latest",
                    messages: chatMessages,
                    stream: true,
                    max_tokens: 10000,
                    temperature: 0.2,
                }),
            });

            if (!response.body) {
                throw new Error("ReadableStream not yet supported in this browser.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let answer = "";

            // Add empty assistant message that will be updated during streaming
            setChatLoading(false);
            setMessages(prev => [...prev, { role: "assistant", content: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });

                // Split the chunk by newline to handle multiple JSON objects
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const parsedChunk = JSON.parse(line.substring(6));
                        if (parsedChunk.choices[0].finish_reason) break;
                        const chunkData = parsedChunk.choices[0].delta?.content || "";
                        if (chunkData === "[DONE]" || chunkData.includes("[DONE]")) break;

                        // Append the chunk to the answer
                        answer += chunkData;

                        // Update just the last message (assistant's response)
                        setMessages(prev => {
                            const newMessages = [...prev];
                            newMessages[newMessages.length - 1] = {
                                role: "assistant",
                                content: answer
                            };
                            return newMessages;
                        });
                    }
                }
            }

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
                            <div className="">
                                <Markdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({ node, ...props }) => <p className="mb-4 text-[14px]" {...props} />,
                                        strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
                                        em: ({ node, ...props }) => <em className="italic" {...props} />,
                                        h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />,
                                        h2: ({ node, ...props }) => <h2 className="text-xl font-bold mb-3 mt-5" {...props} />,
                                        h3: ({ node, ...props }) => <h3 className="text-lg font-bold mb-2 mt-4" {...props} />,
                                        a: ({ node, ...props }) => <a className="text-blue-500 hover:underline" {...props} />,
                                        code: ({ node, ...props }) => (
                                            <code className="bg-gray-800 text-green-300 px-1 py-0.5 rounded text-xs" {...props} />
                                        ),
                                        pre: ({ node, ...props }) => <pre className="bg-gray-800 p-4 rounded mb-4 overflow-auto" {...props} />,
                                        li: ({ node, ...props }) => <li className="ml-4 list-disc text-[14px] mb-1" {...props} />,
                                        ul: ({ node, ...props }) => <ul className="pl-4 mb-4" {...props} />,
                                        ol: ({ node, ...props }) => <ol className="pl-4 mb-4 list-decimal" {...props} />,
                                        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-500 pl-4 italic my-4" {...props} />,
                                        table: ({ node, ...props }) => <table className="border-collapse table-auto w-full mb-4" {...props} />,
                                        th: ({ node, ...props }) => <th className="border px-4 py-2 text-left bg-gray-700" {...props} />,
                                        td: ({ node, ...props }) => <td className="border px-4 py-2" {...props} />
                                    }}
                                >
                                    {message.content}
                                </Markdown>
                            </div>
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
                                        accept=".pdf"
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
                                        autoFocus
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