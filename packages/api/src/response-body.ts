/** Inspect a full response body without leaving a cloned stream on the outgoing response. */
export async function readResponseBody(response: Response): Promise<{ response: Response; bytes: ArrayBuffer }> {
  if (response.body === null) return { response, bytes: new ArrayBuffer(0) }
  const bytes = await response.arrayBuffer()
  // Node 22's Response.clone finalizer can cancel a stream that Hono later moves to another Response.
  // Consuming the original and rebuilding from bytes gives the outgoing response independent ownership.
  return { response: new Response(bytes, response), bytes }
}
