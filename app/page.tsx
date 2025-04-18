import Link from "next/link"
import { Button } from "@/components/ui/button"
import PublicChatbot from "@/components/public-chatbot"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto py-4 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">FileChat</h1>
          <Link href="/login">
            <Button variant="outline">Admin Login</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl font-bold tracking-tight mb-4">Welcome to FileChat</h2>
            <p className="text-lg text-muted-foreground mb-6">
              Our intelligent chatbot is here to help answer your questions. Try it out by sending a message in the chat
              window.
            </p>
            <div className="flex gap-4">
              <Link href="#chat">
                <Button>Start Chatting</Button>
              </Link>
              <Link href="/about">
                <Button variant="outline">Learn More</Button>
              </Link>
            </div>
          </div>
          <div className="rounded-lg p-8 h-[400px] flex items-center justify-center overflow-hidden">
            <img src="/placeholder.svg?height=300&width=400" alt="Chatbot illustration" className="max-w-full h-auto" />
          </div>
        </div>

        <div id="chat" className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Chat with our AI Assistant</h2>
          <PublicChatbot />
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          &copy; {new Date().getFullYear()} FileChat. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
