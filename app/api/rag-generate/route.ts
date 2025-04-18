// // pages/api/rag-generate.ts
// import { NextApiRequest, NextApiResponse } from 'next';
// import { createClient } from '@supabase/supabase-js';

// // Initialize Supabase client
// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// const supabase = createClient(supabaseUrl, supabaseServiceKey);

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//     if (req.method !== 'POST') {
//         return res.status(405).json({ error: 'Method not allowed' });
//     }

//     try {
//         const { query, userId } = req.body;

//         if (!query || !userId) {
//             return res.status(400).json({ error: 'Missing required parameters' });
//         }

//         // 1. Generate embedding for the query using Mistral AI
//         const embeddingResponse = await fetch('https://api.mistral.ai/v1/embeddings', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
//             },
//             body: JSON.stringify({
//                 model: 'mistral-embed',
//                 input: [query],
//             }),
//         });

//         if (!embeddingResponse.ok) {
//             const errorData = await embeddingResponse.json();
//             throw new Error(errorData.error?.message || 'Failed to generate embedding');
//         }

//         const embeddingData = await embeddingResponse.json();
//         const queryEmbedding = embeddingData.data[0].embedding;

//         // 2. Retrieve relevant document chunks
//         const { data: relevantChunks, error: searchError } = await supabase.rpc(
//             'search_document_vectors',
//             {
//                 query_embedding: queryEmbedding,
//                 match_count: 10,
//                 similarity_threshold: 0.65,
//             }
//         );

//         if (searchError) {
//             throw searchError;
//         }

//         if (!relevantChunks || relevantChunks.length === 0) {
//             return res.status(200).json({
//                 answer: "I couldn't find any relevant information in your documents to answer this question.",
//                 sources: []
//             });
//         }

//         // 3. Prepare context from the relevant chunks
//         const context = relevantChunks
//             .map((chunk) => chunk.content)
//             .join('\n\n');

//         // 4. Call Mistral AI chat completions API
//         const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
//             },
//             body: JSON.stringify({
//                 model: 'mistral-large-latest',
//                 messages: [
//                     {
//                         role: 'system',
//                         content: 'You are a helpful assistant that answers questions based on the provided context. If the answer cannot be found in the context, you should say so instead of making up information.'
//                     },
//                     {
//                         role: 'user',
//                         content: `Context information is below.
// ---------------------
// ${context}
// ---------------------
// Given the context information and not prior knowledge, answer the question: ${query}`
//                     }
//                 ],
//                 temperature: 0.2,
//             }),
//         });

//         if (!response.ok) {
//             const errorData = await response.json();
//             throw new Error(errorData.error?.message || 'Failed to generate answer');
//         }

//         const data = await response.json();
//         const answer = data.choices[0].message.content;

//         // 5. Format sources
//         const sources = relevantChunks.map((chunk) => ({
//             filename: chunk.filename,
//             content: chunk.content.substring(0, 100) + '...',
//             similarity: chunk.similarity
//         }));

//         return res.status(200).json({ answer, sources });
//     } catch (error: any) {
//         console.error('RAG generation error:', error);
//         return res.status(500).json({ error: error.message || 'Failed to generate answer' });
//     }
// }