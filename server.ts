import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Create & edit images using gemini-nano-banana-2.1
app.post('/api/gemini/image-nano', async (req, res) => {
  try {
    const { prompt, base64Image, mimeType = 'image/png', aspectRatio = '9:16', imageSize = '1K' } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const ai = getGeminiClient();
    const parts: Array<Record<string, unknown>> = [];
    if (base64Image) {
      const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      });
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    });

    let imageUrl: string | null = null;
    let textNote = '';
    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        const outMime = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${outMime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        textNote += part.text;
      }
    }

    if (!imageUrl) {
      res.status(502).json({ error: 'Model completed without returning an image payload.', text: textNote });
      return;
    }

    res.json({ imageUrl, text: textNote, model: 'gemini-nano-banana-2.1' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate/edit image with gemini-nano-banana-2.1';
    res.status(500).json({ error: message });
  }
});

// 2. Generate high-quality 1K / 2K / 4K images using gemini-3-pro-image-preview
app.post('/api/gemini/image-pro', async (req, res) => {
  try {
    const { prompt, aspectRatio = '9:16', imageSize = '2K' } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const validSizes = ['1K', '2K', '4K'];
    const selectedSize = validSizes.includes(imageSize) ? imageSize : '1K';

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: selectedSize,
        },
      },
    });

    let imageUrl: string | null = null;
    let textNote = '';
    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        const outMime = part.inlineData.mimeType || 'image/png';
        imageUrl = `data:${outMime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        textNote += part.text;
      }
    }

    if (!imageUrl) {
      res.status(502).json({ error: 'No image returned from gemini-3-pro-image-preview.', text: textNote });
      return;
    }

    res.json({ imageUrl, text: textNote, imageSize: selectedSize, model: 'gemini-3-pro-image-preview' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate high-res image with gemini-3-pro-image-preview';
    res.status(500).json({ error: message });
  }
});

// 3. Animate images into video using gemini-omni-1.1-flash via the Interactions API
app.post('/api/gemini/animate-video', async (req, res) => {
  try {
    const { prompt, base64Image, mimeType = 'image/png', aspectRatio = '9:16', duration = '5s' } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Motion prompt is required.' });
      return;
    }

    const validAspect = aspectRatio === '16:9' ? '16:9' : '9:16';
    const ai = getGeminiClient();

    const inputParts: Array<Record<string, unknown>> = [];
    if (base64Image) {
      const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');
      inputParts.push({
        type: 'image',
        mime_type: mimeType,
        data: cleanBase64,
      });
    }
    inputParts.push({
      type: 'text',
      text: prompt,
    });

    const interaction = await ai.interactions.create(
      {
        model: 'gemini-omni-1.1-flash',
        input: inputParts as unknown as string,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: validAspect,
          duration: duration === '10s' ? '10s' : '5s',
          resolution: '720p',
        },
      } as unknown as Parameters<typeof ai.interactions.create>[0],
      { timeout: 300000 }
    );

    const videoPart = (interaction as unknown as { output_video?: { data?: string; uri?: string; mime_type?: string } }).output_video;
    if (videoPart?.data) {
      const outMime = videoPart.mime_type || 'video/mp4';
      res.json({
        videoUrl: `data:${outMime};base64,${videoPart.data}`,
        aspectRatio: validAspect,
        model: 'gemini-omni-1.1-flash',
      });
      return;
    }
    if (videoPart?.uri) {
      res.json({
        videoUrl: videoPart.uri,
        aspectRatio: validAspect,
        model: 'gemini-omni-1.1-flash',
      });
      return;
    }

    res.status(502).json({ error: 'No video output returned from gemini-omni-1.1-flash interaction.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to animate video with gemini-omni-1.1-flash';
    res.status(500).json({ error: message });
  }
});

// 4. Search Grounding using gemini-3.8-flash (with googleSearch tool)
app.post('/api/gemini/search-grounding', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query is required.' });
      return;
    }

    const ai = getGeminiClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are a vertical drama production researcher and ComfyUI technical specialist. Provide actionable reference notes, visual motifs, and custom node recommendations for: ${query}`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || '';
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((c: { web?: { uri?: string; title?: string } }) =>
        c.web ? { title: c.web.title || c.web.uri || 'Web Source', uri: c.web.uri || '' } : null
      )
      .filter(Boolean);

    res.json({ text, sources, model: 'gemini-3.8-flash' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search grounding failed';
    res.status(500).json({ error: message });
  }
});

// 5. Maps Grounding using gemini-3.8-flash (with googleMaps tool)
app.post('/api/gemini/maps-grounding', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Location query is required.' });
      return;
    }

    const ai = getGeminiClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Scout real-world architectural locations, vertical framing geometries, street textures, and lighting characteristics suitable as reference plates for a 9:16 vertical drama scene based on: ${query}`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || '';
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const places = chunks
      .map((c: { maps?: { uri?: string; title?: string } }) =>
        c.maps ? { title: c.maps.title || 'Map Reference', uri: c.maps.uri || '' } : null
      )
      .filter(Boolean);

    res.json({ text, places, model: 'gemini-3.8-flash' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Maps grounding failed';
    res.status(500).json({ error: message });
  }
});

// 6. High Thinking Storyboard & ComfyUI Architect using gemini-4-argon with ThinkingLevel.HIGH
app.post('/api/gemini/high-thinking', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const ai = getGeminiClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: `Context: ${JSON.stringify(context || {})}\n\nTask: ${prompt}`,
      config: {
        systemInstruction:
          'You are a Principal ComfyUI Pipeline Architect and Vertical Drama Showrunner (DramaBox / NetShorts format). Analyze the user storyboard, character spreadsheets, silent viseme lip-sync timing, and 9:16 camera pacing. Provide structured, production-ready scene breakdowns with exact [CHAR_*] and [STYLE_*] tags, frame counts at 24fps (targeting 2-5 minute episodes), and ComfyUI custom node wiring recommendations.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    res.json({ text: response.text || '', model: 'gemini-4-argon', thinkingLevel: 'HIGH' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'High-thinking analysis failed';
    res.status(500).json({ error: message });
  }
});

// 7. Fast task assistant using gemini-3.1-flash-lite
app.post('/api/gemini/fast-assist', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const ai = getGeminiClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a fast subtitle timing and ComfyUI tag formatter for silent 9:16 vertical dramas. Return concise, frame-accurate subtitle lines and character tags.',
      },
    });

    res.json({ text: response.text || '', model: 'gemini-3.1-flash-lite' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Fast assist failed';
    res.status(500).json({ error: message });
  }
});

// 8. Multi-turn Gemini Chatbot supporting gemini-4-argon, gemini-3.8-flash, and gemini-3.1-flash-lite
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages, modelMode = 'complex' } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required.' });
      return;
    }

    const modelMap: Record<string, string> = {
      complex: 'gemini-4-argon',
      general: 'gemini-3.8-flash',
      fast: 'gemini-3.1-flash-lite',
    };
    const selectedModel = modelMap[modelMode] || 'gemini-4-argon';

    const ai = getGeminiClient();
    const formattedHistory = messages.slice(0, -1).map((m: { role: string; text: string }) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));
    const latestMessage = messages[messages.length - 1]?.text || '';

    const config: Record<string, unknown> = {
      systemInstruction:
        'You are the VertiNode Studio Technical Director — an expert in local ComfyUI workflows (Flux.1, SDXL, SD1.5, LoRA stacking, IPAdapter character sheets, AnimateDiff camera curves), silent phoneme-to-viseme lip-syncing, and frame-synchronized subtitle automation for 2-to-5 minute 9:16 vertical drama series (DramaBox / NetShorts style) in Fantasy, Sci-Fi, and Cyberpunk settings.',
    };

    if (selectedModel === 'gemini-4-argon') {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    const chat = ai.chats.create({
      model: selectedModel,
      history: formattedHistory,
      config,
    });

    const response: GenerateContentResponse = await chat.sendMessage({
      message: latestMessage,
    });

    res.json({ text: response.text || '', model: selectedModel });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chatbot request failed';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VertiNode Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
