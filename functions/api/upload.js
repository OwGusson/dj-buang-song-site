export const onRequestPost = async (context) => {
  try {
    const formData = await context.request.formData()

    const file = formData.get("file")

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file uploaded" }),
        { status: 400 }
      )
    }

    const fileName = `${Date.now()}-${file.name}`

    await context.env.FILES.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type
      }
    })

    const fileUrl = `https://${context.request.headers.get(
      "host"
    )}/files/${fileName}`

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        fileUrl
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    )
  }
}