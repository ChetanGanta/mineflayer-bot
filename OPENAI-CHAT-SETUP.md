# NULL AI chat setup

NULL uses the OpenAI Responses API for short, in-character Minecraft chat replies.

## Required environment variables

Set these in the environment where the Mineflayer bot runs:

- `OPENAI_API_KEY`: your secret OpenAI API key
- `OPENAI_MODEL`: defaults to `gpt-6-luna`
- `OPENAI_API_URL`: defaults to `https://api.openai.com/v1/responses`

Do not put a real API key in this repository, a screenshot, or Minecraft chat.

## Windows CMD

For the current CMD window only:

```bat
set OPENAI_API_KEY=YOUR_KEY_HERE
set OPENAI_MODEL=gpt-6-luna
node bot.mjs
```

Replace `YOUR_KEY_HERE` locally. Do not paste the key into a public chat or commit it.

## Behavior

- Only names in `MC_OPERATORS` (default: `UserZero`) get AI conversational replies.
- Normal messages from UserZero are sent to OpenAI with a short rolling conversation history.
- Replies are limited to one short line (100 characters).
- `fight` and `stop` are handled by the existing command code before the AI chat handler, so they remain independent of the language model.
- Slash commands and messages beginning with `!` are ignored by the conversational model.
- If the API is unavailable or the key is missing, NULL logs the error locally and does not spam public chat.

OpenAI API usage is billed separately from a ChatGPT app subscription. Set a spending limit in the API billing dashboard before using it for a long SMP session.
