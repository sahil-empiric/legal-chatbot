"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createBrowserClient } from "@/lib/supabase/client"
import axios from "axios"
import { Loader2, SendIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Initialize Supabase client
const supabase = createBrowserClient();
const mistralApiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY!

// Initialize Mistral API client
const mistralAPI = axios.create({
  baseURL: 'https://api.mistral.ai/v1',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${mistralApiKey}`
  }
})

// Add retry logic with exponential backoff
mistralAPI.interceptors.response.use(null, async (error) => {
  const { config } = error
  config.retryCount = config.retryCount || 0
  const MAX_RETRIES = 3

  if (error.response?.status === 429 && config.retryCount < MAX_RETRIES) {
    config.retryCount += 1
    // Exponential backoff: 1s, 2s, 4s
    const delay = 1000 * Math.pow(2, config.retryCount - 1)
    await new Promise(resolve => setTimeout(resolve, delay))
    return mistralAPI(config)
  }
  return Promise.reject(error)
})

interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

interface SearchResult {
  id: number
  filename: string
  content: string
  similarity: number
}

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "You are an expert assistant for a file management system. Use the provided context to answer the user's question as accurately as possible. Format your responses using Markdown."
    },
    {
      role: "assistant",
      content: "Hello! How can I help you today? You can ask me questions about your files or search for specific information within them.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom of chat
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const searchDocuments = async (query: string) => {
    try {
      // Get embedding for search query
      const embeddingResponse = await axios.post(
        "https://dhvvdsnipzvahdienvsm.supabase.co/functions/v1/queryEmbed",
        {
          query: query,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return embeddingResponse.data as SearchResult[]
    } catch (error: any) {
      console.error("Search error:", error)
      throw error
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput("")
    setError(null)

    // Add user message to chat
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])

    setLoading(true)

    try {
      // Search for relevant documents
      const searchResults = await searchDocuments(userMessage)
      // Build context from search results
      let context = ""
      if (searchResults && searchResults.length > 0) {
        context = searchResults.map(r => `From ${r.filename}: ${r.content}`).join("\n\n")
      } else {
        const { data: files } = await supabase.storage.from("files").list()
        const fileNames = files?.map(file => file.name).join(", ") || "No files available"
        context = `No relevant documents found. Available files: ${fileNames}`
      }

      // Prepare messages for chat API
      const chatMessages = [
        messages[0], // System message
        ...messages.slice(1).filter(msg => msg.role !== "system"), // Previous conversation
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${userMessage}` }
      ]
      // Generate AI response
      const completionResponse = await mistralAPI.post("/chat/completions", {
        model: "mistral-small",
        messages: chatMessages,
        max_tokens: 512,
        temperature: 0.2,
      })
      const answer = completionResponse.data.choices[0]?.message?.content || "No answer generated."

      // Add AI response to chat
      setMessages((prev) => [...prev, { role: "assistant", content: answer }])
    } catch (error: any) {
      console.error("Error generating response:", error)
      setError(error.message || "Failed to generate response")
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm sorry, I encountered an error. Please try again later." },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border rounded-lg overflow-hidden flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => {
          // Skip system messages in the UI
          if (message.role === "system") return null

          return (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex gap-3 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8">
                  {message.role === "assistant" ? (
                    <>
                      <AvatarImage src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTz5uMnIudmvgyCgU7-dociht4oBz1sklU_U3F7H2L7JHsXAYcQzAhJjT2deJAzdVcM2Ig&usqp=CAU" />
                      <AvatarFallback>AI</AvatarFallback>
                    </>
                  ) : (
                    <>
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>You</AvatarFallback>
                    </>
                  )}
                </Avatar>
                <div
                  className={`rounded-lg p-3 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[80%]">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <div className="rounded-lg p-3 text-sm bg-muted flex items-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Thinking...
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center">
            <div className="text-sm text-red-500">
              Error: {error}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            <SendIcon className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  )
}