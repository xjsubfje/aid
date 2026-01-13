import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: string;
  content: string;
}

function validateMessages(messages: unknown): messages is ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }
  
  if (messages.length > 100) {
    return false;
  }
  
  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) {
      return false;
    }
    
    const { role, content } = msg as { role?: unknown; content?: unknown };
    
    if (typeof role !== 'string' || typeof content !== 'string') {
      return false;
    }
    
    if (!['user', 'assistant', 'system'].includes(role)) {
      return false;
    }
    
    if (content.length > 10000) {
      return false;
    }
  }
  
  return true;
}

// Parse task creation from AI response
function extractTaskFromResponse(response: string): { title: string; description?: string; dueDate?: string } | null {
  // Look for JSON task block in the response
  const taskMatch = response.match(/\[TASK_CREATED\]([\s\S]*?)\[\/TASK_CREATED\]/);
  if (taskMatch) {
    try {
      return JSON.parse(taskMatch[1].trim());
    } catch {
      return null;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client and verify the JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = body as { messages?: unknown };

    // Validate messages array
    if (!validateMessages(messages)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid messages format. Expected an array of messages with role (user/assistant) and content (max 10000 chars). Maximum 100 messages allowed.' 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Calling AI gateway with", messages.length, "messages for user:", userId);

    const systemPrompt = `You are a helpful and friendly virtual assistant. You can help with tasks, answer questions, provide information, and have conversations. Keep responses clear, concise, and helpful.

IMPORTANT: When a user asks you to create a task, reminder, or todo item, you MUST:
1. Create the task by including a special JSON block in your response
2. The block format is: [TASK_CREATED]{"title": "task title", "description": "optional description", "dueDate": "optional ISO date"}[/TASK_CREATED]
3. After the block, confirm to the user that you've created the task

Examples:
- "Create a task to buy groceries" → Include [TASK_CREATED]{"title": "Buy groceries"}[/TASK_CREATED] and say "I've created a task for you to buy groceries!"
- "Remind me to call mom tomorrow" → Include [TASK_CREATED]{"title": "Call mom", "dueDate": "${new Date(Date.now() + 86400000).toISOString()}"}[/TASK_CREATED] and confirm
- "Add a task: finish report by Friday with notes about quarterly data" → Include [TASK_CREATED]{"title": "Finish report", "description": "Notes about quarterly data", "dueDate": "...Friday's date..."}[/TASK_CREATED]

For due dates, calculate the actual date based on the current date. Today is ${new Date().toISOString().split('T')[0]}.

The task creation block will be hidden from the user - they will only see your confirmation message.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Create a TransformStream to process the response and extract tasks
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          await writer.write(value);
        }
        
        // After streaming is complete, check for task creation
        // Parse the full response to extract content
        const lines = fullResponse.split('\n');
        let content = "";
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.choices?.[0]?.delta?.content) {
                content += json.choices[0].delta.content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
        
        const taskData = extractTaskFromResponse(content);
        if (taskData && userId) {
          console.log("Creating task for user:", userId, taskData);
          await supabase.from('tasks').insert({
            user_id: userId,
            title: taskData.title,
            description: taskData.description || null,
            due_date: taskData.dueDate || null,
          });
        }
        
        await writer.close();
      } catch (error) {
        console.error("Stream processing error:", error);
        await writer.abort(error);
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
