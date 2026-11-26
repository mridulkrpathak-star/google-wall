import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_ASPECT_RATIOS = new Set(['9:16', '16:9']);
const ALLOWED_DURATIONS = new Set(['5s', '8s', '10s']);

function getErrorDetails(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const upper = raw.toUpperCase();

  if (
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('API KEY')
  ) {
    return {
      status: 403,
      message:
        'Your Gemini API key was rejected or lacks permission for gemini-omni-1.2-flash. Select a billing-enabled API key in Settings > Secrets.',
    };
  }

  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('429')) {
    return {
      status: 429,
      message:
        'Quota exceeded for gemini-omni-1.2-flash. Select a billing-enabled paid API key in Settings > Secrets to use video generation.',
    };
  }

  return {
    status: 500,
    message: raw || 'Video generation failed unexpectedly.',
  };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  app.post('/api/animate-video', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured. Please add a billing-enabled API key in Settings > Secrets to generate videos with gemini-omni-1.2-flash.',
      });
      return;
    }

    const body = req.body ?? {};
    const rawImage = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg';
    const promptText =
      typeof body.prompt === 'string' && body.prompt.trim().length > 0
        ? body.prompt.trim().slice(0, 800)
        : 'Subtle cinematic portrait motion: gentle natural breeze through hair and fabric, soft drifting atmosphere in the background, smooth steady camera.';
    const aspectRatio =
      typeof body.aspectRatio === 'string' && ALLOWED_ASPECT_RATIOS.has(body.aspectRatio)
        ? (body.aspectRatio as '9:16' | '16:9')
        : '9:16';
    const duration =
      typeof body.duration === 'string' && ALLOWED_DURATIONS.has(body.duration)
        ? body.duration
        : '8s';

    if (!rawImage) {
      res.status(400).json({ error: 'Please upload or select a photo to animate.' });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({ error: 'Unsupported image format. Please use PNG, JPEG, or WebP.' });
      return;
    }

    const base64Data = rawImage.includes(',') ? rawImage.split(',')[1] : rawImage;
    if (!base64Data) {
      res.status(400).json({ error: 'Invalid base64 image payload.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            {
              type: 'image',
              mime_type: mimeType,
              data: base64Data,
            },
            {
              type: 'text',
              text: promptText,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart || (!videoPart.data && !videoPart.uri)) {
        res.status(502).json({
          error:
            'The model completed without returning a video clip. Try adjusting your prompt or image and retry.',
        });
        return;
      }

      const outMime = videoPart.mime_type || 'video/mp4';
      res.json({
        videoDataUrl: videoPart.data ? `data:${outMime};base64,${videoPart.data}` : null,
        videoUri: videoPart.uri ?? null,
        mimeType: outMime,
        aspectRatio,
        duration,
      });
    } catch (err) {
      console.error('[animate-video] error:', err);
      const { status, message } = getErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Wallpaper Maya server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
