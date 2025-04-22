// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
Deno.serve(async (req)=>{
  const { document_id  } = await req.json();
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({
      error: 'Missing environment variables.'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Create supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Fetch document by document_id
  const { data: document } = await supabase
    .from('documents_with_storage_path')
    .select()
    .eq('id', document_id)
    .single();

  if (!document?.storage_object_path) {
    return new Response(
      JSON.stringify({ error: 'Failed to find uploaded document' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Get the file public url
  const { data: file } = await supabase.storage
    .from('files')
    .createSignedUrl(document.storage_object_path, 60);

  if (!file) {
    return new Response(
      JSON.stringify({ error: 'Failed to download storage object' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Extract text from file (lambda fn)
  const pdfResponse = await fetch('https://7ivgnpwuhb522dbbexdq3m2xda0pbvcq.lambda-url.ap-south-1.on.aws/', {
    method: 'POST',
    body: JSON.stringify({
      url: file?.signedUrl || ''
    })
  });

  const pdfText = await pdfResponse.json();

  // Insert document chunks into document_sections table
  if (pdfText?.formattedChunks && Array.isArray(pdfText?.formattedChunks)) {
    const { error } = await supabase.from('document_sections').insert(
      pdfText?.formattedChunks.map((content) => ({
        document_id: document_id,
        content: content || null
      }))
    )

    if (error) {
      console.error(error);
      return new Response(
        JSON.stringify({ error: 'Failed to save document sections' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    console.log(
      `Saved ${pdfText?.formattedChunks.length} sections for file '${document.storage_object_path}'`
    );
  }


  return new Response(null, {
    status: 204,
    headers: { 'Content-Type': 'application/json' },
  });
});
