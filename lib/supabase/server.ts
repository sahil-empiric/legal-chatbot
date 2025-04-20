import { createServerClient as serverClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SupabaseClient } from "@supabase/supabase-js";

class SupabaseServerClientSingleton {
    private static instance: SupabaseClient | null = null;
    private static url: string = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    private static key: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    private constructor() {}

    public static getInstance(cookieStore: ReturnType<typeof cookies>): SupabaseClient {
        if (!SupabaseServerClientSingleton.instance) {
            SupabaseServerClientSingleton.instance = serverClient(
                SupabaseServerClientSingleton.url,
                SupabaseServerClientSingleton.key,
                {
                    cookies: {
                        async getAll() {
                            return (await cookieStore).getAll();
                        },
                        async setAll(cookiesToSet) {
                            try {
                                cookiesToSet.forEach(async ({ name, value, options }) => 
                                    (await cookieStore).set(name, value, options)
                                );
                            } catch {
                                // The `setAll` method was called from a Server Component.
                                // This can be ignored if you have middleware refreshing
                                // user sessions.
                            }
                        },
                    },
                }
            );
        }
        return SupabaseServerClientSingleton.instance;
    }
}

export const createServerClient = (cookieStore: ReturnType<typeof cookies>) => 
    SupabaseServerClientSingleton.getInstance(cookieStore);
