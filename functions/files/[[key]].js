export const onRequestGet = async (context) => {
  const key = context.params.key;
  const range = context.request.headers.get("range");

  const object = await context.env.FILES.get(key, {
    range: context.request.headers,
  });

  if (!object) {
    return new Response("File not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");

  if (object.range) {
    const end = object.range.offset + object.range.length - 1;
    headers.set(
      "content-range",
      `bytes ${object.range.offset}-${end}/${object.size}`
    );
    headers.set("content-length", String(object.range.length));
    return new Response(object.body, {
      status: range ? 206 : 200,
      headers,
    });
  }

  if (object.size != null) {
    headers.set("content-length", String(object.size));
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
};