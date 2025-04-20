import { createBrowserClient as browserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

class SupabaseClientSingleton {
    private static instance: SupabaseClient;
    private static url: string = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    private static key: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    private constructor() {}

    public static getInstance(): SupabaseClient {
        if (!SupabaseClientSingleton.instance) {
            SupabaseClientSingleton.instance = browserClient(
                SupabaseClientSingleton.url,
                SupabaseClientSingleton.key
            );
        }
        return SupabaseClientSingleton.instance;
    }
}

export const createBrowserClient = () => SupabaseClientSingleton.getInstance();
