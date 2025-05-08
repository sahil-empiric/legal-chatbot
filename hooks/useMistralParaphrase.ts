import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY;

if (!mistralApiKey) {
    throw new Error("Mistral API key is not defined in environment variables.");
}

// Define interface for file data
interface FileObject {
    name: string;
    [key: string]: any;
}

export const useParaphraseGenerator = (caseId?: string) => {
    const supabase = createBrowserClient();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [defaultPrompt, setDefaultPrompt] = useState<string>("");

    // Default paraphrasing prompt
    const DEFAULT_PARAPHRASE_PROMPT = `When a user asks a question:
1. Check whether it relates to any of the listed topics.  
2. If it does, produce five alternate questions that explicitly mention and stay within that topic's context.  
3. If it does not, produce five general paraphrases of the user's question.  
Output exactly five lines—one question per line—and nothing else.`;

    // Fetch the latest paraphrase prompt from Supabase
    const fetchParaphrasePrompt = async () => {
        try {
            const { data, error } = await supabase
                .from("admin_prompts")
                .select("content")
                .eq("prompt_type", "paraphrase")
                .order("updated_at", { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== "PGRST116") {
                console.error("Error fetching paraphrase prompt:", error);
                setDefaultPrompt(DEFAULT_PARAPHRASE_PROMPT);
                return DEFAULT_PARAPHRASE_PROMPT;
            } else {
                setDefaultPrompt(data?.content || DEFAULT_PARAPHRASE_PROMPT);
                return data?.content || DEFAULT_PARAPHRASE_PROMPT;
            }
        } catch (err) {
            console.error("Failed to fetch paraphrase prompt:", err);
            setDefaultPrompt(DEFAULT_PARAPHRASE_PROMPT);
            return DEFAULT_PARAPHRASE_PROMPT;
        }
    };
    useEffect(() => {

        fetchParaphrasePrompt();
    }, []);

    const generateParaphrases = async (question: string, customSystemPrompt?: string): Promise<string[]> => {
        setIsLoading(true);
        setError(null);
        const adminPrompt = await fetchParaphrasePrompt();

        try {
            // Fetch KB files (admin uploaded)
            const { data: kbFiles, error: kbError } = await supabase.storage
                .from("files")
                .list("kb");

            // Fetch user KB files (user uploaded for this case)
            let userKbFiles: FileObject[] = [];
            let userKbError = null;

            if (caseId) {
                const result = await supabase.storage
                    .from("files")
                    .list(`user_kb/${caseId}`);
                userKbFiles = result.data || [];
                userKbError = result.error;
            }

            if (kbError) console.error("Error fetching KB files:", kbError);
            if (userKbError) console.error("Error fetching user KB files:", userKbError);

            // Build list of available topics from file names
            const kbTopics = kbFiles?.map(file => file.name) || [];
            const userKbTopics = userKbFiles.map(file => file.name) || [];
            const allTopics = [...kbTopics, ...userKbTopics];

            // Get the latest prompt - use custom if provided, otherwise use the fetched default
            const promptToUse = customSystemPrompt || adminPrompt;

            // Create dynamic context with available topics
            let dynamicContext = `You are an intelligent assistant specialized in generating alternate question phrasings and you have to generate only five questions. You know about these topics:
${allTopics.map(topic => `• ${topic}`).join('\n')}

${promptToUse}`;

            const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${mistralApiKey}`,
                },
                body: JSON.stringify({
                    model: "mistral-large-latest",
                    messages: [
                        {
                            role: "system",
                            content: dynamicContext,
                        },
                        { role: "user", content: question },
                    ],
                    temperature: 0.8,
                    max_tokens: 250,
                }),
            });

            if (!response.ok) {
                throw new Error(`Mistral API request failed with status ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error("Unexpected response format from Mistral API.");
            }

            return data.choices[0].message.content
                .split("\n")
                .map((s: string) => s.trim())
                .filter(Boolean);
        } catch (error: any) {
            console.error("Error in generateParaphrases:", error);
            setError(error.message || "Failed to generate paraphrases");
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    return {
        generateParaphrases,
        isLoading,
        error,
        DEFAULT_PARAPHRASE_PROMPT,
    };
};

// Helper function for direct calls without using the hook
export const generateParaphrases = async (question: string, caseId?: string, customSystemPrompt?: string): Promise<string[]> => {
    const { generateParaphrases: genParaphrases } = useParaphraseGenerator(caseId);
    return genParaphrases(question, customSystemPrompt);
};