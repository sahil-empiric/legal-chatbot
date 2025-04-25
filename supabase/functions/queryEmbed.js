// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const model = new Supabase.ai.Session('gte-small');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
};
Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }
    const { query, caseId } = await req.json();
    console.log(query, caseId);

    if (!query) {
        return new Response(JSON.stringify({
            error: "query is required"
        }), {
            status: 500,
            headers: corsHeaders
        });
    }

    // Generate embedding of user query
    const output = await model.run(query, {
        mean_pool: true,
        normalize: true
    });
    const embedding = JSON.stringify(output);
    console.log(embedding);

    // Create supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: documents, error: matchError } = await supabase.rpc('match_document_sections', {
        embedding,
        match_threshold: 0.5,
        case_id: caseId || 999
    }).select('content, document_id').limit(10);
    console.log(documents);
    if (matchError) {
        console.error(matchError);
        return new Response(JSON.stringify({
            error: 'There was an error reading your documents, please try again.'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
    return new Response(JSON.stringify(documents), {
        headers: {
            ...corsHeaders,
            'Connection': 'keep-alive'
        }
    });
});