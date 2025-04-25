import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function middleware(request: NextRequest) {
    // Create a Supabase client instance
    const supabase = await createClient()

    // Get the user's authentication status
    const { data: { user } } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname

    // Define public routes that don't require authentication
    const publicRoutes = ['/login', '/register']

    // Check for Supabase auth cookie directly (e.g., sb-access-token)
    const hasAuthCookie = request.cookies.has('sb-access-token')

    // If there's an auth cookie present and user is on a public route, redirect to home
    if (hasAuthCookie && publicRoutes.includes(path)) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    // If the user is not authenticated and trying to access a restricted route
    if (!user && !publicRoutes.includes(path)) {
        // Redirect to the login page
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // If the user is authenticated and trying to access a public route
    if (user && publicRoutes.includes(path)) {
        // Redirect to the home page
        return NextResponse.redirect(new URL('/', request.url))
    }

    // Otherwise, proceed with the request
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}