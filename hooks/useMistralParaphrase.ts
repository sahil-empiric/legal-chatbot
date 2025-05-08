import { createBrowserClient } from "@/lib/supabase/client";

const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY;

if (!mistralApiKey) {
    throw new Error("Mistral API key is not defined in environment variables.");
}

const supabase = createBrowserClient();

let context = `
You are an intelligent assistant specialized in generating alternate question phrasings. You know about these topics:
• White House Documentation – Tariffs – February 1 2025  
• Data (Use and Access) Bill  
• Research Briefing – US trade tariffs – April 17 2025  
• United States Trade and Investment Factsheet – April 7 2025

When a user asks a question:
1. Check whether it relates to any of the listed topics.  
2. If it does, produce five alternate questions that explicitly mention and stay within that topic’s context.  
3. If it does not, produce five general paraphrases of the user’s question.  
Output exactly five lines—one question per line—and nothing else.
      `.trim();

export const generateParaphrases = async (question: string, caseId: string, customSystemPrompt?: string): Promise<string[]> => {
    try {
        // Fetch KB files (admin uploaded)
        const { data: kbFiles, error: kbError } = await supabase.storage
            .from("files")
            .list("kb");

        // Fetch user KB files (user uploaded for this case)
        const { data: userKbFiles, error: userKbError } = await supabase.storage
            .from("files")
            .list(`user_kb/${caseId}`);

        if (kbError) console.error("Error fetching KB files:", kbError);
        if (userKbError) console.error("Error fetching user KB files:", userKbError);

        // Build list of available topics from file names
        const kbTopics = kbFiles?.map(file => file.name.replace(/\.[^/.]+$/, "")) || [];
        const userKbTopics = userKbFiles?.map(file => file.name.replace(/\.[^/.]+$/, "")) || [];
        const allTopics = [...kbTopics, ...userKbTopics];

        // Create dynamic context with available topics
        let dynamicContext = `
You are an intelligent assistant specialized in generating alternate question phrasings. You know about these topics:
${allTopics.map(topic => `• ${topic}`).join('\n')}

${customSystemPrompt ? customSystemPrompt :
                `When a user asks a question:
1. Check whether it relates to any of the listed topics.  
2. If it does, produce five alternate questions that explicitly mention and stay within that topic's context.  
3. If it does not, produce five general paraphrases of the user's question.  
Output exactly five lines—one question per line—and nothing else.`}
        `.trim();

        // Use custom system prompt if provided
        const systemPrompt = dynamicContext

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
                        content: systemPrompt,
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
    } catch (error) {
        console.error("Error in generateParaphrases:", error);
        return [];
    }
};