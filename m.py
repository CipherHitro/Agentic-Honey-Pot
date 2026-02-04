from google import genai

client = genai.Client(api_key="AIzaSyAL8gLblVAyw1A-470tRXQH9V8CAT3ZILs")

response = client.models.generate_content(
    model="gemini-1.5-pro",
    contents="Explain how AI works in a few words",
)

print(response.text)