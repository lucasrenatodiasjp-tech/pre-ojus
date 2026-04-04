export interface StockData {
  ticker: string;
  currentPrice: number;
  lpa: number; // Lucro por Ação
  vpa: number; // Valor Patrimonial por Ação
  dividendYield: number; // Rendimento de Dividendos %
  crescimentoLucro5A: number; // Crescimento do Lucro (Anos 1-5)
  payout: number; // % do Lucro que vira Caixa
  taxaRetornoDesejada: number; // Taxa de Retorno Desejada
  crescimentoPerpetuidade: number; // Crescimento na Perpetuidade
  plSetor: number; // P/L Médio do Setor
  roe: number; // Rentabilidade (ROE)
  score: number; // Nota Qualitativa
  
  // Novos campos para o Valuation Complementar (FCF)
  fcfAtual: number; // Fluxo de Caixa Livre Atual (R$)
  crescimentoFcf5A: number; // Taxa de Crescimento (Anos 1 a 5)
  crescimentoInfinito: number; // Crescimento Infinito
  taxaDescontoWACC: number; // Custo de Capital (Taxa de Desconto)
  dividaLiquida: number; // Dívidas menos Dinheiro em Caixa
  acoesCirculacao: number; // Total de ações da empresa
  
  // Setor para comparação de indicadores
  sector: 'finance' | 'cyclical' | 'growth' | 'stable';
  
  // Scores manuais para indicadores (Etapa 3)
  manualScores?: Record<string, number>;
  
  // Indicadores para a Etapa 3
  indicators: {
    roe: number;
    roic: number;
    roa: number;
    assetTurnover: number;
    pl: number;
    pvp: number;
    evEbitda: number;
    dy: number;
    evEbit: number;
    earningYield: number;
    lpa: number;
    vpa: number;
    revenueGrowth: number;
    profitGrowth: number;
    ebitGrowth: number;
    netMargin: number;
    ebitMargin: number;
    grossMargin: number;
    payout: number;
    dlEbitda: number;
    currentRatio: number;
    quickRatio: number;
    equityToAssets: number;
  };
  
  // Pesos para a média ponderada
  weights?: {
    priceWithMargin: number;
    graham: number;
    bazin: number;
    vpaMethod: number;
    valuationMultiples: number;
  };
}

export interface EnterpriseValuationResults {
  fluxosProjetados: { ano: number; fcf: number; fator: number; pv: number }[];
  somaPV5Anos: number;
  fcf6: number;
  valorTerminal: number;
  pvValorTerminal: number;
  enterpriseValue: number;
  equityValue: number;
  precoJustoFcf: number;
}

export interface IndicatorResult {
  key: keyof StockData['indicators'];
  name: string;
  value: number;
  label: string;
  explanation: string;
  reference: string;
  reason: string;
  score: number;
  color: 'red' | 'yellow' | 'green';
}

export interface IndicatorCategory {
  title: string;
  indicators: IndicatorResult[];
}

export interface ValuationResults {
  intrinsicValue: number;
  priceWithMargin: number;
  valuationMultiples: number;
  vpaMethod: number;
  graham: number;
  bazin: number;
  weightedAverage: number;
  finalFairPrice: number;
  marginOfSafety: number;
  gLucroCapped: number;
  gFcfCapped: number;
  enterpriseValuation?: EnterpriseValuationResults;
  indicatorScore: {
    total: number;
    status: 'red' | 'yellow' | 'green';
    categories: IndicatorCategory[];
  };
  finalAveragePrice: number;
}

export const calculateValuation = (data: StockData): ValuationResults => {
  const { 
    lpa, vpa, dividendYield, crescimentoLucro5A, payout, 
    taxaRetornoDesejada, crescimentoPerpetuidade, plSetor, roe, score, currentPrice,
    fcfAtual, crescimentoFcf5A, crescimentoInfinito, taxaDescontoWACC, dividaLiquida, acoesCirculacao
  } = data;

  // Regra de Ouro: Cap de Crescimento (G <= K - 2%)
  const gLucroCapped = Math.min(crescimentoLucro5A, taxaRetornoDesejada - 0.02);
  const gFcfCapped = Math.min(crescimentoFcf5A, taxaDescontoWACC - 0.02);

  const weights = data.weights || {
    priceWithMargin: 0.4,
    graham: 0.2,
    bazin: 0.2,
    vpaMethod: 0.1,
    valuationMultiples: 0.1
  };

  // --- MODELO 1: MÉDIA DE ANÁLISES (O que já existia) ---
  let sumPV5Years = 0;
  let currentLPA = lpa;
  for (let i = 1; i <= 5; i++) {
    const fcf = currentLPA * payout;
    const pv = fcf / Math.pow(1 + taxaRetornoDesejada, i);
    sumPV5Years += pv;
    currentLPA = currentLPA * (1 + gLucroCapped);
  }
  const fcf6_m1 = currentLPA * payout;
  const vt_m1 = (taxaRetornoDesejada - gLucroCapped) === 0 ? 0 : fcf6_m1 / (taxaRetornoDesejada - gLucroCapped);
  const pvVT_m1 = isFinite(vt_m1 / Math.pow(1 + taxaRetornoDesejada, 5)) ? vt_m1 / Math.pow(1 + taxaRetornoDesejada, 5) : 0;
  const intrinsicValue = (sumPV5Years + pvVT_m1) || 0;
  const priceWithMargin = intrinsicValue * 0.75;
  const valuationMultiples = (lpa * plSetor * 0.8) || 0;
  const vpaMethod = taxaRetornoDesejada === 0 ? 0 : (vpa * (roe / taxaRetornoDesejada)) || 0;
  const graham = Math.sqrt(Math.max(0, 22.5 * lpa * vpa)) || 0;
  const dyEmReal = currentPrice * dividendYield;
  const bazin = (dyEmReal / 0.07) || 0;
  
  const weightedAverage = 
    (priceWithMargin * weights.priceWithMargin) + 
    (graham * weights.graham) + 
    (bazin * weights.bazin) + 
    (vpaMethod * weights.vpaMethod) + 
    (valuationMultiples * weights.valuationMultiples);

  const finalFairPrice = weightedAverage * (0.45 + (score * 0.05));
  const marginOfSafety = ((finalFairPrice - currentPrice) / finalFairPrice) * 100;

  // --- MODELO 2: VALUATION COMPLEMENTAR (NOVO) ---
  const fluxosProjetados = [];
  let somaPV5Anos = 0;
  for (let i = 1; i <= 5; i++) {
    const fcf = fcfAtual * Math.pow(1 + gFcfCapped, i);
    const fator = Math.pow(1 + taxaDescontoWACC, i);
    const pv = fcf / fator;
    fluxosProjetados.push({ ano: i, fcf, fator, pv });
    somaPV5Anos += pv;
  }

  const fcf5 = fluxosProjetados[4].fcf;
  const fcf6 = fcf5 * (1 + crescimentoInfinito);
  const valorTerminal = (taxaDescontoWACC - crescimentoInfinito) === 0 ? 0 : fcf6 / (taxaDescontoWACC - crescimentoInfinito);
  const pvValorTerminal = isFinite(valorTerminal / Math.pow(1 + taxaDescontoWACC, 5)) ? valorTerminal / Math.pow(1 + taxaDescontoWACC, 5) : 0;
  const enterpriseValue = (somaPV5Anos + pvValorTerminal) || 0;
  const equityValue = enterpriseValue - dividaLiquida;
  const precoJustoFcf = acoesCirculacao === 0 ? 0 : (equityValue / acoesCirculacao) || 0;

  // --- ETAPA 3: INDICADORES ---
  const getSectorScore = (key: string, val: number): { score: number; color: 'red' | 'yellow' | 'green'; reason: string; reference: string } => {
    const sector = data.sector;
    
    // Se houver um score manual para este indicador, use-o
    if (data.manualScores && data.manualScores[key] !== undefined) {
      const manualScore = data.manualScores[key];
      return {
        score: manualScore,
        color: manualScore >= 1 ? 'green' : manualScore >= 0.5 ? 'yellow' : 'red',
        reason: 'Nota ajustada manualmente pelo usuário.',
        reference: 'Ajuste Manual'
      };
    }

    switch (key) {
      case 'roe':
      case 'roic':
        if (sector === 'stable') {
          const ref = 'Ruim < 10% | Médio 10-15% | Bom > 15%';
          if (val > 15) return { score: 1, color: 'green', reason: 'Excelente rentabilidade (> 15%).', reference: ref };
          if (val >= 10) return { score: 0.5, color: 'yellow', reason: 'Rentabilidade média (10% - 15%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Rentabilidade baixa (< 10%).', reference: ref };
        }
        if (sector === 'finance') {
          if (key === 'roe') {
            const ref = 'Ruim < 12% | Médio 12-18% | Bom > 18%';
            if (val > 18) return { score: 1, color: 'green', reason: 'Excelente ROE para bancos (> 18%).', reference: ref };
            if (val >= 12) return { score: 0.5, color: 'yellow', reason: 'ROE médio (12% - 18%).', reference: ref };
            return { score: 0, color: 'red', reason: 'ROE baixo (< 12%).', reference: ref };
          } else { // roic (mapped to ROIC/ROA in image)
            const ref = 'Ruim < 1.2% | Médio 1.2-2.0% | Bom > 2.0%';
            if (val > 2.0) return { score: 1, color: 'green', reason: 'Excelente ROIC/ROA (> 2.0%).', reference: ref };
            if (val >= 1.2) return { score: 0.5, color: 'yellow', reason: 'ROIC/ROA médio (1.2% - 2.0%).', reference: ref };
            return { score: 0, color: 'red', reason: 'ROIC/ROA baixo (< 1.2%).', reference: ref };
          }
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 8% | Médio 8-14% | Bom > 14%';
          if (val > 14) return { score: 1, color: 'green', reason: 'Boa rentabilidade para setor cíclico (> 14%).', reference: ref };
          if (val >= 8) return { score: 0.5, color: 'yellow', reason: 'Rentabilidade média (8% - 14%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Rentabilidade baixa (< 8%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 6% | Médio 6-12% | Bom > 12%';
          if (val > 12) return { score: 1, color: 'green', reason: 'Boa rentabilidade para crescimento (> 12%).', reference: ref };
          if (val >= 6) return { score: 0.5, color: 'yellow', reason: 'Rentabilidade média (6% - 12%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Rentabilidade baixa (< 6%).', reference: ref };
        }
        return val >= 15 ? { score: 1, color: 'green', reason: 'Bom retorno.', reference: 'Bom > 15%' } : { score: 0, color: 'red', reason: 'Retorno baixo.', reference: 'Bom > 15%' };

      case 'roa':
        if (sector === 'stable') {
          const ref = 'Ruim < 5% | Médio 5-8% | Bom > 8%';
          if (val > 8) return { score: 1, color: 'green', reason: 'Excelente ROA (> 8%).', reference: ref };
          if (val >= 5) return { score: 0.5, color: 'yellow', reason: 'ROA médio (5% - 8%).', reference: ref };
          return { score: 0, color: 'red', reason: 'ROA baixo (< 5%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 1.2% | Médio 1.2-2.0% | Bom > 2.0%';
          if (val > 2.0) return { score: 1, color: 'green', reason: 'Excelente ROA (> 2.0%).', reference: ref };
          if (val >= 1.2) return { score: 0.5, color: 'yellow', reason: 'ROA médio (1.2% - 2.0%).', reference: ref };
          return { score: 0, color: 'red', reason: 'ROA baixo (< 1.2%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 3% | Médio 3-6% | Bom > 6%';
          if (val > 6) return { score: 1, color: 'green', reason: 'Bom ROA (> 6%).', reference: ref };
          if (val >= 3) return { score: 0.5, color: 'yellow', reason: 'ROA médio (3% - 6%).', reference: ref };
          return { score: 0, color: 'red', reason: 'ROA baixo (< 3%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 4% | Médio 4-9% | Bom > 9%';
          if (val > 9) return { score: 1, color: 'green', reason: 'Bom ROA (> 9%).', reference: ref };
          if (val >= 4) return { score: 0.5, color: 'yellow', reason: 'ROA médio (4% - 9%).', reference: ref };
          return { score: 0, color: 'red', reason: 'ROA baixo (< 4%).', reference: ref };
        }
        return val >= 5 ? { score: 1, color: 'green', reason: 'Bom ROA.', reference: 'Bom > 5%' } : { score: 0, color: 'red', reason: 'ROA baixo.', reference: 'Bom > 5%' };

      case 'assetTurnover':
        if (sector === 'stable') {
          const ref = 'Ruim < 0.6x | Médio 0.6-1.2x | Bom > 1.2x';
          if (val > 1.2) return { score: 1, color: 'green', reason: 'Excelente giro (> 1.2x).', reference: ref };
          if (val >= 0.6) return { score: 0.5, color: 'yellow', reason: 'Giro médio (0.6x - 1.2x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Giro baixo (< 0.6x).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 0.1x | Médio 0.1-0.2x | Bom > 0.2x';
          if (val > 0.2) return { score: 1, color: 'green', reason: 'Giro adequado (> 0.2x).', reference: ref };
          if (val >= 0.1) return { score: 0.5, color: 'yellow', reason: 'Giro médio (0.1x - 0.2x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Giro baixo (< 0.1x).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 0.4x | Médio 0.4-0.8x | Bom > 0.8x';
          if (val > 0.8) return { score: 1, color: 'green', reason: 'Bom giro (> 0.8x).', reference: ref };
          if (val >= 0.4) return { score: 0.5, color: 'yellow', reason: 'Giro médio (0.4x - 0.8x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Giro baixo (< 0.4x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 0.5x | Médio 0.5-1.0x | Bom > 1.0x';
          if (val > 1.0) return { score: 1, color: 'green', reason: 'Bom giro (> 1.0x).', reference: ref };
          if (val >= 0.5) return { score: 0.5, color: 'yellow', reason: 'Giro médio (0.5x - 1.0x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Giro baixo (< 0.5x).', reference: ref };
        }
        return val >= 1.0 ? { score: 1, color: 'green', reason: 'Giro eficiente.', reference: 'Bom > 1.0x' } : { score: 0, color: 'red', reason: 'Giro ineficiente.', reference: 'Bom > 1.0x' };

      case 'pl':
        if (sector === 'stable') {
          const ref = 'Bom < 12x | Médio 12-18x | Caro > 18x';
          if (val < 12) return { score: 1, color: 'green', reason: 'P/L atrativo (< 12x).', reference: ref };
          if (val <= 18) return { score: 0.5, color: 'yellow', reason: 'P/L médio (12x - 18x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/L elevado (> 18x).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Bom < 8x | Médio 8-12x | Caro > 12x';
          if (val < 8) return { score: 1, color: 'green', reason: 'P/L barato (< 8x).', reference: ref };
          if (val <= 12) return { score: 0.5, color: 'yellow', reason: 'P/L médio (8x - 12x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/L caro (> 12x).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Bom < 7x | Médio 7-12x | Caro > 12x';
          if (val < 7) return { score: 1, color: 'green', reason: 'P/L atrativo para cíclico (< 7x).', reference: ref };
          if (val <= 12) return { score: 0.5, color: 'yellow', reason: 'P/L médio (7x - 12x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/L elevado (> 12x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Bom < 20x | Médio 20-45x | Caro > 45x';
          if (val < 20) return { score: 1, color: 'green', reason: 'P/L excelente para crescimento (< 20x).', reference: ref };
          if (val <= 45) return { score: 0.5, color: 'yellow', reason: 'P/L aceitável (20x - 45x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/L muito elevado (> 45x).', reference: ref };
        }
        return val <= 15 ? { score: 1, color: 'green', reason: 'P/L atrativo.', reference: 'Bom < 15x' } : { score: 0, color: 'red', reason: 'P/L caro.', reference: 'Bom < 15x' };

      case 'pvp':
        if (sector === 'stable') {
          const ref = 'Bom < 1.5x | Médio 1.5-2.5x | Caro > 2.5x';
          if (val < 1.5) return { score: 1, color: 'green', reason: 'P/VP atrativo (< 1.5x).', reference: ref };
          if (val <= 2.5) return { score: 0.5, color: 'yellow', reason: 'P/VP médio (1.5x - 2.5x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/VP elevado (> 2.5x).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Bom < 1.2x | Médio 1.2-2.0x | Caro > 2.0x';
          if (val < 1.2) return { score: 1, color: 'green', reason: 'P/VP barato (< 1.2x).', reference: ref };
          if (val <= 2.0) return { score: 0.5, color: 'yellow', reason: 'P/VP médio (1.2x - 2.0x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/VP caro (> 2.0x).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Bom < 1.0x | Médio 1.0-1.8x | Caro > 1.8x';
          if (val < 1.0) return { score: 1, color: 'green', reason: 'P/VP atrativo (< 1.0x).', reference: ref };
          if (val <= 1.8) return { score: 0.5, color: 'yellow', reason: 'P/VP médio (1.0x - 1.8x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/VP elevado (> 1.8x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Bom < 2.5x | Médio 2.5-5.0x | Caro > 5.0x';
          if (val < 2.5) return { score: 1, color: 'green', reason: 'P/VP excelente para crescimento (< 2.5x).', reference: ref };
          if (val <= 5.0) return { score: 0.5, color: 'yellow', reason: 'P/VP aceitável (2.5x - 5.0x).', reference: ref };
          return { score: 0, color: 'red', reason: 'P/VP muito elevado (> 5.0x).', reference: ref };
        }
        return val <= 2 ? { score: 1, color: 'green', reason: 'P/VP atrativo.', reference: 'Bom < 2x' } : { score: 0, color: 'red', reason: 'P/VP caro.', reference: 'Bom < 2x' };

      case 'evEbitda':
      case 'evEbit':
        if (sector === 'stable') {
          const ref = 'Bom < 8x | Médio 8-12x | Caro > 12x';
          if (val < 8) return { score: 1, color: 'green', reason: 'EV/EBITDA atrativo (< 8x).', reference: ref };
          if (val <= 12) return { score: 0.5, color: 'yellow', reason: 'EV/EBITDA médio (8x - 12x).', reference: ref };
          return { score: 0, color: 'red', reason: 'EV/EBITDA elevado (> 12x).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Bom < 6x | Médio 6-10x | Caro > 10x';
          if (val < 6) return { score: 1, color: 'green', reason: 'Múltiplo atrativo (< 6x).', reference: ref };
          if (val <= 10) return { score: 0.5, color: 'yellow', reason: 'Múltiplo médio (6x - 10x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Múltiplo elevado (> 10x).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Bom < 5x | Médio 5-8x | Caro > 8x';
          if (val < 5) return { score: 1, color: 'green', reason: 'EV/EBITDA atrativo (< 5x).', reference: ref };
          if (val <= 8) return { score: 0.5, color: 'yellow', reason: 'EV/EBITDA médio (5x - 8x).', reference: ref };
          return { score: 0, color: 'red', reason: 'EV/EBITDA elevado (> 8x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Bom < 15x | Médio 15-25x | Caro > 25x';
          if (val < 15) return { score: 1, color: 'green', reason: 'EV/EBITDA excelente para crescimento (< 15x).', reference: ref };
          if (val <= 25) return { score: 0.5, color: 'yellow', reason: 'EV/EBITDA aceitável (15x - 25x).', reference: ref };
          return { score: 0, color: 'red', reason: 'EV/EBITDA elevado (> 25x).', reference: ref };
        }
        return val <= 10 ? { score: 1, color: 'green', reason: 'Múltiplo atrativo.', reference: 'Bom < 10x' } : { score: 0, color: 'red', reason: 'Múltiplo caro.', reference: 'Bom < 10x' };

      case 'dy':
        if (sector === 'stable') {
          const ref = 'Ruim < 4% | Médio 4-7% | Bom > 7%';
          if (val > 7) return { score: 1, color: 'green', reason: 'Excelente Dividend Yield (> 7%).', reference: ref };
          if (val >= 4) return { score: 0.5, color: 'yellow', reason: 'Dividend Yield médio (4% - 7%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dividend Yield baixo (< 4%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 5% | Médio 5-8% | Bom > 8%';
          if (val > 8) return { score: 1, color: 'green', reason: 'Excelente Dividend Yield (> 8%).', reference: ref };
          if (val >= 5) return { score: 0.5, color: 'yellow', reason: 'Dividend Yield médio (5% - 8%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dividend Yield baixo (< 5%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 3% | Médio 3-6% | Bom > 6%';
          if (val > 6) return { score: 1, color: 'green', reason: 'Bom Dividend Yield (> 6%).', reference: ref };
          if (val >= 3) return { score: 0.5, color: 'yellow', reason: 'Dividend Yield médio (3% - 6%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dividend Yield baixo (< 3%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 0.1% | Médio 0.1-2% | Bom > 2%';
          if (val > 2) return { score: 1, color: 'green', reason: 'Bom Yield para crescimento (> 2%).', reference: ref };
          if (val >= 0.1) return { score: 0.5, color: 'yellow', reason: 'Yield baixo (0.1% - 2%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Sem dividendos (0%).', reference: ref };
        }
        return val >= 6 ? { score: 1, color: 'green', reason: 'Bom Yield.', reference: 'Bom > 6%' } : { score: 0, color: 'red', reason: 'Yield baixo.', reference: 'Bom > 6%' };

      case 'earningYield':
        if (sector === 'stable') {
          const ref = 'Ruim < 6% | Médio 6-10% | Bom > 10%';
          if (val > 10) return { score: 1, color: 'green', reason: 'Excelente Earnings Yield (> 10%).', reference: ref };
          if (val >= 6) return { score: 0.5, color: 'yellow', reason: 'Earnings Yield médio (6% - 10%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Earnings Yield baixo (< 6%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 8% | Médio 8-12% | Bom > 12%';
          if (val > 12) return { score: 1, color: 'green', reason: 'Excelente Earnings Yield (> 12%).', reference: ref };
          if (val >= 8) return { score: 0.5, color: 'yellow', reason: 'Earnings Yield médio (8% - 12%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Earnings Yield baixo (< 8%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 8% | Médio 8-15% | Bom > 15%';
          if (val > 15) return { score: 1, color: 'green', reason: 'Excelente Earnings Yield (> 15%).', reference: ref };
          if (val >= 8) return { score: 0.5, color: 'yellow', reason: 'Earnings Yield médio (8% - 15%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Earnings Yield baixo (< 8%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 3% | Médio 3-6% | Bom > 6%';
          if (val > 6) return { score: 1, color: 'green', reason: 'Bom Earnings Yield para crescimento (> 6%).', reference: ref };
          if (val >= 3) return { score: 0.5, color: 'yellow', reason: 'Earnings Yield médio (3% - 6%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Earnings Yield baixo (< 3%).', reference: ref };
        }
        return val >= 6 ? { score: 1, color: 'green', reason: 'Bom Yield.', reference: 'Bom > 6%' } : { score: 0, color: 'red', reason: 'Yield baixo.', reference: 'Bom > 6%' };

      case 'netMargin':
      case 'ebitMargin':
        if (sector === 'stable') {
          const ref = 'Ruim < 8% | Médio 8-15% | Bom > 15%';
          if (val > 15) return { score: 1, color: 'green', reason: 'Excelente margem (> 15%).', reference: ref };
          if (val >= 8) return { score: 0.5, color: 'yellow', reason: 'Margem média (8% - 15%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem baixa (< 8%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 12% | Médio 12-22% | Bom > 22%';
          if (val > 22) return { score: 1, color: 'green', reason: 'Excelente margem para bancos (> 22%).', reference: ref };
          if (val >= 12) return { score: 0.5, color: 'yellow', reason: 'Margem média (12% - 22%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem baixa (< 12%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 5% | Médio 5-12% | Bom > 12%';
          if (val > 12) return { score: 1, color: 'green', reason: 'Boa margem para setor cíclico (> 12%).', reference: ref };
          if (val >= 5) return { score: 0.5, color: 'yellow', reason: 'Margem média (5% - 12%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem baixa (< 5%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 6% | Médio 6-18% | Bom > 18%';
          if (val > 18) return { score: 1, color: 'green', reason: 'Boa margem para crescimento (> 18%).', reference: ref };
          if (val >= 6) return { score: 0.5, color: 'yellow', reason: 'Margem média (6% - 18%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem baixa (< 6%).', reference: ref };
        }
        return val >= 10 ? { score: 1, color: 'green', reason: 'Boa margem.', reference: 'Bom > 10%' } : { score: 0, color: 'red', reason: 'Margem baixa.', reference: 'Bom > 10%' };

      case 'grossMargin':
        if (sector === 'stable') {
          const ref = 'Ruim < 20% | Médio 20-40% | Bom > 40%';
          if (val > 40) return { score: 1, color: 'green', reason: 'Excelente margem bruta (> 40%).', reference: ref };
          if (val >= 20) return { score: 0.5, color: 'yellow', reason: 'Margem bruta média (20% - 40%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem bruta baixa (< 20%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 30% | Médio 30-50% | Bom > 50%';
          if (val > 50) return { score: 1, color: 'green', reason: 'Excelente margem bruta (> 50%).', reference: ref };
          if (val >= 30) return { score: 0.5, color: 'yellow', reason: 'Margem bruta média (30% - 50%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem bruta baixa (< 30%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 15% | Médio 15-30% | Bom > 30%';
          if (val > 30) return { score: 1, color: 'green', reason: 'Boa margem bruta (> 30%).', reference: ref };
          if (val >= 15) return { score: 0.5, color: 'yellow', reason: 'Margem bruta média (15% - 30%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem bruta baixa (< 15%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 40% | Médio 40-65% | Bom > 65%';
          if (val > 65) return { score: 1, color: 'green', reason: 'Excelente margem bruta (> 65%).', reference: ref };
          if (val >= 40) return { score: 0.5, color: 'yellow', reason: 'Margem bruta média (40% - 65%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Margem bruta baixa (< 40%).', reference: ref };
        }
        return val >= 25 ? { score: 1, color: 'green', reason: 'Boa margem bruta.', reference: 'Bom > 25%' } : { score: 0, color: 'red', reason: 'Margem bruta baixa.', reference: 'Bom > 25%' };

      case 'payout':
        if (sector === 'stable') {
          const ref = 'Ruim < 30% | Médio 30-60% | Bom > 60%';
          if (val > 60) return { score: 1, color: 'green', reason: 'Excelente payout (> 60%).', reference: ref };
          if (val >= 30) return { score: 0.5, color: 'yellow', reason: 'Payout médio (30% - 60%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Payout baixo (< 30%).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 30% | Médio 30-70% | Bom > 70%';
          if (val > 70) return { score: 1, color: 'green', reason: 'Excelente payout (> 70%).', reference: ref };
          if (val >= 30) return { score: 0.5, color: 'yellow', reason: 'Payout médio (30% - 70%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Payout baixo (< 30%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 20% | Médio 20-45% | Bom > 45%';
          if (val > 45) return { score: 1, color: 'green', reason: 'Bom payout (> 45%).', reference: ref };
          if (val >= 20) return { score: 0.5, color: 'yellow', reason: 'Payout médio (20% - 45%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Payout baixo (< 20%).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Bom < 20% | Médio 20-60% | Ruim > 60%';
          if (val < 20) return { score: 1, color: 'green', reason: 'Payout ideal para crescimento (< 20%).', reference: ref };
          if (val <= 60) return { score: 0.5, color: 'yellow', reason: 'Payout médio (20% - 60%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Payout muito elevado para crescimento (> 60%).', reference: ref };
        }
        return { score: 0.5, color: 'yellow', reason: 'Payout médio.', reference: 'Médio 30-60%' };

      case 'dlEbitda':
        if (sector === 'finance') return { score: 1, color: 'green', reason: 'Dívida não é métrica crítica para bancos.', reference: 'N/A para Bancos' };
        if (sector === 'stable') {
          const ref = 'Bom < 2.5x | Médio 2.5-3.5x | Ruim > 3.5x';
          if (val < 2.5) return { score: 1, color: 'green', reason: 'Dívida saudável (< 2.5x).', reference: ref };
          if (val <= 3.5) return { score: 0.5, color: 'yellow', reason: 'Dívida média (2.5x - 3.5x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dívida elevada (> 3.5x).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Bom < 1.5x | Médio 1.5-2.5x | Ruim > 2.5x';
          if (val < 1.5) return { score: 1, color: 'green', reason: 'Dívida saudável (< 1.5x).', reference: ref };
          if (val <= 2.5) return { score: 0.5, color: 'yellow', reason: 'Dívida média (1.5x - 2.5x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dívida elevada (> 2.5x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Bom < 1.5x | Médio 1.5-3.0x | Ruim > 3.0x';
          if (val < 1.5) return { score: 1, color: 'green', reason: 'Dívida saudável (< 1.5x).', reference: ref };
          if (val <= 3.0) return { score: 0.5, color: 'yellow', reason: 'Dívida média (1.5x - 3.0x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Dívida elevada (> 3.0x).', reference: ref };
        }
        return val <= 3 ? { score: 1, color: 'green', reason: 'Dívida controlada.', reference: 'Bom < 3x' } : { score: 0, color: 'red', reason: 'Dívida alta.', reference: 'Bom < 3x' };

      case 'currentRatio':
      case 'quickRatio':
        if (sector === 'stable') {
          const ref = 'Ruim < 1.0x | Médio 1.0-1.5x | Bom > 1.5x';
          if (val > 1.5) return { score: 1, color: 'green', reason: 'Excelente liquidez (> 1.5x).', reference: ref };
          if (val >= 1.0) return { score: 0.5, color: 'yellow', reason: 'Liquidez média (1.0x - 1.5x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Liquidez baixa (< 1.0x).', reference: ref };
        }
        if (sector === 'finance') {
          const ref = 'Ruim < 11% | Médio 11-15% | Bom > 15%';
          if (val > 15) return { score: 1, color: 'green', reason: 'Excelente liquidez/Basileia (> 15%).', reference: ref };
          if (val >= 11) return { score: 0.5, color: 'yellow', reason: 'Liquidez/Basileia média (11% - 15%).', reference: ref };
          return { score: 0, color: 'red', reason: 'Liquidez/Basileia baixa (< 11%).', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 1.2x | Médio 1.2-2.0x | Bom > 2.0x';
          if (val > 2.0) return { score: 1, color: 'green', reason: 'Boa liquidez (> 2.0x).', reference: ref };
          if (val >= 1.2) return { score: 0.5, color: 'yellow', reason: 'Liquidez média (1.2x - 2.0x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Liquidez baixa (< 1.2x).', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 1.5x | Médio 1.5-2.5x | Bom > 2.5x';
          if (val > 2.5) return { score: 1, color: 'green', reason: 'Boa liquidez (> 2.5x).', reference: ref };
          if (val >= 1.5) return { score: 0.5, color: 'yellow', reason: 'Liquidez média (1.5x - 2.5x).', reference: ref };
          return { score: 0, color: 'red', reason: 'Liquidez baixa (< 1.5x).', reference: ref };
        }
        return val >= 1.5 ? { score: 1, color: 'green', reason: 'Boa liquidez.', reference: 'Bom > 1.5x' } : { score: 0, color: 'red', reason: 'Liquidez baixa.', reference: 'Bom > 1.5x' };

      case 'revenueGrowth':
      case 'profitGrowth':
      case 'ebitGrowth':
        const growthRef = 'Ruim < 5% | Médio 5-15% | Bom > 15%';
        if (val > 15) return { score: 1, color: 'green', reason: 'Excelente crescimento (> 15%).', reference: growthRef };
        if (val >= 5) return { score: 0.5, color: 'yellow', reason: 'Crescimento moderado (5% - 15%).', reference: growthRef };
        return { score: 0, color: 'red', reason: 'Crescimento baixo ou negativo (< 5%).', reference: growthRef };

      case 'equityToAssets':
        if (sector === 'finance' || sector === 'stable') {
          const ref = 'Ruim < 10% | Bom > 10%';
          if (val >= 10 && val <= 30) return { score: 1, color: 'green', reason: 'PL/Ativos entre 10% e 30% indica alavancagem normal para o setor.', reference: ref };
          if (val > 30) return { score: 1, color: 'green', reason: 'PL/Ativos acima de 30% indica solidez.', reference: ref };
          return { score: 0.5, color: 'yellow', reason: 'PL/Ativos fora da faixa.', reference: ref };
        }
        if (sector === 'cyclical') {
          const ref = 'Ruim < 50% | Bom > 50%';
          if (val > 50) return { score: 1, color: 'green', reason: 'PL/Ativos acima de 50% é bom.', reference: ref };
          return { score: 0.5, color: 'yellow', reason: 'PL/Ativos aceitável.', reference: ref };
        }
        if (sector === 'growth') {
          const ref = 'Ruim < 50% | Médio 50-80% | Bom > 80%';
          if (val > 80) return { score: 1, color: 'green', reason: 'PL/Ativos acima de 80% é bom.', reference: ref };
          if (val >= 50) return { score: 0.5, color: 'yellow', reason: 'PL/Ativos aceitável.', reference: ref };
          return { score: 0, color: 'red', reason: 'PL/Ativos baixo.', reference: ref };
        }
        return val >= 50 ? { score: 1, color: 'green', reason: 'Boa Solvência.', reference: 'Bom > 50%' } : { score: 0, color: 'red', reason: 'Baixa Solvência.', reference: 'Bom > 50%' };

      default:
        return val >= 10 ? { score: 1, color: 'green', reason: 'Satisfatório.', reference: 'Bom > 10' } : { score: 0, color: 'red', reason: 'Insatisfatório.', reference: 'Bom > 10' };
    }
  };

  const categories: IndicatorCategory[] = [
    {
      title: 'Valuation (Rentabilidade)',
      indicators: [
        { key: 'roe', name: 'ROE', value: data.indicators.roe * 100, label: '%', explanation: 'Mede o lucro sobre o patrimônio líquido. Exemplo: ROE de 20% significa que cada R$ 100 de patrimônio gera R$ 20 de lucro líquido por ano.', ...getSectorScore('roe', data.indicators.roe * 100) },
        { key: 'roic', name: 'ROIC', value: data.indicators.roic * 100, label: '%', explanation: 'Retorno sobre o capital investido. Mede a eficiência da empresa em gerar lucro com o capital total (próprio + terceiros). Exemplo: ROIC de 15% mostra que para cada R$ 100 investidos no negócio, R$ 15 retornam como lucro operacional.', ...getSectorScore('roic', data.indicators.roic * 100) },
        { key: 'roa', name: 'ROA', value: data.indicators.roa * 100, label: '%', explanation: 'Retorno sobre os ativos. Indica o quão rentável a empresa é em relação ao seu total de ativos. Exemplo: ROA de 10% significa que a empresa gera R$ 10 de lucro para cada R$ 100 em ativos (máquinas, prédios, caixa).', ...getSectorScore('roa', data.indicators.roa * 100) },
        { key: 'assetTurnover', name: 'Giro do Ativo', value: data.indicators.assetTurnover, label: 'x', explanation: 'Mede a eficiência da empresa em usar seus ativos para gerar receita. Exemplo: Giro de 1.5x indica que a empresa gera R$ 1,50 em vendas para cada R$ 1,00 investido em ativos.', ...getSectorScore('assetTurnover', data.indicators.assetTurnover) },
      ]
    },
    {
      title: 'Rentabilidade (Múltiplos)',
      indicators: [
        { key: 'pl', name: 'P/L', value: data.indicators.pl, label: 'x', explanation: 'Preço sobre Lucro. Indica quantos anos levaria para recuperar o investimento através dos lucros. Exemplo: P/L de 10 significa que você pagaria 10 anos de lucro atual para comprar a empresa inteira.', ...getSectorScore('pl', data.indicators.pl) },
        { key: 'pvp', name: 'P/VP', value: data.indicators.pvp, label: 'x', explanation: 'Preço sobre Valor Patrimonial. Indica quanto o mercado paga pelo patrimônio líquido da empresa. Exemplo: P/VP de 1.0 significa que a empresa está sendo vendida exatamente pelo valor de seus bens contábeis.', ...getSectorScore('pvp', data.indicators.pvp) },
        { key: 'evEbitda', name: 'EV/EBITDA', value: data.indicators.evEbitda, label: 'x', explanation: 'Valor da Firma sobre EBITDA. Mede o valor da empresa em relação à sua geração de caixa operacional. Exemplo: Um EV/EBITDA baixo pode indicar que a empresa está barata em relação ao caixa que gera.', ...getSectorScore('evEbitda', data.indicators.evEbitda) },
        { key: 'evEbit', name: 'EV/EBIT', value: data.indicators.evEbit, label: 'x', explanation: 'Valor da Firma sobre EBIT. Similar ao EV/EBITDA, mas foca no lucro operacional após descontar a depreciação. Exemplo: Ajuda a entender a rentabilidade real do negócio principal.', ...getSectorScore('evEbit', data.indicators.evEbit) },
        { key: 'dy', name: 'DY', value: data.indicators.dy * 100, label: '%', explanation: 'Dividend Yield. O rendimento gerado por dividendos em relação ao preço da ação. Exemplo: DY de 6% significa que você recebeu R$ 6 em dividendos para cada R$ 100 investidos no último ano.', ...getSectorScore('dy', data.indicators.dy * 100) },
        { key: 'earningYield', name: 'Earning Yield', value: data.indicators.earningYield * 100, label: '%', explanation: 'Inverso do P/L. Representa a rentabilidade do lucro em relação ao preço. Exemplo: Earning Yield de 10% é o mesmo que um P/L de 10. Indica o retorno do lucro sobre o preço pago.', ...getSectorScore('earningYield', data.indicators.earningYield * 100) },
        { key: 'lpa', name: 'LPA', value: data.indicators.lpa, label: 'R$', explanation: 'Lucro por Ação. Parte do lucro líquido que cabe a cada ação. Exemplo: Se a empresa lucrou R$ 1 milhão e tem 1 milhão de ações, o LPA é R$ 1,00.', ...getSectorScore('lpa', data.indicators.lpa) },
        { key: 'vpa', name: 'VPA', value: data.indicators.vpa, label: 'R$', explanation: 'Valor Patrimonial por Ação. O valor contábil de cada ação. Exemplo: Se o patrimônio é R$ 10 milhões e há 1 milhão de ações, o VPA é R$ 10,00.', ...getSectorScore('vpa', data.indicators.vpa) },
      ]
    },
    {
      title: 'Crescimento (5 anos)',
      indicators: [
        { key: 'revenueGrowth', name: 'Receita Líquida', value: data.indicators.revenueGrowth * 100, label: '%', explanation: 'Crescimento médio anual da receita líquida nos últimos 5 anos.', ...getSectorScore('revenueGrowth', data.indicators.revenueGrowth * 100) },
        { key: 'profitGrowth', name: 'Lucro Líquido', value: data.indicators.profitGrowth * 100, label: '%', explanation: 'Crescimento médio anual do lucro líquido nos últimos 5 anos.', ...getSectorScore('profitGrowth', data.indicators.profitGrowth * 100) },
        { key: 'ebitGrowth', name: 'EBIT', value: data.indicators.ebitGrowth * 100, label: '%', explanation: 'Crescimento médio anual do lucro operacional (EBIT) nos últimos 5 anos.', ...getSectorScore('ebitGrowth', data.indicators.ebitGrowth * 100) },
      ]
    },
    {
      title: 'Margens',
      indicators: [
        { key: 'netMargin', name: 'Margem Líquida', value: data.indicators.netMargin * 100, label: '%', explanation: 'Percentual de lucro líquido em relação à receita líquida. Exemplo: Margem de 15% significa que de cada R$ 100 vendidos, sobram R$ 15 de lucro final.', ...getSectorScore('netMargin', data.indicators.netMargin * 100) },
        { key: 'ebitMargin', name: 'Margem EBIT', value: data.indicators.ebitMargin * 100, label: '%', explanation: 'Percentual de lucro operacional em relação à receita líquida. Exemplo: Indica a eficiência operacional antes de impostos e despesas financeiras.', ...getSectorScore('ebitMargin', data.indicators.ebitMargin * 100) },
        { key: 'grossMargin', name: 'Margem Bruta', value: data.indicators.grossMargin * 100, label: '%', explanation: 'Percentual de lucro bruto em relação à receita líquida. Exemplo: Margem de 40% mostra que o custo para produzir o produto/serviço é de R$ 60 para cada R$ 100 vendidos.', ...getSectorScore('grossMargin', data.indicators.grossMargin * 100) },
        { key: 'payout', name: 'Payout', value: data.indicators.payout * 100, label: '%', explanation: 'Percentual do lucro líquido distribuído aos acionistas. Exemplo: Payout de 50% significa que a empresa pagou metade do lucro como dividendos e reinvestiu a outra metade.', ...getSectorScore('payout', data.indicators.payout * 100) },
      ]
    },
    {
      title: 'Endividamento',
      indicators: [
        { key: 'dlEbitda', name: 'Dívida Líq./EBITDA', value: data.indicators.dlEbitda, label: 'x', explanation: 'Indica quantos anos de geração de caixa seriam necessários para pagar a dívida líquida. Exemplo: 2.0x significa que em 2 anos a empresa quitaria suas dívidas usando apenas seu caixa operacional.', ...getSectorScore('dlEbitda', data.indicators.dlEbitda) },
        { key: 'currentRatio', name: 'Liquidez Corrente', value: data.indicators.currentRatio, label: 'x', explanation: 'Capacidade de pagar obrigações de curto prazo com ativos de curto prazo. Exemplo: 2.0x significa que a empresa tem R$ 2,00 para cada R$ 1,00 que deve pagar no próximo ano.', ...getSectorScore('currentRatio', data.indicators.currentRatio) },
        { key: 'quickRatio', name: 'Liquidez Seca', value: data.indicators.quickRatio, label: 'x', explanation: 'Similar à liquidez corrente, mas exclui os estoques. Exemplo: Mostra a capacidade de pagamento imediato sem depender da venda de produtos parados.', ...getSectorScore('quickRatio', data.indicators.quickRatio) },
        { key: 'equityToAssets', name: 'PL / Ativos', value: data.indicators.equityToAssets * 100, label: '%', explanation: 'Percentual do total de ativos que é financiado pelo capital próprio. Exemplo: 40% indica que 40% da empresa pertence aos sócios e 60% é financiado por terceiros (dívidas).', ...getSectorScore('equityToAssets', data.indicators.equityToAssets * 100) },
      ]
    }
  ];

  const totalIndicatorScore = categories.reduce((acc, cat) => acc + cat.indicators.reduce((s, ind) => s + ind.score, 0), 0);
  let indicatorStatus: 'red' | 'yellow' | 'green' = 'red';
  if (totalIndicatorScore > 14) indicatorStatus = 'green';
  else if (totalIndicatorScore >= 8) indicatorStatus = 'yellow';

  return {
    intrinsicValue,
    priceWithMargin,
    valuationMultiples,
    vpaMethod,
    graham,
    bazin,
    weightedAverage,
    finalFairPrice,
    marginOfSafety,
    gLucroCapped,
    gFcfCapped,
    enterpriseValuation: {
      fluxosProjetados,
      somaPV5Anos,
      fcf6,
      valorTerminal,
      pvValorTerminal,
      enterpriseValue,
      equityValue,
      precoJustoFcf
    },
    indicatorScore: {
      total: totalIndicatorScore,
      status: indicatorStatus,
      categories
    },
    finalAveragePrice: (finalFairPrice + precoJustoFcf + (weightedAverage * (0.5 + (totalIndicatorScore / 23) * 0.5))) / 3
  };
};
