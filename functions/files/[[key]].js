export const onRequestGet = async (context) => {
  const key = context.params.key

  const object = await context.env.FILES.get(key)

  if (!object) {
    return new Response("File not found", { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)

  return new Response(object.body, {
    headers
  })
}