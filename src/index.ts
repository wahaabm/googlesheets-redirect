import express, { Request, Response, NextFunction } from "express";
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";

const app = express();
const port = 3000;

dotenv.config();

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const SHEET_NAME = process.env.SHEET_NAME!;
const API_KEY = process.env.API_KEY!;

if (!SPREADSHEET_ID || !SHEET_NAME || !API_KEY) {
  throw new Error("Missing environment variables.");
}
// Cache for storing Google Sheets data
let cachedData: { redirect: string; link: string }[] = [];

// Function to fetch data from Google Sheets
async function fetchSheetData() {
  try {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, { apiKey: API_KEY });
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) {
      throw new Error(`Sheet with name "${SHEET_NAME}" not found.`);
    }
    const rows = await sheet.getRows();
    const updatedRows = rows
      .filter((row) => row.get("redirect") && row.get("link"))
      .map((row) => ({
        redirect: row.get("redirect").trim(),
        link: row.get("link").trim(),
      }));

    console.log("Fetched data:", updatedRows);
    return updatedRows;
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return [];
  }
}

// Function to refresh the cache periodically
async function refreshCache() {
  console.log("Refreshing cache...");
  cachedData = await fetchSheetData();
}

// Refresh the cache every 30 seconds
setInterval(refreshCache, 30 * 1000);

// Initial cache refresh on server start
refreshCache().then(() => {
  console.log("Initial cache refresh complete.");
});

// Middleware to handle redirects
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.path;
    let match = null;
    for (let i = 0; i < cachedData.length; i++) {
      const row = cachedData[i];
      console.log(`Checking path: ${path} against link: ${row.link}`);
      if (row.link === path) {
        match = row;
        break;
      }
    }

    if (match) {
      let redirectUrl = match.redirect;
      if (
        !redirectUrl.startsWith("http://") &&
        !redirectUrl.startsWith("https://")
      ) {
        redirectUrl = `https://${redirectUrl}`;
      }
      console.log(`Redirecting "${path}" to "${redirectUrl}"`);
      res.redirect(302, redirectUrl);
    } else {
      next();
    }
  } catch (error) {
    console.error("Error in redirect middleware:", error);
    next();
  }
});

app.use((req: Request, res: Response) => {
  res.status(404).send("Path not found.");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
