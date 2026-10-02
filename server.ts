import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createGeminiApiMiddleware } from './src/server/geminiApi';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mount Gemini API and other custom backend routes
  app.use(createGeminiApiMiddleware());

  // Vite middleware for development vs static assets for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Dev: Mounted Vite middleware.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production: Serving static assets from dist/.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
