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

  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "AIzaSyCUssz0tHGA2LsUXIOLvR1ql-yifNl3ILg";
  if (!apiKey || apiKey === "AIzaSyCUssz0tHGA2LsUXIOLvR1ql-yifNl3ILg") {
    console.info("Using provided fallback Gemini API key.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-latest", // Using latest stable flash for better tool reliability
      contents: `Extract current financial indicators for the Brazilian stock ${tickerUpper}. 
      Use Google Search to find data from reliable sources like StatusInvest, Fundamentus, or Analitica AUVP.
      
      Required fields (return as numbers, percentages as decimals):
      - currentPrice: Current stock price in BRL
      - lpa: Earnings per share (Lucro por Ação)
      - vpa: Book value per share (Valor Patrimonial por Ação)
      - dividendYield: DY % (e.g. 0.085 for 8.5%)
      - revenueGrowth: 5-year revenue growth %
      - profitGrowth: 5-year profit growth %
      - payout: Dividend payout ratio %
      - roe: Return on Equity %
      - roic: ROIC %
      - roa: ROA %
      - assetTurnover: Asset turnover ratio
      - pl: P/E ratio (Preço/Lucro)
      - pvp: P/B ratio (Preço/Valor Patrimonial)
      - evEbitda: EV/EBITDA
      - evEbit: EV/EBIT
      - earningYield: Earning Yield %
      - netMargin: Net margin %
      - ebitMargin: EBIT margin %
      - grossMargin: Gross margin %
      - dlEbitda: Net Debt / EBITDA
      - currentRatio: Liquidez Corrente
      - quickRatio: Liquidez Seca
      - equityToAssets: Equity / Total Assets
      - fcfAtual: Current Free Cash Flow (total value in BRL)
      - dividaLiquida: Net Debt (total value in BRL)
      - acoesCirculacao: Total shares outstanding
      - sector: One of "finance", "cyclical", "growth", "stable"
      - plSetor: Average P/E for the sector
      
      Return ONLY a valid JSON object.`,
      config: {
        systemInstruction: "You are a specialized financial data extractor for the Brazilian stock market. Use Google Search to get the most accurate and recent data. If one source is blocked or unavailable, try others. Always return percentages as decimals (e.g., 15% -> 0.15). Return ONLY JSON.",
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
            revenueGrowth: { type: Type.NUMBER },
            profitGrowth: { type: Type.NUMBER },
            payout: { type: Type.NUMBER },
            roe: { type: Type.NUMBER },
            roic: { type: Type.NUMBER },
            roa: { type: Type.NUMBER },
            assetTurnover: { type: Type.NUMBER },
            pl: { type: Type.NUMBER },
            pvp: { type: Type.NUMBER },
            evEbitda: { type: Type.NUMBER },
            evEbit: { type: Type.NUMBER },
            earningYield: { type: Type.NUMBER },
            netMargin: { type: Type.NUMBER },
            ebitMargin: { type: Type.NUMBER },
            grossMargin: { type: Type.NUMBER },
            dlEbitda: { type: Type.NUMBER },
            currentRatio: { type: Type.NUMBER },
            quickRatio: { type: Type.NUMBER },
            equityToAssets: { type: Type.NUMBER },
            fcfAtual: { type: Type.NUMBER },
            dividaLiquida: { type: Type.NUMBER },
            acoesCirculacao: { type: Type.NUMBER },
            sector: { type: Type.STRING, enum: ["finance", "cyclical", "growth", "stable"] },
            plSetor: { type: Type.NUMBER },
          },
          required: ["currentPrice", "lpa", "vpa", "dividendYield", "roe", "pl", "pvp", "fcfAtual", "dividaLiquida", "acoesCirculacao", "sector"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    
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
  } catch (e) {
    console.error("Error extracting stock data", e);
    return {};
  }
};
