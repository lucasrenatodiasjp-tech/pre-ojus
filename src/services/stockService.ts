import axios from 'axios';
import { StockData } from '../types.ts';
import { extractStockData as extractWithGemini } from './geminiService.ts';

const BRAPI_TOKEN = import.meta.env.VITE_BRAPI_TOKEN || "8UDXWPWZfD84PALhx4CAuH";
const FMP_API_KEY = import.meta.env.VITE_FMP_API_KEY || "";
const BRAPI_BASE_URL = 'https://brapi.dev/api';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export const getStockData = async (ticker: string): Promise<Partial<StockData>> => {
  const tickerUpper = ticker.toUpperCase();
  
  // 1. Try to get real-time data from Financial Modeling Prep (if configured)
  if (FMP_API_KEY) {
    try {
      console.log(`Fetching real-time data from FMP for ${tickerUpper}...`);
      // FMP usually requires .SA for Brazilian stocks
      const fmpTicker = tickerUpper.endsWith('.SA') ? tickerUpper : `${tickerUpper}.SA`;
      const response = await axios.get(`${FMP_BASE_URL}/quote/${fmpTicker}`, {
        params: { apikey: FMP_API_KEY }
      });

      const data = response.data[0];
      if (data) {
        console.log("FMP data received:", data);
        const fmpResult = {
          ticker: tickerUpper,
          currentPrice: data.price,
          lpa: data.eps || 0,
        };

        try {
          const geminiData = await extractWithGemini(tickerUpper);
          if ((geminiData as any).error) return fmpResult;
          return { ...geminiData, ...fmpResult };
        } catch {
          return fmpResult;
        }
      }
    } catch (error) {
      console.warn("FMP API failed, trying Brapi or Gemini:", error);
    }
  }

  // 2. Try to get real-time data from Brapi (if configured)
  if (BRAPI_TOKEN) {
    try {
      console.log(`Fetching real-time data from Brapi for ${tickerUpper}...`);
      const response = await axios.get(`${BRAPI_BASE_URL}/quote/${tickerUpper}`, {
        params: {
          token: BRAPI_TOKEN,
          fundamental: true
        }
      });

      if (!response.data || !response.data.results || response.data.results.length === 0) {
        console.warn(`Brapi returned no results for ${tickerUpper}`);
      } else {
        const data = response.data.results[0];
        console.log("Brapi data received:", data);
        
        // Map Brapi data to our structure
        const apiResult: Partial<StockData> = {
          ticker: tickerUpper,
          currentPrice: data.regularMarketPrice,
          // Brapi fundamental data mapping
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
            // Fill others with 0 or defaults if not available
            roa: 0,
            assetTurnover: 0,
            evEbitda: 0,
            evEbit: 0,
            earningYield: 0,
            revenueGrowth: 0,
            profitGrowth: 0,
            ebitGrowth: 0,
            netMargin: 0,
            ebitMargin: 0,
            grossMargin: 0,
            payout: 0,
            dlEbitda: 0,
            currentRatio: 0,
            quickRatio: 0,
            equityToAssets: 0,
          }
        };

        // If we have the core data, we can return it. 
        if (apiResult.currentPrice && apiResult.lpa && apiResult.vpa) {
          try {
            console.log("Brapi success, attempting to complement with Gemini...");
            const geminiData = await extractWithGemini(tickerUpper);
            
            if ((geminiData as any).error) {
              console.warn("Gemini failed during merge, using Brapi data only.");
              return apiResult;
            }

            return {
              ...geminiData,
              ...apiResult,
              indicators: {
                ...geminiData.indicators,
                ...apiResult.indicators
              }
            };
          } catch (mergeError) {
            return apiResult;
          }
        }
      }
    } catch (error) {
      console.warn("Brapi API failed or returned no data, falling back to Gemini:", error);
    }
  }

  // 2. Fallback to Gemini if API fails or is not configured
  return extractWithGemini(tickerUpper);
};
