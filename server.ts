import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";
import { v2 as cloudinary } from 'cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Firebase Admin if possible
  try {
    admin.initializeApp();
    console.log("Firebase Admin initialized");
  } catch (error) {
    console.error("Firebase Admin initialization failed. Server-side cleanup might not work.", error);
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/preview", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await axios.get(url, { 
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdsidBot/1.0)' }
      });
      const html = response.data;
      const $ = cheerio.load(html);

      // YouTube specific handling
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.includes('youtu.be') ? url.split('/').pop() : new URL(url).searchParams.get('v');
        if (videoId) {
          return res.json({
            title: $('meta[property="og:title"]').attr('content') || $('title').text() || "YouTube Video",
            description: $('meta[property="og:description"]').attr('content') || "",
            image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            url: url,
            isYoutube: true
          });
        }
      }

      const metadata = {
        title: $('meta[property="og:title"]').attr('content') || $('title').text() || url,
        description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || "",
        image: $('meta[property="og:image"]').attr('content') || "",
        url: url
      };

      res.json(metadata);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  });

  app.get("/api/upload-signature", (req, res) => {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.VITE_CLOUDINARY_CLOUD_NAME) {
      console.error("Cloudinary configuration missing in environment variables!");
      return res.status(500).json({ error: "Cloudinary not configured" });
    }
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp: timestamp },
      process.env.CLOUDINARY_API_SECRET!
    );
    res.json({ 
      timestamp, 
      signature, 
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.VITE_CLOUDINARY_CLOUD_NAME
    });
  });

  app.post("/api/delete-media", express.json(), async (req, res) => {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ error: "Missing public_id" });
    
    try {
      await cloudinary.uploader.destroy(public_id);
      res.json({ success: true });
    } catch (err) {
      console.error("Cloudinary destruction failed", err);
      res.status(500).json({ error: "Deletion failed" });
    }
  });

  // Background task for "Disappearing Chat" Cleanup
  // Deletes messages that are older than 10 minutes AND not saved by anyone
  setInterval(async () => {
    try {
      const db = admin.firestore();
      // Since we don't have indexes yet, we might need to be careful with complex queries
      // For now, let's just do a simple cleanup of older messages
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const chatsSnapshot = await db.collection("chats").get();
      for (const chatDoc of chatsSnapshot.docs) {
        const messagesRef = chatDoc.ref.collection("messages");
        const unsavedMessages = await messagesRef
          .where("timestamp", "<", tenMinutesAgo)
          .get();

        const batch = db.batch();
        let deletedCount = 0;
        
        for (const doc of unsavedMessages.docs) {
          const data = doc.data();
          if (!data.savedBy || data.savedBy.length === 0) {
            if (data.cloudinaryId) {
              await cloudinary.uploader.destroy(data.cloudinaryId).catch(err => console.error("Cloud cleanup failed", err));
            }
            batch.delete(doc.ref);
            deletedCount++;
          }
        }

        if (deletedCount > 0) {
          await batch.commit();
          console.log(`[Cleanup] Deleted ${deletedCount} messages in chat ${chatDoc.id}`);
        }
      }
    } catch (error) {
       // Silent error to prevent server crash if not configured correctly
       // console.error("[Cleanup Error]", error);
    }
  }, 60000); // Run every minute

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
