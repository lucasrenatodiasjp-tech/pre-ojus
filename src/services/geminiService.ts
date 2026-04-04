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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Using the latest, fastest model
      contents: `Extract stock indicators for ${tickerUpper} from https://analitica.auvp.com.br/acoes/${tickerUpper.toLowerCase()}. 
      Required: currentPrice, lpa, vpa, dividendYield, revenueGrowth, profitGrowth, payout, roe, roic, roa, assetTurnover, pl, pvp, evEbitda, evEbit, earningYield, netMargin, ebitMargin, grossMargin, dlEbitda, currentRatio, quickRatio, equityToAssets, fcfAtual, dividaLiquida, acoesCirculacao, sector, plSetor.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction: "JSON only. Source: Analitica AUVP. No search. Percentages as decimals (e.g. 0.05 for 5%).",
        tools: [{ urlContext: {} }],
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
