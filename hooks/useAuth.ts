import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase/client';

const supabase = createBrowserClient();

export const useAuth = () => {

    const [session, setSession] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const signUp = async (email: string, password: string) => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        role: 'user'
                    }
                }
            });

            if (error) throw error;

            toast.success('Account created successfully! Please check your email to verify your account.');
            router.push('/login');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            setSession(data);
            toast.success('Logged in successfully!');
            router.push('/dashboard');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
        });
    }, []);

    return {
        signUp,
        signIn,
        isLoading,
        session
    };
};