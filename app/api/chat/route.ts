// app/api/chat/route.ts
import { NextResponse } from "next/server";
let openApiKey = process.env.OPENAI_API_KEY;

export async function POST(req: Request) {
  try {
    let body;

    // Parse request body
    try {
      body = await req.json();
    } catch (err) {
      console.error("❌ Failed to parse JSON body:", err);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { messages } = body || {};
    if (!messages || !Array.isArray(messages)) {
      console.error("❌ Missing or invalid `messages`:", messages);
      return NextResponse.json(
        { error: "`messages` must be provided as an array" },
        { status: 400 }
      );
    }

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-nano", // change as needed
          messages,
        }),
      });
    } catch (err) {
      console.error("❌ Network error calling OpenAI API:", err);
      return NextResponse.json(
        { error: "Failed to reach OpenAI API" },
        { status: 502 }
      );
    }

    // Handle OpenAI error responses
    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: await response.text() } };
      }

      // Always log full OpenAI error server-side
      console.error("❌ OpenAI API error:", response.status, errorData);

      // Map OpenAI error types to safe frontend messages
      const safeErrorMessage =
        errorData?.error?.message ||
        (response.status === 429
          ? "Rate limit exceeded. Please try again later."
          : response.status === 401
          ? "Unauthorized. Check API key."
          : response.status === 400
          ? "Invalid request to OpenAI API."
          : response.status >= 500
          ? "OpenAI server error. Please try again later."
          : "Unexpected error from OpenAI API.");

      return NextResponse.json(
        { error: safeErrorMessage },
        { status: response.status }
      );
    }

    // Parse success response
    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error("❌ Failed to parse OpenAI API response:", err);
      return NextResponse.json(
        { error: "Invalid JSON from OpenAI API" },
        { status: 502 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("❌ Unexpected server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
