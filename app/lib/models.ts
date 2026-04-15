/**
 * Available models for the agent builder.
 * Shared between the frontend (create page) and backend (test API route).
 */
export const AVAILABLE_MODELS = [
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", available: true, speed: "Fast", cost: "$" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", available: true, speed: "Medium", cost: "$$" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", available: true, speed: "Slow", cost: "$$$" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", available: false, speed: "Fast", cost: "$" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", available: false, speed: "Medium", cost: "$$" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", available: false, speed: "Medium", cost: "$$" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", available: false, speed: "Fast", cost: "$" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", available: false, speed: "Slow", cost: "$$$" },
  { id: "llama-4-scout", name: "Llama 4 Scout", provider: "meta", available: false, speed: "Fast", cost: "$" },
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "meta", available: false, speed: "Medium", cost: "$$" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "deepseek", available: false, speed: "Fast", cost: "$" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "deepseek", available: false, speed: "Slow", cost: "$$" },
  { id: "mistral-large", name: "Mistral Large", provider: "mistral", available: false, speed: "Medium", cost: "$$" },
  { id: "command-r-plus", name: "Command R+", provider: "cohere", available: false, speed: "Medium", cost: "$$" },
  { id: "qwen-2.5-72b", name: "Qwen 2.5 72B", provider: "alibaba", available: false, speed: "Medium", cost: "$$" },
  { id: "grok-3", name: "Grok 3", provider: "xai", available: false, speed: "Fast", cost: "$$" },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]["id"];
