### Create a public storage bucket
Bucket name: ```files```
## Attach Policy to bucket
```sql
CREATE POLICY "Users can modify files 1m0cqf_0" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'files'); -- Policy for insert
CREATE POLICY "Users can modify files 1m0cqf_1" ON storage.objects FOR SELECT TO public USING (bucket_id = 'files'); -- Policy for select
```

### Create a cases table
```sql
CREATE TABLE public.cases (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title TEXT NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
) WITH (OIDS=FALSE);

-- Create an index on the created_by column for better performance on joins
CREATE INDEX idx_cases_created_by ON public.cases(created_by);
```

### Create a documents table
```sql
CREATE TYPE file_type_enum AS ENUM ('kb', 'user_kb');

CREATE TABLE public.documents (
    id bigint primary key generated always as identity,
    case_id BIGINT not null references public.cases (id) ON DELETE CASCADE,
    file_reference uuid not null references storage.objects (id) ON DELETE CASCADE,
    file_type file_type_enum default 'user_kb' NOT NULL,
    created_at timestamp with time zone DEFAULT now()
) WITH (OIDS=FALSE);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Attach policy
create policy "open to public" on "public"."documents" to public using (true) with check (true);
```

### Create a function to insert new documents
```sql
CREATE OR REPLACE FUNCTION public.insert_document_function()
RETURNS TRIGGER AS $$
DECLARE
    file_type file_type_enum;  -- will hold either 'kb' or 'user_kb'
    document_id bigint;
    result int;
    file_metadata jsonb;  -- variable to hold the metadata
BEGIN
    -- 1. Extract the first segment of NEW.name and decide the file_type
    IF split_part(NEW.name, '/', 1) = 'kb' THEN
        file_type := 'kb'::file_type_enum;

        -- 2. Insert into documents without case_id
        INSERT INTO public.documents (
            file_reference,
            file_type
        )
        VALUES (
            NEW.id,
            file_type
        ) 
        returning id into document_id;

    ELSE
        file_type := 'user_kb'::file_type_enum;

        -- 2. Get the metadata from the NEW object
        file_metadata := NEW.user_metadata;
        -- 2.1. Insert into documents with case_id
        INSERT INTO public.documents (
            case_id,
            file_reference,
            file_type
        )
        VALUES (
            (file_metadata ->> 'case_id')::bigint,
            NEW.id,
            file_type
        ) 
        returning id into document_id;

    END IF;

    -- 3. Process Documents
    select
        net.http_post(
            -- url := supabase_url() || '/functions/v1/processDocuments',
            url := 'https://kpfexrubqxezymdvygtt.supabase.co/functions/v1/processDocuments',
            headers := jsonb_build_object(
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'document_id', document_id
            )
        )
    into result;

    RETURN NEW;
END;
$$
LANGUAGE plpgsql;
```

### Create Trigger to call insert_document_function whenever new file is uploaded
```sql
CREATE TRIGGER file_upload_trigger
AFTER INSERT ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION public.insert_document_function();
```

### Create view to get the storage path
```sql
create view documents_with_storage_path
as
  select documents.*, storage.objects.name as storage_object_path
  from documents
  join storage.objects
    on storage.objects.id = documents.file_reference;
```


### Add pg extentions
```sql
create extension if not exists pg_net with schema extensions; -- do http requests from postgress
create extension if not exists vector with schema extensions; -- vector storage features
```

### Create table to store vector embbedings
```sql
create table document_sections (
  id bigint primary key generated always as identity,
  document_id bigint not null references documents (id) on delete cascade,
  content text not null,
  embedding vector (384)
);

-- Attach policy
create policy "open to public" on "public"."document_sections" as PERMISSIVE for ALL to public using (true) with check (true);
-- Create Index
create index on document_sections using hnsw (embedding vector_ip_ops);
```

### Generate Embedding
```sql
CREATE OR REPLACE FUNCTION public.embed_content_function()
RETURNS TRIGGER AS $$
DECLARE
    content_column text = TG_ARGV[0];
    embedding_column text = TG_ARGV[1];
    batch_size int = case when array_length(TG_ARGV, 1) >= 3 then TG_ARGV[2]::int else 5 end;
    timeout_milliseconds int = case when array_length(TG_ARGV, 1) >= 4 then TG_ARGV[3]::int else 5 * 60 * 1000 end;
    batch_count int = ceiling((select count(*) from inserted) / batch_size::float);
BEGIN
    -- Loop through each batch and invoke an edge function to handle the embedding generation
  for i in 0 .. (batch_count-1) loop
  perform
    net.http_post(
      -- url := supabase_url() || '/functions/v1/embed',
      url := 'https://kpfexrubqxezymdvygtt.supabase.co/functions/v1/embed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'ids', (select json_agg(ds.id) from (select id from inserted limit batch_size offset i*batch_size) ds),
        'table', TG_TABLE_NAME,
        'contentColumn', content_column,
        'embeddingColumn', embedding_column
      ),
      timeout_milliseconds := timeout_milliseconds
    );
  end loop;

  return null;
END;
$$
LANGUAGE plpgsql;
```

### Create Trigger to embed document whenever new record is inserted in documents table
```sql
CREATE TRIGGER embed_document_sections
AFTER INSERT ON public.document_sections
referencing new TABLE AS inserted
FOR each STATEMENT
EXECUTE PROCEDURE public.embed_content_function(content, embedding, 5);
```

### Create function for vector search
```sql
create or replace function public.match_document_sections(
  embedding vector(384),
  match_threshold float,
  case_id bigint
)
returns setof document_sections
language plpgsql
as $$
#variable_conflict use_variable
begin
  return query
  select ds.*
  from document_sections ds
  join documents d on d.id = ds.document_id
  where (d.file_type = 'kb' or d.case_id = case_id)
    and ds.embedding <#> embedding < -match_threshold
  order by ds.embedding <#> embedding;
end;
$$;
```