import React, { useState, useEffect, useMemo, FormEvent, useRef, useLayoutEffect, useCallback } from 'react';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  AlertTriangle,
  RefreshCw,
  Calculator,
  PieChart,
  BarChart3,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Target,
  Activity,
  Save,
  History,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StockData, ValuationResults, calculateValuation } from './types.ts';
import { extractStockData } from './services/geminiService.ts';
import { formatCompactNumber, parseCompactNumber, getScaleAndValue } from './utils.ts';

const DEFAULT_STOCK: StockData = {
  ticker: 'CMIG4',
  currentPrice: 12.61,
  lpa: 1.40,
  vpa: 12.28, // Ajustado para Graham resultar em ~19.65
  dividendYield: 0.104, // Ajustado para Bazin resultar em ~18.72 (1.31 / 12.61)
  crescimentoLucro5A: 0.08,
  payout: 0.35,
  taxaRetornoDesejada: 0.12,
  crescimentoPerpetuidade: 0.037,
  plSetor: 11.29,
  roe: 0.14,
  score: 5,
  // Novos campos para o Valuation Complementar (FCF)
  fcfAtual: 2600000000,
  crescimentoFcf5A: 0.08,
  crescimentoInfinito: 0.037,
  taxaDescontoWACC: 0.12,
  dividaLiquida: 1500000000,
  acoesCirculacao: 2200000000,
  sector: 'stable',
  indicators: {
    roe: 0.14,
    roic: 0.12,
    roa: 0.08,
    assetTurnover: 0.6,
    pl: 9.0,
    pvp: 1.0,
    evEbitda: 6.5,
    dy: 0.104,
    evEbit: 8.0,
    earningYield: 0.11,
    lpa: 1.40,
    vpa: 12.28,
    revenueGrowth: 0.09, // Independent
    profitGrowth: 0.08,  // Linked to valuation
    ebitGrowth: 0.07,    // Independent
    netMargin: 0.15,
    ebitMargin: 0.20,
    grossMargin: 0.35,
    payout: 0.35,
    dlEbitda: 1.5,
    currentRatio: 1.8,
    quickRatio: 1.2,
    equityToAssets: 0.45
  },
  weights: {
    priceWithMargin: 0.4,
    graham: 0.2,
    bazin: 0.2,
    vpaMethod: 0.1,
    valuationMultiples: 0.1
  }
};

const SCORES = [1, 3, 5, 7, 9, 11];

function CompactInput({ value, onChange, className }: { value: number, onChange: (val: number) => void, className?: string }) {
  const { value: initialNumeric, scale: initialScale } = getScaleAndValue(value);
  const [localValue, setLocalValue] = useState(initialNumeric.toString().replace('.', ','));
  const [scale, setScale] = useState(initialScale);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      const { value: newNumeric, scale: newScale } = getScaleAndValue(value);
      // Evita sobrescrever se o valor for numericamente o mesmo (considerando precisão)
      const currentTotal = parseCompactNumber(localValue) * scale;
      if (Math.abs(currentTotal - value) > 0.00001 || newScale !== scale) {
        setLocalValue(newNumeric.toString().replace('.', ','));
        setScale(newScale);
      }
    }
  }, [value]);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocalValue(text);
    
    let clean = text.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    if (!isNaN(parsed)) {
      onChange(parsed * scale);
    } else if (text === '') {
      onChange(0);
    }
  };

  const adjustValue = (delta: number) => {
    let clean = localValue.replace(/\./g, '').replace(',', '.');
    let parsed = parseFloat(clean) || 0;
    const newValue = Math.max(0, parsed + delta);
    setLocalValue(newValue.toString().replace('.', ','));
    onChange(newValue * scale);
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScale = parseInt(e.target.value);
    setScale(newScale);
    
    let clean = localValue.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    if (!isNaN(parsed)) {
      onChange(parsed * newScale);
    }
  };

  return (
    <div className="flex gap-2 w-full">
      <div className="relative flex-1 group">
        <input
          type="text"
          value={localValue}
          onChange={handleValueChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          className={`${className} w-full pr-8`}
          placeholder="0,00"
        />
        <div className="absolute right-1 top-1 bottom-1 flex flex-col gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => adjustValue(0.1)}
            className="flex-1 px-1 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-400 hover:text-indigo-600 transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button 
            onClick={() => adjustValue(-0.1)}
            className="flex-1 px-1 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-400 hover:text-indigo-600 transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>
      <select 
        value={scale} 
        onChange={handleScaleChange}
        className="px-2 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none min-w-[70px]"
      >
        <option value={1}>un</option>
        <option value={1000000}>mi</option>
        <option value={1000000000}>bi</option>
      </select>
    </div>
  );
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  onUndo?: () => void;
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [stock, setStock] = useState<StockData>(DEFAULT_STOCK);
  const [loading, setLoading] = useState(false);
  const [searchingSource, setSearchingSource] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showComposition, setShowComposition] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTickers, setSavedTickers] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success', onUndo?: () => void) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type, onUndo }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Load saved tickers on mount
  useEffect(() => {
    const saved = localStorage.getItem('saved_tickers');
    if (saved) {
      setSavedTickers(JSON.parse(saved));
    }
  }, []);

  const saveAnalysis = () => {
    const tickerName = stock.ticker.toUpperCase();
    if (!tickerName) return;

    const previousData = localStorage.getItem(`analysis_${tickerName}`);
    localStorage.setItem(`analysis_${tickerName}`, JSON.stringify(stock));
    
    if (!savedTickers.includes(tickerName)) {
      const newTickers = [...savedTickers, tickerName];
      setSavedTickers(newTickers);
      localStorage.setItem('saved_tickers', JSON.stringify(newTickers));
    }
    
    addToast(`Análise de ${tickerName} salva com sucesso!`, 'success', previousData ? () => {
      localStorage.setItem(`analysis_${tickerName}`, previousData);
      addToast(`Alteração em ${tickerName} desfeita.`, 'info');
    } : undefined);
  };

  const loadAnalysis = (tickerToLoad: string) => {
    const saved = localStorage.getItem(`analysis_${tickerToLoad}`);
    if (saved) {
      const data = JSON.parse(saved);
      setStock(data);
      setTicker(tickerToLoad);
      setShowHistory(false);
      goToStep(1);
      addToast(`Análise de ${tickerToLoad} carregada.`, 'info');
    }
  };

  const deleteAnalysis = (tickerToDelete: string) => {
    const deletedData = localStorage.getItem(`analysis_${tickerToDelete}`);
    localStorage.removeItem(`analysis_${tickerToDelete}`);
    const newTickers = savedTickers.filter(t => t !== tickerToDelete);
    setSavedTickers(newTickers);
    localStorage.setItem('saved_tickers', JSON.stringify(newTickers));
    
    addToast(`Análise de ${tickerToDelete} removida.`, 'success', () => {
      if (deletedData) {
        localStorage.setItem(`analysis_${tickerToDelete}`, deletedData);
        setSavedTickers(prev => [...prev, tickerToDelete]);
        localStorage.setItem('saved_tickers', JSON.stringify([...newTickers, tickerToDelete]));
        addToast(`Análise de ${tickerToDelete} restaurada.`, 'info');
      }
    });
  };

  const results = useMemo(() => calculateValuation(stock), [stock]);

  const handleSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!ticker) return;

    setLoading(true);
    setSearchingSource("Iniciando busca...");
    setError(null);
    try {
      // Check if it's in cache (extractStockData handles this, but we can show a faster message)
      setSearchingSource("Consultando base de dados...");
      
      const extracted = await extractStockData(ticker);
      
      if (extracted.currentPrice) {
        setSearchingSource("Sincronizando indicadores...");
        setStock(prev => ({
          ...prev,
          ...extracted,
          ticker: ticker.toUpperCase(),
        }));
        addToast(`Dados de ${ticker.toUpperCase()} atualizados!`, 'success');
      } else {
        setError("Não foi possível encontrar dados para este ticker. Verifique se o ticker está correto.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao conectar com as fontes de dados. Tente novamente.");
    } finally {
      setLoading(false);
      setSearchingSource(null);
    }
  };

  const updateField = (field: keyof StockData, value: any) => {
    const previousValue = stock[field];
    setStock(prev => {
      const safeValue = typeof value === 'number' ? (isNaN(value) ? 0 : value) : value;
      const next = { 
        ...prev, 
        [field]: safeValue,
        indicators: { ...prev.indicators } // Ensure immutability
      };
      
      // Sincronização de campos comuns
      if (field === 'crescimentoLucro5A' || field === 'crescimentoFcf5A') {
        next.crescimentoLucro5A = safeValue;
        next.crescimentoFcf5A = safeValue;
        next.indicators.profitGrowth = safeValue;
      }
      
      if (field === 'taxaRetornoDesejada' || field === 'taxaDescontoWACC') {
        next.taxaRetornoDesejada = safeValue;
        next.taxaDescontoWACC = safeValue;
      }
      
      if (field === 'crescimentoPerpetuidade' || field === 'crescimentoInfinito') {
        next.crescimentoPerpetuidade = safeValue;
        next.crescimentoInfinito = safeValue;
      }

      if (field === 'lpa') next.indicators.lpa = next.lpa;
      if (field === 'vpa') next.indicators.vpa = next.vpa;
      if (field === 'dividendYield') next.indicators.dy = next.dividendYield;
      if (field === 'payout') next.indicators.payout = next.payout;
      if (field === 'roe') next.indicators.roe = next.roe;
      
      return next;
    });

    if (field === 'sector' && previousValue !== value) {
      addToast(`Setor alterado para ${value}.`, 'info', () => {
        setStock(prev => ({ ...prev, [field]: previousValue }));
      });
    }
  };

  const updateManualScore = (key: string, score: number) => {
    const previousScore = stock.manualScores?.[key];
    setStock(prev => ({
      ...prev,
      manualScores: {
        ...(prev.manualScores || {}),
        [key]: score
      }
    }));
    
    if (previousScore !== undefined && previousScore !== score) {
      addToast(`Nota de ${key} alterada para ${score}.`, 'info', () => {
        setStock(prev => ({
          ...prev,
          manualScores: {
            ...(prev.manualScores || {}),
            [key]: previousScore
          }
        }));
      });
    }
  };

  const updateIndicator = (field: keyof StockData['indicators'], value: number) => {
    setStock(prev => {
      const safeValue = isNaN(value) ? 0 : value;
      const next = {
        ...prev,
        indicators: {
          ...prev.indicators,
          [field]: safeValue
        }
      };

      // Sync back to top-level fields
      if (field === 'roe') next.roe = safeValue;
      if (field === 'lpa') next.lpa = safeValue;
      if (field === 'vpa') next.vpa = safeValue;
      if (field === 'dy') next.dividendYield = safeValue;
      if (field === 'payout') next.payout = safeValue;
      if (field === 'profitGrowth') {
        next.crescimentoLucro5A = safeValue;
        next.crescimentoFcf5A = safeValue;
      }

      return next;
    });
  };

  const updateWeight = (field: keyof NonNullable<StockData['weights']>, value: number) => {
    setStock(prev => ({
      ...prev,
      weights: {
        ...(prev.weights || {
          priceWithMargin: 0.4,
          graham: 0.2,
          bazin: 0.2,
          vpaMethod: 0.1,
          valuationMultiples: 0.1
        }),
        [field]: value
      }
    }));
  };

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [activeMethodology, setActiveMethodology] = useState<string | null>(null);

  const goToStep = (newStep: number) => {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  const getMarginColor = (margin: number) => {
    if (margin > 20) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (margin > 0) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  const StepNavigation = ({ currentStep, onNext, onPrev, isLast }: { currentStep: number, onNext?: () => void, onPrev?: () => void, isLast?: boolean }) => (
    <div className="flex justify-between items-center mt-12 pt-8 border-t border-gray-100">
      {onPrev ? (
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100"
        >
          <ArrowLeft className="w-4 h-4" />
          Anterior
        </button>
      ) : <div />}
      
      {onNext && !isLast && (
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Próximo
          <ArrowRight className="w-4 h-4" />
        </button>
      ) || isLast && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-200 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Voltar ao Topo
          <ChevronUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Calculator className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Preço Justo Pro</h1>
          </div>
          
          <form onSubmit={handleSearch} className="relative w-full max-w-md ml-8">
            <input
              type="text"
              placeholder="Digite o ticker (ex: CMIG4, PETR4)..."
              className="w-full bg-gray-100 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
            <button 
              type="submit"
              disabled={loading}
              className="absolute right-1.5 top-1.5 bg-indigo-600 text-white p-1 rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all flex items-center gap-2"
                title="Histórico de Análises"
              >
                <History className="w-5 h-5" />
                {savedTickers.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                    {savedTickers.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[60]"
                  >
                    <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Análises Salvas</h3>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {savedTickers.length === 0 ? (
                        <div className="p-8 text-center">
                          <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-xs text-gray-400">Nenhuma análise salva ainda.</p>
                        </div>
                      ) : (
                        savedTickers.map(t => (
                          <div key={t} className="group flex items-center justify-between p-3 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0">
                            <button 
                              onClick={() => loadAnalysis(t)}
                              className="flex-1 text-left"
                            >
                              <span className="text-sm font-bold text-gray-700">{t}</span>
                            </button>
                            <button 
                              onClick={() => deleteAnalysis(t)}
                              className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <span>Análise Comportamental</span>
              <div className="w-1 h-1 bg-gray-300 rounded-full" />
              <span>Valuation Ponderado</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Inputs Section */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Parâmetros de Entrada
                </h2>
                <button 
                  onClick={saveAnalysis}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all"
                  title="Salvar Análise Atual"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar
                </button>
              </div>
              <div className="p-6 space-y-5">
                {searchingSource && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping" />
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                      {searchingSource}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Preço Atual
                      <InfoTooltip 
                        title="Preço de Mercado" 
                        content="É o valor pelo qual a ação está sendo negociada na bolsa agora." 
                        example="Se você comprar 1 ação hoje, pagará este valor."
                      />
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-400 text-sm">R$</span>
                      <input 
                        type="number" 
                        value={stock.currentPrice}
                        onChange={(e) => updateField('currentPrice', parseFloat(e.target.value))}
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Lucro por Ação (LPA)
                      <InfoTooltip 
                        title="Lucro por Ação" 
                        content="O lucro total da empresa dividido pelo número de ações. Indica quanto de lucro cada 'pedacinho' da empresa gerou." 
                        example="Se a empresa lucrou R$ 1 milhão e tem 1 milhão de ações, o LPA é R$ 1,00."
                      />
                    </label>
                    <input 
                      type="number" 
                      value={stock.lpa}
                      onChange={(e) => updateField('lpa', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Valor Patrimonial (VPA)
                      <InfoTooltip 
                        title="Valor Patrimonial" 
                        content="Se a empresa vendesse tudo o que tem e pagasse as dívidas, quanto sobraria para cada ação. É o valor contábil real." 
                        example="O valor dos prédios, máquinas e caixa dividido pelas ações."
                      />
                    </label>
                    <input 
                      type="number" 
                      value={stock.vpa}
                      onChange={(e) => updateField('vpa', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Dividend Yield %
                      <InfoTooltip 
                        title="Dividend Yield" 
                        content="Quanto a empresa pagou de dinheiro vivo aos sócios nos últimos 12 meses em relação ao preço atual da ação." 
                        example="Como se fosse o 'aluguel' mensal que você recebe por ter a ação."
                      />
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={Math.round(stock.dividendYield * 10000) / 100}
                      onChange={(e) => updateField('dividendYield', parseFloat(e.target.value) / 100)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Rentabilidade (ROE) %
                      <InfoTooltip 
                        title="Rentabilidade (ROE)" 
                        content="O quanto a empresa consegue lucrar usando o próprio dinheiro dos sócios (Patrimônio Líquido)." 
                        example="Um ROE de 20% significa que a cada R$ 100 investidos pelos sócios, ela gera R$ 20 de lucro."
                      />
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={Math.round(stock.roe * 10000) / 100}
                      onChange={(e) => updateField('roe', parseFloat(e.target.value) / 100)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      P/L Médio do Setor
                      <InfoTooltip 
                        title="Preço/Lucro Médio" 
                        content="Quantas vezes o lucro anual o mercado costuma pagar por empresas deste mesmo ramo de atuação." 
                        example="Se o setor é 10, o mercado paga 10 anos de lucro pela empresa."
                      />
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={stock.plSetor}
                      onChange={(e) => updateField('plSetor', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Taxa Retorno Desejada %
                      <InfoTooltip 
                        title="Taxa de Retorno Desejada" 
                        content="O quanto você exige ganhar por ano para aceitar o risco de investir nesta ação específica." 
                        example="Se a Selic é 10%, você pode querer 12% ou 15% na bolsa para compensar o risco."
                      />
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={Math.round(stock.taxaRetornoDesejada * 10000) / 100}
                      onChange={(e) => updateField('taxaRetornoDesejada', parseFloat(e.target.value) / 100)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                      Distribuição (Payout) %
                      <InfoTooltip 
                        title="Distribuição (Payout)" 
                        content="A porcentagem do lucro líquido que a empresa distribui aos sócios em vez de reinvestir no negócio." 
                        example="Se lucrou R$ 100 e pagou R$ 35 em dividendos, o Payout é 35%."
                      />
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={Math.round(stock.payout * 10000) / 100}
                      onChange={(e) => updateField('payout', parseFloat(e.target.value) / 100)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                    <span className="flex items-center">
                      Crescimento Lucro (5A)
                      <InfoTooltip 
                        title="Crescimento Lucro (5A)" 
                        content="O quanto você estima que o lucro da empresa vai crescer por ano nos próximos 5 anos." 
                        example="8% ao ano é uma estimativa conservadora para boas empresas."
                      />
                    </span>
                    <span className="flex items-center gap-1.5">
                      {(stock.crescimentoLucro5A * 100).toFixed(1)}%
                      {results.gLucroCapped < stock.crescimentoLucro5A && (
                        <span 
                          className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black animate-pulse cursor-help" 
                          title={`Teto aplicado: ${(results.gLucroCapped * 100).toFixed(1)}% (Regra: G <= Retorno - 2%)`}
                        >
                          CAP
                        </span>
                      )}
                    </span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max="0.3" 
                    step="0.01"
                    value={stock.crescimentoLucro5A}
                    onChange={(e) => updateField('crescimentoLucro5A', parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                    <span className="flex items-center">
                      Crescimento Perpétuo
                      <InfoTooltip 
                        title="Crescimento Perpétuo" 
                        content="O quanto você acha que a empresa vai crescer do ano 6 até o infinito (geralmente acompanha a inflação do país)." 
                        example="Geralmente entre 3% e 5% para empresas maduras."
                      />
                    </span>
                    <span>{(stock.crescimentoPerpetuidade * 100).toFixed(1)}%</span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max="0.15" 
                    step="0.01"
                    value={stock.crescimentoPerpetuidade}
                    onChange={(e) => updateField('crescimentoPerpetuidade', parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Score Qualitativo (Fator de Risco)</label>
                  <div className="flex justify-between gap-1">
                    {SCORES.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateField('score', s)}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border ${
                          stock.score === s 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' 
                            : 'bg-white text-gray-400 border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 italic text-center">
                    Quanto maior a nota, maior a confiança qualitativa na empresa.
                  </p>
                </div>
              </div>
            </section>

            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-3">
              <Info className="w-5 h-5 text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-800 leading-relaxed">
                <strong>Dica:</strong> O score qualitativo ajusta a média ponderada final. Notas baixas (1-3) penalizam o preço justo por incerteza.
              </p>
            </div>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-8 space-y-6">
            {/* Step Indicator */}
            <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-2 mb-6">
              <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide px-2">
                {[1, 2, 3, 4].map((s) => (
                  <React.Fragment key={s}>
                    <button 
                      onClick={() => goToStep(s)}
                      className={`flex items-center gap-3 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 ${step === s ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                    >
                      <span className={`w-5 h-5 rounded-lg flex items-center justify-center border text-[9px] ${step === s ? 'border-white/30 bg-white/10' : 'border-gray-200 bg-gray-50'}`}>{s}</span>
                      {s === 1 ? 'Preço Justo' : s === 2 ? 'Valuation FCF' : s === 3 ? 'Indicadores' : 'Conclusão'}
                    </button>
                    {s < 4 && <div className="h-px flex-1 min-w-[20px] bg-gray-100 hidden md:block" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              {step === 1 ? (
                <motion.div
                  key="step1"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="space-y-6"
                >
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                          <Target className="w-4 h-4" /> Preço Justo e Margem de Segurança
                        </h2>
                        <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wider">Cálculo baseado em múltiplas metodologias de mercado</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setShowDetails(!showDetails)}
                          className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-2 rounded-lg"
                        >
                          {showDetails ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        <button 
                          onClick={() => goToStep(2)}
                          className="flex items-center gap-2 text-[10px] font-bold text-white bg-indigo-600 uppercase tracking-widest hover:bg-indigo-700 transition-colors px-3 py-2 rounded-lg shadow-sm"
                        >
                          Valuation FCF <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Main Result Card - Interactive */}
                      <motion.div 
                        layout
                        onClick={() => setShowComposition(!showComposition)}
                        className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center justify-center text-center space-y-4 relative group cursor-pointer hover:border-indigo-200 transition-colors"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600" />
                      
                      {/* Click Overlay for Breakdown */}
                      <div className={`absolute inset-0 bg-white/95 transition-opacity duration-300 z-20 p-6 flex flex-col justify-center ${showComposition ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Composição do Preço Final</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-gray-500">MÉDIA PONDERADA (90%)</span>
                            <span className="text-indigo-600">R$ {results.weightedAverage.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              whileInView={{ width: '90%' }}
                              className="bg-indigo-600 h-full"
                            />
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-gray-500">SCORE QUALITATIVO (FATOR)</span>
                            <span className="text-amber-600">x {(0.45 + (stock.score * 0.05)).toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              whileInView={{ width: `${(0.45 + (stock.score * 0.05)) * 50}%` }}
                              className="bg-amber-500 h-full"
                            />
                          </div>
                          
                          <p className="text-[9px] text-gray-400 italic mt-4">
                            O score qualitativo ajusta a média técnica para refletir o risco percebido.
                          </p>
                        </div>
                      </div>

                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">Preço Justo Estimado</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-light text-gray-400">R$</span>
                        <span className="text-6xl font-black tracking-tighter text-indigo-950">
                          {results.finalFairPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                      </div>
                      <div className={`px-4 py-1.5 rounded-full border text-sm font-bold flex items-center gap-2 ${getMarginColor(results.marginOfSafety)}`}>
                        {results.marginOfSafety > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        Margem: {results.marginOfSafety.toFixed(1)}%
                      </div>
                    </motion.div>

                    {/* Status Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center justify-center text-center space-y-4">
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">Status da Decisão</span>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center bg-gray-50 border-4 border-gray-100">
                        {results.marginOfSafety > 20 ? (
                          <ShieldCheck className="w-10 h-10 text-emerald-500" />
                        ) : results.marginOfSafety > 0 ? (
                          <TrendingUp className="w-10 h-10 text-amber-500" />
                        ) : (
                          <AlertTriangle className="w-10 h-10 text-rose-500" />
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-indigo-950">
                        {results.marginOfSafety > 20 ? 'Forte Oportunidade' : results.marginOfSafety > 0 ? 'Preço Atrativo' : 'Acima do Justo'}
                      </h3>
                      <p className="text-sm text-gray-500 max-w-[200px]">
                        {results.marginOfSafety > 20 
                          ? 'Ativo com excelente margem de segurança baseada na média ponderada.' 
                          : results.marginOfSafety > 0 
                          ? 'Ativo próximo ao valor intrínseco. Requer cautela.' 
                          : 'O preço de mercado atual supera as projeções de valor justo.'}
                      </p>
                    </div>
                  </div>
                </section>

                  {/* Interactive Weight Breakdown */}
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                        <PieChart className="w-4 h-4" /> Pesos da Média Ponderada
                      </h2>
                      <div className={`text-[10px] font-bold px-2 py-1 rounded ${
                        Math.abs((stock.weights?.priceWithMargin || 0) + (stock.weights?.graham || 0) + (stock.weights?.bazin || 0) + (stock.weights?.vpaMethod || 0) + (stock.weights?.valuationMultiples || 0) - 1) < 0.01
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-rose-50 text-rose-600'
                      }`}>
                        TOTAL: {Math.round(((stock.weights?.priceWithMargin || 0) + (stock.weights?.graham || 0) + (stock.weights?.bazin || 0) + (stock.weights?.vpaMethod || 0) + (stock.weights?.valuationMultiples || 0)) * 100)}%
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <WeightBar 
                          label="Fluxo de Caixa (DCF c/ Margem)" 
                          weight={stock.weights?.priceWithMargin ?? 0.4} 
                          value={results.priceWithMargin} 
                          onChange={(val) => updateWeight('priceWithMargin', val)}
                          onHover={() => setActiveMethodology('dcf')}
                          onLeave={() => setActiveMethodology(null)}
                        />
                        <WeightBar 
                          label="Graham" 
                          weight={stock.weights?.graham ?? 0.2} 
                          value={results.graham} 
                          onChange={(val) => updateWeight('graham', val)}
                          onHover={() => setActiveMethodology('graham')}
                          onLeave={() => setActiveMethodology(null)}
                        />
                        <WeightBar 
                          label="Bazin" 
                          weight={stock.weights?.bazin ?? 0.2} 
                          value={results.bazin} 
                          onChange={(val) => updateWeight('bazin', val)}
                          onHover={() => setActiveMethodology('bazin')}
                          onLeave={() => setActiveMethodology(null)}
                        />
                        <WeightBar 
                          label="VPA" 
                          weight={stock.weights?.vpaMethod ?? 0.1} 
                          value={results.vpaMethod} 
                          onChange={(val) => updateWeight('vpaMethod', val)}
                          onHover={() => setActiveMethodology('vpa')}
                          onLeave={() => setActiveMethodology(null)}
                        />
                        <WeightBar 
                          label="Múltiplos" 
                          weight={stock.weights?.valuationMultiples ?? 0.1} 
                          value={results.valuationMultiples} 
                          onChange={(val) => updateWeight('valuationMultiples', val)}
                          onHover={() => setActiveMethodology('multiples')}
                          onLeave={() => setActiveMethodology(null)}
                        />
                      </div>
                      
                      <div className="bg-gray-50 rounded-xl p-6 flex flex-col justify-center space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                            <Calculator className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase">Média Técnica</div>
                            <div className="text-xl font-black text-indigo-950">R$ {results.weightedAverage.toFixed(2)}</div>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed italic">
                          "A média ponderada reduz o ruído de metodologias individuais, criando um preço base mais robusto antes do ajuste de risco qualitativo."
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Methodology Breakdown */}
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <button 
                      onClick={() => setShowDetails(!showDetails)}
                      className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-2xl"
                    >
                      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" /> Detalhamento das Metodologias
                      </h2>
                      {showDetails ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </button>
                    
                    <AnimatePresence>
                      {showDetails && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-visible"
                        >
                          <div className="p-6 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <MethodCard 
                              title="Fluxo de Caixa (DCF)" 
                              value={results.priceWithMargin} 
                              weight={`${Math.round((stock.weights?.priceWithMargin ?? 0.4) * 100)}%`} 
                              desc={`V. Intrínseco: R$ ${results.intrinsicValue.toFixed(2)}. Aplicada margem de 25%.`}
                              isHighlighted={activeMethodology === 'dcf'}
                              tooltip={{
                                title: "Fluxo de Caixa Descontado (DCF)",
                                content: "Projeta o dinheiro que a empresa vai gerar no futuro e traz esse valor para o presente, descontando uma taxa de risco. É considerado o método mais completo de valuation.",
                                example: "Se você espera receber R$ 100 daqui a um ano, hoje esse valor vale menos (ex: R$ 90) devido ao risco e ao tempo."
                              }}
                            />
                            <MethodCard 
                              title="Fórmula de Graham" 
                              value={results.graham} 
                              weight={`${Math.round((stock.weights?.graham ?? 0.2) * 100)}%`} 
                              desc="Valuation clássico baseado em LPA e VPA."
                              isHighlighted={activeMethodology === 'graham'}
                              tooltip={{
                                title: "Fórmula de Graham",
                                content: "Criada pelo mentor de Warren Buffett, busca o 'valor intrínseco' usando o lucro (LPA) e o patrimônio (VPA). Assume que o mercado paga um múltiplo justo por esses fundamentos.",
                                example: "Preço Justo = √(22,5 * LPA * VPA). O 22,5 é um multiplicador padrão de Graham."
                              }}
                            />
                            <MethodCard 
                              title="Método de Bazin" 
                              value={results.bazin} 
                              weight={`${Math.round((stock.weights?.bazin ?? 0.2) * 100)}%`} 
                              desc="Foco em dividendos constantes (Yield de 6%)."
                              isHighlighted={activeMethodology === 'bazin'}
                              tooltip={{
                                title: "Método de Décio Bazin",
                                content: "Foca na renda passiva. Calcula o preço máximo a pagar para garantir um rendimento de dividendos de pelo menos 6% ao ano.",
                                example: "Se uma empresa paga R$ 0,60 de dividendo, o preço teto para ter 6% de yield é R$ 10,00."
                              }}
                            />
                            <MethodCard 
                              title="Patrimonial (VPA)" 
                              value={results.vpaMethod} 
                              weight={`${Math.round((stock.weights?.vpaMethod ?? 0.1) * 100)}%`} 
                              desc="Valor contábil ajustado pelo crescimento."
                              isHighlighted={activeMethodology === 'vpa'}
                              tooltip={{
                                title: "Valor Patrimonial Ajustado",
                                content: "Usa o valor dos bens da empresa (VPA) e adiciona uma expectativa de crescimento para os próximos anos.",
                                example: "Se a empresa tem R$ 10 em bens por ação e cresce 5%, o valor patrimonial futuro é considerado no preço."
                              }}
                            />
                            <MethodCard 
                              title="Múltiplos (P/L)" 
                              value={results.valuationMultiples} 
                              weight={`${Math.round((stock.weights?.valuationMultiples ?? 0.1) * 100)}%`} 
                              desc="Comparação direta com lucros históricos."
                              isHighlighted={activeMethodology === 'multiples'}
                              tooltip={{
                                title: "Valuation por Múltiplos",
                                content: "Estima o valor da ação multiplicando o lucro atual (LPA) pelo P/L médio histórico ou do setor.",
                                example: "Se o LPA é R$ 2,00 e o P/L justo é 10, o preço estimado é R$ 20,00."
                              }}
                            />
                            <div className="p-6 bg-indigo-50/50 rounded-2xl border border-dashed border-indigo-200 flex flex-col justify-center items-center text-center">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Média Ponderada</span>
                              <span className="text-2xl font-black text-indigo-600">R$ {results.weightedAverage.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <StepNavigation 
                      currentStep={1} 
                      onNext={() => goToStep(2)} 
                    />
                  </section>
                </motion.div>
              ) : step === 2 ? (
                <motion.div
                  key="step2"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="space-y-6"
                >
                  {/* Valuation Profissional (FCF) */}
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" /> Valuation Profissional (FCF)
                        </h2>
                        <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wider">Módulo baseado em Valor da Firma (Enterprise Value)</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => goToStep(1)}
                          className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors bg-gray-100 px-3 py-2 rounded-lg"
                        >
                          <ArrowLeft className="w-3 h-3" /> Voltar
                        </button>
                        <button 
                          onClick={() => goToStep(3)}
                          className="flex items-center gap-2 text-[10px] font-bold text-white bg-indigo-600 uppercase tracking-widest hover:bg-indigo-700 transition-colors px-3 py-2 rounded-lg shadow-sm"
                        >
                          Indicadores <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                      {/* FCF Inputs */}
                      <div className="lg:col-span-5 space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                              Caixa Livre Atual (R$)
                              <InfoTooltip 
                                title="Caixa Livre Atual (FCF)" 
                                content="O valor em dinheiro que sobra no caixa da empresa após ela pagar todas as contas e investimentos necessários." 
                                example="Se a empresa gera R$ 10 bi e investe R$ 2 bi, o Caixa Livre é R$ 8 bi."
                              />
                            </label>
                            <CompactInput 
                              value={stock.fcfAtual}
                              onChange={(val) => updateField('fcfAtual', val)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                <span className="flex items-center">
                                  Crescimento Caixa (5A) %
                                  <InfoTooltip 
                                    title="Crescimento do Caixa" 
                                    content="Sua estimativa de quanto o caixa livre da empresa vai crescer por ano nos próximos 5 anos." 
                                    example="5% é uma taxa realista para empresas grandes e maduras."
                                  />
                                </span>
                                {results.gFcfCapped < stock.crescimentoFcf5A && (
                                  <span 
                                    className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black animate-pulse cursor-help" 
                                    title={`Teto aplicado: ${(results.gFcfCapped * 100).toFixed(1)}% (Regra: G <= WACC - 2%)`}
                                  >
                                    CAP
                                  </span>
                                )}
                              </label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={Math.round(stock.crescimentoFcf5A * 10000) / 100}
                                onChange={(e) => updateField('crescimentoFcf5A', parseFloat(e.target.value) / 100)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                                Crescimento Perpétuo %
                                <InfoTooltip 
                                  title="Crescimento Perpétuo" 
                                  content="O quanto você acha que o caixa da empresa vai crescer do ano 6 até o infinito (geralmente acompanha a inflação)." 
                                  example="Geralmente entre 3% e 5% para manter o valor real."
                                />
                              </label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={Math.round(stock.crescimentoInfinito * 10000) / 100}
                                onChange={(e) => updateField('crescimentoInfinito', parseFloat(e.target.value) / 100)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                              Custo de Capital (WACC) %
                              <InfoTooltip 
                                title="Custo de Capital (WACC)" 
                                content="A taxa de rentabilidade mínima que você exige para aceitar o risco de investir nesta empresa específica." 
                                example="12% é um padrão comum para o mercado brasileiro considerando o risco-país."
                              />
                            </label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={Math.round(stock.taxaDescontoWACC * 10000) / 100}
                              onChange={(e) => updateField('taxaDescontoWACC', parseFloat(e.target.value) / 100)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                              Dívida Líquida (R$)
                              <InfoTooltip 
                                title="Dívida Real" 
                                content="Total de dívidas da empresa subtraindo o dinheiro que ela já tem em caixa." 
                                example="Se deve R$ 10 bi e tem R$ 2 bi em caixa, a dívida líquida é R$ 8 bi."
                              />
                            </label>
                            <CompactInput 
                              value={stock.dividaLiquida}
                              onChange={(val) => updateField('dividaLiquida', val)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center">
                              Total de Ações
                              <InfoTooltip 
                                title="Total de Ações" 
                                content="O número total de 'pedacinhos' em que a empresa está dividida na bolsa de valores." 
                                example="Se a empresa vale R$ 1 bilhão e tem 100 milhões de ações, cada ação vale R$ 10."
                              />
                            </label>
                            <CompactInput 
                              value={stock.acoesCirculacao}
                              onChange={(val) => updateField('acoesCirculacao', val)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* FCF Results Visualization */}
                      <div className="lg:col-span-7 space-y-6">
                        <div className="bg-indigo-50 rounded-2xl p-8 border border-indigo-100 flex flex-col items-center justify-center text-center space-y-4">
                          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-400">Preço Justo por FCF</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-light text-indigo-400">R$</span>
                            <span className="text-6xl font-black tracking-tighter text-indigo-900">
                              {results.enterpriseValuation?.precoJustoFcf.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-8 w-full pt-4 border-t border-indigo-200/50">
                            <div>
                              <div className="text-[10px] font-bold text-indigo-400 uppercase">Valor da Firma (EV)</div>
                              <div className="text-sm font-bold text-indigo-900">R$ {formatCompactNumber(results.enterpriseValuation?.enterpriseValue || 0)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-indigo-400 uppercase">Valor do Equity</div>
                              <div className="text-sm font-bold text-indigo-900">R$ {formatCompactNumber(results.enterpriseValuation?.equityValue || 0)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Projections Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="py-3 text-[10px] font-bold text-gray-400 uppercase">Ano</th>
                                <th className="py-3 text-[10px] font-bold text-gray-400 uppercase">FCF Projetado</th>
                                <th className="py-3 text-[10px] font-bold text-gray-400 uppercase">Fator Desconto</th>
                                <th className="py-3 text-[10px] font-bold text-gray-400 uppercase text-right">Valor Presente</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {results.enterpriseValuation?.fluxosProjetados.map((f) => (
                                <tr key={f.ano} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="py-3 text-xs font-bold text-gray-600">Ano {f.ano}</td>
                                  <td className="py-3 text-xs text-gray-500">R$ {formatCompactNumber(f.fcf)}</td>
                                  <td className="py-3 text-xs text-gray-400">{f.fator.toFixed(2)}x</td>
                                  <td className="py-3 text-xs font-bold text-indigo-600 text-right">R$ {formatCompactNumber(f.pv)}</td>
                                </tr>
                              ))}
                              <tr className="bg-indigo-50/30">
                                <td className="py-3 text-xs font-bold text-indigo-900">Perpetuidade</td>
                                <td className="py-3 text-xs text-indigo-800">R$ {formatCompactNumber(results.enterpriseValuation?.valorTerminal || 0)}</td>
                                <td className="py-3 text-xs text-indigo-400">5 anos</td>
                                <td className="py-3 text-xs font-bold text-indigo-700 text-right">R$ {formatCompactNumber(results.enterpriseValuation?.pvValorTerminal || 0)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <StepNavigation 
                      currentStep={2} 
                      onPrev={() => goToStep(1)}
                      onNext={() => goToStep(3)} 
                    />
                  </section>
                </motion.div>
              ) : step === 3 ? (
                <motion.div
                  key="step3"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="space-y-6"
                >
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                          <Activity className="w-4 h-4" /> Score de Indicadores
                        </h2>
                        <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wider">Análise quantitativa de saúde financeira e rentabilidade</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => goToStep(2)}
                          className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors bg-gray-100 px-3 py-2 rounded-lg"
                        >
                          <ArrowLeft className="w-3 h-3" /> Voltar
                        </button>
                        <button 
                          onClick={() => goToStep(4)}
                          className="flex items-center gap-2 text-[10px] font-bold text-white bg-indigo-600 uppercase tracking-widest hover:bg-indigo-700 transition-colors px-3 py-2 rounded-lg shadow-sm"
                        >
                          Conclusão <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 bg-indigo-50/30 border-b border-gray-100">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                        <div className="space-y-2 flex-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Setor de Comparação</label>
                          <select 
                            value={stock.sector}
                            onChange={(e) => updateField('sector', e.target.value)}
                            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-full transition-all shadow-sm"
                          >
                            <option value="stable">Estáveis (Consumo não Cíclico, Utilidade Pública, Saúde, Outros)</option>
                            <option value="finance">Financeiro (Bancos e Seguradoras)</option>
                            <option value="cyclical">Cíclicos (Petróleo, Gás, Consumo Cíclico, Indústria, Materiais Básicos)</option>
                            <option value="growth">Crescimento (Tecnologia e Comunicação)</option>
                          </select>
                        </div>
                        
                        <div className="flex items-center gap-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1.5 mb-1">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Score Final</span>
                              <InfoTooltip 
                                title="O que significa este Score?" 
                                content={results.indicatorScore.status === 'green' 
                                  ? "Excelente saúde financeira. A empresa apresenta indicadores de rentabilidade e endividamento muito acima da média do setor, indicando um negócio robusto e eficiente." 
                                  : results.indicatorScore.status === 'yellow' 
                                  ? "Saúde financeira equilibrada. A empresa está em linha com o setor, mas possui pontos de atenção que devem ser monitorados antes de um investimento maior." 
                                  : "Alerta de risco. Os indicadores mostram fragilidade financeira, baixa rentabilidade ou endividamento elevado em relação aos pares."}
                              />
                            </div>
                            <div className={`text-3xl font-black leading-none ${results.indicatorScore.status === 'green' ? 'text-emerald-600' : results.indicatorScore.status === 'yellow' ? 'text-amber-600' : 'text-rose-600'}`}>
                              {results.indicatorScore.total.toFixed(1)} <span className="text-sm text-gray-300">/ 23</span>
                            </div>
                          </div>
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-colors ${results.indicatorScore.status === 'green' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : results.indicatorScore.status === 'yellow' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                            <Target className="w-7 h-7" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-8">
                      {results.indicatorScore.categories.map((category, idx) => (
                        <div key={idx} className="space-y-4">
                          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">{category.title}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                            {category.indicators.map((ind, iIdx) => (
                              <div key={iIdx} className="group relative bg-gray-50 hover:bg-white hover:shadow-md border border-gray-100 rounded-xl p-4 transition-all flex flex-col justify-between h-full">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-indigo-950 uppercase tracking-tight">{ind.name}</span>
                                    <InfoTooltip 
                                      title={ind.name} 
                                      content={ind.explanation} 
                                      reference={ind.reference}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${ind.color === 'green' ? 'bg-emerald-100 text-emerald-700' : ind.color === 'yellow' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                      Nota: {ind.score}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-4 mt-auto">
                                  <div className="flex items-baseline gap-1.5 shrink-0">
                                    <input 
                                      type="number"
                                      step="0.01"
                                      value={ind.value}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const modelValue = ind.label === '%' ? val / 100 : val;
                                        updateIndicator(ind.key, modelValue);
                                      }}
                                      className="w-20 bg-transparent text-xl font-black text-indigo-950 focus:ring-0 outline-none"
                                    />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{ind.label}</span>
                                  </div>
                                  
                                  <div className="flex-1 max-w-[140px] relative group/slider py-2">
                                    <input 
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.5"
                                      value={ind.score}
                                      onChange={(e) => updateManualScore(ind.key, parseFloat(e.target.value))}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                      title="Arraste para ajustar a nota"
                                    />
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: ind.score === 1 ? '100%' : ind.score === 0.5 ? '50%' : '15%' }}
                                        className={`h-full transition-all duration-500 ${ind.color === 'green' ? 'bg-emerald-500' : ind.color === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`}
                                      />
                                    </div>
                                    <motion.div 
                                      animate={{ left: ind.score === 1 ? '100%' : ind.score === 0.5 ? '50%' : '15%' }}
                                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm opacity-0 group-hover/slider:opacity-100 transition-opacity ${ind.color === 'green' ? 'bg-emerald-500' : ind.color === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <StepNavigation 
                      currentStep={3} 
                      onPrev={() => goToStep(2)}
                      onNext={() => goToStep(4)} 
                    />
                  </section>
                </motion.div>
              ) : (
                <motion.div
                  key="step4"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="space-y-6"
                >
                  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Conclusão e Preço Médio Final
                        </h2>
                        <p className="text-[10px] text-gray-400 font-medium mt-1">SÍNTESE DE TODAS AS METODOLOGIAS DE VALUATION</p>
                      </div>
                      <button 
                        onClick={() => goToStep(3)}
                        className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                      >
                        <ArrowLeft className="w-3 h-3" /> Voltar
                      </button>
                    </div>

                    <div className="p-8 space-y-10">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                          <h3 className="text-lg font-black text-indigo-950 tracking-tight">Consolidação das Etapas</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <button 
                            onClick={() => goToStep(1)}
                            className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all hover:border-indigo-200 text-left group space-y-3"
                          >
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Etapa 1: Preço Justo</div>
                            <div className="text-2xl font-black text-indigo-950">R$ {results.finalFairPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
                            <div className="text-[10px] text-gray-500 font-medium leading-tight">Média Ponderada ajustada pelo Score Qualitativo.</div>
                          </button>
                          <button 
                            onClick={() => goToStep(2)}
                            className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all hover:border-indigo-200 text-left group space-y-3"
                          >
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Etapa 2: Valuation FCF</div>
                            <div className="text-2xl font-black text-indigo-950">R$ {results.enterpriseValuation?.precoJustoFcf.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
                            <div className="text-[10px] text-gray-500 font-medium leading-tight">Valor intrínseco baseado no Fluxo de Caixa Descontado.</div>
                          </button>
                          <button 
                            onClick={() => goToStep(3)}
                            className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all hover:border-indigo-200 text-left group space-y-3"
                          >
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Etapa 3: Indicadores</div>
                            <div className="text-2xl font-black text-indigo-950">
                              R$ {(results.weightedAverage * (0.5 + (results.indicatorScore.total / 23) * 0.5)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium leading-tight">Ajuste técnico pela saúde financeira e rentabilidade.</div>
                          </button>
                        </div>
                      </div>

                      <div className="relative p-10 bg-indigo-900 rounded-3xl text-white overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                          <Target className="w-40 h-40" />
                        </div>
                        
                        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                          <span className="px-4 py-1 bg-indigo-500/30 rounded-full text-[10px] font-bold uppercase tracking-[0.3em]">Veredito Final</span>
                          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">
                            R$ {results.finalAveragePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </h2>
                          <p className="text-indigo-200 text-sm max-w-xl leading-relaxed px-4">
                            Este é o preço médio ponderado entre as três etapas de análise. 
                            {results.finalAveragePrice > stock.currentPrice 
                              ? ` O ativo apresenta um potencial de valorização de ${(((results.finalAveragePrice - stock.currentPrice) / stock.currentPrice) * 100).toFixed(1)}% em relação ao preço atual.` 
                              : ` O ativo está sendo negociado acima do preço médio calculado, sugerindo cautela.`}
                          </p>
                          
                          <div className="flex items-center gap-6 pt-4">
                            <div className="flex flex-col items-center">
                              <div className={`text-xl font-bold ${results.marginOfSafety > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {results.marginOfSafety.toFixed(1)}%
                              </div>
                              <div className="text-[9px] uppercase font-bold text-indigo-300">Margem Seg.</div>
                            </div>
                            <div className="w-px h-8 bg-indigo-700" />
                            <div className="flex flex-col items-center">
                              <div className="text-xl font-bold text-white">{stock.score}</div>
                              <div className="text-[9px] uppercase font-bold text-indigo-300">Score Qualit.</div>
                            </div>
                            <div className="w-px h-8 bg-indigo-700" />
                            <div className="flex flex-col items-center">
                              <div className={`text-xl font-bold ${results.indicatorScore.status === 'green' ? 'text-emerald-400' : results.indicatorScore.status === 'yellow' ? 'text-amber-400' : 'text-rose-400'}`}>
                                {results.indicatorScore.total.toFixed(1)}
                              </div>
                              <div className="text-[9px] uppercase font-bold text-indigo-300">Score Quant.</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-amber-900 uppercase tracking-tight">Aviso Legal</h4>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Este cálculo é uma estimativa baseada em modelos matemáticos e premissas de mercado. 
                            Não constitui recomendação de compra ou venda. O mercado de renda variável envolve riscos e rentabilidade passada não é garantia de lucro futuro.
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <StepNavigation 
                    currentStep={4} 
                    onPrev={() => goToStep(3)}
                    isLast={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-gray-400 text-xs">
          <p>© 2026 Preço Justo Pro. Ferramenta educacional baseada em arquitetura de escolha.</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-indigo-600 transition-colors">Metodologia</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Vieses Cognitivos</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Privacidade</a>
          </div>
        </div>
      </footer>

      {/* Toast Notifications */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="pointer-events-auto flex items-center gap-3 px-6 py-4 bg-indigo-950 text-white rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl min-w-[320px]"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                t.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 
                t.type === 'error' ? 'bg-rose-500/20 text-rose-400' : 
                'bg-indigo-500/20 text-indigo-400'
              }`}>
                {t.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : 
                 t.type === 'error' ? <AlertTriangle className="w-6 h-6" /> : 
                 <Info className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{t.message}</p>
                {t.onUndo && (
                  <button 
                    onClick={() => {
                      t.onUndo?.();
                      removeToast(t.id);
                    }}
                    className="text-[10px] text-indigo-300 hover:text-white uppercase tracking-widest mt-1 font-black flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Desfazer
                  </button>
                )}
              </div>
              <button 
                onClick={() => removeToast(t.id)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MethodCard({ title, value, weight, desc, tooltip, isHighlighted }: { title: string, value: number, weight: string, desc: string, tooltip?: { title: string, content: string, example?: string }, isHighlighted?: boolean }) {
  return (
    <motion.div 
      animate={{ 
        scale: isHighlighted ? 1.02 : 1,
        borderColor: isHighlighted ? 'rgb(79, 70, 229)' : 'rgb(243, 244, 246)',
        boxShadow: isHighlighted ? '0 10px 25px -5px rgba(79, 70, 229, 0.1), 0 8px 10px -6px rgba(79, 70, 229, 0.1)' : 'none'
      }}
      className={`p-5 bg-gray-50 hover:bg-white hover:shadow-md transition-all rounded-2xl border space-y-3 relative overflow-hidden flex flex-col justify-between min-h-[140px] ${isHighlighted ? 'bg-white z-10' : ''}`}
    >
      {isHighlighted && (
        <motion.div 
          layoutId="highlight-glow"
          className="absolute inset-0 bg-indigo-600/5 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</span>
          {tooltip && <InfoTooltip {...tooltip} />}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${isHighlighted ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>{weight}</span>
      </div>
      <div className={`text-xl font-black transition-colors relative z-10 ${isHighlighted ? 'text-indigo-600' : 'text-indigo-950'}`}>R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
      <p className="text-[11px] text-gray-500 leading-snug relative z-10">{desc}</p>
    </motion.div>
  );
}

function WeightBar({ label, weight, value, onChange, onHover, onLeave }: { label: string, weight: number, value: number, onChange: (val: number) => void, onHover?: () => void, onLeave?: () => void }) {
  const percentage = Math.round(weight * 100);
  const [isHovered, setIsHovered] = useState(false);
  
  // Dynamic color based on weight: higher weight = darker blue
  const getColorClass = (w: number) => {
    if (w >= 0.8) return 'bg-indigo-900';
    if (w >= 0.6) return 'bg-indigo-800';
    if (w >= 0.4) return 'bg-indigo-600';
    if (w >= 0.25) return 'bg-indigo-500';
    if (w >= 0.15) return 'bg-indigo-400';
    if (w >= 0.1) return 'bg-indigo-300';
    return 'bg-indigo-200';
  };

  const colorClass = getColorClass(weight);

  return (
    <div 
      className="space-y-1.5 relative"
      onMouseEnter={() => {
        setIsHovered(true);
        onHover?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onLeave?.();
      }}
    >
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-bold text-indigo-600">R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ({percentage}%)</span>
      </div>
      <div className="relative h-2 group">
        <div className="absolute inset-0 bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`${colorClass} h-full transition-colors duration-300`}
          />
        </div>
        <input 
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={weight}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.9 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 px-3 py-2 bg-gray-900 text-white rounded-lg shadow-xl pointer-events-none whitespace-nowrap"
          >
            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">{label}</div>
            <div className="text-xs font-bold">
              {percentage}% | R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoTooltip({ title, content, example, reference }: { title: string, content: string, example?: string, reference?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isOpen) {
      timerRef.current = setTimeout(() => {
        setIsOpen(true);
      }, 200); // Faster response
    }
  }, [isOpen]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  const toggleTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsOpen(prev => !prev);
  }, []);

  useLayoutEffect(() => {
    if (isOpen && tooltipRef.current && triggerRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Check top/bottom
      if (triggerRect.top - tooltipRect.height - 20 < 0) {
        setPosition('bottom');
      } else {
        setPosition('top');
      }

      // Check horizontal overflow
      const tooltipLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      const tooltipRight = tooltipLeft + tooltipRect.width;

      if (tooltipLeft < 10) {
        setHorizontalOffset(10 - tooltipLeft);
      } else if (tooltipRight > viewportWidth - 10) {
        setHorizontalOffset(viewportWidth - 10 - tooltipRight);
      } else {
        setHorizontalOffset(0);
      }
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block ml-1 group">
      <motion.button 
        ref={triggerRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={toggleTooltip}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="p-0.5 rounded-full hover:bg-indigo-50 transition-colors"
      >
        <Info className="w-3.5 h-3.5 text-gray-400 hover:text-indigo-600" />
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            ref={tooltipRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? 10 : -10 }}
            style={{ 
              transform: typeof window !== 'undefined' && window.innerWidth >= 640 
                ? `translateX(calc(-50% + ${horizontalOffset}px))` 
                : undefined,
            }}
            className={`fixed sm:absolute z-[9999] ${
              position === 'top' 
                ? 'bottom-6 sm:bottom-full sm:mb-3' 
                : 'top-6 sm:top-full sm:mt-3'
            } left-4 right-4 sm:left-1/2 sm:right-auto sm:w-80 p-5 bg-indigo-950 text-white rounded-2xl shadow-2xl text-[13px] sm:text-[12px] leading-relaxed border border-white/20 backdrop-blur-xl pointer-events-auto`}
          >
            <div className="font-bold mb-2 text-indigo-300 uppercase tracking-widest border-b border-indigo-800/50 pb-1.5 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Info className="w-3 h-3 opacity-50" />
                <span>{title}</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
              </button>
            </div>
            <p className="text-indigo-50/90 whitespace-normal break-words">{content}</p>
            {reference && (
              <div className="mt-4 pt-4 border-t border-indigo-800/50 text-indigo-300/80">
                <span className="font-bold text-white uppercase text-[10px] tracking-wider block mb-1 opacity-70">Valores de Referência:</span>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 font-mono text-[11px]">
                  {reference}
                </div>
              </div>
            )}
            {example && (
              <div className="mt-4 pt-4 border-t border-indigo-800/50 italic text-indigo-300/80">
                <span className="font-bold text-white not-italic">Exemplo:</span> {example}
              </div>
            )}
            <div 
              className={`hidden sm:block absolute ${
                position === 'top' 
                  ? 'top-full border-t-indigo-950' 
                  : 'bottom-full border-b-indigo-950'
              } left-1/2 border-[10px] border-transparent`} 
              style={{ 
                transform: typeof window !== 'undefined' && window.innerWidth >= 640 
                  ? `translateX(calc(-50% - ${horizontalOffset}px))` 
                  : undefined 
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
