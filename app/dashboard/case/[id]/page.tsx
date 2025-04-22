"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createBrowserClient } from "@/lib/supabase/client";
import { Bot, Download, FileIcon, Loader2, Send, SendIcon, Trash2, Upload, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useParams } from "next/navigation";
import axios from "axios";

// Initialize Supabase client
const supabase = createBrowserClient();
const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY!

interface FileObject {
    id: string;
    name: string;
    size: number;
    created_at: string;
    type: string;
    url?: string;
}

interface Message {
    role: "user" | "assistant" | "system"
    content: string
}

interface SearchResult {
    id: number
    filename: string
    content: string
    similarity: number
}

// Initialize Mistral API client
const mistralAPI = axios.create({
    baseURL: 'https://api.mistral.ai/v1',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
    }
});

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

Important: Do not use any asterisks (*), hash symbols (#), or markdown formatting in your response. Format the response as plain text with numbered sections.`
};

export default function CaseFileUploader() {
    const { id: caseId } = useParams<{ id: string }>();

    const [files, setFiles] = useState<FileObject[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [input, setInput] = useState<string>("");

    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hello! How can I help you today? You can ask me questions about your files or search for specific information within them.",
        },
    ])
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const { data: fileList, error } = await supabase.storage.from("files").list(`user_kb/${caseId}`);
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) setSelectedFile(e.target.files[0]);
    };

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
            (document.getElementById('file-upload') as HTMLInputElement).value = '';
        } catch (err: any) {
            setError(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const confirmDelete = (name: string) => {
        setFileToDelete(name);
        setDeleteDialogOpen(true);
    };

    const deleteFile = async () => {
        if (!fileToDelete) return;

        try {
            const path = `user_kb/${caseId}/${fileToDelete}`;
            console.log(`Attempting to delete file at path: ${path}`);

            const { error } = await supabase.storage.from("files").remove([path]);
            if (error) {
                console.error("Error deleting file:", error);
                throw error;
            }

            setFiles(files.filter(f => f.name !== fileToDelete));
        } catch (err: any) {
            console.error("Delete operation failed:", err);
            setError(err.message || "Delete failed");
        } finally {
            setDeleteDialogOpen(false);
            setFileToDelete(null);
        }
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) return "0 Bytes";
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + ["Bytes", "KB", "MB", "GB"][i];
    };

    const formatDate = (d: string) => new Date(d).toLocaleString();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMessage = input.trim()
        setInput("")
        setError(null)

        // Add user message to chat
        setMessages((prev) => [...prev, { role: "user", content: userMessage }])

        setLoading(true)

        try {
            // Search for relevant documents
            const searchResults = await searchDocuments(userMessage)
            // Build context from search results
            let context = ""
            if (searchResults && searchResults.length > 0) {
                context = searchResults.map(r => `From ${r.filename}: ${r.content}`).join("\n\n")
            } else {
                const { data: files } = await supabase.storage.from("files").list()
                const fileNames = files?.map(file => file.name).join(", ") || "No files available"
                context = `No relevant documents found. Available files: ${fileNames}`
            }

            // Prepare messages for chat API
            const chatMessages = [
                systemPrompt,
                ...messages.slice(1).filter(msg => msg.role !== "system"), // Previous conversation
                { role: "user", content: `Context:\n${context}\n\nQuestion: ${userMessage}` }
            ]
            // Generate AI response
            const completionResponse = await mistralAPI.post("/chat/completions", {
                model: "mistral-small",
                messages: chatMessages,
                max_tokens: 512,
                temperature: 0.2,
            })
            const answer = completionResponse.data.choices[0]?.message?.content || "No answer generated."

            // Add AI response to chat
            setMessages((prev) => [...prev, { role: "assistant", content: answer }])
        } catch (error: any) {
            console.error("Error generating response:", error)
            setError(error.message || "Failed to generate response")
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "I'm sorry, I encountered an error. Please try again later." },
            ])
        } finally {
            setLoading(false)
        }
    }

    const searchDocuments = async (query: string) => {
        try {
            // Get embedding for search query
            const embeddingResponse = await axios.post(
                "https://dhvvdsnipzvahdienvsm.supabase.co/functions/v1/queryEmbed",
                {
                    query: query,
                    caseId: caseId
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            return embeddingResponse.data as SearchResult[]
        } catch (error: any) {
            console.error("Search error:", error)
            throw error
        }
    }

    useEffect(() => {
        fetchFiles();
    }, [caseId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="space-y-6">
            <div className="container mx-auto py-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4">
                        {/* Document Upload Card */}
                        <Card className="mb-5">
                            <CardHeader><CardTitle>Upload Documents</CardTitle></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 gap-4">
                                    <Input id="file-upload" type="file" onChange={handleFileChange} />
                                    <Button onClick={uploadFile} disabled={!selectedFile || uploading}>
                                        {uploading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}Upload
                                    </Button>
                                </div>
                                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                            </CardContent>
                        </Card>

                        {/* Files List Card */}
                        <Card>
                            <CardHeader><CardTitle>Files</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                {loading ? (
                                    <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6" /></div>
                                ) : files.length === 0 ? (
                                    <div className="h-40 flex flex-col items-center justify-center text-center">
                                        <FileIcon className="h-8 w-8 mb-2 text-muted-foreground" />
                                        <p>No files uploaded yet.</p>
                                    </div>
                                ) : (
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
                                            {files.map(f => (
                                                <TableRow key={f.id}>
                                                    <TableCell className="">{f.name}</TableCell>
                                                    <TableCell>{formatBytes(f.size)}</TableCell>
                                                    <TableCell>{formatDate(f.created_at)}</TableCell>
                                                    <TableCell className="text-right flex">
                                                        <a href={f.url} target="_blank" rel="noopener noreferrer">
                                                            <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                                                        </a>
                                                        <Button variant="ghost" size="sm" onClick={() => confirmDelete(f.name)}><Trash2 className="h-4 w-4" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-8">
                        <Card className="flex flex-col h-[calc(100vh-8rem)]">
                            <CardHeader><CardTitle>Legal Assistant</CardTitle></CardHeader>
                            <CardContent className="flex-1 overflow-y-auto pb-0 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
                                        <p className="mt-2 text-muted-foreground">Ask me anything about this case. I'll search through the case documents to find answers.</p>
                                    </div>
                                ) : (
                                    messages.map((message, idx) => (
                                        <div key={idx} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                            <div className={`flex items-start space-x-2 max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"} p-3 rounded-lg`}>
                                                {message.role === "assistant" ? <Bot className="h-5 w-5 mt-1 flex-shrink-0" /> : <User className="h-5 w-5 mt-1 flex-shrink-0" />}
                                                <div className="whitespace-pre-wrap">{message.content}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="flex items-center space-x-2 bg-muted p-3 rounded-lg">
                                            <Bot className="h-5 w-5" />
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Thinking...</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </CardContent>
                            <div className="p-4 border-t">
                                <form onSubmit={handleSubmit} className="flex gap-2">
                                    <Input
                                        placeholder="Type your message..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        disabled={loading}
                                    />
                                    <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                                        <SendIcon className="h-4 w-4" />
                                    </Button>
                                </form>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
                    <DialogDescription>Deleting this file cannot be undone.</DialogDescription>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={deleteFile}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}



