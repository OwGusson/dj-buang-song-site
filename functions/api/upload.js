export const onRequestPost = async (context) => {
  try {
    const formData = await context.request.formData();
    const file = formData.get("file");

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file uploaded" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const fileName = `${Date.now()}-${file.name}`;

    await context.env.FILES.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    const fileUrl = `https://${context.request.headers.get("host")}/files/${fileName}`;

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        fileUrl,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const onRequestDelete = async (context) => {
  try {
    const body = await context.request.json();
    const url = body?.url;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing file url" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    const prefix = "/files/";

    if (!pathname.startsWith(prefix)) {
      return new Response(
        JSON.stringify({ error: "Invalid file url" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const fileName = decodeURIComponent(pathname.slice(prefix.length));

    if (!fileName) {
      return new Response(
        JSON.stringify({ error: "Missing file name" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await context.env.FILES.delete(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};