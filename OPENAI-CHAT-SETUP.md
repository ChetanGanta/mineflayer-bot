# NULL free AI chat setup

NULL uses Google's Gemini API with an eligible free-tier model. The default is `gemini-2.5-flash-lite`; Google lists free input and output for this model on its free tier. Free-tier quotas and model availability can change, and requests may be rate-limited.

## 1. Get a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/).
2. Sign in and create an API key.
3. Keep the key private. Do not commit it, send it in Minecraft chat, or paste it into public screenshots.

Google's free tier has usage limits. Do not upgrade to a paid tier or attach billing if you want to keep this project at ₹0. Google may use free-tier prompts and responses to improve its products; avoid sending private or sensitive information.

## 2. Configure the bot

Set this environment variable where the bot runs:

- `GEMINI_API_KEY`: your private API key
- `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash-lite`

### Windows CMD

For the current CMD window only:

```bat
set GEMINI_API_KEY=PASTE_YOUR_KEY_HERE
set GEMINI_MODEL=gemini-2.5-flash-lite
node bot.mjs
```

Replace the placeholder locally. Never share the key with anyone.

## Behavior

- Only configured operators (default: `UserZero`) receive AI conversational replies.
- NULL sends normal UserZero messages to Gemini with a short rolling conversation history.
- Replies are one short line, capped at 100 characters.
- `fight` and `stop` are handled by the existing game code, separately from AI.
- Slash commands and messages beginning with `!` are ignored.
- API errors and missing keys are logged locally; NULL does not spam public chat.

## Cost and limits

The code uses the Gemini free tier and does not call the OpenAI API. Google currently lists free input/output for the default model, but free quotas are limited and can change. Keep the project on the free tier and do not enable paid billing. See [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
