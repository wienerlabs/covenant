/**
 * A2A JSON-RPC 2.0 message types and builders
 */
export interface A2ARequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: string;
}

export interface A2AResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
  id: string;
}

export type TaskState = "SUBMITTED" | "WORKING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface A2ATask {
  taskId: string;
  status: TaskState;
  capability: string;
  input: Record<string, unknown>;
  artifact?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function buildTaskCreateRequest(params: {
  capability: string;
  input: Record<string, unknown>;
  taskId?: string;
}): A2ARequest {
  return {
    jsonrpc: "2.0",
    method: "task/create",
    params,
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
  };
}

export function buildTaskStatusRequest(taskId: string): A2ARequest {
  return {
    jsonrpc: "2.0",
    method: "task/status",
    params: { taskId },
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
  };
}

export function buildA2AResponse(id: string, result: unknown): A2AResponse {
  return { jsonrpc: "2.0", result, id };
}

export function buildA2AError(id: string, code: number, message: string): A2AResponse {
  return { jsonrpc: "2.0", error: { code, message }, id };
}
