import axios from 'axios';
import { StockData } from '../types.ts';
import { extractStockData as extractWithGemini } from './geminiService.ts';

const BRAPI_TOKEN = import.meta.env.VITE_BRAPI_TOKEN || "8UDXWPWZfD84PALhx4CAuH";
const FMP_API_KEY = import.meta.env.VITE_FMP_API_KEY || "";
const BRAPI_BASE_URL = 'https://brapi.dev/api';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export const getStockData = async (ticker: string): Promise<Partial<StockData>> => {
  const tickerTrimmed = ticker.trim().toUpperCase();
  
  // 1. Try to get real-time data from Financial Modeling Prep (if configured)
  if (FMP_API_KEY) {
    try {
      console.log(`Fetching real-time data from FMP for ${tickerTrimmed}...`);
      const fmpTicker = tickerTrimmed.endsWith('.SA') ? tickerTrimmed : `${tickerTrimmed}.SA`;
      const response = await axios.get(`${FMP_BASE_URL}/quote/${fmpTicker}`, {
        params: { apikey: FMP_API_KEY }
      });

      const data = response.data[0];
      if (data) {
        console.log("FMP data received:", data);
        const fmpResult: Partial<StockData> = {
          ticker: tickerTrimmed,
          currentPrice: data.price,
          lpa: data.eps || 0,
        };

        try {
          const geminiData = await extractWithGemini(tickerTrimmed);
          if (!(geminiData as any).error) {
            return { ...geminiData, ...fmpResult };
          }
        } catch (e) {
          console.warn("Gemini complement failed for FMP, returning FMP only");
        }
        return fmpResult;
      }
    } catch (error) {
      console.warn("FMP API failed:", error);
    }
  }

  // 2. Try to get real-time data from Brapi (if configured)
  if (BRAPI_TOKEN) {
    try {
      console.log(`Fetching real-time data from Brapi for ${tickerTrimmed}...`);
      const response = await axios.get(`${BRAPI_BASE_URL}/quote/${tickerTrimmed}`, {
        params: {
          token: BRAPI_TOKEN,
          fundamental: true
        }
      });

      if (response.data?.results?.[0]) {
        const data = response.data.results[0];
        console.log("Brapi data received:", data);
        
        const apiResult: Partial<StockData> = {
          ticker: tickerTrimmed,
          currentPrice: data.regularMarketPrice,
          lpa: data.earningsPerShare || 0,
          vpa: data.bookValue || 0,
          dividendYield: (data.dividendYield || 0) / 100,
          dividaLiquida: data.netDebt || 0,
          acoesCirculacao: data.sharesOutstanding || 0,
          indicators: {
            roe: (data.returnOnEquity || 0) / 100,
            roic: (data.returnOnInvestedCapital || 0) / 100,
            pl: data.priceToEarnings || 0,
            pvp: data.priceToBook || 0,
            dy: (data.dividendYield || 0) / 100,
            lpa: data.earningsPerShare || 0,
            vpa: data.bookValue || 0,
            roa: 0, assetTurnover: 0, evEbitda: 0, evEbit: 0, earningYield: 0,
            revenueGrowth: 0, profitGrowth: 0, ebitGrowth: 0, netMargin: 0,
            ebitMargin: 0, grossMargin: 0, payout: 0, dlEbitda: 0,
            currentRatio: 0, quickRatio: 0, equityToAssets: 0,
          }
        };

        // If we have at least the price, we try to complement but don't fail if Gemini fails
        if (apiResult.currentPrice) {
          try {
            console.log("Brapi price found, attempting Gemini complement...");
            const geminiData = await extractWithGemini(tickerTrimmed);
            
            if (!(geminiData as any).error) {
              return {
                ...geminiData,
                ...apiResult,
                indicators: {
                  ...geminiData.indicators,
                  ...apiResult.indicators
                }
              };
            }
            console.warn("Gemini complement failed (quota?), returning Brapi data only.");
          } catch (e) {
            console.warn("Gemini complement error, returning Brapi data only.");
          }
          return apiResult;
        }
      } else {
        console.warn(`Brapi returned no results for ${tickerTrimmed}`);
      }
    } catch (error: any) {
      console.warn("Brapi API error:", error.response?.data || error.message);
    }
  }

  // 3. Last resort: Gemini only
  console.log("Falling back to Gemini as last resort...");
  return extractWithGemini(tickerTrimmed);
};
