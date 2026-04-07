import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { StockData } from "../types.ts";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Persistent cache to avoid redundant API calls
const CACHE_KEY = 'stock_data_cache_v1';
const CACHE_EXPIRY = 1000 * 60 * 60 * 4; // 4 hours

const getCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCache = (ticker: string, data: Partial<StockData>) => {
  try {
    const cache = getCache();
    cache[ticker] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Failed to save to cache", e);
  }
};

export const extractStockData = async (ticker: string): Promise<Partial<StockData>> => {
  const tickerUpper = ticker.toUpperCase();
  
  // Check cache first
  const cache = getCache();
  if (cache[tickerUpper] && (Date.now() - cache[tickerUpper].timestamp < CACHE_EXPIRY)) {
    console.log(`Using cached data for ${tickerUpper}`);
    return cache[tickerUpper].data;
  }

  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "AIzaSyA4bmVY7KVy-gFfn7-g7Cademy8GkNewiA";
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    console.log(`Searching data for ${tickerUpper}...`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Search for the Brazilian stock ${tickerUpper} and return its current financial indicators.
      Sources: StatusInvest, Fundamentus, InfoMoney.
      
      Required JSON fields:
      - currentPrice (number)
      - lpa (number)
      - vpa (number)
      - dividendYield (number, e.g. 0.08)
      - roe (number, e.g. 0.15)
      - pl (number)
      - pvp (number)
      - sector (string: "finance", "cyclical", "growth", "stable")
      
      Optional (use 0 if not found): revenueGrowth, profitGrowth, payout, roic, fcfAtual, dividaLiquida, acoesCirculacao.`,
      config: {
        systemInstruction: "You are a financial data API. Return ONLY valid JSON. Use Google Search to find the latest data for the requested ticker. If you cannot find a specific value, provide a reasonable estimate based on the last 12 months. Percentages must be decimals.",
        tools: [
          { googleSearch: {} }
        ],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currentPrice: { type: Type.NUMBER },
            lpa: { type: Type.NUMBER },
            vpa: { type: Type.NUMBER },
            dividendYield: { type: Type.NUMBER },
            roe: { type: Type.NUMBER },
            pl: { type: Type.NUMBER },
            pvp: { type: Type.NUMBER },
            sector: { type: Type.STRING, enum: ["finance", "cyclical", "growth", "stable"] },
            revenueGrowth: { type: Type.NUMBER },
            profitGrowth: { type: Type.NUMBER },
            payout: { type: Type.NUMBER },
            roic: { type: Type.NUMBER },
            fcfAtual: { type: Type.NUMBER },
            dividaLiquida: { type: Type.NUMBER },
            acoesCirculacao: { type: Type.NUMBER },
          },
          required: ["currentPrice", "lpa", "vpa", "dividendYield", "roe", "pl", "pvp", "sector"],
        },
      },
    });

    console.log("Raw Gemini Response:", response);
    
    if (!response.text) {
      console.error("Gemini returned no text. Candidates:", response.candidates);
      throw new Error("Empty response from Gemini");
    }

    const data = JSON.parse(response.text);
    console.log("Data received:", data);
    
    // Map to StockData structure
    const result: Partial<StockData> = {
      ticker: tickerUpper,
      currentPrice: data.currentPrice,
      lpa: data.lpa,
      vpa: data.vpa,
      dividendYield: data.dividendYield,
      crescimentoLucro5A: data.profitGrowth || 0.05,
      payout: data.payout,
      roe: data.roe,
      plSetor: data.plSetor || 10,
      fcfAtual: data.fcfAtual,
      crescimentoFcf5A: data.profitGrowth || 0.05,
      dividaLiquida: data.dividaLiquida,
      acoesCirculacao: data.acoesCirculacao,
      sector: data.sector as any,
      indicators: {
        roe: data.roe || 0,
        roic: data.roic || 0,
        roa: data.roa || 0,
        assetTurnover: data.assetTurnover || 0,
        pl: data.pl || 0,
        pvp: data.pvp || 0,
        evEbitda: data.evEbitda || 0,
        dy: data.dividendYield || 0,
        evEbit: data.evEbit || 0,
        earningYield: data.earningYield || 0,
        lpa: data.lpa || 0,
        vpa: data.vpa || 0,
        revenueGrowth: data.revenueGrowth || 0,
        profitGrowth: data.profitGrowth || 0,
        ebitGrowth: data.profitGrowth || 0,
        netMargin: data.netMargin || 0,
        ebitMargin: data.ebitMargin || 0,
        grossMargin: data.grossMargin || 0,
        payout: data.payout || 0,
        dlEbitda: data.dlEbitda || 0,
        currentRatio: data.currentRatio || 0,
        quickRatio: data.quickRatio || 0,
        equityToAssets: data.equityToAssets || 0,
      }
    };

    // Save to cache
    setCache(tickerUpper, result);
    return result;
  } catch (e: any) {
    console.error("Error extracting stock data", e);
    return { error: e.message || "Erro desconhecido na extração" };
  }
};
