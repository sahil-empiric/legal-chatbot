import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

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

export const useSystemPrompt = () => {
    const supabase = createBrowserClient();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);

    // Function to fetch the latest system prompt from the database
    const fetchSystemPrompt = async (): Promise<string> => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from("admin_prompts")
                .select("content")
                .eq("prompt_type", "system")
                .order("updated_at", { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== "PGRST116") {
                console.error("Error fetching system prompt:", error);
                setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                return DEFAULT_SYSTEM_PROMPT;
            } else {
                const prompt = data?.content || DEFAULT_SYSTEM_PROMPT;
                setSystemPrompt(prompt);
                return prompt;
            }
        } catch (err) {
            console.error("Failed to fetch system prompt:", err);
            setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
            return DEFAULT_SYSTEM_PROMPT;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        systemPrompt,
        fetchSystemPrompt,
        isLoading,
        error,
        DEFAULT_SYSTEM_PROMPT,
    };
};

// Helper function for direct access to the system prompt
export const getSystemPrompt = async (): Promise<string> => {
    const supabase = createBrowserClient();

    try {
        const { data, error } = await supabase
            .from("admin_prompts")
            .select("content")
            .eq("prompt_type", "system")
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error fetching system prompt:", error);
            return DEFAULT_SYSTEM_PROMPT;
        }

        return data?.content || DEFAULT_SYSTEM_PROMPT;
    } catch (err) {
        console.error("Failed to fetch system prompt:", err);
        return DEFAULT_SYSTEM_PROMPT;
    }
}; 