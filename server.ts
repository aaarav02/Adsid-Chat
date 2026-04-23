import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        
        unsavedMessages.forEach(doc => {
          const data = doc.data();
          // Only delete if savedBy is empty or missing
          if (!data.savedBy || data.savedBy.length === 0) {
            batch.delete(doc.ref);
            deletedCount++;
          }
        });

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
